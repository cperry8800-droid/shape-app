# The crowd as real people (MakeHuman)

Owner, 2026-10-26: *"make the crowd look like real people"*, *"have the people look dressed up to go
out"*. `bake_people.py` builds the people in `people.json` with MakeHuman (through MPFB2, its Blender
extension), dresses them, poses them and simplifies them into the crowd pack that
`public/newdesign/booth/crowdPeople.mjs` draws. The older crowd (Nora's VRM in three hair lengths,
`src/crowd-bake.mjs`, `crowdAvatars.mjs`) still loads from a v2 pack; `crowdPeople.loadCrowd` picks
the module by the pack's version.

## What it makes

| file | for | people | levels of detail (triangles) | atlas |
| --- | --- | --- | --- | --- |
| `crowd-people.bin.txt` + `.webp` | desktops (`NORA_MODEL.crowd`) | 12 | near ≈8,500 · far ≈1,400 · tiny ≈460 · seat ≈600 · seatNear ≈4,500 | 4096×3072 |
| `crowd-people-lo.bin.txt` + `.webp` | phones (`NORA_MODEL.crowdLow`) | 6 | near ≈4,300 · far ≈850 · tiny ≈320 · seat ≈420 · seatNear ≈2,300 | 1024×1536 |

`seatNear` is the seated pose at a near level's detail (hair cards, eyes and brows kept), for the side
rooms' guests, who sit a few metres from the camera (owner, 2026-10-26: *"make sure the people have
the updated graphics"*); the hall's booths keep `seat`. The bake is deterministic: the same inputs
give byte-identical figures and atlas.

Owner, 2026-10-26: *"the people look horrible"*. Up close they read as low-detail game characters, so
the close levels were rebuilt:
- **The face has its own tile**: the head's box of the skin texture, half the person's tile (512 px on
  desktops, 256 on phones), where it was a corner of the whole body's skin squeezed into one tile
  (≈100 px a face). The rest of the skin takes a quarter.
- **The head has its own triangles** at the close levels (`--head`, near 1,600 / seatNear 1,200 on
  desktops), not a share of what the clothes leave; the hair gets a fifth of the level (it was a
  tenth, and short hair decimated into a cap).
- **The brows are a part of their own** (`BROWS`): the shader cuts them at a higher alpha and draws
  them in the person's hair colour, where they were black marker strokes.
- **A stance each**: the torso turned a little, soft elbows and one forearm up for some, the weight on
  one leg with the other knee soft, the head turned and tilted; seated people turn to their
  neighbour.
- **Hands**: MakeHuman's rest hand is open with the fingers fanned ~34°, which read as a claw. The
  fingers are drawn toward the middle one and curl a little more each from index to little finger,
  the thumb in by the index. At the close levels the hands have their own triangles (12% of the
  level, taken from what the rest shares): simplified with the rest of the skin by area, a suit's
  hands had ~150 triangles each and the fingers thinned to spikes.

The pack (v3) is base64 text like the old one: a JSON header, then per person and level the
positions (int16 mm), normals (int8), a part tag, two arm weights and the atlas UVs (uint16), and the
indices. The header holds each person's height, shoulder pivots (the arm raise turns about them),
the mean colour of each recolourable garment, and the atlas's file name; the atlas is a WebP beside
the pack. Every seated figure is moved to put its thighs at one height (`SEAT_Y`), since the venue
lowers them all by one `seatY`.

What the bake does that matters, each measured on a render:
- **The skin under the clothes** is pulled under the fabric, or deleted where it is fully covered,
  with the nearest garment surface as the test: after simplification it poked through shirts in
  patches.
- **UV seams are cut before simplifying**, or the collapse joins two UV islands in one triangle and
  draws a smear of the atlas between them.
- **The head is simplified on its own budget** (`HEAD_SHARE`), so faces keep their shape. Blender's
  vertex-group weighting of the decimator stalled it at 7,000 triangles instead.
- **Hair and brows keep their alpha** (the shader alpha-tests them, both sides drawn); past the near
  level hair is solid, in its own mean colour. The eyes keep theirs too: the eyeball's outer shell is
  clear, and drawn opaque it painted the eyes black.

## One-time set-up

1. **Blender's Python module**, in a venv: `python3.11 -m venv mhvenv && mhvenv/bin/pip install bpy==4.2.0 pillow`.
2. **MPFB2** (MakeHuman for Blender, GPL): clone https://github.com/makehumancommunity/mpfb2 and
   install `src/mpfb` as an extension (`bpy.ops.extensions.package_install_files` on a zip of it, repo
   `user_default`); it then imports as `bl_ext.user_default.mpfb`.
3. **The MakeHuman asset packs**, all CC0, unzipped into MPFB's user data folder
   (`~/.config/blender/4.2/extensions/.user/user_default/mpfb/data`), from
   `https://files2.makehumancommunity.org/asset_packs/<pack>/<pack>_cc0.zip`:
   `makehuman_system_assets`, `skins01`, `hair01`, `shirts01`, `pants01`, `shoes01`, `dress01`,
   `suits01`, `suits05`, `skirts01`, `jewelry01`.

## Run

```bash
cd prototypes/nora-booth/crowd-mh
<venv>/bin/python bake_people.py -- --people people.json --out ../pub/crowd-people \
    --budget near=7500,far=1400,tiny=460,seat=600,seatNear=3600 --head near=1600,seatNear=1200
<venv>/bin/python bake_people.py -- --people people.json --out ../pub/crowd-people-lo \
    --only 0,2,3,5,6,8 --tile 512 --budget near=3800,far=850,tiny=320,seat=420,seatNear=1900 \
    --head near=800,seatNear=600
# the website and the app serve the same files
for d in ../../../public/nora ../../../mobile-app/public/nora; do
  cp ../pub/crowd-people*.bin.txt ../pub/crowd-people*.webp "$d"/; done
```

About 140 s for the desktop pack. `BAKE_DEBUG=1` prints each part's triangles before and after.
`src/people-test.mjs` lines every person up at every level (`?url=`, `&cam=front|close|side`,
`&raise=`, `&dress=0`); `tests/booth-crowdPeople.test.mjs` checks the committed packs.

## people.json

Each person: MakeHuman's macro sliders, a skin, brows, hair and clothes by asset name, and `bake`
colours multiplied into a garment's texture (a white tee baked black). `clothes` says which colour
slot each garment takes (`TOP`, `BOTTOM`, `SHOES`, `ACC`) and whether the crowd may recolour it per
person (`tint`: false for prints, suits and anything with a white shirt in it). `weight` makes a
person rarer (the suit is 0.6). Neighbours are never the same person (`crowdPeople.dressPeople`).
