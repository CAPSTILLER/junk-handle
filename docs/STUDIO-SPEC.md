# Realonez #8 Studio — interaction spec (2026-09-17)

## Contracts
- FORLZ token: `0x02c1d787521C20586b4aB070b1838D91FF85D656`
- Realonez NFT: `0xaf5B502551DBd2DdBDb4aF8BC4CE10C473ddB5AB`

## Source meshes (GLB `waldo-8.glb` — 10 nodes)
| Mesh name | Role |
|-----------|------|
| real onez #8 body | body / arms / hands |
| real onez #8 eyemouthshoe | eyes / mouth / feet |
| real onez #8 nose ear neck | neck / nose / ears |
| real onez #8 head | head |
| real onez #8 hat | hat |
| real onez #8 hatlogo | hat logo |
| real onez #8 stripes | shirt stripes |
| real onez #8 glasses | frames |
| real onez #8 lenses | lenses (alpha BLEND green) |
| real onez #8 hair | hair |

## Transform groups (3 only)
1. **Body stack (locked)** — one transform for: body, eyemouthshoe, nose/ear/neck, head, hat, hatlogo, stripes
2. **Glasses** — frames + lenses parented; lenses always attached to rims
3. **Hair** — independent transform

## Trait / material edits
- Frames: Cap texture maps (~10)
- Lenses: 10 procedural translucent greens (dark → neon); not free-move separate from frames
- Skin: shared material on **head + nose/ear/neck** (keep matched)
- Hair: Cap texture maps
- No background trait
- Hat / logo / stripes / eyes-mouth-feet: stay default look unless Cap adds later

## Exports
STL / FBX / OBJ / GLB + NFT metadata; owned-mint via Realonez + FORLZ fee (details TBD)
