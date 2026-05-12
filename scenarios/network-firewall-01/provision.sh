#!/bin/bash
set -euo pipefail

# Create the web developer persona (idempotent)
if ! id mlopez &>/dev/null; then
  useradd -m -s /bin/bash mlopez
fi
echo "mlopez:webdev99" | chpasswd
usermod -aG sudo mlopez

# Create a secondary persona for realistic system state
if ! id bchen &>/dev/null; then
  useradd -m -s /bin/bash bchen
fi
echo "bchen:changeme" | chpasswd

# Install and configure a minimal HTTP responder using netcat + a systemd unit.
# This simulates a running web service without requiring a package install at runtime.
# The service just returns a static HTTP 200 response for any request.

cat > /etc/systemd/system/webapp.service << 'EOF'
[Unit]
Description=Bashcamp Demo Web App
After=network.target

[Service]
ExecStart=/bin/bash -c "while true; do echo -e 'HTTP/1.1 200 OK\r\nContent-Length: 13\r\n\r\nHello, world!' | nc -l -p 80 -q 1; done"
Restart=always
RestartSec=1

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable webapp.service
systemctl start webapp.service || true

# Wait briefly for the service to bind to port 80
sleep 2

# Apply a broken nftables ruleset that drops all incoming TCP traffic on port 80.
# The student must identify and remove (or replace) the DROP rule for port 80.
# Structure: a base table with an input chain that allows established traffic and SSH,
# then mistakenly drops HTTP.

nft flush ruleset

nft add table inet filter
nft add chain inet filter input '{ type filter hook input priority 0; policy accept; }'

# Allow established and related connections
nft add rule inet filter input ct state established,related accept

# Allow SSH so the student is never locked out
nft add rule inet filter input tcp dport 22 accept

# Allow loopback
nft add rule inet filter input iifname lo accept

# The misconfigured rule: drop port 80 — this is what the student must find and fix
nft add rule inet filter input tcp dport 80 drop

# Seed realistic log entries
for msg in \
  "webapp[$$]: started on :80" \
  "sshd: Accepted publickey for sr_sysadmin" \
  "kernel: nf_tables: policy updated for chain 'input'"; do
  for _ in 1 2 3; do
    logger "$msg" 2>/dev/null && break
    sleep 1
  done || true
done
