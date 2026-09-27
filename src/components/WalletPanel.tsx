import { useCallback, useEffect, useState } from 'react'
import type { Address, EIP1193Provider } from 'viem'
import {
  MINT_FEE_WEI,
  MY8_CHAIN_ID,
  MY8_CONTRACT,
  UPDATE_FEE_WEI,
  encodeTraits,
  traitLabel,
  type StudioTraits,
} from '../../shared/my8'
import {
  approveExact,
  connectWallet,
  fetchStatus,
  fmtFrlz,
  friendlyError,
  getChainId,
  getProvider,
  listOwned,
  mintModel,
  readFrlz,
  readTraits,
  saveRevision,
  switchToBase,
  tokenUrl,
  txUrl,
  verifyOwnerForDownload,
  type DownloadGrant,
  type ServerStatus,
} from '../services/my8'

type Props = {
  traits: StudioTraits
  onLoadTraits: (t: StudioTraits) => void
  onGrant: (g: DownloadGrant | null) => void
  grant: DownloadGrant | null
}

type Msg = { kind: 'ok' | 'err' | 'info'; text: string; href?: string; hrefLabel?: string }

export function WalletPanel({ traits, onLoadTraits, onGrant, grant }: Props) {
  const [provider] = useState<EIP1193Provider | null>(() => getProvider())
  const [account, setAccount] = useState<Address | null>(null)
  const [chainId, setChainId] = useState<number | null>(null)
  const [status, setStatus] = useState<ServerStatus | null>(null)
  const [frlz, setFrlz] = useState<{ balance: bigint; allowance: bigint } | null>(null)
  const [owned, setOwned] = useState<bigint[] | null>(null)
  const [activeToken, setActiveToken] = useState<bigint | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<Msg | null>(null)

  const mintFee = status ? BigInt(status.mintFee) : MINT_FEE_WEI
  const updateFee = status ? BigInt(status.updateFee) : UPDATE_FEE_WEI
  const onBase = chainId === MY8_CHAIN_ID

  useEffect(() => {
    fetchStatus().then(setStatus).catch(() => setStatus(null))
    if (!provider) return
    provider.request({ method: 'eth_accounts' }).then(async (a) => {
      const list = a as string[]
      if (list?.[0]) {
        setChainId(await getChainId(provider))
        setAccount(list[0] as Address)
      }
    }).catch(() => {})
  }, [provider])

  const refresh = useCallback(async (acct: Address | null = account) => {
    if (!acct) return
    const [f, o] = await Promise.all([readFrlz(acct), listOwned(acct)])
    setFrlz(f)
    setOwned(o)
  }, [account])

  useEffect(() => {
    if (!provider) return
    const onAccounts = (a: unknown) => {
      const list = a as string[]
      setAccount(list?.[0] ? (list[0] as Address) : null)
      setActiveToken(null)
      onGrant(null)
    }
    const onChain = (c: unknown) => setChainId(Number(c))
    provider.on('accountsChanged', onAccounts)
    provider.on('chainChanged', onChain)
    return () => {
      provider.removeListener('accountsChanged', onAccounts)
      provider.removeListener('chainChanged', onChain)
    }
  }, [provider, onGrant])

  useEffect(() => {
    if (account) refresh(account).catch((e) => setMsg({ kind: 'err', text: friendlyError(e) }))
  }, [account, refresh])

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    setMsg(null)
    try {
      await fn()
    } catch (e) {
      setMsg({ kind: 'err', text: friendlyError(e) })
    } finally {
      setBusy(null)
    }
  }

  const connect = () => run('connect', async () => {
    if (!provider) throw new Error('No wallet found')
    const a = await connectWallet(provider)
    setAccount(a)
    const c = await getChainId(provider)
    setChainId(c)
    if (c !== MY8_CHAIN_ID) {
      await switchToBase(provider)
      setChainId(await getChainId(provider))
    }
  })

  const serverProblem =
    !status ? 'Server API unreachable — minting disabled.'
      : status.signer === 'missing' ? 'Server voucher key not configured yet — minting/revisions disabled.'
        : status.signer === 'mismatch' ? 'Server voucher key does not match contract oracleSigner — minting disabled.'
          : status.paused ? 'Contract is paused by the owner.'
            : null

  const traitsHex = encodeTraits(traits)
  const canPay = (amt: bigint) => !!frlz && frlz.balance >= amt
  const approved = (amt: bigint) => !!frlz && frlz.allowance >= amt

  const approve = (amt: bigint, label: string) => run('approve', async () => {
    const hash = await approveExact(provider!, account!, amt)
    await refresh()
    setMsg({ kind: 'ok', text: `Approved ${fmtFrlz(amt)} FRLZ for ${label}.`, href: txUrl(hash), hrefLabel: 'tx' })
  })

  const mint = () => run('mint', async () => {
    setMsg({ kind: 'info', text: 'Requesting voucher and minting…' })
    const { hash, tokenId } = await mintModel(provider!, account!, traitsHex)
    await refresh()
    if (tokenId !== null) setActiveToken(tokenId)
    setMsg({
      kind: 'ok',
      text: tokenId !== null ? `Minted My Wally #${tokenId}!` : 'Minted!',
      href: tokenId !== null ? tokenUrl(tokenId) : txUrl(hash),
      hrefLabel: 'View on BaseScan',
    })
  })

  const load = (id: bigint) => run(`load-${id}`, async () => {
    const t = await readTraits(id)
    onLoadTraits(t)
    setActiveToken(id)
    setMsg({ kind: 'info', text: `Loaded #${id} traits into the studio.` })
  })

  const revise = (id: bigint) => run('revise', async () => {
    setMsg({ kind: 'info', text: `Requesting voucher and saving revision to #${id}…` })
    const hash = await saveRevision(provider!, account!, id, traitsHex)
    await refresh()
    if (grant?.tokenId === id.toString()) onGrant({ ...grant, traits: { ...traits } })
    setMsg({ kind: 'ok', text: `Saved revision to #${id}.`, href: txUrl(hash), hrefLabel: 'View tx' })
  })

  const verify = (id: bigint) => run(`verify-${id}`, async () => {
    if (!status) throw new Error('Server API unreachable')
    const g = await verifyOwnerForDownload(provider!, account!, id, status.oracleSigner)
    onGrant(g)
    onLoadTraits(g.traits)
    setActiveToken(id)
    setMsg({ kind: 'ok', text: `Verified owner of #${id}. Downloads unlocked for its onchain traits.` })
  })

  if (!provider) {
    const here = typeof window !== 'undefined' ? window.location.href : ''
    const host = typeof window !== 'undefined' ? window.location.host + window.location.pathname : ''
    return (
      <section className="panel wallet-panel">
        <h2>Mint on Base</h2>
        <p className="hint">No browser wallet detected. You can keep playing; minting and downloads need a wallet.</p>
        <div className="btn-col">
          <a className="btn" href={`https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(here)}`}>Open in Coinbase Wallet</a>
          <a className="btn" href={`https://metamask.app.link/dapp/${host}`}>Open in MetaMask</a>
        </div>
      </section>
    )
  }

  return (
    <section className="panel wallet-panel">
      <h2>Mint on Base</h2>
      {!account ? (
        <>
          <p className="hint">
            Mint your current look as a My Wally NFT ({fmtFrlz(mintFee)} FRLZ). Owners can revise it later and download files.
          </p>
          <button type="button" className="btn primary" disabled={!!busy} onClick={connect}>
            {busy === 'connect' ? 'Connecting…' : 'Connect wallet'}
          </button>
        </>
      ) : (
        <>
          <p className="hint mono wallet-addr">
            {account.slice(0, 6)}…{account.slice(-4)} · {onBase ? 'Base' : 'Wrong network'}
          </p>
          {!onBase && (
            <button type="button" className="btn primary" disabled={!!busy}
              onClick={() => run('switch', async () => { await switchToBase(provider); setChainId(await getChainId(provider)) })}>
              Switch to Base
            </button>
          )}
          <dl className="kv">
            <div><dt>FRLZ balance</dt><dd>{frlz ? fmtFrlz(frlz.balance) : '…'}</dd></div>
            <div><dt>Mint fee</dt><dd>{fmtFrlz(mintFee)} FRLZ → treasury</dd></div>
            <div><dt>Revision fee</dt><dd>{fmtFrlz(updateFee)} FRLZ (burned)</dd></div>
          </dl>
          {serverProblem && <p className="status err">{serverProblem}</p>}
          {frlz && !canPay(mintFee) && <p className="status err">Insufficient FRLZ for a mint.</p>}

          <h3>Mint current look</h3>
          <p className="hint">
            Hair {traitLabel('hair', traits.hair)} · Skin {traitLabel('skin', traits.skin)} · Frame {traitLabel('frame', traits.frame)}
          </p>
          <div className="btn-col">
            <button type="button" className="btn"
              disabled={!!busy || !onBase || !!serverProblem || !canPay(mintFee) || approved(mintFee)}
              onClick={() => approve(mintFee, 'mint')}>
              {approved(mintFee) ? `✓ ${fmtFrlz(mintFee)} FRLZ approved` : busy === 'approve' ? 'Approving…' : `1 · Approve ${fmtFrlz(mintFee)} FRLZ`}
            </button>
            <button type="button" className="btn primary"
              disabled={!!busy || !onBase || !!serverProblem || !approved(mintFee)}
              onClick={mint}>
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
              <div className="btn-col">
                <button type="button" className="btn"
                  disabled={!!busy || !onBase || !!serverProblem || !canPay(updateFee) || approved(updateFee)}
                  onClick={() => approve(updateFee, 'revision')}>
                  {approved(updateFee) ? `✓ ${fmtFrlz(updateFee)} FRLZ approved` : `1 · Approve ${fmtFrlz(updateFee)} FRLZ`}
                </button>
                <button type="button" className="btn primary"
                  disabled={!!busy || !onBase || !!serverProblem || !approved(updateFee)}
                  onClick={() => revise(activeToken)}>
                  {busy === 'revise' ? 'Saving…' : '2 · Save revision'}
                </button>
              </div>
            </>
          )}
        </>
      )}
      {msg && (
        <p className={`status ${msg.kind}`}>
          {msg.text}{' '}
          {msg.href && <a href={msg.href} target="_blank" rel="noopener noreferrer">{msg.hrefLabel ?? 'link'}</a>}
        </p>
      )}
      <p className="hint mono contract-line">
        <a href={`https://basescan.org/address/${MY8_CONTRACT}`} target="_blank" rel="noopener noreferrer">MY8 {MY8_CONTRACT.slice(0, 8)}…</a>
      </p>
    </section>
  )
}
