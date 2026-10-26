/** Wallet Gear mint page (myassets.gearup.wtf/gear, also mywally.gearup.wtf/gear). Phone-first, no native <select>. Connect is read-only;
 *  wallet signatures only for approve (exact price) + mint, and the free GLB download signature. */
import './gear.css'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { createPublicClient, createWalletClient, custom, fallback, http, getAddress, isAddress, formatUnits, type Address } from 'viem'
import { base } from 'viem/chains'
import { traits, centerDistance, type GearTraits } from '../../shared/gear/traits3.js'
import { buildGear } from '../../shared/gear/gear3.js'
import { ERC20_ABI, GEAR_ABI, GEAR_CONTRACT, USDC_BASE, glbMessage, tokenIdOf } from '../../shared/gear/config'
import { PUBLIC_BASE_RPCS } from '../../shared/my8'
import { wallet, explainWalletError } from '../rocks/wallet'
import { shortAddress, type Eip1193 } from '../rocks/walletCore'

const pub = createPublicClient({ chain: base, transport: fallback(PUBLIC_BASE_RPCS.map((u) => http(u, { timeout: 8000, retryCount: 1 }))) })
const MOCK = new URLSearchParams(location.search).get('mock') // test-only: 'open' | 'paused' | 'minted'
const $ = <T extends HTMLElement>(s: string) => document.querySelector(s) as T
const esc = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const scan = (p: string) => `https://basescan.org/${p}`

document.getElementById('root')!.innerHTML = `
<div class="g-wrap">
  <div class="g-top"><div class="g-brand">Wallet Gear<small>One gear per wallet, forever · Base</small></div>
    <button id="conn" class="g-btn small ghost">Connect wallet</button></div>
  <div class="g-stage" id="stage"><div class="g-badge" id="badge">Your gear</div></div>
  <div id="info"></div>
  <div class="g-card" id="act"></div>
  <div class="g-card"><b>Peek at any wallet's gear</b>
    <div class="g-look"><input id="peek" placeholder="0x… address" autocomplete="off" spellcheck="false" inputmode="text"/><button id="peekGo" class="g-btn small ghost">Show</button></div></div>
  <div class="g-foot">Traits come from your wallet address and never change. Connecting only reads your address.<br/>
    <a href="${scan('address/' + GEAR_CONTRACT)}" target="_blank" rel="noopener">Contract on BaseScan</a> · <a href="/">My Assets</a></div>
</div>`

// ---------- 3D ----------
const stage = $('#stage')
const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
r.setPixelRatio(Math.min(2, devicePixelRatio)); r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace
stage.prepend(r.domElement)
const sc = new THREE.Scene(); sc.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture; sc.environmentIntensity = 0.8
const key = new THREE.DirectionalLight(0xfff1e0, 2.2); key.position.set(.15, .3, .2); sc.add(key)
const rim = new THREE.DirectionalLight(0x9fc3ff, 1.6); rim.position.set(-.25, .12, -.25); sc.add(rim)
const cam = new THREE.PerspectiveCamera(30, 1, .001, 10)
let rig: THREE.Group | null = null, main: THREE.Object3D | null = null, idler: THREE.Object3D | null = null, ratio = 0, rot0 = 0
let dragging = false, lastX = 0, spin = 0, vel = 0
function show(t: GearTraits) {
  if (rig) sc.remove(rig)
  rig = new THREE.Group(); main = buildGear(t); rig.add(main); idler = null
  const top = t.stack === 'Single' ? 0 : +t.stack.split('+')[1]
  if (top) { // neutral 18T idler on the stacked pinion so the gear ratio reads (same as the OpenSea video)
    const it = { ...t, teeth: 18, stack: 'Single', web: 'Solid', hub: 'Flush', engraving: 'None', master: false, toothColors: undefined, color: 'Base', colorHex: '#8a8f98', family: 'Steel', pattern: 'Brushed', sheen: 'None', wear: 'Mint', phase: 0, twist: 0 } as GearTraits
    idler = buildGear(it); idler.position.set(centerDistance(top, 18) / 1000, t.thickness / 1000, 0); rig.add(idler); ratio = top / 18; rot0 = (180 + 10) * Math.PI / 180
  }
  const box = new THREE.Box3().setFromObject(rig), c = box.getCenter(new THREE.Vector3()), R = box.getSize(new THREE.Vector3()).length() / 2
  rig.position.sub(c); sc.add(rig)
  const D = R / Math.sin(15 * Math.PI / 180) * 0.82, tilt = 38 * Math.PI / 180
  cam.position.set(0, D * Math.sin(tilt), D * Math.cos(tilt)); cam.lookAt(0, 0, 0)
}
function size() { const w = stage.clientWidth; r.setSize(w, w, false); cam.aspect = 1; cam.updateProjectionMatrix() }
addEventListener('resize', size); size()
stage.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX })
addEventListener('pointerup', () => { dragging = false })
stage.addEventListener('pointermove', (e) => { if (dragging) { vel = (e.clientX - lastX) * 0.01; spin += vel; lastX = e.clientX } })
let prev = performance.now()
function loop(now: number) {
  const dt = Math.min(.05, (now - prev) / 1000); prev = now
  if (!dragging) { vel *= 0.95; spin += dt * (Math.PI * 2 / 6) + vel }
  if (main) main.rotation.y = spin
  if (idler) idler.rotation.y = rot0 - spin * ratio
  r.render(sc, cam); requestAnimationFrame(loop)
}
requestAnimationFrame(loop)

// ---------- traits ----------
function renderInfo(t: GearTraits, mine: boolean) {
  const chips: [string, unknown][] = [['Tier', t.master ? `Master · ${t.tier}` : t.tier], ['Teeth', `${t.teeth}T`], ['Stack', t.stack], ['Family', t.family],
    ['Color', t.master ? 'Master' : t.color], ['Pattern', t.pattern], ['Web', `${t.web} ×${t.arms}`], ['Hub · Bore', `${t.hub} · ${t.bore}`], ['Engraving', t.engraving], ['Sheen · Wear', `${t.sheen} · ${t.wear}`]]
  $('#info').innerHTML = `<div class="g-name">${esc(t.name)}</div><p class="g-sub">${mine ? 'This is the gear for your wallet ' : 'Gear for '}${esc(shortAddress(t.address))}. It is the same forever.</p>
  <div class="g-chips">${chips.map(([k, v]) => `<div class="g-chip"><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join('')}</div>`
  $('#badge').textContent = `${t.master ? 'Master · ' : ''}${t.tier} · ${t.teeth}T${t.stack !== 'Single' ? ' · ' + t.stack : ''}`
}

// ---------- chain state ----------
type Chain = { paused: boolean; price: bigint; minted: boolean; balance: bigint; allowance: bigint }
async function readChain(a: Address): Promise<Chain> {
  if (MOCK) return { paused: MOCK === 'paused', price: 1_000_000n, minted: MOCK === 'minted', balance: 5_000_000n, allowance: 0n }
  const [paused, price, minted, balance, allowance] = await Promise.all([
    pub.readContract({ address: GEAR_CONTRACT, abi: GEAR_ABI, functionName: 'paused' }),
    pub.readContract({ address: GEAR_CONTRACT, abi: GEAR_ABI, functionName: 'mintPrice' }),
    pub.readContract({ address: GEAR_CONTRACT, abi: GEAR_ABI, functionName: 'hasMinted', args: [a] }),
    pub.readContract({ address: USDC_BASE, abi: ERC20_ABI, functionName: 'balanceOf', args: [a] }),
    pub.readContract({ address: USDC_BASE, abi: ERC20_ABI, functionName: 'allowance', args: [a, GEAR_CONTRACT] }),
  ])
  return { paused, price, minted, balance, allowance }
}
let viewing: string | null = null, chain: Chain | null = null, busy = false, msg = '', msgKind = '', lastTx = ''
const usd = (v: bigint) => `${formatUnits(v, 6)} USDC`
function setMsg(m: string, k = '') { msg = m; msgKind = k; renderAct() }
function renderAct() {
  const me = wallet.state.account, act = $('#act')
  const status = msg ? `<p class="g-status ${msgKind}">${esc(msg)}</p>` : ''
  const txl = lastTx ? `<div class="g-row"><a href="${scan('tx/' + lastTx)}" target="_blank" rel="noopener">View transaction on BaseScan ↗</a></div>` : ''
  if (!me) { act.innerHTML = `<b>See your gear, then mint it</b><p class="g-sub">Connect to see your own wallet's gear before you pay anything. Connecting does not sign or spend.</p><button class="g-btn" id="go">Connect wallet</button>${status}`; return }
  if (viewing !== me.toLowerCase()) { act.innerHTML = `<p class="g-sub">You're looking at someone else's gear.</p><button class="g-btn ghost" id="mine">Show my gear</button>`; return }
  if (!chain) { act.innerHTML = `<p class="g-sub">Checking your gear on Base…</p>${status}`; return }
  const id = tokenIdOf(me).toString()
  if (chain.minted) {
    act.innerHTML = `<b>✅ You own this gear</b><p class="g-sub">Token #${esc(shortAddress('0x' + BigInt(id).toString(16).padStart(40, '0')))} on Base. Your spinning video shows on OpenSea and in wallets a few minutes after minting.</p>
    <button class="g-btn" id="glb" ${busy ? 'disabled' : ''}>Download 3D model (GLB)</button><p class="g-sub" style="margin-top:6px">Free signature, no gas. Only the holder can download.</p>
    <div class="g-row"><a href="${scan(`token/${GEAR_CONTRACT}?a=${id}`)}" target="_blank" rel="noopener">BaseScan ↗</a><a href="https://opensea.io/assets/base/${GEAR_CONTRACT}/${id}" target="_blank" rel="noopener">OpenSea ↗</a></div>${status}${txl}`
    return
  }
  if (chain.paused) { act.innerHTML = `<b>⏸ Minting is paused right now</b><p class="g-sub">Your gear above is yours to mint when it opens. Price: ${usd(chain.price)}. Check back soon.</p>${status}`; return }
  const needApprove = chain.allowance < chain.price, low = chain.balance < chain.price
  act.innerHTML = `<b>Mint your gear · ${usd(chain.price)}</b>
   <ol class="g-steps"><li class="${needApprove ? 'now' : 'done'}">1. Allow exactly ${usd(chain.price)} (USDC approve)${needApprove ? '' : ' ✓'}</li><li class="${needApprove ? '' : 'now'}">2. Mint (pays ${usd(chain.price)} to the gear treasury)</li></ol>
   ${low ? `<p class="g-status err">You need ${usd(chain.price)} on Base. You have ${usd(chain.balance)}.</p>` : ''}
   <button class="g-btn" id="mint" ${busy || low ? 'disabled' : ''}>${busy ? 'Check your wallet…' : needApprove ? `Step 1: Allow ${usd(chain.price)}` : 'Step 2: Mint my gear'}</button>
   <p class="g-sub" style="margin-top:6px">You need a little ETH on Base for gas.</p>${status}${txl}`
}
let chainFor = ''
async function view(addr: string) {
  viewing = addr.toLowerCase(); const t = traits(viewing); show(t)
  const me = wallet.state.account?.toLowerCase()
  renderInfo(t, viewing === me); chain = null; renderAct()
  history.replaceState(null, '', `?a=${viewing}${MOCK ? '&mock=' + MOCK : ''}`)
  if (me && viewing === me) { chainFor = me; try { chain = await readChain(getAddress(me)) } catch { setMsg('Could not read Base right now. Pull to refresh.', 'err') } renderAct() }
}

async function walletClient() {
  const eth = wallet.provider() as Eip1193
  if (!(await wallet.ensureBase())) throw new Error('Please switch your wallet to Base.')
  return createWalletClient({ chain: base, transport: custom(eth), account: wallet.state.account! })
}
async function mintFlow() {
  if (!chain || busy) return
  busy = true; lastTx = ''; setMsg('')
  try {
    const wc = await walletClient(), me = wallet.state.account!
    if (chain.allowance < chain.price) {
      setMsg(`Approve exactly ${usd(chain.price)} in your wallet…`)
      const h = await wc.writeContract({ address: USDC_BASE, abi: ERC20_ABI, functionName: 'approve', args: [GEAR_CONTRACT, chain.price] })
      lastTx = h; setMsg('Approval sent. Waiting for Base…')
      await pub.waitForTransactionReceipt({ hash: h })
      chain = await readChain(me); busy = false; setMsg('Approved ✓ Now tap Step 2 to mint.', 'ok'); return
    }
    setMsg('Confirm the mint in your wallet…')
    const h = await wc.writeContract({ address: GEAR_CONTRACT, abi: GEAR_ABI, functionName: 'mint', args: [] })
    lastTx = h; setMsg('Mint sent. Waiting for Base…')
    const rc = await pub.waitForTransactionReceipt({ hash: h })
    if (rc.status !== 'success') throw new Error('The mint transaction failed on-chain. No gear was minted.')
    fetch('/api/gear/queue', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: me }) }).catch(() => {})
    chain = await readChain(me); busy = false; setMsg('🎉 Minted! Your gear is yours forever.', 'ok')
  } catch (e) { busy = false; const m = explainWalletError(e); setMsg(/AlreadyMinted/.test(m) ? 'This wallet already minted its gear.' : /paused|EnforcedPause/i.test(m) ? 'Minting is paused right now.' : m, 'err') }
}
async function glbFlow() {
  if (busy) return
  busy = true; setMsg('Sign the free message in your wallet (no gas)…')
  try {
    const me = wallet.state.account!, eth = wallet.provider() as Eip1193
    const domain = location.host, tokenId = tokenIdOf(me).toString(), expires = Math.floor(Date.now() / 1000) + 240
    const message = glbMessage({ domain, address: me, tokenId, expires })
    const hex = '0x' + Array.from(new TextEncoder().encode(message), (b) => b.toString(16).padStart(2, '0')).join('')
    const signature = await eth.request({ method: 'personal_sign', params: [hex, me] })
    setMsg('Checking you hold it…')
    const res = await fetch('/api/gear/glb', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: me, tokenId, expires, signature, domain }) })
    if (!res.ok) { const j = await res.json().catch(() => ({})) as { error?: string }; throw new Error(j.error || `Download failed (${res.status})`) }
    const url = URL.createObjectURL(await res.blob()), a = document.createElement('a')
    a.href = url; a.download = `wallet-gear-${traits(me).serial}.glb`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000)
    busy = false; setMsg('Downloaded ✓', 'ok')
  } catch (e) { busy = false; setMsg(explainWalletError(e), 'err') }
}

function syncConn() { const a = wallet.state.account; $('#conn').textContent = a ? shortAddress(a) : wallet.state.busy ? 'Connecting…' : 'Connect wallet' }
wallet.subscribe(() => { syncConn(); const a = wallet.state.account?.toLowerCase(); if (a && !peeked && (viewing !== a || chainFor !== a)) void view(a); else renderAct() })
let peeked = false
document.addEventListener('click', (e) => {
  const id = (e.target as HTMLElement).closest('button')?.id
  if (id === 'conn' || id === 'go') { peeked = false; void (wallet.state.account && id === 'conn' ? wallet.disconnect() : wallet.connect().catch((er) => setMsg(explainWalletError(er), 'err'))) }
  if (id === 'mine' && wallet.state.account) { peeked = false; void view(wallet.state.account) }
  if (id === 'mint') void mintFlow()
  if (id === 'glb') void glbFlow()
  if (id === 'peekGo') { const v = $<HTMLInputElement>('#peek').value.trim(); if (isAddress(v, { strict: false })) { peeked = true; void view(v) } else setMsg('That is not a valid 0x address.', 'err') }
})
const qa = new URLSearchParams(location.search).get('a')
syncConn()
void view(qa && isAddress(qa, { strict: false }) ? qa : wallet.state.account ?? '0x604b2e24df58ef019312b8367af763a7f156bf08')
if (qa) peeked = true
