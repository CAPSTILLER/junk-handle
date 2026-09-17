import {
  FORLZ_TOKEN_CONTRACT,
  MOCK_WALLET,
  REALONEZ_NFT_CONTRACT,
  TOKEN_ID,
} from '../config/contracts'
import type { GroupId } from '../config/meshGroups'
import type { Vec3 } from '../hooks/useStudioState'

export type RecoverableFile = {
  key: string
  label: string
  mime: string
  /** Relative public URL for bundled source bytes, or 'generated' for runtime exports */
  source: 'bundled' | 'generated'
  url?: string
  filename: string
}

export type StudioTraitsSnapshot = {
  frames: string | null
  lenses: string
  skin: string | null
  hair: string | null
}

export type StudioTransformsSnapshot = Record<
  GroupId,
  { position: Vec3; rotation: Vec3; scale: Vec3 }
>

export type MockMetadata = {
  name: string
  description: string
  testMode: true
  tokenId: number
  contract: string
  forlzContract: string
  owner: string
  status: 'Owned (simulated)'
  sourceFiles: {
    glb: string
    fbx: string
  }
  traits: StudioTraitsSnapshot
  transforms: StudioTransformsSnapshot
  recoverable: RecoverableFile[]
  exports: string[]
  generatedAt: string
}

const BUNDLED_GLB = './assets/models/waldo-8.glb'
const BUNDLED_FBX = './assets/models/waldo-8.fbx'

export const RECOVERABLE_CATALOG: RecoverableFile[] = [
  {
    key: 'glb',
    label: 'Source GLB',
    mime: 'model/gltf-binary',
    source: 'bundled',
    url: BUNDLED_GLB,
    filename: 'realonez-8-waldo.glb',
  },
  {
    key: 'fbx',
    label: 'Original FBX',
    mime: 'application/octet-stream',
    source: 'bundled',
    url: BUNDLED_FBX,
    filename: 'realonez-8-waldo.fbx',
  },
  {
    key: 'obj',
    label: 'OBJ (exported)',
    mime: 'text/plain',
    source: 'generated',
    filename: 'realonez-8-edited.obj',
  },
  {
    key: 'stl',
    label: 'STL (exported)',
    mime: 'application/sla',
    source: 'generated',
    filename: 'realonez-8-edited.stl',
  },
  {
    key: 'json',
    label: 'Metadata JSON',
    mime: 'application/json',
    source: 'generated',
    filename: 'realonez-8-metadata.json',
  },
]

export function buildMockMetadata(
  traits: StudioTraitsSnapshot,
  transforms: StudioTransformsSnapshot,
  exportNames: string[],
): MockMetadata {
  return {
    name: 'Realonez #8',
    description:
      'Offline TEST MODE metadata for Realonez #8 Studio. Deterministic mock ownership — no chain reads.',
    testMode: true,
    tokenId: TOKEN_ID,
    contract: REALONEZ_NFT_CONTRACT,
    forlzContract: FORLZ_TOKEN_CONTRACT,
    owner: MOCK_WALLET,
    status: 'Owned (simulated)',
    sourceFiles: {
      glb: 'waldo-8.glb',
      fbx: 'waldo-8.fbx',
    },
    traits,
    transforms,
    recoverable: RECOVERABLE_CATALOG,
    exports: exportNames,
    generatedAt: new Date().toISOString(),
  }
}

export function parseRecoverableFromMetadata(meta: MockMetadata): RecoverableFile[] {
  if (!meta || !Array.isArray(meta.recoverable)) {
    throw new Error('Invalid metadata: missing recoverable[]')
  }
  return meta.recoverable.map((f) => ({ ...f }))
}

export function triggerBrowserDownload(
  blob: Blob,
  filename: string,
): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2500)
}

export async function downloadBundledAsset(
  url: string,
  filename: string,
): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)
  const buf = await res.arrayBuffer()
  const blob = new Blob([buf])
  triggerBrowserDownload(blob, filename)
}

export const ownedNftCard = {
  name: 'Realonez #8',
  tokenId: TOKEN_ID,
  contract: REALONEZ_NFT_CONTRACT,
  status: 'Owned (simulated)' as const,
  owner: MOCK_WALLET,
}
