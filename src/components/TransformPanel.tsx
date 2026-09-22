import { TRANSFORM_GROUPS, type GroupId } from '../config/meshGroups'
import type { GroupTransform, Vec3 } from '../hooks/useStudioState'

export type TransformMode = 'translate' | 'rotate' | 'scale'

type Props = {
  selectedGroup: GroupId
  interactionMode: 'orbit' | 'edit'
  transformMode: TransformMode
  transforms: Record<GroupId, GroupTransform>
  onSelectGroup: (g: GroupId) => void
  onMode: (m: 'orbit' | 'edit') => void
  onTransformMode: (m: TransformMode) => void
  onSetTransform: (g: GroupId, patch: Partial<GroupTransform>) => void
  onReset: (g: GroupId) => void
  onResetAll: () => void
}

/** Absolute ranges with identity at slider midpoint. */
const POS_MIN = -2
const POS_MAX = 2
const ROT_MIN = -Math.PI
const ROT_MAX = Math.PI
const SCALE_LO = 0.2
const SCALE_MID = 1
const SCALE_HI = 3

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n))
}

/** Map scale value ↔ [0,1] slider so mid thumb = 1. */
function scaleToSlider(s: number): number {
  const v = clamp(s, SCALE_LO, SCALE_HI)
  if (v <= SCALE_MID) {
    return ((v - SCALE_LO) / (SCALE_MID - SCALE_LO)) * 0.5
  }
  return 0.5 + ((v - SCALE_MID) / (SCALE_HI - SCALE_MID)) * 0.5
}

function sliderToScale(t: number): number {
  const u = clamp(t, 0, 1)
  if (u <= 0.5) {
    return SCALE_LO + (u / 0.5) * (SCALE_MID - SCALE_LO)
  }
  return SCALE_MID + ((u - 0.5) / 0.5) * (SCALE_HI - SCALE_MID)
}

function AxisSliders({
  mode,
  values,
  onChange,
}: {
  mode: TransformMode
  values: Vec3
  onChange: (v: Vec3) => void
}) {
  const axes = ['X', 'Y', 'Z'] as const

  return (
    <div className="slider-stack">
      {axes.map((axis, i) => {
        const raw = values[i]
        let min: number
        let max: number
        let step: number
        let display: number
        let sliderValue: number

        if (mode === 'translate') {
          min = POS_MIN
          max = POS_MAX
          step = 0.01
          display = clamp(raw, min, max)
          sliderValue = display
        } else if (mode === 'rotate') {
          min = ROT_MIN
          max = ROT_MAX
          step = 0.01
          display = clamp(raw, min, max)
          sliderValue = display
        } else {
          min = 0
          max = 1
          step = 0.001
          display = clamp(raw, SCALE_LO, SCALE_HI)
          sliderValue = scaleToSlider(display)
        }

        return (
          <label key={axis} className="slider-row">
            <span className="slider-axis">{axis}</span>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={sliderValue}
              aria-label={`${mode} ${axis}`}
              onChange={(e) => {
                const next: Vec3 = [...values]
                const n = Number(e.target.value)
                if (mode === 'scale') {
                  next[i] = sliderToScale(n)
                } else {
                  next[i] = n
                }
                onChange(next)
              }}
            />
            <span className="slider-value">
              {mode === 'rotate' ? display.toFixed(2) : display.toFixed(2)}
            </span>
          </label>
        )
      })}
    </div>
  )
}

const MODE_BUTTONS: { id: TransformMode; label: string }[] = [
  { id: 'translate', label: 'Position' },
  { id: 'rotate', label: 'Rotation' },
  { id: 'scale', label: 'Scale' },
]

export function TransformPanel({
  selectedGroup,
  interactionMode,
  transformMode,
  transforms,
  onSelectGroup,
  onMode,
  onTransformMode,
  onSetTransform,
  onReset,
  onResetAll,
}: Props) {
  const t = transforms[selectedGroup]

  const activeValues: Vec3 =
    transformMode === 'translate'
      ? t.position
      : transformMode === 'rotate'
        ? t.rotation
        : t.scale

  const onSliderChange = (next: Vec3) => {
    if (transformMode === 'translate') {
      onSetTransform(selectedGroup, { position: next })
    } else if (transformMode === 'rotate') {
      onSetTransform(selectedGroup, { rotation: next })
    } else {
      const clamped: Vec3 = [
        Math.max(SCALE_LO, next[0]),
        Math.max(SCALE_LO, next[1]),
        Math.max(SCALE_LO, next[2]),
      ]
      onSetTransform(selectedGroup, { scale: clamped })
    }
  }

  return (
    <section className="panel">
      <h2>Groups</h2>
      <div className="chip-row">
        {(Object.values(TRANSFORM_GROUPS) as (typeof TRANSFORM_GROUPS)[GroupId][]).map(
          (g) => (
            <button
              key={g.id}
              type="button"
              className={selectedGroup === g.id ? 'chip active' : 'chip'}
              onClick={() => onSelectGroup(g.id)}
            >
              {g.label}
            </button>
          ),
        )}
      </div>

      <div className="chip-row">
        <button
          type="button"
          className={interactionMode === 'orbit' ? 'chip active' : 'chip'}
          onClick={() => onMode('orbit')}
        >
          Spin
        </button>
        <button
          type="button"
          className={interactionMode === 'edit' ? 'chip active' : 'chip'}
          onClick={() => onMode('edit')}
        >
          Edit
        </button>
      </div>

      <div className="chip-row">
        {MODE_BUTTONS.map((m) => (
          <button
            key={m.id}
            type="button"
            className={transformMode === m.id ? 'chip active' : 'chip'}
            onClick={() => {
              onTransformMode(m.id)
              if (interactionMode !== 'edit') onMode('edit')
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      <AxisSliders
        mode={transformMode}
        values={activeValues}
        onChange={onSliderChange}
      />

      <div className="chip-row">
        <button type="button" className="chip" onClick={() => onReset(selectedGroup)}>
          Reset group
        </button>
        <button type="button" className="chip" onClick={onResetAll}>
          Reset all
        </button>
      </div>
    </section>
  )
}
