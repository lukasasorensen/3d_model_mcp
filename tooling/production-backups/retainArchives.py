#!/usr/bin/env python3
"""Expire TheoryFoundry production backups after verifying NAS copies."""
import argparse
from contextlib import ExitStack, contextmanager
from datetime import datetime, timezone
import fcntl
import fnmatch
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess


LOCAL_POSTGRES_DAYS = 7
NAS_DAYS = 30
MIN_VERIFIED_COPIES = 2
SECONDS_PER_DAY = 86_400
DIRECTORY_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
BACKUP_LOCKS = (
    "/run/theoryfoundry-postgres-backup.lock",
    "/run/theoryfoundry-nas-transfer.lock",
)


def archive_timestamp(group, name):
    if group == "postgres":
        match = re.fullmatch(r"postgres-(\d{8}T\d{6}Z)-[0-9a-f]{8}\.tar\.gz", name)
        if match:
            return datetime.strptime(match[1], "%Y%m%dT%H%M%SZ").replace(
                tzinfo=timezone.utc
            ).timestamp()
    else:
        match = re.fullmatch(r"volume-[a-z0-9]+-export-data-(\d{10})\.tar\.gz", name)
        if match:
            return int(match[1])
    return None


def inventory(directory, source):
    result = []
    for name in os.listdir(directory):
        if not fnmatch.fnmatchcase(name, source["pattern"]):
            continue
        timestamp = archive_timestamp(source["name"], name)
        if timestamp is None:
            continue
        info = os.stat(name, dir_fd=directory, follow_symlinks=False)
        if not stat.S_ISREG(info.st_mode):
            raise RuntimeError(f"Unexpected backup file type: {name}")
        result.append((timestamp, name))
    return sorted(result, reverse=True)


def checksum(directory, name):
    descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                         dir_fd=directory)
    with os.fdopen(descriptor, "rb") as stream:
        if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
            raise RuntimeError(f"Unexpected backup file type: {name}")
        return hashlib.file_digest(stream, "sha256").digest()


def build_plan(group, source_dir, nas_dir, source, now, local_days, nas_days):
    local = inventory(source_dir, source)
    remote = inventory(nas_dir, source)
    local_names = {name for _, name in local}
    remote_names = {name for _, name in remote}
    local_cutoff = now - local_days * SECONDS_PER_DAY
    nas_cutoff = now - nas_days * SECONDS_PER_DAY

    def verified_pair(name):
        if checksum(source_dir, name) != checksum(nas_dir, name):
            raise RuntimeError(f"Local and NAS archive checksums differ: {name}")

    # Prove recoverable, recent copies are available on both disks before pruning.
    # The transfer job validated archive contents before publishing the NAS copy.
    recent_pairs = [
        name for timestamp, name in remote
        if nas_cutoff <= timestamp <= now and name in local_names
    ][:MIN_VERIFIED_COPIES]
    if len(recent_pairs) < MIN_VERIFIED_COPIES:
        raise RuntimeError(f"{group} needs {MIN_VERIFIED_COPIES} recent local/NAS pairs")
    for name in recent_pairs:
        verified_pair(name)

    expired_local = []
    if group == "postgres":
        for timestamp, name in local:
            if timestamp < local_cutoff and name in remote_names and name not in recent_pairs:
                verified_pair(name)
                expired_local.append(name)

    # The transfer timer would recreate any NAS archive whose local source remains.
    remaining_local = local_names.difference(expired_local)
    expired_remote = [
        name for timestamp, name in remote
        if timestamp < nas_cutoff and name not in remaining_local
    ]
    return expired_local, expired_remote


@contextmanager
def open_directory(path, *, parent=None):
    fd = os.open(path, DIRECTORY_FLAGS, dir_fd=parent)
    try:
        yield fd
    finally:
        os.close(fd)


def verify_mount(mount, share):
    # Reading the directory triggers the systemd automount.
    with os.scandir(mount):
        pass
    output = subprocess.check_output(
        ["findmnt", "-J", "-T", str(mount), "-o", "SOURCE,FSTYPE,TARGET"],
        text=True, timeout=20,
    )
    filesystems = json.loads(output)["filesystems"]
    if not any(item["source"] == share and item["fstype"] == "cifs"
               and item["target"] == str(mount) for item in filesystems):
        raise RuntimeError("Expected NAS CIFS mount is unavailable")


def checked_path(value):
    path = Path(value)
    if not path.is_absolute() or path.resolve(strict=True) != path:
        raise RuntimeError(f"Backup directory must be a canonical absolute path: {path}")
    return path


def run_retention(config, local_days, nas_days, apply):
    if not 0 < local_days <= nas_days:
        raise ValueError("The local and NAS periods must be positive, with NAS at least as long")
    sources = {source["name"]: source for source in config["sources"]}
    if len(config["sources"]) != 2 or set(sources) != {"postgres", "exports"}:
        raise RuntimeError("Expected exactly one PostgreSQL and one export transfer source")

    with ExitStack() as stack:
        for lock in BACKUP_LOCKS:
            descriptor = stack.enter_context(open(lock, "a"))
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)

        mount = checked_path(config["mount"])
        mfd = stack.enter_context(open_directory(mount))
        verify_mount(mount, config["share"])
        cfd = stack.enter_context(open_directory("coolify", parent=mfd))
        device = os.fstat(mfd).st_dev
        if os.fstat(cfd).st_dev != device:
            raise RuntimeError("Coolify backup directory is outside the NAS filesystem")

        plan = []
        for group, source in sources.items():
            local = stack.enter_context(open_directory(checked_path(source["directory"])))
            remote = stack.enter_context(open_directory(group, parent=cfd))
            if os.fstat(remote).st_dev != device or os.fstat(local).st_dev == device:
                raise RuntimeError("Backup directories do not match the expected filesystems")
            expired_local, expired_remote = build_plan(
                group, local, remote, source, datetime.now(timezone.utc).timestamp(),
                local_days, nas_days,
            )
            plan.extend((group, "local", local, name) for name in expired_local)
            plan.extend((group, "NAS", remote, name) for name in expired_remote)

        if apply:
            verify_mount(mount, config["share"])
        for group, location, directory, name in plan:
            if apply:
                os.unlink(name, dir_fd=directory)
            print(f"{'Removed' if apply else 'Would remove'} {location} {group}: {name}")
        print(f"{'Removed' if apply else 'Planned removals'}: {len(plan)}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", default="/etc/theoryfoundry-backup/transfer.json")
    parser.add_argument("--local-days", type=int, default=LOCAL_POSTGRES_DAYS)
    parser.add_argument("--nas-days", type=int, default=NAS_DAYS)
    parser.add_argument("--apply", action="store_true", help="Expire the selected archives")
    args = parser.parse_args()
    try:
        with open(args.config, encoding="utf-8") as config:
            run_retention(json.load(config), args.local_days, args.nas_days, args.apply)
    except (OSError, ValueError, RuntimeError, KeyError, subprocess.SubprocessError) as error:
        parser.exit(1, f"Backup retention stopped: {error}\n")


if __name__ == "__main__":
    main()
