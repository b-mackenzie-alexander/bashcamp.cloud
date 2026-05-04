#!/bin/bash
set -euo pipefail

# Create student user with sudo group membership (idempotent)
if ! id kgarcia &>/dev/null; then
  useradd -m -s /bin/bash kgarcia
fi
echo "kgarcia:linux+practice" | chpasswd
usermod -aG sudo kgarcia

# Corrupt sudoers — student must use pkexec visudo or recovery technique.
# Guard: only append the bad line if it isn't already present.
if ! grep -q "BADSYNTAX" /etc/sudoers; then
  echo "kgarcia ALL=(ALL:ALL) ALL BADSYNTAX" >> /etc/sudoers
fi

# Second user for realistic system state (idempotent)
if ! id jdeng &>/dev/null; then
  useradd -m -s /bin/bash jdeng
fi
echo "jdeng:changeme" | chpasswd

# Seed plausible log noise — logger requires rsyslog to be running;
# retry briefly to tolerate systemd still starting up, then skip if unavailable.
for msg in "Failed password for root from 192.168.1.105" "sudo: pam_unix(sudo:auth): authentication failure"; do
  for _ in 1 2 3 4 5; do
    logger "$msg" 2>/dev/null && break
    sleep 1
  done || true
done
