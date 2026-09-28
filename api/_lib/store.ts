/**
 * Design storage on Vercel Blob (private store). Auth: OIDC (BLOB_STORE_ID + the per-request Vercel OIDC token,
 * picked up automatically by @vercel/blob) or a classic BLOB_READ_WRITE_TOKEN. Degrades to "missing" when neither is set.
 */
import { del, get, put } from '@vercel/blob'

const env = (k: string) => (process.env[k] ?? '').trim()
export const storageConfigured = (): boolean => !!(env('BLOB_STORE_ID') || env('BLOB_READ_WRITE_TOKEN'))
export const storageAuth = (): 'oidc' | 'token' | 'missing' =>
  env('BLOB_READ_WRITE_TOKEN') ? 'token' : env('BLOB_STORE_ID') ? 'oidc' : 'missing'

type Access = 'public' | 'private'
let access: Access | null = null
const order = (): Access[] => (access ? [access] : ['private', 'public'])

/** Store bytes/text at `path` (overwrite). Private first (the store is private); public only as a fallback. */
export async function putRaw(path: string, body: string | Buffer, contentType: string): Promise<void> {
  if (!storageConfigured()) throw new Error('design storage missing (BLOB_STORE_ID / BLOB_READ_WRITE_TOKEN)')
  let last: unknown
  for (const a of order()) {
    try {
      await put(path, body, { access: a, addRandomSuffix: false, allowOverwrite: true, contentType, cacheControlMaxAge: 60 })
      access = a
      return
    } catch (e) {
      console.warn(`[blob] put ${path} (${a}) failed:`, (e as Error).message)
      last = e
    }
  }
  throw last
}

export const putJson = (path: string, value: unknown) => putRaw(path, JSON.stringify(value), 'application/json')

/** Read bytes at `path`, or null if absent/unreadable. Bypasses CDN cache. */
export async function getRaw(path: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  if (!storageConfigured()) return null
  for (const a of order()) {
    try {
      const r = await get(path, { access: a, useCache: false })
      if (!r || r.statusCode !== 200) continue
      const bytes = Buffer.from(await new Response(r.stream).arrayBuffer())
      access = a
      return { bytes, contentType: r.blob.contentType }
    } catch (e) {
      console.warn(`[blob] get ${path} (${a}) failed:`, (e as Error).message)
    }
  }
  return null
}

/** Read JSON at `path`, or null if absent/unreadable. */
export async function getJson<T>(path: string): Promise<T | null> {
  const r = await getRaw(path)
  if (!r) return null
  try { return JSON.parse(r.bytes.toString('utf8')) as T } catch { return null }
}

/** Write → read → delete a tiny blob. Returns 'ok' or the error text. */
export async function storageRoundTrip(): Promise<string> {
  if (!storageConfigured()) return 'missing'
  const path = `health/check-${Date.now()}.json`
  try {
    const nonce = Math.random().toString(36).slice(2)
    await putJson(path, { nonce })
    const back = await getJson<{ nonce: string }>(path)
    await del(path).catch((e) => console.warn('[blob] health cleanup failed:', (e as Error).message))
    return back?.nonce === nonce ? 'ok' : 'read-back mismatch'
  } catch (e) {
    return `error: ${(e as Error).message}`.slice(0, 300)
  }
}

export const pendingPath = (nonce: string) => `designs/pending/${nonce.toLowerCase()}.json`
export const tokenPath = (tokenId: bigint | string) => `designs/token/${tokenId.toString()}.json`
export const MEDIA = {
  image: { file: 'image.png', contentType: 'image/png', maxBytes: 3_500_000 },
  model: { file: 'model.glb', contentType: 'model/gltf-binary', maxBytes: 4_000_000 },
} as const
export type MediaKind = keyof typeof MEDIA
export const mediaPath = (tokenId: bigint | string, kind: MediaKind) => `designs/${tokenId.toString()}/${MEDIA[kind].file}`
export const mediaManifestPath = (tokenId: bigint | string) => `designs/${tokenId.toString()}/media.json`
/** Which design hash each stored media file was rendered from. */
export type MediaManifest = { image?: string; model?: string; updatedAt: number }

export type PendingDesign = {
  kind: 'mint' | 'update'
  user: string
  tokenId: string | null
  traits: string
  nonce: string
  /** keccak256(voucher signature): proves the caller holds the voucher when refreshing the design. */
  sigHash: string
  design: unknown
  hash: string
  createdAt: number
}
export type SavedDesign = { tokenId: string; traits: string; hash: string; design: unknown; savedAt: number; via: string }
