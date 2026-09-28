import { getAddress } from 'viem'
import { MY8_ABI, MY8_CONTRACT } from '../shared/my8.js'
import { client, handle } from './_lib/server.js'
import { privateKeyToAccount } from 'viem/accounts'
import { storageConfigured } from './_lib/store.js'

/** GET /api/status → paused, whether the server signer is configured and matches oracleSigner. */
export default handle(['GET'], async () => {
  const [paused, oracleSigner, nextTokenId] = await Promise.all([
    client.readContract({ address: MY8_CONTRACT, abi: MY8_ABI, functionName: 'paused' }),
    client.readContract({ address: MY8_CONTRACT, abi: MY8_ABI, functionName: 'oracleSigner' }),
    client.readContract({ address: MY8_CONTRACT, abi: MY8_ABI, functionName: 'nextTokenId' }),
  ])
  let signer: 'missing' | 'mismatch' | 'ok' = 'missing'
  const raw = (process.env.VOUCHER_SIGNER_KEY ?? '').trim()
  if (raw) {
    try {
      const a = privateKeyToAccount((raw.startsWith('0x') ? raw : '0x' + raw) as `0x${string}`)
      signer = getAddress(a.address) === getAddress(oracleSigner) ? 'ok' : 'mismatch'
    } catch {
      signer = 'mismatch'
    }
  }
  return {
    paused,
    oracleSigner,
    signer,
    nextTokenId: nextTokenId.toString(),
    designStorage: storageConfigured() ? 'ok' : 'missing',
  }
})
