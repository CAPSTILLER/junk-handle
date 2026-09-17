import { TRANSFORM_GROUPS, type GroupId } from '../config/meshGroups'
import type { GroupTransform, Vec3 } from '../hooks/useStudioState'

type Props = {
  selectedGroup: GroupId
  interactionMode: 'orbit' | 'edit'
  transformMode: 'translate' | 'rotate' | 'scale'
  transforms: Record<GroupId, GroupTransform>
  onSelectGroup: (g: GroupId) => void
  onMode: (m: 'orbit' | 'edit') => void
  onTransformMode: (m: 'translate' | 'rotate' | 'scale') => void
  onSetTransform: (g: GroupId, patch: Partial<GroupTransform>) => void
  onReset: (g: GroupId) => void
  onResetAll: () => void
}

function AxisInputs({
  label,
  values,
  step,
  onChange,
}: {
  label: string
  values: Vec3
  step: number
  onChange: (v: Vec3) => void
}) {
  return (
    <div className="axis-row">
      <span className="axis-label">{label}</span>
      {(['X', 'Y', 'Z'] as const).map((axis, i) => (
        <label key={axis} className="axis-field">
          <span>{axis}</span>
          <input
            type="number"
            step={step}
            value={Number(values[i].toFixed(3))}
            onChange={(e) => {
              const next: Vec3 = [...values]
              next[i] = Number(e.target.value)
              onChange(next)
            }}
          />
        </label>
      ))}
    </div>
  )
}

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

      {interactionMode === 'edit' && (
        <div className="chip-row">
          {(['translate', 'rotate', 'scale'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={transformMode === m ? 'chip active' : 'chip'}
              onClick={() => onTransformMode(m)}
            >
              {m === 'translate' ? 'Move' : m === 'rotate' ? 'Rotate' : 'Scale'}
            </button>
          ))}
        </div>
      )}

      <AxisInputs
        label="Pos"
        values={t.position}
        step={0.1}
        onChange={(position) => onSetTransform(selectedGroup, { position })}
      />
      <AxisInputs
        label="Rot"
        values={t.rotation}
        step={0.05}
        onChange={(rotation) => onSetTransform(selectedGroup, { rotation })}
      />
      <AxisInputs
        label="Scale"
        values={t.scale}
        step={0.05}
        onChange={(scale) => {
          const clamped: Vec3 = [
            Math.max(0.05, scale[0]),
            Math.max(0.05, scale[1]),
            Math.max(0.05, scale[2]),
          ]
          onSetTransform(selectedGroup, { scale: clamped })
        }}
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
