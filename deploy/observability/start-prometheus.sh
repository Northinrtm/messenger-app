#!/bin/sh
set -eu

escape_sed_replacement() {
  printf '%s' "$1" | sed -e 's/[&|\\]/\\&/g'
}

: "${APP_ACTUATOR_SCRAPE_USERNAME:?APP_ACTUATOR_SCRAPE_USERNAME must be set}"
: "${APP_ACTUATOR_SCRAPE_PASSWORD:?APP_ACTUATOR_SCRAPE_PASSWORD must be set}"

username_escaped="$(escape_sed_replacement "${APP_ACTUATOR_SCRAPE_USERNAME}")"
password_escaped="$(escape_sed_replacement "${APP_ACTUATOR_SCRAPE_PASSWORD}")"

sed \
  -e "s|__APP_ACTUATOR_SCRAPE_USERNAME__|${username_escaped}|g" \
  -e "s|__APP_ACTUATOR_SCRAPE_PASSWORD__|${password_escaped}|g" \
  /etc/prometheus/prometheus.yml.tmpl > /tmp/prometheus.yml

exec /bin/prometheus \
  --config.file=/tmp/prometheus.yml \
  --storage.tsdb.path=/prometheus \
  --web.enable-lifecycle
