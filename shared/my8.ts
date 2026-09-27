/**
 * My Wally (MY8) — shared constants, ABI, EIP-712 types and trait encoding.
 * Imported by both the Vite app (src/) and the Vercel functions (api/).
 * No Node- or browser-only APIs here.
 */
import { keccak256, type Address, type Hex } from 'viem'

// ---------------------------------------------------------------- chain / contracts
export const MY8_CHAIN_ID = 8453 as const
export const MY8_CONTRACT: Address = '0x187a4f47bed10a12d2c12b15457884bfbbecc1ed'
export const FRLZ_TOKEN: Address = '0x02c1d787521C20586b4aB070b1838D91FF85D656'
export const FRLZ_DECIMALS = 18
export const BASESCAN = 'https://basescan.org'
export const PUBLIC_BASE_RPCS = [
  'https://mainnet.base.org',
  'https://base-rpc.publicnode.com',
  'https://base.llamarpc.com',
] as const

// ---------------------------------------------------------------- SERVER FEE CONFIG
/**
 * frlzAmount is chosen by the voucher signer (server), not fixed onchain.
 * The contract only requires frlzAmount > 0 and that it matches the signed voucher.
 * Mint fee → transferred to treasury. Update fee → burned (0x…dEaD).
 * Priced 2026-09-27 at ~$0.0000476/FRLZ: 100,000 FRLZ ≈ $4.76, 20,000 FRLZ ≈ $0.95.
 * Change these (whole FRLZ) and redeploy to re-price.
 */
export const MINT_FEE_FRLZ = 100_000n
export const UPDATE_FEE_FRLZ = 20_000n
export const MINT_FEE_WEI = MINT_FEE_FRLZ * 10n ** BigInt(FRLZ_DECIMALS)
export const UPDATE_FEE_WEI = UPDATE_FEE_FRLZ * 10n ** BigInt(FRLZ_DECIMALS)
export const VOUCHER_TTL_SECONDS = 15 * 60

// ---------------------------------------------------------------- EIP-712 (matches onchain typehashes)
export const EIP712_DOMAIN = {
  name: 'My Wally Studio',
  version: '1',
  chainId: MY8_CHAIN_ID,
  verifyingContract: MY8_CONTRACT,
} as const

/** MintVoucher(address user,bytes32 traitsHash,uint256 frlzAmount,uint256 validUntil,bytes32 nonce) */
export const MINT_VOUCHER_TYPES = {
  MintVoucher: [
    { name: 'user', type: 'address' },
    { name: 'traitsHash', type: 'bytes32' },
    { name: 'frlzAmount', type: 'uint256' },
    { name: 'validUntil', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const

/** UpdateVoucher(address user,uint256 tokenId,bytes32 traitsHash,uint256 frlzAmount,uint256 validUntil,bytes32 nonce) */
export const UPDATE_VOUCHER_TYPES = {
  UpdateVoucher: [
    { name: 'user', type: 'address' },
    { name: 'tokenId', type: 'uint256' },
    { name: 'traitsHash', type: 'bytes32' },
    { name: 'frlzAmount', type: 'uint256' },
    { name: 'validUntil', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const

// ---------------------------------------------------------------- ABI (reconstructed from bytecode; contract unverified)
const mintVoucherTuple = {
  name: 'v',
  type: 'tuple',
  components: [
    { name: 'user', type: 'address' },
    { name: 'traitsHash', type: 'bytes32' },
    { name: 'frlzAmount', type: 'uint256' },
    { name: 'validUntil', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
    { name: 'signature', type: 'bytes' },
  ],
} as const
const updateVoucherTuple = {
  name: 'v',
  type: 'tuple',
  components: [
    { name: 'user', type: 'address' },
    { name: 'tokenId', type: 'uint256' },
    { name: 'traitsHash', type: 'bytes32' },
    { name: 'frlzAmount', type: 'uint256' },
    { name: 'validUntil', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
    { name: 'signature', type: 'bytes' },
  ],
} as const

export const MY8_ABI = [
  { type: 'function', name: 'mint', stateMutability: 'nonpayable', inputs: [{ name: 'traits', type: 'bytes' }, mintVoucherTuple], outputs: [] },
  { type: 'function', name: 'updateModel', stateMutability: 'nonpayable', inputs: [{ name: 'tokenId', type: 'uint256' }, { name: 'traits', type: 'bytes' }, updateVoucherTuple], outputs: [] },
  { type: 'function', name: 'getTraits', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ name: '', type: 'bytes' }] },
  { type: 'function', name: 'ownerOf', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'tokenURI', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ name: '', type: 'string' }] },
  { type: 'function', name: 'usedNonces', stateMutability: 'view', inputs: [{ name: 'nonce', type: 'bytes32' }], outputs: [{ name: '', type: 'bool' }] },
  { type: 'function', name: 'oracleSigner', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'treasury', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'frlzToken', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'paused', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'bool' }] },
  { type: 'function', name: 'nextTokenId', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'baseURI', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] },
  { type: 'function', name: 'traitRegistryHash', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'bytes32' }] },
  { type: 'event', name: 'Transfer', inputs: [{ name: 'from', type: 'address', indexed: true }, { name: 'to', type: 'address', indexed: true }, { name: 'tokenId', type: 'uint256', indexed: true }] },
  { type: 'error', name: 'EnforcedPause', inputs: [] },
  { type: 'error', name: 'ERC721NonexistentToken', inputs: [{ name: 'tokenId', type: 'uint256' }] },
  { type: 'error', name: 'SafeERC20FailedOperation', inputs: [{ name: 'token', type: 'address' }] },
  { type: 'error', name: 'ReentrancyGuardReentrantCall', inputs: [] },
] as const

export const ERC20_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'o', type: 'address' }, { name: 's', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 's', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { type: 'error', name: 'ERC20InsufficientBalance', inputs: [{ name: 'sender', type: 'address' }, { name: 'balance', type: 'uint256' }, { name: 'needed', type: 'uint256' }] },
  { type: 'error', name: 'ERC20InsufficientAllowance', inputs: [{ name: 'spender', type: 'address' }, { name: 'allowance', type: 'uint256' }, { name: 'needed', type: 'uint256' }] },
] as const

// ---------------------------------------------------------------- trait encoding v1
/**
 * traits bytes (v1) = 4 bytes: [0x01 version][hair][skin][frame]
 * each slot: 0 = studio default (no texture), 1..10 = swatch index (order below).
 * traitsHash = keccak256(traits bytes). Custom names / lenses / transforms are NOT encoded.
 */
export const TRAITS_VERSION = 1
export const TRAITS_LENGTH = 4

export type SwatchRef = { id: string; label: string; color: string }
export const TRAIT_SLOTS = {
  hair: {
    label: 'Hair',
    defaultColor: '#3a2a22',
    options: [
      ['01-strands', '01 strands', '#2b1a13'], ['02-curls', '02 curls', '#4a1c11'],
      ['03-weave', '03 weave', '#3f2418'], ['04-crown', '04 crown', '#5f3924'],
      ['05-chevron', '05 chevron', '#44271a'], ['06-block', '06 block', '#4c2c1e'],
      ['07-dark-stripes', '07 dark stripes', '#2d170e'], ['08-waves', '08 waves', '#321a11'],
      ['09-swirl', '09 swirl', '#3a1f15'], ['10-highlight', '10 highlight', '#2d150e'],
    ].map(([id, label, color]) => ({ id, label, color })) as SwatchRef[],
  },
  skin: {
    label: 'Skin',
    defaultColor: '#c4a484',
    options: [
      ['01-hide', '01 hide', '#d6d6d5'], ['02-brick', '02 brick', '#d3d3d1'],
      ['03-mesh', '03 mesh', '#b1b1ad'], ['04-cracked', '04 cracked', '#cacac9'],
      ['05-wrinkle', '05 wrinkle', '#dadbdb'], ['06-porous', '06 porous', '#d5d6da'],
      ['07-plaster', '07 plaster', '#cdccce'], ['08-marble', '08 marble', '#c8cace'],
      ['09-bark', '09 bark', '#b0b1b3'], ['10-brick-wall', '10 brick wall', '#c3c3c6'],
    ].map(([id, label, color]) => ({ id, label, color })) as SwatchRef[],
  },
  frame: {
    label: 'Frame',
    defaultColor: '#6b4a3a',
    options: [
      ['01-haze', '01 haze', '#4d167e'], ['02-mottle', '02 mottle', '#5e246a'],
      ['03-brushed', '03 brushed', '#570282'], ['04-scuff', '04 scuff', '#5c0a40'],
      ['05-crushed', '05 crushed', '#7f44bf'], ['06-velvet', '06 velvet', '#7f35aa'],
      ['07-silk', '07 silk', '#6d1f63'], ['08-grain', '08 grain', '#43014f'],
      ['09-felt', '09 felt', '#4d034e'], ['10-fiber', '10 fiber', '#760176'],
    ].map(([id, label, color]) => ({ id, label, color })) as SwatchRef[],
  },
} as const
export type TraitSlot = keyof typeof TRAIT_SLOTS
export const TRAIT_ORDER: TraitSlot[] = ['hair', 'skin', 'frame']

/** Swatch ids per slot (null = studio default). */
export type StudioTraits = { hair: string | null; skin: string | null; frame: string | null }

function slotIndex(slot: TraitSlot, id: string | null): number {
  if (id === null) return 0
  const i = TRAIT_SLOTS[slot].options.findIndex((o) => o.id === id)
  if (i < 0) throw new Error(`Unknown ${slot} swatch "${id}"`)
  return i + 1
}

export function encodeTraits(t: StudioTraits): Hex {
  const bytes = [TRAITS_VERSION, ...TRAIT_ORDER.map((s) => slotIndex(s, t[s]))]
  return ('0x' + bytes.map((b) => b.toString(16).padStart(2, '0')).join('')) as Hex
}

/** Strict decode: throws on anything but a canonical v1 payload. */
export function decodeTraits(hex: string): StudioTraits {
  if (typeof hex !== 'string' || !/^0x[0-9a-fA-F]*$/.test(hex)) throw new Error('traits must be 0x-hex')
  const body = hex.slice(2)
  if (body.length !== TRAITS_LENGTH * 2) throw new Error(`traits must be exactly ${TRAITS_LENGTH} bytes`)
  const b = body.match(/../g)!.map((x) => parseInt(x, 16))
  if (b[0] !== TRAITS_VERSION) throw new Error(`unsupported traits version ${b[0]}`)
  const out = {} as StudioTraits
  TRAIT_ORDER.forEach((slot, k) => {
    const v = b[k + 1]
    const opts = TRAIT_SLOTS[slot].options
    if (v > opts.length) throw new Error(`${slot} index ${v} out of range 0..${opts.length}`)
    out[slot] = v === 0 ? null : opts[v - 1].id
  })
  return out
}

/** Canonical lower-case hex (so the hash is stable). */
export function normalizeTraits(hex: string): Hex {
  return encodeTraits(decodeTraits(hex))
}

export const traitsHash = (traits: Hex): Hex => keccak256(traits)

export function traitLabel(slot: TraitSlot, id: string | null): string {
  if (id === null) return 'Default'
  return TRAIT_SLOTS[slot].options.find((o) => o.id === id)?.label ?? id
}

export function traitColor(slot: TraitSlot, id: string | null): string {
  if (id === null) return TRAIT_SLOTS[slot].defaultColor
  return TRAIT_SLOTS[slot].options.find((o) => o.id === id)?.color ?? TRAIT_SLOTS[slot].defaultColor
}

// ---------------------------------------------------------------- owner-only download message
export const DOWNLOAD_MAX_AGE_SECONDS = 10 * 60
export const DOWNLOAD_GRANT_TTL_SECONDS = 15 * 60

export function buildDownloadMessage(p: { tokenId: string; address: string; domain: string; issuedAt: string }): string {
  return [
    'My Wally Studio: verify ownership to download (free, no transaction).',
    `Token: ${p.tokenId}`,
    `Owner: ${p.address.toLowerCase()}`,
    `Domain: ${p.domain}`,
    `Issued At: ${p.issuedAt}`,
  ].join('\n')
}

export function parseDownloadMessage(msg: string): { tokenId: string; address: string; domain: string; issuedAt: string } | null {
  const m = /^My Wally Studio: verify ownership to download \(free, no transaction\)\.\nToken: (\d{1,78})\nOwner: (0x[0-9a-f]{40})\nDomain: ([A-Za-z0-9.:-]{1,253})\nIssued At: (\S{10,40})$/.exec(msg)
  if (!m) return null
  return { tokenId: m[1], address: m[2], domain: m[3], issuedAt: m[4] }
}

/** Server attestation (EIP-191, signed by the oracle key) that unlocks client-side exporters. */
export function buildGrantMessage(p: { tokenId: string; address: string; traits: string; expiresAt: number }): string {
  return `MY8 download grant\nToken: ${p.tokenId}\nOwner: ${p.address.toLowerCase()}\nTraits: ${p.traits}\nExpires: ${p.expiresAt}`
}
