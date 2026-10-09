# Nora as a MetaHuman: what the owner does, and what happens after (2026-10-09)

The owner picked **MetaHuman** for a realistic Nora (2026-10-09: *"go with metahuman"*, then *"go ahead with metahuman"*). This file covers the steps that have to happen on a desktop with Unreal Engine, then what happens once the file arrives. Everything after the hand-off happens in this repo's tooling and needs no Unreal.

**Why the steps are split:** Unreal Engine and MetaHuman Creator only run on a desktop with a real graphics card. Claude's container has neither, so it cannot create or export a MetaHuman. It can do the rest: cut the export down to phone size, turn it into the booth's model format, test it, and ship it.

## 1. Before you start

- **Read the licence:** https://www.metahuman.com/license (the Unreal Engine EULA governs it).
  - What it said when this was written: MetaHumans may be used in other engines and in interactive apps, royalty-free.
  - Above **$1M a year** in gross revenue, rendering MetaHumans outside Unreal needs an Unreal Engine seat licence.
  - MetaHumans may not be used to train AI. Voicing Nora with a TTS voice is not training.
  - Claude could only read the licence through search results, not the page itself, so check it.
- **The character is not exclusive.** Epic's base assets underlie every MetaHuman, so Nora cannot be registered as a unique trademarked design. Only a commissioned model with an IP assignment gives that.

## 2. What you need

- **A Windows PC** that can run Unreal Engine 5.7: a recent gaming-class graphics card and plenty of disk space. Epic lists the exact requirements.
- **An Epic Games account**, with the Epic Games Launcher installed.
- **Unreal Engine 5.7 or later** from the Launcher, with the MetaHuman plugins enabled in your project (MetaHuman Creator / MetaHuman Character).
  - The owner's PC has **5.8**. MetaHuman Creator is built into Unreal since 5.6, so Nora can be created in 5.8.
  - The export pipeline was written and tested on **5.7**. In its `_config/pipeline.yaml`, point the `"5.7"` block at the 5.8 project and editor. If a stage fails on 5.8, install 5.7 alongside (Launcher → Library → **+** by Engine Versions) and export from that.
  - Keep the project **outside OneDrive** (for example `C:\UnrealProjects\NoraMH`): an Unreal project is gigabytes of files OneDrive would try to sync.
- **Blender 5.x** (blender.org), Python 3 and Git.
- **The export pipeline:** https://github.com/smorchj/metahuman-to-glb (MIT licence, by creategamecharacters.com).
  - It is third-party code that runs on your machine, so skim it first.
  - It exports a UE 5.7 MetaHuman to a single GLB file with the 51 ARKit face shapes the booth needs.
  - Its live demo, https://creategamecharacters.github.io/metahuman-to-glb/, shows what its MetaHumans look like in a browser.
- **Optional:** Claude Code on that PC. The pipeline is written to be run by Claude Code (step 4).

## 3. Create Nora

1. In Unreal Engine 5.7, create a project. Make a MetaHuman Character asset at **`/Game/Nora/MHC_Nora`**.
2. Design her to match the concierge likeness in `public/nora-avatar.png`:
   - **Face:** a woman around 30, light-to-medium skin with a warm undertone, brown eyes, full defined dark brows, a soft natural smile.
   - **Hair:** dark brown and long. For the booth, **tie it back** (a low ponytail or bun) or choose a shoulder-length style, so it clears the headphones and the decks. Choose a **card-based groom**, not strands; only cards export.
   - **Wardrobe:** dark and plain, matching the booth: a black or charcoal fitted tee or top and dark trousers. Avoid logos and text.
   - **Height:** about 1.70 m.
3. Save the asset. Your Epic login must be signed in to the editor, because the first export step asks Epic's cloud to rig her.

## 4. Export her

1. Clone https://github.com/smorchj/metahuman-to-glb.
2. Copy `_config/pipeline.example.yaml` to `_config/pipeline.yaml`. Fill in your `.uproject` path, `UnrealEditor-Cmd.exe` and `blender.exe`.
3. **Close the Unreal editor.** The pipeline opens the project itself.
4. Run the stages:
   - **With Claude Code:** open the repo and say `export /Game/Nora/MHC_Nora`.
   - **Or by hand,** from the repo root in PowerShell:
     ```
     python 5.7/native-glb/tools/bootstrap_character.py --asset /Game/Nora/MHC_Nora
     ./5.7/native-glb/stages/00-unreal-assemble/tools/run_assemble.ps1 -Char nora
     ./5.7/native-glb/stages/01-unreal-glb-export/tools/run_export.ps1   -Char nora
     ./5.7/native-glb/stages/02-blender-assemble/tools/run_assemble.ps1  -Char nora
     ./5.7/native-glb/stages/03-export-to-glb/tools/run_export.ps1       -Char nora
     ./5.7/native-glb/stages/04-webview-build/tools/run_site.ps1         -Char nora
     ```
     The bootstrap prints the id it chose (`[bootstrap] char_id: …`); use that in place of `nora` if it differs.
   - ⚠ **Run stage 04 too.** Its folder carries files the GLB does not have. The hair, eyebrow and eyelash textures in the GLB have no transparency: it comes from separate coverage textures (`textures/*_CardsAtlas_Attribute.png`, `*_Coverage.png`), and `mh_materials.json` says which goes where. Measured on a sample export: without them, the eyebrows render as solid black blocks.
5. Find the outputs:
   - **The whole folder** `docs/characters/nora/` (in the pipeline repo; the sample was under `docs/5.7/characters/<id>/`). It holds `nora.glb` (about 40–80 MB), a `textures/` folder and `mh_materials.json`.
   - `5.7/native-glb/characters/nora/source/reference.png`, Unreal's own headshot of her. Claude compares its renders against this.

## 5. Send the files

1. Zip the `docs/characters/nora/` folder, and put the zip and **`reference.png`** in a **private Google Drive folder**.
2. Tell Claude the file names. Claude reads them through the Google Drive connector.
3. **Do not commit them to GitHub.** This repository is public, and the source asset does not belong in it.

## 6. What happens next (no Unreal needed)

Claude runs the conversion in `scripts/nora-model/`. A sample export from the pipeline, used only to develop the converter, measured **168k triangles, 875 bones, 13 materials and 41.5 MB**. The converter cuts her to about 80k triangles, and the check after it rejects anything over 90k (`maps.json`). That is above the 50k the 2026-09-29 review asked of a commissioned model: a MetaHuman's face alone is 64k at full detail. The conversion:

1. Decodes the GLB and merges the face, body and outfit skeletons into one.
2. Drops the face-rig bones: the face moves through its 51 ARKit shapes instead.
3. Cuts the triangles, keeping the face shapes.
4. Shrinks the textures.
5. Maps the skeleton to the booth's format (VRM 1.0), and the ARKit shapes to the booth's expressions: blink, and the visemes for when she talks.
6. Validates the result against the booth's needs and renders it beside `reference.png`.

Then Nora is swapped in behind the same booth on the app and the website:
- The full-face close-up comes back into the camera rotation (`NORA_MODEL.portrait`).
- The crowd is re-baked from her.
- The placeholder stays as the fallback.

The model is hosted outside the public repo.
