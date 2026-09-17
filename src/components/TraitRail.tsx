export type TraitKind = 'frames' | 'lenses' | 'skin' | 'hair'

type RailItem = {
  kind: TraitKind
  label: string
  color: string
  /** Original asset image for frames/hair/skin; omit for solid lenses. */
  imageUrl?: string
}

type Props = {
  items: RailItem[]
  onOpen: (kind: TraitKind) => void
}

export function TraitRail({ items, onOpen }: Props) {
  return (
    <nav className="trait-rail" aria-label="Trait selectors">
      {items.map((item) => (
        <button
          key={item.kind}
          type="button"
          className="trait-rail-btn"
          title={item.label}
          aria-label={item.label}
          onClick={() => onOpen(item.kind)}
        >
          {item.imageUrl ? (
            <img
              className="trait-rail-swatch"
              src={item.imageUrl}
              alt=""
              draggable={false}
            />
          ) : (
            <span
              className="trait-rail-swatch"
              style={{ background: item.color }}
            />
          )}
          <span className="trait-rail-label">{item.label}</span>
        </button>
      ))}
    </nav>
  )
}
