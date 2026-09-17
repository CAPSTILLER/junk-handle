import { useEffect } from 'react'
import type { TraitKind } from './TraitRail'

export type PickerOption = {
  id: string
  label: string
  color: string
}

type Props = {
  kind: TraitKind
  title: string
  options: PickerOption[]
  selectedId: string | null
  onSelect: (id: string) => void
  onClose: () => void
}

export function TraitPickerOverlay({
  kind,
  title,
  options,
  selectedId,
  onSelect,
  onClose,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="trait-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-trait={kind}
      onClick={onClose}
    >
      <div
        className="trait-overlay-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="trait-overlay-head">
          <h2>{title}</h2>
          <button
            type="button"
            className="trait-overlay-close"
            onClick={onClose}
            aria-label="Close"
          >
            Close
          </button>
        </div>
        <div className="trait-overlay-grid">
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={
                selectedId === opt.id
                  ? 'trait-overlay-swatch active'
                  : 'trait-overlay-swatch'
              }
              title={opt.label}
              aria-label={opt.label}
              style={{ background: opt.color }}
              onClick={() => {
                onSelect(opt.id)
                onClose()
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
