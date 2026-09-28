import { keccak256, type Hex } from 'viem'
import { designHash } from '../../shared/design.js'
import { MY8_ABI, MY8_CONTRACT } from '../../shared/my8.js'
import { checkDesign } from '../_lib/design.js'
import { HttpError, body, client, handle } from '../_lib/server.js'
import { getJson, pendingPath, putJson, storageConfigured, type PendingDesign } from '../_lib/store.js'

/**
 * POST /api/design/pending {nonce, signature, design} → refresh the design stashed with a voucher
 * (the studio changed after the voucher was issued). Caller proves voucher possession; refused once the nonce is used.
 */
export default handle(['POST'], async (req) => {
  if (!storageConfigured()) throw new HttpError(503, 'Design storage is not configured', 'storage_missing')
  const b = body(req)
  const nonce = String(b.nonce ?? '')
  const signature = String(b.signature ?? '')
  if (!/^0x[0-9a-fA-F]{64}$/.test(nonce) || !/^0x[0-9a-fA-F]{2,400}$/.test(signature)) throw new HttpError(400, 'Bad nonce/signature', 'bad_request')
  const p = await getJson<PendingDesign>(pendingPath(nonce))
  if (!p) throw new HttpError(404, 'No pending design for this voucher', 'no_pending')
  if (keccak256(signature as Hex) !== p.sigHash) throw new HttpError(403, 'Voucher signature does not match', 'bad_signature')
  const used = await client.readContract({ address: MY8_CONTRACT, abi: MY8_ABI, functionName: 'usedNonces', args: [nonce as Hex] })
  if (used) throw new HttpError(409, 'Voucher already used; design is locked', 'nonce_used')
  let design
  try { design = checkDesign(b.design, p.traits) } catch (e) { throw new HttpError(400, `Invalid design: ${(e as Error).message}`, 'bad_design') }
  await putJson(pendingPath(nonce), { ...p, design, hash: designHash(design), createdAt: Date.now() } satisfies PendingDesign)
  return { ok: true, hash: designHash(design) }
})
