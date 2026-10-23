# CAPs Rocks: Face Generator v1 spec (FROZEN once shipped)

Reference implementation: `faces_v1.js` (ES module, deps: `@noble/hashes` keccak; `@resvg/resvg-js` only for PNG). It is pure and deterministic, with no `Math.random`, no `Date`, and no locale. All geometry is integers in 0.1 mm units, and trig uses a frozen 257-entry Q14 quarter-sine table (1 turn = 1024 units). The **canonical output is the SVG string**. PNGs are rasterized from it.
Contract: CapsRocks `0x0fa575fd563517549e714acde968051a7310aadb` (Base). A wallet face is `(seed wallet = msg.sender, uint16 generatorVersion = 1, uint32 variant)`.

## 1. Seeds
All addresses are lowercased and used as 20 raw bytes.

| name | formula | controls |
|---|---|---|
| `A` identity | `keccak256(abi.encodePacked(address, uint16 version))` (22 bytes) | who you are: eyes, spacing, brows, nose, mouth shape, marks, crown, seer, line weight |
| `S` sigil | `keccak256(address 20 bytes)`, the Pen Plot v4 "Hashed" key (`sigilBytes(...)[0..31]`) | forehead sigil, the same glyph the Pen Plot v4 key plots |
| `V` variant | `keccak256(abi.encodePacked(address, uint16 version, uint32 variant))` (26 bytes, exactly the onchain tuple) | engraver drift (variant >= 7 only) |
| mood | `variant % 7` | expression |

The identity comes from the wallet alone (no variant input), so the same wallet is recognizably the same person across all its variants. `version` is in `A`, so v2 may redraw identities. Test: `A(0x…dEaD)=5d5b3cf1…99d4a86a8`, `V(0x…dEaD,1)=8ad05648…2155ee57ac`.

Weighted picks: walk the table and add weights. The first entry whose running sum is greater than the byte wins. Weights always sum to 256.

### Identity trait table (bytes of `A`)
| byte | trait | values (weight /256) |
|---|---|---|
| A[0] | eyes | Almond 48, Round 40, Slit 32, Hollow 32, Diamond 28, Crescent 28, Spiral 24, Twin 24 |
| A[1] % 3 | eye spacing (half, 0.1 mm face space) | 330 / 380 / 430 |
| A[2] % 3 | eye height | -90 / -60 / -30 |
| A[3] | brows | Straight 64, Arched 56, Angled 48, Heavy (double) 32, Split 32, None 24 |
| A[4] | nose | None 40, Line 72, Hook 56, Dots 48, Wedge 40 |
| A[5] % 3 | mouth half-width | 240 / 310 / 380 |
| (A[5] >> 2) % 3 | mouth height | 300 / 340 / 380 |
| A[6] | marks (lore) | None 96, Crack 48 (fracture line from the forehead), Scar 40 (3 slashes over one eye), Tally7 32 (seven strokes + slash on a cheek), Freckle Dots 40 (3 dots under each eye) |
| A[10] & 1 | mark side | 0 left, 1 right (the Sorrow tear uses the opposite eye) |
| A[7] < 37 | **Seven-dot crown** (14.5%, about 1 in 7): 7 laser dots in an arc, the diffraction cube's signature |  |
| A[8] < 8 | **Seer** third eye (3.1%, rare): a vesica eye on the forehead, with a pupil unless the mood is Void |  |
| A[11] | line weight | Fine 80 (1.9 mm), Standard 112 (2.3 mm), Bold 64 (2.7 mm) |

### Sigil (bytes of `S`, integer port of Pen Plot v4 `sigilFigure`)
`S[0]%4` gives the family: rose / lissajous / spirograph / star. Then:
- rose: n=[2,3,4,5,6,7,5,7][S2&7] and d=[1,1,1,2,1,2,1,3][(S2>>3)&7], reduced by gcd. The open heart is `inner‰ = 150 + trunc((S10>>4)*250/15)` and the phase is `(S3*128)>>8`.
- lissajous: the pair is [[1,2],[2,3],[3,4],[3,5],[4,5],[5,6],[1,3],[2,5]][S2&7], with phase `S3*2`.
- spirograph: q=[3,4,5,5,6,7,7,8][S2&7] and p=1+((S2>>3)%(q-1)), stepped up until coprime. It is a hypotrochoid if S10 is even, with `dd‰ = 500 + trunc(S3*1400*p/(255*q))`.
- star: n=[5..12][S2&7] and m=2+((S2>>3)%max(1,floor((n-1)/2)-1)), with rings = 2+S3%2 at scales 1000/580/336‰ and twist = trunc(512*(S10&3)/(2n)).
- Placement: radius 72 at (0,-375). For a Seer it is radius 58 at (0,-425). The v4 mirror/echo partner and the 7× cube repeat are **not** used on the face, because the 7 lives in the crown.

### Variant → mood (§2 Variant meaning)
`variant % 7`: 0 **Calm** (half-lid, soft smile), 1 **Based** (one brow raised, smirk with a flick), 2 **Fierce** (inner brows down, squint line, grimace with teeth), 3 **Sorrow** (inner brows up, pupils down, frown, two-dot tear), 4 **Joy** (^ ^ eyes, open D-mouth), 5 **Prophet** (closed eyes with 3 lashes, small "o", and 7 rays around the sigil), 6 **Void** (no pupils, no brows, flat mouth). Exact numbers are in the `MOOD` table in code.
- Variants 0–6 are the 7 canonical moods with zero drift. **Variant >= 7 gives the same mood plus "engraver drift"** (the hand of the machine) from `V`: eyes dx=`V0%41-20`, face dy=`V1%31-15`, brow tilt `V2%61-30`, mouth width `V3%61-30`, mouth curve `V4%61-30` (0.1 mm face units). So 7, 14, 21… are slightly different Calms, and so on. Any uint32 is valid. The UI should offer "mood picker (0–6)" plus "reroll" (variant += 7).
- Duplicates `(wallet,1,variant)` per rock are rejected onchain. The UI should grey out variants already present on that rock.

## 3. Style and texture
- Canon: a blank dusty-blue layer-zero face tablet with only a white inlay border. Every cut is a **white inlay line** that is flush, never a painted color or fill. The only fills are inlay dots (laser dwell spots).
- Tablet: avatar-foundry face tablet `ft = hd.w*0.86 × hd.w*0.86*0.74` at head scale 1 = **240.0 × 177.6 mm, landscape**. The border sits 11.0 mm in from the edge and is 5.5 mm wide, matching `body.mjs`. Corner chamfer is 6 mm.
- SVG viewBox is `0 0 2400 2400` (1 unit = 0.1 mm), with the tablet centered at (1200,1200). It occupies y 312–2088, which is **rows 133–891 of the 1024 px texture** (4.267 px/mm). Outside the tablet the texture is transparent in the albedo and black in the mask.
- Face space is scaled ×1.35 and shifted +6 mm down (`translate(0 60) scale(1.35)`). Safe area: |x| ≤ 100 mm and |y| ≤ 68.8 mm from center, which is inside the border's inner edge (106.4 × 72.4 mm). All v1 output stays inside it.
- Line widths on the tablet are 1.9 / 2.3 / 2.7 mm with round caps and joins. Border inlay is 5.5 mm. Dots are 2.4–3.2 mm. At 128 px thumbnails the lines are still at least 1 px.
- Colors: stone `#2f5596` → `#24467f` radial, inlay `#eef2f5`, groove shadow `#16305c` offset (0.5, 0.7) mm at 80% opacity, giving the carved-in look.
- Outputs per face: `albedo` (`renderSvg(addr,v)`) and `mask` (`renderSvg(addr,v,{mode:'mask'})`, white lines on black, 1024²).
- **GLB mapping (recommended):** keep the rock's existing stone material on the `face` mesh and use the **mask** as the inlay layer: `color = mix(stone, inlay #eef2f5, mask)`, `roughness = mix(0.85, 0.45, mask)`. Optional normal is derived from the mask as height (blur 2 px, groove depth 0.3 mm, Sobel → tangent normal, strength about 1.5). If you texture the face directly with the albedo, set UV v to cover rows 133–891 (`repeat.y = 0.74`, `offset.y = 0.13`) and u to 0–1 across the 240 mm width. Hide the separate `inlay` border bars or keep them, because the texture border sits at exactly the same place.

## 4. Example wallets (computed by `render_examples.mjs`, see `test_vectors.json`)
Units: 0.1 mm face space. `svgKeccak` = keccak256(UTF-8 of the albedo SVG string). It is the port check: your SVG string must match byte for byte. If your renderer differs, at least match `traits` and the mask hashes in `test_vectors.json`.

| wallet | v | mood | eyes | brows | nose | marks | crown | seer | weight | sigil | layout | svgKeccak |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `0x17Db8FaD0154c64bbc0D8154556291c11D16b9F7` | 0 | Calm | Diamond | Straight | Line | Freckle Dots (right) | yes | no | Standard | rose k=7 | eyeSp 330, eyeY -60, mouth 240@300 | `0xd200607e3e630afa5b400dc69557435df689ad0a72da0861132c8d68131fca23` |
| `0x17Db8FaD0154c64bbc0D8154556291c11D16b9F7` | 1 | Based | Diamond | Straight | Line | Freckle Dots (right) | yes | no | Standard | rose k=7 | eyeSp 330, eyeY -60, mouth 240@300 | `0x0b703475b4e1aeab1e8a33794cdac2250c760652d759006bae35f537fba3d144` |
| `0x17Db8FaD0154c64bbc0D8154556291c11D16b9F7` | 2 | Fierce | Diamond | Straight | Line | Freckle Dots (right) | yes | no | Standard | rose k=7 | eyeSp 330, eyeY -60, mouth 240@300 | `0x5f15f7678312877b0f1b0ee78fe273dd2f748985be0fbba8d2014e69b6275782` |
| `0x604b2e24df58ef019312b8367af763a7f156bf08` | 0 | Calm | Hollow | Straight | Line | None | no | no | Bold | star {10/2}x3 | eyeSp 430, eyeY -60, mouth 310@380 | `0x8a665ad2f5bcc977cb0cd567a16e77884d6cfe2858d0765ea243011279f21728` |
| `0x604b2e24df58ef019312b8367af763a7f156bf08` | 1 | Based | Hollow | Straight | Line | None | no | no | Bold | star {10/2}x3 | eyeSp 430, eyeY -60, mouth 310@380 | `0x89f1ade68fdd66c852f79449e7e2a58b33ae531d971b99c587140587358063fe` |
| `0x604b2e24df58ef019312b8367af763a7f156bf08` | 2 | Fierce | Hollow | Straight | Line | None | no | no | Bold | star {10/2}x3 | eyeSp 430, eyeY -60, mouth 310@380 | `0xe87641973bccf800330a1d3c67b14b33e10de1578eb40124482edbeec9fad5ba` |
| `0x000000000000000000000000000000000000dEaD` | 0 | Calm | Slit | None | Wedge | None | yes | no | Bold | hypotrochoid 1/3 | eyeSp 380, eyeY -90, mouth 310@340 | `0x7ae319622d2fb9ab85c9d967fc89a7a67f36b18f18e464f96cb3fe24fd490bd6` |
| `0x000000000000000000000000000000000000dEaD` | 1 | Based | Slit | None | Wedge | None | yes | no | Bold | hypotrochoid 1/3 | eyeSp 380, eyeY -90, mouth 310@340 | `0x9f7fae24df05c78dca19cf53800d53bd43aa184cd45f5e88ef0fb35fae6c8a88` |
| `0x000000000000000000000000000000000000dEaD` | 2 | Fierce | Slit | None | Wedge | None | yes | no | Bold | hypotrochoid 1/3 | eyeSp 380, eyeY -90, mouth 310@340 | `0x2aff0d0827e914af834aa459d0a25e6e4ce2d193bd2e714f13855ed8ce353445` |
| `0xC86166D9645cFFF31510670E85C7bb5b2296dC6A` | 0 | Calm | Almond | Split | Hook | None | no | no | Fine | hypotrochoid 1/5 | eyeSp 430, eyeY -90, mouth 240@300 | `0x1f171e1fc3967b3e3fd27fa127dc2febddf9c2af40abd5dcc5e25036fbd1d253` |
| `0xC86166D9645cFFF31510670E85C7bb5b2296dC6A` | 1 | Based | Almond | Split | Hook | None | no | no | Fine | hypotrochoid 1/5 | eyeSp 430, eyeY -90, mouth 240@300 | `0xbf6077c9b16fc26d73ae3803443cbb8f30e80a080e94b71c9ea06ed450c2a0a0` |
| `0xC86166D9645cFFF31510670E85C7bb5b2296dC6A` | 2 | Fierce | Almond | Split | Hook | None | no | no | Fine | hypotrochoid 1/5 | eyeSp 430, eyeY -90, mouth 240@300 | `0xf827348100beb4f4158b06b3bfd8a34fae61afbe5def0f8393d9a185cfb0bcf7` |

Renders: `examples/<addr8>_v<N>.png|.svg|_mask.png` (v0–2 for each wallet, plus v3–8 albedo for all moods and drift), `contact_sheet.png` (4 wallets × v0–2), `examples/all_moods_sheet.png` (4 × v0–8). Rebuild with `npm i && node render_examples.mjs && node render_examples.mjs all7 && node contact_sheet.mjs`.
Port notes: `trunc` division everywhere (`Math.trunc(a/b)`); `isin` index = `((a%1024)+1024)%1024`; path strings are `M x yLx y…`, `Q`, and the circle as two `a` arcs, with integers only. Stroke widths are written unscaled (14/17/20) inside the scale group, plus 6 for the groove.

## 5. Custom face maker (future, contentHash + ipfs uri, always paid)
- Accepts **SVG line art** (path/line/polyline/circle only, with no `<image>`, `<text>`, scripts, external refs, gradients or fills except dots of radius ≤ 4 mm). It also accepts a **1-bit PNG at exactly 1024×1024**, where the tablet region is rows 133–891 and anything outside is ignored.
- Normalization (deterministic): SVG → strip attributes → force `stroke=#eef2f5`, `fill=none`, width clamped to 1.5–3.0 mm, round caps → clip to the safe area → re-serialize with integer coordinates in the same 2400 viewBox → wrap in the standard tablet/border/groove template. PNG → threshold at 50% → keep only white pixels in the safe area → treat it as the mask, with no color retained ever.
- Limits: ≤ 64 KB normalized SVG, ≤ 2,000 path commands total, ≤ 200 dots; PNG ≤ 1 MB and ≤ 35% ink coverage. The pipeline rejects rather than silently crops if over limits.
- `contentHash = keccak256(normalized file bytes)` (the normalized SVG, or the 1-bit PNG re-encoded canonically). Pin that exact file to IPFS so the `uri` content hashes to `contentHash`.
- Moderation: faces are permanent, so the preview must render the normalized result. Add an off-chain check (text/symbol/NSFW screen and a hate-symbol list) before signing, and let the frontend/indexer hide flagged faces by contentHash. The chain can't be edited, so filter before mint.
