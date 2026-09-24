# Testing checklist — Realonez #8 Studio (offline)

## Environment

- [ ] `npm install && npm run build` succeeds
- [ ] `npm test` passes
- [ ] Serve via `npm run preview` or static server (not `file://`)

## Viewer

- [ ] Model loads (`waldo-8.glb`)
- [ ] Transparent/neutral canvas (no background trait)
- [ ] Touch + mouse orbit with damping
- [ ] Mobile layout: viewer on top, controls scroll below

## Groups

- [ ] Exactly three selectors: Body Stack, Glasses, Hair
- [ ] Body Stack moves body + eyemouthshoe + nose/ear/neck + head + hat + hatlogo + stripes together
- [ ] Glasses moves frames + lenses together — lenses never drift off rims
- [ ] Hair moves independently
- [ ] Orbit vs Edit modes do not fight (orbit disables while dragging gizmo)
- [ ] Reset group / reset all restores identity transforms
- [ ] Scale cannot explode to 0 (min ~0.05)

## Traits

- [ ] Frames: Default + texture swatches apply to glasses mesh
- [ ] Lenses: exactly 10 green translucent shades; stay on glasses group
- [ ] Skin: choosing a texture updates **both** head and nose/ear/neck
- [ ] Hair: Default + texture swatches
- [ ] Other meshes keep default look

## NFT / downloads

- [ ] Banner shows `TEST MODE — no onchain actions`
- [ ] Owned card: token #8, contract `0xaf5B502551DBd2DdBDb4aF8BC4CE10C473ddB5AB`, status Owned (simulated)
- [ ] Source GLB download size matches bundled file (~345KB)
- [ ] Original FBX download size matches bundled file (~140KB)
- [ ] Edited GLB / OBJ / STL download
- [ ] Metadata JSON includes traits, transforms, testMode, contracts
- [ ] Recover from metadata triggers downloads from local catalog

## Onchain boundary

- [ ] No wallet connect UI active
- [ ] `Enable live onchain later` is collapsed and describes placeholders only
- [ ] No network calls to RPC / NFT APIs at runtime (only local asset fetches)

## Swatch counts (this build)

| Trait | Usable swatches | Notes |
|-------|-----------------|-------|
| Frames | 10 | Cap purple/magenta frame materials (2026-09-24) |
| Hair | 10 | Cap brown texture uploads (2026-09-24) |
| Skin | 10 | Cap material texture uploads (2026-09-24) |
| Lenses | 10 procedural | Not image textures |

Historical note: older `textures/skin/raw/` sheets remain listed under `excluded` in `SWATCH-REPORT.json`; live skin swatches are Cap’s 10 material textures.


## Automated checks run in this package build

- `npm run typecheck` — pass
- `npm test` — 11/11 pass (mesh partition, lens count, mock metadata, onchain disabled)
- `npm run build` — pass (`dist/` included)
- Asset HTTP smoke on preview: GLB 353384 bytes and FBX 143340 bytes match source (`cmp`)
- Node + Three.js `GLTFLoader` smoke: 10 sanitized mesh names found; Body=7 / Glasses=2 / Hair=1; lenses share glasses parent and retain relative lock after group translate; head+neck skin color sync
- Headless Chrome UI smoke: banner, owned card (#8 / contract / Owned simulated), three group chips, canvas present, mobile single-column layout
- Headless WebGL context unavailable in this sandbox (swiftshader bind failure) — visual pixel render not verified here; Cap should confirm in a normal browser

## Name sanitization

GLB stores `"real onez #8 …"`; runtime Three.js names are `"real_onez_#8_…"`. App config uses runtime names.
