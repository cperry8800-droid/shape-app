#!/usr/bin/env bash
# convert.sh — a metahuman-to-glb character folder into the VRM Nora's booth loads.
#
#   scripts/nora-model/convert.sh <character-folder> <out.vrm> [--tris 80000] [--outfit '#1c1d21'] [--hair '#2a1a12']
#
# <character-folder> is what the pipeline's stage 04 writes (docs/characters/<id>/): <id>.glb,
# textures/ and mh_materials.json. Needs:
#   - Blender 4.2+ (`blender` on PATH, or BLENDER=/path/to/blender), or the `bpy` Python module
#     (BLENDER_PY=/path/to/python with `pip install bpy==4.2.0`);
#   - the VRM add-on's source (VRM_ADDON_SRC=<VRM-Addon-for-Blender>/src);
#   - `npm install` in this folder (glTF-Transform, meshopt, sharp).
# See README.md beside this file. The output is checked by check-vrm.mjs before this exits.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="${1:?character folder}"; OUT="${2:?output .vrm}"; shift 2
TRIS=80000; OUTFIT=""; HAIR=""
while [ $# -gt 0 ]; do
  case "$1" in
    --tris) TRIS="$2"; shift 2 ;;
    --outfit) OUTFIT="$2"; shift 2 ;;
    --hair) HAIR="$2"; shift 2 ;;
    *) echo "unknown argument $1" >&2; exit 2 ;;
  esac
done
: "${VRM_ADDON_SRC:?set VRM_ADDON_SRC to the src folder of the VRM add-on}"
GLB="$(ls "$SRC"/*.glb | head -1)"
[ -f "$GLB" ] || { echo "no .glb in $SRC" >&2; exit 2; }
[ -f "$SRC/mh_materials.json" ] || { echo "no mh_materials.json in $SRC (run the pipeline's stage 04)" >&2; exit 2; }
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT

node "$HERE/prepare.mjs" "$GLB" "$WORK/raw.glb"
ARGS=(-- "$WORK/raw.glb" "$WORK/converted.vrm" "$VRM_ADDON_SRC" --tex 1024 --tris "$TRIS" --materials "$SRC/mh_materials.json")
[ -n "$OUTFIT" ] && ARGS+=(--outfit "$OUTFIT")
[ -n "$HAIR" ] && ARGS+=(--hair "$HAIR")
if [ -n "${BLENDER_PY:-}" ]; then
  "$BLENDER_PY" "$HERE/mh_to_vrm.py" "${ARGS[@]}"
else
  "${BLENDER:-blender}" -b --factory-startup -P "$HERE/mh_to_vrm.py" "${ARGS[@]}"
fi
node "$HERE/compress.mjs" "$WORK/converted.vrm" "$OUT" --tex 1024
node "$HERE/check-vrm.mjs" "$OUT"
