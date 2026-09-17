import { LENS_SHADES } from '../config/lenses'
import {
  FRAME_SWATCHES,
  HAIR_SWATCHES,
  SKIN_SWATCHES,
  type Swatch,
} from '../config/swatches'

type Props = {
  framesId: string | null
  lensesId: string
  skinId: string | null
  hairId: string | null
  onFrames: (id: string | null) => void
  onLenses: (id: string) => void
  onSkin: (id: string | null) => void
  onHair: (id: string | null) => void
}

function SwatchGrid({
  items,
  selected,
  onSelect,
  allowDefault,
}: {
  items: Swatch[]
  selected: string | null
  onSelect: (id: string | null) => void
  allowDefault?: boolean
}) {
  return (
    <div className="swatch-grid">
      {allowDefault && (
        <button
          type="button"
          className={!selected ? 'swatch active' : 'swatch'}
          onClick={() => onSelect(null)}
          title="Default"
        >
          <span className="swatch-default">Default</span>
        </button>
      )}
      {items.map((s) => (
        <button
          key={s.id}
          type="button"
          className={selected === s.id ? 'swatch active' : 'swatch'}
          onClick={() => onSelect(s.id)}
          title={s.label}
        >
          <img src={s.url} alt={s.label} loading="lazy" />
        </button>
      ))}
    </div>
  )
}

export function TraitPanel({
  framesId,
  lensesId,
  skinId,
  hairId,
  onFrames,
  onLenses,
  onSkin,
  onHair,
}: Props) {
  return (
    <section className="panel">
      <h2>Traits</h2>

      <h3>Frames</h3>
      <SwatchGrid
        items={FRAME_SWATCHES}
        selected={framesId}
        onSelect={onFrames}
        allowDefault
      />

      <h3>Lenses</h3>
      <div className="swatch-grid lens-grid">
        {LENS_SHADES.map((s) => (
          <button
            key={s.id}
            type="button"
            className={lensesId === s.id ? 'swatch active' : 'swatch'}
            onClick={() => onLenses(s.id)}
            title={s.label}
            style={{
              background: `rgba(${Math.round(s.rgba[0] * 255)}, ${Math.round(s.rgba[1] * 255)}, ${Math.round(s.rgba[2] * 255)}, ${s.rgba[3]})`,
            }}
          >
            <span className="lens-label">{s.label}</span>
          </button>
        ))}
      </div>

      <h3>Skin</h3>
      <SwatchGrid
        items={SKIN_SWATCHES}
        selected={skinId}
        onSelect={onSkin}
        allowDefault
      />

      <h3>Hair</h3>
      <SwatchGrid
        items={HAIR_SWATCHES}
        selected={hairId}
        onSelect={onHair}
        allowDefault
      />
    </section>
  )
}
