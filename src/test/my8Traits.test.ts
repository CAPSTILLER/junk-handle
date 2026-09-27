import { describe, expect, it } from 'vitest'
import { FRAME_SWATCHES, HAIR_SWATCHES, SKIN_SWATCHES } from '../config/swatches'
import {
  TRAIT_SLOTS,
  buildDownloadMessage,
  decodeTraits,
  encodeTraits,
  parseDownloadMessage,
  traitsHash,
} from '../../shared/my8'

describe('MY8 trait encoding v1', () => {
  it('shared swatch tables match the studio swatches (order matters)', () => {
    expect(TRAIT_SLOTS.hair.options.map((o) => o.id)).toEqual(HAIR_SWATCHES.map((s) => s.id))
    expect(TRAIT_SLOTS.skin.options.map((o) => o.id)).toEqual(SKIN_SWATCHES.map((s) => s.id))
    expect(TRAIT_SLOTS.frame.options.map((o) => o.id)).toEqual(FRAME_SWATCHES.map((s) => s.id))
  })

  it('round-trips and is 4 bytes, version first', () => {
    const t = { hair: '03-weave', skin: '05-wrinkle', frame: '07-silk' }
    const hex = encodeTraits(t)
    expect(hex).toBe('0x01030507')
    expect(decodeTraits(hex)).toEqual(t)
    expect(encodeTraits({ hair: null, skin: null, frame: null })).toBe('0x01000000')
    expect(traitsHash(hex)).toMatch(/^0x[0-9a-f]{64}$/)
  })

  it('rejects anything non-canonical', () => {
    for (const bad of ['0x', '0x010305', '0x0103050700', '0x02030507', '0x010b0000', '0x01000b00', 'zz', '0x01g30507']) {
      expect(() => decodeTraits(bad)).toThrow()
    }
    expect(() => encodeTraits({ hair: 'nope', skin: null, frame: null })).toThrow()
  })

  it('download message round-trips', () => {
    const m = { tokenId: '12', address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd', domain: 'example.app', issuedAt: '2026-09-27T17:00:00.000Z' }
    expect(parseDownloadMessage(buildDownloadMessage(m))).toEqual(m)
    expect(parseDownloadMessage(buildDownloadMessage(m) + '\nx')).toBeNull()
  })
})
