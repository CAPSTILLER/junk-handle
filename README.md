# My Wally Studio (formerly Realonez #8 Studio)

Local Vite + React + TypeScript studio for **Realonez #8** (`waldo-8.glb`).  
Live on **Base mainnet**: mint and revise **My Wally (MY8)** NFTs with $FRLZ; owner-only downloads. See [My Wally onchain](#my-wally-onchain-base).

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

## Texture notes

See `public/assets/textures/SWATCH-REPORT.json` and `TESTING.md` for crop counts and skin-folder exclusions.

## Package

Distributed as `realonez-8-studio-test-v1.tar.gz` (source + `dist`, without `node_modules`).

## My Wally onchain (Base)

| | |
|---|---|
| Contract | `0x187a4f47bed10a12d2c12b15457884bfbbecc1ed` (My Wally / MY8, chain 8453, unverified source; ABI reconstructed in `shared/my8.ts`) |
| $FRLZ | `0x02c1d787521C20586b4aB070b1838D91FF85D656` (18 decimals) |
| EIP-712 domain | name `My Wally Studio`, version `1`, chainId 8453, verifyingContract = contract |
| MintVoucher | `MintVoucher(address user,bytes32 traitsHash,uint256 frlzAmount,uint256 validUntil,bytes32 nonce)` |
| UpdateVoucher | `UpdateVoucher(address user,uint256 tokenId,bytes32 traitsHash,uint256 frlzAmount,uint256 validUntil,bytes32 nonce)` |

`mint(bytes traits, MintVoucher v)` pulls `frlzAmount` FRLZ to the treasury; `updateModel(tokenId, traits, UpdateVoucher v)` burns it to `0x…dEaD`.
The contract only enforces `frlzAmount > 0`, `msg.sender == v.user`, unexpired, unused nonce, `traitsHash == keccak256(traits)` and the oracle signature,
so **fees are chosen by the server and pegged to USD**: `MINT_FEE_USD = 5.00` and `UPDATE_FEE_USD = 0.25` (revision) in `shared/my8.ts`.

**Pricing:** at voucher time the server reads the main FRLZ pool onchain (Uniswap V2 FRLZ/WETH `0x37FA5b0a…d657` reserves) × Chainlink ETH/USD on Base
(`0x71041ddd…Bb70`), and cross-checks against the DexScreener public API (used alone only if the onchain read fails). If both fail, or they differ by
more than 20%, or the price is out of sane bounds / the Chainlink feed is stale, the server refuses to sign with a clear error. The FRLZ amount is
`USD / price` rounded **up** to 3 significant figures (whole FRLZ), cached ~45 s, and signed into the voucher (valid 15 min).
`GET /api/quote` returns the current amounts. The app locks a voucher first and approves **exactly** its `frlzAmount`; if the voucher expires
before submitting, it fetches a new one and re-approves only when the allowance is short.

### Traits encoding (v1)

`traits` = 4 bytes: `[0x01 version][hair][skin][frame]`. Each slot is `0` = studio default (no texture) or `1..10` = the swatch index in
`HAIR_SWATCHES` / `SKIN_SWATCHES` / `FRAME_SWATCHES` order (mirrored in `shared/my8.ts`; a unit test keeps them in sync).
Example: hair 03-weave, skin 05-wrinkle, frame 07-silk → `0x01030507`. Anything else (other length, version, index > 10) is rejected.
Names, lenses and transforms are not stored onchain.

### Serverless API (`api/`, Vercel Node functions, viem)

| Route | Purpose |
|---|---|
| `GET /api/status` | paused, oracleSigner, whether the server key is set and matches |
| `GET /api/quote` | live FRLZ price + FRLZ amounts / USD values for mint ($5.00) and revision ($0.25) |
| `POST /api/voucher/mint` `{address, traits}` | strict traits validation → signed MintVoucher (15 min) |
| `POST /api/voucher/update` `{address, tokenId, traits}` | also requires `ownerOf(tokenId) == address` |
| `GET /api/metadata/:tokenId` | ERC-721 JSON from onchain `getTraits` (simple SVG image) |
| `POST /api/download/verify` | free signed message (token, owner, domain, timestamp) → checks signature + `ownerOf` → returns onchain traits + short-lived oracle-signed grant |

Before signing, the server checks that the key's address equals the contract's `oracleSigner()`; otherwise it returns a clear error.

**Env (Vercel → Settings → Environment Variables, mark Sensitive):** `VOUCHER_SIGNER_KEY` = private key of the oracle signer
`0x6FbB286363f028B0E82b5A50DE9320aB6CF73357`. Server-only (no `VITE_` prefix). Optional `BASE_RPC_URL` (defaults to public Base RPCs).

**Production domain:** https://mywally.gearup.wtf

**baseURI** (set from the owner wallet via the hidden page **https://mywally.gearup.wtf/owner** → “Set metadata address”, which calls `setBaseURI(string)`): `https://mywally.gearup.wtf/api/metadata/` → `tokenURI(n)` = `https://mywally.gearup.wtf/api/metadata/n`.

### App flow

Connect injected wallet → auto switch/add Base → FRLZ balance vs “Mint cost: N FRLZ (about $5.00)” → **Approve** (locks a voucher, approves exactly its amount) → **Mint** (`mint`) → token id + BaseScan link.
Owned tokens: **Load** traits into the studio, **Save revision** (“Revision cost: N FRLZ (about $0.25)”, lock voucher → approve exact → `updateModel`), **Unlock downloads**
(free signature). Download buttons are enabled only for a verified owner while the studio shows that token's onchain hair/skin/frame; everyone can still play.

### Wallets & sending

- **Wallet picker:** installed wallets are discovered via **EIP-6963** (name + icon; Coinbase extension = `com.coinbase.wallet`), with fallbacks to
  `window.coinbaseWalletExtension` and `window.ethereum.providers[]`, plus a lazy-loaded **Coinbase Wallet (SDK)** option (no API key).
  The chosen provider is used for everything (connect, chain switch, accounts, signing, sending) and remembered in this browser.
- **Before each send:** explicit `wallet_switchEthereumChain` to 0x2105 on the chosen provider, then `eth_accounts`; `from` is the wallet's account string exactly.
- **Send mode** (per browser, “Wallet stuck?” toggle): **Pre-filled** (default) = gas (+30%), EIP-1559 fees, chainId, value 0 (nonce optional, off);
  **Simple** = only `{from, to, data, value}`. On `/owner` the tx is pre-built before the click so the wallet request fires immediately.
