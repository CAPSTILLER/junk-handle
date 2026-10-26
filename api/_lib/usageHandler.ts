/** GET /api/usage/blob: Blob store size for the daily monitor. Sizes only (no URLs, no secrets). CDN-cached 1h so
 *  it costs at most ~24 list() calls/day (list = advanced op; each 1000-item page counts as one). */
import { list } from '@vercel/blob'
import { storageConfigured } from './store.js'
import type { Req, Res } from './server.js'

const LIMIT = 1073741824
export default async function usage(_req: Req, res: Res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (!storageConfigured()) { res.setHeader('Cache-Control', 'no-store'); res.status(503).json({ error: 'blob storage not configured' }); return }
  try {
    let bytes = 0, count = 0, pages = 0, cursor: string | undefined
    const byPrefix: Record<string, number> = {}
    do {
      const r = await list({ limit: 1000, cursor })
      pages++
      for (const b of r.blobs) {
        bytes += b.size; count++
        const p = b.pathname.includes('/') ? b.pathname.split('/')[0] : '(root)'
        byPrefix[p] = (byPrefix[p] ?? 0) + b.size
      }
      cursor = r.hasMore ? r.cursor : undefined
    } while (cursor && pages < 50)
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=600')
    res.status(200).json({ bytes, count, limitBytes: LIMIT, pct: Math.round((bytes / LIMIT) * 10000) / 100, byPrefix, pages, at: new Date().toISOString() })
  } catch (e) {
    res.setHeader('Cache-Control', 'public, s-maxage=300')
    res.status(502).json({ error: 'blob list failed', detail: String((e as Error).message ?? e).slice(0, 120) })
  }
}
