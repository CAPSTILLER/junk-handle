/** My Assets home (myassets.gearup.wtf, also mywally.gearup.wtf). A grid of live 3D frames from ONE WebGL renderer
 *  (scissor viewports over a fixed canvas), so phones never run out of WebGL contexts. Drag/pinch to move an asset;
 *  a short tap without moving opens its page. Assets are listed in ./assets.ts. */
import './home.css'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { ASSETS, type AssetEntry } from './assets'

const TAP_PX = 10, TAP_MS = 450
const root = document.getElementById('root')!
root.innerHTML = `<div class="g-wrap">
  <div class="g-top"><div class="g-brand">My Assets<small>Spin any asset. Tap it to open.</small></div></div>
  <div class="a-grid">${ASSETS.map((a) => `<a class="a-frame" href="${a.href}" data-id="${a.id}" aria-label="Open ${a.name}">
    <div class="a-load">Loading…</div><div class="a-label"><b>${a.name}</b><small>${a.sub}</small></div></a>`).join('')}</div>
  <div class="g-foot">Drag to turn · pinch to zoom · tap to open</div></div>`

interface Frame { a: AssetEntry; el: HTMLElement; scene: THREE.Scene; cam: THREE.PerspectiveCamera; pivot: THREE.Group; yaw: number; pitch: number; zoom: number; vel: number; touched: number; state: 'idle' | 'loading' | 'ready' | 'error'; R: number }

const canvas = document.createElement('canvas'); canvas.id = 'a-gl'; document.body.appendChild(canvas)
const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
r.setPixelRatio(Math.min(2, devicePixelRatio)); r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace
r.setScissorTest(true)
const env = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture

const frames: Frame[] = [...document.querySelectorAll<HTMLElement>('.a-frame')].map((el) => {
  const a = ASSETS.find((x) => x.id === el.dataset.id)!
  const scene = new THREE.Scene(); scene.environment = env; scene.environmentIntensity = 0.8
  const key = new THREE.DirectionalLight(0xfff1e0, 2.2); key.position.set(1, 2, 1.5); scene.add(key)
  const rim = new THREE.DirectionalLight(0x9fc3ff, 1.4); rim.position.set(-1.5, 0.8, -1.5); scene.add(rim)
  const pivot = new THREE.Group(); scene.add(pivot)
  return { a, el, scene, cam: new THREE.PerspectiveCamera(30, 1, 0.01, 100), pivot, yaw: 0, pitch: 0, zoom: 1, vel: 0.35, touched: 0, state: 'idle', R: 1 }
})

async function load(f: Frame) {
  f.state = 'loading'
  try {
    const o = await f.a.build()
    const box = new THREE.Box3().setFromObject(o), c = box.getCenter(new THREE.Vector3())
    const s = 1 / (box.getSize(new THREE.Vector3()).length() / 2 || 1); o.position.sub(c); const holder = new THREE.Group(); holder.add(o); holder.scale.setScalar(s)
    f.pivot.add(holder); f.R = 1; f.pitch = ((f.a.tilt ?? 15) * Math.PI) / 180; f.state = 'ready'
    f.el.querySelector('.a-load')?.remove()
  } catch (e) { console.error(f.a.id, e); f.state = 'error'; f.el.querySelector('.a-load')!.textContent = 'Tap to open' }
}

// lazy: build only when a frame is near the screen
const io = new IntersectionObserver((es) => es.forEach((e) => { const f = frames.find((x) => x.el === e.target); if (e.isIntersecting && f && f.state === 'idle') void load(f) }), { rootMargin: '200px' })
frames.forEach((f) => io.observe(f.el))

// ---- input: drag = orbit, pinch = zoom, short still tap = open ----
for (const f of frames) {
  const pts = new Map<number, { x: number; y: number }>()
  let sx = 0, sy = 0, t0 = 0, moved = false, pinch0 = 0, zoom0 = 1
  f.el.addEventListener('click', (e) => e.preventDefault()) // we navigate ourselves, only on a real tap
  f.el.addEventListener('contextmenu', (e) => e.preventDefault())
  f.el.addEventListener('pointerdown', (e) => {
    f.el.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pts.size === 1) { sx = e.clientX; sy = e.clientY; t0 = performance.now(); moved = false }
    if (pts.size === 2) { const [p, q] = [...pts.values()]; pinch0 = Math.hypot(p.x - q.x, p.y - q.y); zoom0 = f.zoom; moved = true }
    f.touched = performance.now(); f.vel = 0
  })
  f.el.addEventListener('pointermove', (e) => {
    const prev = pts.get(e.pointerId); if (!prev) return
    const cur = { x: e.clientX, y: e.clientY }; pts.set(e.pointerId, cur)
    if (Math.hypot(e.clientX - sx, e.clientY - sy) > TAP_PX) moved = true
    if (pts.size === 1 && moved) {
      const w = f.el.clientWidth || 200, dx = (cur.x - prev.x) / w, dy = (cur.y - prev.y) / w
      f.yaw += dx * Math.PI * 2; f.vel = dx * Math.PI * 2 * 60
      f.pitch = Math.max(-1.2, Math.min(1.45, f.pitch + dy * Math.PI))
    } else if (pts.size === 2) {
      const [p, q] = [...pts.values()]; f.zoom = Math.max(0.55, Math.min(2.2, zoom0 * (Math.hypot(p.x - q.x, p.y - q.y) / (pinch0 || 1))))
    }
    f.touched = performance.now()
  })
  const end = (e: PointerEvent, cancel = false) => {
    if (!pts.delete(e.pointerId)) return
    const tap = !cancel && !moved && pts.size === 0 && performance.now() - t0 < TAP_MS
    f.touched = performance.now()
    if (tap) location.href = f.a.href
  }
  f.el.addEventListener('pointerup', (e) => end(e))
  f.el.addEventListener('pointercancel', (e) => end(e, true))
  f.el.addEventListener('wheel', (e) => { e.preventDefault(); f.zoom = Math.max(0.55, Math.min(2.2, f.zoom * (e.deltaY > 0 ? 0.92 : 1.08))) }, { passive: false })
  f.el.addEventListener('keydown', (e) => { if (e.key === 'Enter') location.href = f.a.href })
}

// ---- one render loop, one viewport per visible frame ----
let last = performance.now()
function tick(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now
  const W = innerWidth, H = innerHeight, dpr = Math.min(2, devicePixelRatio)
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { r.setPixelRatio(dpr); r.setSize(W, H, false) }
  r.setScissor(0, 0, W, H); r.setViewport(0, 0, W, H); r.setClearColor(0, 0); r.clear()
  for (const f of frames) {
    if (f.state !== 'ready') continue
    const b = f.el.getBoundingClientRect()
    if (b.bottom < 0 || b.top > H || b.right < 0 || b.left > W) continue
    const idle = now - f.touched > 2500
    if (idle) f.vel += (0.35 - f.vel) * Math.min(1, dt * 1.5); else if (!f.el.matches(':active')) f.vel *= Math.pow(0.05, dt)
    if (idle || !f.el.matches(':active')) f.yaw += f.vel * dt
    f.pivot.rotation.set(0, f.yaw, 0)
    const D = (f.R / Math.sin((15 * Math.PI) / 180)) * 0.92 / f.zoom
    f.cam.position.set(0, D * Math.sin(f.pitch), D * Math.cos(f.pitch)); f.cam.lookAt(0, 0, 0)
    f.cam.aspect = b.width / b.height; f.cam.updateProjectionMatrix()
    const y = H - b.bottom
    r.setViewport(b.left, y, b.width, b.height); r.setScissor(b.left, y, b.width, b.height)
    r.render(f.scene, f.cam)
  }
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)
