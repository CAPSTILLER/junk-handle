/** CAPs Mind backup sign-in message (EIP-191 personal_sign, free, no gas). Built identically by the page and the server. */
export const BACKUP_MAX_TTL_S = 300
export const BACKUP_ACTIONS = ['download', 'restore', 'mysbase'] as const
export type BackupAction = (typeof BACKUP_ACTIONS)[number]
/** CAPs Mind key NFT on Base mainnet (same address caps-mind-prophecies reads). */
export const CAPS_MIND_KEY = '0x00635ca44339c7c194ef5bc87bf2cd6df04a666d' as const
export function backupMessage(p: { domain: string; address: string; action: BackupAction; nonce: string; expires: number }): string {
  return [
    'CAPs Mind backup',
    p.action === 'download'
      ? 'Sign to download a full backup of My Wally / CAPs Rocks server storage. Free, no gas, no transaction.'
      : p.action === 'restore'
        ? 'Sign to RESTORE a backup into My Wally / CAPs Rocks server storage. Free, no gas, no transaction.'
        : 'Sign in to Mysbase to upload private assets and save rooms. Free, no gas, no transaction.',
    `Action: ${p.action}`,
    `Domain: ${p.domain}`,
    `Address: ${p.address}`,
    `Nonce: ${p.nonce}`,
    `Expires: ${new Date(p.expires * 1000).toISOString()}`,
  ].join('\n')
}

/** Minimal STORE-only zip reader for our own backup zips (no compression, no zip64). */
export function readStoredZip(buf: Uint8Array): { name: string; data: Uint8Array }[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('Not a zip file')
  const count = dv.getUint16(eocd + 10, true)
  let p = dv.getUint32(eocd + 16, true)
  const out: { name: string; data: Uint8Array }[] = []
  const dec = new TextDecoder()
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Bad zip directory')
    const method = dv.getUint16(p + 10, true)
    const size = dv.getUint32(p + 20, true)
    const nameLen = dv.getUint16(p + 28, true), extra = dv.getUint16(p + 30, true), cmt = dv.getUint16(p + 32, true)
    const local = dv.getUint32(p + 42, true)
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen))
    if (method !== 0) throw new Error(`${name}: compressed entry. Use the original backup zip (don't re-zip it).`)
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true)
    out.push({ name, data: buf.subarray(start, start + size) })
    p += 46 + nameLen + extra + cmt
  }
  return out
}
