/** Design storage on Vercel Blob. Degrades to "missing" when BLOB_READ_WRITE_TOKEN is not set. */
import { get, put } from '@vercel/blob'

export const storageConfigured = (): boolean => !!(process.env.BLOB_READ_WRITE_TOKEN ?? '').trim()

type Access = 'public' | 'private'
let access: Access | null = null
const order = (): Access[] => (access ? [access] : ['private', 'public'])

/** Store JSON at `path` (overwrite). Tries private then public so either Blob store type works. */
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
    } catch {
      /* wrong access type or not found → try next */
    }
  }
  return null
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
