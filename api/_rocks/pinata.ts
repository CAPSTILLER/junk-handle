/** Pinata upload (server only): v3 Files API first, then legacy pinFileToIPFS. Never logs or returns the JWT. */
export function pinataJwt(env: NodeJS.ProcessEnv = process.env): string {
  return (env.PINATA_JWT ?? '').trim().replace(/^["']|["']$/g, '').replace(/^Bearer\s+/i, '').replace(/\s+/g, '')
}

const clip = (s: string, jwt: string) => (jwt ? s.split(jwt).join('[redacted]') : s).replace(/[\r\n]+/g, ' ').slice(0, 160)
async function reason(res: Response, jwt: string): Promise<string> {
  const t = await res.text().catch(() => '')
  let msg = t
  try {
    const j = JSON.parse(t) as { error?: unknown; message?: unknown; reason?: unknown; details?: unknown }
    const e = j.error as { reason?: string; details?: string; message?: string } | string | undefined
    msg = [typeof e === 'string' ? e : e?.reason ?? e?.message, typeof e === 'object' ? e?.details : undefined, j.message, j.reason, j.details]
      .filter((x) => typeof x === 'string' && x).join(': ')
  } catch { /* plain text */ }
  return `${res.status}${msg ? ' ' + clip(msg, jwt) : ''}`
}

export class PinError extends Error {}

/** Returns the CID. Throws PinError with a short, secret-free reason per attempt. */
export async function pinataUpload(bytes: string, filename: string, name: string, keyvalues: Record<string, string> = {}, env: NodeJS.ProcessEnv = process.env, f: typeof fetch = fetch): Promise<{ cid: string; via: 'v3' | 'legacy' }> {
  const jwt = pinataJwt(env)
  if (!jwt) throw new PinError('PINATA_JWT missing')
  const auth = { Authorization: `Bearer ${jwt}` }
  const errs: string[] = []
  try {
    const fd = new FormData()
    fd.set('file', new Blob([bytes], { type: 'application/json' }), filename)
    fd.set('network', 'public')
    fd.set('name', name)
    if (Object.keys(keyvalues).length) fd.set('keyvalues', JSON.stringify(keyvalues))
    const res = await f('https://uploads.pinata.cloud/v3/files', { method: 'POST', headers: auth, body: fd, signal: AbortSignal.timeout(15_000) })
    if (res.ok) {
      const j = (await res.json().catch(() => ({}))) as { data?: { cid?: string } }
      if (j.data?.cid) return { cid: j.data.cid, via: 'v3' }
      errs.push('v3 no cid')
    } else errs.push('v3 ' + (await reason(res, jwt)))
  } catch (e) { errs.push('v3 network ' + clip(String((e as Error).message ?? e), jwt)) }
  try {
    const fd = new FormData()
    fd.set('file', new Blob([bytes], { type: 'application/json' }), filename)
    fd.set('pinataMetadata', JSON.stringify({ name, keyvalues }))
    fd.set('pinataOptions', JSON.stringify({ cidVersion: 1 }))
    const res = await f('https://api.pinata.cloud/pinning/pinFileToIPFS', { method: 'POST', headers: auth, body: fd, signal: AbortSignal.timeout(15_000) })
    if (res.ok) {
      const j = (await res.json().catch(() => ({}))) as { IpfsHash?: string }
      if (j.IpfsHash) return { cid: j.IpfsHash, via: 'legacy' }
      errs.push('legacy no cid')
    } else errs.push('legacy ' + (await reason(res, jwt)))
  } catch (e) { errs.push('legacy network ' + clip(String((e as Error).message ?? e), jwt)) }
  throw new PinError(errs.join(' | '))
}
