import { useState, useMemo } from 'react'
import { Search, X, Star, RotateCcw } from 'lucide-react'
import { formatINR } from '../../lib/format'

export interface BrandCount {
  name: string
  count: number
}

export interface SubcategoryCount {
  name: string
  count: number
}

export interface FilterState {
  minPrice: string
  maxPrice: string
  selectedBrands: string[]
  selectedSubcategories: string[]
  minRating: number | null
  hideInflatedDiscounts?: boolean
}

interface Props {
  catalogMinPrice: number
  catalogMaxPrice: number
  brands: BrandCount[]
  subcategories: SubcategoryCount[]
  filters: FilterState
  onFilterChange: (next: FilterState) => void
  onClearAll: () => void
  hasActiveFilters: boolean
  isOpenMobile?: boolean
  onCloseMobile?: () => void
}

export function getSubCategory(category?: string): string | null {
  if (!category || !category.includes(' - ')) return null
  const parts = category.split(' - ')
  return parts.slice(1).join(' - ').trim() || null
}

export default function CategoryFilterPanel({
  catalogMinPrice,
  catalogMaxPrice,
  brands,
  subcategories,
  filters,
  onFilterChange,
  onClearAll,
  hasActiveFilters,
  isOpenMobile = false,
  onCloseMobile,
}: Props) {
  const [brandSearch, setBrandSearch] = useState('')

  const filteredBrands = useMemo(() => {
    const q = brandSearch.trim().toLowerCase()
    if (!q) return brands
    return brands.filter((b) => b.name.toLowerCase().includes(q))
  }, [brands, brandSearch])

  function handleBrandToggle(brandName: string) {
    const exists = filters.selectedBrands.includes(brandName)
    const nextBrands = exists
      ? filters.selectedBrands.filter((b) => b !== brandName)
      : [...filters.selectedBrands, brandName]
    onFilterChange({ ...filters, selectedBrands: nextBrands })
  }

  function handleSubcategoryToggle(subcatName: string) {
    const exists = filters.selectedSubcategories.includes(subcatName)
    const nextSubcats = exists
      ? filters.selectedSubcategories.filter((s) => s !== subcatName)
      : [...filters.selectedSubcategories, subcatName]
    onFilterChange({ ...filters, selectedSubcategories: nextSubcats })
  }

  function handleRatingClick(rating: number) {
    const nextRating = filters.minRating === rating ? null : rating
    onFilterChange({ ...filters, minRating: nextRating })
  }

  const content = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: '14px',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-h)' }}>
            Filters
          </span>
          {hasActiveFilters && (
            <span
              style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                backgroundColor: 'var(--ink-900)',
                color: 'var(--on-dark)',
                padding: '1px 6px',
                borderRadius: 'var(--r-pill)',
              }}
            >
              Active
            </span>
          )}
        </div>

        {hasActiveFilters && (
          <button
            onClick={onClearAll}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--champagne-deep)',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 500,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: 0,
            }}
          >
            <RotateCcw size={12} />
            Clear all
          </button>
        )}
      </div>

      {/* 1. Price Range */}
      <div>
        <label
          style={{
            display: 'block',
            fontSize: '0.82rem',
            fontWeight: 600,
            color: 'var(--text-h)',
            marginBottom: '8px',
          }}
        >
          Price range (₹)
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="number"
            placeholder={catalogMinPrice ? `Min (${catalogMinPrice})` : 'Min'}
            value={filters.minPrice}
            onChange={(e) => onFilterChange({ ...filters, minPrice: e.target.value })}
            style={{
              width: '100%',
              padding: '7px 10px',
              borderRadius: '6px',
              border: '1px solid var(--line)',
              backgroundColor: 'var(--card)',
              color: 'var(--text)',
              fontSize: '0.82rem',
              outline: 'none',
            }}
          />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>to</span>
          <input
            type="number"
            placeholder={catalogMaxPrice ? `Max (${catalogMaxPrice})` : 'Max'}
            value={filters.maxPrice}
            onChange={(e) => onFilterChange({ ...filters, maxPrice: e.target.value })}
            style={{
              width: '100%',
              padding: '7px 10px',
              borderRadius: '6px',
              border: '1px solid var(--line)',
              backgroundColor: 'var(--card)',
              color: 'var(--text)',
              fontSize: '0.82rem',
              outline: 'none',
            }}
          />
        </div>
        {catalogMinPrice > 0 && catalogMaxPrice > 0 && (
          <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Available: {formatINR(catalogMinPrice)} – {formatINR(catalogMaxPrice)}
          </span>
        )}
      </div>

      {/* 2. Brands */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '8px',
          }}
        >
          <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-h)' }}>
            Brands
          </label>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            {brands.length} brands
          </span>
        </div>

        {/* Brand search box */}
        <div
          style={{
            position: 'relative',
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Search
            size={13}
            style={{
              position: 'absolute',
              left: '9px',
              color: 'var(--text-muted)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            placeholder="Search brands..."
            value={brandSearch}
            onChange={(e) => setBrandSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 10px 6px 28px',
              borderRadius: '6px',
              border: '1px solid var(--line)',
              backgroundColor: 'var(--card)',
              color: 'var(--text)',
              fontSize: '0.78rem',
              outline: 'none',
            }}
          />
          {brandSearch && (
            <button
              onClick={() => setBrandSearch('')}
              style={{
                position: 'absolute',
                right: '8px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                padding: 0,
                display: 'flex',
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Brand list */}
        <div
          style={{
            maxHeight: '210px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            paddingRight: '4px',
          }}
        >
          {filteredBrands.length === 0 ? (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '6px 0' }}>
              No matching brands
            </span>
          ) : (
            filteredBrands.map((b) => {
              const isChecked = filters.selectedBrands.includes(b.name)
              return (
                <label
                  key={b.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.8rem',
                    color: isChecked ? 'var(--text-h)' : 'var(--text)',
                    cursor: 'pointer',
                    padding: '3px 0',
                    userSelect: 'none',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleBrandToggle(b.name)}
                      style={{
                        cursor: 'pointer',
                        accentColor: 'var(--ink-900)',
                        width: '14px',
                        height: '14px',
                      }}
                    />
                    <span style={{ fontWeight: isChecked ? 600 : 400 }}>{b.name}</span>
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    ({b.count})
                  </span>
                </label>
              )
            })
          )}
        </div>
      </div>

      {/* 3. Subcategories */}
      {subcategories.length > 0 && (
        <div>
          <label
            style={{
              display: 'block',
              fontSize: '0.82rem',
              fontWeight: 600,
              color: 'var(--text-h)',
              marginBottom: '8px',
            }}
          >
            Sub-category
          </label>
          <div
            style={{
              maxHeight: '190px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              paddingRight: '4px',
            }}
          >
            {subcategories.map((s) => {
              const isChecked = filters.selectedSubcategories.includes(s.name)
              return (
                <label
                  key={s.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.8rem',
                    color: isChecked ? 'var(--text-h)' : 'var(--text)',
                    cursor: 'pointer',
                    padding: '3px 0',
                    userSelect: 'none',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleSubcategoryToggle(s.name)}
                      style={{
                        cursor: 'pointer',
                        accentColor: 'var(--ink-900)',
                        width: '14px',
                        height: '14px',
                      }}
                    />
                    <span style={{ fontWeight: isChecked ? 600 : 400 }}>{s.name}</span>
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    ({s.count})
                  </span>
                </label>
              )
            })}
          </div>
        </div>
      )}

      {/* 4. Customer Rating */}
      <div>
        <label
          style={{
            display: 'block',
            fontSize: '0.82rem',
            fontWeight: 600,
            color: 'var(--text-h)',
            marginBottom: '8px',
          }}
        >
          Customer rating
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {[4, 3].map((r) => {
            const isSelected = filters.minRating === r
            return (
              <label
                key={r}
                onClick={() => handleRatingClick(r)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.8rem',
                  color: isSelected ? 'var(--text-h)' : 'var(--text)',
                  cursor: 'pointer',
                  padding: '3px 0',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => {}}
                  style={{
                    cursor: 'pointer',
                    accentColor: 'var(--ink-900)',
                    width: '14px',
                    height: '14px',
                  }}
                />
                <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontWeight: isSelected ? 600 : 400 }}>
                  <span>{r}</span>
                  <Star size={11} fill="var(--champagne-deep)" strokeWidth={0} style={{ color: 'var(--champagne-deep)' }} />
                  <span>& above</span>
                </span>
              </label>
            )
          })}
        </div>
      </div>

      {/* 5. Discount Quality */}
      <div>
        <label
          style={{
            display: 'block',
            fontSize: '0.82rem',
            fontWeight: 600,
            color: 'var(--text-h)',
            marginBottom: '8px',
          }}
        >
          Discounts
        </label>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.8rem',
            color: filters.hideInflatedDiscounts ? 'var(--text-h)' : 'var(--text)',
            cursor: 'pointer',
            padding: '3px 0',
            userSelect: 'none',
          }}
        >
          <input
            type="checkbox"
            checked={Boolean(filters.hideInflatedDiscounts)}
            onChange={(e) =>
              onFilterChange({
                ...filters,
                hideInflatedDiscounts: e.target.checked,
              })
            }
            style={{
              cursor: 'pointer',
              accentColor: 'var(--ink-900)',
              width: '14px',
              height: '14px',
            }}
          />
          <span style={{ fontWeight: filters.hideInflatedDiscounts ? 600 : 400 }}>
            Hide inflated discounts
          </span>
        </label>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="hidden md:block"
        style={{
          width: '250px',
          flexShrink: 0,
          backgroundColor: 'var(--card)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--r-lg)',
          padding: '20px',
          alignSelf: 'flex-start',
          position: 'sticky',
          top: '84px',
        }}
      >
        {content}
      </aside>

      {/* Mobile slide-over drawer */}
      {isOpenMobile && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
          }}
        >
          {/* Backdrop */}
          <div
            onClick={onCloseMobile}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.45)',
              backdropFilter: 'blur(2px)',
            }}
          />

          {/* Drawer content */}
          <div
            style={{
              position: 'relative',
              width: '320px',
              maxWidth: '85vw',
              height: '100%',
              backgroundColor: 'var(--card)',
              boxShadow: '4px 0 24px rgba(0,0,0,0.2)',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 10000,
            }}
          >
            {/* Drawer top bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderBottom: '1px solid var(--line)',
              }}
            >
              <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-h)' }}>
                Filters
              </span>
              <button
                onClick={onCloseMobile}
                aria-label="Close filters"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  color: 'var(--text)',
                  display: 'flex',
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Scrollable body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              {content}
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '16px 20px',
                borderTop: '1px solid var(--line)',
                display: 'flex',
                gap: '12px',
              }}
            >
              <button
                onClick={onClearAll}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: 'var(--r-pill)',
                  border: '1px solid var(--line)',
                  backgroundColor: 'var(--card)',
                  color: 'var(--text)',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Clear all
              </button>
              <button
                onClick={onCloseMobile}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: 'var(--r-pill)',
                  border: 'none',
                  backgroundColor: 'var(--ink-900)',
                  color: 'var(--on-dark)',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Show products
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

