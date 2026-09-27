import { EIP712_DOMAIN, MINT_VOUCHER_TYPES, VOUCHER_TTL_SECONDS, normalizeTraits, traitsHash } from '../../shared/my8.js'
import { getQuote } from '../_lib/price.js'
import { HttpError, assertNotPaused, body, getCheckedSigner, handle, parseAddress, randomNonce } from '../_lib/server.js'

/** POST /api/voucher/mint {address, traits} → EIP-712 MintVoucher signed by the oracle key. */
export default handle(['POST'], async (req) => {
  const b = body(req)
  const user = parseAddress(b.address)
  let traits
  try { traits = normalizeTraits(String(b.traits ?? '')) } catch (e) { throw new HttpError(400, `Invalid traits: ${(e as Error).message}`, 'bad_traits') }
  const [signer, , quote] = await Promise.all([getCheckedSigner(), assertNotPaused(), getQuote()])
  const message = {
    user,
    traitsHash: traitsHash(traits),
    frlzAmount: BigInt(quote.mint.frlzWei),
    validUntil: BigInt(Math.floor(Date.now() / 1000) + VOUCHER_TTL_SECONDS),
    nonce: randomNonce(),
  }
  const signature = await signer.signTypedData({ domain: EIP712_DOMAIN, types: MINT_VOUCHER_TYPES, primaryType: 'MintVoucher', message })
  return {
    traits,
    usd: quote.mint.usd,
    frlz: quote.mint.frlz,
    priceUsd: quote.priceUsd,
    priceSource: quote.source,
    voucher: { ...message, frlzAmount: message.frlzAmount.toString(), validUntil: message.validUntil.toString(), signature },
  }
})
