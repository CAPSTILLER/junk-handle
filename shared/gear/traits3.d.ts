export const VERSION: string
export type GearTraits = Record<string, unknown> & {
  version: string; address: string; tier: string; teeth: number; stack: string; family: string; web: string; arms: number
  hub: string; bore: string; engraving: string; thickness: number; master: boolean; color: string; colorHex: string
  pattern: string; sheen: string; wear: string; codename: string; serial: string; od: number; name: string
}
export function traits(addr: string): GearTraits
export function normAddress(a: string): string
export function centerDistance(z1: number, z2: number): number
