/**
 * CAPs Mind backup: holder of a CAPs Mind key NFT (Base) or an address in BACKUP_ADMINS signs a free EIP-191 message,
 * gets a short-lived HMAC session token, then streams one zip of all server-held data, or restores files one by one.
 * Secrets (env) are never read into the zip. Encrypted assets stay encrypted.
 */
import { createHash, createHmac, hkdfSync, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { list } from '@vercel/blob'
import { getAddress, isAddress, parseAbi, type Address, type Hex } from 'viem'
import { BACKUP_ACTIONS, BACKUP_MAX_TTL_S, CAPS_MIND_KEY, backupMessage, type BackupAction } from '../../shared/backup.js'
import { HttpError, client } from '../_lib/server.js'
import { getRaw, putRaw, storageConfigured } from '../_lib/store.js'
import { assetKeyBytes } from './assets.mjs'
import { allowedDomain } from './files.js'
import { pinataJwt } from './pinata.js'

const env = (k: string) => (process.env[k] ?? '').trim()
const SKIP = [/^rocks\/download-nonces\//, /^backup\/nonces\//, /^health\//]
const usedNonces = new Map<string, number>()

export function keyContract(): Address {
  const c = env('CAPSMIND_KEY_CONTRACT')
  return getAddress(c && isAddress(c, { strict: false }) ? c : CAPS_MIND_KEY)
}
export function admins(): Address[] {
  return env('BACKUP_ADMINS').split(/[\s,]+/).filter((a) => isAddress(a, { strict: false })).map((a) => getAddress(a))
}
async function keyBalance(a: Address): Promise<bigint> {
  return client.readContract({ address: keyContract(), abi: parseAbi(['function balanceOf(address) view returns (uint256)']), functionName: 'balanceOf', args: [a] })
}
export async function gate(a: Address): Promise<'key' | 'admin' | null> {
  if (admins().includes(a)) return 'admin'
  const bal = await keyBalance(a).catch(() => { throw new HttpError(502, 'Could not read the CAPs Mind key contract. Try again.', 'upstream') })
  return bal > 0n ? 'key' : null
}

function hmacKey(): Buffer {
  const raw = assetKeyBytes()
  if (raw.length !== 32) throw new HttpError(503, 'Backup is not configured (ROCKS_ASSET_KEY missing).', 'asset_key_missing')
  return Buffer.from(hkdfSync('sha256', raw, Buffer.from('caps-mind-backup'), Buffer.from('session-v1'), 32))
}
type Tok = { a: Address; act: BackupAction; exp: number }
const SESSION_TTL: Record<BackupAction, number> = { download: 600, restore: 1800 }
function sign(t: Tok) {
  const b = Buffer.from(JSON.stringify(t)).toString('base64url')
  return b + '.' + createHmac('sha256', hmacKey()).update(b).digest('base64url')
}
export function readSession(s: unknown, act: BackupAction): Tok {
  if (typeof s !== 'string' || s.length > 400) throw new HttpError(401, 'Missing backup session. Sign again.', 'bad_token')
  const [b, mac] = s.split('.')
  const want = createHmac('sha256', hmacKey()).update(b ?? '').digest()
  const got = Buffer.from(mac ?? '', 'base64url')
  if (got.length !== want.length || !timingSafeEqual(got, want)) throw new HttpError(401, 'Bad backup session. Sign again.', 'bad_token')
  const t = JSON.parse(Buffer.from(b, 'base64url').toString('utf8')) as Tok
  if (t.act !== act) throw new HttpError(403, 'This session is for a different action.', 'bad_token')
  if (t.exp < Math.floor(Date.now() / 1000)) throw new HttpError(401, 'Backup session expired. Sign again.', 'expired')
  return t
}

export async function backupAuth(b: Record<string, unknown>, host: string) {
  const { address, action, nonce, expires, signature, domain } = b as Record<string, string | number>
  if (typeof address !== 'string' || !isAddress(address, { strict: false })) throw new HttpError(400, 'Invalid address', 'bad_address')
  if (typeof action !== 'string' || !(BACKUP_ACTIONS as readonly string[]).includes(action)) throw new HttpError(400, 'Invalid action', 'bad_action')
  if (typeof nonce !== 'string' || !/^[0-9a-f]{32,64}$/.test(nonce)) throw new HttpError(400, 'Invalid nonce', 'bad_nonce')
  if (typeof expires !== 'number' || !Number.isInteger(expires)) throw new HttpError(400, 'Invalid expiry', 'bad_expiry')
  if (typeof signature !== 'string' || !/^0x[0-9a-fA-F]+$/.test(signature)) throw new HttpError(400, 'Invalid signature', 'bad_signature')
  if (typeof domain !== 'string' || domain.toLowerCase() !== host.toLowerCase() || !allowedDomain(domain)) throw new HttpError(400, 'Signed for a different site', 'bad_domain')
  const now = Math.floor(Date.now() / 1000)
  if (expires <= now) throw new HttpError(401, 'Signature expired. Sign again.', 'expired')
  if (expires > now + BACKUP_MAX_TTL_S + 30) throw new HttpError(400, 'Expiry too far in the future (max 5 minutes).', 'bad_expiry')
  const addr = getAddress(address)
  const act = action as BackupAction
  const ok = await client.verifyMessage({ address: addr, message: backupMessage({ domain, address: addr, action: act, nonce, expires }), signature: signature as Hex }).catch(() => false)
  if (!ok) throw new HttpError(401, 'Signature does not match this wallet.', 'bad_signature')
  const via = await gate(addr)
  if (!via) throw new HttpError(403, 'This wallet does not hold a CAPs Mind key.', 'not_allowed')
  for (const [k, e] of usedNonces) if (e < Date.now()) usedNonces.delete(k)
  if (usedNonces.has(nonce)) throw new HttpError(409, 'Signature already used. Sign again.', 'nonce_used')
  if (storageConfigured()) {
    const p = `backup/nonces/${nonce}`
    if (await getRaw(p).catch(() => null)) throw new HttpError(409, 'Signature already used. Sign again.', 'nonce_used')
    await putRaw(p, String(expires), 'text/plain').catch(() => {})
  }
  usedNonces.set(nonce, expires * 1000)
  const exp = now + SESSION_TTL[act]
  return { via, action: act, expiresAt: exp, token: sign({ a: addr, act, exp }) }
}

// ------------------------------------------------------------------ zip (STORE, streamed)
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
function crc32(b: Buffer) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
type W = { statusCode: number; setHeader: (k: string, v: string) => void; write: (c: Buffer) => boolean; end: () => void; once: (e: string, f: () => void) => void }
class ZipStream {
  private off = 0
  private dir: Buffer[] = []
  constructor(private w: W) {}
  private async out(b: Buffer) { this.off += b.length; if (!this.w.write(b)) await new Promise<void>((ok) => this.w.once('drain', ok)) }
  async add(name: string, data: Buffer) {
    const n = Buffer.from(name, 'utf8'), crc = crc32(data), at = this.off
    const h = Buffer.alloc(30)
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(0, 8)
    h.writeUInt32LE(0, 10); h.writeUInt32LE(crc, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(data.length, 22)
    h.writeUInt16LE(n.length, 26); h.writeUInt16LE(0, 28)
    await this.out(h); await this.out(n)
    for (let o = 0; o < data.length; o += 256 * 1024) await this.out(data.subarray(o, o + 256 * 1024))
    const c = Buffer.alloc(46)
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(0, 10)
    c.writeUInt32LE(0, 12); c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24)
    c.writeUInt16LE(n.length, 28); c.writeUInt32LE(at, 42)
    this.dir.push(Buffer.concat([c, n]))
  }
  async finish() {
    const start = this.off, d = Buffer.concat(this.dir)
    await this.out(d)
    const e = Buffer.alloc(22)
    e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(this.dir.length, 8); e.writeUInt16LE(this.dir.length, 10)
    e.writeUInt32LE(d.length, 12); e.writeUInt32LE(start, 16)
    await this.out(e)
    this.w.end()
  }
}

export type ManifestEntry = {
  file: string; source: 'vercel-blob' | 'repo' | 'site-api' | 'pinata'; path: string; bytes: number; sha256: string
  contentType?: string; collection?: string; tokenId?: string | null; cid?: string | null; restorable: boolean; note?: string
}
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')
function classify(p: string): { collection: string; tokenId: string | null } {
  let m = p.match(/^designs\/token\/(\d+)\.json$/); if (m) return { collection: 'my-wally', tokenId: m[1] }
  m = p.match(/^designs\/(\d+)\//); if (m) return { collection: 'my-wally', tokenId: m[1] }
  if (p.startsWith('designs/pending/')) return { collection: 'my-wally-pending', tokenId: null }
  if (p.startsWith('rocks/poses/')) return { collection: 'caps-rocks-pose', tokenId: null }
  if (p.startsWith('rocks/')) return { collection: 'caps-rocks', tokenId: null }
  return { collection: 'other', tokenId: null }
}
function packFile(): Buffer | null {
  const c = [join(process.cwd(), 'api/_rocks/assets.enc')]
  try { c.push(join(dirname(fileURLToPath(import.meta.url)), 'assets.enc')) } catch { /* bundled */ }
  for (const p of c) { try { return readFileSync(p) } catch { /* next */ } }
  return null
}
async function pinataList(): Promise<{ cid: string; name?: string; keyvalues?: Record<string, string>; created_at?: string; size?: number }[] | null> {
  const jwt = pinataJwt(); if (!jwt) return null
  const out: { cid: string; name?: string; keyvalues?: Record<string, string>; created_at?: string; size?: number }[] = []
  let token = ''
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`https://api.pinata.cloud/v3/files/public?limit=1000${token ? '&pageToken=' + encodeURIComponent(token) : ''}`, { headers: { Authorization: `Bearer ${jwt}` }, signal: AbortSignal.timeout(10_000) }).catch(() => null)
    if (!r?.ok) return out.length ? out : null
    const j = (await r.json().catch(() => ({}))) as { data?: { files?: typeof out; next_page_token?: string } }
    out.push(...(j.data?.files ?? []).map((f) => ({ cid: f.cid, name: f.name, keyvalues: f.keyvalues, created_at: f.created_at, size: f.size })))
    token = j.data?.next_page_token ?? ''
    if (!token) break
  }
  return out
}
async function siteJson(base: string, path: string): Promise<Buffer | null> {
  const r = await fetch(base + path, { signal: AbortSignal.timeout(15_000) }).catch(() => null)
  return r?.ok ? Buffer.from(await r.arrayBuffer()) : null
}

export async function streamBackup(res: unknown, siteBase: string, who: Address) {
  const w = res as W
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  w.statusCode = 200
  w.setHeader('Content-Type', 'application/zip')
  w.setHeader('Content-Disposition', `attachment; filename="mywally-backup-${stamp}.zip"`)
  w.setHeader('Cache-Control', 'no-store')
  const z = new ZipStream(w)
  const files: ManifestEntry[] = []
  const errors: string[] = []
  const add = async (e: Omit<ManifestEntry, 'bytes' | 'sha256'>, data: Buffer) => { await z.add(e.file, data); files.push({ ...e, bytes: data.length, sha256: sha(data) }) }

  // 1) Pinata pin list (CIDs only; content lives on IPFS)
  const pins = await pinataList().catch(() => null)
  const cidByPose = new Map<string, string>()
  for (const p of pins ?? []) if (p.keyvalues?.poseHash) cidByPose.set(p.keyvalues.poseHash.toLowerCase().replace(/^0x/, ''), p.cid)
  if (!pins) errors.push('pinata: pin list unavailable (PINATA_JWT missing or not a JWT); pose CIDs may be blank')

  // 2) Every Vercel Blob object, as stored
  if (storageConfigured()) {
    let cursor: string | undefined
    do {
      const page = await list({ cursor, limit: 1000 })
      for (const b of page.blobs) {
        if (SKIP.some((r) => r.test(b.pathname))) continue
        const got = await getRaw(b.pathname).catch(() => null)
        if (!got) { errors.push(`blob: could not read ${b.pathname}`); continue }
        const pose = b.pathname.match(/^rocks\/poses\/(?:0x)?([0-9a-f]+)\.json$/)
        await add({ file: `blob/${b.pathname}`, source: 'vercel-blob', path: b.pathname, contentType: got.contentType, ...classify(b.pathname), cid: pose ? cidByPose.get(pose[1]) ?? null : null, restorable: true }, got.bytes)
      }
      cursor = page.hasMore ? page.cursor : undefined
    } while (cursor)
  } else errors.push('blob: storage not configured on this deploy')

  // 3) Encrypted Rocks asset pack (also in the GitHub repo); stays encrypted
  const pack = packFile()
  if (pack) await add({ file: 'repo/api/_rocks/assets.enc', source: 'repo', path: 'api/_rocks/assets.enc', collection: 'caps-rocks-assets', tokenId: null, restorable: false, note: 'AES-encrypted with ROCKS_ASSET_KEY (NOT included). Restore by committing to the repo.' }, pack)
  else errors.push('repo: assets.enc not found in function bundle')

  // 4) Public metadata JSON as served now (rebuilt from blob + chain; kept for reference)
  for (const [col, pre] of [['caps-rocks', '/api/rocks/metadata/'], ['my-wally', '/api/metadata/']] as const) {
    for (let id = 1, misses = 0; id <= 300 && misses < 2; id++) {
      const j = await siteJson(siteBase, pre + id)
      if (!j) { misses++; continue }
      misses = 0
      await add({ file: `metadata/${col}/${id}.json`, source: 'site-api', path: pre + id, contentType: 'application/json', collection: col, tokenId: String(id), restorable: false, note: 'Generated by the site; reference copy' }, j)
    }
  }
  if (pins) await add({ file: 'pinata/pins.json', source: 'pinata', path: 'v3/files/public', contentType: 'application/json', collection: 'ipfs', tokenId: null, restorable: false, note: 'List of CIDs pinned on Pinata (content is on IPFS)' }, Buffer.from(JSON.stringify(pins, null, 2)))

  await z.add('README.md', Buffer.from(README))
  const manifest = { app: 'mywally.gearup.wtf', version: 1, createdAt: new Date().toISOString(), createdBy: who, keyContract: keyContract(), chainId: 8453, secretsIncluded: false, errors, files }
  await z.add('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)))
  await z.finish()
}

export async function restorePut(path: unknown, wantSha: unknown, contentType: unknown, raw: unknown) {
  if (!storageConfigured()) throw new HttpError(503, 'Storage is not configured on this deploy.', 'storage_missing')
  if (typeof path !== 'string' || path.length > 300 || !/^[A-Za-z0-9._\-/]+$/.test(path) || path.includes('..') || path.startsWith('/')) throw new HttpError(400, 'Bad path', 'bad_path')
  if (SKIP.some((r) => r.test(path))) throw new HttpError(400, 'That path is not restorable', 'bad_path')
  if (typeof wantSha !== 'string' || !/^[0-9a-f]{64}$/.test(wantSha)) throw new HttpError(400, 'Bad sha256', 'bad_sha')
  const bytes = Buffer.isBuffer(raw) ? raw : raw instanceof Uint8Array ? Buffer.from(raw) : typeof raw === 'string' ? Buffer.from(raw, 'utf8') : null
  if (!bytes) throw new HttpError(400, 'Send the file bytes as application/octet-stream', 'bad_body')
  if (sha(bytes) !== wantSha) throw new HttpError(422, 'sha256 mismatch; file was not written', 'sha_mismatch')
  const ct = typeof contentType === 'string' && /^[\w.+-]+\/[\w.+-]+$/.test(contentType) ? contentType : 'application/octet-stream'
  await putRaw(path, bytes, ct)
  const back = await getRaw(path)
  if (!back || sha(back.bytes) !== wantSha) throw new HttpError(502, 'Wrote the file but the read-back hash did not match', 'verify_failed')
  return { ok: true, path, bytes: bytes.length }
}

const README = `# My Wally / CAPs Rocks backup

Made by https://mywally.gearup.wtf/backup (CAPs Mind key gate). No secrets are in this zip:
ROCKS_ASSET_KEY, PINATA_JWT, VOUCHER_SIGNER_KEY, the quote signer key and all other env vars are NOT included.
Keep ROCKS_ASSET_KEY in your password manager: without it repo/api/_rocks/assets.enc cannot be opened.

## What's inside
- blob/...            every Vercel Blob object exactly as stored (designs, media, poses, price samples)
- repo/api/_rocks/assets.enc   the encrypted Rocks asset pack (also in GitHub repo CAPSTILLER/junk-handle)
- metadata/...        token metadata as the site served it (reference; regenerated by the site)
- pinata/pins.json    CIDs pinned on Pinata (the files themselves live on IPFS)
- manifest.json       every file -> source, original path, collection, tokenId, IPFS CID, sha256

## Restore (easy way)
1. Deploy junk-handle on Vercel, connect a Blob store, set the env vars again (from your password manager).
2. Open https://<your-domain>/backup, connect a CAPs Mind key wallet, tap Restore, pick this zip.
   Each blob/ file is checked against its sha256, uploaded to the same path, and read back.
   Do NOT re-zip or unzip/rezip this file: the restore page reads the original (uncompressed) zip.

## Restore (manual)
- blob/<path>: upload each file to Vercel Blob at <path> (no random suffix), e.g. with the Vercel CLI
  \`vercel blob put <file> --pathname <path>\` or @vercel/blob put(path, bytes, { addRandomSuffix: false }).
- repo/api/_rocks/assets.enc: commit to api/_rocks/assets.enc in the repo.
- IPFS pins: re-pin each CID from pinata/pins.json on any pinning service; pose files are also in blob/rocks/poses/.
- Check: sha256sum each file and compare with manifest.json.
`
