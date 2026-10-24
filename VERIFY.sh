#!/usr/bin/env bash
# Local verification gate (no CI by design). Usage: ./VERIFY.sh [--skip-install]
set -euo pipefail
cd "$(dirname "$0")"
export PLAYWRIGHT_PORT="${PLAYWRIGHT_PORT:-3210}"

[[ "${1:-}" == "--skip-install" ]] || npm ci --no-audit --no-fund
npx tsc --noEmit
CI=true npx react-scripts test --watchAll=false
npm run build
npx playwright test
echo "VERIFY: PASS"
