/**
 * Wallet Gear API: routed through api/info.ts (Hobby function limit). vercel.json rewrites
 * /api/gear/:path* -> /api/info?fn=gear&route=:path*
 *   GET  meta/:tokenId     ERC-721 JSON (only if minted on-chain). baseURI = https://myassets.gearup.wtf/api/gear/meta/ (mywally.gearup.wtf serves the same)
 *   GET  status?address=   paused / price / minted / rendered (no secrets)
 *   POST queue {address}   after a mint: on-chain check, then queue the token for rendering
 *   GET  pending           tokens minted but not yet rendered (for the GitHub Action renderer)
 *   POST ingest            renderer upload (GitHub Actions OIDC, no shared secret): png/mp4 -> pinned to IPFS, glb -> private blob
 *   POST glb               holder signature + ownerOf -> GLB bytes (private storage)
 */
import { createPublicKey, verify as cryptoVerify } from 'node:crypto'
import { list } from '@vercel/blob'
import { getAddress, isAddress, type Address, type Hex } from 'viem'
import { GEAR_ABI, GEAR_CONTRACT, GEAR_SITE, GEAR_SITES, GLB_MAX_TTL_S, addrOfToken, glbMessage, tokenIdOf } from '../../shared/gear/config.js'
import { traits } from '../../shared/gear/traits3.js'
import { HttpError, body, client, requestHost, type Req, type Res } from '../_lib/server.js'
import { getJson, getRaw, putJson, putRaw, storageConfigured } from '../_lib/store.js'
import { pinataJwt } from '../_rocks/pinata.js'

const q1 = (v: unknown) => (Array.isArray(v) ? v[0] : v) as string | undefined
const recPath = (a: string) => `gear/tok/${a}.json`
const pendPath = (a: string) => `gear/pending/${a}`
const glbPath = (a: string) => `gear/glb/${a}.glb`
export const PLACEHOLDER = `${GEAR_SITE}/gear-placeholder.png`
/** Links in metadata follow the domain the request came in on (myassets or legacy mywally); anything else -> canonical. */
export function siteFor(host: string): string {
  const h = host.toLowerCase().split(':')[0]
  return (GEAR_SITES as readonly string[]).includes(h) ? `https://${h}` : GEAR_SITE
}
type Rec = { image?: string; animation?: string; glb?: boolean; renderedAt?: string; renderer?: string }

function parseAddr(v: unknown): Address {
  if (typeof v !== 'string' || !isAddress(v, { strict: false })) throw new HttpError(400, 'Invalid address', 'bad_address')
  return getAddress(v)
}
function parseId(v: unknown): bigint {
  const s = String(v ?? '').replace(/\.json$/, '')
  if (!/^\d{1,49}$/.test(s)) throw new HttpError(400, 'Invalid tokenId', 'bad_token')
  const id = BigInt(s)
  if (id >> 160n !== 0n || id === 0n) throw new HttpError(404, 'Not a wallet gear id', 'not_found')
  return id
}
const lower = (a: string) => a.toLowerCase()
async function ownerOfGear(id: bigint): Promise<Address | null> {
  try { return await client.readContract({ address: GEAR_CONTRACT, abi: GEAR_ABI, functionName: 'ownerOf', args: [id] }) } catch { return null }
}
async function isMinted(id: bigint): Promise<boolean> {
  return client.readContract({ address: GEAR_CONTRACT, abi: GEAR_ABI, functionName: 'hasMinted', args: [getAddress(addrOfToken(id))] })
}

/** OpenSea-style ERC-721 metadata from traits(addr). Pure, so it is unit-testable. */
export function gearMetadata(addr: string, id: bigint, rec: Rec | null, site: string = GEAR_SITE) {
  const t = traits(addr)
  const attr = (trait_type: string, value: string | number, extra: Record<string, unknown> = {}) => ({ trait_type, value, ...extra })
  const attributes = [
    attr('Tier', t.tier), attr('Teeth', t.teeth, { display_type: 'number' }), attr('Stack', t.stack), attr('Family', t.family),
    attr('Master', t.master ? 'Yes' : 'No'), attr('Color', t.master ? 'Master' : t.color), attr('Web', t.web), attr('Arms', t.arms, { display_type: 'number' }),
    attr('Hub', t.hub), attr('Bore', t.bore), attr('Engraving', t.engraving), attr('Pattern', t.pattern), attr('Sheen', t.sheen),
    attr('Wear', t.wear), attr('Thickness (mm)', t.thickness, { display_type: 'number' }), attr('Outer Diameter (mm)', t.od, { display_type: 'number' }),
    attr('Codename', t.codename), attr('Trait Version', t.version),
  ]
  const ready = !!(rec?.image && rec?.animation)
  return {
    name: t.name,
    description: `Wallet Gear v3: one fixed gear per wallet, forever. Every trait is derived from the minter's address ${getAddress(addr)}. ` +
      `The 3D model (GLB) is downloadable by the current holder at ${site}/gear.` + (ready ? '' : ' Rendering: the spinning video appears shortly after mint.'),
    image: rec?.image ?? `${site}/gear-placeholder.png`,
    ...(rec?.animation ? { animation_url: rec.animation } : {}),
    external_url: `${site}/gear?a=${lower(addr)}`,
    background_color: '0b0c10',
    attributes,
    properties: { minter: getAddress(addr), tokenId: id.toString(), rendered: ready, colorHex: t.colorHex },
  }
}

// ---------- GitHub Actions OIDC (renderer auth without a shared secret) ----------
export const OIDC = { iss: 'https://token.actions.githubusercontent.com', aud: 'mywally-gear-render', repo: 'CAPSTILLER/junk-handle', ref: 'refs/heads/main' }
let jwks: { at: number; keys: Array<Record<string, string>> } | null = null
async function githubKeys(): Promise<Array<Record<string, string>>> {
  if (jwks && Date.now() - jwks.at < 600_000) return jwks.keys
  const r = await fetch(`${OIDC.iss}/.well-known/jwks`, { signal: AbortSignal.timeout(8000) })
  const j = (await r.json()) as { keys: Array<Record<string, string>> }
  jwks = { at: Date.now(), keys: j.keys }
  return j.keys
}
export async function verifyActionsToken(auth: string | undefined, keys?: Array<Record<string, string>>): Promise<Record<string, unknown>> {
  const tok = (auth ?? '').replace(/^Bearer\s+/i, '')
  const [h, p, s] = tok.split('.')
  if (!h || !p || !s) throw new HttpError(401, 'Renderer token missing', 'no_auth')
  const head = JSON.parse(Buffer.from(h, 'base64url').toString()) as { kid?: string; alg?: string }
  if (head.alg !== 'RS256') throw new HttpError(401, 'Bad token alg', 'bad_auth')
  const jwk = (keys ?? (await githubKeys())).find((k) => k.kid === head.kid)
  if (!jwk) throw new HttpError(401, 'Unknown token key', 'bad_auth')
  const ok = cryptoVerify('RSA-SHA256', Buffer.from(`${h}.${p}`), createPublicKey({ key: jwk as never, format: 'jwk' }), Buffer.from(s, 'base64url'))
  if (!ok) throw new HttpError(401, 'Bad token signature', 'bad_auth')
  const c = JSON.parse(Buffer.from(p, 'base64url').toString()) as Record<string, unknown>
  const now = Date.now() / 1000
  if (c.iss !== OIDC.iss || c.aud !== OIDC.aud || c.repository !== OIDC.repo || c.ref !== OIDC.ref) throw new HttpError(403, 'Token not from the gear renderer workflow', 'bad_auth')
  if (typeof c.exp !== 'number' || c.exp < now || (typeof c.nbf === 'number' && c.nbf > now + 60)) throw new HttpError(401, 'Token expired', 'bad_auth')
  return c
}

// ---------- IPFS (Pinata, server only; reuses the project's PINATA_JWT) ----------
async function pinBytes(bytes: Buffer, filename: string, type: string, name: string): Promise<string> {
  const jwt = pinataJwt()
  if (!jwt) throw new HttpError(503, 'Pinning not configured (PINATA_JWT missing)', 'pin_missing')
  const auth = { Authorization: `Bearer ${jwt}` }, errs: string[] = []
  try {
    const fd = new FormData(); fd.set('file', new Blob([new Uint8Array(bytes)], { type }), filename); fd.set('network', 'public'); fd.set('name', name)
    const r = await fetch('https://uploads.pinata.cloud/v3/files', { method: 'POST', headers: auth, body: fd, signal: AbortSignal.timeout(25_000) })
    const j = (await r.json().catch(() => ({}))) as { data?: { cid?: string } }
    if (r.ok && j.data?.cid) return j.data.cid
    errs.push('v3 ' + r.status)
  } catch (e) { errs.push('v3 net') ; void e }
  try {
    const fd = new FormData(); fd.set('file', new Blob([new Uint8Array(bytes)], { type }), filename)
    fd.set('pinataMetadata', JSON.stringify({ name })); fd.set('pinataOptions', JSON.stringify({ cidVersion: 1 }))
    const r = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', { method: 'POST', headers: auth, body: fd, signal: AbortSignal.timeout(25_000) })
    const j = (await r.json().catch(() => ({}))) as { IpfsHash?: string }
    if (r.ok && j.IpfsHash) return j.IpfsHash
    errs.push('legacy ' + r.status)
  } catch { errs.push('legacy net') }
  throw new HttpError(502, `IPFS pinning failed (${errs.join(' | ')})`, 'pin_failed')
}

const KINDS = { png: { type: 'image/png', max: 3_000_000, magic: [0x89, 0x50, 0x4e, 0x47] }, mp4: { type: 'video/mp4', max: 3_200_000, magic: null }, glb: { type: 'model/gltf-binary', max: 3_200_000, magic: [0x67, 0x6c, 0x54, 0x46] } } as const
export function checkFile(kind: keyof typeof KINDS, b: Buffer): void {
  const k = KINDS[kind]
  if (b.length < 1000 || b.length > k.max) throw new HttpError(400, `${kind} size ${b.length} out of range`, 'bad_file')
  if (k.magic && !k.magic.every((x, i) => b[i] === x)) throw new HttpError(400, `${kind} bad header`, 'bad_file')
  if (kind === 'mp4' && b.subarray(4, 8).toString('latin1') !== 'ftyp') throw new HttpError(400, 'mp4 bad header', 'bad_file')
}

async function pendingList(): Promise<string[]> {
  if (!storageConfigured()) return []
  const out: string[] = []
  let cursor: string | undefined
  do {
    const r = await list({ prefix: 'gear/pending/', cursor, limit: 1000 })
    for (const b of r.blobs) out.push(b.pathname.slice('gear/pending/'.length))
    cursor = r.hasMore ? r.cursor : undefined
  } while (cursor)
  return out
}
async function enqueue(addr: string): Promise<void> { await putRaw(pendPath(addr), new Date().toISOString(), 'text/plain').catch(() => {}) }
async function dequeue(addr: string): Promise<void> {
  try { const { del } = await import('@vercel/blob'); const r = await list({ prefix: pendPath(addr), limit: 5 }); if (r.blobs.length) await del(r.blobs.map((b) => b.url)) } catch { /* ignore */ }
}

export default async function gear(req: Req, res: Res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const route = (q1(req.query.route) ?? '').replace(/^\/+/, '')
  const [head, arg] = route.split('/')
  const method = req.method ?? 'GET'
  try {
    if (method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization'); return res.status(204).send('') }
    if (head === 'meta' && method === 'GET') {
      const id = parseId(arg ?? q1(req.query.id))
      if (!(await isMinted(id))) { res.setHeader('Cache-Control', 'no-store'); return res.status(404).json({ error: 'Not minted', code: 'not_found' }) }
      const addr = addrOfToken(id)
      const rec = await getJson<Rec>(recPath(addr))
      if (!rec?.image) await enqueue(addr) // self-healing: any metadata read of an unrendered token re-queues it
      res.setHeader('Cache-Control', rec?.image ? 'public, max-age=300, s-maxage=3600' : 'public, max-age=60, s-maxage=60')
      return res.status(200).json(gearMetadata(addr, id, rec, siteFor(requestHost(req))))
    }
    res.setHeader('Cache-Control', 'no-store')
    if (head === 'status' && method === 'GET') {
      const [paused, price, total] = await Promise.all(['paused', 'mintPrice', 'totalMinted'].map((f) => client.readContract({ address: GEAR_CONTRACT, abi: GEAR_ABI, functionName: f as 'paused' })))
      const a = q1(req.query.address)
      let me: unknown = null
      if (a) {
        const addr = lower(parseAddr(a)), minted = await isMinted(tokenIdOf(addr))
        const rec = minted ? await getJson<Rec>(recPath(addr)) : null
        me = { address: addr, tokenId: tokenIdOf(addr).toString(), minted, rendered: !!rec?.image, image: rec?.image ?? null, animation: rec?.animation ?? null, glb: !!rec?.glb }
      }
      return res.status(200).json({ contract: GEAR_CONTRACT, paused, mintPrice: String(price), totalMinted: String(total), storage: storageConfigured() ? 'ok' : 'missing', pinning: pinataJwt() ? 'ok' : 'missing PINATA_JWT', me })
    }
    if (head === 'queue' && method === 'POST') {
      const addr = lower(parseAddr(body(req).address))
      if (!(await isMinted(tokenIdOf(addr)))) throw new HttpError(404, 'Not minted yet', 'not_minted')
      const rec = await getJson<Rec>(recPath(addr))
      if (!rec?.image) await enqueue(addr)
      return res.status(200).json({ ok: true, queued: !rec?.image })
    }
    if (head === 'pending' && method === 'GET') return res.status(200).json({ pending: await pendingList() })
    if (head === 'ingest' && method === 'POST') {
      const claims = await verifyActionsToken(q1(req.headers.authorization))
      const b = body(req)
      const addr = lower(parseAddr(b.address)), id = tokenIdOf(addr)
      if (!(await isMinted(id))) throw new HttpError(404, 'Not minted', 'not_minted')
      const kind = String(b.kind) as keyof typeof KINDS
      if (!(kind in KINDS)) throw new HttpError(400, 'Bad kind', 'bad_kind')
      const bytes = Buffer.from(String(b.data ?? ''), 'base64')
      checkFile(kind, bytes)
      const rec: Rec = (await getJson<Rec>(recPath(addr))) ?? {}
      const t = traits(addr)
      if (kind === 'glb') { await putRaw(glbPath(addr), bytes, KINDS.glb.type); rec.glb = true }
      else {
        const cid = await pinBytes(bytes, `wallet-gear-${t.serial}.${kind}`, KINDS[kind].type, `Wallet Gear ${id} ${kind}`)
        if (kind === 'png') rec.image = `ipfs://${cid}`; else rec.animation = `ipfs://${cid}`
      }
      rec.renderedAt = new Date().toISOString(); rec.renderer = `${String(claims.workflow ?? 'gh')}#${String(claims.run_id ?? '')}`
      await putJson(recPath(addr), rec)
      if (rec.image && rec.animation && rec.glb) await dequeue(addr)
      return res.status(200).json({ ok: true, address: addr, rec })
    }
    if (head === 'glb' && method === 'POST') {
      const b = body(req)
      const address = parseAddr(b.address), expires = Number(b.expires), signature = String(b.signature ?? '') as Hex
      const domain = String(b.domain ?? ''), host = requestHost(req)
      if (!domain || domain.toLowerCase() !== host.toLowerCase()) throw new HttpError(400, 'Signed for a different site', 'bad_domain')
      const now = Math.floor(Date.now() / 1000)
      if (!(expires > now) ) throw new HttpError(401, 'Signature expired. Sign again.', 'expired')
      if (expires > now + GLB_MAX_TTL_S + 30) throw new HttpError(400, 'Expiry too far ahead', 'bad_expiry')
      const tokenId = String(b.tokenId ?? ''), id = parseId(tokenId)
      const ok = await client.verifyMessage({ address, message: glbMessage({ domain, address, tokenId, expires }), signature }).catch(() => false)
      if (!ok) throw new HttpError(401, 'Signature does not match this wallet.', 'bad_signature')
      const holder = await ownerOfGear(id)
      if (!holder) throw new HttpError(404, 'Gear not minted', 'not_found')
      if (getAddress(holder) !== address) throw new HttpError(403, 'Only the current holder can download this gear.', 'not_owner')
      const f = await getRaw(glbPath(addrOfToken(id)))
      if (!f) throw new HttpError(425, 'Your GLB is still being made. Try again in a few minutes.', 'not_ready')
      res.setHeader('Content-Type', 'model/gltf-binary')
      res.setHeader('Content-Disposition', `attachment; filename="wallet-gear-${traits(addrOfToken(id)).serial}.glb"`)
      return res.status(200).send(f.bytes)
    }
    throw new HttpError(404, 'Unknown gear route', 'not_found')
  } catch (e) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message, code: e.code })
    console.error(e)
    return res.status(502).json({ error: 'Chain read or storage failed. Try again.', code: 'upstream' })
  }
}
