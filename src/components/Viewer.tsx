import { Suspense, useRef, useState, type MutableRefObject } from 'react'
import { Canvas } from '@react-three/fiber'
import { ContactShadows, OrbitControls, TransformControls } from '@react-three/drei'
import * as THREE from 'three'
import type { GroupId } from '../config/meshGroups'
import type { GroupTransform } from '../hooks/useStudioState'
import { WaldoModel } from './WaldoModel'

export type ViewerProps = {
  transforms: Record<GroupId, GroupTransform>
  framesId: string | null
  lensesId: string
  skinId: string | null
  hairId: string | null
  selectedGroup: GroupId
  interactionMode: 'orbit' | 'edit'
  transformMode: 'translate' | 'rotate' | 'scale'
  onTransformCommit: (g: GroupId, t: GroupTransform) => void
  rootRef: MutableRefObject<THREE.Group | null>
}

export function Viewer({
  transforms,
  framesId,
  lensesId,
  skinId,
  hairId,
  selectedGroup,
  interactionMode,
  transformMode,
  onTransformCommit,
  rootRef,
}: ViewerProps) {
  const groupRefs = useRef<Record<GroupId, THREE.Group | null>>({
    body: null,
    glasses: null,
    hair: null,
  })
  const [orbitEnabled, setOrbitEnabled] = useState(true)
  const [groupsReady, setGroupsReady] = useState(0)
  const selectedObj = groupsReady > 0 ? groupRefs.current[selectedGroup] : null

  return (
    <div className="viewer-shell">
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
        camera={{ position: [20, 12, 28], fov: 40, near: 0.1, far: 500 }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.85} />
        <directionalLight position={[12, 18, 10]} intensity={1.15} castShadow />
        <directionalLight position={[-10, 6, -8]} intensity={0.35} />
        <hemisphereLight args={['#f0e6d8', '#3a2f28', 0.45]} />

        <Suspense fallback={null}>
          <WaldoModel
            transforms={transforms}
            framesId={framesId}
            lensesId={lensesId}
            skinId={skinId}
            hairId={hairId}
            groupRefs={groupRefs}
            rootRef={rootRef}
            onReady={() => setGroupsReady((n) => n + 1)}
          />
          <ContactShadows
            opacity={0.35}
            scale={40}
            blur={2.2}
            far={20}
            resolution={256}
            color="#1a120c"
          />
        </Suspense>

        {interactionMode === 'edit' && selectedObj && (
          <TransformControls
            object={selectedObj}
            mode={transformMode}
            size={0.85}
            onMouseDown={() => setOrbitEnabled(false)}
            onMouseUp={() => {
              setOrbitEnabled(true)
              const o = selectedObj
              onTransformCommit(selectedGroup, {
                position: [o.position.x, o.position.y, o.position.z],
                rotation: [o.rotation.x, o.rotation.y, o.rotation.z],
                scale: [o.scale.x, o.scale.y, o.scale.z],
              })
            }}
          />
        )}

        <OrbitControls
          makeDefault
          enabled={interactionMode === 'orbit' || orbitEnabled}
          enableDamping
          dampingFactor={0.08}
          rotateSpeed={0.7}
          zoomSpeed={0.85}
          panSpeed={0.55}
          minDistance={2}
          maxDistance={120}
        />
      </Canvas>
    </div>
  )
}
