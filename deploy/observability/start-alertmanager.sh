#!/bin/sh
set -eu

/bin/sh /etc/alertmanager/render-config.sh /tmp/alertmanager.yml

exec /bin/alertmanager \
  --config.file=/tmp/alertmanager.yml \
  --storage.path=/alertmanager
