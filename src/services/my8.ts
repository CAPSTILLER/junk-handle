/** Live Base mainnet integration for My Wally (MY8): wallet, reads, vouchers, txs. */
import {
  BaseError,
  ContractFunctionRevertedError,
  UserRejectedRequestError,
  createPublicClient,
  createWalletClient,
  custom,
  fallback,
  formatUnits,
  getAddress,
  http,
  parseEventLogs,
  recoverMessageAddress,
  type Address,
  type EIP1193Provider,
  type Hex,
  type WalletClient,
} from 'viem'
import { base } from 'viem/chains'
import {
  BASESCAN,
  ERC20_ABI,
  FRLZ_DECIMALS,
  FRLZ_TOKEN,
  MY8_ABI,
  MY8_CHAIN_ID,
  MY8_CONTRACT,
  PUBLIC_BASE_RPCS,
  buildDownloadMessage,
  buildGrantMessage,
  decodeTraits,
  type Quote,
  type StudioTraits,
} from '../../shared/my8'

export const publicClient = createPublicClient({
  chain: base,
  transport: fallback(PUBLIC_BASE_RPCS.map((u) => http(u, { timeout: 10_000 }))),
  batch: { multicall: true },
})

export const fmtFrlz = (v: bigint) =>
  Number(formatUnits(v, FRLZ_DECIMALS)).toLocaleString(undefined, { maximumFractionDigits: 2 })
export const txUrl = (h: string) => `${BASESCAN}/tx/${h}`
export const tokenUrl = (id: string | bigint) => `${BASESCAN}/nft/${MY8_CONTRACT}/${id}`

export function getProvider(): EIP1193Provider | null {
  return (typeof window !== 'undefined' && (window as unknown as { ethereum?: EIP1193Provider }).ethereum) || null
}

export async function connectWallet(p: EIP1193Provider): Promise<Address> {
  const accts = (await p.request({ method: 'eth_requestAccounts' })) as string[]
  if (!accts?.length) throw new Error('No account authorized')
  return getAddress(accts[0])
}

export async function getChainId(p: EIP1193Provider): Promise<number> {
  return Number(await p.request({ method: 'eth_chainId' }))
}

export async function switchToBase(p: EIP1193Provider): Promise<void> {
  const hex = `0x${MY8_CHAIN_ID.toString(16)}` as const
  try {
    await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] })
  } catch (e) {
    const code = (e as { code?: number; data?: { originalError?: { code?: number } } }).code
    if (code === 4902 || (e as { data?: { originalError?: { code?: number } } }).data?.originalError?.code === 4902) {
      await p.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: hex,
          chainName: 'Base',
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: ['https://mainnet.base.org'],
          blockExplorerUrls: [BASESCAN],
        }],
      })
    } else throw e
  }
}

export function makeWallet(p: EIP1193Provider, account: Address): WalletClient {
  return createWalletClient({ account, chain: base, transport: custom(p) })
}

export type ServerStatus = {
  paused: boolean
  oracleSigner: Address
  signer: 'missing' | 'mismatch' | 'ok'
  nextTokenId: string
}

async function api<T>(path: string, init?: { body: unknown }): Promise<T> {
  const res = await fetch(path, init
    ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(init.body) }
    : undefined)
  const text = await res.text()
  let data: unknown
  try { data = JSON.parse(text) } catch { throw new Error(`Server returned ${res.status} (API unavailable?)`) }
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Server error ${res.status}`)
  return data as T
}

export const fetchStatus = () => api<ServerStatus>('/api/status')
export const fetchQuote = () => api<Quote>('/api/quote')

export async function readFrlz(user: Address) {
  const [balance, allowance] = await Promise.all([
    publicClient.readContract({ address: FRLZ_TOKEN, abi: ERC20_ABI, functionName: 'balanceOf', args: [user] }),
    publicClient.readContract({ address: FRLZ_TOKEN, abi: ERC20_ABI, functionName: 'allowance', args: [user, MY8_CONTRACT] }),
  ])
  return { balance, allowance }
}

async function ensureChain(p: EIP1193Provider) {
  if ((await getChainId(p)) !== MY8_CHAIN_ID) await switchToBase(p)
  if ((await getChainId(p)) !== MY8_CHAIN_ID) throw new Error('Please switch your wallet to Base')
}

/** Approve exactly `amount` FRLZ to the MY8 contract. */
export async function approveExact(p: EIP1193Provider, account: Address, amount: bigint): Promise<Hex> {
  await ensureChain(p)
  const { balance } = await readFrlz(account)
  if (balance < amount) throw new Error(`Insufficient FRLZ: need ${fmtFrlz(amount)}, have ${fmtFrlz(balance)}`)
  const hash = await makeWallet(p, account).writeContract({
    account, chain: base, address: FRLZ_TOKEN, abi: ERC20_ABI, functionName: 'approve', args: [MY8_CONTRACT, amount],
  })
  const r = await publicClient.waitForTransactionReceipt({ hash })
  if (r.status !== 'success') throw new Error('Approve transaction failed')
  return hash
}

type RawVoucher = { user: Address; traitsHash: Hex; frlzAmount: string; validUntil: string; nonce: Hex; signature: Hex; tokenId?: string }
type VoucherResp = { traits: Hex; voucher: RawVoucher; usd: number; frlz: string }

/** A server-signed voucher with its FRLZ amount locked (valid ~15 min). */
export type Prepared = {
  kind: 'mint' | 'update'
  tokenId: bigint | null
  traits: Hex
  amount: bigint
  usd: number
  validUntil: bigint
  voucher: { user: Address; traitsHash: Hex; frlzAmount: bigint; validUntil: bigint; nonce: Hex; signature: Hex }
}

export async function prepareVoucher(account: Address, traits: Hex, tokenId: bigint | null): Promise<Prepared> {
  const r = tokenId === null
    ? await api<VoucherResp>('/api/voucher/mint', { body: { address: account, traits } })
    : await api<VoucherResp>('/api/voucher/update', { body: { address: account, tokenId: tokenId.toString(), traits } })
  const { tokenId: _t, ...v } = r.voucher
  void _t
  const voucher = { ...v, frlzAmount: BigInt(v.frlzAmount), validUntil: BigInt(v.validUntil) }
  return { kind: tokenId === null ? 'mint' : 'update', tokenId, traits: r.traits, amount: voucher.frlzAmount, usd: r.usd, validUntil: voucher.validUntil, voucher }
}

/** Still usable for this action/traits with ≥60s left? */
export function isUsable(p: Prepared | null, traits: Hex, tokenId: bigint | null, account: Address): p is Prepared {
  return !!p && p.traits === traits && p.tokenId === tokenId && p.voucher.user.toLowerCase() === account.toLowerCase() &&
    Number(p.validUntil) - 60 > Date.now() / 1000
}

async function preflight(account: Address, amount: bigint) {
  const { balance, allowance } = await readFrlz(account)
  if (balance < amount) throw new Error(`Insufficient FRLZ: need ${fmtFrlz(amount)}, have ${fmtFrlz(balance)}`)
  if (allowance < amount) throw new Error(`Approve ${fmtFrlz(amount)} FRLZ first`)
}

/** Submit a prepared voucher (mint or updateModel). Returns tx hash and minted tokenId (mint only). */
export async function submitVoucher(p: EIP1193Provider, account: Address, prep: Prepared): Promise<{ hash: Hex; tokenId: bigint | null }> {
  await ensureChain(p)
  await preflight(account, prep.amount)
  const wallet = makeWallet(p, account)
  let hash: Hex
  if (prep.kind === 'mint') {
    const { request } = await publicClient.simulateContract({ account, address: MY8_CONTRACT, abi: MY8_ABI, functionName: 'mint', args: [prep.traits, prep.voucher] })
    hash = await wallet.writeContract({ ...request, account, chain: base })
  } else {
    const v = { ...prep.voucher, tokenId: prep.tokenId! }
    const { request } = await publicClient.simulateContract({ account, address: MY8_CONTRACT, abi: MY8_ABI, functionName: 'updateModel', args: [prep.tokenId!, prep.traits, v] })
    hash = await wallet.writeContract({ ...request, account, chain: base })
  }
  const r = await publicClient.waitForTransactionReceipt({ hash })
  if (r.status !== 'success') throw new Error(prep.kind === 'mint' ? 'Mint transaction failed' : 'Revision transaction failed')
  if (prep.kind !== 'mint') return { hash, tokenId: prep.tokenId }
  const minted = parseEventLogs({ abi: MY8_ABI, eventName: 'Transfer', logs: r.logs }).find(
    (l) => getAddress(l.address) === getAddress(MY8_CONTRACT) && BigInt(l.args.from) === 0n,
  )
  return { hash, tokenId: minted ? minted.args.tokenId : null }
}

/** Tokens owned by `user` (contract has no enumerable ext; scan ownerOf over 1..nextTokenId-1). */
export async function listOwned(user: Address): Promise<bigint[]> {
  const bal = await publicClient.readContract({ address: MY8_CONTRACT, abi: MY8_ABI, functionName: 'balanceOf', args: [user] })
  if (bal === 0n) return []
  const next = await publicClient.readContract({ address: MY8_CONTRACT, abi: MY8_ABI, functionName: 'nextTokenId' })
  const out: bigint[] = []
  const ids = Array.from({ length: Number(next) - 1 }, (_, i) => BigInt(i + 1))
  for (let i = 0; i < ids.length && BigInt(out.length) < bal; i += 400) {
    const chunk = ids.slice(i, i + 400)
    const res = await publicClient.multicall({
      contracts: chunk.map((id) => ({ address: MY8_CONTRACT, abi: MY8_ABI, functionName: 'ownerOf' as const, args: [id] as const })),
      allowFailure: true,
    })
    res.forEach((r, k) => {
      if (r.status === 'success' && getAddress(r.result as Address) === user) out.push(chunk[k])
    })
  }
  return out
}

export async function readTraits(tokenId: bigint): Promise<StudioTraits> {
  const raw = await publicClient.readContract({ address: MY8_CONTRACT, abi: MY8_ABI, functionName: 'getTraits', args: [tokenId] })
  return decodeTraits(raw)
}

export type DownloadGrant = { tokenId: string; owner: Address; traits: StudioTraits; expiresAt: number }

/** Free signature (no tx) → server checks ownerOf → returns onchain traits + oracle-signed grant. */
export async function verifyOwnerForDownload(
  p: EIP1193Provider, account: Address, tokenId: bigint, oracleSigner: Address,
): Promise<DownloadGrant> {
  const message = buildDownloadMessage({
    tokenId: tokenId.toString(), address: account, domain: window.location.host, issuedAt: new Date().toISOString(),
  })
  const signature = await makeWallet(p, account).signMessage({ account, message })
  const r = await api<{ ok: boolean; tokenId: string; owner: Address; traits: Hex; expiresAt: number; grant: Hex }>(
    '/api/download/verify', { body: { address: account, tokenId: tokenId.toString(), message, signature } },
  )
  const signer = await recoverMessageAddress({
    message: buildGrantMessage({ tokenId: r.tokenId, address: r.owner, traits: r.traits, expiresAt: r.expiresAt }),
    signature: r.grant,
  })
  if (!r.ok || getAddress(signer) !== getAddress(oracleSigner)) throw new Error('Download grant could not be verified')
  return { tokenId: r.tokenId, owner: r.owner, traits: decodeTraits(r.traits), expiresAt: r.expiresAt }
}

export function friendlyError(e: unknown): string {
  if (e instanceof BaseError) {
    if (e.walk((x) => x instanceof UserRejectedRequestError)) return 'Request rejected in wallet.'
    const rev = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null
    if (rev) {
      const name = rev.data?.errorName
      if (name === 'EnforcedPause') return 'Contract is paused by the owner. Try again later.'
      if (name === 'ERC20InsufficientAllowance' || rev.reason?.includes('Panic') || name === 'Panic') return 'FRLZ allowance/balance too low — approve the exact fee first.'
      if (name === 'ERC20InsufficientBalance') return 'Insufficient FRLZ balance.'
      if (rev.reason === 'Invalid oracle signature') return 'Voucher signature rejected by contract (server signer key does not match oracleSigner).'
      if (rev.reason) return `Contract reverted: ${rev.reason}`
      if (name) return `Contract reverted: ${name}`
    }
    if (/insufficient funds/i.test(e.message)) return 'Not enough ETH on Base for gas.'
    return e.shortMessage || e.message
  }
  const msg = e instanceof Error ? e.message : String(e)
  if (/user rejected|denied|4001/i.test(msg)) return 'Request rejected in wallet.'
  return msg
}
