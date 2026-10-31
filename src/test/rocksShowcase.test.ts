import { describe, it, expect } from 'vitest'
import { publicFullId, PUBLIC_FULL_IDS } from '../../api/rocks'
describe('rocks showcase allowlist', () => {
  it('no rock is public', () => { expect(PUBLIC_FULL_IDS).toEqual([]); expect(() => publicFullId('1')).toThrow(/holder/) })
  it('every other id still needs the holder', () => { for (const id of ['2', '0', '3', '999']) expect(() => publicFullId(id)).toThrow(/holder/) })
})
