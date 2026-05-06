#!/bin/bash
set -euo pipefail

if ! getent group appops >/dev/null; then
  groupadd appops
fi

if ! id deploy &>/dev/null; then
  useradd -m -s /bin/bash deploy
fi
usermod -aG appops deploy

mkdir -p /opt/myapp/releases/2026.05.06/bin
mkdir -p /opt/myapp/releases/2026.04.20/bin
mkdir -p /opt/myapp/logs
mkdir -p /etc/myapp

cat > /opt/myapp/releases/2026.05.06/bin/worker.sh <<'SCRIPT'
#!/bin/bash
set -euo pipefail

source /etc/myapp/worker.env

while true; do
  printf 'worker=%s release=2026.05.06 time=%s\n' "$MYAPP_WORKER_NAME" "$(date -Is)" >> /opt/myapp/logs/worker.log
  sleep 5
done
SCRIPT
chmod 755 /opt/myapp/releases/2026.05.06/bin/worker.sh

cat > /opt/myapp/releases/2026.04.20/bin/worker.sh <<'SCRIPT'
#!/bin/bash
set -euo pipefail

echo "deprecated worker release"
exit 1
SCRIPT
chmod 755 /opt/myapp/releases/2026.04.20/bin/worker.sh

cat > /etc/myapp/worker.env <<'CONFIG'
MYAPP_WORKER_NAME=payment-import
CONFIG
chown root:appops /etc/myapp/worker.env
chmod 640 /etc/myapp/worker.env

rm -f /opt/myapp/current
ln -s /opt/myapp/releases/missing-release /opt/myapp/current
chown -h root:root /opt/myapp/current
chown -R root:root /opt/myapp
chown root:root /opt/myapp/logs
chmod 700 /opt/myapp/logs

cat > /etc/systemd/system/myapp-worker.service <<'UNIT'
[Unit]
Description=Bashcamp myapp deployment worker
After=network.target

[Service]
Type=simple
User=deploy
Group=appops
ExecStart=/opt/myapp/current/bin/worker.sh
Restart=on-failure
RestartSec=2

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl disable --now myapp-worker.service &>/dev/null || true
systemctl start myapp-worker.service &>/dev/null || true
