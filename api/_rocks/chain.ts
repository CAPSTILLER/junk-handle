/** CAPs Rocks chain reads + pose fetch/verify (server only). */
import { createHash } from 'node:crypto'
import { getAddress, type Address, type Hex } from 'viem'
import { CAPS_ROCKS, CAPS_ROCKS_ABI } from '../../shared/capsRocks.js'
import { canonicalPose, ipfsToHttp, normalizePose, poseToRig, type PoseJson } from '../../shared/rocksPose.js'
import { HttpError, client } from '../_lib/server.js'
import { getRaw, putRaw, storageConfigured } from '../_lib/store.js'

export const rocks = { address: CAPS_ROCKS, abi: CAPS_ROCKS_ABI } as const

export async function rockOwner(id: bigint): Promise<Address | null> {
  try { return getAddress(await client.readContract({ ...rocks, functionName: 'ownerOf', args: [id] })) } catch { return null }
}

export async function readRock(id: bigint) {
  const exists = await client.readContract({ ...rocks, functionName: 'exists', args: [id] })
  if (!exists) throw new HttpError(404, `CAPs Rock #${id} does not exist`, 'not_found')
  const [view, active, activeP] = await Promise.all([
    client.readContract({ ...rocks, functionName: 'rockView', args: [id] }),
    client.readContract({ ...rocks, functionName: 'activeFace', args: [id] }),
    client.readContract({ ...rocks, functionName: 'activePose', args: [id] }),
  ])
  return { view, activeFace: active, activePose: activeP }
}

export const sha256Hex = (s: string | Buffer): Hex => ('0x' + createHash('sha256').update(s).digest('hex')) as Hex
export const posePath = (hash: string) => `rocks/poses/${hash.toLowerCase()}.json`

const GATEWAYS = ['https://gateway.pinata.cloud/ipfs/', 'https://ipfs.io/ipfs/', 'https://dweb.link/ipfs/']
const poseCache = new Map<string, PoseJson>()

/** Load a saved pose by (hash, uri) and verify sha256(canonical) == poseHash. Returns null if unverifiable. */
export async function loadPose(poseHash: Hex, uri: string): Promise<PoseJson | null> {
  const key = poseHash.toLowerCase()
  if (poseCache.has(key)) return poseCache.get(key)!
  const check = (bytes: Buffer): PoseJson | null => {
    try {
      if (bytes.length > 16 * 1024) return null
      const p = normalizePose(JSON.parse(bytes.toString('utf8')))
      if (sha256Hex(canonicalPose(p)).toLowerCase() !== key && sha256Hex(bytes).toLowerCase() !== key) return null
      return p
    } catch { return null }
  }
  const cached = await getRaw(posePath(key)).catch(() => null)
  let pose = cached ? check(cached.bytes) : null
  if (!pose) {
    const urls = uri.startsWith('ipfs://') ? GATEWAYS.map((g) => ipfsToHttp(uri, g)) : uri.startsWith('https://') ? [uri] : []
    for (const u of urls) {
      try {
        const r = await fetch(u, { signal: AbortSignal.timeout(5_000) })
        if (!r.ok) continue
        pose = check(Buffer.from(await r.arrayBuffer()))
        if (pose) break
      } catch { /* next gateway */ }
    }
    if (pose && storageConfigured()) await putRaw(posePath(key), canonicalPose(pose), 'application/json').catch(() => {})
  }
  if (pose) poseCache.set(key, pose)
  return pose
}

/** Active pose of a rock in renderer form (or null = rest). */
export async function activeRigPose(id: bigint, activePose?: readonly [boolean, bigint, { poseHash: Hex; uri: string }]) {
  const ap = activePose ?? (await client.readContract({ ...rocks, functionName: 'activePose', args: [id] }))
  if (!ap[0]) return { pose: null, name: 'Rest' }
  const p = await loadPose(ap[2].poseHash, ap[2].uri)
  return p ? { pose: poseToRig(p), name: p.name } : { pose: null, name: 'Unverified pose' }
}
