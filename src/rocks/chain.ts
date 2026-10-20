/** CAPs Rocks client-side chain access (reads via public RPCs; writes via the connected wallet). */
import { createPublicClient, createWalletClient, custom, fallback, http, type Address, type Hash } from 'viem'
import { base } from 'viem/chains'
import { CAPS_ROCKS, CAPS_ROCKS_ABI, PROPHECY_TABLETS, TABLETS_ABI } from '../../shared/capsRocks'
import { wallet } from './wallet'

const devRpc = (import.meta.env.VITE_ROCKS_RPC as string | undefined) || ''
const rpcs = devRpc ? [devRpc] : ['https://mainnet.base.org', 'https://base-rpc.publicnode.com', 'https://base.llamarpc.com']
export const pub = createPublicClient({ chain: base, transport: fallback(rpcs.map((u) => http(u, { timeout: 10_000, retryCount: 1 }))), batch: { multicall: true } })
export const rocks = { address: CAPS_ROCKS as Address, abi: CAPS_ROCKS_ABI } as const
export const tablets = { address: PROPHECY_TABLETS as Address, abi: TABLETS_ABI } as const

export async function walletClient() {
  const eth = wallet.provider()
  const account = wallet.state.account
  if (!eth || !account) throw new Error('Connect your wallet first.')
  if (!(await wallet.ensureBase())) throw new Error('Switch your wallet to Base and try again.')
  return createWalletClient({ chain: base, transport: custom(eth), account })
}

/** Simulate first (clear revert reasons), then send. */
export async function write(fn: string, args: readonly unknown[], target: { address: Address; abi: readonly unknown[] } = rocks): Promise<Hash> {
  const wc = await walletClient()
  const sim = await pub.simulateContract({ address: target.address, abi: target.abi as never, functionName: fn as never, args: args as never, account: wc.account! })
  return wc.writeContract(sim.request as never)
}
export const waitTx = (hash: Hash) => pub.waitForTransactionReceipt({ hash, timeout: 180_000 })

/** All prophecy tablets held by `owner` (ownerOf over 1..totalSupply, batched via multicall). */
export async function tabletsOf(owner: Address): Promise<{ id: bigint; prophecy: bigint }[]> {
  // burned tablets lower totalSupply, so scan a little past it (one id per rock forged so far)
  const [supply, forged] = await Promise.all([
    pub.readContract({ ...tablets, functionName: 'totalSupply' }),
    pub.readContract({ ...rocks, functionName: 'totalMinted' }).catch(() => 0n),
  ])
  const total = supply + forged
  const ids = Array.from({ length: Number(total) }, (_, i) => BigInt(i + 1))
  const owners = await Promise.all(ids.map((id) => pub.readContract({ ...tablets, functionName: 'ownerOf', args: [id] }).catch(() => null)))
  const mine = ids.filter((_, i) => owners[i]?.toLowerCase() === owner.toLowerCase())
  const prophecies = await Promise.all(mine.map((id) => pub.readContract({ ...tablets, functionName: 'tabletOf', args: [id] }).catch(() => 0n)))
  return mine.map((id, i) => ({ id, prophecy: prophecies[i] }))
}

/** Rocks currently held by `owner` (ownerOf over 1..totalMinted; supply is small). */
export async function rocksOf(owner: Address): Promise<bigint[]> {
  const total = await pub.readContract({ ...rocks, functionName: 'totalMinted' })
  const ids = Array.from({ length: Number(total) }, (_, i) => BigInt(i + 1))
  const owners = await Promise.all(ids.map((id) => pub.readContract({ ...rocks, functionName: 'ownerOf', args: [id] }).catch(() => null)))
  return ids.filter((_, i) => owners[i]?.toLowerCase() === owner.toLowerCase())
}
