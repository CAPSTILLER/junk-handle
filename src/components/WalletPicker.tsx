import type { WalletOption } from '../services/wallets'
import { getIncludeNonce, getSendMode, setIncludeNonce, setSendMode, type SendMode } from '../services/my8'
import { useState } from 'react'

export function WalletPicker({ options, busy, onPick }: { options: WalletOption[] | null; busy: boolean; onPick: (o: WalletOption) => void }) {
  if (!options) return <p className="hint">Looking for wallets…</p>
  const injected = options.filter((o) => o.kind !== 'sdk')
  const here = window.location.href
  const hostPath = window.location.host + window.location.pathname
  return (
    <div className="wallet-picker">
      <p className="hint">{injected.length ? 'Choose your wallet:' : 'No browser wallet found.'}</p>
      <div className="btn-col">
        {options.map((o) => (
          <button key={o.id} type="button" className="btn wallet-option" disabled={busy} onClick={() => onPick(o)}>
            {o.icon ? <img src={o.icon} alt="" width={22} height={22} /> : <span className="wallet-dot" aria-hidden />}
            <span>{o.name}</span>
            {o.kind === 'sdk' && <small>via Coinbase popup / app</small>}
          </button>
        ))}
      </div>
      {!injected.length && (
        <div className="btn-col deep-links">
          <a className="btn" href={`https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(here)}`}>Open in Coinbase Wallet app</a>
          <a className="btn" href={`https://metamask.app.link/dapp/${hostPath}`}>Open in MetaMask app</a>
        </div>
      )}
    </div>
  )
}

export function ConnectedAs({ name, icon, onChange, busy }: { name: string; icon?: string; onChange: () => void; busy: boolean }) {
  return (
    <p className="hint connected-as">
      {icon && <img src={icon} alt="" width={16} height={16} />} Using <strong>{name}</strong>{' '}
      <button type="button" className="linkish" disabled={busy} onClick={onChange}>Change wallet</button>
    </p>
  )
}

/** App-wide transaction send mode (stored in this browser). */
export function SendModeToggle({ onChange }: { onChange?: (m: SendMode) => void }) {
  const [mode, setModeState] = useState<SendMode>(getSendMode())
  const setMode = (m: SendMode) => { setModeState(m); onChange?.(m) }
  const [nonce, setNonce] = useState(getIncludeNonce())
  return (
    <details className="send-mode">
      <summary>Wallet stuck? Send mode: {mode === 'prefilled' ? 'Pre-filled' : 'Simple'}</summary>
      <label>
        <input type="radio" name="sendmode" checked={mode === 'prefilled'} onChange={() => { setSendMode('prefilled'); setMode('prefilled') }} />
        <span><strong>Pre-filled</strong> (default): we give the wallet the gas limit and fee so it has nothing to estimate.</span>
      </label>
      <label>
        <input type="radio" name="sendmode" checked={mode === 'simple'} onChange={() => { setSendMode('simple'); setMode('simple') }} />
        <span><strong>Simple</strong>: send only the basics and let the wallet work out gas and fees itself.</span>
      </label>
      {mode === 'prefilled' && (
        <label>
          <input type="checkbox" checked={nonce} onChange={(e) => { setIncludeNonce(e.target.checked); setNonce(e.target.checked) }} />
          <span>Also include the nonce (advanced; off by default)</span>
        </label>
      )}
    </details>
  )
}
