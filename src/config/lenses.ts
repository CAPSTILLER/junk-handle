/** Exactly 10 procedural translucent green shades — dark to neon. */
export type LensShade = {
  id: string
  label: string
  /** RGBA 0-1, alpha kept in translucent range */
  rgba: [number, number, number, number]
  /** Solid hex for UI swatches (ignores alpha). */
  color: string
}

function rgbaToHex(r: number, g: number, b: number): string {
  const to = (x: number) =>
    Math.max(0, Math.min(255, Math.round(x * 255)))
      .toString(16)
      .padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

const RAW: Array<{
  id: string
  label: string
  rgba: [number, number, number, number]
}> = [
  { id: 'g0', label: 'Forest', rgba: [0.01, 0.18, 0.02, 0.55] },
  { id: 'g1', label: 'Moss', rgba: [0.02, 0.28, 0.03, 0.5] },
  { id: 'g2', label: 'Jade', rgba: [0.02, 0.4, 0.05, 0.48] },
  { id: 'g3', label: 'Leaf', rgba: [0.03, 0.52, 0.04, 0.45] },
  { id: 'g4', label: 'Default', rgba: [0.011, 0.8, 0.0, 0.423] },
  { id: 'g5', label: 'Bright', rgba: [0.05, 0.88, 0.08, 0.4] },
  { id: 'g6', label: 'Lime', rgba: [0.15, 0.92, 0.05, 0.38] },
  { id: 'g7', label: 'Acid', rgba: [0.35, 0.95, 0.05, 0.36] },
  { id: 'g8', label: 'Neon', rgba: [0.45, 1.0, 0.1, 0.34] },
  { id: 'g9', label: 'Plasma', rgba: [0.55, 1.0, 0.25, 0.32] },
]

export const LENS_SHADES: LensShade[] = RAW.map((s) => ({
  ...s,
  color: rgbaToHex(s.rgba[0], s.rgba[1], s.rgba[2]),
}))

export const DEFAULT_LENS_ID = 'g4'
