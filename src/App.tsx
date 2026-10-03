import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type * as THREE from 'three'
import { Viewer } from './components/Viewer'
import { TransformPanel } from './components/TransformPanel'
import { TraitRail, type TraitKind } from './components/TraitRail'
import { TraitPickerOverlay } from './components/TraitPickerOverlay'
import { DownloadsPanel } from './components/DownloadsPanel'
import { WalletPanel } from './components/WalletPanel'
import { fetchDesign, saveDesignWithGrant, uploadMedia, type DownloadGrant, type MediaTicket } from './services/my8'
import { buildEditedGlb, renderSnapshotPng } from './services/exporters'
import { defaultDesign, type Design } from '../shared/design'
import type { StudioTraits } from '../shared/my8'
import { useStudioState } from './hooks/useStudioState'
import { LENS_SHADES } from './config/lenses'
import {
  FRAME_SWATCHES,
  HAIR_SWATCHES,
  SKIN_SWATCHES,
} from './config/swatches'
import './App.css'

const FALLBACK = {
  frames: '#6b4a3a',
  lenses: LENS_SHADES.find((s) => s.id === 'g4')?.color ?? '#02cc00',
  skin: '#c4a484',
  hair: '#3a2a22',
}

export default function App() {
  const studio = useStudioState()
  const [transformMode, setTransformMode] = useState<
    'translate' | 'rotate' | 'scale'
  >('translate')
  const [picker, setPicker] = useState<TraitKind | null>(null)
  const rootRef = useRef<THREE.Group | null>(null)
  const [grant, setGrant] = useState<DownloadGrant | null>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(t)
  }, [])

  const studioTraits: StudioTraits = useMemo(
    () => ({ hair: studio.hairId, skin: studio.skinId, frame: studio.framesId }),
    [studio.hairId, studio.skinId, studio.framesId],
  )
  const { setHairId, setSkinId, setFramesId, setLensesId, loadTransforms } = studio
  /** Full design = everything the studio lets you edit (stored per token for recall). */
  const design: Design = useMemo(
    () => ({ v: 1, traits: studioTraits, lensesId: studio.lensesId, transforms: studio.transforms }),
    [studioTraits, studio.lensesId, studio.transforms],
  )
  const loadDesign = useCallback(
    (d: Design) => {
      setHairId(d.traits.hair)
      setSkinId(d.traits.skin)
      setFramesId(d.traits.frame)
      setLensesId(d.lensesId)
      loadTransforms(d.transforms)
    },
    [setHairId, setSkinId, setFramesId, setLensesId, loadTransforms],
  )
  /** Recall the verified token: saved design, else its onchain traits with default positions. */
  const recallGranted = useCallback(async (): Promise<string> => {
    if (!grant) throw new Error('Unlock downloads for a token first')
    const saved = await fetchDesign(grant.tokenId)
    loadDesign(saved ?? defaultDesign(grant.traits))
    return saved ? `Recalled #${grant.tokenId} exactly as saved.` : `No saved design for #${grant.tokenId} yet: loaded onchain traits with default positions.`
  }, [grant, loadDesign])
  /** Best-effort: render PNG + export GLB of the studio as shown and upload them for OpenSea. Returns a warning or null. */
  const publishMedia = useCallback(async (t: MediaTicket | null | undefined): Promise<string | null> => {
    if (!t) return 'Marketplace image not updated (no upload ticket).'
    try {
      if (!rootRef.current) throw new Error('model not ready')
      const png = await renderSnapshotPng(rootRef.current)
      const glb = await buildEditedGlb(rootRef.current)
      await uploadMedia(t, png, glb)
      return null
    } catch (e) {
      console.warn('[media] upload failed', e)
      return `Marketplace image/3D model not uploaded: ${e instanceof Error ? e.message : String(e)}. Use "Save current design" to retry.`
    }
  }, [])
  const saveGranted = useCallback(async (): Promise<string> => {
    if (!grant) throw new Error('Unlock downloads for a token first')
    const ticket = await saveDesignWithGrant(grant, design)
    const warn = await publishMedia(ticket)
    return `Saved current design to #${grant.tokenId}. It will recall like this on any device.` +
      (warn ? ` ⚠ ${warn}` : ' Marketplace image + 3D model updated (OpenSea: Refresh metadata).')
  }, [grant, design, publishMedia])
  // Owner-only downloads: unlocked only for a verified owner, and only while the studio shows that token's onchain traits.
  const downloadLock = !grant
    ? 'Downloads are for verified owners. Connect your wallet and tap “Unlock downloads” on a My Wally you own.'
    : grant.expiresAt * 1000 < now
      ? 'Ownership check expired — tap “Unlock downloads” again.'
      : grant.traits.hair !== studioTraits.hair ||
          grant.traits.skin !== studioTraits.skin ||
          grant.traits.frame !== studioTraits.frame
        ? `Studio differs from #${grant.tokenId}'s onchain traits. Restore them to download.`
        : null

  const railItems = useMemo(() => {
    const frameSwatch =
      FRAME_SWATCHES.find((s) => s.id === studio.framesId) ?? FRAME_SWATCHES[0]
    const lensColor =
      LENS_SHADES.find((s) => s.id === studio.lensesId)?.color ?? FALLBACK.lenses
    const skinSwatch =
      SKIN_SWATCHES.find((s) => s.id === studio.skinId) ?? SKIN_SWATCHES[0]
    const hairSwatch =
      HAIR_SWATCHES.find((s) => s.id === studio.hairId) ?? HAIR_SWATCHES[0]
    return [
      {
        kind: 'frames' as const,
        label: 'Frames',
        color: frameSwatch?.color ?? FALLBACK.frames,
        imageUrl: frameSwatch?.url,
      },
      {
        kind: 'lenses' as const,
        label: 'Lenses',
        color: lensColor,
      },
      {
        kind: 'skin' as const,
        label: 'Skin',
        color: skinSwatch?.color ?? FALLBACK.skin,
        imageUrl: skinSwatch?.url,
      },
      {
        kind: 'hair' as const,
        label: 'Hair',
        color: hairSwatch?.color ?? FALLBACK.hair,
        imageUrl: hairSwatch?.url,
      },
    ]
  }, [studio.framesId, studio.lensesId, studio.skinId, studio.hairId])

  const pickerConfig = useMemo(() => {
    if (!picker) return null
    switch (picker) {
      case 'frames':
        return {
          kind: 'frames' as const,
          title: 'Frames',
          options: FRAME_SWATCHES.map((s) => ({
            id: s.id,
            label: s.label,
            color: s.color,
            imageUrl: s.url,
          })),
          selectedId: studio.framesId,
          onSelect: (id: string) => studio.setFramesId(id),
        }
      case 'lenses':
        return {
          kind: 'lenses' as const,
          title: 'Lenses',
          options: LENS_SHADES.map((s) => ({
            id: s.id,
            label: s.label,
            color: s.color,
          })),
          selectedId: studio.lensesId,
          onSelect: (id: string) => studio.setLensesId(id),
        }
      case 'skin':
        return {
          kind: 'skin' as const,
          title: 'Skin',
          options: SKIN_SWATCHES.map((s) => ({
            id: s.id,
            label: s.label,
            color: s.color,
            imageUrl: s.url,
          })),
          selectedId: studio.skinId,
          onSelect: (id: string) => studio.setSkinId(id),
        }
      case 'hair':
        return {
          kind: 'hair' as const,
          title: 'Hair',
          options: HAIR_SWATCHES.map((s) => ({
            id: s.id,
            label: s.label,
            color: s.color,
            imageUrl: s.url,
          })),
          selectedId: studio.hairId,
          onSelect: (id: string) => studio.setHairId(id),
        }
    }
  }, [
    picker,
    studio.framesId,
    studio.lensesId,
    studio.skinId,
    studio.hairId,
    studio.setFramesId,
    studio.setLensesId,
    studio.setSkinId,
    studio.setHairId,
  ])

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>My Wally Studio</h1>
          <p className="subtitle">Build, mint and revise your My Wally on Base</p>
        </div>
      </header>

      <main className="layout">
        <div className="viewer-col">
          <Viewer
            transforms={studio.transforms}
            framesId={studio.framesId}
            lensesId={studio.lensesId}
            skinId={studio.skinId}
            hairId={studio.hairId}
            interactionMode={studio.interactionMode}
            rootRef={rootRef}
          />
          <TraitRail items={railItems} onOpen={setPicker} />
          {pickerConfig && (
            <TraitPickerOverlay
              kind={pickerConfig.kind}
              title={pickerConfig.title}
              options={pickerConfig.options}
              selectedId={pickerConfig.selectedId}
              onSelect={pickerConfig.onSelect}
              onClose={() => setPicker(null)}
            />
          )}
        </div>

        <aside className="side">
          <TransformPanel
            selectedGroup={studio.selectedGroup}
            interactionMode={studio.interactionMode}
            transformMode={transformMode}
            transforms={studio.transforms}
            onSelectGroup={studio.setSelectedGroup}
            onMode={studio.setInteractionMode}
            onTransformMode={setTransformMode}
            onSetTransform={studio.setTransform}
            onReset={studio.resetTransform}
            onResetAll={studio.resetAllTransforms}
          />
          <WalletPanel
            traits={studioTraits}
            design={design}
            onLoadDesign={loadDesign}
            onPublishMedia={publishMedia}
            onGrant={setGrant}
            grant={grant}
          />
          <DownloadsPanel
            rootRef={rootRef}
            framesId={studio.framesId}
            lensesId={studio.lensesId}
            skinId={studio.skinId}
            hairId={studio.hairId}
            transforms={studio.transforms}
            lock={downloadLock}
            grantTokenId={grant?.tokenId ?? null}
            onRecall={grant ? recallGranted : undefined}
            onSaveDesign={grant ? saveGranted : undefined}
          />
        </aside>
      </main>

      <a
        className="gear-home-cutout"
        href="https://landonthis.gearup.wtf"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Gear home — landonthis"
      >
        <img src="/gear-logo-cutout.png" alt="" height={56} width={213} />
      </a>
    </div>
  )
}
