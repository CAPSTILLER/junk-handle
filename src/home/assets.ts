/** My Assets home: ONE list. To add an asset, append an entry: name, page link, and a build() that returns a three.js
 *  object (any size, it gets centered + framed automatically). Keep build() light; it runs when the frame scrolls into view. */
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { traits } from '../../shared/gear/traits3.js'
import { buildGear } from '../../shared/gear/gear3.js'

export interface AssetEntry {
  id: string
  name: string
  sub: string
  href: string
  /** camera tilt in degrees (0 = side on, 90 = top down) */
  tilt?: number
  build: () => Promise<THREE.Object3D>
}

const CAP = '0x604b2e24df58ef019312b8367af763a7f156bf08'

export const ASSETS: AssetEntry[] = [
  {
    id: 'wally', name: 'My Wally', sub: 'Build, mint and revise · Base', href: '/wally', tilt: 8,
    build: async () => (await new GLTFLoader().loadAsync('/assets/models/waldo-8.glb')).scene,
  },
  {
    id: 'rocks', name: 'CAPs Rocks', sub: 'Rocks, rooms and AR', href: '/rocks', tilt: 10,
    build: () => capsRock(),
  },
  {
    id: 'gear', name: 'Wallet Gear', sub: 'One per wallet · Base', href: '/gear', tilt: 38,
    build: async () => buildGear(traits(CAP)),
  },
]

/** Cap's real avatar: CAPs Rock #1 from the same public preview the /rocks page uses (server applies the rock's
 *  on-chain active pose + face). No wallet, no RPC here. Falls back to the seed wallet's plain avatar. Same clay look as /rocks. */
async function capsRock(): Promise<THREE.Object3D> {
  const l = new GLTFLoader()
  let scene: THREE.Object3D
  try { scene = (await l.loadAsync('/api/rocks/preview?id=1')).scene } catch { scene = (await l.loadAsync(`/api/rocks/preview?seed=${CAP}`)).scene }
  const clay = new THREE.MeshStandardMaterial({ color: 0x6b7894, roughness: 1, metalness: 0, flatShading: true })
  const isFace = (o: THREE.Object3D) => { for (let q: THREE.Object3D | null = o; q; q = q.parent) if (q.name.startsWith('CAPsRockFace')) return true; return false }
  scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !isFace(m)) { m.material = clay; m.geometry.computeVertexNormals() } })
  return scene
}
