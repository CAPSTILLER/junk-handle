import { describe, expect, it } from 'vitest'
import { CODE_ALPHA, _test, newCode } from '../../api/_rocks/mysbase'

describe('mysbase short room codes', () => {
  it('are 6 unambiguous chars and match the code regex', () => {
    for (let i = 0; i < 200; i++) { const c = newCode(); expect(c).toMatch(/^[a-z2-9]{6}$/); expect(_test.CODE.test(c)).toBe(true); expect(c).not.toMatch(/[01ilo]/) }
    expect(CODE_ALPHA).toHaveLength(31)
  })
  it('codes are valid room ids (so ?room=<code> works)', () => { expect(_test.ROOM.test(newCode())).toBe(true) })
})
