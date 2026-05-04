# Rocky Linux 9 Sandbox

No objectives. No ticket. No timer. Just a realistic Rocky Linux 9 (RHEL-family)
production environment you can poke at, break, and reset whenever you want.

---

## Environment overview

Same fictional application (**myapp**) as the Ubuntu sandbox, but running on Rocky Linux 9.
Key differences from Ubuntu/Debian: `wheel` group instead of `sudo`, `/sbin/nologin`
instead of `/usr/sbin/nologin`, and RHEL-family conventions throughout.

### Users and credentials

| Account | Password | Shell | Role |
|---|---|---|---|
| sr_sysadmin | BashcampAdmin1! | /bin/bash | You — senior sysadmin |
| alice | dev@alice1 | /bin/bash | Developer |
| bob | dev@bob1 | /bin/bash | Developer |
| carol | ops@carol1 | /bin/bash | Ops engineer (sudo via wheel) |
| deploy | svc@deploy1 | nologin | Deployment service account |
| backup | svc@backup1 | nologin | Backup service account |
| nginx_svc | svc@nginx1 | nologin | Web service account |

**Note on service accounts:** `deploy`, `backup`, and `nginx_svc` use `/sbin/nologin`
as their shell (RHEL path, vs `/usr/sbin/nologin` on Ubuntu — both are valid). Attempting
`su - deploy` will fail with "This account is currently not available."

### Groups

| Group | Members | Purpose |
|---|---|---|
| developers | alice, bob, deploy | Access to app code and releases |
| ops | carol, sr_sysadmin | Access to system config and logs |
| svcaccounts | deploy, backup, nginx_svc | Service-level access isolation |
| wheel | sr_sysadmin, carol | Privilege escalation (RHEL equivalent of sudo group) |

### Key directories

| Path | Owner | Mode | Notes |
|---|---|---|---|
| `/opt/myapp/` | deploy:developers | 2775 (setgid) | App root |
| `/opt/myapp/releases/` | deploy:developers | 2775 | Release artifacts |
| `/opt/myapp/shared/` | deploy:developers | 2775 | Shared config |
| `/var/www/html/` | nginx_svc:developers | 2775 | Web content |
| `/srv/backups/` | backup:svcaccounts | 770 | Backup storage |
| `/var/log/myapp/` | deploy:svcaccounts | 2750 (setgid) | App logs |
| `/etc/myapp/` | root:ops | 750 | System config |

---

## RHEL-family differences to explore

### Privilege escalation uses `wheel`, not `sudo` group

```bash
# On Rocky, the wheel group grants sudo access
grep wheel /etc/sudoers         # see the %wheel rule
id sr_sysadmin                  # note wheel membership
sudo whoami                     # works because of wheel

# Adding a user to wheel
sudo usermod -aG wheel alice    # now alice can sudo
sudo usermod -G alice alice     # careful — removes wheel without -a!
```

### SELinux context (informational)

Rocky Linux 9 ships with SELinux enforcing by default. In this container environment
SELinux is not active (containers cannot run the kernel security module), but you can
explore the SELinux context annotations that would apply on a real server:

```bash
ls -laZ /var/www/html/          # -Z shows SELinux context
ls -laZ /etc/myapp/             # different contexts for different paths
getenforce                      # shows Disabled (container limitation)
```

This helps you recognize the context labels you'd see on a production RHEL server.

---

## Things to practice

### User and group management

```bash
# Compare RHEL group conventions
id carol                        # wheel group for sudo
id alice                        # developers only

# The -aG vs -G trap (same as Ubuntu, same consequences)
sudo usermod -aG ops alice      # adds alice to ops — safe
sudo usermod -G ops alice       # replaces alice's groups — she loses developers!
id alice                        # verify the damage
su - alice
cat /etc/myapp/app.conf         # will this work now?
exit
sudo usermod -aG developers alice  # restore
```

### File permissions

```bash
# Setgid directories
ls -la /opt/myapp/
stat /opt/myapp/releases/       # shows setgid bit (mode 2775)

# Who can read what
su - carol                      # carol is in ops
cat /etc/myapp/app.conf         # readable (carol is in ops group)
cat /srv/backups/               # not accessible (not in svcaccounts)
exit

# Sticky bit on /tmp
ls -la / | grep tmp             # look for the 't' at the end of permissions
```

### Archiving

```bash
# cpio — a core exam tool
find /opt/myapp/releases/v1.2.0 | cpio -ov > /tmp/v1.2.0.cpio
cpio -itv < /tmp/v1.2.0.cpio         # list contents
mkdir /tmp/cpio-restore
cd /tmp/cpio-restore
cpio -idv < /tmp/v1.2.0.cpio

# tar (same as Ubuntu)
tar cvzf /tmp/myapp-backup.tar.gz /opt/myapp/releases/
tar tvf /tmp/myapp-backup.tar.gz
```

### Log inspection

```bash
cat /var/log/myapp/app.log
grep "ERROR\|WARN" /var/log/myapp/app.log
journalctl -u crond --no-pager          # note: crond on RHEL, cron on Debian
journalctl --since "1 hour ago" --no-pager
```
