#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

install -d -m 755 /etc/ssh/sshd_config.d
cp /opt/messenger-app/deploy/sshd_config.d/20-disable-password-auth.conf /etc/ssh/sshd_config.d/20-disable-password-auth.conf
sshd -t
systemctl restart ssh || systemctl restart sshd

echo "Password-based SSH access disabled. Verify deploy key access in a new terminal before closing your current root session."
