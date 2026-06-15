#!/bin/bash
# SessionStart hook — web sessions begin from a fresh clone, so:
#   1. arm the tracked pre-commit verify hook (core.hooksPath isn't persisted), and
#   2. install root deps so the checks (tsc, next build, npm test) can actually run.
# Idempotent; safe to run on every start/resume.
set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"

# Arm the pre-commit verification hook
git config core.hooksPath .githooks 2>/dev/null || true

# Install dependencies (prefer install over ci so the cached container reuses
# them). Check for a real binary, not just the dir — a restored-but-incomplete
# node_modules (missing .bin) otherwise slips through and breaks the build.
if [ ! -x node_modules/.bin/next ]; then
  npm install --no-audit --no-fund
fi
if [ ! -x mobile-app/node_modules/.bin/vite ]; then
  ( cd mobile-app && npm install --no-audit --no-fund )
fi

echo "session-start: pre-commit hook armed; deps ready"
