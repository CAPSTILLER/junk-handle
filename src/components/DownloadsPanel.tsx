import { useMemo, useState, type MutableRefObject } from 'react'
import type * as THREE from 'three'
import type { GroupId } from '../config/meshGroups'
import type { GroupTransform } from '../hooks/useStudioState'
import {
  buildMockMetadata,
  downloadBundledAsset,
  parseRecoverableFromMetadata,
  triggerBrowserDownload,
} from '../services/mockNft'
import {
  exportEditedGlb,
  exportEditedObj,
  exportEditedStl,
  exportMetadataJson,
} from '../services/exporters'

type Props = {
  rootRef: MutableRefObject<THREE.Group | null>
  framesId: string | null
  lensesId: string
  skinId: string | null
  hairId: string | null
  transforms: Record<GroupId, GroupTransform>
}

export function DownloadsPanel({
  rootRef,
  framesId,
  lensesId,
  skinId,
  hairId,
  transforms,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const traits = useMemo(
    () => ({
      frames: framesId,
      lenses: lensesId,
      skin: skinId,
      hair: hairId,
    }),
    [framesId, lensesId, skinId, hairId],
  )

  const meta = useMemo(
    () =>
      buildMockMetadata(traits, transforms, [
        'realonez-8-edited.glb',
        'realonez-8-edited.obj',
        'realonez-8-edited.stl',
        'realonez-8-waldo.fbx (original only)',
      ]),
    [traits, transforms],
  )

  const run = async (key: string, fn: () => Promise<void> | void) => {
    setBusy(key)
    setMsg(null)
    try {
      await fn()
      setMsg(`Done: ${key}`)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const recoverFromMetadata = async () => {
    const files = parseRecoverableFromMetadata(meta)
    for (const f of files) {
      if (f.source === 'bundled' && f.url) {
        await downloadBundledAsset(f.url, f.filename)
      } else if (f.key === 'json') {
        triggerBrowserDownload(
          new Blob([JSON.stringify(meta, null, 2)], {
            type: 'application/json',
          }),
          f.filename,
        )
      } else if (f.key === 'obj' && rootRef.current) {
        exportEditedObj(rootRef.current)
      } else if (f.key === 'stl' && rootRef.current) {
        exportEditedStl(rootRef.current)
      }
    }
  }

  return (
    <section className="panel">
      <h2>Recover / Download</h2>
      <p className="hint">
        Local mock metadata only. Source GLB/FBX are real bundled bytes. FBX is
        original (no edited FBX exporter).
      </p>

      <button
        type="button"
        className="btn primary"
        disabled={!!busy}
        onClick={() => run('recover', recoverFromMetadata)}
      >
        Recover files from NFT metadata
      </button>

      <h3>Exports</h3>
      <div className="btn-col">
        <button
          type="button"
          className="btn"
          disabled={!!busy}
          onClick={() =>
            run('glb', async () => {
              if (!rootRef.current) throw new Error('Model not ready')
              await exportEditedGlb(rootRef.current)
            })
          }
        >
          Edited GLB
        </button>
        <button
          type="button"
          className="btn"
          disabled={!!busy}
          onClick={() =>
            run('obj', () => {
              if (!rootRef.current) throw new Error('Model not ready')
              exportEditedObj(rootRef.current)
            })
          }
        >
          Edited OBJ
        </button>
        <button
          type="button"
          className="btn"
          disabled={!!busy}
          onClick={() =>
            run('stl', () => {
              if (!rootRef.current) throw new Error('Model not ready')
              exportEditedStl(rootRef.current)
            })
          }
        >
          Edited STL
        </button>
        <button
          type="button"
          className="btn"
          disabled={!!busy}
          onClick={() =>
            run('fbx', () =>
              downloadBundledAsset(
                './assets/models/waldo-8.fbx',
                'realonez-8-waldo.fbx',
              ),
            )
          }
        >
          Original FBX
        </button>
        <button
          type="button"
          className="btn"
          disabled={!!busy}
          onClick={() =>
            run('json', () => exportMetadataJson(traits, transforms))
          }
        >
          Metadata JSON
        </button>
        <button
          type="button"
          className="btn"
          disabled={!!busy}
          onClick={() =>
            run('src-glb', () =>
              downloadBundledAsset(
                './assets/models/waldo-8.glb',
                'realonez-8-waldo.glb',
              ),
            )
          }
        >
          Source GLB
        </button>
      </div>

      <details className="meta-preview">
        <summary>Mock metadata preview</summary>
        <pre>{JSON.stringify(meta, null, 2)}</pre>
      </details>
      {msg && <p className="status">{msg}</p>}
    </section>
  )
}
