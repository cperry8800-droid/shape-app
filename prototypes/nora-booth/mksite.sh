#!/usr/bin/env bash
# Make a local copy of a published folder the way the artifact host serves it: the host wraps the page
# in a skeleton with <meta charset> and a device-width viewport, which pub/index.html does not carry
# itself (without it a 390 px phone lays the page out at 980 px). Usage: mksite.sh <src-dir> <out-dir>
set -e
mkdir -p "$2"; cp "$1"/booth.js "$1"/nora.vrm.txt "$1"/crowd.bin.txt "$2"/
{ printf '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>\n'; cat "$1"/index.html; printf '\n</body></html>\n'; } > "$2"/index.html
