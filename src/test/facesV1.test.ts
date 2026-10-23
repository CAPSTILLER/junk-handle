import { describe, expect, it } from 'vitest'
import vectors from '../../faces/v1/test_vectors.json'
import { renderSvg, svgHash, traits, publicTraits, identitySeed, toHex } from '../../shared/faces/faces_v1.mjs'
import { faceTriangles } from '../../shared/faces/faceMesh.mjs'

describe('CAPs Rocks face generator v1 (frozen) matches test_vectors.json', () => {
  for (const v of vectors as { wallet: string; variant: number; svgKeccak: string; maskSvgKeccak: string; traits: Record<string, unknown> }[]) {
    it(`${v.wallet.slice(0, 8)} v${v.variant}`, () => {
      expect(publicTraits(traits(v.wallet, v.variant))).toEqual(v.traits)
      expect(svgHash(renderSvg(v.wallet, v.variant, { mode: 'mask' }))).toBe(v.maskSvgKeccak)
      expect(svgHash(renderSvg(v.wallet, v.variant))).toBe(v.svgKeccak)
    })
  }
  it('spec seed check A(0x…dEaD)', () => {
    expect(toHex(identitySeed('0x000000000000000000000000000000000000dEaD')).startsWith('5d5b3cf1')).toBe(true)
  })
  it('3D inlay mesh is non-empty and inside the tablet safe area', () => {
    const t = faceTriangles(vectors[0].wallet, 0, 0.24)
    expect(t.length % 9).toBe(0); expect(t.length).toBeGreaterThan(900)
    for (let i = 0; i < t.length; i += 3) { expect(Math.abs(t[i])).toBeLessThan(0.1065); expect(Math.abs(t[i + 1])).toBeLessThan(0.0889) }
  })
})
