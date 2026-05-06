# Backup Job Permission Failure

**Ticket #2184 - nightly release backups are failing**

The operations team received an alert that the nightly `myapp` release backup did
not complete. The backup script is already installed at
`/usr/local/sbin/nightly-backup`, and the service account that should run it is
`backup_svc`.

The release files are still present under `/opt/myapp/releases/`, but the backup
archive is not being created in `/var/backups/myapp/`.

## Your task

- Confirm why the backup job is failing.
- Restore the permissions or ownership needed for `backup_svc` to create backups.
- Run the backup successfully.
- Confirm the release archive exists in `/var/backups/myapp/`.

## Environment notes

| Account | Password | Shell | Role |
|---|---|---|---|
| sr_sysadmin | BashcampAdmin1! | /bin/bash | You - senior sysadmin |
| backup_svc | n/a | /bin/bash | Service account |

## Hints

- Start by reading the backup log and the backup script.
- The script is not missing; focus on filesystem access.
- Think about the least permissive change that lets a service account write only
  where it needs to write.

## Linux+ practice areas

- File ownership and permissions
- Backup and archive management
- Service account troubleshooting
- Reading logs before changing system state
