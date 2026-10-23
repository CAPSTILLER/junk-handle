export type FaceTraits = { version: number; variant: number; mood: string; [k: string]: unknown }
export const FACE_GENERATOR: {
  id: string; version: number; ready: boolean; moods: readonly string[]; scale: number
  traits(address: string, variant: number): FaceTraits
  geometry(t: FaceTraits): { strokes: string[]; dots: { x: number; y: number; r: number }[]; lw: number }
  renderSvg(address: string, variant: number): string
}
