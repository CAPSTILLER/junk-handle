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
 *   GET  showcase?id=1       PUBLIC full GLB, ONLY for ids in PUBLIC_FULL_IDS (Cap approved Rock #1 for the My Assets home tile)
 */
import { getAddress, isAddress, type Address } from 'viem'
import { CAPS_ROCKS } from '../shared/capsRocks.js'
import { canonicalPose, normalizePose, POSE_MAX_BYTES } from '../shared/rocksPose.js'
import { SITE_URL } from '../shared/my8.js'
import { HttpError, body, client, handle, parseTokenId, requestHost, type Req, type Res } from './_lib/server.js'
import { putRaw, storageConfigured } from './_lib/store.js'
import { activeRigPose, readRock, rockOwner, posePath, rocks, sha256Hex } from './_rocks/chain.js'
import { readFileToken, streamBytes, verifyDownload } from './_rocks/files.js'
import { backupAuth, readSession, restorePathOk, restorePut, streamBackup } from './_rocks/backup.js'
import { assetUrl, cors, deleteAsset, deleteStarter, setStarterHidden, adminStarters, isAdminAddress, getShared, listShared, listStarters, publicAssetUrl, saveStarter, setPublic, shareRoom, whoAmI, fileProxy, folderOp, getRoom, listAssets, listRooms, originHost, restoreUploadRoute, restoreVerify, saveAsset, saveRoom, updateAssetMeta, uploadRoute } from './_rocks/mysbase.js'
import { PinError, pinataJwt, pinataUpload } from './_rocks/pinata.js'
import { makeQuote, quoteSignerDiag, quoteStatus } from './_rocks/quote.js'
import { assetKeyConfigured } from './_rocks/assets.mjs'
import { renderRock, rockTraits } from './_rocks/render.mjs'
import { FACE_GENERATOR } from '../shared/faces/generator.mjs'

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

/** Active face PNG from capsmind (pinned to the onchain index), inlined so marketplaces that block external refs still show it. Fail soft: null. */
async function activeFacePng(id: bigint, index: number | null): Promise<string | null> {
  try {
    const r = await fetch(`https://capsmind.gearup.wtf/api/rocks/${id}/face.png${index === null ? '' : `?face=${index}`}`, { signal: AbortSignal.timeout(4000) })
    if (!r.ok || !(r.headers.get('content-type') ?? '').startsWith('image/png')) return null
    const b = Buffer.from(await r.arrayBuffer())
    return b.length > 0 && b.length < 2_000_000 ? b.toString('base64') : null
  } catch { return null }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
async function poster(req: Req, res: Res) {
  const id = parseTokenId(String(q1(req.query.id) ?? '').replace(/\.(svg|png)$/, ''))
  const { view, activeFace } = await readRock(id)
  const seed = getAddress(view.avatar.seed)
  const png = await activeFacePng(id, activeFace[0] ? Number(activeFace[1]) : null)
  const af = !png && FACE_GENERATOR.ready && activeFace[0] && activeFace[2].kind === 0 && Number(activeFace[2].generatorVersion) === 1 ? activeFace[2] : null
  const faceSvg = af ? FACE_GENERATOR.renderSvg(getAddress(af.seed), Number(af.variant)).replace(/^<svg [^>]*>/, '<svg x="452" y="200" width="96" height="70" viewBox="0 312 2400 1776" preserveAspectRatio="none">') : ''
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">
<defs><radialGradient id="g1" cx="20%" cy="-10%" r="90%"><stop offset="0" stop-color="#1e3a8a" stop-opacity=".55"/><stop offset="1" stop-color="#07090f" stop-opacity="0"/></radialGradient>
<radialGradient id="g2" cx="100%" cy="0%" r="70%"><stop offset="0" stop-color="#0ea5e9" stop-opacity=".2"/><stop offset="1" stop-color="#07090f" stop-opacity="0"/></radialGradient>
<filter id="marble" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.03" numOctaves="4" seed="${Number(id) % 97}" result="n"/>
<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -9 5.2" result="v"/><feFlood flood-color="#e8f0ff" flood-opacity=".85"/><feComposite in2="v" operator="in" result="vw"/>
<feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="7" result="g"/><feColorMatrix in="g" type="matrix" values="0 0 0 0 .05  0 0 0 0 .18  0 0 0 0 .55  0 0 0 .9 0" result="gb"/>
<feMerge result="m"><feMergeNode in="SourceGraphic"/><feMergeNode in="gb"/><feMergeNode in="vw"/></feMerge><feComposite in="m" in2="SourceAlpha" operator="in"/></filter></defs>
<rect width="1000" height="1000" fill="#07090f"/><rect width="1000" height="1000" fill="url(#g1)"/><rect width="1000" height="1000" fill="url(#g2)"/>
<g stroke="#0b1f5c" stroke-opacity=".6" stroke-width="4" fill="#1d4ed8" filter="url(#marble)">
<polygon points="395,95 445,70 470,130 420,150"/><polygon points="480,55 535,50 545,120 490,125"/><polygon points="565,80 615,95 600,150 555,135"/>
<polygon points="330,190 470,130 650,150 700,280 660,420 360,430 300,320"/>
<polygon points="300,450 700,450 740,640 640,700 360,700 260,640"/><polygon points="200,470 290,460 280,640 190,620"/><polygon points="710,460 800,470 810,620 720,640"/>
<polygon points="360,720 485,720 475,900 370,900"/><polygon points="515,720 640,720 630,900 525,900"/></g>
<rect x="392" y="190" width="216" height="160" rx="8" fill="#1e3a8a" stroke="#eef2f5" stroke-width="10" stroke-dasharray="6 4"/>
${png ? `<image x="402" y="200" width="196" height="140" preserveAspectRatio="xMidYMid slice" href="data:image/png;base64,${png}"/>` : faceSvg.replace(/x="452" y="200" width="96" height="70"/, 'x="402" y="200" width="196" height="140"')}
<text x="500" y="955" text-anchor="middle" font-family="ui-sans-serif,system-ui,Segoe UI,Roboto,sans-serif" font-size="44" font-weight="800" fill="#e8eefc" letter-spacing="2">CAPs ROCK #${id}</text>
<text x="500" y="985" text-anchor="middle" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="20" fill="#93c5fd" letter-spacing="4">SEED ${esc(short(seed)).toUpperCase()} · TABLET #${view.avatar.tabletTokenId}</text>
<text x="500" y="80" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="24" fill="#8b9bb8" letter-spacing="8">CAPs MIND · VAULT PROPHECIES</text></svg>`
  res.setHeader('Content-Type', 'image/svg+xml')
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=600')
  res.status(200).send(svg)
}

// ------------------------------------------------------------------ public preview
async function preview(req: Req, res: Res) {
  needAssets()
  rateLimit(req, 'preview', 30, 60_000)
  let seed: Address, pose = null, face: unknown = null, cache = 'public, max-age=86400, s-maxage=604800, immutable'
  const idq = q1(req.query.id), seedq = q1(req.query.seed)
  if (idq !== undefined) {
    const id = parseTokenId(idq)
    const { view, activePose, activeFace } = await readRock(id)
    seed = getAddress(view.avatar.seed)
    if (activeFace[0]) face = activeFace[2]
    pose = (await activeRigPose(id, activePose as never)).pose
    cache = 'public, max-age=60, s-maxage=60, stale-while-revalidate=600'
  } else if (seedq && isAddress(seedq, { strict: false })) {
    seed = getAddress(seedq)
    const fv = q1(req.query.faceVariant) // try-on preview of the seed wallet's own v1 face (no chain state)
    if (fv !== undefined && /^\d{1,9}$/.test(fv)) face = { kind: 0, seed, generatorVersion: 1, variant: Number(fv) }
  } else throw new HttpError(400, 'Pass ?id= or ?seed=', 'bad_request')
  const out = await renderRock(seed, { kind: 'preview', pose, face })
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

/** Rocks whose FULL model is public. Every other id stays holder-only (file?t= with ownerOf check). */
export const PUBLIC_FULL_IDS: readonly bigint[] = [1n]
export function publicFullId(raw: string | undefined): bigint {
  const id = parseTokenId(raw)
  if (!PUBLIC_FULL_IDS.includes(id)) throw new HttpError(403, 'Only the holder can download this rock.', 'not_public')
  return id
}
async function showcase(req: Req, res: Res) {
  const id = publicFullId(q1(req.query.id))
  needAssets()
  rateLimit(req, 'showcase', 30, 60_000)
  const avatar = await client.readContract({ ...rocks, functionName: 'avatarOf', args: [id] })
  const { pose } = await activeRigPose(id)
  const af = await client.readContract({ ...rocks, functionName: 'activeFace', args: [id] }).catch(() => null)
  const out = await renderRock(avatar.seed, { kind: 'full', pose, face: af?.[0] ? af[2] : null })
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', out.contentType)
  res.setHeader('Content-Length', String(out.bytes.length))
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400')
  res.status(200).send(out.bytes)
}

async function file(req: Req, res: Res) {
  needAssets()
  const t = readFileToken(q1(req.query.t))
  const id = BigInt(t.id)
  const holder = await rockOwner(id)
  if (holder !== t.a) throw new HttpError(403, 'This rock changed hands; only the current holder can download it.', 'not_owner')
  const avatar = await client.readContract({ ...rocks, functionName: 'avatarOf', args: [id] })
  const { pose, name } = t.f === 'rig' ? { pose: null, name: 'rest' } : await activeRigPose(id)
  const af = await client.readContract({ ...rocks, functionName: 'activeFace', args: [id] }).catch(() => null)
  const out = await renderRock(avatar.seed, { kind: t.f === 'stl' ? 'stl' : 'full', pose, face: af?.[0] ? af[2] : null })
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

export default handle(['GET', 'POST', 'HEAD', 'OPTIONS'], async (req, res) => {
  const route = String(q1(req.query.route) ?? '').replace(/^\/+|\/+$/g, '')
  const [head, rest] = [route.split('/')[0], route.split('/').slice(1).join('/')]
  if (rest) req.query.id = req.query.id ?? rest
  const m = req.method ?? 'GET'
  if (head.startsWith('mysbase-') || head === 'backup-auth') { if (cors(req, res)) return undefined }
  if (m === 'OPTIONS') { res.status(204).send(''); return undefined }
  const need = (meth: string) => { if (m !== meth && !(meth === 'GET' && m === 'HEAD')) throw new HttpError(405, 'Method not allowed', 'method') }
  switch (head) {
    case 'metadata': {
      need('GET')
      const out = await metadata(req)
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=600')
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
    case 'showcase': need('GET'); await showcase(req, res); return undefined
    case 'backup-auth': need('POST'); rateLimit(req, 'backup', 20, 10 * 60_000); return backupAuth(body(req), requestHost(req), originHost(req))
    case 'backup-upload': need('POST'); rateLimit(req, 'bupload', 600, 10 * 60_000); return restoreUploadRoute(req, body(req), restorePathOk)
    case 'backup-verify': {
      need('POST')
      readSession(q1(req.headers['x-backup-session']), 'restore')
      const b = body(req)
      return restoreVerify(b.path, b.sha256, restorePathOk)
    }
    case 'mysbase-upload': need('POST'); rateLimit(req, 'mysup', 200, 10 * 60_000); return uploadRoute(req, body(req))
    case 'mysbase-asset-save': need('POST'); return saveAsset(req, body(req))
    case 'mysbase-assets': need('POST'); return listAssets(req)
    case 'mysbase-asset-meta': need('POST'); rateLimit(req, 'mysmeta', 300, 10 * 60_000); return updateAssetMeta(req, body(req))
    case 'mysbase-folder': need('POST'); rateLimit(req, 'mysfold', 120, 10 * 60_000); return folderOp(req, body(req))
    case 'mysbase-asset-delete': need('POST'); return deleteAsset(req, body(req))
    case 'mysbase-asset-url': need('POST'); return assetUrl(req, body(req), origin(req))
    case 'mysbase-file': need('GET'); await fileProxy(req, res); return undefined
    case 'mysbase-room-save': need('POST'); rateLimit(req, 'mysroom', 120, 10 * 60_000); return saveRoom(req, body(req))
    case 'mysbase-room': need('POST'); return getRoom(req, body(req))
    case 'mysbase-rooms': need('POST'); return listRooms(req)
    case 'mysbase-share': need('POST'); rateLimit(req, 'mysshare', 60, 10 * 60_000); return shareRoom(req, body(req))
    case 'mysbase-shared': need('POST'); rateLimit(req, 'myspub', 300, 10 * 60_000); return getShared(body(req), req)
    case 'mysbase-shared-list': need('POST'); return listShared(req)
    case 'mysbase-starters': need('POST'); rateLimit(req, 'myspub', 300, 10 * 60_000); return listStarters()
    case 'mysbase-starter-save': need('POST'); rateLimit(req, 'mysstarter', 30, 10 * 60_000); return saveStarter(req, body(req))
    case 'mysbase-starter-delete': need('POST'); rateLimit(req, 'mysstarter', 30, 10 * 60_000); return deleteStarter(req, body(req))
    case 'mysbase-starter-hide': need('POST'); rateLimit(req, 'mysstarter', 30, 10 * 60_000); return setStarterHidden(req, body(req))
    case 'mysbase-starter-admin': need('POST'); return adminStarters(req)
    case 'mysbase-public': need('POST'); return setPublic(req, body(req))
    case 'mysbase-public-url': need('POST'); rateLimit(req, 'myspuburl', 600, 10 * 60_000); return publicAssetUrl(body(req), origin(req))
    case 'mysbase-is-admin': need('POST'); rateLimit(req, 'myspub', 300, 10 * 60_000); return isAdminAddress(body(req))
    case 'mysbase-me': need('POST'); return whoAmI(req)
    case 'backup-zip': {
      need('GET')
      const t = readSession(q1(req.query.t), 'download')
      await streamBackup(res, origin(req), t.a)
      return undefined
    }
    case 'backup-put': {
      need('POST')
      readSession(q1(req.query.t), 'restore')
      return restorePut(q1(req.query.path), q1(req.query.sha256), q1(req.query.type), req.body)
    }
    default: throw new HttpError(404, 'Unknown rocks route', 'not_found')
  }
})
