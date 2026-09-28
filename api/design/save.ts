import { getAddress, recoverMessageAddress, type Hex } from 'viem'
import { buildGrantMessage, normalizeTraits } from '../../shared/my8.js'
import { checkDesign, issueMediaTicket, saveFinal } from '../_lib/design.js'
import { HttpError, body, getSigner, handle, ownerOf, parseAddress, parseTokenId } from '../_lib/server.js'
import { storageConfigured } from '../_lib/store.js'

/**
 * POST /api/design/save {tokenId, address, traits, expiresAt, grant, design} → owner saves the current studio design
 * for a token they already own (backfill). Auth = the oracle-signed download grant from /api/download/verify
 * (itself issued after a wallet signature + ownerOf check). Design traits must equal the token's onchain traits.
 */
export default handle(['POST'], async (req) => {
  if (!storageConfigured()) throw new HttpError(503, 'Design storage is not configured', 'storage_missing')
  const b = body(req)
  const tokenId = parseTokenId(b.tokenId)
  const address = parseAddress(b.address)
  const expiresAt = Number(b.expiresAt)
  let traits
  try { traits = normalizeTraits(String(b.traits ?? '')) } catch { throw new HttpError(400, 'Invalid traits', 'bad_traits') }
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 < Date.now()) throw new HttpError(401, 'Ownership check expired; unlock downloads again', 'expired')
  let signer
  try {
    signer = await recoverMessageAddress({
      message: buildGrantMessage({ tokenId: tokenId.toString(), address, traits, expiresAt }),
      signature: String(b.grant ?? '') as Hex,
    })
  } catch { throw new HttpError(400, 'Bad grant', 'bad_grant') }
  if (getAddress(signer) !== getAddress(getSigner().address)) throw new HttpError(401, 'Grant not signed by this server', 'bad_grant')
  const owner = await ownerOf(tokenId)
  if (!owner || getAddress(owner) !== address) throw new HttpError(403, `You do not own token #${tokenId}`, 'not_owner')
  let design
  try { design = checkDesign(b.design, traits) } catch (e) { throw new HttpError(400, `Invalid design: ${(e as Error).message}`, 'bad_design') }
  try {
    const rec = await saveFinal(tokenId, design, 'owner-save')
    return { ok: true, tokenId: rec.tokenId, hash: rec.hash, media: await issueMediaTicket(rec.tokenId, rec.hash) }
  } catch (e) {
    if ((e as { code?: string }).code === 'traits_mismatch') throw new HttpError(409, (e as Error).message, 'traits_mismatch')
    throw e
  }
})
