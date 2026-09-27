/** Hidden owner page (/owner): set the collection's metadata address (setBaseURI). Not linked from the studio. */
import { useCallback, useEffect, useState } from 'react'
import { encodeFunctionData, getAddress, type Address, type Hex } from 'viem'
import { METADATA_BASE_URI, MY8_ABI, MY8_CHAIN_ID, MY8_CONTRACT } from '../../shared/my8'
import {
  GAS_FALLBACK, buildTx, friendlyError, getSendMode, publicClient, sendTx, switchToBase, txUrl,
  type PreparedTx, type TxHooks,
} from '../services/my8'
import { WalletWait, useWalletWait } from '../components/WalletWait'
import { ConnectedAs, SendModeToggle, WalletPicker } from '../components/WalletPicker'
import { useWallet } from '../hooks/useWallet'

type Msg = { kind: 'ok' | 'err' | 'info'; text: string; hash?: Hex }

export function OwnerPage() {
  const w = useWallet('eoaOnly')
  const { provider, account, chainId } = w
  const [owner, setOwner] = useState<Address | null>(null)
  const [baseURI, setBaseURI] = useState<string | null>(null)
  const [value, setValue] = useState(METADATA_BASE_URI)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<Msg | null>(null)
  const [pre, setPre] = useState<PreparedTx | null>(null)
  const [mode, setMode] = useState(getSendMode())

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
  }, [readState])

  const ww = useWalletWait()
  const run = async (key: string, fn: (hooks: TxHooks) => Promise<void>) => {
    setBusy(key)
    setMsg(null)
    const hooks = ww.begin()
    try { await fn(hooks) } catch (e) { setMsg({ kind: 'err', text: friendlyError(e) }) } finally { ww.end(); setBusy(null) }
  }

  const onBase = chainId === MY8_CHAIN_ID
  const isOwner = !!account && !!owner && account === owner
  const trimmed = value.trim()
  const validUrl = /^https:\/\/[^\s]+\/$/.test(trimmed)
  const unchanged = baseURI !== null && trimmed === baseURI
  const data = validUrl ? encodeFunctionData({ abi: MY8_ABI, functionName: 'setBaseURI', args: [trimmed] }) : null

  // Pre-build (and pre-check) the tx before the click, refreshed every 20s, so clicking fires the wallet request at once.
  useEffect(() => {
    if (!isOwner || !data || unchanged || mode !== 'prefilled') { setPre(null); return }
    let live = true
    const build = async () => {
      try {
        await publicClient.simulateContract({ account: account!, address: MY8_CONTRACT, abi: MY8_ABI, functionName: 'setBaseURI', args: [trimmed] })
        const t = await buildTx(account!, MY8_CONTRACT, data, GAS_FALLBACK.setBaseURI)
        if (live) setPre(t)
      } catch (e) {
        if (live) setMsg({ kind: 'err', text: `This change would fail: ${friendlyError(e)}` })
      }
    }
    build()
    const t = setInterval(build, 20_000)
    return () => { live = false; clearInterval(t) }
  }, [isOwner, data, unchanged, account, trimmed, mode])

  const submit = () => run('set', async (hooks) => {
    const hash = await sendTx(provider!, account!, MY8_CONTRACT, data!, GAS_FALLBACK.setBaseURI, hooks, pre)
    const now = await readState()
    setMsg(now.baseURI === trimmed
      ? { kind: 'ok', text: 'Done! The metadata address is now set. Marketplaces may take a while to refresh.', hash }
      : { kind: 'err', text: `Confirmed, but the contract now reads “${now.baseURI}”.`, hash })
  })

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
          {!w.choice || !account ? (
            <WalletPicker options={w.options} busy={!!busy}
              onPick={(o) => run('connect', async () => { await w.connect(o) })} />
          ) : (
            <>
              <ConnectedAs name={w.choice.name} icon={w.choice.icon} busy={!!busy} onChange={w.change} />
              <p className="mono">{account}</p>
              <p className="hint">{onBase ? 'On Base ✓' : 'Wrong network.'}</p>
              {!onBase && (
                <button type="button" className="btn big" disabled={!!busy}
                  onClick={() => run('switch', async () => { await switchToBase(provider!); await w.refreshChain() })}>
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
            disabled={!!busy || !isOwner || !validUrl || unchanged || (mode === 'prefilled' && !pre)}
            onClick={submit}>
            {busy === 'set' ? 'Working…' : isOwner && validUrl && !unchanged && mode === 'prefilled' && !pre ? 'Preparing…' : 'Set metadata address'}
          </button>
          <WalletWait stage={ww.stage} slow={ww.slow} onCancel={ww.cancel} />
          {msg && (
            <p className={`status ${msg.kind}`}>
              {msg.text}{' '}
              {msg.hash && <a href={txUrl(msg.hash)} target="_blank" rel="noopener noreferrer">View on BaseScan</a>}
            </p>
          )}
          <SendModeToggle onChange={setMode} />
        </section>
      </main>
    </div>
  )
}
