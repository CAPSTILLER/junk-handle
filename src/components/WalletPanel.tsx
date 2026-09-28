import { useCallback, useEffect, useState } from 'react'
import type { Address } from 'viem'
import {
  MINT_FEE_USD,
  MY8_CHAIN_ID,
  MY8_CONTRACT,
  UPDATE_FEE_USD,
  encodeTraits,
  traitLabel,
  type Quote,
  type StudioTraits,
} from '../../shared/my8'
import { defaultDesign, type Design } from '../../shared/design'
import { WalletWait, useWalletWait } from './WalletWait'
import { ConnectedAs, SendModeToggle, WalletPicker } from './WalletPicker'
import { useWallet } from '../hooks/useWallet'
import {
  approveExact,
  confirmDesign,
  fetchDesign,
  refreshPendingDesign,
  fetchQuote,
  fetchStatus,
  fmtFrlz,
  friendlyError,
  isUsable,
  listOwned,
  prepareVoucher,
  readFrlz,
  readTraits,
  submitVoucher,
  switchToBase,
  tokenUrl,
  txUrl,
  verifyOwnerForDownload,
  type DownloadGrant,
  type Prepared,
  type ServerStatus,
  type TxHooks,
} from '../services/my8'

type Props = {
  traits: StudioTraits
  /** Full current studio design (traits + lenses + transforms). */
  design: Design
  /** Apply a full design to the studio (recall). */
  onLoadDesign: (d: Design) => void
  onGrant: (g: DownloadGrant | null) => void
  grant: DownloadGrant | null
}

type Msg = { kind: 'ok' | 'err' | 'info'; text: string; href?: string; hrefLabel?: string }

export function WalletPanel({ traits, design, onLoadDesign, onGrant, grant }: Props) {
  const w = useWallet('all')
  const { provider, account, chainId } = w
  const [status, setStatus] = useState<ServerStatus | null>(null)
  const [frlz, setFrlz] = useState<{ balance: bigint; allowance: bigint } | null>(null)
  const [owned, setOwned] = useState<bigint[] | null>(null)
  const [activeToken, setActiveToken] = useState<bigint | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<Msg | null>(null)

  const [quote, setQuote] = useState<Quote | null>(null)
  const [quoteErr, setQuoteErr] = useState<string | null>(null)
  const [prepared, setPrepared] = useState<Prepared | null>(null)
  const [, setTick] = useState(0)
  useEffect(() => {
    const load = () => fetchQuote().then((q) => { setQuote(q); setQuoteErr(null) }).catch((e) => setQuoteErr(friendlyError(e)))
    load()
    const t = setInterval(() => { load(); setTick((x) => x + 1) }, 60_000)
    return () => clearInterval(t)
  }, [])
  const onBase = chainId === MY8_CHAIN_ID

  useEffect(() => {
    fetchStatus().then(setStatus).catch(() => setStatus(null))
  }, [])

  const refresh = useCallback(async (acct: Address | null = account) => {
    if (!acct) return
    const [f, o] = await Promise.all([readFrlz(acct), listOwned(acct)])
    setFrlz(f)
    setOwned(o)
  }, [account])

  // Account switch in the wallet → drop token-specific state.
  useEffect(() => {
    setActiveToken(null)
    setPrepared(null)
    onGrant(null)
  }, [account, onGrant])

  useEffect(() => {
    if (account) refresh(account).catch((e) => setMsg({ kind: 'err', text: friendlyError(e) }))
  }, [account, refresh])

  const ww = useWalletWait()
  const run = async (key: string, fn: (hooks: TxHooks) => Promise<void>) => {
    setBusy(key)
    setMsg(null)
    const hooks = ww.begin()
    try {
      await fn(hooks)
    } catch (e) {
      setMsg({ kind: 'err', text: friendlyError(e) })
    } finally {
      ww.end()
      setBusy(null)
    }
  }

  const serverProblem =
    !status ? 'Server API unreachable — minting disabled.'
      : status.signer === 'missing' ? 'Server voucher key not configured yet — minting/revisions disabled.'
        : status.signer === 'mismatch' ? 'Server voucher key does not match contract oracleSigner — minting disabled.'
          : status.paused ? 'Contract is paused by the owner.'
            : null

  const traitsHex = encodeTraits(traits)
  const usd = (n: number) => `$${n.toFixed(2)}`
  /** FRLZ cost to show: the locked voucher amount if we have one for this action, else the live quote. */
  const costFor = (tokenId: bigint | null): { amount: bigint | null; usd: number; locked: boolean } => {
    if (account && isUsable(prepared, traitsHex, tokenId, account)) return { amount: prepared.amount, usd: prepared.usd, locked: true }
    const q = tokenId === null ? quote?.mint : quote?.revision
    return { amount: q ? BigInt(q.frlzWei) : null, usd: q?.usd ?? (tokenId === null ? MINT_FEE_USD : UPDATE_FEE_USD), locked: false }
  }
  /** A voucher exists for this action (maybe expired — submit() refetches it). */
  const hasPrep = (tokenId: bigint | null) => !!prepared && prepared.tokenId === tokenId && prepared.traits === traitsHex
  const canPay = (amt: bigint | null) => !!frlz && amt !== null && frlz.balance >= amt
  const approved = (amt: bigint | null) => !!frlz && amt !== null && frlz.allowance >= amt

  /** Get (or reuse) a fresh voucher for this action; approve exactly its amount only if allowance is short. */
  const lockAndApprove = async (tokenId: bigint | null, hooks: TxHooks): Promise<Prepared> => {
    let prep = prepared
    if (!isUsable(prep, traitsHex, tokenId, account!)) {
      setMsg({ kind: 'info', text: 'Locking price (signed voucher, valid 15 min)…' })
      prep = await prepareVoucher(account!, traitsHex, tokenId, design)
      setPrepared(prep)
    }
    const f = await readFrlz(account!)
    setFrlz(f)
    if (f.balance < prep.amount) throw new Error(`Insufficient FRLZ: cost ${fmtFrlz(prep.amount)}, balance ${fmtFrlz(f.balance)}`)
    if (f.allowance < prep.amount) {
      setMsg({ kind: 'info', text: `Approve exactly ${fmtFrlz(prep.amount)} FRLZ in your wallet…` })
      const hash = await approveExact(provider!, account!, prep.amount, hooks)
      setFrlz(await readFrlz(account!))
      setMsg({ kind: 'ok', text: `Approved ${fmtFrlz(prep.amount)} FRLZ.`, href: txUrl(hash), hrefLabel: 'tx' })
    }
    return prep
  }

  const approve = (tokenId: bigint | null) => run('approve', async (hooks) => {
    const prep = await lockAndApprove(tokenId, hooks)
    setMsg({ kind: 'ok', text: `Price locked: ${fmtFrlz(prep.amount)} FRLZ (about ${usd(prep.usd)}). Ready for step 2.` })
  })

  const submit = (tokenId: bigint | null) => run(tokenId === null ? 'mint' : 'revise', async (hooks) => {
    const prep = await lockAndApprove(tokenId, hooks) // refetches voucher if expired; re-approves only if allowance short
    setMsg({ kind: 'info', text: tokenId === null ? 'Minting…' : `Saving revision to #${tokenId}…` })
    await refreshPendingDesign(prep, design) // studio edited after the price lock → update stashed design first
    const { hash, tokenId: minted } = await submitVoucher(provider!, account!, prep, hooks)
    setPrepared(null)
    setMsg({ kind: 'info', text: 'Saving your full design (positions, lenses) to the NFT…' })
    const saved = await confirmDesign(prep, hash)
    const designLine = saved.ok ? ' Full design saved for recall.' : ` (Design not saved: ${saved.note}. Use "Save current design" under Downloads.)`
    await refresh()
    if (tokenId === null) {
      if (minted !== null) setActiveToken(minted)
      setMsg({
        kind: 'ok',
        text: (minted !== null ? `Minted My Wally #${minted}!` : 'Minted!') + designLine,
        href: minted !== null ? tokenUrl(minted) : txUrl(hash),
        hrefLabel: 'View on BaseScan',
      })
    } else {
      if (grant?.tokenId === tokenId.toString()) onGrant({ ...grant, traits: { ...traits } })
      setMsg({ kind: 'ok', text: `Saved revision to #${tokenId}.${designLine}`, href: txUrl(hash), hrefLabel: 'View tx' })
    }
  })

  const costLine = (tokenId: bigint | null, label: string) => {
    const c = costFor(tokenId)
    return (
      <p className="hint cost-line">
        <strong>{label}: {c.amount !== null ? `${fmtFrlz(c.amount)} FRLZ` : '… FRLZ'} (about {usd(c.usd)})</strong>
        {c.locked ? ' · locked' : ''}
        <br />
        Your balance: {frlz ? `${fmtFrlz(frlz.balance)} FRLZ` : '…'}
        {frlz && c.amount !== null && (frlz.balance >= c.amount ? ' ✓ enough' : ' ✗ not enough')}
      </p>
    )
  }

  /** Recall: saved full design if any, else onchain traits with default positions. */
  const recall = async (id: bigint, traitsHint?: StudioTraits): Promise<boolean> => {
    const [saved, t] = await Promise.all([fetchDesign(id), traitsHint ? Promise.resolve(traitsHint) : readTraits(id)])
    onLoadDesign(saved ?? defaultDesign(t))
    return !!saved
  }

  const load = (id: bigint) => run(`load-${id}`, async () => {
    const full = await recall(id)
    setActiveToken(id)
    setMsg({ kind: 'info', text: full ? `Recalled #${id} exactly as saved.` : `Loaded #${id} onchain traits (no saved positions yet).` })
  })

  const verify = (id: bigint) => run(`verify-${id}`, async () => {
    if (!status) throw new Error('Server API unreachable')
    const g = await verifyOwnerForDownload(provider!, account!, id, status.oracleSigner)
    onGrant(g)
    const full = await recall(id, g.traits)
    setActiveToken(id)
    setMsg({ kind: 'ok', text: `Verified owner of #${id}. Downloads unlocked; ${full ? 'saved design recalled' : 'onchain traits loaded (no saved positions yet)'}.` })
  })

  return (
    <section className="panel wallet-panel">
      <h2>Mint on Base</h2>
      {!w.choice || !account ? (
        <>
          <p className="hint">
            Mint your current look as a My Wally NFT (about {usd(MINT_FEE_USD)} in FRLZ). Owners can revise it later and download files.
          </p>
          <WalletPicker options={w.options} busy={!!busy} onPick={(o) => run('connect', async () => { await w.connect(o) })} />
        </>
      ) : (
        <>
          <ConnectedAs name={w.choice.name} icon={w.choice.icon} busy={!!busy} onChange={w.change} />
          <p className="hint mono wallet-addr">
            {account.slice(0, 6)}…{account.slice(-4)} · {onBase ? 'Base' : 'Wrong network'}
          </p>
          {!onBase && (
            <button type="button" className="btn primary" disabled={!!busy}
              onClick={() => run('switch', async () => { await switchToBase(provider!); await w.refreshChain() })}>
              Switch to Base
            </button>
          )}
          <dl className="kv">
            <div><dt>FRLZ balance</dt><dd>{frlz ? fmtFrlz(frlz.balance) : '…'}</dd></div>
            <div><dt>FRLZ price</dt><dd>{quote ? `$${quote.priceUsd.toPrecision(3)}` : '…'}</dd></div>
          </dl>
          {serverProblem && <p className="status err">{serverProblem}</p>}
          {quoteErr && <p className="status err">{quoteErr}</p>}

          <h3>Mint current look</h3>
          <p className="hint">
            Hair {traitLabel('hair', traits.hair)} · Skin {traitLabel('skin', traits.skin)} · Frame {traitLabel('frame', traits.frame)}
          </p>
          {costLine(null, 'Mint cost')}
          <div className="btn-col">
            <button type="button" className="btn"
              disabled={!!busy || !onBase || !!serverProblem || !canPay(costFor(null).amount)}
              onClick={() => approve(null)}>
              {busy === 'approve' ? 'Working…' : costFor(null).locked && approved(costFor(null).amount)
                ? `✓ ${fmtFrlz(costFor(null).amount!)} FRLZ locked & approved`
                : `1 · Approve ${costFor(null).amount !== null ? fmtFrlz(costFor(null).amount!) : '…'} FRLZ`}
            </button>
            <button type="button" className="btn primary"
              disabled={!!busy || !onBase || !!serverProblem || !hasPrep(null)}
              onClick={() => submit(null)}>
              {busy === 'mint' ? 'Minting…' : '2 · Mint My Wally'}
            </button>
          </div>

          <h3>Your My Wallys</h3>
          {owned === null ? <p className="hint">Loading…</p> : owned.length === 0 ? (
            <p className="hint">None yet.</p>
          ) : (
            <ul className="token-list">
              {owned.map((id) => {
                const verified = grant?.tokenId === id.toString() && grant.expiresAt * 1000 > Date.now()
                return (
                  <li key={id.toString()} className={activeToken === id ? 'active' : ''}>
                    <a href={tokenUrl(id)} target="_blank" rel="noopener noreferrer" className="mono">#{id.toString()}</a>
                    <button type="button" className="btn" disabled={!!busy} onClick={() => load(id)}>Load</button>
                    <button type="button" className="btn" disabled={!!busy || !status} onClick={() => verify(id)}>
                      {verified ? '✓ Downloads' : 'Unlock downloads'}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {activeToken !== null && owned?.some((x) => x === activeToken) && (
            <>
              <h3>Revise #{activeToken.toString()}</h3>
              <p className="hint">Saves the studio's current hair / skin / frame onchain.</p>
              {costLine(activeToken, 'Revision cost')}
              <div className="btn-col">
                <button type="button" className="btn"
                  disabled={!!busy || !onBase || !!serverProblem || !canPay(costFor(activeToken).amount)}
                  onClick={() => approve(activeToken)}>
                  {costFor(activeToken).locked && approved(costFor(activeToken).amount)
                    ? `✓ ${fmtFrlz(costFor(activeToken).amount!)} FRLZ locked & approved`
                    : `1 · Approve ${costFor(activeToken).amount !== null ? fmtFrlz(costFor(activeToken).amount!) : '…'} FRLZ`}
                </button>
                <button type="button" className="btn primary"
                  disabled={!!busy || !onBase || !!serverProblem || !hasPrep(activeToken)}
                  onClick={() => submit(activeToken)}>
                  {busy === 'revise' ? 'Saving…' : '2 · Save revision'}
                </button>
              </div>
            </>
          )}
        </>
      )}
      <WalletWait stage={ww.stage} slow={ww.slow} onCancel={ww.cancel} />
      {msg && (
        <p className={`status ${msg.kind}`}>
          {msg.text}{' '}
          {msg.href && <a href={msg.href} target="_blank" rel="noopener noreferrer">{msg.hrefLabel ?? 'link'}</a>}
        </p>
      )}
      <SendModeToggle />
      <p className="hint mono contract-line">
        <a href={`https://basescan.org/address/${MY8_CONTRACT}`} target="_blank" rel="noopener noreferrer">MY8 {MY8_CONTRACT.slice(0, 8)}…</a>
      </p>
    </section>
  )
}
