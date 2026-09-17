# Realonez #8 Studio — Offline Test App

Local Vite + React + TypeScript studio for **Realonez #8** (`waldo-8.glb`).  
**TEST MODE — no onchain actions.** No wallet connect, RPC, approvals, or live mint.

## Quick start

```bash
cd realonez-8-studio-app
npm install
npm run dev
```

Open the printed local URL (default `http://127.0.0.1:5173`).

### Production build

```bash
npm run build
npm run preview
```

Or serve `dist/` with any static server:

```bash
npx --yes serve dist -l 4173
```

**Do not open `dist/index.html` via `file://`** — asset loading may fail. Use a local static server.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server |
| `npm run build` | Typecheck + production build → `dist/` |
| `npm run preview` | Preview `dist/` |
| `npm run typecheck` | `tsc -b` only |
| `npm test` | Vitest unit tests |

## App structure

```
public/assets/models/     waldo-8.glb + waldo-8.fbx (real bytes)
public/assets/textures/   frames/ hair/ skin/ swatches
src/components/           Viewer, traits, transforms, downloads
src/config/               mesh groups, lenses, contracts, swatches
src/services/             mock NFT, exporters, disabled onchain interface
src/hooks/                studio state
```

## Mesh mapping (10 nodes → 3 transform groups)

Original GLB names use spaces (`real onez #8 body`). Three.js `GLTFLoader` sanitizes them to underscores at runtime (`real_onez_#8_body`). The app matches the **runtime** names.

| Group | Runtime meshes |
|-------|----------------|
| **Body Stack** | body, eyemouthshoe, nose_ear_neck, head, hat, hatlogo, stripes |
| **Glasses** | glasses + lenses (always locked together) |
| **Hair** | hair |

## Traits (4 editable)

1. **Frames** — cropped texture swatches from Cap uploads  
2. **Lenses** — 10 procedural translucent greens (dark → neon)  
3. **Skin** — color selector applied to **head + nose/ear/neck** together  
4. **Hair** — cropped texture swatches  

No background trait. Hat / logo / stripes / eyes-mouth-feet stay default.

## Simulated ownership / recovery

- Mock wallet owns token **#8** on contract `0xaf5B502551DBd2DdBDb4aF8BC4CE10C473ddB5AB`
- Status: **Owned (simulated)**
- **Recover files from NFT metadata** parses local mock metadata and triggers browser downloads
- Source **GLB** / **FBX** downloads use the real bundled files
- Exports: edited **GLB**, **OBJ**, **STL**, plus **Metadata JSON**
- **Original FBX** only (no fake edited `.fbx`)

## Export limitations

- STL/OBJ/GLB exporters use Three.js exporters against the current scene graph (transforms applied on the three groups). Materials/textures may be partially represented depending on exporter support.
- FBX edit export is **not** implemented; UI labels it **Original FBX**.
- Opening via `file://` is unsupported.

## Onchain boundary (future)

Collapsed **Enable live onchain later** section lists placeholders only:

- NFT: `0xaf5B502551DBd2DdBDb4aF8BC4CE10C473ddB5AB`
- FORLZ: `0x02c1d787521C20586b4aB070b1838D91FF85D656`

`src/services/onchainPlaceholder.ts` exposes a modular interface with `enabled: false`.

## Texture notes

See `public/assets/textures/SWATCH-REPORT.json` and `TESTING.md` for crop counts and skin-folder exclusions.

## Package

Distributed as `realonez-8-studio-test-v1.tar.gz` (source + `dist`, without `node_modules`).
