import { describe, expect, it } from 'vitest'
import { FACE_GENERATOR as G } from '../../shared/faces/generator.mjs'
import { faceTriangles } from '../../shared/faces/faceMesh.mjs'
const A = '0x000000000000000000000000000000000000dEaD'
describe('face generator interface (placeholder until final v1 spec)', () => {
  it('is not marked ready (Add face stays disabled, nothing baked)', () => expect(G.ready).toBe(false))
  it('7 moods, mood = variant % 7, deterministic', () => {
    expect(G.moods.length).toBe(7)
    expect(G.traits(A, 9).mood).toBe(G.moods[2])
    expect(G.renderSvg(A, 3)).toBe(G.renderSvg(A, 3))
  })
  it('3D inlay mesh stays inside the tablet', () => {
    const t = faceTriangles(A, 4, 0.24)
    expect(t.length % 9).toBe(0); expect(t.length).toBeGreaterThan(90)
    for (let i = 0; i < t.length; i += 3) { expect(Math.abs(t[i])).toBeLessThan(0.1065); expect(Math.abs(t[i + 1])).toBeLessThan(0.0889) }
  })
})
