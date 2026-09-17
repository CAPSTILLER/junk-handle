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
  clone.updateMatrixWorld(true)
  return clone as THREE.Group
}

export async function exportEditedGlb(root: THREE.Object3D): Promise<void> {
  const scene = cloneSceneForExport(root)
  const exporter = new GLTFExporter()
  const result = await exporter.parseAsync(scene, {
    binary: true,
    onlyVisible: true,
  })
  const bytes = result as ArrayBuffer
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
