/**
 * Runtime mesh names as produced by Three.js GLTFLoader
 * (spaces → underscores via PropertyBinding.sanitizeNodeName).
 * Original GLB node names used spaces: "real onez #8 body", etc.
 */
export const MESH_NAMES = {
  body: 'real_onez_#8_body',
  eyemouthshoe: 'real_onez_#8_eyemouthshoe',
  glasses: 'real_onez_#8_glasses',
  hair: 'real_onez_#8_hair',
  hat: 'real_onez_#8_hat',
  hatlogo: 'real_onez_#8_hatlogo',
  head: 'real_onez_#8_head',
  lenses: 'real_onez_#8_lenses',
  noseEarNeck: 'real_onez_#8_nose_ear_neck',
  stripes: 'real_onez_#8_stripes',
} as const

/** Original glTF node names (pre-sanitize) for docs / metadata. */
export const ORIGINAL_GLTF_NAMES = [
  'real onez #8 body',
  'real onez #8 eyemouthshoe',
  'real onez #8 glasses',
  'real onez #8 hair',
  'real onez #8 hat',
  'real onez #8 hatlogo',
  'real onez #8 head',
  'real onez #8 lenses',
  'real onez #8 nose ear neck',
  'real onez #8 stripes',
] as const

export type MeshName = (typeof MESH_NAMES)[keyof typeof MESH_NAMES]

export type GroupId = 'body' | 'glasses' | 'hair'

export const TRANSFORM_GROUPS: Record<
  GroupId,
  { id: GroupId; label: string; meshes: readonly MeshName[] }
> = {
  body: {
    id: 'body',
    label: 'Body Stack',
    meshes: [
      MESH_NAMES.body,
      MESH_NAMES.eyemouthshoe,
      MESH_NAMES.noseEarNeck,
      MESH_NAMES.head,
      MESH_NAMES.hat,
      MESH_NAMES.hatlogo,
      MESH_NAMES.stripes,
    ],
  },
  glasses: {
    id: 'glasses',
    label: 'Glasses',
    meshes: [MESH_NAMES.glasses, MESH_NAMES.lenses],
  },
  hair: {
    id: 'hair',
    label: 'Hair',
    meshes: [MESH_NAMES.hair],
  },
}

export const ALL_MESH_NAMES: readonly MeshName[] = Object.values(MESH_NAMES)

export function groupForMesh(name: string): GroupId | null {
  for (const g of Object.values(TRANSFORM_GROUPS)) {
    if ((g.meshes as readonly string[]).includes(name)) return g.id
  }
  return null
}

export function assertTenMeshes(names: string[]): {
  ok: boolean
  missing: string[]
  unexpected: string[]
} {
  const expected = new Set<string>(ALL_MESH_NAMES)
  const found = new Set(names)
  const missing = [...expected].filter((n) => !found.has(n))
  const unexpected = [...found].filter((n) => !expected.has(n))
  return { ok: missing.length === 0 && unexpected.length === 0, missing, unexpected }
}
