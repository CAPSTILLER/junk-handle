import { describe, expect, it } from 'vitest'
import { defaultDesign, designHash, designTraitsHex, validateDesign } from '../../shared/design'
import { decodeTraits } from '../../shared/my8'

describe('design', () => {
  const traits = decodeTraits('0x01050305')
  it('round-trips a default design for token #1 traits', () => {
    const d = validateDesign(defaultDesign(traits))
    expect(designTraitsHex(d)).toBe('0x01050305')
    expect(designHash(d)).toMatch(/^0x[0-9a-f]{64}$/)
  })
  it('keeps transforms and lenses', () => {
    const d = defaultDesign(traits)
    d.lensesId = 'g8'
    d.transforms.hair.position = [0.5, 1.25, -2]
    d.transforms.glasses.rotation = [0, 0.3, 0]
    d.transforms.body.scale = [1.2, 1.2, 1.2]
    const v = validateDesign(JSON.parse(JSON.stringify(d)))
    expect(v.lensesId).toBe('g8')
    expect(v.transforms.hair.position).toEqual([0.5, 1.25, -2])
    expect(v.transforms.body.scale).toEqual([1.2, 1.2, 1.2])
  })
  it('rejects bad shapes', () => {
    const d = defaultDesign(traits) as unknown as Record<string, unknown>
    expect(() => validateDesign({ ...d, lensesId: 'x' })).toThrow()
    expect(() => validateDesign({ ...d, v: 2 })).toThrow()
    expect(() => validateDesign({ ...d, transforms: { body: {} } })).toThrow()
    expect(() => validateDesign({ ...d, traits: { hair: 'nope' } })).toThrow()
    const bad = defaultDesign(traits)
    bad.transforms.hair.position = [NaN, 0, 0]
    expect(() => validateDesign(bad)).toThrow()
  })
})
