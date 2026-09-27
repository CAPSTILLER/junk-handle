/** Server-only helpers for the MY8 Vercel functions. Never import from src/. */
import { createPublicClient, fallback, http, isAddress, getAddress, toHex, type Address, type Hex } from 'viem'
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import { MY8_ABI, MY8_CONTRACT, PUBLIC_BASE_RPCS } from '../../shared/my8.js'

export type Req = {
  method?: string
  body?: unknown
  query: Record<string, string | string[] | undefined>
  headers: Record<string, string | string[] | undefined>
}
export type Res = {
  status: (code: number) => Res
  setHeader: (k: string, v: string) => unknown
  json: (body: unknown) => unknown
  send: (body: unknown) => unknown
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = 'error') {
    super(message)
  }
}

const rpcs = [process.env.BASE_RPC_URL, ...PUBLIC_BASE_RPCS].filter(Boolean) as string[]
export const client = createPublicClient({
  chain: base,
  transport: fallback(rpcs.map((u) => http(u, { timeout: 8_000, retryCount: 1 }))),
  batch: { multicall: true },
})

/** VOUCHER_SIGNER_KEY: server-only env (Vercel, Sensitive). Never exposed to the client. */
export function getSigner(): PrivateKeyAccount {
  let k = (process.env.VOUCHER_SIGNER_KEY ?? '').trim()
  if (!k) throw new HttpError(503, 'Server signer key is not configured (VOUCHER_SIGNER_KEY missing).', 'signer_missing')
  if (!k.startsWith('0x')) k = '0x' + k
  if (!/^0x[0-9a-fA-F]{64}$/.test(k)) throw new HttpError(503, 'VOUCHER_SIGNER_KEY is malformed.', 'signer_malformed')
  return privateKeyToAccount(k as Hex)
}

/** Signer must equal the contract's oracleSigner(), else vouchers would revert onchain. */
export async function getCheckedSigner(): Promise<PrivateKeyAccount> {
  const acct = getSigner()
  const onchain = await client.readContract({ address: MY8_CONTRACT, abi: MY8_ABI, functionName: 'oracleSigner' })
  if (getAddress(onchain) !== getAddress(acct.address)) {
    throw new HttpError(503, `Server signer ${acct.address} does not match contract oracleSigner ${onchain}.`, 'signer_mismatch')
  }
  return acct
}

export async function assertNotPaused(): Promise<void> {
  const p = await client.readContract({ address: MY8_CONTRACT, abi: MY8_ABI, functionName: 'paused' })
  if (p) throw new HttpError(409, 'Minting and updates are paused by the contract owner.', 'paused')
}

export function parseAddress(v: unknown): Address {
  if (typeof v !== 'string' || !isAddress(v, { strict: false })) throw new HttpError(400, 'Invalid address', 'bad_address')
  return getAddress(v)
}

export function parseTokenId(v: unknown): bigint {
  const s = typeof v === 'number' ? String(v) : v
  if (typeof s !== 'string' || !/^\d{1,78}$/.test(s)) throw new HttpError(400, 'Invalid tokenId', 'bad_token')
  return BigInt(s)
}

export async function ownerOf(tokenId: bigint): Promise<Address | null> {
  try {
    return await client.readContract({ address: MY8_CONTRACT, abi: MY8_ABI, functionName: 'ownerOf', args: [tokenId] })
  } catch {
    return null
  }
}

export const randomNonce = (): Hex => toHex(crypto.getRandomValues(new Uint8Array(32)))

export function body(req: Req): Record<string, unknown> {
  let b = req.body
  if (typeof b === 'string') {
    try { b = JSON.parse(b) } catch { throw new HttpError(400, 'Body must be JSON', 'bad_json') }
  }
  if (!b || typeof b !== 'object') throw new HttpError(400, 'Body must be a JSON object', 'bad_json')
  return b as Record<string, unknown>
}

export function requestHost(req: Req): string {
  const h = req.headers['x-forwarded-host'] ?? req.headers.host
  return (Array.isArray(h) ? h[0] : h ?? '').split(',')[0].trim()
}

export function handle(methods: string[], fn: (req: Req, res: Res) => Promise<unknown>) {
  return async (req: Req, res: Res) => {
    res.setHeader('Cache-Control', 'no-store')
    if (!methods.includes(req.method ?? 'GET')) {
      res.setHeader('Allow', methods.join(', '))
      return res.status(405).json({ error: 'Method not allowed', code: 'method' })
    }
    try {
      const out = await fn(req, res)
      if (out !== undefined) res.status(200).json(out)
    } catch (e) {
      if (e instanceof HttpError) return res.status(e.status).json({ error: e.message, code: e.code })
      console.error(e)
      return res.status(502).json({ error: 'Chain read or signing failed. Try again.', code: 'upstream' })
    }
  }
}
