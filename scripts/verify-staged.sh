#!/usr/bin/env bash
# Pre-commit verification for Shape — scoped to STAGED files, skips docs-only.
#
# Mirrors the CI gate (.github/workflows/ci.yml) + the WORKLOG "verify before
# committing" loop, but only runs the checks the staged change can actually
# break, so docs/copy commits stay instant.
#
#   - any .js/.jsx/.mjs/.cjs     -> babel parse-check (by extension, not by dir)
#   - src/** or TS config staged -> tsc --noEmit  (needs root node_modules)
#   - mobile-app/src/** staged   -> mobile build
#   - any code staged            -> npm test
#
# ⚠ THIS HOOK IS NOT THE GATE. It can be skipped with --no-verify or
# SKIP_VERIFY=1, so treat it as a fast local mirror of CI, never as the thing
# that keeps a bug out of main. The hard gate is .github/workflows/ci.yml plus
# the branch-protection required-checks list.
#
# Bypass once (e.g. a known-safe WIP commit):  SKIP_VERIFY=1 git commit ...
set -o pipefail

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
# Explicit empty-array init (not `declare -a`) so `${#arr[@]}` is "set" even on
# bash 3.2 (macOS) — a declared-but-unassigned array reads as unbound there.
parse_mod=()
parse_script=()
parse_auto=()

for f in "${STAGED[@]}"; do
  case "$f" in
    # NOTE: in `case`, * matches '/' too, so these patterns also match nested paths
    src/*.ts|src/*.tsx|tsconfig*.json|next.config.*|src/proxy.ts)
      ts_changed=1; code_changed=1 ;;
  esac
  case "$f" in
    # ⚠ The BUILD INPUTS, not just the sources. package.json / the lockfile /
    # capacitor.config / tsconfig all change what `npm run build` produces, and
    # a dependency bump touching only those used to skip the mobile build
    # entirely — the same "gate silently not firing" class this file's other
    # arms exist to close. (`mobile-app/*.html` already matches nested paths,
    # since `*` matches '/' in a case pattern.)
    mobile-app/src/*|mobile-app/vite.config.*|mobile-app/*.html|\
    mobile-app/package.json|mobile-app/package-lock.json|\
    mobile-app/capacitor.config.*|mobile-app/tsconfig*.json)
      mobile_changed=1; code_changed=1 ;;
  esac
  # ⚠ THIS MATCHES BY EXTENSION, NOT BY DIRECTORY, DELIBERATELY.
  #
  # The old arms listed directories, so anything outside them set code_changed=0
  # and the script printed "no code staged (docs/config only) — OK" and exited 0.
  # That is not a gap in coverage, it is a gate reporting success on an unverified
  # change. It covered public/supabase.js — 1045 lines, loaded by 56 pages,
  # defining window.shapeDb, ShapeTurnstile, ShapeAnalytics and shapeSignOut —
  # plus 20 other public/**/*.js and every scripts/*.mjs. An allowlist also means
  # each new directory has to remember to add itself, and forgetting is silent.
  #
  # sourceType: the EXTENSION is authoritative only for .mjs/.cjs. For .js/.jsx it
  # carries no information here — 28 tracked .js/.jsx files are ESM and 161 are
  # classic scripts. public/newdesign/spotlightTour.js is a module (it imports
  # ./spotlightGeom.mjs) while its 10 directory-siblings are scripts, so ANY fixed
  # per-directory guess hard-blocks a commit of a valid file. 'unambiguous' lets
  # the parser decide, which keeps this a SYNTAX check — the only thing it can
  # honestly be — instead of an accidental module-system assertion.
  case "$f" in
    # Third-party/generated: never hand-edited, and a parser-plugin mismatch here
    # would block a commit nobody can fix. chat-design-v2/ is design scratch (no
    # build or deploy config references it) and holds ios-frame.jsx, which is an
    # HTML document saved under a .jsx name — a real defect, but someone else's.
    public/vendor/*|*.min.js|chat-design-v2/*)
      ;;
    *.mjs)
      parse_mod+=("$f"); code_changed=1 ;;
    *.cjs)
      parse_script+=("$f"); code_changed=1 ;;
    *.js|*.jsx)
      parse_auto+=("$f"); code_changed=1 ;;
  esac
done

# --- Shared bundle inputs -----------------------------------------------------
#
# The arms above match PATH PREFIXES. Vite's input set is the IMPORT GRAPH, and
# the two disagree: mobile-app/src reaches outside its own tree 18 times, e.g.
# iosAppBroadsheetRadio.jsx imports ../../../public/newdesign/noraStage.mjs and
# sentry.mjs imports ../../../src/lib/sentry-context.mjs. Staging only one of
# those set code_changed (parser + suite ran) but never mobile_changed, so the
# one check that catches a renamed export or a deleted module was skipped and
# the hook still printed "all checks passed".
#
# Derived rather than listed: public/newdesign holds 306 tracked files and is one
# of the busiest trees in the repo, but only 15 are reachable from mobile. A
# directory arm would put a full mobile build on nearly every commit, and a hook
# slow enough to resent is a hook that gets --no-verify'd.
if [ "$mobile_changed" -eq 0 ]; then
  # Only pay for the graph walk when something outside mobile-app/ could plausibly
  # be in it. A docs-only or SQL-only commit skips this entirely.
  maybe_shared=0
  for f in "${STAGED[@]}"; do
    case "$f" in
      mobile-app/*) ;;
      *.mjs|*.cjs|*.js|*.jsx|*.ts|*.tsx|*.json) maybe_shared=1 ;;
    esac
  done
  if [ "$maybe_shared" -eq 1 ]; then
    if ! shared_inputs="$(node "$ROOT/scripts/mobile-bundle-inputs.mjs" 2>&1)"; then
      # ⚠ MUST NOT DEGRADE TO "no shared inputs found". A deriver that errors and
      # is treated as an empty result silently turns this check OFF, which is
      # indistinguishable from a clean run — the exact failure this hook exists
      # to stop. Unknown is not the same as none.
      echo "verify: FAIL — could not derive the mobile bundle's shared inputs."
      echo "        scripts/mobile-bundle-inputs.mjs exited non-zero:"
      printf '%s\n' "$shared_inputs" | sed 's/^/        /'
      echo "        Fix it, or bypass deliberately with SKIP_VERIFY=1."
      exit 1
    fi
    if [ -z "$shared_inputs" ]; then
      # Same reasoning: mobile has imported out of its tree since the Broadsheet
      # split, so an empty graph means the walker broke, not that the coupling
      # went away. tests/mobile-bundle-inputs.test.mjs pins this too.
      echo "verify: FAIL — the mobile bundle's shared-input set came back EMPTY."
      echo "        That means scripts/mobile-bundle-inputs.mjs stopped resolving,"
      echo "        not that mobile stopped importing out of its tree."
      exit 1
    fi
    for f in "${STAGED[@]}"; do
      if printf '%s\n' "$shared_inputs" | grep -qxF -- "$f"; then
        echo "verify: '$f' is a shared mobile bundle input — enabling the mobile build"
        mobile_changed=1; code_changed=1
      fi
    done
  fi
fi

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
if [ "${#parse_mod[@]}" -gt 0 ] || [ "${#parse_script[@]}" -gt 0 ] || [ "${#parse_auto[@]}" -gt 0 ]; then
  step "parse-check staged JSX/JS"
  for f in "${parse_mod[@]:-}";    do [ -n "$f" ] && { parse_one "$ROOT/$f" module      && echo "  ok  $f" || { echo "  FAIL $f"; fail=1; }; }; done
  for f in "${parse_script[@]:-}"; do [ -n "$f" ] && { parse_one "$ROOT/$f" script      && echo "  ok  $f" || { echo "  FAIL $f"; fail=1; }; }; done
  for f in "${parse_auto[@]:-}";   do [ -n "$f" ] && { parse_one "$ROOT/$f" unambiguous && echo "  ok  $f" || { echo "  FAIL $f"; fail=1; }; }; done
fi

# --- 2. TypeScript ---
if [ "$ts_changed" -eq 1 ]; then
  if [ -d node_modules ]; then
    step "tsc --noEmit"
    npx tsc --noEmit || fail=1
  else
    # ⚠ WAS A WARNING THAT LET THE COMMIT THROUGH. "I could not check this"
    # printed in the same run that ends "all checks passed" is a false pass —
    # the developer reads the green line, not the yellow one. Blocking is the
    # honest outcome; the message says exactly how to proceed either way.
    echo "verify: FAIL — root node_modules missing, so tsc could NOT run."
    echo "        Run 'npm install', or bypass deliberately with SKIP_VERIFY=1."
    fail=1
  fi
fi

# --- 3. Mobile build ---
#
# ⚠ The public/m SYNC DIFF THAT USED TO LIVE HERE IS GONE, DELIBERATELY.
# public/m stopped being committed in #1470 — .gitignore:26 ignores it and
# `git ls-files public/m` returns nothing; it is built at DEPLOY time by
# scripts/build-m.sh. The old step diffed a fresh build against whatever stale
# copy happened to be lying around locally, so it could only ever fail, and the
# remedy it printed ("republish from repo root") told the developer to
# re-create a directory the pipeline deliberately stopped tracking. A check
# that fails for a reason the developer cannot fix teaches exactly one habit:
# --no-verify — which also disables the mount tests in step 4. Removing it is
# the point, not a regression.
if [ "$mobile_changed" -eq 1 ]; then
  step "mobile build"
  ( cd "$ROOT/mobile-app" && VITE_BASE=/m/ npm run build ) || fail=1
fi

# --- 4. Tests ---
if [ -d node_modules ]; then
  step "npm test"
  npm test || fail=1
else
  # Same reasoning as the tsc branch above — an unrun suite must not read as a
  # passing one. This is the branch that hid the MOUNT tests specifically.
  echo "verify: FAIL — root node_modules missing, so the test suite could NOT run."
  echo "        Run 'npm install', or bypass deliberately with SKIP_VERIFY=1."
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  printf '\n\033[31mverify: FAILED — commit blocked. Fix the above, or bypass once with SKIP_VERIFY=1.\033[0m\n'
  exit 1
fi
printf '\n\033[32mverify: all checks passed\033[0m\n'
exit 0
