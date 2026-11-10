import { useEffect, useMemo } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useQueries } from '@tanstack/react-query'
import {
  ExternalLink,
  Star,
  Trophy,
  X,
  Plus,
  Image as ImageIcon,
} from 'lucide-react'
import { getProduct } from '../api/products'
import type { Product, StoreLink } from '../api/types'
import { formatINR } from '../lib/format'
import { computeBuyScore, computeRealDiscount } from '../lib/priceInsight'
import { useCompareStore, type CompareItem } from '../store/compare'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'

interface ProductComparisonData {
  product: Product
  currentPrice: number
  mrp: number | null
  rating: number
  buyScore: number
  buyVerdict: string
  buyLabel: string
  claimedPct: number
  realPct: number
  realVerdict: string
  typicalPrice: number
  cheapestStore: StoreLink | null
  allStores: Map<string, number>
  specsMap: Record<string, string>
  normalizedPrice: number
  normalizedRating: number
  valueScore: number
}

// ── Specs Alignment Helper ──────────────────────────────────────────────────

function parseAndAlignSpecs(specsRaw?: string | Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  if (!specsRaw) return result

  let rawList: string[] = []
  if (typeof specsRaw === 'string') {
    const delimiter = specsRaw.includes('|') ? '|' : ','
    rawList = specsRaw.split(delimiter).map((s) => s.trim()).filter(Boolean)
  } else if (typeof specsRaw === 'object' && !Array.isArray(specsRaw)) {
    for (const [k, v] of Object.entries(specsRaw)) {
      if (k && v) result[k.trim()] = String(v).trim()
    }
    return result
  }

  const otherFeatures: string[] = []

  for (const item of rawList) {
    if (item.includes(':')) {
      const idx = item.indexOf(':')
      const key = item.slice(0, idx).trim()
      const val = item.slice(idx + 1).trim()
      if (key && val) {
        result[key] = val
        continue
      }
    }
    otherFeatures.push(item)
  }

  if (otherFeatures.length > 0) {
    result['Features'] = otherFeatures.join(', ')
  }

  return result
}

function describeWinnerStrengths(winner: ProductComparisonData, others: ProductComparisonData[]): string {
  if (others.length === 0) {
    return `with a buy confidence score of ${winner.buyScore}/100, customer rating of ${winner.rating.toFixed(1)}/5, and pricing at ${formatINR(winner.currentPrice)}.`
  }

  const isLowestPrice = others.every((o) => winner.currentPrice <= o.currentPrice)
  const isCheaperThanSome = !isLowestPrice && others.some((o) => winner.currentPrice < o.currentPrice)
  const hasHigherRating = others.every((o) => winner.rating >= o.rating) && others.some((o) => winner.rating > o.rating)
  const hasTopBuyScore = others.every((o) => winner.buyScore >= o.buyScore) && others.some((o) => winner.buyScore > o.buyScore)

  const strengths: string[] = []

  // Praise buy score only if it is actually higher than others and not poor
  if (hasTopBuyScore && winner.buyScore >= 55) {
    strengths.push(`a superior buy confidence score (${winner.buyScore}/100, ${winner.buyLabel})`)
  }

  // Praise rating only if it is higher than others
  if (hasHigherRating) {
    strengths.push(`a higher customer rating (${winner.rating.toFixed(1)}/5)`)
  }

  // Praise price only if it is lowest or cheaper than some
  if (isLowestPrice) {
    strengths.push(`the lowest price (${formatINR(winner.currentPrice)})`)
  } else if (isCheaperThanSome) {
    strengths.push(`competitive pricing at ${formatINR(winner.currentPrice)}`)
  }

  // Real genuine discount if superior
  if (winner.realVerdict === 'genuine' && winner.realPct >= 10 && others.every((o) => winner.realPct >= o.realPct)) {
    strengths.push(`a genuine ${winner.realPct}% real discount`)
  }

  if (strengths.length === 0) {
    return `balancing customer rating (${winner.rating.toFixed(1)}/5) and pricing at ${formatINR(winner.currentPrice)}.`
  }

  if (strengths.length === 1) {
    return `highlighted by ${strengths[0]}.`
  }
  if (strengths.length === 2) {
    return `driven by ${strengths[0]} and ${strengths[1]}.`
  }
  return `combining ${strengths.slice(0, -1).join(', ')}, and ${strengths[strengths.length - 1]}.`
}

function getScoreLabel(product: Product): string {
  let name = product.title.trim()
  if (product.brand && name.toLowerCase().startsWith(product.brand.toLowerCase() + ' ')) {
    name = name.slice(product.brand.length).trim()
  }
  if (name.length > 25) {
    name = name.slice(0, 24).trim() + '…'
  }
  return name
}

export default function Compare() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { items: storedItems, setItems: setStoredItems, removeItem: removeStoredItem } = useCompareStore()

  // Parse product IDs from URL
  const idsParam = searchParams.get('ids') || ''
  const hasUrlIds = Boolean(idsParam.trim())
  const productIds = useMemo(() => {
    if (hasUrlIds) {
      return idsParam
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 3)
    }
    // Fall back to items stored in compare store
    return storedItems.map((i) => i.id).slice(0, 3)
  }, [hasUrlIds, idsParam, storedItems])

  // Synchronize URL if it was opened without query params but store had items
  useEffect(() => {
    if (!idsParam && productIds.length > 0) {
      setSearchParams({ ids: productIds.join(',') }, { replace: true })
    }
  }, [idsParam, productIds, setSearchParams])

  // Fetch product data for each ID
  const productQueries = useQueries({
    queries: productIds.map((id) => ({
      queryKey: ['compare-product', id],
      queryFn: ({ signal }: { signal: AbortSignal }) => getProduct(id, signal),
      staleTime: 5 * 60 * 1000,
    })),
  })

  const isLoading = productQueries.some((q) => q.isLoading)

  const loadedIds = productQueries.map((q) => q.data?.id).filter(Boolean).join(',')
  const products: Product[] = useMemo(() => {
    return productQueries
      .map((q) => q.data)
      .filter((p): p is Product => Boolean(p && p.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedIds])

  // Keep compare store in sync with loaded products
  useEffect(() => {
    if (products.length > 0) {
      const currentStoredIds = storedItems.map((i) => i.id).join(',')
      const newProductIds = products.map((p) => p.id).join(',')
      if (currentStoredIds !== newProductIds) {
        const itemsToSave: CompareItem[] = products.map((p) => ({
          id: p.id,
          title: p.title,
          price: p.price,
          imageUrl: p.image_url,
          brand: p.brand,
          category: p.category,
        }))
        setStoredItems(itemsToSave)
      }
    }
  }, [products, storedItems, setStoredItems])

  // Remove one product from comparison
  function handleRemoveProduct(idToRemove: string) {
    removeStoredItem(idToRemove)
    const nextIds = productIds.filter((id) => id !== idToRemove)
    if (nextIds.length > 0) {
      setSearchParams({ ids: nextIds.join(',') })
    } else {
      setSearchParams({})
    }
  }

  // ── Compute Compare Matrix and Value Metrics ─────────────────────────────
  const comparisonData = useMemo(() => {
    if (products.length === 0) return []

    const maxPriceAmongCompared = Math.max(...products.map((p) => p.price))

    return products.map((p) => {
      const currentPrice = p.price
      const mrp = p.original_price ? Number(p.original_price) : null
      const rating = p.rating ?? 0
      const history = Array.isArray(p.price_history) ? p.price_history : []

      // Buy Confidence Score
      const buyInfo = computeBuyScore(history, currentPrice, 30)
      const buyScore = buyInfo.score
      const buyVerdict = buyInfo.verdict
      const buyLabel = buyInfo.label

      // Real Discount Check
      const discountInfo = computeRealDiscount(history, currentPrice, mrp, 90)

      // Store Availability
      const stores = Array.isArray(p.store_availability) ? p.store_availability : []
      const allStores = new Map<string, number>()
      let cheapestStore: StoreLink | null = null
      let lowestStorePrice = Infinity

      for (const s of stores) {
        if (s.name) {
          const storePrice = typeof s.price === 'number' ? s.price : currentPrice
          allStores.set(s.name.toLowerCase(), storePrice)
          if (storePrice < lowestStorePrice) {
            lowestStorePrice = storePrice
            cheapestStore = s
          }
        }
      }

      // If no store links found, default to Amazon search
      if (!cheapestStore) {
        cheapestStore = {
          name: 'Amazon',
          price: currentPrice,
          url: `https://www.amazon.in/s?k=${encodeURIComponent(p.title)}`,
        }
      }

      // Absolute scaling for Value Pick (0-100)
      const normalizedRating = (rating / 5) * 100
      const normalizedPrice = maxPriceAmongCompared > 0 ? (currentPrice / maxPriceAmongCompared) * 100 : 100

      // Formula: buyScore * 0.5 + normalizedRating * 0.3 + (100 - normalizedPrice) * 0.2
      const valueScore =
        buyScore * 0.5 +
        normalizedRating * 0.3 +
        (100 - normalizedPrice) * 0.2

      return {
        product: p,
        currentPrice,
        mrp,
        rating,
        buyScore,
        buyVerdict,
        buyLabel,
        claimedPct: discountInfo.claimedPct,
        realPct: discountInfo.realPct,
        realVerdict: discountInfo.verdict,
        typicalPrice: discountInfo.typicalPrice,
        cheapestStore,
        allStores,
        specsMap: parseAndAlignSpecs(p.specs),
        normalizedPrice,
        normalizedRating,
        valueScore: Math.round(valueScore * 10) / 10,
      } as ProductComparisonData
    })
  }, [products])

  // Best-value Leaders
  const leaders = useMemo(() => {
    if (comparisonData.length === 0) return null

    const lowestPriceItem = [...comparisonData].sort((a, b) => a.currentPrice - b.currentPrice)[0]
    const highestRatingItem = [...comparisonData].sort((a, b) => b.rating - a.rating)[0]
    const highestBuyScoreItem = [...comparisonData].sort((a, b) => b.buyScore - a.buyScore)[0]
    const winnerItem = [...comparisonData].sort((a, b) => b.valueScore - a.valueScore)[0]

    const minPrice = Math.min(...comparisonData.map((d) => d.currentPrice))
    const maxPrice = Math.max(...comparisonData.map((d) => d.currentPrice))
    const isWidePriceRange = minPrice > 0 && maxPrice > minPrice * 3

    const bestValues = {
      minPrice,
      maxPrice,
      maxRating: Math.max(...comparisonData.map((d) => d.rating)),
      maxBuyScore: Math.max(...comparisonData.map((d) => d.buyScore)),
      maxRealDiscount: Math.max(...comparisonData.map((d) => d.realPct)),
    }

    return {
      lowestPriceItem,
      highestRatingItem,
      highestBuyScoreItem,
      winnerItem,
      bestValues,
      isWidePriceRange,
    }
  }, [comparisonData])

  // All unique store names found across all products
  const storeNames = useMemo(() => {
    const set = new Set<string>()
    comparisonData.forEach((d) => {
      d.allStores.forEach((_, name) => set.add(name))
    })
    // Provide standard fallbacks if empty
    if (set.size === 0) {
      set.add('amazon')
      set.add('flipkart')
    }
    return Array.from(set)
  }, [comparisonData])

  // Spec categories derived dynamically from compared products
  const specCategories = useMemo(() => {
    const keys = new Set<string>()
    comparisonData.forEach((d) => {
      Object.keys(d.specsMap).forEach((k) => keys.add(k))
    })
    return keys.size > 0 ? Array.from(keys) : ['Specifications']
  }, [comparisonData])

  // Render Loading
  if (isLoading) {
    return (
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '32px 16px' }}>
        <Skeleton width="220px" height="32px" style={{ marginBottom: '24px' }} />
        <Skeleton height="140px" style={{ marginBottom: '24px', borderRadius: '16px' }} />
        <Skeleton height="500px" style={{ borderRadius: '16px' }} />
      </div>
    )
  }

  // Render Empty State
  if (productIds.length === 0 || products.length === 0) {
    return (
      <div style={{ maxWidth: '800px', margin: '40px auto', padding: '40px 16px', textAlign: 'center' }}>
        <EmptyState
          title="No products selected for comparison"
          message="Select up to 3 products across our catalog to compare specifications, store pricing, and buy confidence side-by-side."
        />
        <div style={{ marginTop: '20px' }}>
          <Link
            to="/search"
            style={{
              padding: '10px 24px',
              borderRadius: 'var(--r-pill, 9999px)',
              backgroundColor: 'var(--ink-900, #111827)',
              color: '#ffffff',
              fontSize: '0.85rem',
              fontWeight: 600,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            Browse catalog
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '1320px', margin: '0 auto', padding: '32px 16px' }}>
      {/* Page Title & Breadcrumb */}
      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1
            className="font-display"
            style={{
              fontSize: 'clamp(1.5rem, 3vw, 2.2rem)',
              fontWeight: 500,
              color: 'var(--text-h, #111827)',
              margin: 0,
            }}
          >
            Compare Products
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted, #6b7280)' }}>
            Comparing {comparisonData.length} of 3 items side-by-side with store pricing & discount accuracy.
          </p>
        </div>

        {comparisonData.length < 3 && (
          <Link
            to="/search"
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--r-pill, 9999px)',
              border: '1px solid var(--line, #e5e7eb)',
              backgroundColor: 'var(--card, #ffffff)',
              color: 'var(--text-h, #111827)',
              fontSize: '0.8rem',
              fontWeight: 600,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Plus size={14} /> Add another product ({3 - comparisonData.length} remaining)
          </Link>
        )}
      </div>

      {/* ── Summary Box: "Which is better value?" ────────────────────────────── */}
      {leaders && (
        <section
          aria-labelledby="summary-box-heading"
          style={{
            marginBottom: '32px',
            padding: '24px',
            borderRadius: 'var(--r-xl, 16px)',
            backgroundColor: '#ffffff',
            border: '1px solid var(--line, #e5e7eb)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                backgroundColor: 'rgba(217, 119, 6, 0.12)',
                color: '#b45309',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Trophy size={18} />
            </div>
            <div>
              <h2
                id="summary-box-heading"
                style={{
                  margin: 0,
                  fontSize: '1.05rem',
                  fontWeight: 700,
                  color: 'var(--text-h, #111827)',
                }}
              >
                Which is better value?
              </h2>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #6b7280)' }}>
                Rule-based algorithmic comparison of price index, customer ratings, and timing buy scores.
              </div>
            </div>
          </div>

          {/* Note when wide price range */}
          {leaders.isWidePriceRange && (
            <div
              style={{
                marginBottom: '16px',
                padding: '12px 16px',
                borderRadius: 'var(--r-lg, 12px)',
                backgroundColor: 'var(--bg, #f9fafb)',
                border: '1px solid var(--line, #e5e7eb)',
                fontSize: '0.88rem',
                lineHeight: 1.5,
                color: 'var(--text-h, #111827)',
              }}
            >
              These products are in very different price ranges, so one overall winner would not be fair. Here is the best in each category:
            </div>
          )}

          {/* Metric Highlights Pill Row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '12px',
              marginBottom: leaders.isWidePriceRange ? '0px' : '18px',
            }}
          >
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 'var(--r-md, 8px)',
                backgroundColor: 'rgba(34, 197, 94, 0.07)',
                border: '1px solid rgba(34, 197, 94, 0.2)',
              }}
            >
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#15803d', textTransform: 'uppercase' }}>
                Lowest Price
              </div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-h, #111827)', marginTop: '2px' }}>
                {leaders.lowestPriceItem.product.title}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#15803d', fontWeight: 600 }}>
                {formatINR(leaders.lowestPriceItem.currentPrice)}
              </div>
            </div>

            <div
              style={{
                padding: '12px 14px',
                borderRadius: 'var(--r-md, 8px)',
                backgroundColor: 'rgba(217, 119, 6, 0.07)',
                border: '1px solid rgba(217, 119, 6, 0.2)',
              }}
            >
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#b45309', textTransform: 'uppercase' }}>
                Highest Rating
              </div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-h, #111827)', marginTop: '2px' }}>
                {leaders.highestRatingItem.product.title}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#b45309', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px' }}>
                <Star size={12} fill="#b45309" strokeWidth={0} /> {leaders.highestRatingItem.rating.toFixed(1)} / 5.0
              </div>
            </div>

            <div
              style={{
                padding: '12px 14px',
                borderRadius: 'var(--r-md, 8px)',
                backgroundColor: 'rgba(99, 102, 241, 0.07)',
                border: '1px solid rgba(99, 102, 241, 0.2)',
              }}
            >
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase' }}>
                Best Buy Score
              </div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-h, #111827)', marginTop: '2px' }}>
                {leaders.highestBuyScoreItem.product.title}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#4f46e5', fontWeight: 600 }}>
                {leaders.highestBuyScoreItem.buyScore}/100 ({leaders.highestBuyScoreItem.buyLabel})
              </div>
            </div>
          </div>

          {/* One-sentence recommendation (only when within 3x price range) */}
          {!leaders.isWidePriceRange && (
            <>
              <div
                style={{
                  padding: '14px 18px',
                  borderRadius: 'var(--r-lg, 12px)',
                  backgroundColor: 'var(--bg, #f9fafb)',
                  border: '1px solid var(--line, #e5e7eb)',
                  fontSize: '0.88rem',
                  lineHeight: 1.5,
                  color: 'var(--text-h, #111827)',
                }}
              >
                <strong>Our Pick:</strong> We recommend <strong>{leaders.winnerItem.product.title}</strong>{' '}
                because it scores the highest overall value (<strong>{leaders.winnerItem.valueScore}/100</strong>),{' '}
                {describeWinnerStrengths(
                  leaders.winnerItem,
                  comparisonData.filter((d) => d.product.id !== leaders.winnerItem.product.id)
                )}
              </div>

              {/* Value formula numbers breakdown */}
              <div style={{ marginTop: '12px', fontSize: '0.74rem', color: 'var(--text-muted, #6b7280)' }}>
                * Value Score calculation: (Buy Score × 50%) + (Normalized Rating × 30%) + ((100 - Normalized Price) × 20%).{' '}
                Scores: {comparisonData.map((d) => `${getScoreLabel(d.product)} ${d.valueScore}/100`).join(' | ')}
              </div>
            </>
          )}
        </section>
      )}

      {/* ── Side-by-Side Comparison Table ────────────────────────────────────── */}
      <section
        aria-label="Side-by-side product specifications and pricing comparison"
        style={{
          backgroundColor: '#ffffff',
          borderRadius: 'var(--r-xl, 16px)',
          border: '1px solid var(--line, #e5e7eb)',
          overflow: 'hidden',
          boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
        }}
      >
        <div style={{ overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left',
              minWidth: '640px',
            }}
          >
            <tbody>
              {/* Row 1: Header / Product Cards */}
              <tr style={{ borderBottom: '1px solid var(--line, #e5e7eb)' }}>
                <th
                  style={{
                    position: 'sticky',
                    left: 0,
                    zIndex: 10,
                    backgroundColor: '#ffffff',
                    width: '180px',
                    padding: '20px 16px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    color: 'var(--text-muted, #6b7280)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    verticalAlign: 'top',
                    boxShadow: '2px 0 4px rgba(0,0,0,0.03)',
                  }}
                >
                  Product
                </th>
                {comparisonData.map((d) => (
                  <td
                    key={d.product.id}
                    style={{
                      padding: '20px 16px',
                      verticalAlign: 'top',
                      width: `${82 / comparisonData.length}%`,
                      borderLeft: '1px solid var(--line, #e5e7eb)',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ position: 'relative', width: '90px', height: '90px', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#f3f4f6' }}>
                        {d.product.image_url ? (
                          <img
                            src={d.product.image_url}
                            alt={d.product.title}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <ImageIcon size={28} color="#9ca3af" strokeWidth={1.5} />
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveProduct(d.product.id)}
                          title="Remove from comparison"
                          style={{
                            position: 'absolute',
                            top: '4px',
                            right: '4px',
                            background: 'rgba(0,0,0,0.6)',
                            border: 'none',
                            color: '#ffffff',
                            borderRadius: '50%',
                            width: '20px',
                            height: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                          }}
                        >
                          <X size={12} />
                        </button>
                      </div>

                      {d.product.brand && (
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--champagne-deep, #92400e)' }}>
                          {d.product.brand}
                        </div>
                      )}

                      <Link
                        to={`/product/${d.product.id}`}
                        style={{
                          fontSize: '0.9rem',
                          fontWeight: 700,
                          color: 'var(--text-h, #111827)',
                          textDecoration: 'none',
                          lineHeight: 1.35,
                        }}
                      >
                        {d.product.title}
                      </Link>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', color: 'var(--text-muted, #6b7280)' }}>
                        <Star size={13} fill="#b45309" strokeWidth={0} />
                        <span style={{ fontWeight: 600, color: 'var(--text-h, #111827)' }}>{d.rating.toFixed(1)}</span>
                      </div>
                    </div>
                  </td>
                ))}
              </tr>

              {/* Row 2: Price */}
              <tr style={{ borderBottom: '1px solid var(--line, #e5e7eb)' }}>
                <th
                  style={{
                    position: 'sticky',
                    left: 0,
                    zIndex: 10,
                    backgroundColor: '#ffffff',
                    padding: '14px 16px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: 'var(--text-muted, #6b7280)',
                    boxShadow: '2px 0 4px rgba(0,0,0,0.03)',
                  }}
                >
                  Current Price
                </th>
                {comparisonData.map((d) => {
                  const isLowest = leaders && d.currentPrice === leaders.bestValues.minPrice
                  return (
                    <td
                      key={d.product.id}
                      style={{
                        padding: '14px 16px',
                        borderLeft: '1px solid var(--line, #e5e7eb)',
                        backgroundColor: isLowest ? 'rgba(34, 197, 94, 0.1)' : 'transparent',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '1.05rem', fontWeight: 800, color: isLowest ? '#15803d' : 'var(--text-h, #111827)' }}>
                          {formatINR(d.currentPrice)}
                        </span>
                        {isLowest && (
                          <span style={{ fontSize: '0.65rem', fontWeight: 700, backgroundColor: '#15803d', color: '#ffffff', padding: '1px 6px', borderRadius: '4px' }}>
                            LOWEST
                          </span>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>

              {/* Row 3: MRP & Claimed Discount */}
              <tr style={{ borderBottom: '1px solid var(--line, #e5e7eb)', backgroundColor: '#fafafa' }}>
                <th
                  style={{
                    position: 'sticky',
                    left: 0,
                    zIndex: 10,
                    backgroundColor: '#fafafa',
                    padding: '14px 16px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: 'var(--text-muted, #6b7280)',
                    boxShadow: '2px 0 4px rgba(0,0,0,0.03)',
                  }}
                >
                  MRP & Claimed %
                </th>
                {comparisonData.map((d) => (
                  <td
                    key={d.product.id}
                    style={{
                      padding: '14px 16px',
                      borderLeft: '1px solid var(--line, #e5e7eb)',
                      fontSize: '0.82rem',
                    }}
                  >
                    {d.mrp ? (
                      <div>
                        <span style={{ color: 'var(--text-muted, #6b7280)', textDecoration: 'line-through' }}>
                          {formatINR(d.mrp)}
                        </span>{' '}
                        <span style={{ fontWeight: 700, color: 'var(--text-h, #111827)' }}>
                          (-{d.claimedPct}%)
                        </span>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-muted, #9ca3af)' }}>—</span>
                    )}
                  </td>
                ))}
              </tr>

              {/* Row 4: Real Discount */}
              <tr style={{ borderBottom: '1px solid var(--line, #e5e7eb)' }}>
                <th
                  style={{
                    position: 'sticky',
                    left: 0,
                    zIndex: 10,
                    backgroundColor: '#ffffff',
                    padding: '14px 16px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: 'var(--text-muted, #6b7280)',
                    boxShadow: '2px 0 4px rgba(0,0,0,0.03)',
                  }}
                >
                  Real Discount
                </th>
                {comparisonData.map((d) => {
                  const isBestReal = leaders && d.realPct === leaders.bestValues.maxRealDiscount && d.realPct > 0
                  return (
                    <td
                      key={d.product.id}
                      style={{
                        padding: '14px 16px',
                        borderLeft: '1px solid var(--line, #e5e7eb)',
                        backgroundColor: isBestReal ? 'rgba(34, 197, 94, 0.1)' : 'transparent',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 800, fontSize: '0.9rem', color: isBestReal ? '#15803d' : 'var(--text-h, #111827)' }}>
                            {d.realPct}%
                          </span>
                          {d.realVerdict === 'genuine' && (
                            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#15803d', backgroundColor: 'rgba(34, 197, 94, 0.12)', padding: '1px 6px', borderRadius: '4px' }}>
                              Genuine deal
                            </span>
                          )}
                          {d.realVerdict === 'inflated' && (
                            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#b91c1c', backgroundColor: 'rgba(239, 68, 68, 0.12)', padding: '1px 6px', borderRadius: '4px' }}>
                              Inflated MRP
                            </span>
                          )}
                          {d.realVerdict === 'slightly_inflated' && (
                            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#c2410c', backgroundColor: 'rgba(249, 115, 22, 0.12)', padding: '1px 6px', borderRadius: '4px' }}>
                              Slightly inflated
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted, #6b7280)' }}>
                          vs {formatINR(d.typicalPrice)} 90d median
                        </div>
                      </div>
                    </td>
                  )
                })}
              </tr>

              {/* Row 5: Buy Confidence Score */}
              <tr style={{ borderBottom: '1px solid var(--line, #e5e7eb)', backgroundColor: '#fafafa' }}>
                <th
                  style={{
                    position: 'sticky',
                    left: 0,
                    zIndex: 10,
                    backgroundColor: '#fafafa',
                    padding: '14px 16px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: 'var(--text-muted, #6b7280)',
                    boxShadow: '2px 0 4px rgba(0,0,0,0.03)',
                  }}
                >
                  Buy Confidence Score
                </th>
                {comparisonData.map((d) => {
                  const isBestScore = leaders && d.buyScore === leaders.bestValues.maxBuyScore
                  return (
                    <td
                      key={d.product.id}
                      style={{
                        padding: '14px 16px',
                        borderLeft: '1px solid var(--line, #e5e7eb)',
                        backgroundColor: isBestScore ? 'rgba(34, 197, 94, 0.1)' : 'transparent',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.95rem', fontWeight: 800, color: isBestScore ? '#15803d' : 'var(--text-h, #111827)' }}>
                          {d.buyScore}/100
                        </span>
                        <span
                          style={{
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: '4px',
                            backgroundColor:
                              d.buyVerdict === 'buy_now'
                                ? 'rgba(34, 197, 94, 0.12)'
                                : d.buyVerdict === 'wait'
                                  ? 'rgba(249, 115, 22, 0.12)'
                                  : 'rgba(107, 114, 128, 0.12)',
                            color:
                              d.buyVerdict === 'buy_now'
                                ? '#15803d'
                                : d.buyVerdict === 'wait'
                                  ? '#c2410c'
                                  : '#374151',
                          }}
                        >
                          {d.buyLabel}
                        </span>
                      </div>
                    </td>
                  )
                })}
              </tr>

              {/* Rows 6+: Store Availability */}
              {storeNames.map((st) => (
                <tr key={st} style={{ borderBottom: '1px solid var(--line, #e5e7eb)' }}>
                  <th
                    style={{
                      position: 'sticky',
                      left: 0,
                      zIndex: 10,
                      backgroundColor: '#ffffff',
                      padding: '12px 16px',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      color: 'var(--text-muted, #6b7280)',
                      textTransform: 'capitalize',
                      boxShadow: '2px 0 4px rgba(0,0,0,0.03)',
                    }}
                  >
                    Price on {st}
                  </th>
                  {comparisonData.map((d) => {
                    const price = d.allStores.get(st.toLowerCase())
                    const isCheapestStore = d.cheapestStore?.name.toLowerCase() === st.toLowerCase()
                    return (
                      <td
                        key={d.product.id}
                        style={{
                          padding: '12px 16px',
                          borderLeft: '1px solid var(--line, #e5e7eb)',
                          fontSize: '0.82rem',
                        }}
                      >
                        {price !== undefined ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-h, #111827)' }}>
                              {formatINR(price)}
                            </span>
                            {isCheapestStore && (
                              <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#15803d', backgroundColor: 'rgba(34, 197, 94, 0.1)', padding: '1px 5px', borderRadius: '3px' }}>
                                CHEAPEST
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted, #9ca3af)' }}>Not listed</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}

              {/* Spec Categories */}
              {specCategories.map((cat, idx) => (
                <tr
                  key={cat}
                  style={{
                    borderBottom: '1px solid var(--line, #e5e7eb)',
                    backgroundColor: idx % 2 === 0 ? '#fafafa' : '#ffffff',
                  }}
                >
                  <th
                    style={{
                      position: 'sticky',
                      left: 0,
                      zIndex: 10,
                      backgroundColor: idx % 2 === 0 ? '#fafafa' : '#ffffff',
                      padding: '14px 16px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: 'var(--text-muted, #6b7280)',
                      boxShadow: '2px 0 4px rgba(0,0,0,0.03)',
                    }}
                  >
                    {cat}
                  </th>
                  {comparisonData.map((d) => (
                    <td
                      key={d.product.id}
                      style={{
                        padding: '14px 16px',
                        borderLeft: '1px solid var(--line, #e5e7eb)',
                        fontSize: '0.82rem',
                        lineHeight: 1.45,
                        color: 'var(--text-h, #374151)',
                      }}
                    >
                      {d.specsMap[cat] || '—'}
                    </td>
                  ))}
                </tr>
              ))}

              {/* Action Buttons Row */}
              <tr style={{ backgroundColor: '#ffffff' }}>
                <th
                  style={{
                    position: 'sticky',
                    left: 0,
                    zIndex: 10,
                    backgroundColor: '#ffffff',
                    padding: '20px 16px',
                    boxShadow: '2px 0 4px rgba(0,0,0,0.03)',
                  }}
                >
                  Action
                </th>
                {comparisonData.map((d) => (
                  <td
                    key={d.product.id}
                    style={{
                      padding: '20px 16px',
                      borderLeft: '1px solid var(--line, #e5e7eb)',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <a
                        href={d.cheapestStore?.url || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          padding: '10px 16px',
                          borderRadius: 'var(--r-pill, 9999px)',
                          backgroundColor: 'var(--ink-900, #111827)',
                          color: '#ffffff',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          textAlign: 'center',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                        }}
                      >
                        Buy on {d.cheapestStore?.name || 'Store'} <ExternalLink size={13} />
                      </a>
                      <Link
                        to={`/product/${d.product.id}`}
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: 'var(--champagne-deep, #92400e)',
                          textAlign: 'center',
                          textDecoration: 'none',
                        }}
                      >
                        View Full Details →
                      </Link>
                    </div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
