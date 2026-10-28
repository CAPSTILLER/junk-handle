import { describe, expect, it, vi } from 'vitest'
const db = new Map<string, unknown>()
vi.mock('../../api/_lib/store.js', () => ({
  storageConfigured: () => true, getRaw: async () => null,
  getJson: async (k: string) => (db.has(k) ? JSON.parse(JSON.stringify(db.get(k))) : null),
  putJson: async (k: string, v: unknown) => { db.set(k, JSON.parse(JSON.stringify(v))) },
}))
vi.mock('@vercel/blob', () => ({ head: async () => ({ size: 1000 }), del: vi.fn(), get: vi.fn(), list: vi.fn(), presignUrl: vi.fn(), issueSignedToken: vi.fn() }))
vi.mock('../../api/_rocks/backup.js', () => ({ admins: () => [], mysbaseDomain: () => 'x', readSession: () => ({ a: '0x0000000000000000000000000000000000000001' }) }))
import { saveAsset } from '../../api/_rocks/mysbase'
const req = { headers: { 'x-mysbase-session': 's' }, query: {} } as never
const f = (n: string, sha = 'a'.repeat(64)) => ({ file: n, bytes: 1, sha256: sha, contentType: 'model/gltf-binary' })
const rig = { skins: 1, joints: 36, meshes: 2, clips: [{ name: 'Walking', duration: 1.2, rootMotion: false }, { name: 'x', duration: 'bad', rootMotion: 1 }] }
const meta = () => db.get('mysbase/assets/abc123/meta.json') as Record<string, any>
describe('mysbase saveAsset rig persistence', () => {
  it('stores rig+offset and keeps them on later meta-only saves with same model', async () => {
    await saveAsset(req, { id: 'abc123', name: 'p', original: f('original.glb'), model: f('model.glb'), rig, offset: [0, -1, 0.5], scale: 0.01 })
    expect(meta().rig.clips).toHaveLength(2); expect(meta().rig.clips[1]).toEqual({ name: 'x', duration: 0, rootMotion: true }); expect(meta().offset).toEqual([0, -1, 0.5])
    await saveAsset(req, { id: 'abc123', name: 'renamed', original: f('original.glb'), model: f('model.glb') })
    expect(meta().rig.joints).toBe(36); expect(meta().offset).toEqual([0, -1, 0.5])
    await saveAsset(req, { id: 'abc123', name: 'replaced', original: f('original.glb'), model: f('model.glb', 'b'.repeat(64)) })
    expect(meta().rig).toBeUndefined()
  })
  it('rejects junk rig/offset', async () => {
    await saveAsset(req, { id: 'abc124', original: f('original.glb'), rig: { skins: -1 }, offset: [1, 'x', 2] })
    const m = db.get('mysbase/assets/abc124/meta.json') as any; expect(m.rig).toBeUndefined(); expect(m.offset).toBeUndefined()
  })
})
