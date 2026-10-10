# Club Shape from outside as a 3D model: what to build, and what happens after (2026-10-10)

The booth's opening shot flies in from the bay to Club Shape, as the Shape Sets background draws it, and cuts inside to Nora at the decks. The owner rejected the venue drawn in code (*"not good at all"*) and chose **a real 3D model** of it, built from the picture (2026-10-10). This file is the brief for whoever builds it: the owner in Blender or Unreal, an artist, or a bought model adapted to it. Everything after the hand-off happens in this repo.

**Until a model is set, the live booth does not fly in.** It opens inside the club as it always has. The code-built venue (`public/newdesign/booth/clubExterior.mjs`) stays as a stand-in for development only.

## 1. The reference

The picture is the whole brief: [`mobile-app/public/club-shape-bg.jpg`](../mobile-app/public/club-shape-bg.jpg) (1170 × 2532), the background of Shape Sets in the app. Match it, from the same high angle across the water:

- **The shell:** a huge, dark, ribbed shell over the back of the venue. Its free edge sweeps up high on the left of the picture, runs across the back, and comes down the right side to the front. Its inside faces the crowd: ribbed on the left, smooth dark cladding on the right.
- **The mouth:** a tall arched opening in the shell over the stage. Inside it, rows of white spots in the ceiling, a curtain of light beams falling to the stage, and the stage lit blue-white.
- **The ribbon:** one glowing ice-teal line traces the whole venue in one lopsided loop: along the shell's edge, round the front of the bowl, out round a bulge on the left, and in through an S-bend where the bowl meets the shell.
- **The bowl:** thousands of people on an open floor in front of the stage, ringed by stepped terraces with warm lights along their edges, behind a thick dark rim wall.
- **The grounds:** bronze walkways that flow round the venue in bands with lamp posts and people, dark palm gardens between them strung with small warm lights, a sea wall.
- **The water and the city:** black water on three sides with warm reflections, and across the bay a skyline of tall slender towers with gold windows. Sky above it, dark with a warm glow low down.

## 2. The frame, sizes and placement

The booth's camera path is built round these numbers, so the model must keep them. Build in **metres**, **+Y up**, and in the booth's own coordinates: the model's origin is the booth's origin, and nothing needs moving after export.

| What | Where |
|---|---|
| The bay and the camera's approach | toward **−Z** (the camera comes from −Z) |
| The city across the bay | toward **+Z**; its shore at about **z = +420** |
| The venue's centre | (0, 0, −10) |
| The footprint (outside the ribbon) | about x −62 … +70, z −59 … +48, the picture's lopsided loop. The bulge and S-bend are on **+X**, the picture's left as the camera sees it. |
| The bowl's rim wall | **6 m** high all round |
| The crowd floor | 0.3 m, out to about 70% of the footprint, then 6 terraces up to the rim |
| The stage | x −15 … +15, z +7.5 … +17.5, **2 m** high, facing −Z |
| The stage screen (LED wall) | 24 × 10.7 m, x −12 … +12, bottom at y 2.3, at **z = +18.5**, facing −Z |
| The lighting truss | y 17, z 8.5, 34 m long |
| The shell's mouth | an arch over the stage front, **about 27 m** at its top (z ≈ +1.5) |
| The shell's free edge | **about 34 m** at its highest, back left (near x +18, z +47) |
| The coast | about 40 m in front of the bowl (z ≈ −99 at x 0); the peninsula runs out to the west (−X) |

**Clearances the camera needs:** at least **10 m** of air between the shell and the stage, **4 m** over the screen and **3 m** over the truss. Nothing within **5 m** of the flight path below.

### The flight path

The camera's keyframes: the position, the point it looks at, and its vertical field of view (three.js `fov` is vertical). The path is a smooth curve through them over 12 bars, slowing as it comes down.

| # | Camera (x, y, z) | Looks at (x, y, z) | Vertical FOV |
|---|---|---|---|
| 1 | (−20, 215, −430) | (0, 8, 10) | 44° |
| 2 | (−32, 108, −200) | (6, 16, 28) | 46° |
| 3 | (−18, 68, −135) | (2, 6, 10) | 48° |
| 4 | (−5, 42, −92) | (0, 6, 5) | 50° |
| 5 | (0, 27, −62) | (0, 7, 10) | 52° |
| 6 | (0, 17, −38) | (0, 7, 15) | 52° |
| 7 | (0, 13, −22) | (0, 7, 15) | 48° |
| 8 | (0, 12, −14) | (0, 7, 15) | 46° |

Frame 1 should look like the picture: the venue across the middle of a portrait phone, the water below it, the city and sky above. The flight ends **12 m over the crowd, 20 m short of the stage**, looking into the mouth, and cuts to Nora inside.

**In Blender,** this draws the path and the look-at points, so you can fly a camera along it and check every frame (Scripting tab → New → paste → Run). Blender is Z-up, so the booth's (x, y, z) becomes Blender's (x, −z, y):

```python
import bpy
cams = [(-20,215,-430),(-32,108,-200),(-18,68,-135),(-5,42,-92),(0,27,-62),(0,17,-38),(0,13,-22),(0,12,-14)]
looks = [(0,8,10),(6,16,28),(2,6,10),(0,6,5),(0,7,10),(0,7,15),(0,7,15),(0,7,15)]
b = lambda p: (p[0], -p[2], p[1])
curve = bpy.data.curves.new('ArrivalPath', 'CURVE'); curve.dimensions = '3D'
spline = curve.splines.new('POLY'); spline.points.add(len(cams) - 1)
for i, p in enumerate(cams): spline.points[i].co = (*b(p), 1)
bpy.context.collection.objects.link(bpy.data.objects.new('ArrivalPath', curve))
for i, p in enumerate(looks):
    e = bpy.data.objects.new(f'LookAt_{i+1}', None); e.location = b(p); bpy.context.collection.objects.link(e)
```

**Where detail matters:** the end of the flight is close up on the crowd, the stage and the shell's mouth, so they carry the most. The far city is seen from 400 m and more: flat cards with window textures are enough.

## 3. What the booth needs from the file

`node scripts/club-shape-model/check-venue.mjs <file.glb>` checks every hard requirement below, exits 1 on any failure, and reports the rest.

- **One glTF 2.0 binary file (`.glb`).** No cameras, lights or animations; the booth ignores them.
- **Lighting baked into textures.** The booth has **no lights**: an ordinary lit material renders black. Give every material either
  - **unlit** (`KHR_materials_unlit`; the *Unlit* section of Blender's glTF manual shows the node setup its exporter writes it for; three.js reads it as a flat, light-free material), or
  - an **emissive** texture or colour carrying its whole look (base colour black).
- **Glow:** the parts that glow in the picture (the teal ribbon, lamps, the mouth's spots, the city's windows) need their emission **brighter than 1.0**, using `KHR_materials_emissive_strength`, so the booth's bloom lights them. Everything else stays at or under 1.
- **Named nodes** (exact names; the booth looks them up):
  - **`Ribbon`** (required): the teal line, on its own. The booth turns its glow up past the bloom threshold whatever the file says, and pulses it with the music.
  - **`StageScreen`** (required): a plain 24 × 10.7 m quad where the LED wall is, facing −Z. The booth paints the club's screen on it.
  - **`Water`** (optional): the water surface, with its reflections baked in. Without one, the booth lays a plain dark sea at y −2.4.
- **The sky:** leave it out. The booth draws the sky and the stars.
- **The phone budget** (the file every phone loads):
  - at most **250,000 triangles**
  - at most **12 MB**
  - textures **2048 px** or smaller on each side, as **WebP**, PNG or JPEG
  - at most **24 materials**
- **Compression:** meshopt (`EXT_meshopt_compression`) is welcome. **Not Draco or KTX2**: the booth does not ship their decoders. With [glTF-Transform](https://gltf-transform.dev):

  ```
  npx @gltf-transform/cli meshopt model.glb model-small.glb
  npx @gltf-transform/cli webp model-small.glb model-small.glb --slots "*"
  npx @gltf-transform/cli resize model-small.glb model-small.glb --width 2048 --height 2048
  ```

- **Optional, a desktop file:** up to 800,000 triangles, 40 MB and 4096 px textures. If there is one, the booth loads it on desktops and the phone file on phones.

## 4. Licence and hosting

**This repository is public.** Anything committed to it is published.

- **Built by the owner, or commissioned with the rights assigned to Shape:** it can be committed under `public/newdesign/booth/club-shape/`.
- **Bought from a model store:** read its licence. Most allow use in an app but **forbid redistributing the file**, and committing it here is redistributing it. Host it outside the repo, as Nora's model is (`scripts/nora-model/README.md`), and point the booth at its https URL.
- **Commissioning an artist:** this file is the brief. Ask for the source file (`.blend` or the Unreal project) along with the `.glb`, and for the rights assigned to Shape in writing.

## 5. What happens after

1. Run the checker on the file. Fix anything it rejects.
2. Preview it: the booth prototype (`prototypes/nora-booth/`) takes `?venue=<url-or-path-to.glb>`, with `&mode=arrival` to hold the shot.
3. Set `CLUB_SHAPE_MODEL.path` in `public/newdesign/booth/noraBoothState.mjs` to the file's site path or https URL, and its `desktop` path if there is a desktop file. From then on the booth opens on the fly-in, on the website and in the app.
4. Claude can take it from the file: compress it if it is over budget, check it, preview it, render the fly-in, and adjust the flight to the model if it needs it.
