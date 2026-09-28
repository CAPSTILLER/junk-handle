import { getAddress, keccak256 } from 'viem'
import { EIP712_DOMAIN, UPDATE_VOUCHER_TYPES, VOUCHER_TTL_SECONDS, normalizeTraits, traitsHash } from '../../shared/my8.js'
import { getQuote } from '../_lib/price.js'
import { stashPending } from '../_lib/design.js'
import { HttpError, assertNotPaused, body, getCheckedSigner, handle, ownerOf, parseAddress, parseTokenId, randomNonce } from '../_lib/server.js'

/** POST /api/voucher/update {address, tokenId, traits, design?} → EIP-712 UpdateVoucher (owner only). */
export default handle(['POST'], async (req) => {
  const b = body(req)
  const user = parseAddress(b.address)
  const tokenId = parseTokenId(b.tokenId)
  let traits
  try { traits = normalizeTraits(String(b.traits ?? '')) } catch (e) { throw new HttpError(400, `Invalid traits: ${(e as Error).message}`, 'bad_traits') }
  const [signer, owner, , quote] = await Promise.all([getCheckedSigner(), ownerOf(tokenId), assertNotPaused(), getQuote()])
  if (!owner) throw new HttpError(404, `Token #${tokenId} does not exist`, 'no_token')
  if (getAddress(owner) !== user) throw new HttpError(403, `Address does not own token #${tokenId}`, 'not_owner')
  const message = {
    user,
    tokenId,
    traitsHash: traitsHash(traits),
    frlzAmount: BigInt(quote.revision.frlzWei),
    validUntil: BigInt(Math.floor(Date.now() / 1000) + VOUCHER_TTL_SECONDS),
    nonce: randomNonce(),
  }
  const signature = await signer.signTypedData({ domain: EIP712_DOMAIN, types: UPDATE_VOUCHER_TYPES, primaryType: 'UpdateVoucher', message })
  const design = await stashPending(
    { kind: 'update', user, tokenId: tokenId.toString(), traits, nonce: message.nonce, sigHash: keccak256(signature) },
    b.design,
  )
  return {
    ...design,
    traits,
    usd: quote.revision.usd,
    frlz: quote.revision.frlz,
    priceUsd: quote.priceUsd,
    priceSource: quote.source,
    voucher: {
      ...message,
      tokenId: tokenId.toString(),
      frlzAmount: message.frlzAmount.toString(),
      validUntil: message.validUntil.toString(),
      signature,
    },
  }
})
