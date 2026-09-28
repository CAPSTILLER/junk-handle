import { validateDesign } from '../../shared/design.js'
import { MY8_ABI, MY8_CONTRACT } from '../../shared/my8.js'
import { client, handle, parseTokenId } from '../_lib/server.js'
import { getJson, storageConfigured, tokenPath, type SavedDesign } from '../_lib/store.js'

/** GET /api/design/:tokenId → {design|null}. Public (just numbers). Null if none saved or onchain traits changed since. */
export default handle(['GET'], async (req) => {
  const tokenId = parseTokenId(req.query.tokenId)
  if (!storageConfigured()) return { tokenId: tokenId.toString(), design: null, storage: 'missing' }
  const [rec, onchain] = await Promise.all([
    getJson<SavedDesign>(tokenPath(tokenId)),
    client.readContract({ address: MY8_CONTRACT, abi: MY8_ABI, functionName: 'getTraits', args: [tokenId] }).catch(() => null),
  ])
  if (!rec) return { tokenId: tokenId.toString(), design: null, traits: onchain }
  if (!onchain || rec.traits !== onchain.toLowerCase()) return { tokenId: tokenId.toString(), design: null, stale: true, traits: onchain }
  let design
  try { design = validateDesign(rec.design) } catch { return { tokenId: tokenId.toString(), design: null, traits: onchain } }
  return { tokenId: tokenId.toString(), design, traits: onchain, savedAt: rec.savedAt, hash: rec.hash }
})
