/** Wallet Gear v3 (Base mainnet). tokenId = uint160(minter). Shared by the /gear page and the API. */
export const GEAR_CONTRACT = '0xfeea9d53fd97cacb7ab0e8ec1037a89c5f034df2' as const
export const GEAR_DESK = '0x6b05415f46f7adde0b9b343726257ebe34757374' as const
export const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const
/** Canonical site. The same deploy also answers on the legacy domain (GEAR_SITES), so either works. */
export const GEAR_SITE = 'https://myassets.gearup.wtf'
export const GEAR_SITES = ['myassets.gearup.wtf', 'mywally.gearup.wtf'] as const
export const GEAR_BASE_URI = `${GEAR_SITE}/api/gear/meta/`
export const GEAR_ABI = [
  { type: 'function', name: 'paused', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'mintPrice', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'totalMinted', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'hasMinted', stateMutability: 'view', inputs: [{ name: 'wallet', type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'ownerOf', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'teethOf', stateMutability: 'pure', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'mint', stateMutability: 'nonpayable', inputs: [], outputs: [{ name: 'tokenId', type: 'uint256' }] },
] as const
export const ERC20_ABI = [
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'o', type: 'address' }, { name: 's', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 's', type: 'address' }, { name: 'v', type: 'uint256' }], outputs: [{ type: 'bool' }] },
] as const
export const tokenIdOf = (addr: string): bigint => BigInt(addr.toLowerCase())
export const addrOfToken = (id: bigint): string => '0x' + id.toString(16).padStart(40, '0')

/** Holder GLB download sign-in message (free signature, no gas). Built identically by page and server. */
export const GLB_MAX_TTL_S = 300
export function glbMessage(p: { domain: string; address: string; tokenId: string; expires: number }): string {
  return ['Wallet Gear GLB download', 'Sign to prove you hold this gear. Free, no gas, no transaction.', `Domain: ${p.domain}`, `Address: ${p.address}`, `Token: ${p.tokenId}`, `Expires: ${new Date(p.expires * 1000).toISOString()}`].join('\n')
}
