#!/usr/bin/env bash
# Run the whole before/after panel against one served build: measure-all.sh <base-url> <out-dir>
set -u
U="$1"; O="$2"; mkdir -p "$O"
H="$(cd "$(dirname "$0")" && pwd)"
run() { echo "== $1" >> "$O/log.txt"; shift; timeout 400 "$@" >> "$O/log.txt" 2>&1; echo "exit $?" >> "$O/log.txt"; }
run "rt high" node "$H/rtprobe.cjs" "$U/index.html" 1280 720
run "glinfo high wide" node "$H/glinfo.cjs" "$U/index.html" 1280 720 wide
run "glinfo low wide" node "$H/glinfo.cjs" "$U/index.html?q=low" 1280 720 wide
run "shots high" node "$H/shot3.cjs" "$U/index.html" "$O/hi" 1280 720 16000 club,wide,shoulder,jog,mixer,profile,face,panorama
run "shots low" node "$H/shot3.cjs" "$U/index.html?q=low" "$O/lo" 1280 720 16000 wide,face
run "shots live" node "$H/shot3.cjs" "$U/index.html?autostart=1&synth=1" "$O/live" 1280 720 22000 wide,jog,face
run "motion" node "$H/motion-sample.cjs" "$U/index.html?autostart=1&synth=1" 400
run "phone" node "$H/phone-run.cjs" "$U/index.html" "$O/phone"
echo DONE >> "$O/log.txt"
