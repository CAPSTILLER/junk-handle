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
    id: 'rocks', name: 'CAPs Rocks', sub: 'Rocks, rooms and AR', href: '/rocks', tilt: 20,
    build: async () => rock(),
  },
  {
    id: 'gear', name: 'Wallet Gear', sub: 'One per wallet · Base', href: '/gear', tilt: 38,
    build: async () => buildGear(traits(CAP)),
  },
]

/** Low-poly display rock (the real rocks are private per-holder files). Deterministic. */
function rock(): THREE.Object3D {
  const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3()
  const n = (x: number, y: number, z: number) => Math.sin(x * 3.1 + y * 1.7) * 0.5 + Math.sin(y * 2.3 - z * 2.9) * 0.3 + Math.sin(z * 4.7 + x * 1.3) * 0.2
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const k = 1 + 0.16 * n(v.x, v.y, v.z); p.setXYZ(i, v.x * k * 1.15, v.y * k * 0.82, v.z * k) }
  g.computeVertexNormals()
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x6b7894, roughness: 0.95, metalness: 0.05, flatShading: true }))
  const grp = new THREE.Group(); grp.add(m)
  const pebble = m.clone(); pebble.scale.setScalar(0.32); pebble.position.set(1.15, -0.5, 0.5); grp.add(pebble)
  return grp
}
