import { useState, useEffect, useMemo } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { X, RotateCcw } from 'lucide-react'
import ProductCard, { toCardData } from '../components/product/ProductCard'
import EmptyState from '../components/ui/EmptyState'
import ErrorState from '../components/ui/ErrorState'
import SearchSkeletonGrid from '../components/search/SearchSkeletonGrid'
import Chip from '../components/ui/Chip'
import CategoryFilters from '../components/category/CategoryFilters'
import CategoryFilterPanel, {
  getSubCategory,
  type FilterState,
  type BrandCount,
  type SubcategoryCount,
} from '../components/category/CategoryFilterPanel'
import { useCategory } from '../hooks/useCategory'
import type { CatalogSort } from '../services/catalogService'
import { formatINR } from '../lib/format'
import { computeRealDiscount } from '../lib/priceInsight'

function titleCase(str: string): string {
  return str
    .replace(/[-_]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

export default function Category() {
  const { slug = '' } = useParams<{ slug: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false)

  // ── URL state parsing ───────────────────────────────────────────────────
  const rawSort = searchParams.get('sort')
  const currentSort: CatalogSort =
    rawSort === 'price_asc' ||
    rawSort === 'price_desc' ||
    rawSort === 'rating' ||
    rawSort === 'real_discount_desc'
      ? rawSort
      : 'discount'

  const minParam = searchParams.get('min') || ''
  const maxParam = searchParams.get('max') || ''
  const brandParam = searchParams.get('brand') || ''
  const subcatParam = searchParams.get('subcat') || ''
  const ratingParam = searchParams.get('rating') || ''
  const hideInflated = searchParams.get('hide_inflated') === 'true'

  const selectedBrands = useMemo(
    () => (brandParam ? brandParam.split(',').map((b) => b.trim()).filter(Boolean) : []),
    [brandParam]
  )
  const selectedSubcategories = useMemo(
    () => (subcatParam ? subcatParam.split(',').map((s) => s.trim()).filter(Boolean) : []),
    [subcatParam]
  )
  const minRating = ratingParam && !isNaN(Number(ratingParam)) ? Number(ratingParam) : null

  const categoryName = titleCase(slug)

  useEffect(() => {
    document.title = `${categoryName || 'Category'} – UrbanPick`
  }, [categoryName])

  // Fetch full category list (limit: 100)
  const { data, isLoading, isError, error, refetch } = useCategory({
    slug: slug.trim() ? slug : undefined,
    limit: 100,
  })

  const allProducts = useMemo(() => {
    if (!data?.pages) return []
    return data.pages.flatMap((p) => p.items)
  }, [data?.pages])

  // ── Compute metadata from all loaded products ───────────────────────────
  const { brands, subcategories, catalogMinPrice, catalogMaxPrice } = useMemo(() => {
    const brandMap = new Map<string, number>()
    const subcatMap = new Map<string, number>()
    let minP = Infinity
    let maxP = -Infinity

    for (const p of allProducts) {
      if (p.brand) {
        brandMap.set(p.brand, (brandMap.get(p.brand) || 0) + 1)
      }
      const sub = getSubCategory(p.category)
      if (sub) {
        subcatMap.set(sub, (subcatMap.get(sub) || 0) + 1)
      }
      if (typeof p.price === 'number') {
        if (p.price < minP) minP = p.price
        if (p.price > maxP) maxP = p.price
      }
    }

    const brandList: BrandCount[] = Array.from(brandMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name))

    const subcatList: SubcategoryCount[] = Array.from(subcatMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name))

    return {
      brands: brandList,
      subcategories: subcatList,
      catalogMinPrice: minP === Infinity ? 0 : minP,
      catalogMaxPrice: maxP === -Infinity ? 0 : maxP,
    }
  }, [allProducts])

  // ── Client-side filtering & sorting ─────────────────────────────────────
  const filteredProducts = useMemo(() => {
    const minVal = minParam && !isNaN(Number(minParam)) ? Number(minParam) : null
    const maxVal = maxParam && !isNaN(Number(maxParam)) ? Number(maxParam) : null

    const list = allProducts.filter((product) => {
      // 1. Price
      if (minVal !== null && product.price < minVal) return false
      if (maxVal !== null && product.price > maxVal) return false

      // 2. Brand
      if (selectedBrands.length > 0) {
        if (!product.brand || !selectedBrands.includes(product.brand)) return false
      }

      // 3. Subcategory (split on " - ")
      if (selectedSubcategories.length > 0) {
        const sub = getSubCategory(product.category)
        if (!sub || !selectedSubcategories.includes(sub)) return false
      }

      // 4. Rating
      if (minRating !== null) {
        if (!product.rating || product.rating < minRating) return false
      }

      // 5. Hide inflated discounts
      if (hideInflated) {
        const hist = Array.isArray(product.price_history) ? product.price_history : []
        const rd = computeRealDiscount(hist, product.price, product.original_price, 90)
        if (rd.verdict === 'inflated') return false
      }

      return true
    })

    // Sort
    return list.sort((a, b) => {
      if (currentSort === 'price_asc') return a.price - b.price
      if (currentSort === 'price_desc') return b.price - a.price
      if (currentSort === 'rating') return (b.rating ?? 0) - (a.rating ?? 0)
      if (currentSort === 'real_discount_desc') {
        const histA = Array.isArray(a.price_history) ? a.price_history : []
        const histB = Array.isArray(b.price_history) ? b.price_history : []
        const realA = computeRealDiscount(histA, a.price, a.original_price, 90).realPct
        const realB = computeRealDiscount(histB, b.price, b.original_price, 90).realPct
        return realB - realA
      }
      // 'discount' / 'best deals'
      const discA =
        a.discount_percentage ??
        (a.original_price && a.price && a.original_price > a.price
          ? ((a.original_price - a.price) / a.original_price) * 100
          : 0)
      const discB =
        b.discount_percentage ??
        (b.original_price && b.price && b.original_price > b.price
          ? ((b.original_price - b.price) / b.original_price) * 100
          : 0)
      return discB - discA
    })
  }, [allProducts, minParam, maxParam, selectedBrands, selectedSubcategories, minRating, hideInflated, currentSort])

  // ── Filter update handlers ──────────────────────────────────────────────
  const activeFiltersCount =
    (minParam ? 1 : 0) +
    (maxParam ? 1 : 0) +
    selectedBrands.length +
    selectedSubcategories.length +
    (minRating !== null ? 1 : 0) +
    (hideInflated ? 1 : 0)

  const hasActiveFilters = activeFiltersCount > 0

  function handleFilterChange(next: FilterState) {
    const nextParams = new URLSearchParams(searchParams)

    if (next.minPrice && !isNaN(Number(next.minPrice))) nextParams.set('min', next.minPrice)
    else nextParams.delete('min')

    if (next.maxPrice && !isNaN(Number(next.maxPrice))) nextParams.set('max', next.maxPrice)
    else nextParams.delete('max')

    if (next.selectedBrands.length > 0) nextParams.set('brand', next.selectedBrands.join(','))
    else nextParams.delete('brand')

    if (next.selectedSubcategories.length > 0) nextParams.set('subcat', next.selectedSubcategories.join(','))
    else nextParams.delete('subcat')

    if (next.minRating !== null) nextParams.set('rating', String(next.minRating))
    else nextParams.delete('rating')

    if (next.hideInflatedDiscounts) nextParams.set('hide_inflated', 'true')
    else nextParams.delete('hide_inflated')

    setSearchParams(nextParams)
  }

  function handleClearAll() {
    const nextParams = new URLSearchParams()
    if (currentSort !== 'discount') nextParams.set('sort', currentSort)
    setSearchParams(nextParams)
  }

  function handleSortChange(newSort: CatalogSort) {
    const next = new URLSearchParams(searchParams)
    next.set('sort', newSort)
    setSearchParams(next)
  }

  function removeBrand(brandToRemove: string) {
    const next = selectedBrands.filter((b) => b !== brandToRemove)
    const nextParams = new URLSearchParams(searchParams)
    if (next.length > 0) nextParams.set('brand', next.join(','))
    else nextParams.delete('brand')
    setSearchParams(nextParams)
  }

  function removeSubcategory(subcatToRemove: string) {
    const next = selectedSubcategories.filter((s) => s !== subcatToRemove)
    const nextParams = new URLSearchParams(searchParams)
    if (next.length > 0) nextParams.set('subcat', next.join(','))
    else nextParams.delete('subcat')
    setSearchParams(nextParams)
  }

  function clearPrice() {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('min')
    nextParams.delete('max')
    setSearchParams(nextParams)
  }

  function clearRating() {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('rating')
    setSearchParams(nextParams)
  }

  const currentFilters: FilterState = {
    minPrice: minParam,
    maxPrice: maxParam,
    selectedBrands,
    selectedSubcategories,
    minRating,
    hideInflatedDiscounts: hideInflated,
  }

  return (
    <div style={{ padding: '32px 0 64px', minHeight: '80vh' }}>
      <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Header bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
            paddingBottom: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
            <h1
              style={{
                margin: 0,
                fontSize: 'clamp(1.6rem, 3vw, 2.2rem)',
                fontFamily: 'Bodoni Moda, serif',
                fontWeight: 500,
                color: 'var(--text-h)',
              }}
            >
              {categoryName}
            </h1>
            {!isLoading && allProducts.length > 0 && (
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {hasActiveFilters
                  ? `Showing ${filteredProducts.length} of ${allProducts.length} products`
                  : `${allProducts.length} products`}
              </span>
            )}
          </div>

          <CategoryFilters
            sort={currentSort}
            onSortChange={handleSortChange}
            onOpenMobileFilters={() => setIsMobileFiltersOpen(true)}
            activeFiltersCount={activeFiltersCount}
          />
        </div>

        {/* States */}
        {isLoading ? (
          <SearchSkeletonGrid />
        ) : isError ? (
          <ErrorState message={error ? error.message : 'Unable to load category products.'} onRetry={() => refetch()} />
        ) : allProducts.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', margin: '40px 0' }}>
            <EmptyState title="No products in this category yet." message="We couldn't find any products in this collection." />
            <Link to="/" style={{ color: 'var(--champagne-deep)', textDecoration: 'underline', fontSize: '0.9rem' }}>
              Back to Home
            </Link>
          </div>
        ) : (
          /* Main two-column layout */
          <div style={{ display: 'flex', gap: '28px', alignItems: 'flex-start' }}>
            {/* Desktop Left Sidebar / Mobile Drawer */}
            <CategoryFilterPanel
              catalogMinPrice={catalogMinPrice}
              catalogMaxPrice={catalogMaxPrice}
              brands={brands}
              subcategories={subcategories}
              filters={currentFilters}
              onFilterChange={handleFilterChange}
              onClearAll={handleClearAll}
              hasActiveFilters={hasActiveFilters}
              isOpenMobile={isMobileFiltersOpen}
              onCloseMobile={() => setIsMobileFiltersOpen(false)}
            />

            {/* Right column: active chips + product grid */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Active filter chips */}
              {hasActiveFilters && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    flexWrap: 'wrap',
                    padding: '8px 12px',
                    backgroundColor: 'var(--card)',
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--r-md)',
                  }}
                >
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                    Active filters:
                  </span>

                  {/* Brand chips */}
                  {selectedBrands.map((b) => (
                    <Chip key={b} active onClick={() => removeBrand(b)}>
                      <span>{b}</span>
                      <X size={12} />
                    </Chip>
                  ))}

                  {/* Subcategory chips */}
                  {selectedSubcategories.map((s) => (
                    <Chip key={s} active onClick={() => removeSubcategory(s)}>
                      <span>{s}</span>
                      <X size={12} />
                    </Chip>
                  ))}

                  {/* Price chip */}
                  {(minParam || maxParam) && (
                    <Chip active onClick={clearPrice}>
                      <span>
                        Price: {minParam ? formatINR(Number(minParam)) : '₹' + catalogMinPrice} –{' '}
                        {maxParam ? formatINR(Number(maxParam)) : '₹' + catalogMaxPrice}
                      </span>
                      <X size={12} />
                    </Chip>
                  )}

                  {/* Rating chip */}
                  {minRating !== null && (
                    <Chip active onClick={clearRating}>
                      <span>{minRating} stars & above</span>
                      <X size={12} />
                    </Chip>
                  )}

                  {/* Hide inflated discounts chip */}
                  {hideInflated && (
                    <Chip
                      active
                      onClick={() => {
                        const nextParams = new URLSearchParams(searchParams)
                        nextParams.delete('hide_inflated')
                        setSearchParams(nextParams)
                      }}
                    >
                      <span>No inflated discounts</span>
                      <X size={12} />
                    </Chip>
                  )}

                  {/* Clear all link */}
                  <button
                    onClick={handleClearAll}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--champagne-deep)',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      marginLeft: 'auto',
                      padding: '4px 6px',
                    }}
                  >
                    <RotateCcw size={12} />
                    Clear all
                  </button>
                </div>
              )}

              {/* Product grid or empty filter result */}
              {filteredProducts.length === 0 ? (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '16px',
                    padding: '48px 20px',
                    backgroundColor: 'var(--card)',
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--r-lg)',
                    textAlign: 'center',
                  }}
                >
                  <EmptyState
                    title="No products match your filters"
                    message="Try clearing or adjusting some filters to see more products."
                  />
                  <button
                    onClick={handleClearAll}
                    style={{
                      padding: '9px 18px',
                      borderRadius: 'var(--r-pill)',
                      border: 'none',
                      backgroundColor: 'var(--ink-900)',
                      color: 'var(--on-dark)',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Clear all filters
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredProducts.map((product) => (
                    <ProductCard key={product.id} product={toCardData(product)} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
