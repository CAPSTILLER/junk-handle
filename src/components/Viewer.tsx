import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { TransformControls } from '@react-three/drei'
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

/** Cap DPR for phones / high-DPI browsers — full 2x is too heavy. */
function cappedDpr(): number {
  if (typeof window === 'undefined') return 1
  return Math.min(window.devicePixelRatio || 1, 1.5)
}

/** Model turntable: drag spins the figure; wheel dollies camera distance. */
function TurntableControls({
  rootRef,
  enabled,
  lookAtRef,
}: {
  rootRef: MutableRefObject<THREE.Group | null>
  enabled: boolean
  lookAtRef: MutableRefObject<THREE.Vector3>
}) {
  const { camera, gl } = useThree()
  const dragging = useRef(false)
  const last = useRef({ x: 0, y: 0 })
  const vel = useRef({ y: 0, x: 0 })
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  useFrame((_, dt) => {
    if (!enabledRef.current || dragging.current) return
    const root = rootRef.current
    if (!root) return
    const damp = Math.pow(0.92, dt * 60)
    if (Math.abs(vel.current.y) > 1e-5 || Math.abs(vel.current.x) > 1e-5) {
      root.rotation.y += vel.current.y
      root.rotation.x = THREE.MathUtils.clamp(
        root.rotation.x + vel.current.x,
        -0.45,
        0.45,
      )
      vel.current.y *= damp
      vel.current.x *= damp
    }
  })

  useEffect(() => {
    const el = gl.domElement

    const onPointerDown = (e: PointerEvent) => {
      if (!enabledRef.current) return
      if (e.button !== 0 && e.pointerType === 'mouse') return
      dragging.current = true
      vel.current.y = 0
      vel.current.x = 0
      last.current = { x: e.clientX, y: e.clientY }
      try {
        el.setPointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!enabledRef.current || !dragging.current) return
      const root = rootRef.current
      if (!root) return
      const dx = e.clientX - last.current.x
      const dy = e.clientY - last.current.y
      last.current = { x: e.clientX, y: e.clientY }
      const yaw = dx * 0.008
      const pitch = dy * 0.004
      root.rotation.y += yaw
      root.rotation.x = THREE.MathUtils.clamp(
        root.rotation.x + pitch,
        -0.45,
        0.45,
      )
      vel.current.y = yaw
      vel.current.x = pitch
    }

    const endDrag = (e: PointerEvent) => {
      if (!dragging.current) return
      dragging.current = false
      try {
        el.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    }

    const onWheel = (e: WheelEvent) => {
      if (!enabledRef.current) return
      e.preventDefault()
      const target = lookAtRef.current
      const offset = new THREE.Vector3().subVectors(camera.position, target)
      const dist = offset.length()
      if (dist < 1e-4) return
      const factor = Math.exp(e.deltaY * 0.0012)
      const next = THREE.MathUtils.clamp(dist * factor, 2, 120)
      offset.multiplyScalar(next / dist)
      camera.position.copy(target).add(offset)
      camera.lookAt(target)
    }

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', endDrag)
    el.addEventListener('pointercancel', endDrag)
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', endDrag)
      el.removeEventListener('pointercancel', endDrag)
      el.removeEventListener('wheel', onWheel)
    }
  }, [camera, gl, lookAtRef, rootRef])

  return null
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
  const lookAtRef = useRef(new THREE.Vector3(0, 0, 0))
  const [groupsReady, setGroupsReady] = useState(0)
  // Stable callback — WaldoModel lists onReady in a layout-effect deps array.
  const onReady = useCallback(() => {
    setGroupsReady((n) => n + 1)
  }, [])
  const selectedObj = groupsReady > 0 ? groupRefs.current[selectedGroup] : null
  const turntableOn = interactionMode === 'orbit'
  const [dpr] = useState(cappedDpr)

  return (
    <div className="viewer-shell">
      <Canvas
        dpr={dpr}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: false }}
        camera={{ position: [20, 12, 28], fov: 40, near: 0.1, far: 500 }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.85} />
        <directionalLight position={[12, 18, 10]} intensity={1.15} />
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
            lookAtRef={lookAtRef}
            onReady={onReady}
          />
        </Suspense>

        <TurntableControls
          rootRef={rootRef}
          enabled={turntableOn}
          lookAtRef={lookAtRef}
        />

        {interactionMode === 'edit' && selectedObj && (
          <TransformControls
            object={selectedObj}
            mode={transformMode}
            size={0.85}
            onMouseUp={() => {
              const o = selectedObj
              onTransformCommit(selectedGroup, {
                position: [o.position.x, o.position.y, o.position.z],
                rotation: [o.rotation.x, o.rotation.y, o.rotation.z],
                scale: [o.scale.x, o.scale.y, o.scale.z],
              })
            }}
          />
        )}
      </Canvas>
    </div>
  )
}
