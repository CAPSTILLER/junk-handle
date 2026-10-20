/** three.js stage for CAPs Rocks: public preview (clay GLB, turntable) and the holder's pose editor (rigged GLB). */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { POSE_BONES, POSE_RIG, POSE_RIG_VERSION, POSE_SCHEMA, rigJointName, type PoseJson, type Quat } from '../../shared/rocksPose'

export class RockStage {
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100)
  orbit: OrbitControls
  gizmo: TransformControls | null = null
  private gizmoHelper: THREE.Object3D | null = null
  private model: THREE.Object3D | null = null
  private bones = new Map<string, THREE.Bone>()
  private rest = new Map<string, THREE.Quaternion>()
  private restHips = new THREE.Vector3()
  private joints = new THREE.Group() // editor-only joint handles; never part of any export (exports are server-side)
  private raf = 0
  private ro: ResizeObserver
  selected: string | null = null
  onSelect: ((bone: string | null) => void) | null = null
  onChange: (() => void) | null = null
  autoRotate = true

  constructor(private el: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    this.renderer.setClearColor(0x0b1220)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    el.appendChild(this.renderer.domElement)
    this.scene.add(new THREE.HemisphereLight(0xdbeafe, 0x0b1220, 1.6))
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(2, 4, 3); this.scene.add(key)
    const rim = new THREE.DirectionalLight(0x93c5fd, 1.2); rim.position.set(-3, 2, -3); this.scene.add(rim)
    this.scene.add(this.joints)
    this.camera.position.set(0, 1.1, 4.2)
    this.orbit = new OrbitControls(this.camera, this.renderer.domElement)
    this.orbit.target.set(0, 0.95, 0)
    this.orbit.enableDamping = true
    this.orbit.minDistance = 1.2; this.orbit.maxDistance = 9
    this.orbit.addEventListener('start', () => { this.autoRotate = false })
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(el)
    this.resize()
    const loop = () => {
      this.raf = requestAnimationFrame(loop)
      if (this.autoRotate && this.model) this.model.rotation.y += 0.006
      this.orbit.update()
      this.renderer.render(this.scene, this.camera)
    }
    loop()
  }

  private resize() {
    const w = this.el.clientWidth || 300, h = this.el.clientHeight || 300
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    this.gizmo?.dispose()
    this.orbit.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  async load(src: string | ArrayBuffer, mode: 'preview' | 'full') {
    const loader = new GLTFLoader()
    const gltf = typeof src === 'string' ? await loader.loadAsync(src) : await loader.parseAsync(src, '')
    if (this.model) this.scene.remove(this.model)
    this.model = gltf.scene
    if (mode === 'preview') {
      const clay = new THREE.MeshStandardMaterial({ color: 0x6b7894, roughness: 1, metalness: 0, flatShading: true })
      this.model.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.material = clay; m.geometry.computeVertexNormals() } })
    }
    this.scene.add(this.model)
    const box = new THREE.Box3().setFromObject(this.model)
    const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3())
    this.orbit.target.copy(c)
    this.camera.position.set(c.x, c.y + size.y * 0.1, c.z + Math.max(size.y, 1) * 2.3)
    this.bones.clear(); this.rest.clear()
    if (mode === 'full') {
      this.model.traverse((o) => {
        if ((o as THREE.Bone).isBone) {
          const short = o.name.replace(/^mixamorig:?/, '')
          if (POSE_BONES.includes(short)) { this.bones.set(short, o as THREE.Bone); this.rest.set(short, o.quaternion.clone()) }
          if (short === 'Hips') this.restHips.copy(o.position)
        }
      })
    }
  }

  get boneNames() { return [...this.bones.keys()] }

  /** Joint handles + rotate gizmo (pose editor). */
  enableEditor() {
    this.autoRotate = false
    if (this.model) this.model.rotation.y = 0
    const geo = new THREE.SphereGeometry(0.022, 12, 8)
    for (const [name, bone] of this.bones) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x93c5fd, depthTest: false, transparent: true, opacity: 0.85 }))
      m.renderOrder = 10
      m.userData.bone = name
      m.onBeforeRender = () => { bone.getWorldPosition(m.position) }
      this.joints.add(m)
    }
    this.gizmo = new TransformControls(this.camera, this.renderer.domElement)
    this.gizmo.setMode('rotate')
    this.gizmo.setSpace('local')
    this.gizmo.setSize(0.7)
    this.gizmo.addEventListener('dragging-changed', (e) => { this.orbit.enabled = !(e as unknown as { value: boolean }).value })
    this.gizmo.addEventListener('objectChange', () => this.onChange?.())
    this.gizmoHelper = (this.gizmo as unknown as { getHelper?: () => THREE.Object3D }).getHelper?.() ?? (this.gizmo as unknown as THREE.Object3D)
    this.scene.add(this.gizmoHelper)
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
    let down: { x: number; y: number } | null = null
    const dom = this.renderer.domElement
    dom.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY } })
    dom.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6 || (this.gizmo as unknown as { dragging: boolean }).dragging) return
      const r = dom.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, this.camera)
      ray.params.Points = { threshold: 0.05 }
      this.joints.children.forEach((j) => j.updateMatrixWorld())
      const hit = ray.intersectObjects(this.joints.children, false)[0]
      if (hit) this.select(hit.object.userData.bone as string)
    })
  }

  select(name: string | null) {
    this.selected = name
    if (this.gizmo) { if (name && this.bones.has(name)) this.gizmo.attach(this.bones.get(name)!); else this.gizmo.detach() }
    this.joints.children.forEach((j) => ((j as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(j.userData.bone === name ? 0xfbbf24 : 0x93c5fd))
    this.onSelect?.(name)
  }

  setPose(p: Pick<PoseJson, 'bones' | 'rootOffset'> | null) {
    for (const [n, b] of this.bones) {
      const q = p?.bones[n]
      b.quaternion.copy(this.rest.get(n)!)
      if (q) b.quaternion.multiply(new THREE.Quaternion(q[0], q[1], q[2], q[3]).normalize())
    }
    const hips = this.bones.get('Hips')
    if (hips) hips.position.copy(this.restHips).add(new THREE.Vector3(...(p?.rootOffset ?? [0, 0, 0])))
    this.onChange?.()
  }

  resetBone(name: string) { const b = this.bones.get(name); if (b) { b.quaternion.copy(this.rest.get(name)!); this.onChange?.() } }

  /** Current pose as caps-rocks-pose/1 (deltas from rest). */
  getPose(name: string): PoseJson {
    const bones: Record<string, Quat> = {}
    for (const [n, b] of this.bones) {
      const d = this.rest.get(n)!.clone().invert().multiply(b.quaternion)
      bones[n] = [d.x, d.y, d.z, d.w]
    }
    const hips = this.bones.get('Hips')
    const off = hips ? hips.position.clone().sub(this.restHips) : new THREE.Vector3()
    return { schema: POSE_SCHEMA, rig: POSE_RIG, rigVersion: POSE_RIG_VERSION, name, bones, rootOffset: [off.x, off.y, off.z] }
  }
  hasJoint(n: string) { return this.bones.has(n) || this.bones.has(rigJointName(n)) }
}
