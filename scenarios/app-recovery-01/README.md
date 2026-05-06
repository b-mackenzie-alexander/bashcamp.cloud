# Application Worker Recovery

**Incident #2406 - deployment worker offline after release cutover**

The `myapp` deployment worker stopped after the latest release cutover. The
on-call team says the correct release has already been staged on disk, but the
worker service is not staying online and no fresh worker logs are appearing.

The service should run as the `deploy` account, read its configuration from
`/etc/myapp/`, and write runtime output under `/opt/myapp/logs/`.

## Your task

- Determine why `myapp-worker.service` is failing.
- Confirm which release should be active.
- Restore the active release path.
- Repair only the permissions needed for the service account to read config and
  write logs.
- Start and enable the service.
- Confirm the worker is producing fresh log output.

## Environment notes

| Account | Password | Shell | Role |
|---|---|---|---|
| sr_sysadmin | BashcampAdmin1! | /bin/bash | You - senior sysadmin |
| deploy | n/a | /bin/bash | Deployment service account |

## Hints

- There is more than one broken layer. Avoid stopping after the first error
  message changes.
- Check both the unit status and the paths referenced by the unit.
- A broad permission change might appear to work, but it is not the operationally
  safe answer.

## Linux+ practice areas

- systemd service recovery
- Release symlinks and filesystem layout
- Group-based permissions
- Reading journals and validating a multi-cause outage
