export const GENERATOR_VERSION: 1
export const MOODS: readonly string[]
export const FACE_SCALE: string
export const COLORS: { stone: string; stoneDeep: string; groove: string; inlay: string }
export const TABLET: { w: number; h: number; border: { inset: number; width: number }; safe: { x: number; y: number } }
export type FaceTraits = { version: number; variant: number; eyes: string; eyeSpacing: number; eyeY: number; brows: string; nose: string; mouthW: number; mouthY: number; marks: string; markSide: string; crown: boolean; seer: boolean; weight: string; sigil: string; sigilFamily: string; mood: string; drift: Record<string, number> }
export function traits(address: string, variant: number, version?: number): FaceTraits & { _sig: unknown }
export function publicTraits(t: FaceTraits & { _sig?: unknown }): FaceTraits
export function geometry(t: unknown): { strokes: string[]; dots: { x: number; y: number; r: number }[]; lw: number }
export function renderSvg(address: string, variant: number, opts?: { mode?: 'albedo' | 'mask'; version?: number }): string
export function svgHash(svg: string): string
export function identitySeed(address: string, version?: number): Uint8Array
export function variantSeed(address: string, variant: number, version?: number): Uint8Array
export function toHex(b: Uint8Array): string
