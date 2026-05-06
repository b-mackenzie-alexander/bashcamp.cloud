# Inventory Sync Service Down

**Ticket #2319 - inventory updates stopped after maintenance**

The warehouse inventory sync worker is down on a Rocky Linux server. The team
expects `inventory-sync.service` to stay running and write its latest sync status
under `/var/lib/inventory-sync/`.

The sync script and configuration were both staged during maintenance, but the
service is still failing when systemd tries to start it.

## Your task

- Inspect the service state with systemd.
- Use the journal to identify why the unit is not starting.
- Repair the unit/configuration mismatch.
- Start and enable `inventory-sync.service`.
- Confirm the sync marker is being written.

## Environment notes

| Account | Password | Shell | Role |
|---|---|---|---|
| sr_sysadmin | BashcampAdmin1! | /bin/bash | You - senior sysadmin |
| inventory | n/a | /bin/bash | Service account |

## Hints

- The service file is present; the question is whether it points at the right
  runtime inputs.
- Rocky Linux convention is useful context, but the actual files on this server
  matter more than assumptions.
- `systemctl status` and `journalctl -u` should agree about the first blocker.

## Linux+ practice areas

- Managing systemd units
- Diagnosing failed services with logs
- Service accounts and runtime files
- Enabling services for boot
