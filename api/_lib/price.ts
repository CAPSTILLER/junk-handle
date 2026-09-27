/** Live FRLZ/USD price for USD-pegged fees. Onchain first (no API key), DexScreener fallback + cross-check. */
import { parseAbi } from 'viem'
import {
  CHAINLINK_ETH_USD_BASE, DEXSCREENER_FRLZ_URL, FRLZ_DECIMALS, FRLZ_TOKEN, FRLZ_WETH_V2_PAIR, MINT_FEE_USD,
  PRICE_CACHE_SECONDS, PRICE_MAX_DEVIATION, UPDATE_FEE_USD, WETH_BASE, ceilClean, type FeeQuote, type Quote,
} from '../../shared/my8.js'
import { HttpError, client } from './server.js'

const PAIR_ABI = parseAbi([
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 ts)',
  'function token0() view returns (address)',
])
const FEED_ABI = parseAbi(['function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)'])
const MIN_PRICE = 1e-12
const MAX_PRICE = 100
const MIN_POOL_WETH_USD = 1_000
const MAX_FEED_AGE_S = 3_600

const sane = (p: number | null) => (p !== null && Number.isFinite(p) && p > MIN_PRICE && p < MAX_PRICE ? p : null)

export async function onchainPrice(): Promise<number | null> {
  try {
    const [[r0, r1], token0, round] = await Promise.all([
      client.readContract({ address: FRLZ_WETH_V2_PAIR, abi: PAIR_ABI, functionName: 'getReserves' }),
      client.readContract({ address: FRLZ_WETH_V2_PAIR, abi: PAIR_ABI, functionName: 'token0' }),
      client.readContract({ address: CHAINLINK_ETH_USD_BASE, abi: FEED_ABI, functionName: 'latestRoundData' }),
    ])
    const frlzIs0 = token0.toLowerCase() === FRLZ_TOKEN.toLowerCase()
    const [rf, rw] = frlzIs0 ? [r0, r1] : [r1, r0]
    if (!frlzIs0 && token0.toLowerCase() !== WETH_BASE.toLowerCase()) return null
    const ethUsd = Number(round[1]) / 1e8
    const age = Date.now() / 1000 - Number(round[3])
    if (!(ethUsd > 100 && ethUsd < 100_000) || age > MAX_FEED_AGE_S) return null
    const weth = Number(rw) / 1e18
    const frlz = Number(rf) / 10 ** FRLZ_DECIMALS
    if (weth * ethUsd < MIN_POOL_WETH_USD || frlz <= 0) return null
    return sane((weth / frlz) * ethUsd)
  } catch (e) {
    console.error('onchain price failed', e)
    return null
  }
}

export async function dexscreenerPrice(): Promise<number | null> {
  try {
    const res = await fetch(DEXSCREENER_FRLZ_URL, { signal: AbortSignal.timeout(6_000) })
    if (!res.ok) return null
    const d = (await res.json()) as { pairs?: { chainId?: string; priceUsd?: string; baseToken?: { address?: string }; liquidity?: { usd?: number } }[] }
    const best = (d.pairs ?? [])
      .filter((p) => p.chainId === 'base' && p.baseToken?.address?.toLowerCase() === FRLZ_TOKEN.toLowerCase() && p.priceUsd)
      .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0]
    return best ? sane(Number(best.priceUsd)) : null
  } catch (e) {
    console.error('dexscreener price failed', e)
    return null
  }
}

function fee(usd: number, priceUsd: number): FeeQuote {
  const frlz = ceilClean(usd / priceUsd)
  return { usd, frlz: frlz.toString(), frlzWei: (frlz * 10n ** BigInt(FRLZ_DECIMALS)).toString() }
}

let cache: Quote | null = null

export async function getQuote(): Promise<Quote> {
  if (cache && Date.now() - cache.quotedAt < PRICE_CACHE_SECONDS * 1000) return cache
  const [onchain, dex] = await Promise.all([onchainPrice(), dexscreenerPrice()])
  if (onchain === null && dex === null) throw new HttpError(503, 'FRLZ price unavailable right now; try again shortly.', 'price_unavailable')
  if (onchain !== null && dex !== null && Math.abs(onchain - dex) / Math.min(onchain, dex) > PRICE_MAX_DEVIATION) {
    throw new HttpError(503, 'FRLZ price sources disagree (market moving fast); try again shortly.', 'price_mismatch')
  }
  const priceUsd = onchain ?? dex!
  cache = {
    priceUsd,
    source: onchain !== null ? 'onchain' : 'dexscreener',
    sources: { onchain, dexscreener: dex },
    quotedAt: Date.now(),
    mint: fee(MINT_FEE_USD, priceUsd),
    revision: fee(UPDATE_FEE_USD, priceUsd),
  }
  return cache
}
