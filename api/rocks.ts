/**
 * CAPs Rocks API: ONE Vercel function (Hobby plan function limit). vercel.json rewrites
 * /api/rocks/:path* -> /api/rocks?route=:path*
 *   GET  metadata/:id        ERC-721 metadata (contract baseURI points here)
 *   GET  poster/:id(.svg)    poster card image
 *   GET  preview?id=|seed=   PUBLIC preview: decimated, untextured, unrigged clay GLB (never the full asset)
 *   GET  quote?id=&payer=&kind=wallet|custom   face price (Free for own-seed wallet face) + signed EIP-712 quote
 *   GET  status              what is configured (no secrets)
 *   POST pin                 validate + canonicalize + pin pose JSON to IPFS (PINATA_JWT, server only)
 *   POST download            holder signature -> 2-minute file links
 *   GET  file?t=             holder-only GLB/STL stream (ownerOf rechecked), generated on demand
 */
import { getAddress, isAddress, type Address } from 'viem'
import { CAPS_ROCKS } from '../shared/capsRocks.js'
import { canonicalPose, normalizePose, POSE_MAX_BYTES } from '../shared/rocksPose.js'
import { SITE_URL } from '../shared/my8.js'
import { HttpError, body, client, handle, parseTokenId, requestHost, type Req, type Res } from './_lib/server.js'
import { putRaw, storageConfigured } from './_lib/store.js'
import { activeRigPose, readRock, rockOwner, posePath, rocks, sha256Hex } from './_rocks/chain.js'
import { readFileToken, streamBytes, verifyDownload } from './_rocks/files.js'
import { PinError, pinataJwt, pinataUpload } from './_rocks/pinata.js'
import { makeQuote, quoteSignerDiag, quoteStatus } from './_rocks/quote.js'
import { assetKeyConfigured } from './_rocks/assets.mjs'
import { renderRock, rockTraits } from './_rocks/render.mjs'

const short = (a: string) => a.slice(0, 6) + '…' + a.slice(-4)
const q1 = (v: unknown) => (Array.isArray(v) ? v[0] : v) as string | undefined
const origin = (req: Req) => {
  const h = requestHost(req)
  return h && !h.startsWith('localhost') && !h.startsWith('127.') ? `https://${h}` : SITE_URL
}
function needAssets() {
  if (!assetKeyConfigured()) throw new HttpError(503, 'Rock models are not configured on this server yet (ROCKS_ASSET_KEY missing).', 'asset_key_missing')
}

// ------------------------------------------------------------------ rate limit (per instance, best effort)
const hits = new Map<string, number[]>()
function rateLimit(req: Req, key: string, max: number, windowMs: number) {
  const ip = String(q1(req.headers['x-forwarded-for']) ?? 'local').split(',')[0].trim()
  const k = key + ':' + ip, now = Date.now()
  const arr = (hits.get(k) ?? []).filter((t) => now - t < windowMs)
  if (arr.length >= max) throw new HttpError(429, 'Too many requests, slow down a little.', 'rate_limited')
  arr.push(now); hits.set(k, arr)
}

// ------------------------------------------------------------------ metadata + poster
function faceLabel(f: { kind: number; seed: string; generatorVersion: number; variant: number; uri: string }) {
  return f.kind === 0 ? `Wallet · ${short(getAddress(f.seed))} · g${f.generatorVersion} · v${f.variant}` : `Custom · ${f.uri}`
}

async function metadata(req: Req) {
  const id = parseTokenId(q1(req.query.id))
  const { view, activeFace, activePose } = await readRock(id)
  const a = view.avatar
  const [{ traits }, pose] = await Promise.all([
    assetKeyConfigured() ? rockTraits(a.seed) : Promise.resolve({ traits: {} as Record<string, string | number> }),
    activeRigPose(id, activePose as never),
  ])
  const o = origin(req)
  const face = activeFace[0] ? faceLabel(activeFace[2]) : 'Blank'
  return {
    name: `CAPs Rock #${id}`,
    description: `Forged from Prophecy Tablet #${a.tabletTokenId} by ${short(getAddress(a.seed))}. Crushed Prophecy stone, seeded by its forger's wallet.`,
    image: `${o}/api/rocks/poster/${id}.svg`,
    animation_url: `${o}/rocks/embed/${id}`,
    external_url: `${o}/rocks/view?id=${id}`,
    attributes: [
      { trait_type: 'Seed Wallet', value: a.seed.toLowerCase() },
      { trait_type: 'Burned Tablet', display_type: 'number', value: Number(a.tabletTokenId) },
      { trait_type: 'Prophecy', display_type: 'number', value: Number(a.prophecyId) },
      { trait_type: 'Generator', value: `tablet v${a.generatorVersion}` },
      { trait_type: 'Faces Saved', display_type: 'number', value: Number(view.faceCount) },
      { trait_type: 'Active Face', value: face },
      { trait_type: 'Active Face Type', value: activeFace[0] ? (activeFace[2].kind === 0 ? 'Wallet' : 'Custom') : 'Blank' },
      { trait_type: 'Poses Saved', display_type: 'number', value: Number(view.poseCount) },
      { trait_type: 'Active Pose', value: pose.name },
      { trait_type: 'Forged', display_type: 'date', value: Number(a.forgedAt) },
      ...Object.entries(traits).map(([trait_type, value]) => ({ trait_type, value })),
    ],
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
async function poster(req: Req, res: Res) {
  const id = parseTokenId(String(q1(req.query.id) ?? '').replace(/\.(svg|png)$/, ''))
  const { view } = await readRock(id)
  const seed = getAddress(view.avatar.seed)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">
<defs><radialGradient id="g1" cx="20%" cy="-10%" r="90%"><stop offset="0" stop-color="#1e3a8a" stop-opacity=".55"/><stop offset="1" stop-color="#07090f" stop-opacity="0"/></radialGradient>
<radialGradient id="g2" cx="100%" cy="0%" r="70%"><stop offset="0" stop-color="#0ea5e9" stop-opacity=".2"/><stop offset="1" stop-color="#07090f" stop-opacity="0"/></radialGradient>
<linearGradient id="st" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b6b8c"/><stop offset="1" stop-color="#2a3550"/></linearGradient></defs>
<rect width="1000" height="1000" fill="#07090f"/><rect width="1000" height="1000" fill="url(#g1)"/><rect width="1000" height="1000" fill="url(#g2)"/>
<g stroke="#93c5fd" stroke-opacity=".35" stroke-width="3" fill="url(#st)">
<polygon points="430,170 570,170 590,300 410,300"/><rect x="452" y="200" width="96" height="70" rx="6" fill="#dbeafe" stroke="#1e3a8a" stroke-width="8"/>
<polygon points="380,320 620,320 650,560 350,560"/><polygon points="300,330 370,330 350,520 290,500"/><polygon points="630,330 700,330 710,500 650,520"/>
<polygon points="390,580 490,580 480,820 400,820"/><polygon points="510,580 610,580 600,820 520,820"/></g>
<text x="500" y="900" text-anchor="middle" font-family="ui-sans-serif,system-ui,Segoe UI,Roboto,sans-serif" font-size="56" font-weight="800" fill="#e8eefc" letter-spacing="2">CAPs ROCK #${id}</text>
<text x="500" y="950" text-anchor="middle" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="26" fill="#93c5fd" letter-spacing="4">SEED ${esc(short(seed)).toUpperCase()} · TABLET #${view.avatar.tabletTokenId}</text>
<text x="500" y="80" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="24" fill="#8b9bb8" letter-spacing="8">CAPs MIND · VAULT PROPHECIES</text></svg>`
  res.setHeader('Content-Type', 'image/svg+xml')
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600, stale-while-revalidate=86400')
  res.status(200).send(svg)
}

// ------------------------------------------------------------------ public preview
async function preview(req: Req, res: Res) {
  needAssets()
  rateLimit(req, 'preview', 30, 60_000)
  let seed: Address, pose = null, cache = 'public, max-age=86400, s-maxage=604800, immutable'
  const idq = q1(req.query.id), seedq = q1(req.query.seed)
  if (idq !== undefined) {
    const id = parseTokenId(idq)
    const { view, activePose } = await readRock(id)
    seed = getAddress(view.avatar.seed)
    pose = (await activeRigPose(id, activePose as never)).pose
    cache = 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600'
  } else if (seedq && isAddress(seedq, { strict: false })) {
    seed = getAddress(seedq)
  } else throw new HttpError(400, 'Pass ?id= or ?seed=', 'bad_request')
  const out = await renderRock(seed, { kind: 'preview', pose })
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', out.contentType)
  res.setHeader('Content-Length', String(out.bytes.length))
  res.setHeader('Cache-Control', cache)
  res.setHeader('X-Rocks-Preview', 'decimated-untextured-unrigged')
  res.status(200).send(out.bytes)
}

// ------------------------------------------------------------------ quote
async function quote(req: Req) {
  const id = parseTokenId(q1(req.query.id))
  const payer = q1(req.query.payer)
  if (!payer || !isAddress(payer, { strict: false })) throw new HttpError(400, 'Invalid payer', 'bad_address')
  const kind = q1(req.query.kind) === 'custom' ? 1 : 0
  rateLimit(req, 'quote', 30, 60_000)
  return makeQuote(id, getAddress(payer), kind)
}

// ------------------------------------------------------------------ pin pose JSON
async function pin(req: Req) {
  rateLimit(req, 'pin', 12, 10 * 60_000)
  const b = body(req)
  const id = parseTokenId(b.tokenId)
  if (typeof b.address !== 'string' || !isAddress(b.address, { strict: false })) throw new HttpError(400, 'Invalid address', 'bad_address')
  const holder = await rockOwner(id)
  if (!holder) throw new HttpError(404, `CAPs Rock #${id} does not exist`, 'not_found')
  if (holder !== getAddress(b.address)) throw new HttpError(403, 'Only the current holder can save poses (savePose is owner-only onchain too).', 'not_owner')
  let pose
  try { pose = normalizePose(b.pose) } catch (e) { throw new HttpError(400, (e as Error).message, 'bad_pose') }
  const canonical = canonicalPose(pose)
  if (Buffer.byteLength(canonical) > POSE_MAX_BYTES) throw new HttpError(413, 'Pose JSON is larger than 16 KB', 'too_large')
  const poseHash = sha256Hex(canonical)
  if (!pinataJwt()) throw new HttpError(503, 'Pose pinning is not configured yet (PINATA_JWT missing).', 'pin_missing')
  let IpfsHash: string
  try {
    IpfsHash = (await pinataUpload(canonical, `caps-rock-${id}-pose.json`, `caps-rock-${id}-pose-${poseHash.slice(2, 10)}`, { tokenId: id.toString(), poseHash })).cid
  } catch (e) {
    const why = e instanceof PinError ? e.message : 'unknown error'
    console.error('pinata', why)
    throw new HttpError(502, `IPFS pinning failed (Pinata: ${why}). Try again.`, 'pin_failed')
  }
  if (storageConfigured()) await putRaw(posePath(poseHash), canonical, 'application/json').catch(() => {})
  return { poseHash, uri: `ipfs://${IpfsHash}`, cid: IpfsHash, pose, bytes: Buffer.byteLength(canonical) }
}

// ------------------------------------------------------------------ holder-only files
async function download(req: Req) {
  rateLimit(req, 'download', 20, 10 * 60_000)
  needAssets()
  return verifyDownload(body(req), requestHost(req), rockOwner)
}

async function file(req: Req, res: Res) {
  needAssets()
  const t = readFileToken(q1(req.query.t))
  const id = BigInt(t.id)
  const holder = await rockOwner(id)
  if (holder !== t.a) throw new HttpError(403, 'This rock changed hands; only the current holder can download it.', 'not_owner')
  const avatar = await client.readContract({ ...rocks, functionName: 'avatarOf', args: [id] })
  const { pose, name } = t.f === 'rig' ? { pose: null, name: 'rest' } : await activeRigPose(id)
  const out = await renderRock(avatar.seed, { kind: t.f === 'stl' ? 'stl' : 'full', pose })
  const fname = `caps-rock-${id}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.${out.ext}`
  await streamBytes(res, out.bytes, {
    'Content-Type': out.contentType,
    'Content-Length': String(out.bytes.length),
    'Content-Disposition': `attachment; filename="${fname}"`,
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  })
}

/** GET /api/rocks/status?check=pin pins a fixed tiny JSON (same CID every time) to prove the Pinata key works. */
let lastProbe = 0
async function pinProbe() {
  if (Date.now() - lastProbe < 30_000) return { ok: false, error: 'probe rate limited, retry in 30s' }
  lastProbe = Date.now()
  try {
    const r = await pinataUpload(JSON.stringify({ app: 'caps-rocks', probe: 1 }), 'caps-rocks-pin-probe.json', 'caps-rocks-pin-probe')
    return { ok: true, via: r.via, cid: r.cid }
  } catch (e) { return { ok: false, error: e instanceof PinError ? e.message : 'unknown error' } }
}

async function status(req: Req) {
  const qs = await quoteStatus().catch(() => ({ live: false, reason: 'chain read failed' }))
  return {
    contract: CAPS_ROCKS,
    models: assetKeyConfigured() ? 'ok' : 'missing ROCKS_ASSET_KEY',
    pinning: pinataJwt() ? 'ok' : 'missing PINATA_JWT',
    pinataKeyShape: (() => { const k = pinataJwt(); return { length: k.length, segments: k ? k.split('.').length : 0, looksLikeJwt: /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(k) } })(),
    paidFaces: qs.live ? 'live' : qs.reason,
    quoteSigner: { onchain: 'onchain' in qs ? qs.onchain : null, ...quoteSignerDiag() },
    storage: storageConfigured() ? 'ok' : 'missing',
    ...(q1(req.query.check) === 'pin' ? { pinCheck: await pinProbe() } : {}),
  }
}

export default handle(['GET', 'POST', 'HEAD'], async (req, res) => {
  const route = String(q1(req.query.route) ?? '').replace(/^\/+|\/+$/g, '')
  const [head, rest] = [route.split('/')[0], route.split('/').slice(1).join('/')]
  if (rest) req.query.id = req.query.id ?? rest
  const m = req.method ?? 'GET'
  const need = (meth: string) => { if (m !== meth && !(meth === 'GET' && m === 'HEAD')) throw new HttpError(405, 'Method not allowed', 'method') }
  switch (head) {
    case 'metadata': {
      need('GET')
      const out = await metadata(req)
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=600')
      return out
    }
    case 'poster': need('GET'); await poster(req, res); return undefined
    case 'preview': need('GET'); await preview(req, res); return undefined
    case 'traits': {
      need('GET')
      needAssets()
      const seed = q1(req.query.seed)
      if (!seed || !isAddress(seed, { strict: false })) throw new HttpError(400, 'Invalid seed', 'bad_address')
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800')
      return (await rockTraits(getAddress(seed))).traits
    }
    case 'quote': need('GET'); return quote(req)
    case 'status': need('GET'); return status(req)
    case 'pin': need('POST'); return pin(req)
    case 'download': need('POST'); return download(req)
    case 'file': need('GET'); await file(req, res); return undefined
    default: throw new HttpError(404, 'Unknown rocks route', 'not_found')
  }
})
