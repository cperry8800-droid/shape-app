#!/usr/bin/env bash
# Pre-commit verification for Shape — scoped to STAGED files, skips docs-only.
#
# Mirrors the CI gate (.github/workflows/ci.yml) + the WORKLOG "verify before
# committing" loop, but only runs the checks the staged change can actually
# break, so docs/copy commits stay instant.
#
#   - mobile/website JSX staged  -> babel parse-check
#   - src/** or TS config staged -> tsc --noEmit  (needs root node_modules)
#   - mobile-app/src/** staged   -> mobile build + public/m sync diff
#   - any code staged            -> npm test
#
# Bypass once (e.g. a known-safe WIP commit):  SKIP_VERIFY=1 git commit ...
set -uo pipefail

if [ "${SKIP_VERIFY:-}" = "1" ]; then
  echo "verify: SKIP_VERIFY=1 set — skipping checks"
  exit 0
fi

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT" || exit 1

mapfile -t STAGED < <(git diff --cached --name-only --diff-filter=ACM)
[ "${#STAGED[@]}" -eq 0 ] && exit 0

ts_changed=0
mobile_changed=0
code_changed=0
declare -a parse_mod parse_script

for f in "${STAGED[@]}"; do
  case "$f" in
    # NOTE: in `case`, * matches '/' too, so these patterns also match nested paths
    src/*.ts|src/*.tsx|tsconfig*.json|next.config.*|src/proxy.ts)
      ts_changed=1; code_changed=1 ;;
  esac
  case "$f" in
    mobile-app/src/*|mobile-app/vite.config.*|mobile-app/*.html)
      mobile_changed=1; code_changed=1 ;;
  esac
  case "$f" in
    mobile-app/src/*.jsx|mobile-app/src/*.js|mobile-app/src/*.mjs)
      parse_mod+=("$f"); code_changed=1 ;;
    public/*.jsx)
      parse_script+=("$f"); code_changed=1 ;;
    tests/*.mjs|tests/*.js)
      code_changed=1 ;;
  esac
done

if [ "$code_changed" -eq 0 ]; then
  echo "verify: no code staged (docs/config only) — OK"
  exit 0
fi

fail=0
step() { printf '\n\033[1mverify: %s\033[0m\n' "$1"; }

# --- 1. Babel parse-check (uses @babel/parser in mobile-app/node_modules) ---
parse_one() { # <abs-file> <sourceType>
  ( cd "$ROOT/mobile-app" && node -e '
      const p=require("@babel/parser"),fs=require("fs");
      p.parse(fs.readFileSync(process.argv[1],"utf8"),{sourceType:process.argv[2],plugins:["jsx"]});
    ' "$1" "$2" )
}
if [ "${#parse_mod[@]}" -gt 0 ] || [ "${#parse_script[@]}" -gt 0 ]; then
  step "parse-check staged JSX/JS"
  for f in "${parse_mod[@]:-}";    do [ -n "$f" ] && { parse_one "$ROOT/$f" module && echo "  ok  $f" || { echo "  FAIL $f"; fail=1; }; }; done
  for f in "${parse_script[@]:-}"; do [ -n "$f" ] && { parse_one "$ROOT/$f" script && echo "  ok  $f" || { echo "  FAIL $f"; fail=1; }; }; done
fi

# --- 2. TypeScript ---
if [ "$ts_changed" -eq 1 ]; then
  if [ -d node_modules ]; then
    step "tsc --noEmit"
    npx tsc --noEmit || fail=1
  else
    echo "verify: WARNING — root node_modules missing, skipping tsc (run 'npm install')"
  fi
fi

# --- 3. Mobile build + public/m sync (the classic 'forgot to republish' catch) ---
if [ "$mobile_changed" -eq 1 ]; then
  step "mobile build + public/m sync"
  ( cd "$ROOT/mobile-app" && VITE_BASE=/m/ npm run build ) || fail=1
  if [ "$fail" -eq 0 ]; then
    if diff -qr "$ROOT/mobile-app/dist" "$ROOT/public/m" >/tmp/verify-m-diff.txt 2>&1; then
      echo "  public/m is in sync"
    else
      echo "  FAIL public/m is OUT OF SYNC — republish from repo root:"
      echo "    rm -rf public/m && cp -r mobile-app/dist public/m"
      cat /tmp/verify-m-diff.txt
      fail=1
    fi
  fi
fi

# --- 4. Tests ---
if [ -d node_modules ]; then
  step "npm test"
  npm test || fail=1
else
  echo "verify: WARNING — root node_modules missing, skipping npm test"
fi

if [ "$fail" -ne 0 ]; then
  printf '\n\033[31mverify: FAILED — commit blocked. Fix the above, or bypass once with SKIP_VERIFY=1.\033[0m\n'
  exit 1
fi
printf '\n\033[32mverify: all checks passed\033[0m\n'
exit 0
