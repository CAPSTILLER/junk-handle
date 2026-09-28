/** Live Base mainnet integration for My Wally (MY8): wallet, reads, vouchers, txs. */
import {
  BaseError,
  ContractFunctionRevertedError,
  UserRejectedRequestError,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  numberToHex,
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
import type { Design } from '../../shared/design'

export const publicClient = createPublicClient({
  chain: base,
  transport: fallback(PUBLIC_BASE_RPCS.map((u) => http(u, { timeout: 10_000 }))),
  batch: { multicall: true },
})

export const fmtFrlz = (v: bigint) =>
  Number(formatUnits(v, FRLZ_DECIMALS)).toLocaleString(undefined, { maximumFractionDigits: 2 })
export const txUrl = (h: string) => `${BASESCAN}/tx/${h}`
export const tokenUrl = (id: string | bigint) => `${BASESCAN}/nft/${MY8_CONTRACT}/${id}`


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
  designStorage?: 'ok' | 'missing'
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

export async function ensureChain(p: EIP1193Provider) {
  if ((await getChainId(p)) !== MY8_CHAIN_ID) await switchToBase(p)
  if ((await getChainId(p)) !== MY8_CHAIN_ID) throw new Error('Please switch your wallet to Base')
}

// ---------------------------------------------------------------- fully-specified write txs
/**
 * Some wallets (notably the Coinbase Wallet extension) hang on "estimating fee". So every write is fully specified:
 * gas limit (our own RPC estimate +30%, or a fixed fallback), EIP-1559 fees from our RPC, chainId, nonce, value 0.
 * Sent with raw eth_sendTransaction; if a 1559 send errors (not a user rejection), retry once with legacy gasPrice.
 */
export type TxStage = 'preparing' | 'wallet' | 'confirming'
export type TxHooks = { signal?: AbortSignal; onStage?: (s: TxStage) => void }
export type TxParams = {
  from: Address; to: Address; data: Hex; value: Hex; chainId?: Hex; nonce?: Hex; gas?: Hex
  maxFeePerGas?: Hex; maxPriorityFeePerGas?: Hex; gasPrice?: Hex
}
/** A pre-built tx (built before the click so the wallet request fires immediately on click). */
export type PreparedTx = { params: TxParams; builtAt: number }

export type SendMode = 'prefilled' | 'simple'
const lsGet = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* ignore */ } }
/** Default 'prefilled': the Coinbase extension hung in its own fee estimation when left to estimate. */
export const getSendMode = (): SendMode => (lsGet('my8.sendMode') === 'simple' ? 'simple' : 'prefilled')
export const setSendMode = (m: SendMode) => lsSet('my8.sendMode', m)
export const getIncludeNonce = () => lsGet('my8.includeNonce') === '1'
export const setIncludeNonce = (v: boolean) => lsSet('my8.includeNonce', v ? '1' : '0')

export const GAS_FALLBACK = { setBaseURI: 150_000n, approve: 80_000n, mint: 400_000n, update: 300_000n } as const
const GWEI = 1_000_000_000n
const PRIORITY_MIN = GWEI / 1000n // 0.001 gwei
const PRIORITY_MAX = GWEI / 100n // 0.01 gwei
const BASEFEE_FLOOR = GWEI / 200n // 0.005 gwei

export class CancelledError extends Error {
  constructor() { super('Cancelled — you can try again. If your wallet still shows the request, reject it there.') }
}

function abortable<T>(pr: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return pr
  if (signal.aborted) return Promise.reject(new CancelledError())
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new CancelledError())
    signal.addEventListener('abort', onAbort, { once: true })
    pr.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

export async function buildTx(
  from: Address, to: Address, data: Hex, fallbackGas: bigint, includeNonce = getIncludeNonce(),
): Promise<PreparedTx> {
  const [gasEst, block, prioSuggested, nonce] = await Promise.all([
    publicClient.estimateGas({ account: from, to, data, value: 0n }).catch(() => null),
    publicClient.getBlock({ blockTag: 'latest' }),
    publicClient.estimateMaxPriorityFeePerGas().catch(() => PRIORITY_MIN),
    includeNonce ? publicClient.getTransactionCount({ address: from, blockTag: 'pending' }) : Promise.resolve(null),
  ])
  const gas = gasEst ? (gasEst * 130n) / 100n : fallbackGas
  const baseFee = block.baseFeePerGas && block.baseFeePerGas > BASEFEE_FLOOR ? block.baseFeePerGas : BASEFEE_FLOOR
  const prio = prioSuggested < PRIORITY_MIN ? PRIORITY_MIN : prioSuggested > PRIORITY_MAX ? PRIORITY_MAX : prioSuggested
  const params: TxParams = {
    from, to, data, value: '0x0', chainId: numberToHex(MY8_CHAIN_ID), gas: numberToHex(gas),
    maxFeePerGas: numberToHex(baseFee * 2n + prio), maxPriorityFeePerGas: numberToHex(prio),
  }
  if (nonce !== null) params.nonce = numberToHex(nonce)
  return { params, builtAt: Date.now() }
}

/** Explicitly switch the chosen provider to Base and return its selected account string exactly as the wallet reports it. */
export async function readyProvider(p: EIP1193Provider, expected: Address): Promise<Address> {
  await switchToBase(p)
  const accts = ((await p.request({ method: 'eth_accounts' })) as string[]) ?? []
  const acct = accts.find((a) => a.toLowerCase() === expected.toLowerCase())
  if (!acct) {
    throw new Error(accts[0]
      ? `Your wallet's selected account is ${accts[0].slice(0, 6)}…${accts[0].slice(-4)}, not ${expected.slice(0, 6)}…${expected.slice(-4)}. Switch accounts in the wallet.`
      : 'Wallet is locked or disconnected. Open it and reconnect.')
  }
  return acct as Address
}

const isUserReject = (e: unknown) => {
  const c = (e as { code?: number })?.code
  const m = e instanceof Error ? e.message : String(e)
  return c === 4001 || /user (rejected|denied)|rejected by user|user cancel/i.test(m)
}

export async function sendTx(
  p: EIP1193Provider, from: Address, to: Address, data: Hex, fallbackGas: bigint, hooks: TxHooks = {}, pre?: PreparedTx | null,
): Promise<Hex> {
  hooks.onStage?.('preparing')
  const acct = await abortable(readyProvider(p, from), hooks.signal)
  const mode = getSendMode()
  let params: TxParams
  if (mode === 'simple') {
    params = { from: acct, to, data, value: '0x0' }
  } else {
    const fresh = pre && pre.params.to.toLowerCase() === to.toLowerCase() && pre.params.data === data && Date.now() - pre.builtAt < 30_000
    const built = fresh ? pre! : await abortable(buildTx(from, to, data, fallbackGas), hooks.signal)
    params = { ...built.params, from: acct }
  }
  hooks.onStage?.('wallet')
  const send = (x: TxParams) =>
    abortable(p.request({ method: 'eth_sendTransaction', params: [x] } as never) as Promise<Hex>, hooks.signal)
  let hash: Hex
  try {
    hash = await send(params)
  } catch (e) {
    if (mode === 'simple' || e instanceof CancelledError || isUserReject(e)) throw e
    const { maxFeePerGas, maxPriorityFeePerGas, ...legacy } = params
    void maxPriorityFeePerGas
    hash = await send({ ...legacy, gasPrice: maxFeePerGas })
  }
  hooks.onStage?.('confirming')
  const r = await publicClient.waitForTransactionReceipt({ hash })
  if (r.status !== 'success') throw new Error('The transaction failed onchain.')
  return hash
}

/** Approve exactly `amount` FRLZ to the MY8 contract. */
export async function approveExact(p: EIP1193Provider, account: Address, amount: bigint, hooks?: TxHooks): Promise<Hex> {
  const { balance } = await readFrlz(account)
  if (balance < amount) throw new Error(`Insufficient FRLZ: need ${fmtFrlz(amount)}, have ${fmtFrlz(balance)}`)
  const data = encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [MY8_CONTRACT, amount] })
  return sendTx(p, account, FRLZ_TOKEN, data, GAS_FALLBACK.approve, hooks)
}

type RawVoucher = { user: Address; traitsHash: Hex; frlzAmount: string; validUntil: string; nonce: Hex; signature: Hex; tokenId?: string }
type VoucherResp = { traits: Hex; voucher: RawVoucher; usd: number; frlz: string; designSaved?: boolean; designNote?: string }

/** A server-signed voucher with its FRLZ amount locked (valid ~15 min). */
export type Prepared = {
  kind: 'mint' | 'update'
  tokenId: bigint | null
  traits: Hex
  amount: bigint
  usd: number
  validUntil: bigint
  /** Design JSON stashed server-side with this voucher (null if storage missing/failed). */
  designJson: string | null
  designNote?: string
  voucher: { user: Address; traitsHash: Hex; frlzAmount: bigint; validUntil: bigint; nonce: Hex; signature: Hex }
}

export async function prepareVoucher(account: Address, traits: Hex, tokenId: bigint | null, design: Design): Promise<Prepared> {
  const r = tokenId === null
    ? await api<VoucherResp>('/api/voucher/mint', { body: { address: account, traits, design } })
    : await api<VoucherResp>('/api/voucher/update', { body: { address: account, tokenId: tokenId.toString(), traits, design } })
  if (!r.designSaved) console.warn('[design] not saved with voucher:', r.designNote)
  const { tokenId: _t, ...v } = r.voucher
  void _t
  const voucher = { ...v, frlzAmount: BigInt(v.frlzAmount), validUntil: BigInt(v.validUntil) }
  return {
    kind: tokenId === null ? 'mint' : 'update', tokenId, traits: r.traits, amount: voucher.frlzAmount, usd: r.usd, validUntil: voucher.validUntil, voucher,
    designJson: r.designSaved ? JSON.stringify(design) : null, designNote: r.designNote,
  }
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
export async function submitVoucher(
  p: EIP1193Provider, account: Address, prep: Prepared, hooks?: TxHooks,
): Promise<{ hash: Hex; tokenId: bigint | null }> {
  await preflight(account, prep.amount)
  let data: Hex
  if (prep.kind === 'mint') {
    await publicClient.simulateContract({ account, address: MY8_CONTRACT, abi: MY8_ABI, functionName: 'mint', args: [prep.traits, prep.voucher] })
    data = encodeFunctionData({ abi: MY8_ABI, functionName: 'mint', args: [prep.traits, prep.voucher] })
  } else {
    const v = { ...prep.voucher, tokenId: prep.tokenId! }
    await publicClient.simulateContract({ account, address: MY8_CONTRACT, abi: MY8_ABI, functionName: 'updateModel', args: [prep.tokenId!, prep.traits, v] })
    data = encodeFunctionData({ abi: MY8_ABI, functionName: 'updateModel', args: [prep.tokenId!, prep.traits, v] })
  }
  const hash = await sendTx(p, account, MY8_CONTRACT, data, prep.kind === 'mint' ? GAS_FALLBACK.mint : GAS_FALLBACK.update, hooks)
  if (prep.kind !== 'mint') return { hash, tokenId: prep.tokenId }
  const r = await publicClient.getTransactionReceipt({ hash })
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

export type DownloadGrant = { tokenId: string; owner: Address; traits: StudioTraits; traitsHex: Hex; expiresAt: number; grant: Hex }

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
  return { tokenId: r.tokenId, owner: r.owner, traits: decodeTraits(r.traits), traitsHex: r.traits, expiresAt: r.expiresAt, grant: r.grant }
}

// ---------------------------------------------------------------- saved designs (full studio state per token)
/** Saved design for a token, or null (none saved / storage missing / onchain traits changed since). */
export async function fetchDesign(tokenId: bigint | string): Promise<Design | null> {
  try {
    const r = await api<{ design: Design | null }>(`/api/design/${tokenId.toString()}`)
    return r.design
  } catch (e) {
    console.warn('[design] fetch failed', e)
    return null
  }
}

/** Studio changed after the voucher was issued → update the stashed design before the tx (best effort). */
export async function refreshPendingDesign(prep: Prepared, design: Design): Promise<void> {
  if (!prep.designJson || prep.designJson === JSON.stringify(design)) return
  try {
    await api('/api/design/pending', { body: { nonce: prep.voucher.nonce, signature: prep.voucher.signature, design } })
    prep.designJson = JSON.stringify(design)
  } catch (e) {
    console.warn('[design] pending refresh failed', e)
  }
}

/** After the tx lands, promote the stashed design to the token (retries while RPCs catch up). */
export async function confirmDesign(prep: Prepared, txHash: Hex): Promise<{ ok: boolean; note?: string }> {
  if (!prep.designJson) return { ok: false, note: prep.designNote ?? 'design storage unavailable' }
  let last = ''
  for (let i = 0; i < 5; i++) {
    try {
      await api('/api/design/confirm', { body: { txHash, nonce: prep.voucher.nonce } })
      return { ok: true }
    } catch (e) {
      last = e instanceof Error ? e.message : String(e)
      if (!/not found yet|not used onchain|retry/i.test(last)) break
      await new Promise((r) => setTimeout(r, 2500))
    }
  }
  console.warn('[design] confirm failed:', last)
  return { ok: false, note: last }
}

/** Owner backfill: save the current studio design for a token (auth = oracle-signed download grant). */
export async function saveDesignWithGrant(g: DownloadGrant, design: Design): Promise<void> {
  await api('/api/design/save', {
    body: { tokenId: g.tokenId, address: g.owner, traits: g.traitsHex, expiresAt: g.expiresAt, grant: g.grant, design },
  })
}

export function friendlyError(e: unknown): string {
  if (e instanceof CancelledError) return e.message
  if (e instanceof BaseError) {
    if (e.walk((x) => x instanceof UserRejectedRequestError)) return 'Request rejected in wallet.'
    const rev = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null
    if (rev) {
      const name = rev.data?.errorName
      if (name === 'OwnableUnauthorizedAccount') return 'Only the owner wallet can do this.'
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
