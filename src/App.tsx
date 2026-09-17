import { useMemo, useRef, useState } from 'react'
import type * as THREE from 'three'
import { Viewer } from './components/Viewer'
import { TransformPanel } from './components/TransformPanel'
import { TraitRail, type TraitKind } from './components/TraitRail'
import { TraitPickerOverlay } from './components/TraitPickerOverlay'
import { OwnershipCard } from './components/OwnershipCard'
import { DownloadsPanel } from './components/DownloadsPanel'
import { OnchainLater } from './components/OnchainLater'
import { useStudioState } from './hooks/useStudioState'
import type { GroupId } from './config/meshGroups'
import type { GroupTransform } from './hooks/useStudioState'
import { TEST_MODE_BANNER } from './config/contracts'
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

  const onTransformCommit = (g: GroupId, t: GroupTransform) => {
    studio.setTransform(g, t)
  }

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
          <h1>Realonez #8 Studio</h1>
          <p className="subtitle">Offline test app — rusted machine bay</p>
        </div>
        <div className="test-banner header-banner">{TEST_MODE_BANNER}</div>
      </header>

      <main className="layout">
        <div className="viewer-col">
          <Viewer
            transforms={studio.transforms}
            framesId={studio.framesId}
            lensesId={studio.lensesId}
            skinId={studio.skinId}
            hairId={studio.hairId}
            selectedGroup={studio.selectedGroup}
            interactionMode={studio.interactionMode}
            transformMode={transformMode}
            onTransformCommit={onTransformCommit}
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
          <OwnershipCard />
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
          <DownloadsPanel
            rootRef={rootRef}
            framesId={studio.framesId}
            lensesId={studio.lensesId}
            skinId={studio.skinId}
            hairId={studio.hairId}
            transforms={studio.transforms}
          />
          <OnchainLater />
        </aside>
      </main>

      <a
        className="gear-home-cutout"
        href="https://landonthis.gearup.wtf"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Gear home — landonthis"
      >
        <img src="/gear-logo-cutout.svg" alt="" height={56} width={213} />
      </a>
    </div>
  )
}
