#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Fast path for routine code updates on the current production VPS.
# Any extra args are forwarded to deploy-vps.sh and can override defaults.
# Example destructive reset: scripts/update-vps.sh --seed-level demo --reset-db
# pnpm can pass a literal `--`; ignore it if present.
if [[ "${1:-}" == "--" ]]; then
  shift
fi
exec "$SCRIPT_DIR/deploy-vps.sh" \
  --host 156.67.25.168 \
  --domain fastifly.nbb.ai \
  --setup-caddy \
  --db sqlite \
  --seed-level none \
  "$@"
