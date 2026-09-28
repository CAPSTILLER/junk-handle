/** Server helpers: stash a pending design at voucher time; promote it to a token once onchain traits match. */
import { designHash, designTraitsHex, validateDesign, type Design } from '../../shared/design.js'
import { MY8_ABI, MY8_CONTRACT } from '../../shared/my8.js'
import { client } from './server.js'
import { pendingPath, putJson, storageConfigured, tokenPath, type PendingDesign, type SavedDesign } from './store.js'

export type DesignSaveResult = { designSaved: boolean; designNote?: string }

/** Validate a client design and require its traits to equal the voucher traits. */
export function checkDesign(raw: unknown, traits: string): Design {
  const d = validateDesign(raw)
  if (designTraitsHex(d) !== traits.toLowerCase()) throw new Error('design traits do not match voucher traits')
  return d
}

/** Never throws: minting must work even if design storage is missing or the design is bad. */
export async function stashPending(p: Omit<PendingDesign, 'design' | 'hash' | 'createdAt'>, raw: unknown): Promise<DesignSaveResult> {
  if (raw === undefined || raw === null) return { designSaved: false, designNote: 'no design sent' }
  if (!storageConfigured()) {
    console.warn('[design] storage missing (BLOB_READ_WRITE_TOKEN); design not saved')
    return { designSaved: false, designNote: 'design storage not configured' }
  }
  try {
    const design = checkDesign(raw, p.traits)
    const rec: PendingDesign = { ...p, design, hash: designHash(design), createdAt: Date.now() }
    await putJson(pendingPath(p.nonce), rec)
    return { designSaved: true }
  } catch (e) {
    console.warn('[design] pending save failed:', (e as Error).message)
    return { designSaved: false, designNote: (e as Error).message }
  }
}

/** Store a design as the token's final design, only if the token's onchain traits equal the design's traits. */
export async function saveFinal(tokenId: bigint, design: Design, via: string): Promise<SavedDesign> {
  const onchain = (await client.readContract({ address: MY8_CONTRACT, abi: MY8_ABI, functionName: 'getTraits', args: [tokenId] })).toLowerCase()
  if (onchain !== designTraitsHex(design)) throw Object.assign(new Error(`Token #${tokenId} onchain traits ${onchain} differ from design traits ${designTraitsHex(design)}`), { code: 'traits_mismatch' })
  const rec: SavedDesign = { tokenId: tokenId.toString(), traits: onchain, hash: designHash(design), design, savedAt: Date.now(), via }
  await putJson(tokenPath(tokenId), rec)
  return rec
}
