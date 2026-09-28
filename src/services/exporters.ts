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

export async function exportEditedGlb(root: THREE.Object3D): Promise<void> {
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
  triggerBrowserDownload(
    new Blob([new Uint8Array(bytes)], { type: 'model/gltf-binary' }),
    'realonez-8-edited.glb',
  )
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
