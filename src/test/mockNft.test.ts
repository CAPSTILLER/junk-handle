import { describe, expect, it } from 'vitest'
import {
  RECOVERABLE_CATALOG,
  buildMockMetadata,
  parseRecoverableFromMetadata,
} from '../services/mockNft'
import { REALONEZ_NFT_CONTRACT } from '../config/contracts'
import { onchainService } from '../services/onchainPlaceholder'

const identity = {
  position: [0, 0, 0] as [number, number, number],
  rotation: [0, 0, 0] as [number, number, number],
  scale: [1, 1, 1] as [number, number, number],
}

describe('mock NFT metadata', () => {
  it('marks test mode and simulated ownership', () => {
    const meta = buildMockMetadata(
      { frames: null, lenses: 'g4', skin: null, hair: null },
      { body: identity, glasses: identity, hair: identity },
      ['realonez-8-edited.glb'],
    )
    expect(meta.testMode).toBe(true)
    expect(meta.tokenId).toBe(8)
    expect(meta.contract).toBe(REALONEZ_NFT_CONTRACT)
    expect(meta.status).toBe('Owned (simulated)')
  })

  it('exposes recoverable GLB/FBX/OBJ/STL/JSON entries', () => {
    const keys = RECOVERABLE_CATALOG.map((f) => f.key)
    expect(keys).toEqual(['glb', 'fbx', 'obj', 'stl', 'json'])
    const bundled = RECOVERABLE_CATALOG.filter((f) => f.source === 'bundled')
    expect(bundled.every((f) => !!f.url)).toBe(true)
  })

  it('parses recoverable list from metadata', () => {
    const meta = buildMockMetadata(
      { frames: 'x', lenses: 'g4', skin: 'y', hair: 'z' },
      { body: identity, glasses: identity, hair: identity },
      [],
    )
    const files = parseRecoverableFromMetadata(meta)
    expect(files.length).toBeGreaterThanOrEqual(5)
  })

  it('keeps onchain service disabled', () => {
    expect(onchainService.enabled).toBe(false)
  })
})
