import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, unknown>()
vi.mock('../../api/_lib/store.js', () => ({
  storageConfigured: () => true,
  getJson: async (p: string) => (store.has(p) ? structuredClone(store.get(p)) : null),
  putJson: async (p: string, v: unknown) => { store.set(p, structuredClone(v)) },
  getRaw: async () => null,
}))
vi.mock('@vercel/blob', () => ({
  del: async (p: string | string[]) => { for (const x of [p].flat()) store.delete(x) },
  get: vi.fn(), head: vi.fn(), list: vi.fn(), issueSignedToken: async () => 'tok', presignUrl: async () => ({ presignedUrl: 'https://blob/x' }),
}))
const ADMIN = '0x00000000000000000000000000000000000000Aa', USER = '0x00000000000000000000000000000000000000bB'
let who = ADMIN
const KEY = '0x00000000000000000000000000000000000000cC'
let keyDown = false
vi.mock('../../api/_rocks/backup.js', () => ({
  admins: () => ['0x00000000000000000000000000000000000000AA'],
  gate: async (a: string) => { if (keyDown) throw new Error('rpc down'); return a.toLowerCase() === KEY.toLowerCase() ? 'key' : null },
  mysbaseDomain: (d: string) => d === 'mysbase.gearup.wtf',
  readSession: (s: unknown) => { if (!s) throw Object.assign(new Error('Missing session'), { status: 401 }); return { a: who } },
}))
vi.mock('../../api/_rocks/assets.mjs', () => ({ assetKeyBytes: () => Buffer.alloc(32, 1) }))

const M = await import('../../api/_rocks/mysbase')
let signed: string[] = []
M._test.setVerify(async ({ message, signature }) => { signed.push(message); return signature === '0x01' })
const req = (s = 'tok') => ({ headers: { 'x-mysbase-session': s, origin: 'https://mysbase.gearup.wtf' }, query: {} }) as never
let n = 0
const sig = (good = true) => ({ nonce: (++n).toString(16).padStart(32, '0'), expires: Math.floor(Date.now() / 1000) + 200, signature: good ? '0x01' : '0x02', domain: 'mysbase.gearup.wtf' })
const asset = (id: string, name: string, extra = {}) => store.set(`mysbase/assets/${id}/meta.json`, { id, name, owner: ADMIN, kind: 'model', original: { file: 'original.glb', bytes: 1000 }, model: { file: 'model.glb', bytes: 500 }, createdAt: 1, ...extra })
const meta = (id: string) => store.get(`mysbase/assets/${id}/meta.json`) as { public?: boolean; pubRooms?: string[] }
const layout = { items: [{ typeId: 'asset:aaaaaaa1' }, { typeId: 'slot:Couch' }] }

beforeEach(() => { store.clear(); who = ADMIN; keyDown = false; signed = []; asset('aaaaaaa1', 'Lamp'); asset('bbbbbbb2', 'Couch.glb'); asset('ccccccc3', 'Secret') })

describe('starter rooms (admin publish / hide / remove)', () => {
  it('admin = CAPs Mind key holder OR BACKUP_ADMINS; others are not', async () => {
    await expect(M.isAdminAddress({ address: KEY })).resolves.toMatchObject({ admin: true })
    await expect(M.isAdminAddress({ address: ADMIN })).resolves.toMatchObject({ admin: true })
    await expect(M.isAdminAddress({ address: USER })).resolves.toMatchObject({ admin: false })
    keyDown = true
    await expect(M.isAdminAddress({ address: KEY })).resolves.toMatchObject({ admin: false })
    await expect(M.isAdminAddress({ address: ADMIN })).resolves.toMatchObject({ admin: true })
  })
  it('a key holder (no BACKUP_ADMINS entry) can publish with a signature; a non-holder cannot', async () => {
    who = KEY
    await expect(M.saveStarter(req(), { slug: 'key-room', layout, assetIds: ['aaaaaaa1'], sig: sig() })).resolves.toMatchObject({ ok: true })
    await expect(M.whoAmI(req())).resolves.toMatchObject({ admin: true })
    who = USER
    await expect(M.saveStarter(req(), { slug: 'usr-room', layout, assetIds: [], sig: sig() })).rejects.toThrow(/admin/i)
    await expect(M.whoAmI(req())).resolves.toMatchObject({ admin: false })
  })
  it('admin publish makes exactly the used assets public; visitors get them all', async () => {
    const r = await M.saveStarter(req(), { slug: 'my-room', name: 'My room', layout, assetIds: ['aaaaaaa1', 'bbbbbbb2', 'ccccccc3'], sig: sig() })
    expect(r).toMatchObject({ ok: true, assets: 2, copiedBytes: 0, publicBytes: 3000 })
    expect(signed[0]).toContain('Action: publish'); expect(signed[0]).toContain('Layout: ' + M.layoutHash(layout))
    expect(meta('ccccccc3').public).toBeUndefined()
    const v = await M.getShared({ id: 'my-room' })
    expect(v.assets.map((a) => a.id).sort()).toEqual(['aaaaaaa1', 'bbbbbbb2'])
    expect((await M.listStarters()).starters.map((s) => s.slug)).toEqual(['my-room'])
    await expect(M.publicAssetUrl({ id: 'aaaaaaa1', file: 'model.glb' }, 'https://api')).resolves.toHaveProperty('url')
    await expect(M.publicAssetUrl({ id: 'ccccccc3', file: 'model.glb' }, 'https://api')).rejects.toThrow(/private/)
  })
  it('rejects non-admins, missing/bad signatures and replays', async () => {
    who = USER
    await expect(M.saveStarter(req(), { slug: 'x-room', layout, assetIds: [], sig: sig() })).rejects.toThrow(/admin/i)
    who = ADMIN
    await expect(M.saveStarter(req(), { slug: 'x-room', layout, assetIds: [] })).rejects.toThrow(/signature/i)
    await expect(M.saveStarter(req(), { slug: 'x-room', layout, assetIds: [], sig: sig(false) })).rejects.toThrow(/does not match/)
    const s = sig(); await M.saveStarter(req(), { slug: 'x-room', layout, assetIds: [], sig: s })
    await expect(M.saveStarter(req(), { slug: 'x-room', layout, assetIds: [], sig: s })).rejects.toThrow(/already used/)
    await expect(M.saveStarter(req(), { slug: 'vault42', layout, assetIds: [], sig: sig() })).rejects.toThrow(/Slug/)
    await expect(M.saveStarter(req(), { slug: 'x-room', layout, assetIds: [], sig: { ...sig(), expires: 1 } })).rejects.toThrow(/expired/)
  })
  it('make private hides it from visitors (admin still loads it), make public restores it', async () => {
    await M.saveStarter(req(), { slug: 'my-room', name: 'R', layout, assetIds: ['aaaaaaa1', 'bbbbbbb2'], sig: sig() })
    await M.setStarterHidden(req(), { slug: 'my-room', hidden: true, sig: sig() })
    expect((await M.listStarters()).starters).toEqual([])
    await expect(M.getShared({ id: 'my-room' })).rejects.toThrow(/No room/)
    expect(meta('aaaaaaa1').public).toBeUndefined()
    expect((await M.getShared({ id: 'my-room' }, req())).hidden).toBe(true)
    who = USER; await expect(M.getShared({ id: 'my-room' }, req())).rejects.toThrow(/No room/); who = ADMIN
    expect((await M.adminStarters(req())).starters[0]).toMatchObject({ slug: 'my-room', hidden: true })
    await M.setStarterHidden(req(), { slug: 'my-room', hidden: false, sig: sig() })
    expect((await M.listStarters()).starters).toHaveLength(1); expect(meta('aaaaaaa1').public).toBe(true)
  })
  it('remove deletes the entry; shared assets stay public while another room uses them; manual public kept', async () => {
    asset('ddddddd4', 'Rug', { public: true })
    await M.saveStarter(req(), { slug: 'room-a', layout: { ...layout, x: 'ddddddd4' }, assetIds: ['aaaaaaa1', 'bbbbbbb2', 'ddddddd4'], sig: sig() })
    await M.saveStarter(req(), { slug: 'room-b', layout: { items: [{ typeId: 'asset:aaaaaaa1' }] }, assetIds: ['aaaaaaa1'], sig: sig() })
    await M.deleteStarter(req(), { slug: 'room-a', sig: sig() })
    await expect(M.getShared({ id: 'room-a' })).rejects.toThrow(/No room/)
    expect(meta('aaaaaaa1').public).toBe(true); expect(meta('bbbbbbb2').public).toBeUndefined(); expect(meta('ddddddd4').public).toBe(true)
    expect(signed.at(-1)).toContain('Action: remove')
  })
  it('re-publish over a room updates layout and unlinks dropped assets', async () => {
    await M.saveStarter(req(), { slug: 'my-room', layout, assetIds: ['aaaaaaa1', 'bbbbbbb2'], sig: sig() })
    const l2 = { items: [{ typeId: 'asset:aaaaaaa1' }] }
    const r = await M.saveStarter(req(), { slug: 'my-room', layout: l2, assetIds: ['aaaaaaa1'], sig: sig() })
    expect(r.updated).toBe(true); expect(meta('bbbbbbb2').public).toBeUndefined()
    expect((await M.getShared({ id: 'my-room' })).layout).toEqual(l2)
  })
})
