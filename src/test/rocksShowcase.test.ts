import { describe, it, expect } from 'vitest'
import { publicFullId, PUBLIC_FULL_IDS } from '../../api/rocks'
describe('rocks showcase allowlist', () => {
  it('only Rock #1 is public', () => { expect(PUBLIC_FULL_IDS).toEqual([1n]); expect(publicFullId('1')).toBe(1n) })
  it('every other id still needs the holder', () => { for (const id of ['2', '0', '3', '999']) expect(() => publicFullId(id)).toThrow(/holder/) })
})
