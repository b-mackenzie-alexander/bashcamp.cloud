#!/bin/bash
set -euo pipefail
# Rules: no apt/dnf/yum, exit 0, idempotent, completes in < 30 seconds.

# --- Groups ---
getent group developers &>/dev/null || groupadd developers
getent group ops        &>/dev/null || groupadd ops
getent group svcaccounts &>/dev/null || groupadd svcaccounts

# --- Users ---
# alice — developer
if ! id alice &>/dev/null; then
  useradd -m -s /bin/bash -c "Alice Chen, Developer" alice
fi
echo "alice:dev@alice1" | chpasswd
usermod -aG developers alice  # primary supplemental group

# bob — developer
if ! id bob &>/dev/null; then
  useradd -m -s /bin/bash -c "Bob Reyes, Developer" bob
fi
echo "bob:dev@bob1" | chpasswd
usermod -aG developers bob

# carol — ops engineer (has sudo)
if ! id carol &>/dev/null; then
  useradd -m -s /bin/bash -c "Carol Nguyen, Ops Engineer" carol
fi
echo "carol:ops@carol1" | chpasswd
usermod -aG sudo,ops carol

# deploy — service account (no interactive shell)
if ! id deploy &>/dev/null; then
  useradd -m -s /usr/sbin/nologin -c "Deploy Service Account" deploy
fi
echo "deploy:svc@deploy1" | chpasswd
usermod -aG svcaccounts,developers deploy

# backup — service account (no interactive shell)
if ! id backup &>/dev/null; then
  useradd -m -s /usr/sbin/nologin -c "Backup Service Account" backup
fi
echo "backup:svc@backup1" | chpasswd
usermod -aG svcaccounts backup

# nginx_svc — service account (no interactive shell)
if ! id nginx_svc &>/dev/null; then
  useradd -m -s /usr/sbin/nologin -c "Web Server Service Account" nginx_svc
fi
echo "nginx_svc:svc@nginx1" | chpasswd
usermod -aG svcaccounts nginx_svc

# sr_sysadmin in ops group (already exists in base image)
usermod -aG ops sr_sysadmin

# --- Directories ---
mkdir -p /opt/myapp/releases/v1.2.0 /opt/myapp/shared /opt/myapp/logs
chown -R deploy:developers /opt/myapp
chmod 2775 /opt/myapp           # setgid: new files inherit group
chmod 2775 /opt/myapp/releases
chmod 2775 /opt/myapp/shared
chmod 750  /opt/myapp/logs

mkdir -p /var/www/html
chown nginx_svc:developers /var/www/html
chmod 2775 /var/www/html

mkdir -p /srv/backups
chown backup:svcaccounts /srv/backups
chmod 770 /srv/backups

mkdir -p /var/log/myapp
chown deploy:svcaccounts /var/log/myapp
chmod 2750 /var/log/myapp       # setgid + group-readable logs

mkdir -p /etc/myapp
chown root:ops /etc/myapp
chmod 750 /etc/myapp

# --- Files ---
# App config
cat > /etc/myapp/app.conf <<'EOF'
# myapp configuration
APP_ENV=production
APP_PORT=8080
DB_HOST=db.internal
DB_PORT=5432
DB_NAME=myapp_prod
LOG_LEVEL=info
MAX_WORKERS=4
EOF
chown root:ops /etc/myapp/app.conf
chmod 640 /etc/myapp/app.conf

# Release files
cat > /opt/myapp/releases/v1.2.0/app.jar.stub <<'EOF'
[stub: myapp-1.2.0 release artifact]
EOF
cat > /opt/myapp/releases/v1.2.0/RELEASE_NOTES <<'EOF'
v1.2.0 — 2026-04-18
- Fixed session timeout bug
- Improved database connection pooling
- Updated dependency versions
EOF
chown -R deploy:developers /opt/myapp/releases

# Shared config symlinked from release (realistic pattern)
cat > /opt/myapp/shared/database.yml <<'EOF'
production:
  adapter: postgresql
  host: db.internal
  port: 5432
  database: myapp_prod
  pool: 5
  timeout: 5000
EOF
chown deploy:developers /opt/myapp/shared/database.yml
chmod 640 /opt/myapp/shared/database.yml

# Web content
cat > /var/www/html/index.html <<'EOF'
<!doctype html><html><body><h1>myapp</h1><p>Deployed by the ops team.</p></body></html>
EOF
chown nginx_svc:developers /var/www/html/index.html

# Seed application log (guard prevents duplicate entries on re-run)
if [ ! -s /var/log/myapp/app.log ]; then
  cat > /var/log/myapp/app.log <<'LOGEOF'
INFO  [2026-04-18 08:01:02] Application started on port 8080
INFO  [2026-04-18 08:01:03] Database connection pool initialized (5 connections)
WARN  [2026-04-18 09:14:33] Slow query detected: 843ms (threshold: 500ms)
INFO  [2026-04-18 11:45:00] Deploy user triggered release v1.2.0
ERROR [2026-04-18 14:22:17] Failed to connect to cache.internal:6379 — retrying
INFO  [2026-04-18 14:22:19] Cache connection restored
LOGEOF
fi
chown deploy:svcaccounts /var/log/myapp/app.log
chmod 640 /var/log/myapp/app.log

# alice's .bash_aliases
cat > /home/alice/.bash_aliases <<'EOF'
alias ll='ls -alF'
alias la='ls -A'
alias cdapp='cd /opt/myapp'
alias deploylog='tail -f /var/log/myapp/app.log'
EOF
chown alice:alice /home/alice/.bash_aliases

echo "sandbox-ubuntu provision complete"
