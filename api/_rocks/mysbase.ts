/**
 * Mysbase (https://mysbase.gearup.wtf) private assets + server-saved rooms, stored in this deploy's PRIVATE Vercel Blob.
 * Gate: same signed-message flow as /backup (action "mysbase"): CAPs Mind key holders or BACKUP_ADMINS only.
 * Big files go browser -> Blob directly via presigned PUT URLs (bypasses the 4.5 MB function body limit).
 * Viewing: short-lived presigned GET URLs (or a streamed HMAC-token proxy as fallback). Nothing here is public.
 */
import { createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto'
import { del, get, head, issueSignedToken, list, presignUrl } from '@vercel/blob'
import { handleUploadPresigned } from '@vercel/blob/client'
import type { Address } from 'viem'
import { HttpError, type Req, type Res } from '../_lib/server.js'
import { getJson, getRaw, putJson, storageConfigured } from '../_lib/store.js'
import { assetKeyBytes } from './assets.mjs'
import { mysbaseDomain, readSession } from './backup.js'

export const MAX_ASSET_BYTES = 100 * 1024 * 1024
export const ROOM_HISTORY = 10
const ID = /^[a-z0-9][a-z0-9-]{5,47}$/
const ROOM = /^[a-z0-9][a-z0-9-]{0,39}$/
const FILE = /^(original|model|thumb)\.[a-z0-9]{1,5}$/
/** Folder name: shown as-is in My assets; templates (round 3) reference assets by folder + name. */
const FOLDER = /^[\w .()&+,'-]{1,60}$/
const cleanFolder = (v: unknown): string | undefined => { const f = String(v ?? '').trim(); return f && FOLDER.test(f) ? f : undefined }
const foldersPath = 'mysbase/folders.json'
const EXT = ['zip', 'glb', 'gltf', 'obj', 'stl', 'ply', 'fbx', 'usdz', 'png', 'jpg', 'jpeg', 'webp']
const TYPES: Record<string, string> = {
  zip: 'application/zip', glb: 'model/gltf-binary', gltf: 'model/gltf+json', obj: 'model/obj', stl: 'model/stl', ply: 'application/ply', fbx: 'application/octet-stream',
  usdz: 'model/vnd.usdz+zip', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
}
const q1 = (v: unknown) => (Array.isArray(v) ? v[0] : v) as string | undefined

/** CORS for the Mysbase page (and local dev). Returns true when this was a preflight that has been answered. */
export function cors(req: Req, res: Res): boolean {
  const o = String(q1(req.headers.origin) ?? '')
  let host = ''
  try { host = new URL(o).host } catch { /* no origin */ }
  if (host && mysbaseDomain(host) && (o.startsWith('https://') || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o))) {
    res.setHeader('Access-Control-Allow-Origin', o)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'content-type, x-mysbase-session, x-backup-session')
    res.setHeader('Access-Control-Max-Age', '600')
  }
  if (req.method === 'OPTIONS') { res.status(204).send(''); return true }
  return false
}
export function originHost(req: Req): string {
  try { return new URL(String(q1(req.headers.origin) ?? '')).host } catch { return '' }
}
function session(req: Req): Address {
  return readSession(q1(req.headers['x-mysbase-session']) ?? q1(req.query.s), 'mysbase').a
}
function needStore() { if (!storageConfigured()) throw new HttpError(503, 'Storage is not configured on this deploy.', 'storage_missing') }

const assetDir = (id: string) => `mysbase/assets/${id}/`
const roomPath = (r: string) => `mysbase/rooms/${r}.json`
export type AssetFile = { file: string; bytes: number; sha256: string; contentType: string }
export type AssetMeta = {
  id: string; name: string; owner: Address; kind: 'model' | 'image' | 'archive'; sourceFormat: string; createdAt: number
  original: AssetFile; model?: AssetFile; thumb?: AssetFile; folder?: string; needsConverter?: boolean
  sizeM?: [number, number, number]; unit?: string; scale?: number; allowedPresets?: string[]; holds?: boolean; wall?: boolean; note?: string
  category?: AssetCategory; snap?: SnapSide; updatedAt?: number
}
export const CATEGORIES = ['prop', 'table-top', 'wall-mount', 'ceiling-mount', 'free', 'wall-layer', 'floor-layer', 'ceiling-layer', 'light'] as const
/** Which side of the asset locks flush to the target surface ('auto' = default for the category). */
export const SNAPS = ['auto', 'bottom', 'back', 'top', 'front', 'left', 'right', 'center'] as const
export type SnapSide = (typeof SNAPS)[number]
const snapOk = (v: unknown): SnapSide | undefined => ((SNAPS as readonly string[]).includes(String(v)) ? (v as SnapSide) : undefined)
export type AssetCategory = (typeof CATEGORIES)[number]

/** Presigned direct-to-Blob upload (works with OIDC or a RW token). Used by Mysbase and by large backup restores. */
async function presignedUpload(req: Req, b: Record<string, unknown>, check: (pathname: string) => string) {
  return handleUploadPresigned({
    body: b as never,
    request: req as never,
    webhookPublicKey: process.env.BLOB_WEBHOOK_PUBLIC_KEY || 'unused', // no completion callback is registered
    getSignedToken: async (pathname) => {
      const contentType = check(pathname)
      const validUntil = Date.now() + 15 * 60_000
      const token = await issueSignedToken({ pathname, operations: ['put'], validUntil, maximumSizeInBytes: MAX_ASSET_BYTES, allowedContentTypes: [contentType, 'application/octet-stream'] })
      return { token, urlOptions: { validUntil, maximumSizeInBytes: MAX_ASSET_BYTES, allowOverwrite: true, addRandomSuffix: false } }
    },
  })
}

export async function uploadRoute(req: Req, b: Record<string, unknown>) {
  needStore(); session(req)
  return presignedUpload(req, b, (p) => {
    const m = p.match(/^mysbase\/assets\/([^/]+)\/([^/]+)$/)
    if (!m || !ID.test(m[1]) || !FILE.test(m[2])) throw new HttpError(400, 'Bad upload path', 'bad_path')
    const ext = m[2].split('.')[1]
    if (!EXT.includes(ext)) throw new HttpError(400, 'File type not allowed', 'bad_type')
    if (m[2].startsWith('model.') && ext !== 'glb') throw new HttpError(400, 'Converted model must be .glb', 'bad_type')
    if (m[2].startsWith('thumb.') && !['png', 'jpg', 'webp'].includes(ext)) throw new HttpError(400, 'Thumbnail must be an image', 'bad_type')
    return TYPES[ext]
  })
}
/** Large-file restore: restore session in x-backup-session; path rules match backup-put. */
export async function restoreUploadRoute(req: Req, b: Record<string, unknown>, okPath: (p: string) => boolean) {
  needStore()
  readSession(q1(req.headers['x-backup-session']), 'restore')
  return presignedUpload(req, b, (p) => { if (!okPath(p)) throw new HttpError(400, 'Bad path', 'bad_path'); return 'application/octet-stream' })
}
export async function restoreVerify(path: unknown, want: unknown, okPath: (p: string) => boolean) {
  if (typeof path !== 'string' || !okPath(path) || typeof want !== 'string') throw new HttpError(400, 'Bad path', 'bad_path')
  const r = await get(path, { access: 'private', useCache: false })
  if (!r || r.statusCode !== 200) throw new HttpError(404, 'Not found after upload', 'not_found')
  const h = createHash('sha256')
  for await (const c of r.stream as unknown as AsyncIterable<Uint8Array>) h.update(c)
  const got = h.digest('hex')
  if (got !== want) { await del(path).catch(() => {}); throw new HttpError(422, 'sha256 mismatch; the uploaded file was removed', 'sha_mismatch') }
  return { ok: true, path }
}

function cleanFile(f: unknown, id: string, which: 'original' | 'model' | 'thumb'): AssetFile {
  const o = (f ?? {}) as Record<string, unknown>
  const file = String(o.file ?? '')
  if (!FILE.test(file) || !file.startsWith(which + '.')) throw new HttpError(400, `Bad ${which} file`, 'bad_meta')
  if (typeof o.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(o.sha256)) throw new HttpError(400, 'Bad sha256', 'bad_meta')
  const ext = file.split('.')[1]
  return { file, bytes: 0, sha256: o.sha256, contentType: TYPES[ext] ?? 'application/octet-stream', ...(id ? {} : {}) }
}
const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined)

export async function saveAsset(req: Req, b: Record<string, unknown>) {
  needStore()
  const owner = session(req)
  const id = String(b.id ?? '')
  if (!ID.test(id)) throw new HttpError(400, 'Bad asset id', 'bad_id')
  const prev = await getJson<AssetMeta>(assetDir(id) + 'meta.json')
  const original = cleanFile(b.original, id, 'original')
  const model = b.model ? cleanFile(b.model, id, 'model') : undefined
  const thumb = b.thumb ? cleanFile(b.thumb, id, 'thumb') : prev?.thumb
  for (const f of [original, model, b.thumb ? thumb : undefined]) {
    if (!f) continue
    const h = await head(assetDir(id) + f.file).catch(() => null)
    if (!h) throw new HttpError(400, `${f.file} was not uploaded`, 'missing_file')
    if (h.size > MAX_ASSET_BYTES) throw new HttpError(413, 'File too large', 'too_large')
    f.bytes = h.size
  }
  const size = Array.isArray(b.sizeM) && b.sizeM.length === 3 && b.sizeM.every((v) => num(v, 0, 1000) !== undefined) ? (b.sizeM as [number, number, number]) : undefined
  const presets = Array.isArray(b.allowedPresets) ? b.allowedPresets.filter((p): p is string => typeof p === 'string' && /^[\w-]{1,24}$/.test(p)).slice(0, 20) : undefined
  const meta: AssetMeta = {
    id, owner: prev?.owner ?? owner, name: String(b.name ?? id).slice(0, 80), kind: b.kind === 'image' ? 'image' : b.kind === 'archive' ? 'archive' : 'model',
    ...(thumb ? { thumb } : {}), ...((cleanFolder(b.folder) ?? prev?.folder) ? { folder: cleanFolder(b.folder) ?? prev?.folder } : {}),
    sourceFormat: String(b.sourceFormat ?? original.file.split('.')[1]).slice(0, 8), createdAt: prev?.createdAt ?? Date.now(),
    original, ...(model ? { model } : {}), ...(b.needsConverter ? { needsConverter: true } : {}),
    ...(size ? { sizeM: size } : {}), ...(typeof b.unit === 'string' ? { unit: b.unit.slice(0, 4) } : {}), ...(num(b.scale, 0, 1e6) !== undefined ? { scale: b.scale as number } : {}),
    ...(presets ? { allowedPresets: presets } : {}), holds: !!b.holds, wall: !!b.wall,
    category: (CATEGORIES as readonly string[]).includes(String(b.category)) ? (b.category as AssetCategory) : prev?.category ?? (b.kind === 'image' || b.wall ? 'wall-mount' : 'prop'),
    ...((snapOk(b.snap) ?? prev?.snap) ? { snap: snapOk(b.snap) ?? prev?.snap } : {}), ...(typeof b.note === 'string' ? { note: b.note.slice(0, 200) } : {}),
  }
  await putJson(assetDir(id) + 'meta.json', meta)
  return { ok: true, asset: meta }
}

/** Change an uploaded asset's category / snap side after upload (files untouched). */
export async function updateAssetMeta(req: Req, b: Record<string, unknown>) {
  needStore(); session(req)
  const id = String(b.id ?? '')
  if (!ID.test(id)) throw new HttpError(400, 'Bad asset id', 'bad_id')
  const prev = await getJson<AssetMeta>(assetDir(id) + 'meta.json')
  if (!prev) throw new HttpError(404, 'No such asset', 'not_found')
  const next: AssetMeta = { ...prev, updatedAt: Date.now() }
  if (b.category !== undefined) {
    if (!(CATEGORIES as readonly string[]).includes(String(b.category))) throw new HttpError(400, 'Bad category', 'bad_meta')
    next.category = b.category as AssetCategory
    next.wall = next.category === 'wall-mount'
  }
  if (b.snap !== undefined) { const s = snapOk(b.snap); if (!s) throw new HttpError(400, 'Bad snap side', 'bad_meta'); next.snap = s }
  if (b.name !== undefined) { const n = String(b.name).trim().slice(0, 80); if (!n) throw new HttpError(400, 'Name is empty', 'bad_meta'); next.name = n }
  if (b.folder !== undefined) { // '' or null = unfiled
    if (b.folder === '' || b.folder === null) delete next.folder
    else { const f = cleanFolder(b.folder); if (!f) throw new HttpError(400, 'Bad folder name', 'bad_meta'); next.folder = f }
  }
  if (b.thumb !== undefined) {
    const t = cleanFile(b.thumb, id, 'thumb'), h = await head(assetDir(id) + t.file).catch(() => null)
    if (!h) throw new HttpError(400, 'thumbnail was not uploaded', 'missing_file')
    t.bytes = h.size; next.thumb = t
  }
  await putJson(assetDir(id) + 'meta.json', next)
  return { ok: true, asset: next }
}

export async function listAssets(req: Req) {
  needStore(); session(req)
  const metas: AssetMeta[] = []
  let cursor: string | undefined
  do {
    const r = await list({ prefix: 'mysbase/assets/', cursor, limit: 1000 })
    const want = r.blobs.filter((x) => x.pathname.endsWith('/meta.json'))
    const got = await Promise.all(want.map((x) => getJson<AssetMeta>(x.pathname).catch(() => null)))
    for (const g of got) if (g) metas.push(g)
    cursor = r.hasMore ? r.cursor : undefined
  } while (cursor)
  metas.sort((a, b) => b.createdAt - a.createdAt)
  const reg = (await getJson<{ folders: string[] }>(foldersPath).catch(() => null))?.folders ?? []
  const folders = [...new Set([...reg, ...metas.map((m) => m.folder).filter((f): f is string => !!f)])].sort((a, b) => a.localeCompare(b))
  return { assets: metas, folders }
}

/** Folders: create / rename (moves every asset in it) / delete (assets become unfiled; files are kept). */
export async function folderOp(req: Req, b: Record<string, unknown>) {
  needStore(); session(req)
  const op = String(b.op ?? ''), name = cleanFolder(b.name)
  if (!name) throw new HttpError(400, 'Bad folder name', 'bad_folder')
  const reg = new Set((await getJson<{ folders: string[] }>(foldersPath).catch(() => null))?.folders ?? [])
  let moved = 0
  const each = async (fn: (m: AssetMeta) => AssetMeta | null) => {
    let cursor: string | undefined
    do {
      const r = await list({ prefix: 'mysbase/assets/', cursor, limit: 1000 })
      for (const x of r.blobs.filter((x) => x.pathname.endsWith('/meta.json'))) {
        const m = await getJson<AssetMeta>(x.pathname).catch(() => null)
        if (m?.folder !== name) continue
        const n = fn(m); if (n) { await putJson(x.pathname, { ...n, updatedAt: Date.now() }); moved++ }
      }
      cursor = r.hasMore ? r.cursor : undefined
    } while (cursor)
  }
  if (op === 'create') reg.add(name)
  else if (op === 'rename') {
    const to = cleanFolder(b.to); if (!to) throw new HttpError(400, 'Bad new folder name', 'bad_folder')
    reg.delete(name); reg.add(to); await each((m) => ({ ...m, folder: to }))
  } else if (op === 'delete') { reg.delete(name); await each((m) => { const { folder: _f, ...rest } = m; return rest as AssetMeta }) }
  else throw new HttpError(400, 'Bad op', 'bad_op')
  await putJson(foldersPath, { folders: [...reg].sort() })
  return { ok: true, folders: [...reg].sort(), moved }
}

export async function deleteAsset(req: Req, b: Record<string, unknown>) {
  needStore(); session(req)
  const id = String(b.id ?? '')
  if (!ID.test(id)) throw new HttpError(400, 'Bad asset id', 'bad_id')
  const r = await list({ prefix: assetDir(id) })
  if (r.blobs.length) await del(r.blobs.map((x) => x.url))
  return { ok: true, deleted: r.blobs.length }
}

// ---- viewing: presigned GET (preferred) + HMAC proxy fallback ----
function proxyKey(): Buffer {
  const raw = assetKeyBytes()
  if (raw.length !== 32) throw new HttpError(503, 'Not configured (ROCKS_ASSET_KEY missing).', 'asset_key_missing')
  return Buffer.from(hkdfSync('sha256', raw, Buffer.from('mysbase-file'), Buffer.from('v1'), 32))
}
const FILE_TTL_S = 600
export async function assetUrl(req: Req, b: Record<string, unknown>, apiBase: string) {
  needStore(); session(req)
  const id = String(b.id ?? ''), file = String(b.file ?? '')
  if (!ID.test(id) || !FILE.test(file)) throw new HttpError(400, 'Bad asset', 'bad_id')
  const pathname = assetDir(id) + file
  const exp = Math.floor(Date.now() / 1000) + FILE_TTL_S
  const p = Buffer.from(JSON.stringify({ p: pathname, exp, n: randomBytes(6).toString('hex') })).toString('base64url')
  const proxy = `${apiBase}/api/rocks/mysbase-file?t=${p}.${createHmac('sha256', proxyKey()).update(p).digest('base64url')}`
  let url: string | null = null
  try {
    const token = await issueSignedToken({ pathname, operations: ['get'], validUntil: exp * 1000 })
    url = (await presignUrl(token, { operation: 'get', pathname, access: 'private', validUntil: exp * 1000 })).presignedUrl
  } catch (e) { console.warn('[mysbase] presign get failed:', (e as Error).message) }
  return { url: url ?? proxy, proxy, expiresAt: exp }
}
export async function fileProxy(req: Req, res: Res) {
  const t = String(q1(req.query.t) ?? '')
  const [p, mac] = t.split('.')
  const want = createHmac('sha256', proxyKey()).update(p ?? '').digest()
  const got = Buffer.from(mac ?? '', 'base64url')
  if (got.length !== want.length || !timingSafeEqual(got, want)) throw new HttpError(401, 'Bad link', 'bad_token')
  const tok = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')) as { p: string; exp: number }
  if (tok.exp < Date.now() / 1000) throw new HttpError(401, 'Link expired', 'expired')
  const r = await get(tok.p, { access: 'private', useCache: false })
  if (!r || r.statusCode !== 200) throw new HttpError(404, 'Not found', 'not_found')
  res.setHeader('Content-Type', r.blob.contentType || 'application/octet-stream')
  res.setHeader('Content-Length', String(r.blob.size))
  res.setHeader('Cache-Control', 'private, max-age=300')
  res.setHeader('Access-Control-Allow-Origin', '*') // the HMAC link itself is the credential (10 min)
  res.status(200)
  const w = res as unknown as NodeJS.WritableStream & { end(): void }
  for await (const c of r.stream as unknown as AsyncIterable<Uint8Array>) {
    if (!w.write(Buffer.from(c))) await new Promise((ok) => w.once('drain', ok))
  }
  w.end()
}

// ---- rooms ----
type RoomDoc = { roomId: string; current: { layout: unknown; savedAt: number; by: Address }; history: { layout: unknown; savedAt: number; by: Address }[] }
export async function saveRoom(req: Req, b: Record<string, unknown>) {
  needStore()
  const by = session(req)
  const roomId = String(b.roomId ?? '')
  if (!ROOM.test(roomId)) throw new HttpError(400, 'Room id: lowercase letters, digits, dashes (max 40)', 'bad_room')
  const layout = b.layout
  if (!layout || typeof layout !== 'object') throw new HttpError(400, 'Missing layout', 'bad_layout')
  if (JSON.stringify(layout).length > 1_000_000) throw new HttpError(413, 'Layout too large', 'too_large')
  const prev = await getJson<RoomDoc>(roomPath(roomId))
  const history = prev ? [prev.current, ...prev.history].slice(0, ROOM_HISTORY - 1) : []
  const doc: RoomDoc = { roomId, current: { layout, savedAt: Date.now(), by }, history }
  await putJson(roomPath(roomId), doc)
  return { ok: true, roomId, savedAt: doc.current.savedAt, versions: 1 + history.length }
}
export async function getRoom(req: Req, b: Record<string, unknown>) {
  needStore(); session(req)
  const roomId = String(b.roomId ?? '')
  if (!ROOM.test(roomId)) throw new HttpError(400, 'Bad room id', 'bad_room')
  const doc = await getJson<RoomDoc>(roomPath(roomId))
  if (!doc) throw new HttpError(404, 'No saved room with that id yet', 'not_found')
  const v = Number(b.version ?? 0)
  const all = [doc.current, ...doc.history]
  const pick = all[Number.isInteger(v) && v >= 0 && v < all.length ? v : 0]
  return { roomId, layout: pick.layout, savedAt: pick.savedAt, by: pick.by, versions: all.map((x, i) => ({ version: i, savedAt: x.savedAt, by: x.by })) }
}
export async function listRooms(req: Req) {
  needStore(); session(req)
  const r = await list({ prefix: 'mysbase/rooms/' })
  return { rooms: r.blobs.map((x) => ({ roomId: x.pathname.slice(14, -5), bytes: x.size, uploadedAt: x.uploadedAt })) }
}
export const _test = { ID, ROOM, FILE, getRaw }
