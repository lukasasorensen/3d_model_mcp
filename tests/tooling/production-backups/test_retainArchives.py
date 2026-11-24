from contextlib import ExitStack
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "tooling/production-backups"))
from retainArchives import build_plan, open_directory


NOW = datetime(2026, 11, 24, tzinfo=timezone.utc)
POSTGRES = {"name": "postgres", "pattern": "postgres-*.tar.gz"}
EXPORTS = {"name": "exports", "pattern": "volume-app-export-data-*.tar.gz"}


class BackupRetentionTest(unittest.TestCase):
    def setUp(self):
        with ExitStack() as stack:
            root = Path(stack.enter_context(tempfile.TemporaryDirectory()))
            self.local = root / "local"
            self.remote = root / "remote"
            self.local.mkdir()
            self.remote.mkdir()
            self.local_fd = stack.enter_context(open_directory(self.local))
            self.remote_fd = stack.enter_context(open_directory(self.remote))
            self.addCleanup(stack.pop_all().close)

    def put(self, group, age, *, local=True, remote=True):
        timestamp = NOW - timedelta(days=age)
        if group == POSTGRES:
            name = f"postgres-{timestamp:%Y%m%dT%H%M%SZ}-1234abcd.tar.gz"
        else:
            name = f"volume-app-export-data-{int(timestamp.timestamp())}.tar.gz"
        if local:
            (self.local / name).write_text(name)
        if remote:
            (self.remote / name).write_text(name)
        return name

    def plan(self, group):
        return build_plan(
            group["name"], self.local_fd, self.remote_fd, group, NOW.timestamp(), 7, 30
        )

    def test_prunes_copied_postgres_and_keeps_untransferred_archive(self):
        self.put(POSTGRES, 1)
        self.put(POSTGRES, 2)
        recent_nas = self.put(POSTGRES, 8)
        expired_nas = self.put(POSTGRES, 31)
        untransferred = self.put(POSTGRES, 32, remote=False)
        (self.local / "postgres-manual.tar.gz").touch()
        self.assertEqual(self.plan(POSTGRES), ([recent_nas, expired_nas], [expired_nas]))
        self.assertTrue((self.local / untransferred).exists())

    def test_expires_only_nas_exports_the_transfer_will_not_recreate(self):
        self.put(EXPORTS, 1)
        self.put(EXPORTS, 2)
        self.put(EXPORTS, 31)
        expired = self.put(EXPORTS, 32, local=False)
        self.assertEqual(self.plan(EXPORTS), ([], [expired]))

    def test_stops_if_verified_copies_are_missing_or_corrupt(self):
        recent = self.put(POSTGRES, 1)
        self.put(POSTGRES, 31)
        with self.assertRaisesRegex(RuntimeError, "recent local/NAS pairs"):
            self.plan(POSTGRES)
        self.put(POSTGRES, 2)
        (self.remote / recent).write_text("different bytes")
        with self.assertRaisesRegex(RuntimeError, "checksums differ"):
            self.plan(POSTGRES)

    def test_does_not_follow_an_archive_symlink(self):
        self.put(POSTGRES, 1)
        self.put(POSTGRES, 2)
        name = self.put(POSTGRES, 31, remote=False)
        (self.remote / name).symlink_to(self.local / name)
        with self.assertRaisesRegex(RuntimeError, "Unexpected backup file type"):
            self.plan(POSTGRES)
