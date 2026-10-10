# Club Shape's outside: the venue model

The booth's opening shot flies in from the bay to Club Shape, as the Shape Sets background draws it, and plays it in a 3D model of the venue. What to build is in [`docs/BUILD-2026-10-10-club-shape-model.md`](../../docs/BUILD-2026-10-10-club-shape-model.md).

```
node scripts/club-shape-model/check-venue.mjs <venue.glb> [--desktop]
```

`check-venue.mjs` holds a file to that brief and exits 1 on any failure. It reads only the GLB's JSON and its images' headers, so it needs no dependencies and runs on a meshopt-compressed file. It checks:

- **The frame.** `StageScreen` must be the brief's 24 × 10.7 m upright quad at (0, 7.65, 18.5). A file in centimetres, exported Z-up or moved off the origin fails here. `Ribbon` must span the venue's footprint and rise along the shell's edge.
- **The materials.** The booth has no lights, so each material must be unlit or carry an emission.
- **The extensions.** Nothing the booth cannot decode: no Draco and no KTX2. Meshopt is fine.
- **The budget.** Triangles, file size, texture size and material count. The phone budget applies by default; `--desktop` applies the desktop one.

Once a file passes, preview it in the booth prototype with `?venue=<url>&mode=arrival`, then set `CLUB_SHAPE_MODEL` in `public/newdesign/booth/noraBoothState.mjs`. Until it is set, the live booth does not fly in.
