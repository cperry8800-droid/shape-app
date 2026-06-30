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
( cd mobile-app && VITE_BASE=/m/ npm run build )

echo "→ Publishing mobile-app/dist → public/m…"
rm -rf public/m
cp -r mobile-app/dist public/m

echo "→ public/m built: $(find public/m -type f | wc -l) files"
