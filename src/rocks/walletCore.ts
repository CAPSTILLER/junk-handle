/**
 * Copied from CAPs mind (caps-mind-prophecies/src/walletCore.ts): no-picker wallet controller.
 * Prefers injected window.ethereum, otherwise Coinbase Smart Wallet (smartWalletOnly). Connect is read-only
 * (eth_requestAccounts only); signatures happen only on writes and downloads.
 */
import { getAddress, type Address } from 'viem'

export type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  on?: (event: string, cb: (...args: unknown[]) => void) => void
  disconnect?: () => Promise<void>
}
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export type WalletState = { account: Address | null; chainId: number | null; hasProvider: boolean; busy: boolean }
export type ProviderSource = { peek: () => Eip1193 | undefined; resolve: () => Promise<Eip1193> }

export const REMEMBER_KEY = 'capsrocks.wallet.connected'
export const BASE_CHAIN_ID = 8453
export const shortAddress = (a: string) => a.slice(0, 6) + '…' + a.slice(-4)

export function walletButtonView(s: WalletState): { label: string; connected: boolean; title: string } {
  if (s.account) {
    return {
      label: `Connected ${shortAddress(s.account)}`,
      connected: true,
      title: s.chainId === BASE_CHAIN_ID ? 'Tap to disconnect' : 'Connected, but not on Base. Tap to disconnect.',
    }
  }
  if (s.busy) return { label: 'Connecting…', connected: false, title: 'Check your wallet' }
  return { label: 'Connect wallet', connected: false, title: 'Tap to connect your wallet' }
}

export class WalletController {
  state: WalletState
  private listeners = new Set<(s: WalletState) => void>()
  private active: Eip1193 | undefined
  private eventsWired = false

  constructor(private providers: ProviderSource, private store: KeyValueStore | null, private chainId = BASE_CHAIN_ID) {
    this.state = { account: null, chainId: null, hasProvider: true, busy: false }
  }
  provider(): Eip1193 | undefined { return this.active || this.providers.peek() }
  subscribe(fn: (s: WalletState) => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  private set(patch: Partial<WalletState>) { this.state = { ...this.state, ...patch }; for (const fn of this.listeners) fn(this.state) }
  private remember(on: boolean) { try { if (on) this.store?.setItem(REMEMBER_KEY, '1'); else this.store?.removeItem(REMEMBER_KEY) } catch { /* blocked */ } }
  private remembered(): boolean { try { return this.store?.getItem(REMEMBER_KEY) === '1' } catch { return false } }
  private async readChain(eth: Eip1193): Promise<number | null> { try { return Number(await eth.request({ method: 'eth_chainId' })) } catch { return null } }
  private wireEvents(eth: Eip1193) {
    if (this.eventsWired || typeof eth.on !== 'function') return
    this.eventsWired = true
    eth.on('accountsChanged', (accs: unknown) => {
      const list = (accs as string[]) || []
      if (!list[0]) { this.remember(false); this.set({ account: null }) } else if (this.state.account) this.set({ account: getAddress(list[0]) })
    })
    eth.on('chainChanged', (id: unknown) => this.set({ chainId: Number(id) }))
    eth.on('disconnect', () => { this.remember(false); this.set({ account: null }) })
  }
  async init(): Promise<void> {
    let eth = this.providers.peek()
    if (!eth && this.remembered()) { try { eth = await this.providers.resolve() } catch { /* later */ } }
    if (!eth) { this.set({ account: null, chainId: null }); return }
    this.active = eth
    this.wireEvents(eth)
    let account: Address | null = null, chainId: number | null = null
    if (this.remembered()) {
      try {
        const accs = (await eth.request({ method: 'eth_accounts' })) as string[]
        if (accs?.[0]) { account = getAddress(accs[0]); chainId = await this.readChain(eth) } else this.remember(false)
      } catch { /* locked */ }
    }
    this.set({ account, chainId })
  }
  async connect(): Promise<boolean> {
    this.set({ busy: true })
    try {
      const eth = await this.providers.resolve()
      this.active = eth
      this.wireEvents(eth)
      const accs = (await eth.request({ method: 'eth_requestAccounts' })) as string[]
      const account = accs?.[0] ? getAddress(accs[0]) : null
      if (!account) return false
      this.remember(true)
      this.set({ account })
      return this.ensureBase()
    } finally { this.set({ busy: false }) }
  }
  async disconnect(): Promise<void> {
    this.remember(false)
    this.set({ account: null })
    const eth = this.provider()
    if (!eth) return
    try { await eth.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] }) } catch { /* optional */ }
    try { if (typeof eth.disconnect === 'function') await eth.disconnect() } catch { /* optional */ }
  }
  async toggle(): Promise<void> { if (this.state.account) await this.disconnect(); else await this.connect() }
  async ensureBase(): Promise<boolean> {
    const eth = this.provider()
    if (!eth) return false
    let chainId = this.state.chainId ?? (await this.readChain(eth))
    if (chainId !== null) this.set({ chainId })
    if (chainId === this.chainId) return true
    const hex = '0x' + this.chainId.toString(16)
    try { await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] }) } catch (err) {
      if ((err as { code?: number })?.code === 4902) {
        try {
          await eth.request({ method: 'wallet_addEthereumChain', params: [{ chainId: hex, chainName: 'Base', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://mainnet.base.org'], blockExplorerUrls: ['https://basescan.org'] }] })
        } catch { /* declined */ }
      }
    }
    chainId = await this.readChain(eth)
    this.set({ chainId })
    return chainId === this.chainId
  }
}
