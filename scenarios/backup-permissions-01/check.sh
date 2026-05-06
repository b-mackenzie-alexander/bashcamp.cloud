#!/bin/bash
# Objective validation for backup-permissions-01.
# Runs as root inside the container. Outputs a JSON array of {id, label, passed}.
set -uo pipefail

results=()
archive="/var/backups/myapp/myapp-v1.2.1.tar.gz"

if sudo -u backup_svc /usr/local/sbin/nightly-backup &>/dev/null; then
  results+=('{"id":"backup-runs","label":"backup_svc can run the nightly backup","passed":true}')
else
  results+=('{"id":"backup-runs","label":"backup_svc can run the nightly backup","passed":false}')
fi

if [[ -f "$archive" ]] && tar -tzf "$archive" 2>/dev/null | grep -q '^v1\.2\.1/VERSION$'; then
  results+=('{"id":"archive-valid","label":"backup archive exists and contains the release files","passed":true}')
else
  results+=('{"id":"archive-valid","label":"backup archive exists and contains the release files","passed":false}')
fi

if sudo -u backup_svc test -w /var/backups/myapp 2>/dev/null; then
  results+=('{"id":"backup-dir-writable","label":"backup_svc can write to the backup directory","passed":true}')
else
  results+=('{"id":"backup-dir-writable","label":"backup_svc can write to the backup directory","passed":false}')
fi

printf '[%s]\n' "$(IFS=','; echo "${results[*]}")"
