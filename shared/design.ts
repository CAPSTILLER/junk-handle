/** Full studio design (traits + lenses + per-group transforms), stored offchain per token. Shared by app + API. */
import { keccak256, toHex, type Hex } from 'viem'
import { encodeTraits, decodeTraits, type StudioTraits } from './my8.js'

export const DESIGN_VERSION = 1
export const DESIGN_MAX_BYTES = 4096
export const DESIGN_GROUPS = ['body', 'glasses', 'hair'] as const
export type DesignGroup = (typeof DESIGN_GROUPS)[number]
export const LENS_IDS = ['g0', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8', 'g9'] as const
export type V3 = [number, number, number]
export type DesignTransform = { position: V3; rotation: V3; scale: V3 }
export type Design = {
  v: 1
  traits: StudioTraits
  lensesId: string
  transforms: Record<DesignGroup, DesignTransform>
}

const round = (n: number) => Math.round(n * 1e5) / 1e5

function vec(x: unknown, what: string, min: number, max: number): V3 {
  if (!Array.isArray(x) || x.length !== 3) throw new Error(`${what} must be [x,y,z]`)
  return x.map((n) => {
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) throw new Error(`${what} out of range`)
    return round(n)
  }) as V3
}

/** Strict validate + canonicalize (throws with a short reason). */
export function validateDesign(x: unknown): Design {
  if (!x || typeof x !== 'object') throw new Error('design must be an object')
  const d = x as Record<string, unknown>
  if (d.v !== DESIGN_VERSION) throw new Error('unsupported design version')
  const t = d.traits as Record<string, unknown> | undefined
  if (!t || typeof t !== 'object') throw new Error('design.traits missing')
  const traits = decodeTraits(encodeTraits({
    hair: (t.hair ?? null) as string | null,
    skin: (t.skin ?? null) as string | null,
    frame: (t.frame ?? null) as string | null,
  }))
  if (typeof d.lensesId !== 'string' || !(LENS_IDS as readonly string[]).includes(d.lensesId)) throw new Error('bad lensesId')
  const tr = d.transforms as Record<string, unknown> | undefined
  if (!tr || typeof tr !== 'object') throw new Error('design.transforms missing')
  const transforms = {} as Record<DesignGroup, DesignTransform>
  for (const g of DESIGN_GROUPS) {
    const o = tr[g] as Record<string, unknown> | undefined
    if (!o || typeof o !== 'object') throw new Error(`transforms.${g} missing`)
    transforms[g] = {
      position: vec(o.position, `${g}.position`, -1000, 1000),
      rotation: vec(o.rotation, `${g}.rotation`, -100, 100),
      scale: vec(o.scale, `${g}.scale`, -100, 100),
    }
  }
  const out: Design = { v: 1, traits, lensesId: d.lensesId, transforms }
  if (JSON.stringify(out).length > DESIGN_MAX_BYTES) throw new Error('design too large')
  return out
}

export const designTraitsHex = (d: Design): Hex => encodeTraits(d.traits)
export const designHash = (d: Design): Hex => keccak256(toHex(JSON.stringify(validateDesign(d))))

const ID: DesignTransform = { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
/** Fallback when no design is saved: onchain traits, default lenses, default positions. */
export function defaultDesign(traits: StudioTraits): Design {
  const t = () => ({ position: [...ID.position], rotation: [...ID.rotation], scale: [...ID.scale] }) as DesignTransform
  return { v: 1, traits: { ...traits }, lensesId: 'g4', transforms: { body: t(), glasses: t(), hair: t() } }
}
