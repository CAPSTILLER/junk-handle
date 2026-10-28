import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { wallet, explainWalletError } from './wallet'
import { walletButtonView } from './walletCore'
import { RockStage } from './stage'

export const GEAR_HOME_URL = 'https://landonthis.gearup.wtf'
export const go = (path: string) => { history.pushState(null, '', path); dispatchEvent(new PopStateEvent('popstate')) }

export function useWallet() {
  return useSyncExternalStore((cb) => wallet.subscribe(cb), () => wallet.state)
}

export function Link({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  return <a href={to} className={className} onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); go(to) }}>{children}</a>
}

export function WalletButton() {
  const s = useWallet()
  const v = walletButtonView(s)
  return (
    <button type="button" className={'walletbtn' + (v.connected ? ' connected' : '')} title={v.title} aria-pressed={v.connected}
      aria-label={v.connected ? `${v.label}. Tap to switch wallet or disconnect.` : 'Connect wallet'} disabled={s.busy}
      // Popup opens straight from the tap: toggle() calls eth_requestAccounts with no await before it.
      onClick={() => { void wallet.toggle().catch((e) => { if ((e as { code?: number })?.code !== 4001) alert(explainWalletError(e)) }) }}>
      {v.label}
    </button>
  )
}

export function Shell({ active, children }: { active: string; children: ReactNode }) {
  return (
    <div className="rocks">
      <header>
        <Link to="/rocks" className="brand">CAPs ROCKS<small>VAULT PROPHECIES</small></Link>
        <nav>
          <Link to="/rocks" className={active === 'home' ? 'on' : ''}>Rocks</Link>
          <Link to="/rocks/forge" className={active === 'forge' ? 'on' : ''}>Forge</Link>
          <Link to="/rocks/preview" className={active === 'preview' ? 'on' : ''}>Preview</Link>
          <Link to="/rocks/view" className={active === 'view' ? 'on' : ''}>View</Link>
          <a href="/">My Assets</a>
        </nav>
        <WalletButton />
      </header>
      <main>{children}</main>
      <footer>
        one rock per tablet burned, faces + poses onchain, <a className="gear-logo-link" href={GEAR_HOME_URL} target="_blank" rel="noopener noreferrer" aria-label="GEAR home on landonthis.gearup.wtf" title="GEAR"><img src="/gear-logo-cutout.png" alt="GEAR" width="512" height="128" /></a> faces 90%-treasury 10%-gearvault.
      </footer>
    </div>
  )
}

export function Msg({ m }: { m: { kind: 'ok' | 'bad' | 'info'; text: ReactNode } | null }) {
  if (!m) return null
  return <div className={'msg ' + (m.kind === 'info' ? '' : m.kind)} role="status">{m.text}</div>
}

/** Rock viewer inside the CAPs mind tablet frame. Public = preview GLB (clay, decimated) + PREVIEW watermark. */
export function RockViewer({ src, mode = 'preview', label, onStage, editor = false, tag, idleSpin = false }: {
  src: string | ArrayBuffer | null; mode?: 'preview' | 'full'; label?: ReactNode; onStage?: (s: RockStage | null) => void; editor?: boolean; tag?: string; idleSpin?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const stageRef = useRef<RockStage | null>(null)
  const [status, setStatus] = useState('Loading rock…')
  useEffect(() => {
    if (!ref.current) return
    const st = new RockStage(ref.current)
    st.idleSpin = idleSpin
    stageRef.current = st
    return () => { st.dispose(); stageRef.current = null; onStage?.(null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    const st = stageRef.current
    if (!st || !src) return
    let live = true
    setStatus('Loading rock…')
    st.load(src, mode).then(() => {
      if (!live) return
      setStatus('')
      if (editor) { st.enableEditor(); (window as unknown as { __rocksStage?: RockStage }).__rocksStage = st }
      onStage?.(st)
    }).catch((e) => live && setStatus('Could not load the rock: ' + ((e as Error).message || e)))
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, mode, editor])
  return (
    <div className="tablet-frame">
      <div className="stage" ref={ref}>
        {mode === 'preview' && <div className="wm">{'PREVIEW\n\n\nPREVIEW\n\n\nPREVIEW'}</div>}
        <div className="tag"><span className={'badge ' + (mode === 'preview' ? 'soon' : 'live')}>{tag ?? (mode === 'preview' ? 'Preview · low poly' : 'Holder · full model')}</span></div>
        {status && <div className="status">{status}</div>}
      </div>
      {label && <div className="tablet-text">{label}</div>}
    </div>
  )
}
