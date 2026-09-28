import { HttpError, handle, parseTokenId } from '../../_lib/server.js'
import { MEDIA, getRaw, mediaPath, type MediaKind } from '../../_lib/store.js'

const BY_FILE: Record<string, MediaKind> = { [MEDIA.image.file]: 'image', [MEDIA.model.file]: 'model' }

/** GET /api/media/:tokenId/image.png | model.glb → public proxy for the private Blob store (CORS open, cached). */
export default handle(['GET', 'HEAD'], async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const tokenId = parseTokenId(req.query.tokenId)
  const file = String(req.query.file ?? '')
  const kind = BY_FILE[file]
  if (!kind) throw new HttpError(404, 'Unknown media file', 'not_found')
  const r = await getRaw(mediaPath(tokenId, kind))
  if (!r) throw new HttpError(404, `No ${file} saved for token #${tokenId}`, 'not_found')
  res.setHeader('Content-Type', MEDIA[kind].contentType)
  if (req.method !== 'HEAD') res.setHeader('Content-Length', String(r.bytes.length))
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=86400')
  res.status(200).send(req.method === 'HEAD' ? '' : r.bytes)
  return undefined
})
