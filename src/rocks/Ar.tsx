import { createElement, useEffect, useState } from 'react'
import { Shell } from './ui'

const SITE = typeof location !== 'undefined' && /^https:/.test(location.origin) ? location.origin : 'https://myassets.gearup.wtf'
const MV_SRC = 'https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js'

/** Android Scene Viewer intent for the public preview GLB (meters, no scaling). */
export function sceneViewerHref(id: string) {
  const file = encodeURIComponent(`${SITE}/api/rocks/preview?id=${id}`)
  const title = encodeURIComponent(`CAPs Rock #${id}`)
  const fallback = encodeURIComponent(`${SITE}/rocks/ar?id=${id}`)
  return `intent://arvr.google.com/scene-viewer/1.0?file=${file}&mode=ar_preferred&resizable=false&title=${title}#Intent;scheme=https;package=com.google.ar.core;action=android.intent.action.VIEW;S.browser_fallback_url=${fallback};end;`
}

export function Ar() {
  const q = new URLSearchParams(location.search).get('id') ?? ''
  const id = /^\d{1,12}$/.test(q) ? q : null
  const [mv, setMv] = useState(!!customElements.get('model-viewer'))
  useEffect(() => {
    if (mv) return
    const s = document.createElement('script')
    s.type = 'module'
    s.src = MV_SRC
    s.onload = () => setMv(true)
    document.head.appendChild(s)
  }, [mv])
  return (
    <Shell active="">
      <div className="banner"><b>AR test.</b> See a CAPs Rock life-size in your room. Uses the public low-poly preview (real-world meters, not scaled).</div>
      {!id ? <div className="empty">Add a rock id, e.g. <a href="/rocks/ar?id=1">/rocks/ar?id=1</a>.</div> : (
        <>
          <a className="btn primary" style={{ display: 'block', textAlign: 'center', fontSize: 20, padding: '18px 14px', marginBottom: 18 }} href={sceneViewerHref(id)}>
            View in your room (AR)
          </a>
          <p className="note">Opens Android Scene Viewer (Google Play Services for AR). Option 2 below uses model-viewer's own AR button.</p>
          <h2 className="sec">Option 2 · model-viewer</h2>
          <div className="tablet-frame">
            {createElement('model-viewer', {
              src: `${SITE}/api/rocks/preview?id=${id}`,
              alt: `CAPs Rock #${id}`,
              ar: true,
              'ar-modes': 'scene-viewer webxr quick-look',
              'ar-scale': 'fixed',
              'camera-controls': true,
              'auto-rotate': true,
              'shadow-intensity': '1',
              style: { width: '100%', height: '420px', background: '#0b1220', borderRadius: 4 },
            })}
            <div className="tablet-text">{mv ? `CAPS ROCK #${id} · TAP THE AR ICON` : 'LOADING MODEL-VIEWER…'}</div>
          </div>
        </>
      )}
    </Shell>
  )
}
