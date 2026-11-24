# Production backup retention

[THE-45](https://linear.app/theoryfoundry/issue/THE-45) tracks retention for the
Coolify production archives. The proposed schedule retains local PostgreSQL dumps
for seven days and NAS database and export archives for 30 days. Age is measured
from the timestamp in the archive name. Coolify continues to manage its own local
export-volume archive retention.

The daily job uses the existing NAS transfer configuration and takes both backup
jobs' locks. It checks that the exact CIFS share is mounted and verifies at least
two recent NAS copies for each archive type against their local files. It
retains local PostgreSQL archives that have no matching verified NAS copy. NAS
retention also waits for local copies to expire so the transfer job does not
recreate them. Mount, file-type or checksum errors stop the run. Investigate
deferred files before describing the retention windows as a maximum.

The job handles the daily PostgreSQL logical dumps and the Coolify export
archives only. Inventory VM backups, NAS snapshots and other copies separately.
Independent manual erasure-journal snapshots follow the
[erasure recovery procedure](data-erasure.md). Apply the latest complete journal
before reconnecting a restored deployment.

## Verify and enable

Run the fixture tests from the repository:

```sh
python3 -m unittest discover -s tests/tooling/production-backups
```

The utility defaults to a read-only plan. Run it on the production host and
review the counts, age boundaries, and copies to be retained before starting
the service. Use the production backup runbook for host and access details.

```sh
sudo python3 retainArchives.py
```

After approving that plan, install the script and units from
`tooling/production-backups` on the production host with root ownership.

```sh
sudo install -m 755 retainArchives.py /usr/local/sbin/theoryfoundry-backup-retention.py
sudo install -m 644 theoryfoundry-backup-retention.service theoryfoundry-backup-retention.timer /etc/systemd/system/
sudo systemd-analyze verify /etc/systemd/system/theoryfoundry-backup-retention.{service,timer}
sudo systemctl daemon-reload
sudo systemctl start theoryfoundry-backup-retention.service
sudo journalctl -u theoryfoundry-backup-retention.service -n 50 --no-pager
sudo systemctl enable --now theoryfoundry-backup-retention.timer
```

Confirm the first run removed only the approved files and that a subsequent
backup and NAS transfer completed successfully. The timer runs daily at 04:10
America/Chicago. Disable it with
`sudo systemctl disable --now theoryfoundry-backup-retention.timer` if needed.
After production verification, update the operational runbook and public Privacy
copy to reflect the observed retention and any separately retained copies.
