import { useRef, useState } from 'react'
import type * as THREE from 'three'
import { Viewer } from './components/Viewer'
import { TransformPanel } from './components/TransformPanel'
import { TraitPanel } from './components/TraitPanel'
import { OwnershipCard } from './components/OwnershipCard'
import { DownloadsPanel } from './components/DownloadsPanel'
import { OnchainLater } from './components/OnchainLater'
import { useStudioState } from './hooks/useStudioState'
import type { GroupId } from './config/meshGroups'
import type { GroupTransform } from './hooks/useStudioState'
import { TEST_MODE_BANNER } from './config/contracts'
import './App.css'

export default function App() {
  const studio = useStudioState()
  const [transformMode, setTransformMode] = useState<
    'translate' | 'rotate' | 'scale'
  >('translate')
  const rootRef = useRef<THREE.Group | null>(null)

  const onTransformCommit = (g: GroupId, t: GroupTransform) => {
    studio.setTransform(g, t)
  }

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
          <TraitPanel
            framesId={studio.framesId}
            lensesId={studio.lensesId}
            skinId={studio.skinId}
            hairId={studio.hairId}
            onFrames={studio.setFramesId}
            onLenses={studio.setLensesId}
            onSkin={studio.setSkinId}
            onHair={studio.setHairId}
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
    </div>
  )
}
