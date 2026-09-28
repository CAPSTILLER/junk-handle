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

/** Store JSON at `path` (overwrite). Private first (the store is private); public only as a fallback. */
export async function putJson(path: string, value: unknown): Promise<void> {
  if (!storageConfigured()) throw new Error('design storage missing (BLOB_READ_WRITE_TOKEN)')
  let last: unknown
  for (const a of order()) {
    try {
      await put(path, JSON.stringify(value), {
        access: a, addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', cacheControlMaxAge: 60,
      })
      access = a
      return
    } catch (e) {
      console.warn(`[blob] put ${path} (${a}) failed:`, (e as Error).message)
      last = e
    }
  }
  throw last
}

/** Read JSON at `path`, or null if absent/unreadable. Bypasses CDN cache. */
export async function getJson<T>(path: string): Promise<T | null> {
  if (!storageConfigured()) return null
  for (const a of order()) {
    try {
      const r = await get(path, { access: a, useCache: false })
      if (!r || r.statusCode !== 200) continue
      const text = await new Response(r.stream).text()
      access = a
      return JSON.parse(text) as T
    } catch (e) {
      console.warn(`[blob] get ${path} (${a}) failed:`, (e as Error).message)
    }
  }
  return null
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
