#!/usr/bin/env bash
set -euo pipefail

SWAP_SIZE="${1:-2G}"
SWAP_FILE="${SWAP_FILE:-/swapfile}"
SYSCTL_CONF="${SYSCTL_CONF:-/etc/sysctl.d/99-messenger-swap.conf}"

size_to_megabytes() {
  local raw="$1"
  if [[ "${raw}" =~ ^([0-9]+)[Gg]$ ]]; then
    echo $(( BASH_REMATCH[1] * 1024 ))
    return
  fi
  if [[ "${raw}" =~ ^([0-9]+)[Mm]$ ]]; then
    echo "${BASH_REMATCH[1]}"
    return
  fi
  echo "Unsupported swap size '${raw}'. Use values like 2G or 2048M." >&2
  exit 1
}

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/enable-swap.sh [size]" >&2
  exit 1
fi

if swapon --show=NAME --noheadings | grep -Fxq "${SWAP_FILE}"; then
  echo "Swap already active on ${SWAP_FILE}"
else
  if [[ ! -f "${SWAP_FILE}" ]]; then
    if command -v fallocate >/dev/null 2>&1; then
      fallocate -l "${SWAP_SIZE}" "${SWAP_FILE}"
    else
      dd if=/dev/zero of="${SWAP_FILE}" bs=1M count="$(size_to_megabytes "${SWAP_SIZE}")" status=progress
    fi
  fi

  chmod 600 "${SWAP_FILE}"
  mkswap "${SWAP_FILE}"
  swapon "${SWAP_FILE}"
fi

if ! grep -Fq "${SWAP_FILE} none swap sw 0 0" /etc/fstab; then
  echo "${SWAP_FILE} none swap sw 0 0" >> /etc/fstab
fi

cat > "${SYSCTL_CONF}" <<'EOF'
vm.swappiness=10
vm.vfs_cache_pressure=50
EOF

sysctl --system >/dev/null

echo
echo "Swap status:"
swapon --show
echo
free -h
