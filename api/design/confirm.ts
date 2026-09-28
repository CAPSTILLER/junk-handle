import { getAddress, parseEventLogs, type Hex } from 'viem'
import { validateDesign } from '../../shared/design.js'
import { MY8_ABI, MY8_CONTRACT } from '../../shared/my8.js'
import { issueMediaTicket, saveFinal } from '../_lib/design.js'
import { HttpError, body, client, handle } from '../_lib/server.js'
import { getJson, pendingPath, storageConfigured, tokenPath, type PendingDesign, type SavedDesign } from '../_lib/store.js'

/**
 * POST /api/design/confirm {txHash, nonce} → after a mint/revision lands, promote the pending design to the token.
 * Checks: receipt succeeded, the voucher nonce is used onchain, tokenId comes from the receipt (mint) or voucher (update),
 * and the token's onchain traits equal the design's traits. Idempotent. Works for smart wallets (reads logs, not calldata).
 */
export default handle(['POST'], async (req) => {
  if (!storageConfigured()) throw new HttpError(503, 'Design storage is not configured', 'storage_missing')
  const b = body(req)
  const txHash = String(b.txHash ?? '')
  const nonce = String(b.nonce ?? '')
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash) || !/^0x[0-9a-fA-F]{64}$/.test(nonce)) throw new HttpError(400, 'Bad txHash/nonce', 'bad_request')
  const p = await getJson<PendingDesign>(pendingPath(nonce))
  if (!p) throw new HttpError(404, 'No pending design for this voucher', 'no_pending')
  let receipt
  try { receipt = await client.getTransactionReceipt({ hash: txHash as Hex }) } catch { throw new HttpError(409, 'Transaction not found yet; retry shortly', 'tx_pending') }
  if (receipt.status !== 'success') throw new HttpError(400, 'Transaction reverted', 'tx_reverted')
  const used = await client.readContract({ address: MY8_CONTRACT, abi: MY8_ABI, functionName: 'usedNonces', args: [nonce as Hex] })
  if (!used) throw new HttpError(409, 'Voucher not used onchain yet', 'nonce_unused')
  let tokenId: bigint
  if (p.kind === 'mint') {
    const mint = parseEventLogs({ abi: MY8_ABI, eventName: 'Transfer', logs: receipt.logs }).find(
      (l) => getAddress(l.address) === getAddress(MY8_CONTRACT) && BigInt(l.args.from) === 0n && getAddress(l.args.to) === getAddress(p.user),
    )
    if (!mint) throw new HttpError(400, 'No My Wally mint to the voucher holder in this transaction', 'no_mint')
    tokenId = mint.args.tokenId
  } else {
    tokenId = BigInt(p.tokenId!)
  }
  let design
  try { design = validateDesign(p.design) } catch { throw new HttpError(400, 'Stored design invalid', 'bad_design') }
  // Already promoted by this tx (retry or replay): succeed, but only the first caller gets a media upload ticket.
  const existing = await getJson<SavedDesign>(tokenPath(tokenId))
  if (existing?.via === `confirm:${txHash.toLowerCase()}`) return { ok: true, tokenId: existing.tokenId, hash: existing.hash, media: null }
  try {
    const rec = await saveFinal(tokenId, design, `confirm:${txHash.toLowerCase()}`)
    return { ok: true, tokenId: rec.tokenId, hash: rec.hash, media: await issueMediaTicket(rec.tokenId, rec.hash) }
  } catch (e) {
    if ((e as { code?: string }).code === 'traits_mismatch') throw new HttpError(409, (e as Error).message, 'traits_mismatch')
    throw e
  }
})
