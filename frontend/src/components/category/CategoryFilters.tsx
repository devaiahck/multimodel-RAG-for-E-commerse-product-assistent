import { SlidersHorizontal } from 'lucide-react'
import type { CatalogSort } from '../../services/catalogService'

export const SORT_OPTIONS: { label: string; value: CatalogSort }[] = [
  { label: 'Best deals', value: 'discount' },
  { label: 'Real discount (high to low)', value: 'real_discount_desc' },
  { label: 'Price low to high', value: 'price_asc' },
  { label: 'Price high to low', value: 'price_desc' },
  { label: 'Rating', value: 'rating' },
]

interface Props {
  sort: CatalogSort
  onSortChange: (sort: CatalogSort) => void
  onOpenMobileFilters?: () => void
  activeFiltersCount?: number
}

export default function CategoryFilters({
  sort,
  onSortChange,
  onOpenMobileFilters,
  activeFiltersCount = 0,
}: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
      {/* Mobile filter button */}
      {onOpenMobileFilters && (
        <button
          onClick={onOpenMobileFilters}
          className="md:hidden"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '7px 14px',
            borderRadius: 'var(--r-pill)',
            border: '1px solid var(--line)',
            backgroundColor: 'var(--card)',
            color: 'var(--text-h)',
            fontSize: '0.8rem',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          <SlidersHorizontal size={14} />
          <span>Filters</span>
          {activeFiltersCount > 0 && (
            <span
              style={{
                backgroundColor: 'var(--ink-900)',
                color: 'var(--on-dark)',
                fontSize: '0.65rem',
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: 'var(--r-pill)',
              }}
            >
              {activeFiltersCount}
            </span>
          )}
        </button>
      )}

      {/* Sort dropdown */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <label htmlFor="cat-sort-select" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          Sort by
        </label>
        <select
          id="cat-sort-select"
          value={sort}
          onChange={(e) => onSortChange(e.target.value as CatalogSort)}
          style={{
            padding: '7px 14px',
            borderRadius: 'var(--r-pill)',
            border: '1px solid var(--line)',
            backgroundColor: 'var(--card)',
            color: 'var(--text-h)',
            fontSize: '0.8rem',
            fontWeight: 500,
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
