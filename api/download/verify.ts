import { getAddress, recoverMessageAddress, type Hex } from 'viem'
import { DOWNLOAD_GRANT_TTL_SECONDS, DOWNLOAD_MAX_AGE_SECONDS, MY8_ABI, MY8_CONTRACT, buildGrantMessage, parseDownloadMessage } from '../../shared/my8.js'
import { HttpError, body, client, getCheckedSigner, handle, ownerOf, parseAddress, parseTokenId, requestHost } from '../_lib/server.js'

/**
 * POST /api/download/verify {address, tokenId, message, signature}
 * Free signed message (no tx). Verifies signature + ownerOf, then returns the token's onchain traits and a
 * short-lived grant signed by the oracle key. Exporters run client-side, regenerating from these traits.
 */
export default handle(['POST'], async (req) => {
  const b = body(req)
  const address = parseAddress(b.address)
  const tokenId = parseTokenId(b.tokenId)
  const message = String(b.message ?? '')
  const signature = String(b.signature ?? '') as Hex
  const p = parseDownloadMessage(message)
  if (!p) throw new HttpError(400, 'Malformed ownership message', 'bad_message')
  if (p.tokenId !== tokenId.toString() || getAddress(p.address) !== address) throw new HttpError(400, 'Message does not match request', 'bad_message')
  const host = requestHost(req)
  if (host && p.domain !== host) throw new HttpError(400, `Message was signed for ${p.domain}, not ${host}`, 'bad_domain')
  const issued = Date.parse(p.issuedAt)
  if (!Number.isFinite(issued) || Math.abs(Date.now() - issued) > DOWNLOAD_MAX_AGE_SECONDS * 1000) throw new HttpError(400, 'Ownership message expired; sign again', 'expired')
  let recovered
  try { recovered = await recoverMessageAddress({ message, signature }) } catch { throw new HttpError(400, 'Bad signature', 'bad_signature') }
  if (getAddress(recovered) !== address) throw new HttpError(401, 'Signature does not match address', 'bad_signature')
  const owner = await ownerOf(tokenId)
  if (!owner) throw new HttpError(404, `Token #${tokenId} does not exist`, 'no_token')
  if (getAddress(owner) !== address) throw new HttpError(403, `You do not own token #${tokenId}`, 'not_owner')
  const traits = await client.readContract({ address: MY8_CONTRACT, abi: MY8_ABI, functionName: 'getTraits', args: [tokenId] })
  const expiresAt = Math.floor(Date.now() / 1000) + DOWNLOAD_GRANT_TTL_SECONDS
  const signer = await getCheckedSigner()
  const grant = await signer.signMessage({ message: buildGrantMessage({ tokenId: tokenId.toString(), address, traits, expiresAt }) })
  return { ok: true, tokenId: tokenId.toString(), owner: address, traits, expiresAt, grant }
})
