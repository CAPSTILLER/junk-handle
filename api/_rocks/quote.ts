/** GEAR face quotes: $0.25 of GEAR, median of DexScreener + GeckoTerminal, smoothed over ~30 min, EIP-712 signed. */
import { getAddress, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { GEAR_TOKEN } from '../../shared/capsRocks.js'
import { HttpError, client, randomNonce } from '../_lib/server.js'
import { getJson, putJson, storageConfigured } from '../_lib/store.js'
import { rocks } from './chain.js'

export const FACE_FEE_USD = 0.25
export const QUOTE_TTL_S = 600
const WINDOW_MS = 30 * 60_000
const SAMPLE_EVERY_MS = 60_000
const PRICE_PATH = 'rocks/gear-price-samples.json'
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const sane = (p: number) => Number.isFinite(p) && p > 1e-12 && p < 1e6

async function dexscreener(): Promise<number | null> {
  try {
    const r = await fetch(`https://api.dexscreener.com/tokens/v1/base/${GEAR_TOKEN}`, { signal: AbortSignal.timeout(5_000) })
    if (!r.ok) return null
    const pairs = (await r.json()) as { priceUsd?: string; liquidity?: { usd?: number }; baseToken?: { address?: string } }[]
    const best = pairs.filter((p) => p.baseToken?.address?.toLowerCase() === GEAR_TOKEN.toLowerCase() && p.priceUsd)
      .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0]
    const p = best ? Number(best.priceUsd) : NaN
    return sane(p) ? p : null
  } catch { return null }
}
async function geckoterminal(): Promise<number | null> {
  try {
    const a = GEAR_TOKEN.toLowerCase()
    const r = await fetch(`https://api.geckoterminal.com/api/v2/simple/networks/base/token_price/${a}`, { signal: AbortSignal.timeout(5_000), headers: { accept: 'application/json' } })
    if (!r.ok) return null
    const d = (await r.json()) as { data?: { attributes?: { token_prices?: Record<string, string> } } }
    const p = Number(d.data?.attributes?.token_prices?.[a])
    return sane(p) ? p : null
  } catch { return null }
}

type Sample = { t: number; p: number }
let mem: Sample[] = []
let liveCache: { at: number; spot: number; sources: Record<string, number | null> } | null = null

/** Smoothed GEAR/USD. Requires a live read in the last 2 minutes (stale = reject). */
export async function gearPrice() {
  const now = Date.now()
  if (!liveCache || now - liveCache.at > 45_000) {
    const [dex, gecko] = await Promise.all([dexscreener(), geckoterminal()])
    const live = [dex, gecko].filter((x): x is number => x !== null)
    if (live.length) liveCache = { at: now, spot: median(live), sources: { dexscreener: dex, geckoterminal: gecko } }
  }
  if (!liveCache || now - liveCache.at > 120_000) throw new HttpError(503, 'GEAR price unavailable right now; try again shortly.', 'price_unavailable')
  let samples: Sample[] = storageConfigured() ? ((await getJson<Sample[]>(PRICE_PATH).catch(() => null)) ?? mem) : mem
  samples = samples.filter((s) => now - s.t < WINDOW_MS && sane(s.p))
  if (!samples.length || now - samples[samples.length - 1].t > SAMPLE_EVERY_MS) {
    samples.push({ t: liveCache.at, p: liveCache.spot })
    mem = samples
    if (storageConfigured()) await putJson(PRICE_PATH, samples).catch(() => {})
  }
  const smoothed = median([...samples.map((s) => s.p), liveCache.spot])
  return { priceUsd: smoothed, spotUsd: liveCache.spot, sources: liveCache.sources, samples: samples.length, windowMinutes: 30 }
}

function quoteSignerKey(): Hex | null {
  const k = (process.env.CAPS_ROCKS_QUOTE_SIGNER_KEY ?? '').trim()
  if (!k) return null
  const h = (k.startsWith('0x') ? k : '0x' + k) as Hex
  return /^0x[0-9a-fA-F]{64}$/.test(h) ? h : null
}

/** Paid faces are live only when the env key is set AND matches the onchain quoteSigner. */
export async function quoteStatus() {
  const onchain = getAddress(await client.readContract({ ...rocks, functionName: 'quoteSigner' }))
  const k = quoteSignerKey()
  if (!k) return { live: false as const, reason: 'Paid faces are not live yet (quote signer not configured).', onchain }
  const acct = privateKeyToAccount(k)
  if (onchain === '0x0000000000000000000000000000000000000000') return { live: false as const, reason: 'Paid faces are not live yet (quote signer not set onchain).', onchain }
  if (getAddress(acct.address) !== onchain) return { live: false as const, reason: 'Paid faces are not live yet (quote signer mismatch).', onchain }
  // OZ SignatureChecker uses ERC-1271 when the signer has code (e.g. an EIP-7702 delegation), so plain ECDSA
  // quotes would revert with BadQuoteSignature. The quote signer must be a fresh, code-free EOA.
  const code = await client.getCode({ address: onchain }).catch(() => undefined)
  if (code && code !== '0x') return { live: false as const, reason: 'Paid faces are not live yet (quote signer address has code; use a fresh EOA).', onchain }
  return { live: true as const, acct, onchain }
}

export async function makeQuote(id: bigint, payer: Address, kind: 0 | 1) {
  const [avatar, owner] = await Promise.all([
    client.readContract({ ...rocks, functionName: 'avatarOf', args: [id] }).catch(() => null),
    client.readContract({ ...rocks, functionName: 'ownerOf', args: [id] }).catch(() => null),
  ])
  if (!avatar || !owner) throw new HttpError(404, `CAPs Rock #${id} does not exist`, 'not_found')
  if (getAddress(owner) !== payer) throw new HttpError(403, 'Only the current holder can add faces to this rock.', 'not_owner')
  if (kind === 0 && getAddress(avatar.seed) === payer) return { free: true, live: true, kind: 'wallet', label: 'Free', usd: 0 }
  const st = await quoteStatus()
  if (!st.live) return { free: false, live: false, reason: st.reason }
  const price = await gearPrice()
  const whole = BigInt(Math.floor(FACE_FEE_USD / price.priceUsd))
  const gearAmount = whole * 10n ** 6n
  const [minFee, maxFee] = await Promise.all([
    client.readContract({ ...rocks, functionName: 'minFaceFee' }),
    client.readContract({ ...rocks, functionName: 'maxFaceFee' }),
  ])
  if (whole < 1n || gearAmount < minFee || gearAmount > maxFee) throw new HttpError(503, 'Face fee is outside the contract fee bounds right now.', 'fee_bounds')
  const quote = { payer, tokenId: id, kind, gearAmount, nonce: BigInt(randomNonce()), validUntil: BigInt(Math.floor(Date.now() / 1000) + QUOTE_TTL_S) }
  const signature = await st.acct.signTypedData({
    domain: { name: 'CAPs Rocks', version: '1', chainId: 8453, verifyingContract: rocks.address },
    types: { FaceQuote: [
      { name: 'payer', type: 'address' }, { name: 'tokenId', type: 'uint256' }, { name: 'kind', type: 'uint8' },
      { name: 'gearAmount', type: 'uint256' }, { name: 'nonce', type: 'uint256' }, { name: 'validUntil', type: 'uint256' },
    ] },
    primaryType: 'FaceQuote',
    message: quote,
  })
  return {
    free: false, live: true, kind: kind === 0 ? 'wallet' : 'custom', usd: FACE_FEE_USD, gear: whole.toString(), label: `~${whole} GEAR`,
    price, quote: Object.fromEntries(Object.entries(quote).map(([k, v]) => [k, typeof v === 'bigint' ? v.toString() : v])), signature,
  }
}
