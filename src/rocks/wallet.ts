/** Browser wiring for the wallet controller, with a wallet picker sheet.
 *  Lists every EIP-6963 wallet (+ legacy window.ethereum), Coinbase Wallet via SDK, and on phones without a wallet,
 *  links that reopen this page inside a wallet's in-app browser. Never auto-picks: the last choice is remembered
 *  only to restore a session the user already approved. Connect is read-only (eth_requestAccounts). */
import { createCoinbaseWalletSDK } from '@coinbase/wallet-sdk'
import { WalletController, shortAddress, type Eip1193, type ProviderSource } from './walletCore'

type Info = { uuid: string; name: string; icon: string; rdns: string }
export type WalletChoice = { id: string; name: string; icon?: string; note?: string; get: () => Eip1193 }
const CHOICE_KEY = 'capsrocks.wallet.choice'
const SDK_ID = 'sdk:coinbase'
const CB_ICON = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#0052FF"/><rect x="11" y="11" width="10" height="10" rx="1.5" fill="#fff"/></svg>')

const announced = new Map<string, { info: Info; provider: Eip1193 }>()
if (typeof window !== 'undefined') {
  window.addEventListener('eip6963:announceProvider', (e: Event) => {
    const d = (e as CustomEvent<{ info: Info; provider: Eip1193 }>).detail
    if (d?.info && d.provider && typeof d.provider.request === 'function') announced.set(d.info.rdns || d.info.uuid, d)
  })
  window.dispatchEvent(new Event('eip6963:requestProvider'))
}

let cb: Eip1193 | undefined
function coinbase(): Eip1193 {
  if (!cb) {
    cb = createCoinbaseWalletSDK({
      appName: 'CAPs Rocks · Wallet Gear',
      appLogoUrl: `${location.origin}/favicon.svg`,
      appChainIds: [8453],
      preference: { options: 'all' },
    }).getProvider() as unknown as Eip1193
  }
  return cb
}
function legacyName(p: Record<string, unknown>): string {
  if (p.isRabby) return 'Rabby'
  if (p.isCoinbaseWallet) return 'Coinbase Wallet'
  if (p.isTrust || p.isTrustWallet) return 'Trust Wallet'
  if (p.isRainbow) return 'Rainbow'
  if (p.isPhantom) return 'Phantom'
  if (p.isBraveWallet) return 'Brave Wallet'
  if (p.isOkxWallet || p.isOKExWallet) return 'OKX Wallet'
  if (p.isMetaMask) return 'MetaMask'
  return 'Browser wallet'
}
export function listWallets(): WalletChoice[] {
  const out: WalletChoice[] = []
  const seen = new Set<Eip1193>()
  for (const [key, { info, provider }] of announced) {
    seen.add(provider)
    out.push({ id: '6963:' + key, name: info.name, icon: info.icon, get: () => provider })
  }
  const w = window as unknown as { ethereum?: Eip1193 & Record<string, unknown> & { providers?: (Eip1193 & Record<string, unknown>)[] } }
  const legacy = [...(w.ethereum?.providers ?? []), ...(w.ethereum ? [w.ethereum] : [])]
  for (const p of legacy) {
    if (!p || typeof p.request !== 'function' || seen.has(p)) continue
    seen.add(p)
    const name = legacyName(p)
    if (out.some((o) => o.name === name)) continue
    out.push({ id: 'injected:' + name, name, note: 'browser wallet', get: () => p })
  }
  out.push({ id: SDK_ID, name: 'Coinbase Wallet', icon: CB_ICON, note: 'app or smart wallet (popup)', get: coinbase })
  return out
}
const save = (id: string | null) => { try { if (id) localStorage.setItem(CHOICE_KEY, id); else localStorage.removeItem(CHOICE_KEY) } catch { /* blocked */ } }
const saved = () => { try { return localStorage.getItem(CHOICE_KEY) } catch { return null } }
let chosen: WalletChoice | undefined

const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
/** Documented dapp-browser links. Rabby mobile has no documented one, so it isn't listed. */
export function deepLinks(href = location.href): { name: string; url: string }[] {
  const noProto = href.replace(/^https?:\/\//, '')
  const enc = encodeURIComponent(href)
  return [
    { name: 'MetaMask', url: `https://metamask.app.link/dapp/${noProto}` },
    { name: 'Coinbase Wallet', url: `https://go.cb-w.com/dapp?cb_url=${enc}` },
    { name: 'Rainbow', url: `https://rainbow.app.link/dapp/${enc}` },
    { name: 'Trust Wallet', url: `https://link.trustwallet.com/open_url?coin_id=60&url=${enc}` },
  ]
}

// ---------- sheet UI ----------
const css = `.wsheet-bg{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:flex-end;justify-content:center}
.wsheet{background:#12161f;color:#eef;width:100%;max-width:440px;max-height:85vh;overflow:auto;border-radius:16px 16px 0 0;padding:16px 16px 22px;font:15px system-ui,sans-serif;box-shadow:0 -8px 30px rgba(0,0,0,.5)}
.wsheet h3{margin:0 0 4px;font-size:17px}.wsheet p{margin:4px 0 12px;color:#9ab;font-size:13px}
.wsheet button.wopt,.wsheet a.wopt{display:flex;align-items:center;gap:12px;width:100%;box-sizing:border-box;padding:12px;margin:0 0 8px;border:1px solid #2a3344;border-radius:12px;background:#1a2030;color:#eef;font:inherit;text-align:left;text-decoration:none;cursor:pointer}
.wsheet .wopt img,.wsheet .wopt .wdot{width:28px;height:28px;border-radius:7px;flex:none;background:#334}
.wsheet .wopt small{display:block;color:#89a;font-size:12px}.wsheet .wopt.last{border-color:#3d7bff}
.wsheet .wsec{margin:14px 0 6px;color:#9ab;font-size:12px;text-transform:uppercase;letter-spacing:.05em}
.wsheet .wcancel{width:100%;padding:10px;margin-top:6px;background:none;border:0;color:#9ab;font:inherit;cursor:pointer}`
function el(html: string): HTMLElement { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild as HTMLElement }
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
function openSheet(build: (sheet: HTMLElement, close: () => void) => void, onCancel: () => void) {
  if (!document.getElementById('wsheet-css')) { const st = document.createElement('style'); st.id = 'wsheet-css'; st.textContent = css; document.head.appendChild(st) }
  document.querySelector('.wsheet-bg')?.remove()
  const bg = el('<div class="wsheet-bg" role="dialog" aria-modal="true"><div class="wsheet"></div></div>')
  const sheet = bg.firstElementChild as HTMLElement
  let done = false
  const close = () => { done = true; bg.remove() }
  const cancel = () => { if (!done) { close(); onCancel() } }
  bg.addEventListener('click', (e) => { if (e.target === bg) cancel() })
  build(sheet, close)
  const c = el('<button type="button" class="wcancel">Cancel</button>'); c.onclick = cancel; sheet.appendChild(c)
  document.body.appendChild(bg)
}
const optHtml = (o: { name: string; icon?: string; note?: string }, last: boolean) =>
  `<span>${o.icon ? `<img src="${esc(o.icon)}" alt="">` : '<span class="wdot"></span>'}</span><span>${esc(o.name)}${last ? ' <small>last used</small>' : o.note ? `<small>${esc(o.note)}</small>` : ''}</span>`

/** Shows the picker and resolves with the chosen provider (rejects with code 4001 on cancel). */
export function pickWallet(): Promise<Eip1193> {
  window.dispatchEvent(new Event('eip6963:requestProvider'))
  return new Promise((resolve, reject) => {
    openSheet((sheet, close) => {
      const list = listWallets()
      const injectedCount = list.filter((o) => o.id !== SDK_ID).length
      const last = saved()
      sheet.appendChild(el(`<div><h3>Choose a wallet</h3><p>Connecting only reads your address. You sign only when you mint, trade or send.</p></div>`))
      for (const o of list) {
        const b = el(`<button type="button" class="wopt${o.id === last ? ' last' : ''}" data-wallet="${esc(o.id)}"></button>`)
        b.innerHTML = optHtml(o, o.id === last)
        b.onclick = () => { close(); chosen = o; save(o.id); try { resolve(o.get()) } catch (e) { reject(e) } }
        sheet.appendChild(b)
      }
      if (isMobile() && injectedCount === 0) {
        sheet.appendChild(el('<div class="wsec">Or open this page in a wallet app</div>'))
        for (const l of deepLinks()) {
          const a = el(`<a class="wopt" href="${esc(l.url)}" rel="noopener"></a>`)
          a.innerHTML = optHtml({ name: 'Open in ' + l.name }, false)
          sheet.appendChild(a)
        }
      }
    }, () => reject(Object.assign(new Error('No wallet chosen.'), { code: 4001 })))
  })
}

function browserProviders(): ProviderSource {
  return {
    peek: () => chosen?.get(),
    resolve: pickWallet,
    restore: async () => {
      const id = saved()
      if (!id) return undefined
      if (id === SDK_ID) { chosen = listWallets().find((o) => o.id === SDK_ID); return chosen?.get() }
      for (let i = 0; i < 6 && !listWallets().some((o) => o.id === id); i++) await new Promise((r) => setTimeout(r, 100))
      chosen = listWallets().find((o) => o.id === id)
      return chosen?.get()
    },
    forget: () => { chosen = undefined; save(null) },
  }
}
export function explainWalletError(err: unknown): string {
  const e = err as { code?: number; shortMessage?: string; message?: string; cause?: { code?: number } }
  const code = e?.code ?? e?.cause?.code
  if (e?.message === 'No wallet chosen.') return 'No wallet chosen.'
  if (code === 4001) return 'You rejected the request in your wallet. Nothing was sent.'
  if (code === -32002) return 'Your wallet already has a request open. Open the wallet to finish it.'
  return e?.shortMessage || e?.message || String(err)
}

class PickerWallet extends WalletController {
  chosenName(): string | undefined { return chosen?.name }
  /** Connected: sheet with Switch wallet / Disconnect. Not connected: the picker. */
  async toggle(): Promise<void> {
    if (!this.state.account) { await this.connect(); return }
    const acct = this.state.account
    const action = await new Promise<'switch' | 'off' | null>((res) => openSheet((sheet, close) => {
      sheet.appendChild(el(`<div><h3>${esc(shortAddress(acct))}</h3><p>Connected with ${esc(chosen?.name || 'your wallet')}.</p></div>`))
      const sw = el('<button type="button" class="wopt" data-act="switch"><span class="wdot"></span><span>Switch wallet</span></button>')
      sw.onclick = () => { close(); res('switch') }
      const off = el('<button type="button" class="wopt" data-act="off"><span class="wdot"></span><span>Disconnect</span></button>')
      off.onclick = () => { close(); res('off') }
      sheet.append(sw, off)
    }, () => res(null)))
    if (action === 'off') await this.disconnect()
    if (action === 'switch') {
      const prev = chosen
      const ok = await this.connect().catch((e) => { if ((e as { code?: number })?.code === 4001 && prev) { chosen = prev; save(prev.id); return null } throw e })
      void ok
    }
  }
}
let storage: Storage | null = null
try { storage = window.localStorage } catch { storage = null }
export const wallet = new PickerWallet(browserProviders(), storage)
if (!listWallets().some((o) => o.id !== SDK_ID)) { try { coinbase() } catch { /* SDK init failed; Connect will retry */ } }
void wallet.init()
