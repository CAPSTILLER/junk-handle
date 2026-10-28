/** Wallet Gear Trade Desk (myassets.gearup.wtf/gear/desk). Phone-first. Connect is read-only; the wallet only signs writes:
 *  Wallet Gear setApprovalForAll(desk), GEAR token approve(exact amount), and the desk action itself. All reads are client-side. */
import './gear.css'
import { createPublicClient, createWalletClient, custom, fallback, http, formatUnits, getAddress, isAddress, parseAbiItem, type Address, type Hash } from 'viem'
import { base } from 'viem/chains'
import { traits } from '../../shared/gear/traits3.js'
import { ERC20_ABI, GEAR_CONTRACT, GEAR_DESK, addrOfToken } from '../../shared/gear/config'
import { DESK_ABI, NFT_ABI, GEAR_TOKEN, GEAR_NFT_DEPLOY_BLOCK, OFFER_STATUS, BID_STATUS } from '../../shared/gear/desk'
import { PUBLIC_BASE_RPCS } from '../../shared/my8'
import { wallet, explainWalletError } from '../rocks/wallet'
import { shortAddress, type Eip1193 } from '../rocks/walletCore'

const qs = new URLSearchParams(location.search)
const LOCAL = /^(127\.0\.0\.1|localhost)$/.test(location.hostname)
const RPC_OVERRIDE = LOCAL ? qs.get('rpc') : null // test-only (fork), ignored on the live site
const rpcs: string[] = RPC_OVERRIDE ? [RPC_OVERRIDE] : [...PUBLIC_BASE_RPCS]
const pub = createPublicClient({ chain: base, batch: { multicall: true }, transport: fallback(rpcs.map((x) => http(x, { timeout: 10000, retryCount: 1 }))) })
const logsClient = createPublicClient({ chain: base, transport: http(RPC_OVERRIDE || 'https://base-rpc.publicnode.com', { timeout: 15000, retryCount: 1 }) })
const LOG_SPAN = 50_000n // publicnode max range; with Denim 200ms blocks that's ~2.8h per call, progress is cached
const DESK = getAddress(GEAR_DESK), NFT = getAddress(GEAR_CONTRACT), TOKEN = getAddress(GEAR_TOKEN)
const $ = <T extends HTMLElement>(s: string) => document.querySelector(s) as T
const esc = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const scan = (p: string) => `https://basescan.org/${p}`
const UNIT = 1_000_000n // GEAR token has 6 decimals
const g = (v: bigint) => { const n = formatUnits(v, 6).replace(/\.0+$/, ''); return `${n} GEAR token${n === '1' ? '' : 's'}` }
const when = (s: bigint) => s ? new Date(Number(s) * 1000).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' }) + ' ET' : '—'
const gearName = (id: bigint) => { try { return traits(addrOfToken(id)).name } catch { return 'Wallet Gear' } }
// ---------------- Wallet Gear pictures (tokenURI metadata image, lazy) ----------------
const PLACEHOLDER = '/gear-placeholder.png'
const GATEWAYS = ['https://gateway.pinata.cloud/ipfs/', 'https://ipfs.io/ipfs/', 'https://dweb.link/ipfs/']
const ipfs = (u: string, k = 0) => u.startsWith('ipfs://') ? GATEWAYS[k] + u.slice(7).replace(/^ipfs\//, '') : u
type Meta = { image?: string; animation_url?: string; name?: string }
const metaCache = new Map<string, Promise<Meta | null>>(), imgCache = new Map<string, string>()
const meta = (id: string) => {
  if (!metaCache.has(id)) metaCache.set(id, fetch(`/api/gear/meta/${id}`).then((r) => r.ok ? r.json() : null).then((j) => j && !j.error ? j as Meta : null).catch(() => null))
  return metaCache.get(id)!
}
const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { io!.unobserve(e.target); void loadImg(e.target as HTMLImageElement) } }), { rootMargin: '200px' }) : null
async function loadImg(el: HTMLImageElement) {
  const id = el.dataset.gimg!, m = await meta(id)
  if (!m?.image) return
  let k = 0
  el.onerror = () => { if (++k < GATEWAYS.length && m.image!.startsWith('ipfs://')) el.src = ipfs(m.image!, k); else { el.onerror = null; el.src = PLACEHOLDER } }
  el.onload = () => { if (!el.src.endsWith(PLACEHOLDER)) { imgCache.set(id, el.src); el.parentElement?.classList.add('ok') } }
  el.src = ipfs(m.image, 0)
}
function hydrateImgs() {
  document.querySelectorAll<HTMLImageElement>('img[data-gimg]').forEach((el) => {
    if (imgCache.has(el.dataset.gimg!)) { el.parentElement?.classList.add('ok'); return }
    if (io) io.observe(el); else void loadImg(el)
  })
}
async function spinGear(id: string) {
  const [{ openSpin }, m] = await Promise.all([import('./spin'), meta(id)])
  const big = BigInt(id), addr = addrOfToken(big)
  openSpin(addr, { title: gearName(big), sub: `${T(big) || '?'}T Wallet Gear · ${shortAddress(addr)}`, video: m?.animation_url ? ipfs(m.animation_url) : null })
}
const tokLink = (id: bigint) => `<a href="${scan(`token/${NFT}?a=${id}`)}" target="_blank" rel="noopener">${esc(shortAddress(addrOfToken(id)))}</a>`

type Offer = { offerer: Address; createdAt: bigint; closedAt: bigint; status: number; paid: bigint; winningBid: bigint; gears: readonly bigint[]; bidIds: readonly bigint[] }
type Bid = { offerId: bigint; taker: Address; createdAt: bigint; status: number; paid: bigint; gears: readonly bigint[] }
type S = {
  paused: boolean; vault: bigint; now: bigint; offers: Offer[]; bidsByOffer: Map<number, { id: bigint; b: Bid }[]>
  teeth: Map<string, number>; binAb: bigint[]; binPu: bigint[]; puPrice: Map<string, bigint>
  mine: bigint[]; myBids: { id: bigint; b: Bid; deadline: bigint }[]; approvedNft: boolean; bal: bigint; allow: bigint
}
let st: S | null = null, tab = qs.get('tab') || 'gears', sel = new Set<string>(), busy = '', msg = '', msgKind = '', lastTx = '', openBids = new Set<number>(), scanNote = ''

document.getElementById('root')!.innerHTML = `
<div class="g-wrap">
  <div class="g-top"><div class="g-brand">Wallet Gear Trade Desk<small>Swap Wallet Gears · earn GEAR tokens · Base</small></div>
    <button id="conn" class="g-btn small ghost">Connect wallet</button></div>
  <div class="d-tabs" id="tabs"></div>
  <div id="note"></div>
  <div id="body"></div>
  <div class="g-foot">Connecting only reads your address. You sign only when you make a move.<br/>
    <a href="${scan('address/' + DESK)}" target="_blank" rel="noopener">Desk on BaseScan</a> · <a href="/gear">Mint your Wallet Gear</a> · <a href="https://gearvault.gearup.wtf" target="_blank" rel="noopener">Gear Vault</a>
    <a class="g-logo" href="https://landonthis.gearup.wtf" aria-label="GEAR home"><img src="/gear-logo-cutout.png" alt="GEAR" width="512" height="128"/></a></div>
</div>`

const TABS: [string, string][] = [['gears', 'My Wallet Gears'], ['offers', 'Offers'], ['mine', 'My trades'], ['bin', 'Bin'], ['how', 'How it works']]
function renderTabs() { $('#tabs').innerHTML = TABS.map(([k, l]) => `<button class="d-tab ${tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('') }

// ---------------- reads ----------------
async function ownedGears(me: Address): Promise<bigint[]> {
  const key = `desk.scan.${me.toLowerCase()}`
  const start = LOCAL && qs.get('from') ? BigInt(qs.get('from')!) : GEAR_NFT_DEPLOY_BLOCK // ?from= is a fork-test aid, localhost only
  let saved: { to: string; c: string[] } = { to: (start - 1n).toString(), c: [] }
  try { const j = localStorage.getItem(key); if (j && !RPC_OVERRIDE) saved = JSON.parse(j) } catch { /* fresh */ }
  const cands = new Set<string>([BigInt(me.toLowerCase()).toString(), ...saved.c])
  try {
    const head = await logsClient.getBlockNumber({ cacheTime: 0 })
    let from = BigInt(saved.to) + 1n, calls = 0
    const ev = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)')
    let span = LOG_SPAN
    while (from <= head && calls < 60) {
      const to = from + span - 1n > head ? head : from + span - 1n
      calls++
      let logs
      try { logs = await logsClient.getLogs({ address: NFT, event: ev, args: { to: me }, fromBlock: from, toBlock: to }) }
      catch (e) { if (span > 500n) { span /= 4n; continue } throw e } // range too big for this RPC: shrink and retry
      for (const l of logs) if (l.args.tokenId !== undefined) cands.add(l.args.tokenId.toString())
      saved = { to: to.toString(), c: [...cands] }; from = to + 1n
    }
    scanNote = from <= head ? 'Still scanning older history. Refresh to keep going.' : ''
    try { localStorage.setItem(key, JSON.stringify(saved)) } catch { /* full */ }
  } catch { scanNote = 'Could not scan your Wallet Gear history right now. Showing the Wallet Gear you minted.' }
  const extra = (localStorage.getItem('desk.extra') || '').split(',').filter(Boolean)
  for (const e of extra) cands.add(e)
  const list = [...cands].map((x) => BigInt(x))
  const owners = await Promise.all(list.map((id) => pub.readContract({ address: NFT, abi: NFT_ABI, functionName: 'ownerOf', args: [id] }).catch(() => null)))
  return list.filter((_, i) => owners[i]?.toLowerCase() === me.toLowerCase())
}

async function load() {
  const me = wallet.state.account
  const [paused, vault, offerCount, bidCount, purchasedCount, blk] = await Promise.all([
    pub.readContract({ address: DESK, abi: DESK_ABI, functionName: 'paused' }),
    pub.readContract({ address: DESK, abi: DESK_ABI, functionName: 'vaultAvailable' }),
    pub.readContract({ address: DESK, abi: DESK_ABI, functionName: 'offerCount' }),
    pub.readContract({ address: DESK, abi: DESK_ABI, functionName: 'bidCount' }),
    pub.readContract({ address: DESK, abi: DESK_ABI, functionName: 'purchasedCount' }),
    pub.getBlock(),
  ])
  const offers: Offer[] = []
  for (let i = 0n; i < offerCount; i += 50n) offers.push(...(await pub.readContract({ address: DESK, abi: DESK_ABI, functionName: 'getOffers', args: [i, 50n] })) as Offer[])
  const binAb: bigint[] = []
  for (let i = 0n; i < offerCount; i += 50n) { const [o, n] = await pub.readContract({ address: DESK, abi: DESK_ABI, functionName: 'binTokensFromOffers', args: [i, 50n] }); binAb.push(...o.slice(0, Number(n))) }
  for (let i = 0n; i < bidCount; i += 50n) { const [o, n] = await pub.readContract({ address: DESK, abi: DESK_ABI, functionName: 'binTokens', args: [i, 50n] }); binAb.push(...o.slice(0, Number(n))) }
  // binTokens() can re-list a gear that's in the bin via an offer (it checks inBin per token), so dedupe
  const binAbU = [...new Set(binAb.map(String))].map((x) => BigInt(x)); binAb.length = 0; binAb.push(...binAbU)
  const binPu: bigint[] = []
  for (let i = 0n; i < purchasedCount; i += 100n) binPu.push(...(await pub.readContract({ address: DESK, abi: DESK_ABI, functionName: 'purchasedTokens', args: [i, 100n] })))
  const bidsByOffer = new Map<number, { id: bigint; b: Bid }[]>()
  await Promise.all(offers.map(async (o, i) => {
    if (!o.bidIds.length) return
    const bs = (await pub.readContract({ address: DESK, abi: DESK_ABI, functionName: 'getBidsForOffer', args: [BigInt(i), 0n, 200n] })) as Bid[]
    bidsByOffer.set(i, bs.map((b, k) => ({ id: o.bidIds[k], b })))
  }))
  let mine: bigint[] = [], myBids: S['myBids'] = [], approvedNft = false, bal = 0n, allow = 0n
  if (me) {
    const [m, ids, ap, b, a] = await Promise.all([
      ownedGears(me),
      pub.readContract({ address: DESK, abi: DESK_ABI, functionName: 'bidIdsOf', args: [me] }),
      pub.readContract({ address: NFT, abi: NFT_ABI, functionName: 'isApprovedForAll', args: [me, DESK] }),
      pub.readContract({ address: TOKEN, abi: ERC20_ABI, functionName: 'balanceOf', args: [me] }),
      pub.readContract({ address: TOKEN, abi: ERC20_ABI, functionName: 'allowance', args: [me, DESK] }),
    ])
    mine = m; approvedNft = ap; bal = b; allow = a
    myBids = await Promise.all(ids.map(async (id) => ({ id, b: (await pub.readContract({ address: DESK, abi: DESK_ABI, functionName: 'getBid', args: [id] })) as Bid,
      deadline: await pub.readContract({ address: DESK, abi: DESK_ABI, functionName: 'bidDeadline', args: [id] }) })))
  }
  const all = new Set<string>([...mine, ...binAb, ...binPu, ...offers.flatMap((o) => o.gears), ...[...bidsByOffer.values()].flat().flatMap((x) => x.b.gears)].map(String))
  const teeth = new Map<string, number>()
  await Promise.all([...all].map(async (id) => teeth.set(id, await pub.readContract({ address: NFT, abi: NFT_ABI, functionName: 'teethOf', args: [BigInt(id)] }))))
  const puPrice = new Map<string, bigint>()
  await Promise.all(binPu.map(async (id) => puPrice.set(id.toString(), await pub.readContract({ address: DESK, abi: DESK_ABI, functionName: 'purchasedPriceOf', args: [id] }))))
  st = { paused, vault, now: blk.timestamp, offers, bidsByOffer, teeth, binAb, binPu, puPrice, mine, myBids, approvedNft, bal, allow }
  for (const s of [...sel]) if (!mine.some((m) => m.toString() === s)) sel.delete(s)
}

// ---------------- render ----------------
const T = (id: bigint) => st?.teeth.get(id.toString()) ?? 0
const face = (ids: readonly bigint[]) => ids.reduce((a, id) => a + BigInt(T(id)) * UNIT, 0n)
const gearRow = (id: bigint, extra = '') => `<div class="d-gear"><button type="button" class="d-img" data-spin="${id}" aria-label="Spin this Wallet Gear"><img alt="" loading="lazy" decoding="async" data-gimg="${id}" src="${imgCache.get(id.toString()) || PLACEHOLDER}"/><span class="d-t t${T(id)}">${T(id)}T</span></button><span class="d-n">${esc(gearName(id))}<small>${tokLink(id)}</small></span>${extra}</div>`
const btn = (act: string, arg: string, label: string, dis: string | false = false, ghost = false) =>
  `<button class="g-btn ${ghost ? 'ghost' : ''}" data-act="${act}" data-arg="${esc(arg)}" ${dis || busy ? 'disabled' : ''}>${busy === act + arg ? 'Check your wallet…' : esc(label)}</button>${dis ? `<p class="d-why">${esc(dis)}</p>` : ''}`

/** Two-step button for a GEAR token payment: approve exact amount, then the action. */
function payBtn(act: string, arg: string, amount: bigint, label: string, why: string | false) {
  if (!st) return ''
  if (why) return btn(act, arg, label, why)
  if (st.bal < amount) return btn(act, arg, label, `You need ${g(amount)}. You have ${g(st.bal)}.`)
  const need = st.allow < amount
  return `<ol class="g-steps"><li class="${need ? 'now' : 'done'}">1. Allow exactly ${g(amount)}${need ? '' : ' ✓'}</li><li class="${need ? '' : 'now'}">2. ${esc(label)}</li></ol>` +
    (need ? btn('approveGear', amount.toString(), `Step 1: Allow ${g(amount)}`) : btn(act, arg, `Step 2: ${label}`))
}
/** Two-step button for putting Wallet Gears in: setApprovalForAll(desk), then the action. */
function nftBtn(act: string, arg: string, label: string, why: string | false) {
  if (!st) return ''
  if (why) return btn(act, arg, label, why)
  const need = !st.approvedNft
  return `<ol class="g-steps"><li class="${need ? 'now' : 'done'}">1. Let the desk move your Wallet Gears${need ? '' : ' ✓'}</li><li class="${need ? '' : 'now'}">2. ${esc(label)}</li></ol>` +
    (need ? btn('approveNft', '', 'Step 1: Let the desk move my Wallet Gears') : btn(act, arg, `Step 2: ${label}`))
}
function putInWhy(n: number, owed: bigint): string | false {
  if (!st) return 'Loading…'
  if (st.paused) return 'The desk is paused right now.'
  if (n < 1) return 'Tick 1 to 10 of your Wallet Gears in My Wallet Gears first.'
  if (n > 10) return 'Pick at most 10 Wallet Gears.'
  if (st.vault < owed) return `The vault can pay ${g(st.vault)} right now, less than ${g(owed)}.`
  return false
}

function render() { renderInner(); hydrateImgs() }
function renderInner() {
  renderTabs()
  const me = wallet.state.account
  const status = msg ? `<p class="g-status ${msgKind}">${esc(msg)}</p>` : ''
  const txl = lastTx ? `<div class="g-row"><a href="${scan('tx/' + lastTx)}" target="_blank" rel="noopener">View transaction on BaseScan ↗</a></div>` : ''
  $('#note').innerHTML = (st ? `<div class="d-strip"><span>${st.paused ? '⏸ Paused' : '🟢 Open'}</span><span>Vault can pay <b>${g(st.vault)}</b></span></div>` : '') +
    (status || txl ? `<div class="g-card">${status}${txl}</div>` : '')
  const b = $('#body')
  if (tab === 'how') { b.innerHTML = HOW; return }
  if (!st) { b.innerHTML = `<div class="g-card"><p class="g-sub">Reading the desk on Base…</p></div>`; return }
  if (!me && tab !== 'offers' && tab !== 'bin') { b.innerHTML = `<div class="g-card"><b>Connect to trade</b><p class="g-sub">Connecting only reads your address. Nothing is signed or spent.</p><button class="g-btn" id="go">Connect wallet</button></div>`; return }
  const selIds = [...sel].map((x) => BigInt(x)), selOwed = face(selIds)
  if (tab === 'gears') {
    const rows = st.mine.length ? st.mine.map((id) => `<label class="d-pick">${gearRow(id, `<input type="checkbox" data-sel="${id}" ${sel.has(id.toString()) ? 'checked' : ''}/>`)}</label>`).join('')
      : `<p class="g-sub">No Wallet Gears in this wallet right now. <a href="/gear">Mint yours</a>, or check the Bin.</p>`
    b.innerHTML = `<div class="g-card"><b>My Wallet Gears</b><p class="g-sub">Tick the Wallet Gears you want to use (1–10). Each one pays its tooth count in GEAR tokens when you put it in. Tap a picture to spin it.</p>${rows}
      ${scanNote ? `<p class="d-why">${esc(scanNote)}</p>` : ''}
      <div class="g-look"><input id="addId" placeholder="Missing one? Paste its 0x id" autocomplete="off" spellcheck="false"/><button id="addGo" class="g-btn small ghost">Add</button></div></div>
      <div class="g-card"><b>Post an offer</b><p class="g-sub">${selIds.length} Wallet Gear${selIds.length === 1 ? '' : 's'} picked. You get <b>${g(selOwed)}</b> now. Others bid their Wallet Gears; you pick one and repay ${g(selOwed)} to swap. You can pull out anytime by repaying.</p>
      ${nftBtn('createOffer', '', `Post offer · get ${g(selOwed)}`, putInWhy(selIds.length, selOwed))}</div>
      <div class="g-card"><b>Sell to the house</b><p class="g-sub">Sell the picked Wallet Gears for good. You get <b>${g(selOwed)}</b> now (32T = 32, 18T = 18, 11T = 11 GEAR tokens). They go to the purchased bin, where anyone can buy them for 35 / 20 / 12 GEAR tokens.</p>
      ${nftBtn('sell', '', `Sell ${selIds.length} Wallet Gear${selIds.length === 1 ? '' : 's'} to the house · get ${g(selOwed)}`, putInWhy(selIds.length, selOwed))}</div>`
    return
  }
  if (tab === 'offers') {
    const open = st.offers.map((o, i) => ({ o, i })).filter((x) => x.o.status === 1 && st!.now < x.o.createdAt + 365n * 86400n)
    b.innerHTML = open.length ? open.map(({ o, i }) => offerCard(o, i, me, selIds, selOwed)).join('') : `<div class="g-card"><b>No open offers yet</b><p class="g-sub">Be the first: tick Wallet Gears in My Wallet Gears and post an offer.</p></div>`
    return
  }
  if (tab === 'mine') {
    const mineO = st.offers.map((o, i) => ({ o, i })).filter((x) => me && x.o.offerer.toLowerCase() === me.toLowerCase()).reverse()
    b.innerHTML = `<h3 class="d-h">My offers</h3>${mineO.length ? mineO.map(({ o, i }) => offerCard(o, i, me, selIds, selOwed)).join('') : '<div class="g-card"><p class="g-sub">You have not posted any offers.</p></div>'}
      <h3 class="d-h">My bids</h3>${st.myBids.length ? [...st.myBids].reverse().map(myBidCard).join('') : '<div class="g-card"><p class="g-sub">You have not bid on any offers.</p></div>'}`
    return
  }
  if (tab === 'bin') {
    const pu = st.binPu.map((id) => { const p = st!.puPrice.get(id.toString()) ?? 0n; return `<div class="g-card">${gearRow(id, `<b class="d-price">${g(p)}</b>`)}${me ? payBtn('buyPurchased', id.toString(), p, `Buy for ${g(p)}`, st!.paused && 'The desk is paused right now.') : ''}</div>` }).join('')
    const ab = st.binAb.map((id) => { const p = BigInt(T(id)) * UNIT; return `<div class="g-card">${gearRow(id, `<b class="d-price">${g(p)}</b>`)}${me ? payBtn('buyBin', id.toString(), p, `Buy for ${g(p)}`, st!.paused && 'The desk is paused right now.') : ''}</div>` }).join('')
    b.innerHTML = `<h3 class="d-h">Purchased (sold to the house)</h3><p class="g-sub">35 GEAR tokens for 32T · 20 for 18T · 12 for 11T.</p>${pu || '<div class="g-card"><p class="g-sub">Empty right now.</p></div>'}
      <h3 class="d-h">Abandoned</h3><p class="g-sub">Wallet Gears left on the desk past their deadline. Face value: 32 / 18 / 11 GEAR tokens.</p>${ab || '<div class="g-card"><p class="g-sub">Empty right now.</p></div>'}
      ${me ? '' : '<p class="g-sub">Connect to buy.</p>'}`
  }
}

function offerCard(o: Offer, i: number, me: Address | null, selIds: bigint[], selOwed: bigint) {
  const s = st!, mineO = !!me && o.offerer.toLowerCase() === me.toLowerCase(), expiry = o.createdAt + 365n * 86400n
  const live = o.status === 1 && s.now < expiry
  const bids = s.bidsByOffer.get(i) || [], openB = bids.filter((x) => x.b.status === 1)
  const head = `<div class="d-oh"><b>Offer #${i}</b><span class="d-pill s${o.status}">${live ? 'Open' : o.status === 1 ? 'Expired' : OFFER_STATUS[o.status]}</span></div>
    <p class="g-sub">By <a href="${scan('address/' + o.offerer)}" target="_blank" rel="noopener">${esc(shortAddress(o.offerer))}</a>${mineO ? ' (you)' : ''} · ${when(o.createdAt)} · ${openB.length} open bid${openB.length === 1 ? '' : 's'}${live ? ` · open until ${when(expiry)}` : ''}</p>`
  const gears = o.gears.map((id) => gearRow(id)).join('')
  let actions = ''
  if (live && mineO) {
    actions += `<p class="g-sub">You got ${g(o.paid)} for this offer. Finalizing or pulling out means repaying ${g(o.paid)}.</p>`
    actions += payBtn('cancel', String(i), o.paid, `Pull out · repay ${g(o.paid)}`, false)
  } else if (live && me) {
    const why = putInWhy(selIds.length, selOwed)
    actions += `<p class="g-sub">Bid with your ${selIds.length} picked Wallet Gear${selIds.length === 1 ? '' : 's'} (pick in My Wallet Gears). You get <b>${g(selOwed)}</b> now.</p>` + nftBtn('bid', String(i), `Bid ${selIds.length} Wallet Gear${selIds.length === 1 ? '' : 's'} · get ${g(selOwed)}`, why)
  }
  const shown = openBids.has(i) || mineO
  const bidList = bids.length ? `<button class="g-btn ghost small" data-tog="${i}">${shown ? 'Hide' : 'View'} bids (${bids.length})</button>` + (shown ? bids.map(({ id, b }) => `<div class="d-bid"><div class="d-oh"><b>Bid #${id}</b><span class="d-pill b${b.status}">${BID_STATUS[b.status]}</span></div>
      <p class="g-sub">From <a href="${scan('address/' + b.taker)}" target="_blank" rel="noopener">${esc(shortAddress(b.taker))}</a> · ${when(b.createdAt)}</p>${b.gears.map((x) => gearRow(x)).join('')}
      ${live && mineO && b.status === 1 ? payBtn('accept', `${i}:${id}`, o.paid, `Pick this bid · repay ${g(o.paid)}`, s.paused && 'The desk is paused right now.') + `<p class="d-why">Repay splits 90% to the vault, 10% to the treasury. Wallet Gears swap in the same transaction.</p>` : ''}</div>`).join('') : '') : ''
  return `<div class="g-card">${head}${gears}${actions}${bidList}</div>`
}
function myBidCard({ id, b, deadline }: S['myBids'][number]) {
  const s = st!, can = b.status === 1 && s.now < deadline, o = s.offers[Number(b.offerId)]
  const note = b.status === 1 ? (o?.status === 1 ? `Offer still open. You can pull out until ${when(deadline)}.` : `This bid did not win. Withdraw by ${when(deadline)} or it goes to the bin.`) : b.status === 3 ? 'You won! The offer\'s Wallet Gears are in your wallet.' : 'You pulled this bid out.'
  return `<div class="g-card"><div class="d-oh"><b>Bid #${id} on offer #${b.offerId}</b><span class="d-pill b${b.status}">${BID_STATUS[b.status]}</span></div><p class="g-sub">${esc(note)} You got ${g(b.paid)}.</p>
    ${b.gears.map((x) => gearRow(x)).join('')}${can ? payBtn('withdraw', id.toString(), b.paid, `${o?.status === 1 ? 'Pull out' : 'Withdraw'} · repay ${g(b.paid)}`, false) : b.status === 1 ? '<p class="d-why">The withdraw window has closed. These Wallet Gears are now in the bin.</p>' : ''}</div>`
}

const HOW = `<div class="g-card"><b>How the desk works</b><ol class="d-how">
<li><b>Post an offer</b> of 1–10 Wallet Gears. The vault pays you their tooth count in GEAR tokens right away (32T = 32, 18T = 18, 11T = 11 GEAR tokens).</li>
<li><b>Bid</b> on someone's offer with 1–10 of your Wallet Gears. You get paid their tooth count in GEAR tokens right away too. Offers can have many bids.</li>
<li><b>Finalize:</b> the offerer picks one bid and repays the GEAR tokens they got (90% vault / 10% treasury). The Wallet Gears swap. The winner keeps their GEAR tokens.</li>
<li><b>Pull out</b> anytime before that by repaying 100% of the GEAR tokens you got. You get your Wallet Gears back.</li>
<li><b>Losing bids</b> stay withdrawable for 6 months after the offer closes. Offers not finalized within 12 months are abandoned and go to the bin with their open bids.</li>
<li><b>Sell to the house</b> for the tooth count in GEAR tokens. Those Wallet Gears sit in the purchased bin for 35 / 20 / 12 GEAR tokens.</li>
<li><b>Abandoned bin</b> Wallet Gears sell at face value: 32 / 18 / 11 GEAR tokens.</li></ol>
<p class="g-sub">Every move needs a little ETH on Base for gas. The first time you put Wallet Gears in, you allow the desk to move them. When you pay GEAR tokens, you allow only the exact amount.</p></div>`

// ---------------- writes ----------------
async function walletClient() {
  const eth = wallet.provider() as Eip1193
  if (!(await wallet.ensureBase())) throw new Error('Please switch your wallet to Base.')
  return createWalletClient({ chain: base, transport: custom(eth), account: wallet.state.account! })
}
const ERRS: [RegExp, string][] = [[/VaultCannotPay/, 'The vault cannot pay that much right now.'], [/EnforcedPause|paused/i, 'The desk is paused right now.'], [/WindowClosed/, 'That window has closed.'],
  [/OwnOffer/, 'You cannot bid on your own offer.'], [/WrongStatus/, 'That offer or bid is no longer open.'], [/NotInBin/, 'That Wallet Gear is no longer in the bin.'], [/BadCount/, 'Pick 1 to 10 Wallet Gears.'],
  [/insufficient allowance|ERC20InsufficientAllowance/i, 'Allowance too low. Tap Step 1 again.'], [/ERC721InsufficientApproval|NotApproved/i, 'Allow the desk to move your Wallet Gears first.']]
async function run(act: string, arg: string) {
  if (busy || !st) return
  busy = act + arg; lastTx = ''; msg = 'Confirm in your wallet…'; msgKind = ''; render()
  try {
    const wc = await walletClient(), selIds = [...sel].map((x) => BigInt(x))
    let h: Hash
    switch (act) {
      case 'approveNft': h = await wc.writeContract({ address: NFT, abi: NFT_ABI, functionName: 'setApprovalForAll', args: [DESK, true] }); break
      case 'approveGear': h = await wc.writeContract({ address: TOKEN, abi: ERC20_ABI, functionName: 'approve', args: [DESK, BigInt(arg)] }); break
      case 'createOffer': h = await wc.writeContract({ address: DESK, abi: DESK_ABI, functionName: 'createOffer', args: [selIds] }); break
      case 'sell': h = await wc.writeContract({ address: DESK, abi: DESK_ABI, functionName: 'sellToHouse', args: [selIds] }); break
      case 'bid': h = await wc.writeContract({ address: DESK, abi: DESK_ABI, functionName: 'placeBid', args: [BigInt(arg), selIds] }); break
      case 'cancel': h = await wc.writeContract({ address: DESK, abi: DESK_ABI, functionName: 'cancelOffer', args: [BigInt(arg)] }); break
      case 'accept': { const [o, b] = arg.split(':'); h = await wc.writeContract({ address: DESK, abi: DESK_ABI, functionName: 'acceptBid', args: [BigInt(o), BigInt(b)] }); break }
      case 'withdraw': h = await wc.writeContract({ address: DESK, abi: DESK_ABI, functionName: 'withdrawBid', args: [BigInt(arg)] }); break
      case 'buyBin': h = await wc.writeContract({ address: DESK, abi: DESK_ABI, functionName: 'buyFromBin', args: [BigInt(arg)] }); break
      case 'buyPurchased': h = await wc.writeContract({ address: DESK, abi: DESK_ABI, functionName: 'buyPurchased', args: [BigInt(arg)] }); break
      default: throw new Error('Unknown action')
    }
    lastTx = h; msg = 'Sent. Waiting for Base…'; render()
    const rc = await pub.waitForTransactionReceipt({ hash: h })
    if (rc.status !== 'success') throw new Error('The transaction failed on-chain. Nothing changed.')
    if (['createOffer', 'sell', 'bid'].includes(act)) sel.clear()
    busy = ''; msg = act.startsWith('approve') ? 'Allowed ✓ Now tap Step 2.' : 'Done ✓'; msgKind = 'ok'
    await refresh()
  } catch (e) { busy = ''; const m = explainWalletError(e); msg = ERRS.find(([r]) => r.test(m))?.[1] || m; msgKind = 'err'; render() }
}

let loading: Promise<void> | null = null, again = false
async function refresh(): Promise<void> {
  if (loading) { again = true; return loading }
  loading = (async () => {
    do { again = false; try { await load() } catch (e) { msg = 'Could not read Base right now. Pull to refresh. ' + (LOCAL ? explainWalletError(e) : ''); msgKind = 'err' } } while (again)
    loading = null; render()
  })()
  return loading
}
function syncConn() { const a = wallet.state.account; $('#conn').textContent = a ? shortAddress(a) : wallet.state.busy ? 'Connecting…' : 'Connect wallet' }
let lastAcct: string | null | undefined
wallet.subscribe(() => { syncConn(); if (wallet.state.account !== lastAcct) { lastAcct = wallet.state.account; void refresh() } else render() })
document.addEventListener('change', (e) => {
  const el = e.target as HTMLInputElement, id = el.dataset.sel
  if (!id) return
  if (el.checked) { if (sel.size >= 10) { el.checked = false; msg = 'Pick at most 10 Wallet Gears.'; msgKind = 'err' } else sel.add(id) } else sel.delete(id)
  render()
})
document.addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null
  if (!t) return
  if (t.id === 'conn' || t.id === 'go') void ((t.id === 'conn' ? wallet.toggle() : wallet.connect()).catch((er) => { msg = explainWalletError(er); msgKind = 'err'; render() }))
  if (t.dataset.tab) { tab = t.dataset.tab; msg = ''; lastTx = ''; history.replaceState(null, '', `?${new URLSearchParams({ ...Object.fromEntries(qs), tab })}`); render() }
  if (t.dataset.spin) { e.preventDefault(); void spinGear(t.dataset.spin).catch(() => { msg = 'Could not open the 3D viewer on this device.'; msgKind = 'err'; render() }); return }
  if (t.dataset.tog) { const i = +t.dataset.tog; if (openBids.has(i)) openBids.delete(i); else openBids.add(i); render() }
  if (t.dataset.act) void run(t.dataset.act, t.dataset.arg || '')
  if (t.id === 'addGo') {
    const v = $<HTMLInputElement>('#addId').value.trim()
    if (!isAddress(v, { strict: false })) { msg = 'Paste the Wallet Gear id as a 0x address.'; msgKind = 'err'; render(); return }
    const list = new Set((localStorage.getItem('desk.extra') || '').split(',').filter(Boolean)); list.add(BigInt(v.toLowerCase()).toString())
    localStorage.setItem('desk.extra', [...list].join(',')); msg = 'Checking that Wallet Gear…'; msgKind = ''; void refresh()
  }
})
syncConn(); render(); void refresh()
