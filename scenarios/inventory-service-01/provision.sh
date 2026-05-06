#!/bin/bash
set -euo pipefail

if ! id inventory &>/dev/null; then
  useradd -r -m -s /bin/bash inventory
fi

mkdir -p /var/lib/inventory-sync
chown inventory:inventory /var/lib/inventory-sync
chmod 750 /var/lib/inventory-sync

cat > /usr/local/bin/inventory-sync <<'SCRIPT'
#!/bin/bash
set -euo pipefail

: "${INVENTORY_TARGET:?INVENTORY_TARGET is required}"

while true; do
  printf 'synced %s at %s\n' "$INVENTORY_TARGET" "$(date -Is)" > /var/lib/inventory-sync/last-sync
  sleep 5
done
SCRIPT
chmod 755 /usr/local/bin/inventory-sync

cat > /etc/inventory-sync.conf <<'CONFIG'
INVENTORY_TARGET=warehouse-east
CONFIG
chmod 644 /etc/inventory-sync.conf

cat > /etc/systemd/system/inventory-sync.service <<'UNIT'
[Unit]
Description=Bashcamp inventory synchronization worker
After=network.target

[Service]
Type=simple
User=inventory
Group=inventory
EnvironmentFile=/etc/sysconfig/inventory-sync
ExecStart=/usr/local/bin/inventory-sync
Restart=on-failure
RestartSec=2

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl disable --now inventory-sync.service &>/dev/null || true
systemctl start inventory-sync.service &>/dev/null || true
