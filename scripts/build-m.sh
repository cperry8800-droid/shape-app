#!/usr/bin/env bash
# Build the mobile /m/ bundle at DEPLOY time (on Vercel's Linux build host) and
# place it at public/m, so the bundle is generated from source on every deploy
# instead of being hand-built and committed to git.
#
# This is wired in as the Vercel buildCommand (vercel.json):
#   "buildCommand": "bash scripts/build-m.sh && next build"
# so it runs ONLY on Vercel — not on a local `npm run build` or in CI.
#
# Why: a Windows dev box can't reproduce CI's Linux build of the 3D Nora bundle,
# so committing public/m by hand was error-prone. Building it on the (Linux)
# deploy host removes that whole class of problem.
set -euo pipefail

echo "→ Installing mobile-app dependencies…"
# --include=dev: Vercel builds run with NODE_ENV=production, which would omit
# devDependencies — but the postinstall (patch-package) and the build tool
# (vite) are both devDeps, so they must be installed.
( cd mobile-app && npm ci --include=dev )

echo "→ Building the /m/ bundle (VITE_BASE=/m/)…"
# VERCEL_GIT_COMMIT_SHA is set automatically by Vercel's build environment.
# Exporting it as VITE_SHAPE_RELEASE bakes it into the bundle (Vite inlines
# import.meta.env.* at build time) as this deploy's Sentry release string —
# identical to the web side's release (see sentry-context.mjs), so one
# deploy's mobile + server errors correlate. Empty/unset outside Vercel
# (local build, CI) — sentry.mjs treats that as "no release", not a crash.
export VITE_SHAPE_RELEASE="${VERCEL_GIT_COMMIT_SHA:-}"
( cd mobile-app && VITE_BASE=/m/ npm run build )

echo "→ Publishing mobile-app/dist → public/m…"
rm -rf public/m
cp -r mobile-app/dist public/m

# --- Sentry sourcemap upload: ALREADY DONE, one step up ---
# This used to be a placeholder comment saying an upload "goes here" — it never
# did, so maps were generated and then deleted without ever being sent anywhere
# and every mobile stack trace would have arrived minified.
#
# The upload now runs inside the vite build above, via @sentry/vite-plugin (see
# mobile-app/vite.config.ts), which reads the maps from mobile-app/dist BEFORE
# the `cp -r` that put them in public/m. It is gated on SENTRY_AUTH_TOKEN +
# SENTRY_ORG + SENTRY_PROJECT_MOBILE and is simply absent when they are unset,
# so nothing uploads until the owner configures Sentry. The strip below is
# therefore unconditional and independent: maps are generated -> uploaded (when
# configured) -> always stripped before publish.

# vite.config.ts sets `sourcemap: 'hidden'`: maps are generated (for a future
# Sentry upload / local symbolication) but the bundle carries no
# `//# sourceMappingURL=` comment pointing at them. That alone does NOT stop
# them being served — they're still real files in dist/, and the `cp -r` above
# just copied them into public/m, which is served publicly at
# theshapecommunity.com/m/…. Delete them here so nothing is ever reachable:
# maps are generated, (eventually) uploaded, then stripped before publish.
#
# ⚠ EXPECT THIS TO REPORT 0 — that is success, not breakage. The strip now
# happens upstream in mobile-app/vite.config.ts (`stripSourcemaps`, in
# closeBundle), because dist/ is the chokepoint that ALSO feeds the native
# Android and iOS builds — and this script never runs in either of those (it is
# the Vercel buildCommand only, see vercel.json). By the time the `cp -r` above
# runs, dist/ already has no maps. This delete is kept as a redundant backstop
# so /m/ stays covered even if the vite plugin is ever removed; a NON-zero count
# here means the upstream strip stopped working.
map_count=$(find public/m -name '*.map' -type f | wc -l)
find public/m -name '*.map' -type f -delete
echo "→ Removed ${map_count} sourcemap file(s) from public/m (expected 0 — stripped upstream in vite.config.ts)"

echo "→ public/m built: $(find public/m -type f | wc -l) files"
