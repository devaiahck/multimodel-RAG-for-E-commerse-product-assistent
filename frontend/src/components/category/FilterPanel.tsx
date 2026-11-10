import React, { useState, useMemo } from 'react'
import { X, Star } from 'lucide-react'
import type { Product } from '../../api/types'

export interface CategoryFilterState {
  minPrice: number | null
  maxPrice: number | null
  brands: string[]
  subcategories: string[]
  minRating: number | null
}

interface FilterPanelProps {
  allProducts: Product[]
  filters: CategoryFilterState
  onFilterChange: (filters: CategoryFilterState) => void
  isOpen: boolean
  onClose: () => void
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text-muted)',
  marginBottom: 8,
  marginTop: 0,
}

const inputStyle: React.CSSProperties = {
  padding: '6px 12px',
  border: '1px solid var(--line)',
  background: 'var(--card)',
  color: 'var(--text)',
  borderRadius: 'var(--r-pill)',
  fontSize: '0.8rem',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

const checkboxStyle: React.CSSProperties = {
  accentColor: 'var(--champagne-deep)',
  cursor: 'pointer',
}

const labelRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: '0.85rem',
  color: 'var(--text)',
  cursor: 'pointer',
  padding: '3px 0',
}

const countStyle: React.CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: '0.78rem',
  marginLeft: 'auto',
  flexShrink: 0,
}

const sectionStyle: React.CSSProperties = {
  borderBottom: '1px solid var(--line)',
  paddingBottom: 16,
  marginBottom: 16,
}

function FilterPanel({
  allProducts,
  filters,
  onFilterChange,
  isOpen,
  onClose,
}: FilterPanelProps) {
  const [brandSearch, setBrandSearch] = useState('')

  const priceRange = useMemo(() => {
    if (allProducts.length === 0) return { min: 0, max: 0 }
    let min = Infinity
    let max = -Infinity
    for (const p of allProducts) {
      if (p.price < min) min = p.price
      if (p.price > max) max = p.price
    }
    return { min: Math.floor(min), max: Math.ceil(max) }
  }, [allProducts])

  const brandCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of allProducts) {
      if (p.brand) {
        map.set(p.brand, (map.get(p.brand) ?? 0) + 1)
      }
    }
    return new Map(
      [...map.entries()].sort((a, b) => b[1] - a[1])
    )
  }, [allProducts])

  const subcategoryCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of allProducts) {
      if (p.category && p.category.includes(' - ')) {
        const sub = p.category.split(' - ').slice(1).join(' - ')
        map.set(sub, (map.get(sub) ?? 0) + 1)
      }
    }
    return new Map(
      [...map.entries()].sort((a, b) => b[1] - a[1])
    )
  }, [allProducts])

  const filteredBrands = useMemo(() => {
    const query = brandSearch.toLowerCase().trim()
    if (!query) return [...brandCounts.entries()]
    return [...brandCounts.entries()].filter(([brand]) =>
      brand.toLowerCase().includes(query)
    )
  }, [brandCounts, brandSearch])

  const update = (patch: Partial<CategoryFilterState>) => {
    onFilterChange({ ...filters, ...patch })
  }

  const clearAll = () => {
    onFilterChange({
      minPrice: null,
      maxPrice: null,
      brands: [],
      subcategories: [],
      minRating: null,
    })
    setBrandSearch('')
  }

  const toggleBrand = (brand: string) => {
    const next = filters.brands.includes(brand)
      ? filters.brands.filter((b) => b !== brand)
      : [...filters.brands, brand]
    update({ brands: next })
  }

  const toggleSubcategory = (sub: string) => {
    const next = filters.subcategories.includes(sub)
      ? filters.subcategories.filter((s) => s !== sub)
      : [...filters.subcategories, sub]
    update({ subcategories: next })
  }

  const toggleRating = (value: number) => {
    update({ minRating: filters.minRating === value ? null : value })
  }

  const panelContent = (
    <div
      style={{
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflowY: 'auto',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 20,
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: '1rem',
            fontWeight: 700,
            color: 'var(--text)',
          }}
        >
          Filters
        </h3>
        <button
          onClick={onClose}
          className="filter-panel-close"
          aria-label="Close filters"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: '1.2rem',
            cursor: 'pointer',
            padding: 4,
            lineHeight: 1,
            display: 'none',
          }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Price range */}
      <div style={sectionStyle}>
        <p style={sectionTitleStyle}>Price range</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="number"
            placeholder={`Min ($${priceRange.min})`}
            value={filters.minPrice ?? ''}
            onChange={(e) =>
              update({
                minPrice: e.target.value === '' ? null : Number(e.target.value),
              })
            }
            style={inputStyle}
          />
          <input
            type="number"
            placeholder={`Max ($${priceRange.max})`}
            value={filters.maxPrice ?? ''}
            onChange={(e) =>
              update({
                maxPrice: e.target.value === '' ? null : Number(e.target.value),
              })
            }
            style={inputStyle}
          />
        </div>
      </div>

      {/* Brands */}
      {brandCounts.size > 0 && (
        <div style={sectionStyle}>
          <p style={sectionTitleStyle}>Brands</p>
          <input
            type="text"
            placeholder="Search brands…"
            value={brandSearch}
            onChange={(e) => setBrandSearch(e.target.value)}
            style={{ ...inputStyle, marginBottom: 8 }}
          />
          <div
            style={{
              maxHeight: 200,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            {filteredBrands.map(([brand, count]) => (
              <label key={brand} style={labelRowStyle}>
                <input
                  type="checkbox"
                  checked={filters.brands.includes(brand)}
                  onChange={() => toggleBrand(brand)}
                  style={checkboxStyle}
                />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {brand}
                </span>
                <span style={countStyle}>({count})</span>
              </label>
            ))}
            {filteredBrands.length === 0 && (
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                No brands found
              </span>
            )}
          </div>
        </div>
      )}

      {/* Sub-categories */}
      {subcategoryCounts.size > 0 && (
        <div style={sectionStyle}>
          <p style={sectionTitleStyle}>Type</p>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            {[...subcategoryCounts.entries()].map(([sub, count]) => (
              <label key={sub} style={labelRowStyle}>
                <input
                  type="checkbox"
                  checked={filters.subcategories.includes(sub)}
                  onChange={() => toggleSubcategory(sub)}
                  style={checkboxStyle}
                />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {sub}
                </span>
                <span style={countStyle}>({count})</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Rating */}
      <div style={sectionStyle}>
        <p style={sectionTitleStyle}>Customer rating</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {([4, 3] as const).map((val) => (
            <label key={val} style={labelRowStyle}>
              <input
                type="radio"
                name="minRating"
                checked={filters.minRating === val}
                onChange={() => toggleRating(val)}
                style={checkboxStyle}
              />
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                {val} <Star size={12} fill="currentColor" color="currentColor" /> &amp; above
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Clear all */}
      <button
        onClick={clearAll}
        style={{
          marginTop: 'auto',
          padding: '8px 16px',
          background: 'none',
          border: '1px solid var(--line)',
          borderRadius: 'var(--r-md)',
          color: 'var(--text-muted)',
          fontSize: '0.82rem',
          cursor: 'pointer',
          transition: `color var(--dur-fast) var(--ease-out)`,
        }}
      >
        Clear all
      </button>
    </div>
  )

  return (
    <>
      {/* Inline style tag for mobile media query */}
      <style>{`
        @media (max-width: 767px) {
          .filter-panel-close { display: inline-block !important; }
          .filter-panel-desktop { display: none !important; }
          .filter-panel-mobile { display: block !important; }
          .filter-panel-backdrop { display: block !important; }
        }
        @media (min-width: 768px) {
          .filter-panel-mobile { display: none !important; }
          .filter-panel-backdrop { display: none !important; }
        }
      `}</style>

      {/* Desktop: sticky sidebar */}
      <aside
        className="filter-panel-desktop"
        style={{
          width: 260,
          flexShrink: 0,
          position: 'sticky',
          top: 100,
          alignSelf: 'flex-start',
          background: 'var(--card)',
          borderRadius: 'var(--r-lg)',
          border: '1px solid var(--line)',
          maxHeight: 'calc(100vh - 120px)',
          overflowY: 'auto',
        }}
      >
        {panelContent}
      </aside>

      {/* Mobile: backdrop */}
      <div
        className="filter-panel-backdrop"
        onClick={onClose}
        style={{
          display: 'none',
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.45)',
          zIndex: 999,
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: `opacity var(--dur-mid) var(--ease-out)`,
        }}
      />

      {/* Mobile: drawer */}
      <aside
        className="filter-panel-mobile"
        style={{
          display: 'none',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          width: 300,
          zIndex: 1000,
          background: 'var(--card)',
          boxShadow: '4px 0 24px rgba(0,0,0,0.18)',
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: `transform var(--dur-mid) var(--ease-out)`,
          overflowY: 'auto',
        }}
      >
        {panelContent}
      </aside>
    </>
  )
}

export default FilterPanel
