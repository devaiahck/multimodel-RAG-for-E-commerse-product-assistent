import Chip from '../ui/Chip'

export type SortOption = 'best' | 'price_asc' | 'price_desc'

interface Props {
  categories: string[]
  activeCategory: string
  onSelectCategory: (cat: string) => void
  priceInput: string
  onChangePrice: (val: string) => void
  sort: SortOption
  onChangeSort: (sort: SortOption) => void
}

export default function SearchFiltersBar({
  categories,
  activeCategory,
  onSelectCategory,
  priceInput,
  onChangePrice,
  sort,
  onChangeSort,
}: Props) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        paddingBottom: '8px',
        borderBottom: '1px solid var(--line)',
      }}
    >
      {/* Category Chips */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        {categories.map((cat) => {
          const active = cat === 'All' ? !activeCategory || activeCategory === 'All' : activeCategory === cat
          return (
            <Chip key={cat} active={active} onClick={() => onSelectCategory(cat)}>
              {cat}
            </Chip>
          )
        })}
      </div>

      {/* Price filter and Sort select */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label htmlFor="max-price" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            Max price (₹)
          </label>
          <input
            id="max-price"
            type="number"
            min="0"
            placeholder="Any"
            value={priceInput}
            onChange={(e) => onChangePrice(e.target.value)}
            style={{
              width: 90,
              padding: '6px 12px',
              borderRadius: 'var(--r-pill)',
              border: '1px solid var(--line)',
              backgroundColor: 'var(--card)',
              color: 'var(--text)',
              fontSize: '0.8rem',
              outline: 'none',
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label htmlFor="sort-select" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            Sort by
          </label>
          <select
            id="sort-select"
            value={sort}
            onChange={(e) => onChangeSort(e.target.value as SortOption)}
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--r-pill)',
              border: '1px solid var(--line)',
              backgroundColor: 'var(--card)',
              color: 'var(--text)',
              fontSize: '0.8rem',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="best">Best match</option>
            <option value="price_asc">Price low to high</option>
            <option value="price_desc">Price high to low</option>
          </select>
        </div>
      </div>
    </div>
  )
}

