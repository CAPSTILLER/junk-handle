/**
 * Modular interface for a future live onchain integration.
 * Intentionally disabled — no RPC, wallet, or approvals in this offline test build.
 */
import {
  FORLZ_TOKEN_CONTRACT,
  REALONEZ_NFT_CONTRACT,
  TOKEN_ID,
} from '../config/contracts'

export type OnchainService = {
  enabled: boolean
  connectWallet: () => Promise<never>
  readOwnership: () => Promise<never>
  mintOrPay: () => Promise<never>
  approveForlz: () => Promise<never>
}

const disabled = async (): Promise<never> => {
  throw new Error('Live onchain disabled in offline TEST MODE')
}

export const onchainService: OnchainService = {
  enabled: false,
  connectWallet: disabled,
  readOwnership: disabled,
  mintOrPay: disabled,
  approveForlz: disabled,
}

export const LIVE_PLACEHOLDERS = {
  nftContract: REALONEZ_NFT_CONTRACT,
  forlzContract: FORLZ_TOKEN_CONTRACT,
  tokenId: TOKEN_ID,
  notes: [
    'Wallet connect UI (inactive)',
    'Chain ownership read (inactive)',
    'FORLZ fee / approval flow (inactive)',
    'Mint / write txs (inactive)',
  ],
} as const
