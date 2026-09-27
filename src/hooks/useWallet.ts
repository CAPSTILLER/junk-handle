import { useCallback, useEffect, useState } from 'react'
import { getAddress, type Address, type EIP1193Provider } from 'viem'
import { connectWallet, getChainId, switchToBase } from '../services/my8'
import { SDK_ID, discoverWallets, getSavedWalletId, resolveProvider, saveWalletId, type WalletOption } from '../services/wallets'

/** One chosen provider used for everything (connect, reads of accounts/chain, signing, sending). */
export function useWallet(sdkOptions: 'all' | 'eoaOnly' = 'all') {
  const [options, setOptions] = useState<WalletOption[] | null>(null)
  const [choice, setChoice] = useState<WalletOption | null>(null)
  const [provider, setProvider] = useState<EIP1193Provider | null>(null)
  const [account, setAccount] = useState<Address | null>(null)
  const [chainId, setChainId] = useState<number | null>(null)

  useEffect(() => {
    let live = true
    discoverWallets().then(async (opts) => {
      if (!live) return
      setOptions(opts)
      const saved = getSavedWalletId()
      const o = opts.find((x) => x.id === saved)
      if (!o || o.id === SDK_ID) return // SDK restores only on explicit click
      try {
        const p = await resolveProvider(o, sdkOptions)
        const accts = (await p.request({ method: 'eth_accounts' })) as string[]
        if (!live) return
        setChoice(o)
        setProvider(p)
        if (accts?.[0]) {
          setAccount(getAddress(accts[0]))
          setChainId(await getChainId(p))
        }
      } catch { /* stay disconnected */ }
    })
    return () => { live = false }
  }, [sdkOptions])

  useEffect(() => {
    if (!provider) return
    const onAccounts = (a: unknown) => setAccount((a as string[])?.[0] ? getAddress((a as string[])[0]) : null)
    const onChain = (c: unknown) => setChainId(Number(c))
    provider.on('accountsChanged', onAccounts)
    provider.on('chainChanged', onChain)
    return () => {
      provider.removeListener('accountsChanged', onAccounts)
      provider.removeListener('chainChanged', onChain)
    }
  }, [provider])

  const connect = useCallback(async (o: WalletOption) => {
    const p = await resolveProvider(o, sdkOptions)
    const a = await connectWallet(p)
    setChoice(o)
    setProvider(p)
    setAccount(a)
    saveWalletId(o.id)
    let c = await getChainId(p)
    if (c !== 8453) { await switchToBase(p); c = await getChainId(p) }
    setChainId(c)
    return a
  }, [sdkOptions])

  const change = useCallback(() => {
    setChoice(null)
    setProvider(null)
    setAccount(null)
    setChainId(null)
    saveWalletId(null)
  }, [])

  const refreshChain = useCallback(async () => { if (provider) setChainId(await getChainId(provider)) }, [provider])

  return { options, choice, provider, account, chainId, connect, change, refreshChain }
}
