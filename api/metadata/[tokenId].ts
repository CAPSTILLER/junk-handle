import { MY8_ABI, MY8_CONTRACT, SITE_URL, TRAIT_ORDER, TRAIT_SLOTS, TRAITS_VERSION, decodeTraits, traitColor, traitLabel } from '../../shared/my8.js'
import { HttpError, client, handle, ownerOf, parseTokenId } from '../_lib/server.js'
import { MEDIA, getJson, mediaManifestPath, storageConfigured, tokenPath, type MediaManifest, type SavedDesign } from '../_lib/store.js'

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!)

/** GET /api/metadata/:tokenId → ERC-721 metadata JSON from onchain getTraits(). */
export default handle(['GET'], async (req, res) => {
  const tokenId = parseTokenId(req.query.tokenId)
  if (!(await ownerOf(tokenId))) throw new HttpError(404, `Token #${tokenId} does not exist`, 'no_token')
  const raw = await client.readContract({ address: MY8_CONTRACT, abi: MY8_ABI, functionName: 'getTraits', args: [tokenId] })
  let t
  try { t = decodeTraits(raw) } catch { t = null }
  const colors = TRAIT_ORDER.map((s) => (t ? traitColor(s, t[s]) : '#444'))
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><rect width="600" height="600" fill="#15110f"/>` +
    `<rect x="60" y="60" width="480" height="150" rx="24" fill="${colors[0]}"/>` +
    `<rect x="60" y="225" width="480" height="150" rx="24" fill="${colors[1]}"/>` +
    `<rect x="60" y="390" width="480" height="110" rx="24" fill="${colors[2]}"/>` +
    `<text x="300" y="560" fill="#f3e9dc" font-family="monospace" font-size="34" text-anchor="middle">${esc(`My Wally #${tokenId}`)}</text></svg>`
  // Real render + 3D model when saved media belongs to the token's current design (onchain traits unchanged).
  let image = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  let animation_url: string | undefined
  if (storageConfigured()) {
    try {
      const [rec, media] = await Promise.all([
        getJson<SavedDesign>(tokenPath(tokenId)),
        getJson<MediaManifest>(mediaManifestPath(tokenId)),
      ])
      if (rec && media && rec.traits === String(raw).toLowerCase()) {
        const v = rec.hash.slice(2, 12)
        if (media.image === rec.hash) image = `${SITE_URL}/api/media/${tokenId}/${MEDIA.image.file}?v=${v}`
        if (media.model === rec.hash) animation_url = `${SITE_URL}/api/media/${tokenId}/${MEDIA.model.file}?v=${v}`
      }
    } catch (e) {
      console.warn('[metadata] media lookup failed', (e as Error).message)
    }
  }
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
  res.setHeader('Access-Control-Allow-Origin', '*')
  return {
    name: `My Wally #${tokenId}`,
    description: 'A My Wally built in My Wally Studio on Base. Traits are stored onchain and revisable by the owner.',
    image,
    ...(animation_url ? { animation_url } : {}),
    external_url: `${SITE_URL}/`,
    attributes: t
      ? [...TRAIT_ORDER.map((s) => ({ trait_type: TRAIT_SLOTS[s].label, value: traitLabel(s, t[s]) })), { trait_type: 'Traits Version', value: TRAITS_VERSION }]
      : [{ trait_type: 'Traits', value: 'Unrecognized encoding' }],
    traits: raw,
  }
})
