/** Holder-only file access: signature check -> short-lived HMAC tokens -> streamed, generated-on-demand files. */
import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto'
import { getAddress, isAddress, type Address, type Hex } from 'viem'
import { DOWNLOAD_FORMATS, DOWNLOAD_MAX_TTL_S, downloadMessage, type DownloadFormat } from '../../shared/rocksDownload.js'
import { HttpError, client } from '../_lib/server.js'
import { getRaw, putRaw, storageConfigured } from '../_lib/store.js'
import { assetKeyBytes } from './assets.mjs'

export const FILE_TOKEN_TTL_S = 120
const usedNonces = new Map<string, number>()

function hmacKey(): Buffer {
  const raw = assetKeyBytes()
  if (raw.length !== 32) throw new HttpError(503, 'Rock files are not configured on this server yet (ROCKS_ASSET_KEY missing).', 'asset_key_missing')
  return Buffer.from(hkdfSync('sha256', raw, Buffer.from('caps-rocks'), Buffer.from('file-token-v1'), 32))
}
const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url')

export function allowedDomain(host: string): boolean {
  const h = host.toLowerCase().split(':')[0]
  return h === 'mywally.gearup.wtf' || h === 'myassets.gearup.wtf' || h === 'localhost' || h === '127.0.0.1' || h.endsWith('.vercel.app')
}

async function burnNonce(nonce: string, expires: number) {
  const now = Date.now()
  for (const [k, exp] of usedNonces) if (exp < now) usedNonces.delete(k)
  if (usedNonces.has(nonce)) throw new HttpError(409, 'This download signature was already used. Sign again.', 'nonce_used')
  if (storageConfigured()) {
    const p = `rocks/download-nonces/${nonce}`
    if (await getRaw(p).catch(() => null)) throw new HttpError(409, 'This download signature was already used. Sign again.', 'nonce_used')
    await putRaw(p, String(expires), 'text/plain').catch(() => {})
  }
  usedNonces.set(nonce, expires * 1000)
}

export async function verifyDownload(b: Record<string, unknown>, host: string, owner: (id: bigint) => Promise<Address | null>) {
  const { address, tokenId, nonce, expires, signature, domain } = b as Record<string, string | number>
  if (typeof address !== 'string' || !isAddress(address, { strict: false })) throw new HttpError(400, 'Invalid address', 'bad_address')
  if (typeof tokenId !== 'string' || !/^\d{1,20}$/.test(tokenId)) throw new HttpError(400, 'Invalid tokenId', 'bad_token')
  if (typeof nonce !== 'string' || !/^[0-9a-f]{32,64}$/.test(nonce)) throw new HttpError(400, 'Invalid nonce', 'bad_nonce')
  if (typeof expires !== 'number' || !Number.isInteger(expires)) throw new HttpError(400, 'Invalid expiry', 'bad_expiry')
  if (typeof signature !== 'string' || !/^0x[0-9a-fA-F]+$/.test(signature)) throw new HttpError(400, 'Invalid signature', 'bad_signature')
  if (typeof domain !== 'string' || domain.toLowerCase() !== host.toLowerCase() || !allowedDomain(domain)) throw new HttpError(400, 'Signed for a different site', 'bad_domain')
  const now = Math.floor(Date.now() / 1000)
  if (expires <= now) throw new HttpError(401, 'Download signature expired. Sign again.', 'expired')
  if (expires > now + DOWNLOAD_MAX_TTL_S + 30) throw new HttpError(400, 'Expiry too far in the future (max 5 minutes).', 'bad_expiry')
  const addr = getAddress(address)
  const message = downloadMessage({ domain, address: addr, tokenId, nonce, expires })
  // viem verifyMessage: EOA ecrecover, ERC-1271 deployed smart wallets, ERC-6492 counterfactual wallets.
  const ok = await client.verifyMessage({ address: addr, message, signature: signature as Hex }).catch(() => false)
  if (!ok) throw new HttpError(401, 'Signature does not match this wallet.', 'bad_signature')
  const id = BigInt(tokenId)
  const holder = await owner(id)
  if (!holder) throw new HttpError(404, `CAPs Rock #${tokenId} does not exist`, 'not_found')
  if (holder !== addr) throw new HttpError(403, 'Only the current holder can download this rock.', 'not_owner')
  await burnNonce(nonce, expires)
  const exp = now + FILE_TOKEN_TTL_S
  return {
    expiresAt: exp,
    files: Object.fromEntries(DOWNLOAD_FORMATS.map((f) => [f, `/api/rocks/file?t=${fileToken({ id: tokenId, a: addr, f, exp })}`])) as Record<DownloadFormat, string>,
  }
}

type Tok = { id: string; a: Address; f: DownloadFormat; exp: number }
export function fileToken(t: Tok): string {
  const body = b64u(JSON.stringify(t))
  return body + '.' + b64u(createHmac('sha256', hmacKey()).update(body).digest())
}
export function readFileToken(s: unknown): Tok {
  if (typeof s !== 'string' || s.length > 600) throw new HttpError(400, 'Bad link', 'bad_token')
  const [body, mac] = s.split('.')
  const want = createHmac('sha256', hmacKey()).update(body ?? '').digest()
  const got = Buffer.from(mac ?? '', 'base64url')
  if (got.length !== want.length || !timingSafeEqual(got, want)) throw new HttpError(401, 'Bad or tampered link', 'bad_token')
  const t = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Tok
  if (!(DOWNLOAD_FORMATS as readonly string[]).includes(t.f)) throw new HttpError(400, 'Bad format', 'bad_token')
  if (t.exp < Math.floor(Date.now() / 1000)) throw new HttpError(401, 'Download link expired. Sign again.', 'expired')
  return t
}

/** Stream bytes in chunks (no buffering of the whole body in one write; avoids the 4.5 MB single-payload limit). */
export async function streamBytes(res: unknown, bytes: Buffer, headers: Record<string, string>) {
  const r = res as { statusCode: number; setHeader: (k: string, v: string) => void; write: (c: Buffer) => boolean; end: () => void; once: (e: string, f: () => void) => void }
  r.statusCode = 200
  for (const [k, v] of Object.entries(headers)) r.setHeader(k, v)
  const CH = 256 * 1024
  for (let o = 0; o < bytes.length; o += CH) {
    if (!r.write(bytes.subarray(o, o + CH))) await new Promise<void>((ok) => r.once('drain', ok))
  }
  r.end()
}
