/** Holder-only download sign-in message (free signature, no gas). Built identically by the app and the server. */
export const DOWNLOAD_MAX_TTL_S = 300
export const DOWNLOAD_FORMATS = ['glb', 'stl', 'rig'] as const // rig = unposed rigged GLB for the holder's pose editor
export type DownloadFormat = (typeof DOWNLOAD_FORMATS)[number]
export function downloadMessage(p: { domain: string; address: string; tokenId: string; nonce: string; expires: number }): string {
  return [
    'CAPs Rocks download',
    'Sign to prove you hold this rock. Free, no gas, no transaction.',
    `Domain: ${p.domain}`,
    `Address: ${p.address}`,
    `Token: ${p.tokenId}`,
    `Nonce: ${p.nonce}`,
    `Expires: ${new Date(p.expires * 1000).toISOString()}`,
  ].join('\n')
}
