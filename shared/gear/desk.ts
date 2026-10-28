/** GearTradeDesk v2 ABI (Base mainnet 0x6b05…7374). Copied from wallet-gear-contracts/src/GearTradeDesk.sol — only real functions. */
export const GEAR_DESK_DEPLOY_BLOCK = 53113553n
export const GEAR_NFT_DEPLOY_BLOCK = 53113538n
export const GEAR_TOKEN = '0x5880cD05605A549f1DAb01a53ca61Ee559244bD1' as const
const offerT = { type: 'tuple', components: [
  { name: 'offerer', type: 'address' }, { name: 'createdAt', type: 'uint64' }, { name: 'closedAt', type: 'uint64' }, { name: 'status', type: 'uint8' },
  { name: 'paid', type: 'uint256' }, { name: 'winningBid', type: 'uint256' }, { name: 'gears', type: 'uint256[]' }, { name: 'bidIds', type: 'uint256[]' }] } as const
const bidT = { type: 'tuple', components: [
  { name: 'offerId', type: 'uint256' }, { name: 'taker', type: 'address' }, { name: 'createdAt', type: 'uint64' }, { name: 'status', type: 'uint8' },
  { name: 'paid', type: 'uint256' }, { name: 'gears', type: 'uint256[]' }] } as const
const u = (name: string) => ({ name, type: 'uint256' }) as const
const ids = { name: 'tokenIds', type: 'uint256[]' } as const
export const DESK_ABI = [
  { type: 'function', name: 'createOffer', stateMutability: 'nonpayable', inputs: [ids], outputs: [u('offerId')] },
  { type: 'function', name: 'cancelOffer', stateMutability: 'nonpayable', inputs: [u('offerId')], outputs: [] },
  { type: 'function', name: 'acceptBid', stateMutability: 'nonpayable', inputs: [u('offerId'), u('bidId')], outputs: [] },
  { type: 'function', name: 'placeBid', stateMutability: 'nonpayable', inputs: [u('offerId'), ids], outputs: [u('bidId')] },
  { type: 'function', name: 'withdrawBid', stateMutability: 'nonpayable', inputs: [u('bidId')], outputs: [] },
  { type: 'function', name: 'buyFromBin', stateMutability: 'nonpayable', inputs: [u('tokenId')], outputs: [] },
  { type: 'function', name: 'sellToHouse', stateMutability: 'nonpayable', inputs: [ids], outputs: [] },
  { type: 'function', name: 'buyPurchased', stateMutability: 'nonpayable', inputs: [u('tokenId')], outputs: [] },
  { type: 'function', name: 'paused', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'payoutOf', stateMutability: 'view', inputs: [u('tokenId')], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'purchasedPriceOf', stateMutability: 'view', inputs: [u('tokenId')], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'purchasedCount', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'purchasedTokens', stateMutability: 'view', inputs: [u('start'), u('count')], outputs: [{ type: 'uint256[]' }] },
  { type: 'function', name: 'vaultAvailable', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'offerExpiry', stateMutability: 'view', inputs: [u('offerId')], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'bidDeadline', stateMutability: 'view', inputs: [u('bidId')], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'inBin', stateMutability: 'view', inputs: [u('tokenId')], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'offerCount', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'bidCount', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'getOffer', stateMutability: 'view', inputs: [u('offerId')], outputs: [offerT] },
  { type: 'function', name: 'getBid', stateMutability: 'view', inputs: [u('bidId')], outputs: [bidT] },
  { type: 'function', name: 'bidIdsOf', stateMutability: 'view', inputs: [{ name: 'user', type: 'address' }], outputs: [{ type: 'uint256[]' }] },
  { type: 'function', name: 'getOffers', stateMutability: 'view', inputs: [u('start'), u('count')], outputs: [{ type: 'tuple[]', components: offerT.components }] },
  { type: 'function', name: 'getBidsForOffer', stateMutability: 'view', inputs: [u('offerId'), u('start'), u('count')], outputs: [{ type: 'tuple[]', components: bidT.components }] },
  { type: 'function', name: 'binTokensFromOffers', stateMutability: 'view', inputs: [u('start'), u('count')], outputs: [{ name: 'out', type: 'uint256[]' }, u('found')] },
  { type: 'function', name: 'binTokens', stateMutability: 'view', inputs: [u('start'), u('count')], outputs: [{ name: 'out', type: 'uint256[]' }, u('found')] },
] as const
export const NFT_ABI = [
  { type: 'function', name: 'ownerOf', stateMutability: 'view', inputs: [u('tokenId')], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'teethOf', stateMutability: 'pure', inputs: [u('tokenId')], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'isApprovedForAll', stateMutability: 'view', inputs: [{ name: 'o', type: 'address' }, { name: 'op', type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'setApprovalForAll', stateMutability: 'nonpayable', inputs: [{ name: 'op', type: 'address' }, { name: 'ok', type: 'bool' }], outputs: [] },
  { type: 'event', name: 'Transfer', inputs: [{ name: 'from', type: 'address', indexed: true }, { name: 'to', type: 'address', indexed: true }, { name: 'tokenId', type: 'uint256', indexed: true }] },
] as const
export const OFFER_STATUS = ['None', 'Open', 'Pulled out', 'Finalized'] as const
export const BID_STATUS = ['None', 'Open', 'Pulled out', 'Won'] as const
