#!/usr/bin/env bash
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-deploy}"
DEPLOY_HOME="${DEPLOY_HOME:-/home/$DEPLOY_USER}"
APP_DIR="${APP_DIR:-/opt/messenger-app}"
ADMIN_IPV4="${ADMIN_IPV4:-}"
DEPLOY_PUBLIC_KEY="${DEPLOY_PUBLIC_KEY:-}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

if [[ -z "$DEPLOY_PUBLIC_KEY" ]]; then
  echo "DEPLOY_PUBLIC_KEY is required." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update

packages=(
  ca-certificates
  curl
  fail2ban
  git
  ufw
)

if ! command -v docker >/dev/null 2>&1; then
  packages+=(docker.io)
fi

if ! docker compose version >/dev/null 2>&1 && ! command -v docker-compose >/dev/null 2>&1; then
  if apt-cache show docker-compose-plugin >/dev/null 2>&1; then
    packages+=(docker-compose-plugin)
  else
    packages+=(docker-compose)
  fi
fi

apt-get install -y --no-install-recommends "${packages[@]}"

if ! id -u "$DEPLOY_USER" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$DEPLOY_USER"
fi

install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$DEPLOY_HOME/.ssh"
printf '%s\n' "$DEPLOY_PUBLIC_KEY" > "$DEPLOY_HOME/.ssh/authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_HOME/.ssh/authorized_keys"
chmod 600 "$DEPLOY_HOME/.ssh/authorized_keys"

usermod -aG docker "$DEPLOY_USER"

install -d -m 755 "$APP_DIR"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR"

install -d -m 755 /etc/ssh/sshd_config.d
cp /opt/messenger-app/deploy/sshd_config.d/10-messenger-hardening.conf /etc/ssh/sshd_config.d/10-messenger-hardening.conf

install -d -m 755 /etc/fail2ban/jail.d
cp /opt/messenger-app/deploy/fail2ban/jail.d/messenger-sshd.local /etc/fail2ban/jail.d/messenger-sshd.local

ufw --force default deny incoming
ufw --force default allow outgoing
if [[ -n "$ADMIN_IPV4" ]]; then
  ufw allow from "$ADMIN_IPV4" to any port 22 proto tcp
else
  ufw allow 22/tcp
fi
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 4443/tcp
ufw allow 10000/udp
ufw --force enable

systemctl enable --now docker
systemctl enable --now fail2ban
systemctl restart ssh || systemctl restart sshd

cat <<EOF
Bootstrap complete.
- deploy user: $DEPLOY_USER
- app dir: $APP_DIR
- docker enabled
- fail2ban enabled
- ufw enabled

Next:
1. Verify key login for '$DEPLOY_USER'
2. Clone the repository into $APP_DIR
3. After verifying key-based access, run deploy/disable-ssh-passwords.sh
EOF
