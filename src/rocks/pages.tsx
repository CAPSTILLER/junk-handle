import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { decodeEventLog, getAddress, isAddress, type Address, type Hex } from 'viem'
import { CAPS_ROCKS, CAPS_ROCKS_ABI, GEAR_TOKEN } from '../../shared/capsRocks'
import { FACE_GENERATOR as FG } from '../../shared/faces/generator.mjs'
const MOODS = FG.moods
import { canonicalPose, ipfsToHttp, normalizePose, POSE_BONES, type PoseJson } from '../../shared/rocksPose'
import { downloadMessage, DOWNLOAD_MAX_TTL_S } from '../../shared/rocksDownload'
import { pub, rocks, rocksOf, tablets, tabletsOf, waitTx, walletClient, write } from './chain'
import { explainWalletError } from './wallet'
import { shortAddress } from './walletCore'
import { Link, Msg, RockViewer, Shell, go, useWallet } from './ui'
import type { RockStage } from './stage'

type M = { kind: 'ok' | 'bad' | 'info'; text: React.ReactNode } | null
const basescanTx = (h: string) => `https://basescan.org/tx/${h}`
const sha256 = async (s: string) => ('0x' + [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('')) as Hex
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, init)
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((j as { error?: string }).error || `Request failed (${r.status})`)
  return j as T
}
function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [s, set] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true })
  const run = useCallback(() => { set((p) => ({ ...p, loading: true })); fn().then((data) => set({ data, loading: false }), (e) => set({ error: (e as Error).message, loading: false })) }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { run() }, [run])
  return { ...s, reload: run }
}

// ------------------------------------------------------------------ /rocks
export function Home() {
  return (
    <Shell active="home">
      <div className="banner"><b>CAPs Rocks on Base.</b> Burn one Prophecy Tablet, get one CAPs Rock: a rigged 3D avatar cut from Crushed Prophecy stone, seeded by your wallet. Contract <a className="mono" href={`https://basescan.org/address/${rocks.address}`} target="_blank" rel="noreferrer">{shortAddress(rocks.address)}</a>.</div>
      <div className="grid">
        <CapsRockCard />
        <div className="card"><div className="body"><div className="meta"><span className="title">Preview</span><span className="badge live">Any wallet</span></div><div className="desc">SEE THE ROCK ANY ADDRESS WOULD FORGE. LOW-POLY PREVIEW, NOTHING TO SIGN.</div><button className="primary" onClick={() => go('/rocks/preview')}>Preview a rock</button></div></div>
        <div className="card"><div className="body"><div className="meta"><span className="title">Forge</span><span className="badge soon">Burns a tablet</span></div><div className="desc">BURN ONE OF YOUR PROPHECY TABLETS AND MINT YOUR ROCK IN ONE TRANSACTION.</div><button className="primary" onClick={() => go('/rocks/forge')}>Burn &amp; forge</button></div></div>
        <div className="card"><div className="body"><div className="meta"><span className="title">View</span><span className="badge live">Anyone</span></div><div className="desc">LOOK UP ANY ROCK BY ID: FACES, POSES, SEED. VIEW ONLY.</div><button className="primary" onClick={() => go('/rocks/view')}>Look up a rock</button></div></div>
      </div>
      <h2 className="sec">How it works</h2>
      <div className="panel">
        <div className="kv"><span>Supply</span><span>One rock per tablet burned</span></div>
        <div className="kv"><span>Art seed</span><span>The forging wallet (public, forever)</span></div>
        <div className="kv"><span>Faces</span><span>Permanent. Own wallet face free, others ~$0.25 GEAR</span></div>
        <div className="kv"><span>Poses</span><span>Up to 42 per rock, saved to IPFS, free (gas only)</span></div>
        <div className="kv"><span>Files</span><span>GLB + STL for the current holder only</span></div>
        <p className="note">The face generator and the CAPs mind face maker are coming soon. Until then every rock shows the blank tablet face.</p>
      </div>
      <MyRocks />
    </Shell>
  )
}

/** Cap's Rock #1 as the official low-poly display model (/api/rocks/display?id=1). Spin it, zoom it, no wallet. */
function CapsRockCard() {
  const [src, setSrc] = useState<{ buf: ArrayBuffer; mode: 'preview' | 'display' } | null>(null)
  useEffect(() => {
    let live = true
    const get = (u: string) => fetch(u).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer() })
    get('/api/rocks/display?id=1').then((buf) => ({ buf, mode: 'display' as const }))
      .catch(() => get('/api/rocks/preview?id=1').then((buf) => ({ buf, mode: 'preview' as const })))
      .then((v) => live && setSrc(v)).catch(() => {})
    return () => { live = false }
  }, [])
  return (
    <div className="card"><div className="body">
      <div className="meta"><span className="title">CAPs Rock #1</span><span className="badge live">Play</span></div>
      <RockViewer src={src?.buf ?? null} mode={src?.mode ?? 'display'} tag={src?.mode === 'preview' ? 'Preview · low poly' : 'Low-poly display'} idleSpin />
      <div className="desc">CAP'S ROCK. DRAG TO TURN, PINCH TO ZOOM. NO WALLET NEEDED.</div>
      <button className="primary" onClick={() => go('/rocks/1')}>Open Rock #1</button>
    </div></div>
  )
}

function MyRocks() {
  const w = useWallet()
  const mine = useAsync(async () => (w.account ? rocksOf(w.account) : []), [w.account])
  if (!w.account) return null
  return (
    <>
      <h2 className="sec">Your rocks</h2>
      {mine.loading ? <div className="empty">Reading Base…</div> : mine.error ? <Msg m={{ kind: 'bad', text: mine.error }} /> : !mine.data?.length ? <div className="empty">No rocks in this wallet yet. <Link to="/rocks/forge">Forge one</Link>.</div> : (
        <div className="grid">{mine.data.map((id) => (
          <div className="card" key={id.toString()}><div className="body"><div className="meta"><span className="title">CAPs Rock #{id.toString()}</span><span className="badge live">Yours</span></div><button className="primary" onClick={() => go(`/rocks/${id}`)}>Open</button></div></div>
        ))}</div>
      )}
    </>
  )
}

// ------------------------------------------------------------------ /rocks/preview
export function Preview() {
  const w = useWallet()
  const initial = new URLSearchParams(location.search).get('address') || ''
  const [input, setInput] = useState(initial)
  const [seed, setSeed] = useState<Address | null>(isAddress(initial, { strict: false }) ? getAddress(initial) : null)
  useEffect(() => { if (!seed && w.account) { setSeed(w.account); setInput(w.account) } }, [w.account]) // eslint-disable-line react-hooks/exhaustive-deps
  const traits = useAsync(async () => (seed ? api<Record<string, string | number>>(`/api/rocks/traits?seed=${seed}`) : null), [seed])
  const bad = input && !isAddress(input.trim(), { strict: false })
  return (
    <Shell active="preview">
      <div className="banner"><b>Preview only.</b> Every wallet has its own rock. Paste any address to see the rock it would forge. Low-poly, untextured preview; the full model goes only to the holder.</div>
      <div className="split">
        <div>
          {seed ? <RockViewer src={`/api/rocks/preview?seed=${seed}`} label={`SEED ${shortAddress(seed)}`} /> : <div className="empty">Enter an address to preview its rock.</div>}
        </div>
        <div className="panel">
          <label htmlFor="addr">Wallet address</label>
          <input id="addr" className="mono" placeholder="0x…" value={input} onChange={(e) => setInput(e.target.value)} />
          <div className="row">
            <button className="primary" disabled={!input || !!bad} onClick={() => { const a = getAddress(input.trim()); setSeed(a); history.replaceState(null, '', `/rocks/preview?address=${a}`) }}>Preview</button>
            {w.account && <button onClick={() => { setInput(w.account!); setSeed(w.account) }}>Use my wallet</button>}
          </div>
          {bad && <Msg m={{ kind: 'bad', text: 'That is not a valid address.' }} />}
          {seed && (
            <>
              <h2 className="sec">Traits</h2>
              {traits.loading ? <p className="note">Reading traits…</p> : traits.error ? <Msg m={{ kind: 'bad', text: traits.error }} /> :
                Object.entries(traits.data ?? {}).map(([k, v]) => <div className="kv" key={k}><span>{k}</span><span>{String(v)}</span></div>)}
            </>
          )}
        </div>
      </div>
    </Shell>
  )
}

// ------------------------------------------------------------------ /rocks/forge
export function Forge() {
  const w = useWallet()
  const list = useAsync(async () => (w.account ? tabletsOf(w.account) : null), [w.account])
  const [pick, setPick] = useState<bigint | null>(null)
  const [ack, setAck] = useState(false)
  const [busy, setBusy] = useState(false)
  const [m, setM] = useState<M>(null)
  const paused = useAsync(() => pub.readContract({ ...rocks, functionName: 'paused' }), [])

  async function done(hash: Hex) {
    setM({ kind: 'info', text: <>Waiting for Base… <a href={basescanTx(hash)} target="_blank" rel="noreferrer">View tx</a></> })
    const rc = await waitTx(hash)
    if (rc.status !== 'success') throw new Error('The transaction reverted.')
    const ev = rc.logs.filter((l) => l.address.toLowerCase() === rocks.address.toLowerCase()).map((l) => { try { return decodeEventLog({ abi: CAPS_ROCKS_ABI, ...l }) } catch { return null } }).find((e) => e?.eventName === 'Forged')
    const id = ev ? (ev.args as { tokenId: bigint }).tokenId : null
    setM({ kind: 'ok', text: <>Forged! {id !== null ? <Link to={`/rocks/${id}`}>Open CAPs Rock #{id.toString()}</Link> : 'Your rock is minted.'} <a href={basescanTx(hash)} target="_blank" rel="noreferrer">Tx</a></> })
    setPick(null); setAck(false); list.reload()
  }

  async function forgeOneTx() {
    if (!w.account || pick === null) return
    setBusy(true); setM(null)
    try {
      // One tx: tablets.safeTransferFrom(you, CAPsRocks, id) -> onERC721Received burns + mints.
      const hash = await write('safeTransferFrom', [w.account, rocks.address, pick], tablets as never)
      await done(hash)
    } catch (e) { setM({ kind: 'bad', text: explainWalletError(e) + ' You can also try the two-step path below.' }) } finally { setBusy(false) }
  }
  async function forgeTwoTx() {
    if (!w.account || pick === null) return
    setBusy(true); setM(null)
    try {
      const approved = await pub.readContract({ ...tablets, functionName: 'getApproved', args: [pick] })
      if (approved.toLowerCase() !== rocks.address.toLowerCase()) {
        const a = await write('approve', [rocks.address, pick], tablets as never)
        setM({ kind: 'info', text: 'Approval sent, waiting for Base…' })
        await waitTx(a)
      }
      await done(await write('forge', [pick]))
    } catch (e) { setM({ kind: 'bad', text: explainWalletError(e) }) } finally { setBusy(false) }
  }

  return (
    <Shell active="forge">
      <div className="banner"><b>Burn &amp; Forge.</b> Pick one of your Prophecy Tablets. It is burned and you get one CAPs Rock seeded by your wallet, in one transaction.</div>
      {paused.data && <Msg m={{ kind: 'bad', text: 'Forging is paused by the contract owner right now.' }} />}
      {!w.account ? <div className="empty">Connect your wallet to see your tablets. Connecting is read-only; nothing is signed until you forge.</div> : (
        <div className="split">
          <div>
            <RockViewer src={`/api/rocks/preview?seed=${w.account}`} label={`YOUR ROCK · SEED ${shortAddress(w.account)}`} />
            <p className="note">Every rock you forge from this wallet uses this same seed.</p>
          </div>
          <div className="panel">
            <h2 className="sec" style={{ marginTop: 0 }}>Your tablets</h2>
            {list.loading ? <p className="note">Scanning tablets on Base…</p> : list.error ? <Msg m={{ kind: 'bad', text: list.error }} /> : !list.data?.length ? (
              <div className="empty">No Prophecy Tablets in this wallet. <a href="https://capsmind.gearup.wtf" target="_blank" rel="noreferrer">Mint one on CAPs mind</a>.</div>
            ) : (
              <div className="list">{list.data.map((t) => (
                <label className="check" key={t.id.toString()}>
                  <input type="radio" name="tablet" checked={pick === t.id} onChange={() => setPick(t.id)} />
                  <span><b>Tablet #{t.id.toString()}</b> <span className="badge">Prophecy #{t.prophecy.toString()}</span></span>
                </label>
              ))}</div>
            )}
            {pick !== null && (
              <>
                <div className="banner danger" style={{ marginTop: 16 }}><b>Permanent burn.</b> Tablet #{pick.toString()} is destroyed forever. It cannot be undone, refunded or recovered. The rock's art is seeded by your wallet and is public forever.</div>
                <label className="check"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I understand Tablet #{pick.toString()} will be burned permanently.</label>
                <div className="row">
                  <button className="danger" disabled={!ack || busy || !!paused.data} onClick={() => void forgeOneTx()}>{busy ? 'Working…' : `Burn tablet #${pick} & forge`}</button>
                </div>
                <p className="note">Wallet refused the one-tx path? <button style={{ padding: '4px 10px', fontSize: 12 }} disabled={!ack || busy || !!paused.data} onClick={() => void forgeTwoTx()}>Approve + forge (2 txs)</button></p>
              </>
            )}
            <Msg m={m} />
          </div>
        </div>
      )}
    </Shell>
  )
}

// ------------------------------------------------------------------ shared rock data
type Face = { kind: number; seed: Address; generatorVersion: number; variant: number; addedAt: bigint; contentHash: Hex; uri: string }
type Pose = { savedBy: Address; savedAt: bigint; poseHash: Hex; uri: string }
async function readRock(id: bigint) {
  const exists = await pub.readContract({ ...rocks, functionName: 'exists', args: [id] })
  if (!exists) throw new Error(`CAPs Rock #${id} does not exist (yet).`)
  const [v, poses] = await Promise.all([
    pub.readContract({ ...rocks, functionName: 'rockView', args: [id] }),
    pub.readContract({ ...rocks, functionName: 'posesOf', args: [id] }),
  ])
  return { v, poses: poses as readonly Pose[] }
}
const poseNames = new Map<string, string>()
function PoseName({ p }: { p: Pose }) {
  const [n, setN] = useState(poseNames.get(p.poseHash) ?? '')
  useEffect(() => {
    if (n) return
    fetch(ipfsToHttp(p.uri, 'https://gateway.pinata.cloud/ipfs/')).then((r) => r.json()).then((j) => { const x = String((j as { name?: string }).name ?? '').slice(0, 40) || 'Pose'; poseNames.set(p.poseHash, x); setN(x) }).catch(() => setN('Pose'))
  }, [p, n])
  return <>{n || '…'}</>
}
const fmtDate = (s: bigint) => new Date(Number(s) * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function FacesList({ id, count, active }: { id: bigint; count: number; active: number | null }) {
  const PAGE = 8
  const [page, setPage] = useState(0)
  const faces = useAsync(() => pub.readContract({ ...rocks, functionName: 'facesOf', args: [id, BigInt(page * PAGE), BigInt(PAGE)] }) as Promise<readonly Face[]>, [id, page])
  if (!count) return <div className="empty">No faces saved yet. This rock shows the blank tablet face.</div>
  const pages = Math.ceil(count / PAGE)
  return (
    <>
      <div className="list">{(faces.data ?? []).map((f, i) => {
        const idx = page * PAGE + i
        return (
          <div className="panel" key={idx}>
            <div className="meta"><span className="title">Face {idx + 1}</span><span>{idx === active && <span className="badge live">Active</span>} <span className={'badge ' + (f.kind === 0 ? 'wallet' : 'custom')}>{f.kind === 0 ? 'Wallet' : 'Custom'}</span></span></div>
            {f.kind === 0 ? <div className="kv"><span>Seed</span><span className="mono">{shortAddress(f.seed)} · g{f.generatorVersion} · v{f.variant}</span></div>
              : <div className="kv"><span>File</span><span className="mono"><a href={ipfsToHttp(f.uri)} target="_blank" rel="noreferrer">{f.uri.slice(0, 32)}…</a></span></div>}
            <div className="kv"><span>Added</span><span>{fmtDate(f.addedAt)}</span></div>
          </div>
        )
      })}</div>
      {pages > 1 && <div className="pager"><button disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</button><span className="note">Page {page + 1} / {pages}</span><button disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</button></div>}
    </>
  )
}

// ------------------------------------------------------------------ /rocks/view?id=N (anyone, view only)
export function View() {
  const q = new URLSearchParams(location.search).get('id') ?? ''
  const [input, setInput] = useState(q)
  const id = /^\d+$/.test(q) ? BigInt(q) : null
  const r = useAsync(async () => (id ? readRock(id) : null), [q])
  return (
    <Shell active="view">
      <div className="banner"><b>View only.</b> Look up any CAPs Rock by id. Nothing to mint or download here; the full model belongs to the holder.</div>
      <div className="panel" style={{ marginBottom: 16 }}>
        <label htmlFor="rid">Rock id</label>
        <div className="row" style={{ marginTop: 0 }}>
          <input id="rid" inputMode="numeric" style={{ flex: 1, minWidth: 120 }} value={input} onChange={(e) => setInput(e.target.value.replace(/\D/g, ''))} />
          <button className="primary" disabled={!input} onClick={() => go(`/rocks/view?id=${input}`)}>Look up</button>
        </div>
      </div>
      {!id ? <div className="empty">Enter a rock id.</div> : r.loading ? <div className="empty">Reading Base…</div> : r.error ? <Msg m={{ kind: 'bad', text: r.error }} /> : r.data && <RockDetails id={id} data={r.data} />}
    </Shell>
  )
}

function RockDetails({ id, data, owner }: { id: bigint; data: Awaited<ReturnType<typeof readRock>>; owner?: React.ReactNode }) {
  const { v, poses } = data
  return (
    <div className="split">
      <div>
        <RockViewer src={`/api/rocks/preview?id=${id}&p=${v.hasActivePose ? poses[Number(v.activePoseIndex)]?.poseHash.slice(2, 10) : 'rest'}&f=${v.hasActiveFace ? v.activeFaceIndex : 'blank'}`} label={`CAPS ROCK #${id} · ${v.hasActiveFace ? 'FACE ' + (Number(v.activeFaceIndex) + 1) : 'BLANK FACE'}`} />
        {owner}
      </div>
      <div>
        <div className="panel">
          <div className="kv"><span>Holder</span><span className="mono"><a href={`https://basescan.org/address/${v.owner}`} target="_blank" rel="noreferrer">{shortAddress(v.owner)}</a></span></div>
          <div className="kv"><span>Seed wallet</span><span className="mono">{shortAddress(v.avatar.seed)}</span></div>
          <div className="kv"><span>Burned tablet</span><span>#{v.avatar.tabletTokenId.toString()} · Prophecy #{v.avatar.prophecyId.toString()}</span></div>
          <div className="kv"><span>Generator</span><span>tablet v{v.avatar.generatorVersion}</span></div>
          <div className="kv"><span>Forged</span><span>{fmtDate(v.avatar.forgedAt)}</span></div>
          <div className="kv"><span>Faces</span><span>{v.faceCount.toString()}</span></div>
          <div className="kv"><span>Poses</span><span>{v.poseCount.toString()} / 42</span></div>
        </div>
        <h2 className="sec">Faces</h2>
        <FacesList id={id} count={Number(v.faceCount)} active={v.hasActiveFace ? Number(v.activeFaceIndex) : null} />
        <h2 className="sec">Poses</h2>
        {!poses.length ? <div className="empty">No poses saved. The rock stands in its rest pose.</div> : (
          <div className="list">{poses.map((p, i) => (
            <div className="panel" key={p.poseHash}><div className="meta"><span className="title"><PoseName p={p} /></span>{v.hasActivePose && Number(v.activePoseIndex) === i ? <span className="badge live">Active</span> : <span className="badge">Pose {i + 1}</span>}</div><p className="note">Saved {fmtDate(p.savedAt)} by {shortAddress(p.savedBy)}</p></div>
          ))}</div>
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ /rocks/[id] (holder)
export function Owner({ id }: { id: bigint }) {
  const w = useWallet()
  const r = useAsync(() => readRock(id), [id.toString()])
  const isOwner = !!(w.account && r.data && r.data.v.owner.toLowerCase() === w.account.toLowerCase())
  return (
    <Shell active="">
      <div className="banner"><b>CAPs Rock #{id.toString()}.</b> Holder page: download the full model and pose your rock. <Link to={`/rocks/view?id=${id}`}>Public view</Link></div>
      {r.loading && !r.data ? <div className="empty">Reading Base…</div> : r.error ? <Msg m={{ kind: 'bad', text: r.error }} /> : !w.account ? (
        <div className="empty">Connect the wallet that holds this rock. Connecting is read-only.</div>
      ) : !isOwner ? (
        <div className="empty">This wallet does not hold CAPs Rock #{id.toString()}. Only the current holder can download or pose it. <Link to={`/rocks/view?id=${id}`}>See the public view</Link>.</div>
      ) : <Holder id={id} data={r.data!} reload={r.reload} account={w.account} />}
    </Shell>
  )
}

type Files = { glb: string; stl: string; rig: string }
function Holder({ id, data, reload, account }: { id: bigint; data: Awaited<ReturnType<typeof readRock>>; reload: () => void; account: Address }) {
  const [files, setFiles] = useState<{ f: Files; exp: number } | null>(null)
  const [rig, setRig] = useState<ArrayBuffer | null>(null)
  const [m, setM] = useState<M>(null)
  const [busy, setBusy] = useState('')
  const [stage, setStage] = useState<RockStage | null>(null)
  const expired = files && files.exp * 1000 < Date.now()

  async function unlock() {
    setBusy('sign'); setM(null)
    try {
      const wc = await walletClient()
      const nonce = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('')
      const expires = Math.floor(Date.now() / 1000) + DOWNLOAD_MAX_TTL_S - 10
      const domain = location.host
      const message = downloadMessage({ domain, address: account, tokenId: id.toString(), nonce, expires })
      const signature = await wc.signMessage({ account, message })
      const out = await fetch('/api/rocks/download', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: account, tokenId: id.toString(), nonce, expires, signature, domain }) })
      const j = await out.json()
      if (!out.ok) throw new Error(j.error || 'Download check failed')
      setFiles({ f: j.files, exp: j.expiresAt })
      setBusy('rig')
      const rr = await fetch(j.files.rig)
      if (!rr.ok) throw new Error((await rr.json().catch(() => ({}))).error || 'Could not load the full model')
      setRig(await rr.arrayBuffer())
      setM({ kind: 'ok', text: 'Unlocked. Download links stay valid for 2 minutes.' })
    } catch (e) { setM({ kind: 'bad', text: explainWalletError(e) }) } finally { setBusy('') }
  }

  return (
    <div className="split">
      <div>
        {rig ? <PoseEditor id={id} rig={rig} data={data} account={account} onSaved={reload} onStage={setStage} /> : (
          <RockViewer src={`/api/rocks/preview?id=${id}&p=${data.v.hasActivePose ? data.poses[Number(data.v.activePoseIndex)]?.poseHash.slice(2, 10) : 'rest'}&f=${data.v.hasActiveFace ? data.v.activeFaceIndex : 'blank'}`} label={`CAPS ROCK #${id}`} onStage={setStage} />
        )}
      </div>
      <div>
        <div className="panel">
          <h2 className="sec" style={{ marginTop: 0 }}>Files (holder only)</h2>
          <p className="note">Sign a free message (no gas, no transaction) to prove you hold this rock. Files are generated on demand with the active pose and face, and only for the current holder.</p>
          {!files || expired ? (
            <div className="row"><button className="primary" disabled={!!busy} onClick={() => void unlock()}>{busy === 'sign' ? 'Check your wallet…' : busy === 'rig' ? 'Loading full model…' : expired ? 'Sign again' : 'Sign to unlock files + pose editor'}</button></div>
          ) : (
            <div className="row">
              <a className="btn primary" href={files.f.glb} download>Download GLB</a>
              <a className="btn primary" href={files.f.stl} download>Download STL</a>
              <button disabled title="FBX export is not available yet">FBX (soon)</button>
            </div>
          )}
          <p className="note">GLB: rigged, textured, 7 animations, active pose. STL: static mesh in the active pose, for 3D printing.</p>
          <Msg m={m} />
        </div>
        <PosesPanel id={id} data={data} reload={reload} />
        <FacesPanel id={id} data={data} account={account} reload={reload} stage={stage} />
      </div>
    </div>
  )
}

function PosesPanel({ id, data, reload }: { id: bigint; data: Awaited<ReturnType<typeof readRock>>; reload: () => void }) {
  const { v, poses } = data
  const [m, setM] = useState<M>(null)
  const [busy, setBusy] = useState(false)
  async function tx(fn: string, args: readonly unknown[], ok: string) {
    setBusy(true); setM(null)
    try { const h = await write(fn, args); setM({ kind: 'info', text: 'Waiting for Base…' }); await waitTx(h); setM({ kind: 'ok', text: ok }); reload() } catch (e) { setM({ kind: 'bad', text: explainWalletError(e) }) } finally { setBusy(false) }
  }
  const active = v.hasActivePose ? Number(v.activePoseIndex) : -1
  return (
    <>
      <h2 className="sec">Poses <span className="badge">{poses.length} / 42</span></h2>
      {!poses.length ? <div className="empty">No poses yet. Unlock the editor, pose your rock and save it.</div> : (
        <div className="list">{poses.map((p, i) => (
          <div className="panel" key={p.poseHash}>
            <div className="meta"><span className="title"><PoseName p={p} /></span>{i === active ? <span className="badge live">Active</span> : <span className="badge">Pose {i + 1}</span>}</div>
            <div className="row">
              {i !== active && <button disabled={busy} onClick={() => void tx('setActivePose', [id, BigInt(i)], 'Active pose set.')}>Make active</button>}
              <button className="danger" disabled={busy} onClick={() => { if (confirm('Remove this pose? (The last pose moves into its slot.)')) void tx('removePose', [id, BigInt(i)], 'Pose removed.') }}>Remove</button>
            </div>
          </div>
        ))}
          {active >= 0 && <button disabled={busy} onClick={() => void tx('clearActivePose', [id], 'Back to the rest pose.')}>Use rest pose</button>}
        </div>
      )}
      <Msg m={m} />
    </>
  )
}

type QuoteRes = { free: boolean; live: boolean; label?: string; reason?: string; gear?: string; quote?: { payer: Address; tokenId: string; kind: number; gearAmount: string; nonce: string; validUntil: string }; signature?: Hex }
const ERC20_ABI = [
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const
const gear = { address: GEAR_TOKEN as Address, abi: ERC20_ABI } as const
const FACE_V = 1

function FaceThumb({ seed, variant }: { seed: string; variant: number }) {
  const svg = useMemo(() => FG.renderSvg(seed, variant).replace(/viewBox="0 0 2400 2400" width="1024" height="1024"/, 'viewBox="0 312 2400 1776" width="100%" height="100%"'), [seed, variant])
  return <div className="face-thumb" dangerouslySetInnerHTML={{ __html: svg }} />
}

function FacesPanel({ id, data, account, reload, stage }: { id: bigint; data: Awaited<ReturnType<typeof readRock>>; account: Address; reload: () => void; stage: RockStage | null }) {
  const own = data.v.avatar.seed.toLowerCase() === account.toLowerCase()
  const q = useAsync(() => api<QuoteRes>(`/api/rocks/quote?id=${id}&payer=${account}&kind=wallet`), [id.toString(), account])
  const cq = useAsync(() => api<QuoteRes>(`/api/rocks/quote?id=${id}&payer=${account}&kind=custom`), [id.toString(), account])
  const count = Number(data.v.faceCount)
  const all = useAsync(() => (count ? pub.readContract({ ...rocks, functionName: 'facesOf', args: [id, 0n, BigInt(count)] }) as Promise<readonly Face[]> : Promise.resolve([] as readonly Face[])), [id.toString(), count])
  const [mood, setMood] = useState(0)
  const [roll, setRoll] = useState(0)
  const [preview, setPreview] = useState(true)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [m, setM] = useState<M>(null)
  const variant = mood + 7 * roll
  const t = useMemo(() => FG.traits(account, variant), [account, variant])
  const taken = (v: number) => (all.data ?? []).some((f) => f.kind === 0 && f.seed.toLowerCase() === account.toLowerCase() && Number(f.generatorVersion) === FACE_V && Number(f.variant) === v)
  const dup = taken(variant)
  const maxF = useAsync(() => pub.readContract({ ...rocks, functionName: 'MAX_FACES' }), [])
  const full = maxF.data !== undefined && BigInt(count) >= maxF.data
  useEffect(() => { stage?.setFace(preview ? { seed: account, variant } : null) }, [stage, preview, account, variant])
  useEffect(() => () => stage?.setFace(null), [stage])
  const price = (x: typeof q) => (x.loading ? '…' : x.error ? 'Price unavailable' : x.data?.free ? 'Free' : x.data?.live ? x.data.label : 'Paid faces not live yet')
  const canPay = own || (q.data?.live && !q.data.free)

  async function tx(fn: string, args: readonly unknown[], ok: ReactNode) {
    setBusy(true); setM(null)
    try { const h = await write(fn, args); setM({ kind: 'info', text: 'Waiting for Base…' }); await waitTx(h); setM({ kind: 'ok', text: ok }); reload() } catch (e) { setM({ kind: 'bad', text: explainWalletError(e) }) } finally { setBusy(false) }
  }
  async function add() {
    setConfirmOpen(false); setBusy(true); setM(null)
    try {
      let h: Hex
      if (own) {
        setM({ kind: 'info', text: 'Confirm addWalletFace in your wallet (free, gas only)…' })
        h = await write('addWalletFace', [id, FACE_V, variant])
      } else {
        setM({ kind: 'info', text: 'Getting a fresh price quote…' })
        const fq = await api<QuoteRes>(`/api/rocks/quote?id=${id}&payer=${account}&kind=wallet`)
        if (!fq.live || fq.free || !fq.quote || !fq.signature) throw new Error(fq.reason || 'Paid faces are not live right now.')
        const amount = BigInt(fq.quote.gearAmount)
        const allowance = await pub.readContract({ ...gear, functionName: 'allowance', args: [account, CAPS_ROCKS as Address] })
        if (allowance < amount) {
          setM({ kind: 'info', text: `Approve exactly ${fq.gear} GEAR for CAPs Rocks in your wallet…` })
          const ah = await write('approve', [CAPS_ROCKS, amount], gear)
          setM({ kind: 'info', text: 'Waiting for the approval on Base…' }); await waitTx(ah)
        }
        const qt = fq.quote
        setM({ kind: 'info', text: `Confirm addWalletFacePaid in your wallet (${fq.gear} GEAR)…` })
        h = await write('addWalletFacePaid', [id, FACE_V, variant, { payer: qt.payer, tokenId: BigInt(qt.tokenId), kind: qt.kind, gearAmount: amount, nonce: BigInt(qt.nonce), validUntil: BigInt(qt.validUntil) }, fq.signature])
      }
      setM({ kind: 'info', text: 'Waiting for Base…' })
      await waitTx(h)
      setM({ kind: 'ok', text: <>Face saved onchain. Use Make active below if it is not active yet. <a href={basescanTx(h)} target="_blank" rel="noreferrer">Tx</a></> })
      reload(); all.reload()
    } catch (e) { setM({ kind: 'bad', text: explainWalletError(e) }) } finally { setBusy(false) }
  }

  const active = data.v.hasActiveFace ? Number(data.v.activeFaceIndex) : -1
  return (
    <>
      <h2 className="sec">Faces</h2>
      <div className="panel faces-gen">
        <div className="meta"><span className="title">Your wallet face</span><span className="badge wallet">{own ? 'Free' : price(q)}</span></div>
        <p className="note">Generated from the connected wallet ({shortAddress(account)}), not the forger. Same wallet + mood + roll = same face, forever.</p>
        <FaceThumb seed={account} variant={variant} />
        <div className="moods" role="radiogroup" aria-label="Mood">{MOODS.map((name, i) => (
          <button key={name} role="radio" aria-checked={mood === i} className={(mood === i ? 'on ' : '') + (taken(i + 7 * roll) ? 'taken' : '')} title={taken(i + 7 * roll) ? 'Already on this rock' : name} onClick={() => setMood(i)}>{name}</button>
        ))}</div>
        <div className="row">
          <button onClick={() => setRoll(roll + 1)}>Reroll</button>
          {roll > 0 && <button onClick={() => setRoll(roll - 1)}>Back</button>}
          <label className="check"><input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} /> Preview on rock</label>
        </div>
        <div className="kv"><span>Face</span><span className="mono">{t.mood} · variant {variant}{FG.ready ? '' : ' · draft preview'}</span></div>
        <div className="row">
          <button className="primary" disabled={!FG.ready || busy || dup || full || !canPay} onClick={() => setConfirmOpen(true)}>{!FG.ready ? 'Add face (soon: final face design pending)' : dup ? 'Already on this rock' : full ? 'Face slots full' : busy ? 'Working…' : `Add this face${own ? ' (free)' : q.data?.label ? ` (${q.data.label})` : ''}`}</button>
          <button disabled title="Coming soon">Add custom face (soon)</button>
        </div>
        <div className="kv"><span>Custom face (CAPs mind)</span><span>{price(cq)}</span></div>
        <Msg m={m} />
      </div>
      {confirmOpen && (
        <div className="modal" role="dialog" aria-modal="true" onClick={() => setConfirmOpen(false)}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <h2 className="sec" style={{ marginTop: 0 }}>Faces are permanent onchain</h2>
            <FaceThumb seed={account} variant={variant} />
            <p>Add <b>{t.mood}</b> (variant {variant}) to CAPs Rock #{id.toString()}? Saved faces can never be removed or edited. You can switch which face is active at any time.</p>
            <p className="note">{own ? 'Free: this wallet is the rock\'s seed wallet. You only pay gas.' : `Costs ${q.data?.label ?? 'the quoted GEAR'} (approval for exactly that amount, then the add), plus gas.`}</p>
            <div className="row"><button onClick={() => setConfirmOpen(false)}>Cancel</button><button className="primary" onClick={() => void add()}>I understand, add face</button></div>
          </div>
        </div>
      )}
      <h2 className="sec">Saved faces</h2>
      {!count ? <div className="empty">No faces saved yet. This rock shows the blank tablet face.</div> : (
        <div className="list">{(all.data ?? []).map((f, i) => (
          <div className="panel" key={i}>
            <div className="meta"><span className="title">Face {i + 1}</span><span>{i === active && <span className="badge live">Active</span>} <span className={'badge ' + (f.kind === 0 ? 'wallet' : 'custom')}>{f.kind === 0 ? 'Wallet' : 'Custom'}</span></span></div>
            {f.kind === 0 && Number(f.generatorVersion) === FACE_V && <FaceThumb seed={f.seed} variant={Number(f.variant)} />}
            <div className="kv"><span>Seed</span><span className="mono">{f.kind === 0 ? `${shortAddress(f.seed)} · g${f.generatorVersion} · v${f.variant}` : f.uri.slice(0, 32)}</span></div>
            <div className="row">{i === active ? <button disabled={busy} onClick={() => void tx('clearActiveFace', [id], 'Back to the blank face.')}>Use blank face</button>
              : <button disabled={busy} onClick={() => void tx('setActiveFace', [id, BigInt(i)], 'Active face set.')}>Make active</button>}</div>
          </div>
        ))}</div>
      )}
    </>
  )
}

function PoseEditor({ id, rig, data, account, onSaved, onStage }: { id: bigint; rig: ArrayBuffer; data: Awaited<ReturnType<typeof readRock>>; account: Address; onSaved: () => void; onStage?: (s: RockStage | null) => void }) {
  const [stage, setStage] = useState<RockStage | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [m, setM] = useState<M>(null)
  const [busy, setBusy] = useState(false)
  const src = useMemo(() => rig.slice(0), [rig])
  useEffect(() => { onStage?.(stage) }, [stage]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!stage) return
    stage.onSelect = setSel
    const { v, poses } = data
    if (v.hasActivePose) {
      const p = poses[Number(v.activePoseIndex)]
      fetch(ipfsToHttp(p.uri, 'https://gateway.pinata.cloud/ipfs/')).then((r) => r.json()).then((j) => { try { const n = normalizePose(j); stage.setPose(n); setName(n.name) } catch { /* rest */ } }).catch(() => {})
    }
  }, [stage]) // eslint-disable-line react-hooks/exhaustive-deps
  const full = data.poses.length >= 42

  async function save() {
    if (!stage) return
    setBusy(true); setM(null)
    try {
      const pose: PoseJson = normalizePose(stage.getPose(name.trim() || 'Pose'))
      const hash = await sha256(canonicalPose(pose))
      if (data.poses.some((p) => p.poseHash.toLowerCase() === hash.toLowerCase())) throw new Error('This exact pose is already saved on the rock.')
      setM({ kind: 'info', text: 'Pinning pose to IPFS…' })
      const pin = await api<{ poseHash: Hex; uri: string }>('/api/rocks/pin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tokenId: id.toString(), address: account, pose }) })
      if (pin.poseHash.toLowerCase() !== hash.toLowerCase()) throw new Error('Pose hash mismatch from the pin server; not saving.')
      setM({ kind: 'info', text: 'Confirm savePose in your wallet…' })
      const tx = await write('savePose', [id, pin.poseHash, pin.uri])
      setM({ kind: 'info', text: 'Waiting for Base…' })
      await waitTx(tx)
      setM({ kind: 'ok', text: <>Pose saved onchain. <a href={basescanTx(tx)} target="_blank" rel="noreferrer">Tx</a></> })
      onSaved()
    } catch (e) { setM({ kind: 'bad', text: explainWalletError(e) }) } finally { setBusy(false) }
  }

  return (
    <div>
      <RockViewer src={src} mode="full" editor onStage={setStage} label={sel ? `JOINT · ${sel}` : 'TAP A JOINT, DRAG THE RINGS'} />
      <div className="panel" style={{ marginTop: 16 }}>
        <h2 className="sec" style={{ marginTop: 0 }}>Pose editor</h2>
        <p className="note">Tap a blue joint (or pick one below), then drag the rings to rotate that bone. Joints and rings never appear in renders or files.</p>
        <div className="bones">{POSE_BONES.filter((b) => !/HandMiddle|ToeBase/.test(b)).map((b) => <button key={b} className={sel === b ? 'on' : ''} onClick={() => stage?.select(b)}>{b}</button>)}</div>
        <div className="row">
          <button disabled={!sel} onClick={() => sel && stage?.resetBone(sel)}>Reset joint</button>
          <button onClick={() => { stage?.setPose(null); stage?.select(null) }}>Reset all</button>
        </div>
        <label htmlFor="pname">Pose name</label>
        <input id="pname" maxLength={40} placeholder="Victory" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="row"><button className="primary" disabled={busy || !name.trim() || full} onClick={() => void save()}>{busy ? 'Saving…' : full ? 'All 42 pose slots used' : 'Save pose onchain'}</button></div>
        <p className="note">Saves the pose JSON (caps-rocks-pose/1) to IPFS, then calls savePose (gas only). Your first pose becomes active automatically.</p>
        <Msg m={m} />
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ /rocks/embed/N (animation_url; preview only)
// OpenSea animation_url: our official LOW-POLY display model (decimated, unrigged, marble vertex colors, active face PNG on the tablet).
// The full textured model stays holder-only. ?still=1 = front view, no spin (used to render the metadata image).
export function Embed({ id }: { id: bigint }) {
  const still = new URLSearchParams(location.search).has('still')
  const [src, setSrc] = useState<{ buf: ArrayBuffer; mode: 'preview' | 'display' } | null>(null)
  useEffect(() => {
    let live = true
    const get = (u: string) => fetch(u).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer() })
    get(`/api/rocks/display?id=${id}`).then((buf) => ({ buf, mode: 'display' as const }))
      .catch(() => get(`/api/rocks/preview?id=${id}`).then((buf) => ({ buf, mode: 'preview' as const })))
      .then((v) => live && setSrc(v)).catch(() => {})
    return () => { live = false }
  }, [id])
  return <div className="rocks embed"><RockViewer src={src?.buf ?? null} mode={src?.mode ?? 'display'} idleSpin={!still} onStage={still ? (s) => { if (s) s.autoRotate = false } : undefined} bare /></div>
}
