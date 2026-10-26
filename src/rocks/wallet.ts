/** Browser wiring for the copied CAPs mind wallet controller. Coinbase SDK is bundled + created eagerly, so the
 *  popup opens straight from the tap (no await before eth_requestAccounts). No wallet picker. */
import { createCoinbaseWalletSDK } from '@coinbase/wallet-sdk'
import { WalletController, type Eip1193, type ProviderSource } from './walletCore'

let cb: Eip1193 | undefined
function injected(): Eip1193 | undefined {
  const eth = (window as unknown as { ethereum?: Eip1193 }).ethereum
  return eth && typeof eth.request === 'function' ? eth : undefined
}
function smartWallet(): Eip1193 {
  if (!cb) {
    cb = createCoinbaseWalletSDK({
      appName: 'CAPs Rocks · My Assets',
      appLogoUrl: `${location.origin}/favicon.svg`,
      appChainIds: [8453],
      preference: { options: 'smartWalletOnly' },
    }).getProvider() as unknown as Eip1193
  }
  return cb
}
export function browserProviders(): ProviderSource {
  return { peek: () => injected() || cb, resolve: async () => injected() || smartWallet() }
}
export function explainWalletError(err: unknown): string {
  const e = err as { code?: number; shortMessage?: string; message?: string; cause?: { code?: number } }
  const code = e?.code ?? e?.cause?.code
  if (code === 4001) return 'You rejected the request in your wallet. Nothing was sent.'
  if (code === -32002) return 'Your wallet already has a request open. Open the wallet to finish it.'
  return e?.shortMessage || e?.message || String(err)
}
let storage: Storage | null = null
try { storage = window.localStorage } catch { storage = null }
export const wallet = new WalletController(browserProviders(), storage)
if (!injected()) { try { smartWallet() } catch { /* SDK init failed; Connect will retry */ } }
void wallet.init()
