import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type MutableRefObject,
} from 'react'
import { useGLTF } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import {
  MESH_NAMES,
  TRANSFORM_GROUPS,
  type GroupId,
} from '../config/meshGroups'
import { LENS_SHADES } from '../config/lenses'
import {
  FRAME_SWATCHES,
  HAIR_SWATCHES,
  SKIN_SWATCHES,
} from '../config/swatches'
import type { GroupTransform } from '../hooks/useStudioState'

const MODEL_URL = './assets/models/waldo-8.glb'

export type WaldoModelProps = {
  transforms: Record<GroupId, GroupTransform>
  framesId: string | null
  lensesId: string
  skinId: string | null
  hairId: string | null
  groupRefs: MutableRefObject<Record<GroupId, THREE.Group | null>>
  rootRef: MutableRefObject<THREE.Group | null>
  onReady?: () => void
}

type ColorCache = {
  frames?: THREE.Color
  hair?: THREE.Color
  skin: Map<string, THREE.Color>
}

function cloneMaterials(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    m.castShadow = true
    m.receiveShadow = true
    if (Array.isArray(m.material)) {
      m.material = m.material.map((mat) => mat.clone())
    } else if (m.material) {
      m.material = m.material.clone()
    }
  })
}

function gatherMeshes(root: THREE.Object3D): Map<string, THREE.Object3D> {
  const map = new Map<string, THREE.Object3D>()
  root.traverse((o) => {
    if (o.name) map.set(o.name, o)
  })
  return map
}

function asStdMat(
  mesh: THREE.Mesh | undefined,
): THREE.MeshStandardMaterial | null {
  if (!mesh) return null
  const mat = mesh.material
  if (Array.isArray(mat)) return (mat[0] as THREE.MeshStandardMaterial) ?? null
  return (mat as THREE.MeshStandardMaterial) ?? null
}

function applySolidColor(
  mat: THREE.MeshStandardMaterial | null,
  hex: string | null,
  original: THREE.Color | undefined,
) {
  if (!mat) return
  mat.map = null
  if (hex) {
    mat.color.set(hex)
  } else if (original) {
    mat.color.copy(original)
  }
  mat.needsUpdate = true
}

export function WaldoModel({
  transforms,
  framesId,
  lensesId,
  skinId,
  hairId,
  groupRefs,
  rootRef,
  onReady,
}: WaldoModelProps) {
  const { scene } = useGLTF(MODEL_URL)
  const { camera, controls } = useThree()
  const fitted = useRef(false)
  const originals = useRef<ColorCache>({ skin: new Map() })

  const prepared = useMemo(() => {
    const clone = scene.clone(true)
    cloneMaterials(clone)
    const byName = gatherMeshes(clone)

    const root = new THREE.Group()
    root.name = 'realonez-8-root'

    const body = new THREE.Group()
    body.name = 'group-body-stack'
    const glasses = new THREE.Group()
    glasses.name = 'group-glasses'
    const hair = new THREE.Group()
    hair.name = 'group-hair'

    for (const n of TRANSFORM_GROUPS.body.meshes) {
      const o = byName.get(n)
      if (o) body.add(o)
    }
    for (const n of TRANSFORM_GROUPS.glasses.meshes) {
      const o = byName.get(n)
      if (o) glasses.add(o)
    }
    for (const n of TRANSFORM_GROUPS.hair.meshes) {
      const o = byName.get(n)
      if (o) hair.add(o)
    }

    root.add(body, glasses, hair)
    return { root, body, glasses, hair, byName }
  }, [scene])

  // Cache original material colors once after prepare
  useLayoutEffect(() => {
    const cache = originals.current
    const frameMat = asStdMat(
      prepared.byName.get(MESH_NAMES.glasses) as THREE.Mesh | undefined,
    )
    if (frameMat && !cache.frames) {
      cache.frames = frameMat.color.clone()
    }
    const hairMat = asStdMat(
      prepared.byName.get(MESH_NAMES.hair) as THREE.Mesh | undefined,
    )
    if (hairMat && !cache.hair) {
      cache.hair = hairMat.color.clone()
    }
    for (const name of [MESH_NAMES.head, MESH_NAMES.noseEarNeck]) {
      const mat = asStdMat(
        prepared.byName.get(name) as THREE.Mesh | undefined,
      )
      if (mat && !cache.skin.has(name)) {
        cache.skin.set(name, mat.color.clone())
      }
    }
  }, [prepared])

  useLayoutEffect(() => {
    rootRef.current = prepared.root
    groupRefs.current = {
      body: prepared.body,
      glasses: prepared.glasses,
      hair: prepared.hair,
    }
    onReady?.()
  }, [prepared, groupRefs, rootRef, onReady])

  // Fit camera once to model bounds
  useEffect(() => {
    if (fitted.current) return
    const box = new THREE.Box3().setFromObject(prepared.root)
    if (box.isEmpty()) return
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z, 1)
    const dist = maxDim * 2.2
    camera.position.set(
      center.x + dist * 0.55,
      center.y + dist * 0.35,
      center.z + dist * 0.85,
    )
    camera.near = Math.max(0.01, dist / 200)
    camera.far = dist * 80
    camera.updateProjectionMatrix()
    const ctrl = controls as unknown as {
      target?: THREE.Vector3
      update?: () => void
    } | null
    if (ctrl?.target) {
      ctrl.target.copy(center)
      ctrl.update?.()
    }
    fitted.current = true
  }, [camera, controls, prepared])

  // Apply group transforms (absolute — keeps glasses+lenses locked)
  useEffect(() => {
    const apply = (g: THREE.Group, t: GroupTransform) => {
      g.position.set(t.position[0], t.position[1], t.position[2])
      g.rotation.set(t.rotation[0], t.rotation[1], t.rotation[2])
      g.scale.set(t.scale[0], t.scale[1], t.scale[2])
    }
    apply(prepared.body, transforms.body)
    apply(prepared.glasses, transforms.glasses)
    apply(prepared.hair, transforms.hair)
  }, [transforms, prepared])

  // Frames — solid color only (no useTexture)
  useEffect(() => {
    const mesh = prepared.byName.get(MESH_NAMES.glasses) as THREE.Mesh | undefined
    const mat = asStdMat(mesh)
    const hex = framesId
      ? (FRAME_SWATCHES.find((s) => s.id === framesId)?.color ?? null)
      : null
    applySolidColor(mat, hex, originals.current.frames)
  }, [framesId, prepared])

  // Hair — solid color only
  useEffect(() => {
    const mesh = prepared.byName.get(MESH_NAMES.hair) as THREE.Mesh | undefined
    const mat = asStdMat(mesh)
    const hex = hairId
      ? (HAIR_SWATCHES.find((s) => s.id === hairId)?.color ?? null)
      : null
    applySolidColor(mat, hex, originals.current.hair)
  }, [hairId, prepared])

  // Skin — solid color only
  useEffect(() => {
    const hex = skinId
      ? (SKIN_SWATCHES.find((s) => s.id === skinId)?.color ?? null)
      : null
    for (const name of [MESH_NAMES.head, MESH_NAMES.noseEarNeck]) {
      const mesh = prepared.byName.get(name) as THREE.Mesh | undefined
      const mat = asStdMat(mesh)
      applySolidColor(mat, hex, originals.current.skin.get(name))
    }
  }, [skinId, prepared])

  // Lenses — existing translucent greens
  useEffect(() => {
    const mesh = prepared.byName.get(MESH_NAMES.lenses) as THREE.Mesh | undefined
    if (!mesh) return
    const shade = LENS_SHADES.find((s) => s.id === lensesId) ?? LENS_SHADES[4]
    const mat = asStdMat(mesh)
    if (!mat) return
    mat.transparent = true
    mat.depthWrite = false
    mat.opacity = shade.rgba[3]
    mat.color.setRGB(shade.rgba[0], shade.rgba[1], shade.rgba[2])
    mat.map = null
    mat.needsUpdate = true
  }, [lensesId, prepared])

  return <primitive object={prepared.root} />
}

useGLTF.preload(MODEL_URL)
