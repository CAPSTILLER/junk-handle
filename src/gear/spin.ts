/** Wallet Gear spin viewer (lazy-loaded by the Trade Desk). Real 3D model built client-side from the gear's address traits,
 *  same code as the mint page. Drag/flick to spin (touch + mouse), with inertia. */
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { traits, centerDistance, type GearTraits } from '../../shared/gear/traits3.js'
import { buildGear } from '../../shared/gear/gear3.js'

export function openSpin(addr: string, opts: { title: string; sub: string; video?: string | null }) {
  const t = traits(addr) as GearTraits
  const ov = document.createElement('div'); ov.className = 'd-modal'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true')
  ov.innerHTML = `<div class="d-sheet"><div class="d-mh"><div><b></b><small></small></div><button class="d-x" aria-label="Close">✕</button></div>
    <div class="d-stage"></div><p class="d-hint">Drag or flick to spin</p>${opts.video ? '<button class="g-btn ghost small d-vid">▶ Play the video</button>' : ''}</div>`
  ov.querySelector('b')!.textContent = opts.title; ov.querySelector('small')!.textContent = opts.sub
  document.body.appendChild(ov); document.body.style.overflow = 'hidden'
  const stage = ov.querySelector('.d-stage') as HTMLElement
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  r.setPixelRatio(Math.min(2, devicePixelRatio)); r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace
  stage.appendChild(r.domElement)
  const pm = new THREE.PMREMGenerator(r), env = pm.fromScene(new RoomEnvironment(), 0.04).texture
  const sc = new THREE.Scene(); sc.environment = env; sc.environmentIntensity = 0.8
  const key = new THREE.DirectionalLight(0xfff1e0, 2.2); key.position.set(.15, .3, .2); sc.add(key)
  const rim = new THREE.DirectionalLight(0x9fc3ff, 1.6); rim.position.set(-.25, .12, -.25); sc.add(rim)
  const cam = new THREE.PerspectiveCamera(30, 1, .001, 10)
  const rig = new THREE.Group(), main = buildGear(t); rig.add(main)
  let idler: THREE.Object3D | null = null, ratio = 0, rot0 = 0
  const top = t.stack === 'Single' ? 0 : +t.stack.split('+')[1]
  if (top) {
    const it = { ...t, teeth: 18, stack: 'Single', web: 'Solid', hub: 'Flush', engraving: 'None', master: false, toothColors: undefined, color: 'Base', colorHex: '#8a8f98', family: 'Steel', pattern: 'Brushed', sheen: 'None', wear: 'Mint', phase: 0, twist: 0 } as GearTraits
    idler = buildGear(it); idler.position.set(centerDistance(top, 18) / 1000, t.thickness / 1000, 0); rig.add(idler); ratio = top / 18; rot0 = (180 + 10) * Math.PI / 180
  }
  const box = new THREE.Box3().setFromObject(rig), c = box.getCenter(new THREE.Vector3()), R = box.getSize(new THREE.Vector3()).length() / 2
  rig.position.sub(c); sc.add(rig)
  const D = R / Math.sin(15 * Math.PI / 180) * 0.82
  let tilt = 38 * Math.PI / 180
  const place = () => { cam.position.set(0, D * Math.sin(tilt), D * Math.cos(tilt)); cam.lookAt(0, 0, 0) }
  place()
  const size = () => { const w = stage.clientWidth; r.setSize(w, w, false); cam.aspect = 1; cam.updateProjectionMatrix() }
  size(); addEventListener('resize', size)
  // drag: horizontal spins (with flick inertia), vertical tilts a little
  let drag = false, lx = 0, ly = 0, lt = 0, spin = 0, vel = 0
  stage.addEventListener('pointerdown', (e) => { drag = true; lx = e.clientX; ly = e.clientY; lt = performance.now(); vel = 0; stage.setPointerCapture(e.pointerId) })
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return
    const now = performance.now(), d = (e.clientX - lx) * 0.012
    spin += d; vel = d / Math.max(1, now - lt) * 16 // radians per frame
    tilt = Math.min(1.35, Math.max(0.1, tilt + (e.clientY - ly) * 0.006)); place()
    lx = e.clientX; ly = e.clientY; lt = now
  })
  const up = () => { drag = false }
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up)
  let prev = performance.now(), raf = 0, alive = true
  const loop = (now: number) => {
    if (!alive) return
    const dt = Math.min(.05, (now - prev) / 1000); prev = now
    if (!drag) { vel *= Math.pow(0.95, dt * 60); spin += dt * (Math.PI * 2 / 8) + vel * dt * 60 }
    main.rotation.y = spin; if (idler) idler.rotation.y = rot0 - spin * ratio
    r.render(sc, cam); raf = requestAnimationFrame(loop)
  }
  raf = requestAnimationFrame(loop)
  ;(window as any).__spin = () => spin // test hook
  const close = () => {
    if (!alive) return; alive = false; cancelAnimationFrame(raf); removeEventListener('resize', size); removeEventListener('keydown', onKey)
    sc.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); const mt = m.material as THREE.Material | THREE.Material[] | undefined; if (mt) (Array.isArray(mt) ? mt : [mt]).forEach((x) => x.dispose()) })
    env.dispose(); pm.dispose(); r.dispose(); r.forceContextLoss(); ov.remove(); document.body.style.overflow = ''
  }
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
  addEventListener('keydown', onKey)
  ov.addEventListener('click', (e) => { if (e.target === ov) close() })
  ov.querySelector('.d-x')!.addEventListener('click', close)
  const vb = ov.querySelector('.d-vid') as HTMLButtonElement | null
  if (vb && opts.video) vb.addEventListener('click', () => {
    const on = stage.querySelector('video')
    if (on) { on.remove(); r.domElement.style.display = ''; vb.textContent = '▶ Play the video'; return }
    const v = document.createElement('video'); v.src = opts.video!; v.autoplay = true; v.loop = true; v.muted = true; v.playsInline = true; v.className = 'd-video'
    r.domElement.style.display = 'none'; stage.appendChild(v); vb.textContent = '↺ Back to 3D spin'
  })
  return close
}
