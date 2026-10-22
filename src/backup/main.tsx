import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BACKUP_MAX_TTL_S, backupMessage, readStoredZip, type BackupAction } from '../../shared/backup'
import { explainWalletError, wallet } from '../rocks/wallet'
import { walletButtonView, type WalletState } from '../rocks/walletCore'
import '../index.css'
import './backup.css'

type Manifest = { files: { file: string; source: string; path: string; sha256: string; contentType?: string; restorable: boolean }[] }
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
const nonce = () => hex(crypto.getRandomValues(new Uint8Array(16)).buffer)

async function session(action: BackupAction): Promise<string> {
  const ok = await wallet.connect().catch(() => false)
  const address = wallet.state.account
  const eth = wallet.provider()
  if (!address || !eth) throw new Error('Connect a wallet first.')
  void ok
  const p = { domain: location.host, address, action, nonce: nonce(), expires: Math.floor(Date.now() / 1000) + BACKUP_MAX_TTL_S - 30 }
  const msg = backupMessage(p)
  const signature = (await eth.request({ method: 'personal_sign', params: [msg, address] })) as string
  const r = await fetch('/api/rocks/backup-auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...p, signature }) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || `Server error ${r.status}`)
  return j.token as string
}

function Page() {
  const [w, setW] = useState<WalletState>(wallet.state)
  const [log, setLog] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  useEffect(() => wallet.subscribe(setW), [])
  const say = (s: string) => setLog((l) => [...l, s])
  const view = walletButtonView(w)

  const download = async () => {
    setBusy(true); setLog([])
    try {
      say('Sign the free message in your wallet (no gas)…')
      const t = await session('download')
      say('Verified. Your backup zip is downloading. Keep it on your hard drive.')
      const a = document.createElement('a')
      a.href = `/api/rocks/backup-zip?t=${encodeURIComponent(t)}`
      a.download = ''
      document.body.appendChild(a); a.click(); a.remove()
    } catch (e) { say('❌ ' + explainWalletError(e)) } finally { setBusy(false) }
  }

  const restore = async (f: File) => {
    setBusy(true); setLog([])
    try {
      const zip = readStoredZip(new Uint8Array(await f.arrayBuffer()))
      const mf = zip.find((z) => z.name === 'manifest.json')
      if (!mf) throw new Error('manifest.json missing. Is this a backup zip?')
      const manifest = JSON.parse(new TextDecoder().decode(mf.data)) as Manifest
      const byName = new Map(zip.map((z) => [z.name, z.data]))
      const todo = manifest.files.filter((x) => x.restorable && x.source === 'vercel-blob')
      say(`${todo.length} storage files to restore. Checking hashes…`)
      for (const x of todo) {
        const d = byName.get(x.file)
        if (!d) throw new Error(`${x.file} missing from zip`)
        const h = hex(await crypto.subtle.digest('SHA-256', d.slice()))
        if (h !== x.sha256) throw new Error(`${x.file}: sha256 mismatch, zip is damaged. Nothing uploaded.`)
      }
      if (!confirm(`All ${todo.length} files verified. Upload them to this site's storage now? Existing files at the same paths are overwritten.`)) return
      say('Sign the free restore message in your wallet…')
      const t = await session('restore')
      let n = 0
      for (const x of todo) {
        const qs = new URLSearchParams({ t, path: x.path, sha256: x.sha256, type: x.contentType ?? 'application/octet-stream' })
        const r = await fetch(`/api/rocks/backup-put?${qs}`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: byName.get(x.file)!.slice() })
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(`${x.path}: ${j.error || r.status}`)
        if (++n % 10 === 0 || n === todo.length) say(`Restored ${n}/${todo.length}`)
      }
      say('✅ Restore done. Encrypted asset pack (assets.enc) and IPFS pins are restored manually, see README.md in the zip.')
    } catch (e) { say('❌ ' + explainWalletError(e)) } finally { setBusy(false) }
  }

  return (
    <main className="bk">
      <h1>CAPs Mind · Backup</h1>
      <p>Hold a CAPs Mind key to download every file My Wally and CAPs Rocks keep on the server as one zip. Connecting is read-only. You only sign a free message (no gas) to download or restore.</p>
      <button className={'wbtn' + (view.connected ? ' on' : '')} title={view.title} disabled={w.busy} onClick={() => wallet.toggle().catch((e) => say('❌ ' + explainWalletError(e)))}>{view.label}</button>
      <section>
        <h2>Download backup</h2>
        <button className="wbtn" disabled={busy} onClick={download}>Sign &amp; download zip</button>
      </section>
      <section>
        <h2>Restore from backup</h2>
        <p className="dim">Pick the original backup zip. Every file is checked against its sha256 before anything is uploaded.</p>
        <label className="wbtn file">Choose zip…<input type="file" accept=".zip,application/zip" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void restore(f) }} /></label>
      </section>
      <pre className="log">{log.join('\n')}</pre>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><Page /></StrictMode>)
