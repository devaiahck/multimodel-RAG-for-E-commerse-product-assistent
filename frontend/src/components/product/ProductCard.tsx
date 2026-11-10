import { useState } from 'react'
import { ShoppingCart, Heart, Star, Shirt, Footprints, Watch, Cpu, Home, Sparkles, Dumbbell, Package } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Product } from '../../api/types'
import { useCartStore } from '../../store/cart'
import { useToastStore } from '../ui/Toast'
import { useCompareStore } from '../../store/compare'
import {
  getQuickVerdict,
  computeRealDiscount,
  type QuickVerdict,
  type RealDiscountVerdict,
} from '../../lib/priceInsight'

export interface ProductCardData {
  id: string
  title: string
  brand?: string
  price: number
  originalPrice?: number
  discountPercentage?: number
  rating?: number
  imageUrl?: string
  category?: string
  store?: string
  storeUrl?: string
  quickVerdict?: QuickVerdict
  discountVerdict?: RealDiscountVerdict
  realDiscountPct?: number
  savingsBadge?: string
}

export function toCardData(product: Product): ProductCardData {
  let store: string | undefined
  let storeUrl: string | undefined
  if (Array.isArray(product.store_availability) && product.store_availability.length > 0) {
    const valid = product.store_availability.filter((s) => typeof s.price === 'number')
    const list = valid.length > 0 ? [...valid].sort((a, b) => (a.price ?? 0) - (b.price ?? 0)) : product.store_availability
    const best = list[0]
    store = best.name || (best as unknown as { store?: string }).store
    storeUrl = best.url
  }

  let quickVerdict: QuickVerdict = null
  const history = Array.isArray(product.price_history) ? product.price_history : []
  if (history.length >= 5) {
    quickVerdict = getQuickVerdict(history, product.price)
  }

  let discountVerdict: RealDiscountVerdict = 'none'
  let realDiscountPct: number | undefined
  if (product.original_price && history.length > 0) {
    const rd = computeRealDiscount(history, product.price, product.original_price, 90)
    discountVerdict = rd.verdict
    realDiscountPct = rd.realPct
  }

  return {
    id: product.id,
    title: product.title,
    brand: product.brand,
    price: product.price,
    originalPrice: product.original_price,
    discountPercentage: product.discount_percentage,
    rating: product.rating,
    imageUrl: product.image_url,
    category: product.category,
    store,
    storeUrl,
    quickVerdict,
    discountVerdict,
    realDiscountPct,
  }
}

interface Props {
  product: ProductCardData
  matchPercent?: number
  onAddToCart?: (id: string) => void
  onSave?: (id: string) => void
}

function formatINR(amount: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

/** Returns the category icon component for the placeholder tile */
function CategoryIcon({ category }: { category?: string }) {
  const cat = category?.toLowerCase() ?? ''
  const size = 40
  const sw = 1.2
  const style = { opacity: 0.35, color: 'var(--text-muted)' }

  if (cat.includes('cloth') || cat.includes('shirt')) return <Shirt size={size} strokeWidth={sw} style={style} />
  if (cat.includes('shoe') || cat.includes('foot')) return <Footprints size={size} strokeWidth={sw} style={style} />
  if (cat.includes('watch')) return <Watch size={size} strokeWidth={sw} style={style} />
  if (cat.includes('electron') || cat.includes('tech')) return <Cpu size={size} strokeWidth={sw} style={style} />
  if (cat.includes('home') || cat.includes('lamp') || cat.includes('table')) return <Home size={size} strokeWidth={sw} style={style} />
  if (cat.includes('beauty') || cat.includes('cosmet')) return <Sparkles size={size} strokeWidth={sw} style={style} />
  if (cat.includes('sport') || cat.includes('gym')) return <Dumbbell size={size} strokeWidth={sw} style={style} />
  return <Package size={size} strokeWidth={sw} style={style} />
}

/** Only show brand if it's a real value (not the placeholder string) */
function isRealBrand(brand?: string) {
  if (!brand) return false
  const upper = brand.trim().toUpperCase()
  return upper !== 'BRAND' && upper !== '' && upper !== 'N/A'
}

export default function ProductCard({ product, matchPercent, onAddToCart, onSave }: Props) {
  const [imgError, setImgError] = useState(false)
  const isSaved = useCartStore((s) => s.isSaved(product.id))
  const toggleSaved = useCartStore((s) => s.toggleSaved)
  const addToCart = useCartStore((s) => s.addToCart)
  const showToast = useToastStore((s) => s.showToast)
  const isCompared = useCompareStore((s) => s.isInCompare(product.id))
  const toggleCompare = useCompareStore((s) => s.toggleItem)

  /* Only compute discount when both prices are real and price < originalPrice */
  const discount =
    product.discountPercentage && product.discountPercentage > 0
      ? product.discountPercentage
      : product.originalPrice && product.price && product.originalPrice > product.price
        ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
        : undefined

  const hasImage = Boolean(product.imageUrl) && !imgError

  return (
    <article
      style={{
        backgroundColor: 'var(--card)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r-lg)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transition: `transform var(--dur-mid) var(--ease-out), box-shadow var(--dur-mid)`,
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement
        el.style.transform = 'translateY(-2px)'
        el.style.boxShadow = '0 4px 20px rgba(0,0,0,0.08)'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement
        el.style.transform = 'translateY(0)'
        el.style.boxShadow = 'none'
      }}
    >
      {/* Image */}
      <div
        style={{
          position: 'relative',
          backgroundColor: 'var(--tile)',
          aspectRatio: '4/3',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {hasImage ? (
          <img
            src={product.imageUrl}
            alt={product.title}
            loading="lazy"
            width={400}
            height={300}
            onError={() => setImgError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          /* Tinted tile with category icon – no broken-image icon */
          <CategoryIcon category={product.category} />
        )}

        {/* Discount badge – with Inflated MRP tag when applicable */}
        {discount && discount > 0 && (
          <div
            style={{
              position: 'absolute',
              top: '10px',
              left: '10px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: '4px',
              zIndex: 2,
            }}
          >
            <span
              style={{
                backgroundColor: 'var(--ink-900)',
                color: 'var(--champagne)',
                fontSize: '0.65rem',
                fontWeight: 700,
                letterSpacing: '0.04em',
                padding: '3px 8px',
                borderRadius: 'var(--r-pill)',
              }}
            >
              -{discount}%
            </span>

            {product.discountVerdict === 'inflated' && (
              <span
                title={`The real discount is ${product.realDiscountPct ?? 0}%`}
                style={{
                  backgroundColor: '#dc2626',
                  color: '#ffffff',
                  fontSize: '0.6rem',
                  fontWeight: 700,
                  letterSpacing: '0.03em',
                  padding: '2px 6px',
                  borderRadius: 'var(--r-pill)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  cursor: 'help',
                  whiteSpace: 'nowrap',
                }}
              >
                Inflated MRP
              </span>
            )}
          </div>
        )}

        {/* Save */}
        <button
          aria-label={isSaved ? 'Remove from saved' : 'Save item'}
          onClick={() => {
            toggleSaved(product)
            onSave?.(product.id)
          }}
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            background: 'rgba(255,255,255,0.9)',
            border: 'none',
            borderRadius: 'var(--r-pill)',
            padding: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            color: isSaved ? 'var(--verdict-wait)' : 'var(--text-muted)',
          }}
        >
          <Heart size={14} strokeWidth={1.5} fill={isSaved ? 'currentColor' : 'none'} />
        </button>
      </div>

      {/* Info */}
      <div style={{ padding: '12px', flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {/* Brand – only if it's a real brand name */}
        {isRealBrand(product.brand) && (
          <p
            className="eyebrow"
            style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}
          >
            {product.brand}
          </p>
        )}

        <Link
          to={`/product/${product.id}`}
          style={{
            color: 'var(--text)',
            textDecoration: 'none',
            fontSize: '0.82rem',
            fontWeight: 500,
            lineHeight: 1.4,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {product.title}
        </Link>

        {typeof matchPercent === 'number' && (
          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 600,
              color: 'var(--champagne-deep)',
              fontFamily: 'Manrope, sans-serif',
            }}
          >
            {matchPercent}% match
          </span>
        )}

        {/* Rating and price-insight badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '6px',
            flexWrap: 'wrap',
            minHeight: '20px',
          }}
        >
          {typeof product.rating === 'number' && product.rating > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Star size={11} strokeWidth={1.5} style={{ color: 'var(--champagne-deep)' }} />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {product.rating.toFixed(1)}
              </span>
            </div>
          ) : (
            <div />
          )}

          {product.quickVerdict === 'buy' && (
            <span
              style={{
                fontSize: '0.65rem',
                fontWeight: 600,
                color: '#15803d',
                backgroundColor: 'rgba(34, 197, 94, 0.12)',
                padding: '2px 7px',
                borderRadius: 'var(--r-pill)',
                letterSpacing: '0.02em',
              }}
            >
              Good time to buy
            </span>
          )}
          {product.quickVerdict === 'wait' && (
            <span
              style={{
                fontSize: '0.65rem',
                fontWeight: 600,
                color: '#c2410c',
                backgroundColor: 'rgba(249, 115, 22, 0.12)',
                padding: '2px 7px',
                borderRadius: 'var(--r-pill)',
                letterSpacing: '0.02em',
              }}
            >
              Wait
            </span>
          )}
        </div>

        {/* Price row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '6px',
            flexWrap: 'wrap',
            marginTop: 'auto',
            paddingTop: '6px',
          }}
        >
          <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)' }}>
            {formatINR(product.price)}
          </span>
          {product.originalPrice && product.originalPrice > product.price && (
            <span
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                textDecoration: 'line-through',
              }}
            >
              {formatINR(product.originalPrice)}
            </span>
          )}
          {product.store && (
            <span
              style={{
                fontSize: '0.72rem',
                color: 'var(--text-muted)',
                fontWeight: 500,
              }}
            >
              on {product.store}
            </span>
          )}
        </div>

        {/* Savings Badge (for Similar But Cheaper) */}
        {product.savingsBadge && (
          <div style={{ marginTop: '2px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '2px 8px',
                borderRadius: 'var(--r-pill)',
                backgroundColor: 'rgba(34, 197, 94, 0.12)',
                color: '#15803d',
                fontSize: '0.7rem',
                fontWeight: 700,
                letterSpacing: '0.02em',
              }}
            >
              {product.savingsBadge}
            </span>
          </div>
        )}
      </div>

      {/* Compare Checkbox & Add to cart */}
      <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.72rem',
              fontWeight: isCompared ? 600 : 500,
              color: isCompared ? 'var(--text-h, #111827)' : 'var(--text-muted, #6b7280)',
              cursor: 'pointer',
              userSelect: 'none',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={isCompared}
              onChange={() =>
                toggleCompare({
                  id: product.id,
                  title: product.title,
                  price: product.price,
                  imageUrl: product.imageUrl,
                  brand: product.brand,
                  category: product.category,
                })
              }
              style={{
                accentColor: 'var(--ink-900, #111827)',
                width: '13px',
                height: '13px',
                cursor: 'pointer',
              }}
            />
            <span>Compare</span>
          </label>
        </div>

        <button
          aria-label={`Add ${product.title} to cart`}
          onClick={() => {
            addToCart(product)
            showToast('Added to cart')
            onAddToCart?.(product.id)
          }}
          style={{
            width: '100%',
            backgroundColor: 'var(--ink-900)',
            color: 'var(--on-dark)',
            border: 'none',
            borderRadius: 'var(--r-pill)',
            padding: '9px',
            fontSize: '0.75rem',
            fontWeight: 600,
            letterSpacing: '0.05em',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            minHeight: 40,
            transition: `opacity var(--dur-fast)`,
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.opacity = '0.85')
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.opacity = '1')
          }
        >
          <ShoppingCart size={13} strokeWidth={1.5} />
          Add to cart
        </button>
      </div>
    </article>
  )
}
