import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import {
  buildMockMetadata,
  triggerBrowserDownload,
  type StudioTraitsSnapshot,
  type StudioTransformsSnapshot,
} from './mockNft'

function cloneSceneForExport(root: THREE.Object3D): THREE.Group {
  const clone = root.clone(true)
  clone.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (mesh.isMesh) {
      if (mesh.geometry) mesh.geometry = mesh.geometry.clone()
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((m) => m.clone())
      } else if (mesh.material) {
        mesh.material = mesh.material.clone()
      }
    }
  })
  // Drop the viewer's turntable spin so exports face the model's default direction.
  clone.rotation.set(0, 0, 0)
  clone.updateMatrixWorld(true)
  return clone as THREE.Group
}

/** Count embedded images in a GLB (JSON chunk) — sanity check that trait textures made it in. */
function glbImageCount(bytes: ArrayBuffer): number {
  try {
    const dv = new DataView(bytes)
    const len = dv.getUint32(12, true)
    const json = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, len))) as { images?: unknown[] }
    return json.images?.length ?? 0
  } catch {
    return -1
  }
}

function countMaps(root: THREE.Object3D): number {
  let n = 0
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[] | undefined
    for (const mat of Array.isArray(m) ? m : m ? [m] : []) if (mat.map) n++
  })
  return n
}

/** Edited, textured GLB of the current studio (turntable spin removed). */
export async function buildEditedGlb(root: THREE.Object3D): Promise<Blob> {
  const scene = cloneSceneForExport(root)
  const exporter = new GLTFExporter()
  const result = await exporter.parseAsync(scene, {
    binary: true,
    onlyVisible: true,
  })
  const bytes = result as ArrayBuffer
  const maps = countMaps(scene)
  const images = glbImageCount(bytes)
  if (maps > 0 && images === 0) {
    throw new Error('GLB export lost the textures — please reload and try again.')
  }
  return new Blob([new Uint8Array(bytes)], { type: 'model/gltf-binary' })
}

export async function exportEditedGlb(root: THREE.Object3D): Promise<void> {
  triggerBrowserDownload(await buildEditedGlb(root), 'realonez-8-edited.glb')
}

/**
 * Square PNG snapshot for NFT marketplaces: offscreen renderer, fixed 3/4 camera fitted to the model's bounds,
 * neutral background, same lights as the studio. Independent of the viewer camera and turntable spin.
 */
export async function renderSnapshotPng(root: THREE.Object3D, size = 1024): Promise<Blob> {
  const model = cloneSceneForExport(root)
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#e7e3dd')
  scene.add(new THREE.AmbientLight(0xffffff, 0.85))
  const key = new THREE.DirectionalLight(0xffffff, 1.15)
  key.position.set(12, 18, 10)
  const fill = new THREE.DirectionalLight(0xffffff, 0.35)
  fill.position.set(-10, 6, -8)
  scene.add(key, fill, new THREE.HemisphereLight('#f0e6d8', '#3a2f28', 0.45))
  scene.add(model)
  model.updateMatrixWorld(true)

  const box = new THREE.Box3().setFromObject(model)
  const center = box.getCenter(new THREE.Vector3())
  const radius = Math.max(box.getBoundingSphere(new THREE.Sphere()).radius, 1e-3)
  const fov = 30
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 1000)
  const dist = (radius / Math.sin(THREE.MathUtils.degToRad(fov / 2))) * 1.08
  const dir = new THREE.Vector3(0.45, 0.22, 1).normalize() // gentle 3/4 view, slightly above
  camera.position.copy(center).addScaledVector(dir, dist)
  camera.near = Math.max(0.01, dist - radius * 2)
  camera.far = dist + radius * 2
  camera.lookAt(center)
  camera.updateProjectionMatrix()

  const canvas = document.createElement('canvas')
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: false })
  try {
    renderer.setPixelRatio(1)
    renderer.setSize(size, size, false)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping // match the studio (R3F default)
    renderer.render(scene, camera)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
    if (!blob) throw new Error('Snapshot failed')
    return blob
  } finally {
    renderer.dispose()
    renderer.forceContextLoss()
  }
}

export function exportEditedObj(root: THREE.Object3D): void {
  const scene = cloneSceneForExport(root)
  const exporter = new OBJExporter()
  const text = exporter.parse(scene)
  triggerBrowserDownload(
    new Blob([text], { type: 'text/plain' }),
    'realonez-8-edited.obj',
  )
}

export function exportEditedStl(root: THREE.Object3D): void {
  const scene = cloneSceneForExport(root)
  const exporter = new STLExporter()
  const result = exporter.parse(scene, { binary: true })
  if (typeof result === 'string') {
    triggerBrowserDownload(
      new Blob([result], { type: 'application/sla' }),
      'realonez-8-edited.stl',
    )
  } else {
    const dv = result as DataView
    const bytes = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength)
    triggerBrowserDownload(
      new Blob([bytes], { type: 'application/sla' }),
      'realonez-8-edited.stl',
    )
  }
}

export function exportMetadataJson(
  traits: StudioTraitsSnapshot,
  transforms: StudioTransformsSnapshot,
): void {
  const meta = buildMockMetadata(traits, transforms, [
    'realonez-8-edited.glb',
    'realonez-8-edited.obj',
    'realonez-8-edited.stl',
    'realonez-8-waldo.fbx (original only)',
  ])
  const text = JSON.stringify(meta, null, 2)
  triggerBrowserDownload(
    new Blob([text], { type: 'application/json' }),
    'realonez-8-metadata.json',
  )
}
