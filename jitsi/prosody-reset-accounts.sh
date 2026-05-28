#!/usr/bin/with-contenv bash
# Remove stale XMPP account data so that 70-register-setup re-creates
# all users with fresh passwords from the current environment variables.
# Without this, `prosodyctl shell user create` silently skips existing
# accounts, causing auth failures when passwords change between deploys.
DATA_DIR="/config/data/auth%2emeet%2ejitsi/accounts"
if [ -d "$DATA_DIR" ]; then
    rm -f "$DATA_DIR"/*.dat
fi
