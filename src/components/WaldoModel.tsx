import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type MutableRefObject,
} from 'react'
import { useGLTF, useTexture } from '@react-three/drei'
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

/**
 * Stable URL list for frames + hair + skin maps.
 * Never changes identity, so useTexture won't remount/suspend on trait picks.
 */
const MAP_TRAIT_TEXTURE_URLS: string[] = [
  ...FRAME_SWATCHES.map((s) => s.url).filter((u): u is string => !!u),
  ...HAIR_SWATCHES.map((s) => s.url).filter((u): u is string => !!u),
  ...SKIN_SWATCHES.map((s) => s.url).filter((u): u is string => !!u),
]

/** Meshes that receive trait maps and usually lack TEXCOORD_0 in the GLB. */
const UV_MESH_NAMES = [
  MESH_NAMES.glasses,
  MESH_NAMES.hair,
  MESH_NAMES.head,
  MESH_NAMES.noseEarNeck,
] as const

export type WaldoModelProps = {
  transforms: Record<GroupId, GroupTransform>
  framesId: string | null
  lensesId: string
  skinId: string | null
  hairId: string | null
  groupRefs: MutableRefObject<Record<GroupId, THREE.Group | null>>
  rootRef: MutableRefObject<THREE.Group | null>
  lookAtRef?: MutableRefObject<THREE.Vector3>
  onReady?: () => void
}

type MatOrig = {
  map: THREE.Texture | null
  color: THREE.Color
}

type OrigCache = {
  frames?: MatOrig
  hair?: MatOrig
  skin: Map<string, MatOrig>
}

/**
 * Box-project UVs from POSITION (+ NORMAL) into a single UV set.
 * GLB meshes for frames/hair/skin ship with POSITION+NORMAL only — no TEXCOORD_0 —
 * so assigning mat.map without this samples one texel (solid-color look).
 */
function ensureBoxProjectedUVs(geometry: THREE.BufferGeometry) {
  if (geometry.getAttribute('uv')) return

  const position = geometry.getAttribute('position')
  if (!position) return

  if (!geometry.getAttribute('normal')) {
    geometry.computeVertexNormals()
  }
  const normal = geometry.getAttribute('normal')
  if (!normal) return

  geometry.computeBoundingBox()
  const box = geometry.boundingBox
  if (!box) return

  const size = new THREE.Vector3()
  box.getSize(size)
  const sx = size.x > 1e-8 ? size.x : 1
  const sy = size.y > 1e-8 ? size.y : 1
  const sz = size.z > 1e-8 ? size.z : 1
  const min = box.min

  const uvs = new Float32Array(position.count * 2)
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i)
    const y = position.getY(i)
    const z = position.getZ(i)
    const nx = Math.abs(normal.getX(i))
    const ny = Math.abs(normal.getY(i))
    const nz = Math.abs(normal.getZ(i))

    let u: number
    let v: number
    if (nx >= ny && nx >= nz) {
      // ±X face → project onto YZ
      u = (z - min.z) / sz
      v = (y - min.y) / sy
    } else if (nz >= nx && nz >= ny) {
      // ±Z face → project onto XY
      u = (x - min.x) / sx
      v = (y - min.y) / sy
    } else {
      // ±Y face → project onto XZ
      u = (x - min.x) / sx
      v = (z - min.z) / sz
    }
    uvs[i * 2] = u
    uvs[i * 2 + 1] = v
  }

  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
}

function ensureMeshUVs(root: THREE.Object3D, names: readonly string[]) {
  const want = new Set(names)
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || !want.has(m.name)) return
    const geo = m.geometry as THREE.BufferGeometry | undefined
    if (geo) ensureBoxProjectedUVs(geo)
  })
}

function cloneMaterials(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    // No per-mesh shadows — ContactShadows / shadow maps are too heavy on phone.
    m.castShadow = false
    m.receiveShadow = false
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


/**
 * Wrap meshes so transforms pivot about the group's geometric center.
 * Structure: anchor (fixed at center) → pivot (user transforms) → inner (meshes @ -center).
 * Identity user transform keeps world placement unchanged.
 */
function wrapCenterPivot(
  name: string,
  objects: THREE.Object3D[],
): { anchor: THREE.Group; pivot: THREE.Group } {
  const anchor = new THREE.Group()
  anchor.name = `${name}-anchor`
  const pivot = new THREE.Group()
  pivot.name = name
  const inner = new THREE.Group()
  inner.name = `${name}-inner`

  for (const o of objects) {
    inner.add(o)
  }

  const box = new THREE.Box3().setFromObject(inner)
  const center = new THREE.Vector3()
  if (!box.isEmpty()) {
    box.getCenter(center)
  }

  // Meshes relative to center; anchor sits at center in parent space.
  inner.position.set(-center.x, -center.y, -center.z)
  anchor.position.copy(center)
  pivot.add(inner)
  anchor.add(pivot)

  return { anchor, pivot }
}


function asStdMat(
  mesh: THREE.Mesh | undefined,
): THREE.MeshStandardMaterial | null {
  if (!mesh) return null
  const mat = mesh.material
  if (Array.isArray(mat)) return (mat[0] as THREE.MeshStandardMaterial) ?? null
  return (mat as THREE.MeshStandardMaterial) ?? null
}

function snapshotMat(mat: THREE.MeshStandardMaterial): MatOrig {
  return {
    map: mat.map ?? null,
    color: mat.color.clone(),
  }
}

/** Assign a pre-configured texture (or restore). Never mutates shared tex flags. */
function applyTextureOrRestore(
  mat: THREE.MeshStandardMaterial | null,
  tex: THREE.Texture | undefined,
  original: MatOrig | undefined,
) {
  if (!mat) return
  if (tex) {
    mat.map = tex
    mat.color.set('#ffffff')
  } else if (original) {
    mat.map = original.map
    mat.color.copy(original.color)
  } else {
    mat.map = null
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
  lookAtRef,
  onReady,
}: WaldoModelProps) {
  const { scene } = useGLTF(MODEL_URL)
  const { camera } = useThree()
  const fitted = useRef(false)
  const readySent = useRef(false)
  const originals = useRef<OrigCache>({ skin: new Map() })
  // Keep a stable ref to the latest onReady so the layout effect need not depend on it.
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  // Preload frame/hair/skin maps once (stable deps → no Suspense remount on pick).
  const loadedTextures = useTexture(MAP_TRAIT_TEXTURE_URLS)
  const textureByUrl = useMemo(() => {
    const list = Array.isArray(loadedTextures)
      ? loadedTextures
      : [loadedTextures]
    const m = new Map<string, THREE.Texture>()
    MAP_TRAIT_TEXTURE_URLS.forEach((url, i) => {
      const t = list[i]
      if (t) {
        // Configure each shared texture once when building the map.
        t.colorSpace = THREE.SRGBColorSpace
        t.wrapS = THREE.RepeatWrapping
        t.wrapT = THREE.RepeatWrapping
        t.needsUpdate = true
        m.set(url, t)
      }
    })
    return m
  }, [loadedTextures])

  const prepared = useMemo(() => {
    const clone = scene.clone(true)
    cloneMaterials(clone)
    // Generate UVs before regrouping so trait maps show real patterns.
    ensureMeshUVs(clone, UV_MESH_NAMES)
    const byName = gatherMeshes(clone)

    // Turntable root rotates around origin; inner offset centers geometry there.
    const root = new THREE.Group()
    root.name = 'realonez-8-root'

    const centered = new THREE.Group()
    centered.name = 'realonez-8-centered'

    const bodyMeshes: THREE.Object3D[] = []
    for (const n of TRANSFORM_GROUPS.body.meshes) {
      const o = byName.get(n)
      if (o) bodyMeshes.push(o)
    }
    const glassesMeshes: THREE.Object3D[] = []
    for (const n of TRANSFORM_GROUPS.glasses.meshes) {
      const o = byName.get(n)
      if (o) glassesMeshes.push(o)
    }
    const hairMeshes: THREE.Object3D[] = []
    for (const n of TRANSFORM_GROUPS.hair.meshes) {
      const o = byName.get(n)
      if (o) hairMeshes.push(o)
    }

    // Each group pivots about its own geometric center (not world/figure origin).
    const bodyWrap = wrapCenterPivot('group-body-stack', bodyMeshes)
    const glassesWrap = wrapCenterPivot('group-glasses', glassesMeshes)
    const hairWrap = wrapCenterPivot('group-hair', hairMeshes)
    const body = bodyWrap.pivot
    const glasses = glassesWrap.pivot
    const hair = hairWrap.pivot

    centered.add(bodyWrap.anchor, glassesWrap.anchor, hairWrap.anchor)

    // Offset so the geometric center sits at the turntable origin (in-place yaw).
    const box = new THREE.Box3().setFromObject(centered)
    if (!box.isEmpty()) {
      const center = box.getCenter(new THREE.Vector3())
      centered.position.set(-center.x, -center.y, -center.z)
    }

    root.add(centered)
    return { root, body, glasses, hair, byName }
  }, [scene])

  // Cache original material map+color once after prepare
  useLayoutEffect(() => {
    const cache = originals.current
    const frameMat = asStdMat(
      prepared.byName.get(MESH_NAMES.glasses) as THREE.Mesh | undefined,
    )
    if (frameMat && !cache.frames) {
      cache.frames = snapshotMat(frameMat)
    }
    const hairMat = asStdMat(
      prepared.byName.get(MESH_NAMES.hair) as THREE.Mesh | undefined,
    )
    if (hairMat && !cache.hair) {
      cache.hair = snapshotMat(hairMat)
    }
    for (const name of [MESH_NAMES.head, MESH_NAMES.noseEarNeck]) {
      const mat = asStdMat(
        prepared.byName.get(name) as THREE.Mesh | undefined,
      )
      if (mat && !cache.skin.has(name)) {
        cache.skin.set(name, snapshotMat(mat))
      }
    }
  }, [prepared])

  // Wire refs + fire onReady exactly once (readySent guard).
  useLayoutEffect(() => {
    rootRef.current = prepared.root
    groupRefs.current = {
      body: prepared.body,
      glasses: prepared.glasses,
      hair: prepared.hair,
    }
    if (!readySent.current) {
      readySent.current = true
      onReadyRef.current?.()
    }
  }, [prepared, groupRefs, rootRef])

  // Fit camera once to centered model — look at origin (geometric center).
  useEffect(() => {
    if (fitted.current) return
    const box = new THREE.Box3().setFromObject(prepared.root)
    if (box.isEmpty()) return
    const size = box.getSize(new THREE.Vector3())
    const center = new THREE.Vector3(0, 0, 0) // centered pivot
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
    camera.lookAt(center)
    if (lookAtRef) {
      lookAtRef.current.copy(center)
    }
    fitted.current = true
  }, [camera, lookAtRef, prepared])

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

  // Frames — assign preloaded map (no Suspense remount; no shared-tex mutation)
  useEffect(() => {
    const mesh = prepared.byName.get(MESH_NAMES.glasses) as THREE.Mesh | undefined
    const mat = asStdMat(mesh)
    const url = framesId
      ? FRAME_SWATCHES.find((s) => s.id === framesId)?.url
      : undefined
    const tex = url ? textureByUrl.get(url) : undefined
    applyTextureOrRestore(mat, tex, originals.current.frames)
  }, [framesId, prepared, textureByUrl])

  // Hair — assign preloaded map
  useEffect(() => {
    const mesh = prepared.byName.get(MESH_NAMES.hair) as THREE.Mesh | undefined
    const mat = asStdMat(mesh)
    const url = hairId
      ? HAIR_SWATCHES.find((s) => s.id === hairId)?.url
      : undefined
    const tex = url ? textureByUrl.get(url) : undefined
    applyTextureOrRestore(mat, tex, originals.current.hair)
  }, [hairId, prepared, textureByUrl])

  // Skin — maps on head + nose/ear/neck (UVs generated; color white when mapped)
  useEffect(() => {
    const url = skinId
      ? SKIN_SWATCHES.find((s) => s.id === skinId)?.url
      : undefined
    const tex = url ? textureByUrl.get(url) : undefined
    for (const name of [MESH_NAMES.head, MESH_NAMES.noseEarNeck]) {
      const mesh = prepared.byName.get(name) as THREE.Mesh | undefined
      const mat = asStdMat(mesh)
      applyTextureOrRestore(mat, tex, originals.current.skin.get(name))
    }
  }, [skinId, prepared, textureByUrl])

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
