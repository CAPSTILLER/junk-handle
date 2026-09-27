import { useCallback, useRef, useState } from 'react'
import type { TxHooks, TxStage } from '../services/my8'

const SLOW_MS = 60_000

/** Tracks a wallet request: stage, 60s "still waiting" hint, and cancel (abandons the wait so the user can retry). */
export function useWalletWait() {
  const [stage, setStage] = useState<TxStage | null>(null)
  const [slow, setSlow] = useState(false)
  const ctrl = useRef<AbortController | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null }

  const begin = useCallback((): TxHooks => {
    ctrl.current?.abort()
    const c = new AbortController()
    ctrl.current = c
    clear()
    setSlow(false)
    setStage(null)
    return {
      signal: c.signal,
      onStage: (s) => {
        if (c.signal.aborted) return
        setStage(s)
        clear()
        setSlow(false)
        if (s === 'wallet') timer.current = setTimeout(() => setSlow(true), SLOW_MS)
      },
    }
  }, [])
  const end = useCallback(() => { clear(); setStage(null); setSlow(false) }, [])
  const cancel = useCallback(() => { ctrl.current?.abort(); clear(); setStage(null); setSlow(false) }, [])
  return { stage, slow, begin, end, cancel }
}

export function WalletWait({ stage, slow, onCancel }: { stage: TxStage | null; slow: boolean; onCancel: () => void }) {
  if (!stage) return null
  return (
    <div className="wallet-wait" role="status" aria-live="polite">
      {stage === 'preparing' && <p className="status info">Preparing the transaction…</p>}
      {stage === 'wallet' && (
        <>
          <p className="status info"><span className="spinner" aria-hidden /> Waiting for your wallet… Confirm the transaction there.</p>
          {slow && (
            <p className="status err">
              Still waiting after a minute. Check your wallet extension window — it may be hidden behind this one (click the
              extension icon). If it looks stuck, press Cancel and try again.
            </p>
          )}
          <button type="button" className="btn" onClick={onCancel}>Cancel / try again</button>
        </>
      )}
      {stage === 'confirming' && <p className="status info"><span className="spinner" aria-hidden /> Sent. Waiting for Base to confirm…</p>}
    </div>
  )
}
