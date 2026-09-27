/** Hidden owner page (/owner): set the collection's metadata address (setBaseURI). Not linked from the studio. */
import { useCallback, useEffect, useState } from 'react'
import { base } from 'viem/chains'
import { getAddress, type Address, type EIP1193Provider, type Hex } from 'viem'
import { METADATA_BASE_URI, MY8_ABI, MY8_CHAIN_ID, MY8_CONTRACT } from '../../shared/my8'
import {
  connectWallet, friendlyError, getChainId, getProvider, makeWallet, publicClient, switchToBase, txUrl,
} from '../services/my8'

type Msg = { kind: 'ok' | 'err' | 'info'; text: string; hash?: Hex }

export function OwnerPage() {
  const [provider] = useState<EIP1193Provider | null>(() => getProvider())
  const [account, setAccount] = useState<Address | null>(null)
  const [chainId, setChainId] = useState<number | null>(null)
  const [owner, setOwner] = useState<Address | null>(null)
  const [baseURI, setBaseURI] = useState<string | null>(null)
  const [value, setValue] = useState(METADATA_BASE_URI)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<Msg | null>(null)

  const readState = useCallback(async () => {
    const [o, b] = await Promise.all([
      publicClient.readContract({ address: MY8_CONTRACT, abi: MY8_ABI, functionName: 'owner' }),
      publicClient.readContract({ address: MY8_CONTRACT, abi: MY8_ABI, functionName: 'baseURI' }),
    ])
    setOwner(getAddress(o))
    setBaseURI(b)
    return { owner: getAddress(o), baseURI: b }
  }, [])

  useEffect(() => {
    readState().catch((e) => setMsg({ kind: 'err', text: `Could not read the contract: ${friendlyError(e)}` }))
    if (!provider) return
    provider.request({ method: 'eth_accounts' }).then(async (a) => {
      const list = a as string[]
      if (list?.[0]) {
        setAccount(getAddress(list[0]))
        setChainId(await getChainId(provider))
      }
    }).catch(() => {})
    const onAccounts = (a: unknown) => setAccount((a as string[])?.[0] ? getAddress((a as string[])[0]) : null)
    const onChain = (c: unknown) => setChainId(Number(c))
    provider.on('accountsChanged', onAccounts)
    provider.on('chainChanged', onChain)
    return () => {
      provider.removeListener('accountsChanged', onAccounts)
      provider.removeListener('chainChanged', onChain)
    }
  }, [provider, readState])

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    setMsg(null)
    try { await fn() } catch (e) { setMsg({ kind: 'err', text: friendlyError(e) }) } finally { setBusy(null) }
  }

  const connect = () => run('connect', async () => {
    const a = await connectWallet(provider!)
    setAccount(a)
    let c = await getChainId(provider!)
    if (c !== MY8_CHAIN_ID) { await switchToBase(provider!); c = await getChainId(provider!) }
    setChainId(c)
  })

  const onBase = chainId === MY8_CHAIN_ID
  const isOwner = !!account && !!owner && account === owner
  const trimmed = value.trim()
  const validUrl = /^https:\/\/[^\s]+\/$/.test(trimmed)
  const unchanged = baseURI !== null && trimmed === baseURI

  const submit = () => run('set', async () => {
    if (!onBase) { await switchToBase(provider!); setChainId(await getChainId(provider!)) }
    setMsg({ kind: 'info', text: 'Checking the change will work…' })
    const { request } = await publicClient.simulateContract({
      account: account!, address: MY8_CONTRACT, abi: MY8_ABI, functionName: 'setBaseURI', args: [trimmed],
    })
    setMsg({ kind: 'info', text: 'Confirm in your wallet…' })
    const hash = await makeWallet(provider!, account!).writeContract({ ...request, account: account!, chain: base })
    setMsg({ kind: 'info', text: 'Sent. Waiting for Base to confirm…', hash })
    const r = await publicClient.waitForTransactionReceipt({ hash })
    if (r.status !== 'success') throw new Error('The transaction failed onchain.')
    const now = await readState()
    setMsg(now.baseURI === trimmed
      ? { kind: 'ok', text: 'Done! The metadata address is now set. Marketplaces may take a while to refresh.', hash }
      : { kind: 'err', text: `Confirmed, but the contract now reads “${now.baseURI}”.`, hash })
  })

  const here = typeof window !== 'undefined' ? window.location.href : ''
  const hostPath = typeof window !== 'undefined' ? window.location.host + window.location.pathname : ''

  return (
    <div className="owner-page">
      <header className="topbar">
        <div>
          <h1>My Wally · Owner</h1>
          <p className="subtitle">Collection settings for the owner wallet</p>
        </div>
      </header>

      <main className="owner-main">
        <section className="panel">
          <h2>Contract right now</h2>
          <dl className="owner-kv">
            <div><dt>Contract</dt><dd className="mono"><a href={`https://basescan.org/address/${MY8_CONTRACT}`} target="_blank" rel="noopener noreferrer">{MY8_CONTRACT}</a></dd></div>
            <div><dt>Owner</dt><dd className="mono">{owner ?? '…'}</dd></div>
            <div><dt>Metadata address</dt><dd className="mono">{baseURI === null ? '…' : baseURI === '' ? '(not set yet)' : baseURI}</dd></div>
          </dl>
        </section>

        <section className="panel">
          <h2>Your wallet</h2>
          {!provider ? (
            <>
              <p className="hint">No wallet found in this browser. Open this page inside your wallet app:</p>
              <div className="btn-col">
                <a className="btn big" href={`https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(here)}`}>Open in Coinbase Wallet</a>
                <a className="btn big" href={`https://metamask.app.link/dapp/${hostPath}`}>Open in MetaMask</a>
              </div>
            </>
          ) : !account ? (
            <button type="button" className="btn big primary" disabled={!!busy} onClick={connect}>
              {busy === 'connect' ? 'Connecting…' : 'Connect wallet'}
            </button>
          ) : (
            <>
              <p className="mono">{account}</p>
              <p className="hint">{onBase ? 'On Base ✓' : 'Wrong network.'}</p>
              {!onBase && (
                <button type="button" className="btn big" disabled={!!busy}
                  onClick={() => run('switch', async () => { await switchToBase(provider); setChainId(await getChainId(provider)) })}>
                  Switch to Base
                </button>
              )}
              {owner && !isOwner && <p className="status err">Only the owner wallet can use this page.</p>}
              {isOwner && <p className="status ok">This is the owner wallet ✓</p>}
            </>
          )}
        </section>

        <section className="panel">
          <h2>Metadata address</h2>
          <p className="hint">
            Where marketplaces look up each My Wally’s name, picture and traits. Token #1 will read from
            this address + “1”. It should end with a slash.
          </p>
          <input className="owner-input mono" type="url" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false}
            value={value} onChange={(e) => setValue(e.target.value)} aria-label="Metadata address" />
          {!validUrl && <p className="status err">Use a full https:// address ending in “/”.</p>}
          {validUrl && unchanged && <p className="hint">The contract already uses this address.</p>}
          <button type="button" className="btn big primary set-btn"
            disabled={!!busy || !isOwner || !validUrl || unchanged}
            onClick={submit}>
            {busy === 'set' ? 'Working…' : 'Set metadata address'}
          </button>
          {msg && (
            <p className={`status ${msg.kind}`}>
              {msg.text}{' '}
              {msg.hash && <a href={txUrl(msg.hash)} target="_blank" rel="noopener noreferrer">View on BaseScan</a>}
            </p>
          )}
        </section>
      </main>
    </div>
  )
}
