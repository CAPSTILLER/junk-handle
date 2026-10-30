export const RIG_ID: string
export const RIG_VERSION: number
export const PREVIEW_RATIO: number
export type RigPose = { name?: string; rootOffset?: [number, number, number]; bones: Record<string, number[]> }
export type Rendered = { bytes: Buffer; contentType: string; ext: string; traits: Record<string, string | number>; short: string }
export function renderRock(seed: string, opts?: { pose?: RigPose | null; face?: unknown; kind?: 'full' | 'stl' | 'preview' | 'display'; facePng?: Uint8Array | null }): Promise<Rendered>
export function rockTraits(seed: string): Promise<{ traits: Record<string, string | number>; engraveZone: unknown; short: string }>
