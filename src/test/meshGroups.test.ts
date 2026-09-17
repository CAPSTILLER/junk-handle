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

  it('has cropped frame and hair swatches plus skin colors', () => {
    expect(FRAME_SWATCHES.length).toBe(40)
    expect(HAIR_SWATCHES.length).toBe(16)
    expect(SKIN_SWATCHES.length).toBe(10)
  })
})
