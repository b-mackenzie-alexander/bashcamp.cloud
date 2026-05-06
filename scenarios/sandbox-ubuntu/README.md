# Ubuntu 22.04 Sandbox

No objectives. No ticket. No timer. Just a realistic Ubuntu production environment
you can poke at, break, and reset whenever you want.

---

## Environment overview

This server hosts a fictional web application called **myapp**. It has a developer team,
an ops team, and several service accounts — all with different permissions that reflect
real production access patterns.

### Users and credentials

| Account | Password | Shell | Role |
|---|---|---|---|
| sr_sysadmin | BashcampAdmin1! | /bin/bash | You — senior sysadmin |
| alice | dev@alice1 | /bin/bash | Developer |
| bob | dev@bob1 | /bin/bash | Developer |
| carol | ops@carol1 | /bin/bash | Ops engineer (sudo access) |
| deploy | svc@deploy1 | nologin | Deployment service account |
| backup | svc@backup1 | nologin | Backup service account |
| nginx_svc | svc@nginx1 | nologin | Web service account |

**Note on service accounts:** `deploy`, `backup`, and `nginx_svc` use `/usr/sbin/nologin`
as their shell — this is intentional. They are automated service accounts that should never
be used interactively. Try `su - deploy` to see what happens.

### Groups

| Group | Members | Purpose |
|---|---|---|
| developers | alice, bob, deploy | Access to app code and releases |
| ops | carol, sr_sysadmin | Access to system config and logs |
| svcaccounts | deploy, backup, nginx_svc | Service-level access isolation |
| sudo | sr_sysadmin, carol | Privilege escalation |

### Key directories

| Path | Owner | Mode | Notes |
|---|---|---|---|
| `/opt/myapp/` | deploy:developers | 2775 (setgid) | App root — new files inherit `developers` group |
| `/opt/myapp/releases/` | deploy:developers | 2775 | Release artifacts |
| `/opt/myapp/shared/` | deploy:developers | 2775 | Shared config across releases |
| `/var/www/html/` | nginx_svc:developers | 2775 | Web content |
| `/srv/backups/` | backup:svcaccounts | 770 | Backup storage — no world access |
| `/var/log/myapp/` | deploy:svcaccounts | 2750 (setgid) | App logs — group-readable only |
| `/etc/myapp/` | root:ops | 750 | System config — ops-readable only |

---

## Things to practice

### User and group management

```bash
# See who you are and what groups you belong to
id
groups

# Switch to another user
su - alice       # password: dev@alice1
id               # shows alice's uid, gid, supplemental groups
exit

# The difference between -aG and -G (this will matter)
sudo usermod -aG ops alice    # ADDS alice to ops group (keeps existing groups)
sudo usermod -G ops alice     # REPLACES alice's groups with just ops — she loses developers!
id alice                      # compare before and after
```

### File permissions and ownership

```bash
# Explore the setgid directory
ls -la /opt/myapp/
touch /opt/myapp/shared/testfile          # will fail — you're not in developers
sudo -u deploy touch /opt/myapp/releases/test.txt
ls -la /opt/myapp/releases/               # note the group on the new file

# Change ownership
sudo chown alice:developers /opt/myapp/shared/database.yml
ls -la /opt/myapp/shared/

# Permissions on the config file
ls -la /etc/myapp/app.conf               # who can read it?
su - alice
cat /etc/myapp/app.conf                  # can alice read it? why or why not?
exit
```

### Archiving and file management

```bash
# Archive a release directory
tar cvzf /tmp/v1.2.0-backup.tar.gz /opt/myapp/releases/v1.2.0/
ls -lh /tmp/v1.2.0-backup.tar.gz

# List archive contents without extracting
tar tvf /tmp/v1.2.0-backup.tar.gz

# Extract to a different location
mkdir /tmp/restore-test
tar xvzf /tmp/v1.2.0-backup.tar.gz -C /tmp/restore-test

# Find files by owner
find /opt/myapp -user deploy
find /var/log/myapp -newer /etc/myapp/app.conf
```

### Log inspection

```bash
# Read the app log
cat /var/log/myapp/app.log
grep "ERROR" /var/log/myapp/app.log
grep -c "INFO" /var/log/myapp/app.log    # count INFO lines

# System logs
journalctl -u cron --no-pager
journalctl --since "1 hour ago" --no-pager
```

### Auditing group membership consequences

Try this experiment:
1. `id alice` — note her current groups
2. `sudo usermod -G developers alice` — this replaces all groups with just developers
3. `id alice` — she lost the ops group
4. `su - alice` then `cat /etc/myapp/app.conf` — now it fails (no ops group)
5. `exit` then `sudo usermod -aG ops alice` — restore with `-aG`
6. `id alice` — groups are back

This is exactly the kind of mistake that causes production access issues.
