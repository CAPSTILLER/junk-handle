/**
 * CAPs Rocks pose JSON (`caps-rocks-pose/1`, BRIEF §6.3), shared by the editor (src/) and the renderer (api/).
 * Bone names are the rig's Mixamo names without the `mixamorig:` prefix. Quaternions [x,y,z,w] are LOCAL
 * rotations relative to the rest pose, normalized and rounded to 4 decimals. Missing bones = rest.
 * Canonical form = keys sorted at every level, no whitespace (JCS-style for this schema), UTF-8.
 * poseHash (bytes32 onchain) = sha256(canonical bytes).
 */
export const POSE_SCHEMA = 'caps-rocks-pose/1'
export const POSE_RIG = 'caps-rock-tablet'
export const POSE_RIG_VERSION = 1
export const POSE_MAX_BYTES = 16 * 1024
export const ROOT_OFFSET_MAX = 0.5

const SIDES = ['Shoulder', 'Arm', 'ForeArm', 'Hand', 'HandMiddle1', 'HandMiddle2', 'HandMiddle3', 'UpLeg', 'Leg', 'Foot', 'ToeBase']
export const POSE_BONES: readonly string[] = [
  'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  ...SIDES.map((s) => 'Left' + s), ...SIDES.map((s) => 'Right' + s),
]
/** Friendly aliases from the brief example; normalized to rig names before hashing. */
const ALIASES: Record<string, string> = {
  LeftUpperArm: 'LeftArm', RightUpperArm: 'RightArm', LeftLowerArm: 'LeftForeArm', RightLowerArm: 'RightForeArm',
  LeftUpperLeg: 'LeftUpLeg', RightUpperLeg: 'RightUpLeg', LeftLowerLeg: 'LeftLeg', RightLowerLeg: 'RightLeg',
  Chest: 'Spine1', UpperChest: 'Spine2',
}
export const rigJointName = (bone: string) => 'mixamorig:' + bone

export type Quat = [number, number, number, number]
export type PoseJson = {
  schema: typeof POSE_SCHEMA
  rig: typeof POSE_RIG
  rigVersion: number
  name: string
  rootOffset?: [number, number, number]
  bones: Record<string, Quat>
}

const r4 = (n: number) => { const v = Math.round(n * 1e4) / 1e4; return Object.is(v, -0) ? 0 : v }

/** Validate + normalize. Throws Error(message) on bad input. */
export function normalizePose(input: unknown): PoseJson {
  if (!input || typeof input !== 'object') throw new Error('pose must be an object')
  const p = input as Record<string, unknown>
  if (p.schema !== POSE_SCHEMA) throw new Error('schema must be ' + POSE_SCHEMA)
  if (p.rig !== POSE_RIG) throw new Error('rig must be ' + POSE_RIG)
  if (p.rigVersion !== POSE_RIG_VERSION) throw new Error('unsupported rigVersion')
  const name = typeof p.name === 'string' ? p.name.trim().replace(/[\u0000-\u001f]/g, '').slice(0, 40) : ''
  if (!name) throw new Error('pose needs a name (1-40 chars)')
  if (!p.bones || typeof p.bones !== 'object' || Array.isArray(p.bones)) throw new Error('bones must be an object')
  const bones: Record<string, Quat> = {}
  for (const [raw, q] of Object.entries(p.bones as Record<string, unknown>)) {
    const b = ALIASES[raw] ?? raw
    if (!POSE_BONES.includes(b)) throw new Error('unknown bone ' + raw)
    if (!Array.isArray(q) || q.length !== 4 || !q.every((x) => typeof x === 'number' && Number.isFinite(x))) throw new Error('bad quaternion for ' + raw)
    const len = Math.hypot(q[0], q[1], q[2], q[3])
    if (len < 1e-6) throw new Error('zero quaternion for ' + raw)
    let n = q.map((x: number) => x / len) as Quat
    if (n[3] < 0) n = n.map((x) => -x) as Quat // canonical hemisphere
    const out = n.map(r4) as Quat
    if (out[0] === 0 && out[1] === 0 && out[2] === 0 && out[3] === 1) continue // identity = rest, omit
    bones[b] = out
  }
  const pose: PoseJson = { schema: POSE_SCHEMA, rig: POSE_RIG, rigVersion: POSE_RIG_VERSION, name, bones }
  if (p.rootOffset !== undefined) {
    const o = p.rootOffset
    if (!Array.isArray(o) || o.length !== 3 || !o.every((x) => typeof x === 'number' && Number.isFinite(x))) throw new Error('bad rootOffset')
    const c = o.map((x: number) => r4(Math.max(-ROOT_OFFSET_MAX, Math.min(ROOT_OFFSET_MAX, x)))) as [number, number, number]
    if (c.some((x) => x !== 0)) pose.rootOffset = c
  }
  return pose
}

function canon(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']'
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon((v as Record<string, unknown>)[k])).join(',') + '}'
  }
  return JSON.stringify(v)
}
export const canonicalPose = (p: PoseJson): string => canon(p)

/** Renderer form: rig joint name -> quaternion. */
export const poseToRig = (p: PoseJson) => ({
  name: p.name,
  rootOffset: p.rootOffset,
  bones: Object.fromEntries(Object.entries(p.bones).map(([b, q]) => [rigJointName(b), q])),
})

export function ipfsToHttp(uri: string, gateway = 'https://ipfs.io/ipfs/'): string {
  if (uri.startsWith('ipfs://')) return gateway + uri.slice(7).replace(/^ipfs\//, '')
  return uri
}
