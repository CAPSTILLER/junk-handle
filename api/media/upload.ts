import { MY8_ABI, MY8_CONTRACT } from '../../shared/my8.js'
import { verifyMediaTicket } from '../_lib/design.js'
import { HttpError, client, handle, parseTokenId, type Req } from '../_lib/server.js'
import {
  MEDIA, getJson, mediaManifestPath, mediaPath, putJson, putRaw, storageConfigured, tokenPath,
  type MediaKind, type MediaManifest, type SavedDesign,
} from '../_lib/store.js'

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const GLB_MAGIC = Buffer.from('glTF', 'ascii')
const q = (req: Req, k: string) => { const v = req.query[k]; return String(Array.isArray(v) ? v[0] : v ?? '') }

async function rawBody(req: Req): Promise<Buffer> {
  const b = req.body as unknown
  if (Buffer.isBuffer(b)) return b
  if (b instanceof Uint8Array) return Buffer.from(b)
  if (typeof b === 'string') return Buffer.from(b, 'latin1')
  const stream = req as unknown as AsyncIterable<Buffer>
  if (typeof stream[Symbol.asyncIterator] !== 'function') throw new HttpError(400, 'Missing body', 'no_body')
  const chunks: Buffer[] = []
  for await (const c of stream) chunks.push(Buffer.from(c))
  return Buffer.concat(chunks)
}

/**
 * POST /api/media/upload?tokenId&kind=image|model&hash&expires&ticket  (body: raw PNG or GLB, application/octet-stream)
 * Accepts media only with a server ticket issued when that exact design was finalized, and only while it is still
 * the token's saved design and matches onchain traits. Magic-byte + size checks.
 */
export default handle(['POST'], async (req) => {
  if (!storageConfigured()) throw new HttpError(503, 'Design storage is not configured', 'storage_missing')
  const tokenId = parseTokenId(q(req, 'tokenId'))
  const kind = q(req, 'kind') as MediaKind
  if (kind !== 'image' && kind !== 'model') throw new HttpError(400, 'kind must be image or model', 'bad_kind')
  const hash = q(req, 'hash').toLowerCase()
  const expires = Number(q(req, 'expires'))
  if (!/^0x[0-9a-f]{64}$/.test(hash)) throw new HttpError(400, 'Bad hash', 'bad_hash')
  if (!(await verifyMediaTicket({ tokenId: tokenId.toString(), hash, expires, ticket: q(req, 'ticket') }))) {
    throw new HttpError(401, 'Media ticket invalid or expired', 'bad_ticket')
  }
  const bytes = await rawBody(req)
  const spec = MEDIA[kind]
  if (bytes.length < 64 || bytes.length > spec.maxBytes) throw new HttpError(413, `${kind} must be 64 B – ${spec.maxBytes} B`, 'bad_size')
  const magicOk = kind === 'image' ? bytes.subarray(0, 8).equals(PNG_MAGIC) : bytes.subarray(0, 4).equals(GLB_MAGIC)
  if (!magicOk) throw new HttpError(415, kind === 'image' ? 'Not a PNG' : 'Not a binary GLB', 'bad_type')
  const [rec, onchain] = await Promise.all([
    getJson<SavedDesign>(tokenPath(tokenId)),
    client.readContract({ address: MY8_CONTRACT, abi: MY8_ABI, functionName: 'getTraits', args: [tokenId] }),
  ])
  if (!rec || rec.hash !== hash) throw new HttpError(409, 'Design changed since this ticket; save again', 'stale_design')
  if (rec.traits !== onchain.toLowerCase()) throw new HttpError(409, 'Onchain traits changed; save again', 'stale_traits')
  await putRaw(mediaPath(tokenId, kind), bytes, spec.contentType)
  const manifest = (await getJson<MediaManifest>(mediaManifestPath(tokenId))) ?? { updatedAt: 0 }
  await putJson(mediaManifestPath(tokenId), { ...manifest, [kind]: hash, updatedAt: Date.now() } satisfies MediaManifest)
  return { ok: true, tokenId: tokenId.toString(), kind, bytes: bytes.length }
})
