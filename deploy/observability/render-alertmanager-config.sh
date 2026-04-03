#!/bin/sh
set -eu

output_path="${1:-/tmp/alertmanager.yml}"

cat > "$output_path" <<'EOF'
global:
  resolve_timeout: 5m

route:
  receiver: default
  group_by:
    - alertname
    - service
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h

receivers:
  - name: default
EOF

if [ -n "${ALERTMANAGER_WEBHOOK_URL:-}" ]; then
  cat >> "$output_path" <<EOF
    webhook_configs:
      - url: ${ALERTMANAGER_WEBHOOK_URL}
        send_resolved: true
EOF
else
  echo "Alertmanager webhook receiver is not configured; alerts will remain local only." >&2
fi
