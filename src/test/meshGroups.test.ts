import { describe, expect, it } from 'vitest'
import {
  ALL_MESH_NAMES,
  ORIGINAL_GLTF_NAMES,
  TRANSFORM_GROUPS,
  assertTenMeshes,
  groupForMesh,
} from '../config/meshGroups'
import { LENS_SHADES } from '../config/lenses'
import { FRAME_SWATCHES, HAIR_SWATCHES, SKIN_SWATCHES } from '../config/swatches'

describe('mesh groups', () => {
  it('has exactly 10 mesh names', () => {
    expect(ALL_MESH_NAMES).toHaveLength(10)
    expect(ORIGINAL_GLTF_NAMES).toHaveLength(10)
  })

  it('partitions all meshes into exactly 3 groups without overlap', () => {
    const all = Object.values(TRANSFORM_GROUPS).flatMap((g) => [...g.meshes])
    expect(all).toHaveLength(10)
    expect(new Set(all).size).toBe(10)
    expect(Object.keys(TRANSFORM_GROUPS)).toEqual(['body', 'glasses', 'hair'])
  })

  it('locks lenses with glasses', () => {
    expect([...TRANSFORM_GROUPS.glasses.meshes]).toEqual([
      'real_onez_#8_glasses',
      'real_onez_#8_lenses',
    ])
  })

  it('keeps skin meshes in body stack', () => {
    expect(TRANSFORM_GROUPS.body.meshes).toContain('real_onez_#8_head')
    expect(TRANSFORM_GROUPS.body.meshes).toContain('real_onez_#8_nose_ear_neck')
  })

  it('assertTenMeshes validates known set', () => {
    const r = assertTenMeshes([...ALL_MESH_NAMES])
    expect(r.ok).toBe(true)
    expect(groupForMesh('real_onez_#8_hair')).toBe('hair')
  })
})

describe('traits catalog', () => {
  it('has 10 lens shades', () => {
    expect(LENS_SHADES).toHaveLength(10)
  })

  it('limits each trait catalog to documented solid swatches', () => {
    expect(FRAME_SWATCHES).toHaveLength(10)
    expect(HAIR_SWATCHES).toHaveLength(6)
    expect(SKIN_SWATCHES).toHaveLength(10)
    for (const s of [...FRAME_SWATCHES, ...HAIR_SWATCHES, ...SKIN_SWATCHES]) {
      expect(s.color).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
    for (const s of LENS_SHADES) {
      expect(s.color).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })
})
