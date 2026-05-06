#!/bin/bash
set -euo pipefail

if ! getent group appops >/dev/null; then
  groupadd appops
fi

if ! id backup_svc &>/dev/null; then
  useradd -m -s /bin/bash backup_svc
fi
usermod -aG appops backup_svc

mkdir -p /opt/myapp/releases/v1.2.1
cat > /opt/myapp/releases/v1.2.1/VERSION <<'VERSION'
myapp 1.2.1
VERSION
cat > /opt/myapp/releases/v1.2.1/README.release <<'README'
Release package for the myapp production deployment.
README

mkdir -p /var/backups/myapp
chown root:root /var/backups/myapp
chmod 700 /var/backups/myapp

cat > /usr/local/sbin/nightly-backup <<'SCRIPT'
#!/bin/bash
set -euo pipefail

backup_dir="/var/backups/myapp"
archive="${backup_dir}/myapp-v1.2.1.tar.gz"

tar -czf "$archive" -C /opt/myapp/releases v1.2.1
echo "backup complete: $archive"
SCRIPT
chmod 755 /usr/local/sbin/nightly-backup

cat > /var/log/myapp-backup.log <<'LOG'
02:00 backup_svc nightly-backup failed: cannot open /var/backups/myapp/myapp-v1.2.1.tar.gz: Permission denied
LOG
