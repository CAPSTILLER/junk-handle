import { useCallback, useMemo, useState } from 'react'
import type { GroupId } from '../config/meshGroups'
import { DEFAULT_LENS_ID } from '../config/lenses'

export type Vec3 = [number, number, number]

export type GroupTransform = {
  position: Vec3
  rotation: Vec3
  scale: Vec3
}

const IDENTITY: GroupTransform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
}

function cloneT(t: GroupTransform): GroupTransform {
  return {
    position: [...t.position] as Vec3,
    rotation: [...t.rotation] as Vec3,
    scale: [...t.scale] as Vec3,
  }
}

export type StudioState = {
  selectedGroup: GroupId
  interactionMode: 'orbit' | 'edit'
  transforms: Record<GroupId, GroupTransform>
  framesId: string | null
  lensesId: string
  skinId: string | null
  hairId: string | null
  setSelectedGroup: (g: GroupId) => void
  setInteractionMode: (m: 'orbit' | 'edit') => void
  setTransform: (g: GroupId, patch: Partial<GroupTransform>) => void
  resetTransform: (g: GroupId) => void
  resetAllTransforms: () => void
  setFramesId: (id: string | null) => void
  setLensesId: (id: string) => void
  setSkinId: (id: string | null) => void
  setHairId: (id: string | null) => void
}

export function useStudioState(): StudioState {
  const [selectedGroup, setSelectedGroup] = useState<GroupId>('body')
  const [interactionMode, setInteractionMode] = useState<'orbit' | 'edit'>('orbit')
  const [transforms, setTransforms] = useState<Record<GroupId, GroupTransform>>({
    body: cloneT(IDENTITY),
    glasses: cloneT(IDENTITY),
    hair: cloneT(IDENTITY),
  })
  const [framesId, setFramesId] = useState<string | null>(null)
  const [lensesId, setLensesId] = useState(DEFAULT_LENS_ID)
  const [skinId, setSkinId] = useState<string | null>(null)
  const [hairId, setHairId] = useState<string | null>(null)

  const setTransform = useCallback((g: GroupId, patch: Partial<GroupTransform>) => {
    setTransforms((prev) => {
      const cur = prev[g]
      return {
        ...prev,
        [g]: {
          position: patch.position ?? cur.position,
          rotation: patch.rotation ?? cur.rotation,
          scale: patch.scale ?? cur.scale,
        },
      }
    })
  }, [])

  const resetTransform = useCallback((g: GroupId) => {
    setTransforms((prev) => ({ ...prev, [g]: cloneT(IDENTITY) }))
  }, [])

  const resetAllTransforms = useCallback(() => {
    setTransforms({
      body: cloneT(IDENTITY),
      glasses: cloneT(IDENTITY),
      hair: cloneT(IDENTITY),
    })
  }, [])

  return useMemo(
    () => ({
      selectedGroup,
      interactionMode,
      transforms,
      framesId,
      lensesId,
      skinId,
      hairId,
      setSelectedGroup,
      setInteractionMode,
      setTransform,
      resetTransform,
      resetAllTransforms,
      setFramesId,
      setLensesId,
      setSkinId,
      setHairId,
    }),
    [
      selectedGroup,
      interactionMode,
      transforms,
      framesId,
      lensesId,
      skinId,
      hairId,
      setTransform,
      resetTransform,
      resetAllTransforms,
    ],
  )
}
