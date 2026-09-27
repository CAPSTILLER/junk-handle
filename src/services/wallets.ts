/** Wallet discovery (EIP-6963 + legacy fallbacks + Coinbase Wallet SDK) and the user's remembered choice. */
import type { EIP1193Provider } from 'viem'
import { MY8_CHAIN_ID, SITE_URL } from '../../shared/my8'

export type WalletOption = {
  id: string
  name: string
  icon?: string
  rdns?: string
  kind: 'eip6963' | 'injected' | 'sdk'
  provider?: EIP1193Provider
}
type Announce = { info: { uuid: string; name: string; icon: string; rdns: string }; provider: EIP1193Provider }
type LegacyEth = EIP1193Provider & Record<string, unknown> & { providers?: (EIP1193Provider & Record<string, unknown>)[] }

const LS_WALLET = 'my8.wallet'
export const SDK_ID = 'sdk:coinbase'
const CB_ICON =
  'data:image/svg+xml;base64,' +
  btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#0052FF"/><rect x="11" y="11" width="10" height="10" rx="1.5" fill="#fff"/></svg>')

const ls = {
  get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v) } catch { /* ignore */ } },
}
export const getSavedWalletId = () => ls.get(LS_WALLET)
export const saveWalletId = (id: string | null) => ls.set(LS_WALLET, id)

function legacyName(p: Record<string, unknown>): string {
  if (p.isCoinbaseWallet) return 'Coinbase Wallet'
  if (p.isRabby) return 'Rabby'
  if (p.isPhantom) return 'Phantom'
  if (p.isBraveWallet) return 'Brave Wallet'
  if (p.isOkxWallet || p.isOKExWallet) return 'OKX Wallet'
  if (p.isMetaMask) return 'MetaMask'
  return 'Browser wallet'
}

/** EIP-6963 first; then window.coinbaseWalletExtension, window.ethereum.providers[], window.ethereum. Always adds the SDK option. */
export function discoverWallets(waitMs = 400): Promise<WalletOption[]> {
  return new Promise((resolve) => {
    const found: WalletOption[] = []
    const seen = new Set<unknown>()
    const onAnnounce = (e: Event) => {
      const d = (e as CustomEvent<Announce>).detail
      if (!d?.provider || !d.info || seen.has(d.provider)) return
      if (found.some((f) => f.rdns && f.rdns === d.info.rdns)) return
      seen.add(d.provider)
      found.push({ id: `6963:${d.info.rdns || d.info.uuid}`, name: d.info.name, icon: d.info.icon, rdns: d.info.rdns, kind: 'eip6963', provider: d.provider })
    }
    window.addEventListener('eip6963:announceProvider', onAnnounce)
    window.dispatchEvent(new Event('eip6963:requestProvider'))
    setTimeout(() => {
      window.removeEventListener('eip6963:announceProvider', onAnnounce)
      const w = window as unknown as { ethereum?: LegacyEth; coinbaseWalletExtension?: LegacyEth }
      const add = (p: LegacyEth | undefined, name?: string) => {
        if (!p || typeof p.request !== 'function' || seen.has(p)) return
        const n = name ?? legacyName(p)
        if (n === 'Coinbase Wallet' && found.some((f) => f.rdns === 'com.coinbase.wallet')) return
        if (found.some((f) => f.name === n)) return
        seen.add(p)
        found.push({ id: `injected:${n}`, name: n, kind: 'injected', provider: p, icon: n === 'Coinbase Wallet' ? CB_ICON : undefined })
      }
      add(w.coinbaseWalletExtension, 'Coinbase Wallet')
      for (const p of w.ethereum?.providers ?? []) add(p as LegacyEth)
      if (found.length === 0) add(w.ethereum)
      found.push({ id: SDK_ID, name: 'Coinbase Wallet (SDK)', kind: 'sdk', icon: CB_ICON })
      resolve(found)
    }, waitMs)
  })
}

let sdkProvider: EIP1193Provider | null = null
/** Provider for an option. The SDK is lazy-loaded (no API key); it talks to the extension/app through its own channel. */
export async function resolveProvider(o: WalletOption, sdkOptions: 'all' | 'eoaOnly' = 'all'): Promise<EIP1193Provider> {
  if (o.provider) return o.provider
  if (!sdkProvider) {
    const { createCoinbaseWalletSDK } = await import('@coinbase/wallet-sdk')
    sdkProvider = createCoinbaseWalletSDK({
      appName: 'My Wally Studio',
      appLogoUrl: `${SITE_URL}/favicon.svg`,
      appChainIds: [MY8_CHAIN_ID],
      preference: { options: sdkOptions },
    }).getProvider() as unknown as EIP1193Provider
  }
  return sdkProvider
}
