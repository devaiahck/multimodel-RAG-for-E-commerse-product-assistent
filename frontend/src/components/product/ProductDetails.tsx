import { ShoppingCart, Heart, Star, AlertTriangle, CheckCircle, Info, Scale } from 'lucide-react'
import type { Product } from '../../api/types'
import { formatINR } from '../../lib/format'
import { computeRealDiscount } from '../../lib/priceInsight'
import { useCartStore } from '../../store/cart'
import { useCompareStore } from '../../store/compare'
import { useToastStore } from '../ui/Toast'

interface Props {
  product: Product
}

export default function ProductDetails({ product }: Props) {
  const isSaved = useCartStore((s) => s.isSaved(product.id))
  const toggleSaved = useCartStore((s) => s.toggleSaved)
  const addToCart = useCartStore((s) => s.addToCart)
  const showToast = useToastStore((s) => s.showToast)
  const isCompared = useCompareStore((s) => s.isInCompare(product.id))
  const toggleCompare = useCompareStore((s) => s.toggleItem)

  const hasDiscount =
    Boolean(product.original_price) &&
    Boolean(product.price) &&
    (product.original_price as number) > product.price

  const discountPercent =
    product.discount_percentage && product.discount_percentage > 0
      ? Math.round(product.discount_percentage)
      : hasDiscount && product.original_price
        ? Math.round(((product.original_price - product.price) / product.original_price) * 100)
        : null

  const priceHistory = Array.isArray(product.price_history) ? product.price_history : []
  const avgPrice =
    priceHistory.length > 0
      ? Math.round(priceHistory.reduce((sum, p) => sum + p.price, 0) / priceHistory.length)
      : null

  const diffFromAvg = avgPrice !== null ? product.price - avgPrice : null

  const discountCheck = computeRealDiscount(
    priceHistory,
    product.price,
    product.original_price,
    90
  )

  const specsText =
    typeof product.specs === 'string'
      ? product.specs
      : product.specs && typeof product.specs === 'object'
        ? Object.entries(product.specs)
            .map(([k, v]) => `${k}: ${v}`)
            .join(' | ')
        : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
      {/* Brand & Title */}
      <div>
        {product.brand && (
          <span
            className="eyebrow"
            style={{ color: 'var(--champagne-deep)', fontSize: '0.75rem', display: 'block', marginBottom: '6px' }}
          >
            {product.brand}
          </span>
        )}
        <h1
          className="font-display"
          style={{
            fontSize: 'clamp(1.75rem, 4vw, 2.4rem)',
            fontWeight: 500,
            color: 'var(--text)',
            lineHeight: 1.25,
            margin: 0,
          }}
        >
          {product.title}
        </h1>
      </div>

      {/* Rating */}
      {typeof product.rating === 'number' && product.rating > 0 && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <Star size={16} strokeWidth={1.5} fill="var(--champagne)" style={{ color: 'var(--champagne-deep)' }} />
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)' }}>
            {product.rating.toFixed(1)}
          </span>
        </div>
      )}

      {/* Pricing row */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text)', fontFamily: 'Manrope, sans-serif' }}>
          {formatINR(product.price)}
        </span>

        {hasDiscount && (
          <>
            <span
              style={{
                fontSize: '1.1rem',
                color: 'var(--text-muted)',
                textDecoration: 'line-through',
              }}
            >
              {formatINR(product.original_price as number)}
            </span>

            {discountPercent && (
              <span
                style={{
                  backgroundColor: 'var(--ink-900)',
                  color: 'var(--champagne)',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: 'var(--r-pill)',
                  letterSpacing: '0.04em',
                }}
              >
                -{discountPercent}% OFF
              </span>
            )}
          </>
        )}
      </div>

      {/* Headline pill: difference from average price */}
      {diffFromAvg !== null && diffFromAvg !== 0 && (
        <div style={{ display: 'flex', alignItems: 'center', marginTop: '-6px' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '0.8rem',
              fontWeight: 600,
              padding: '4px 12px',
              borderRadius: 'var(--r-pill)',
              backgroundColor: diffFromAvg < 0 ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
              color: diffFromAvg < 0 ? '#15803d' : '#b91c1c',
            }}
          >
            {diffFromAvg < 0 ? (
              <>
                <span>↓</span>
                <span>{formatINR(Math.abs(diffFromAvg))} lower than average price</span>
              </>
            ) : (
              <>
                <span>↑</span>
                <span>{formatINR(diffFromAvg)} higher than average price</span>
              </>
            )}
          </span>
        </div>
      )}

      {/* Discount check card near price */}
      {discountCheck.verdict !== 'none' && (
        <div
          id="discount-check-card"
          style={{
            padding: '14px 16px',
            borderRadius: 'var(--r-lg, 12px)',
            backgroundColor: 'var(--bg, #f9fafb)',
            border: `1px solid ${
              discountCheck.verdict === 'genuine'
                ? 'rgba(34, 197, 94, 0.35)'
                : discountCheck.verdict === 'slightly_inflated'
                  ? 'rgba(249, 115, 22, 0.35)'
                  : 'rgba(239, 68, 68, 0.35)'
            }`,
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            maxWidth: '520px',
          }}
        >
          {/* Header with verdict badge */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--text-muted, #6b7280)',
              }}
            >
              Discount Check
            </span>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 'var(--r-pill, 9999px)',
                backgroundColor:
                  discountCheck.verdict === 'genuine'
                    ? 'rgba(34, 197, 94, 0.12)'
                    : discountCheck.verdict === 'slightly_inflated'
                      ? 'rgba(249, 115, 22, 0.12)'
                      : 'rgba(239, 68, 68, 0.12)',
                color:
                  discountCheck.verdict === 'genuine'
                    ? '#15803d'
                    : discountCheck.verdict === 'slightly_inflated'
                      ? '#c2410c'
                      : '#b91c1c',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              {discountCheck.verdict === 'genuine' && <CheckCircle size={12} strokeWidth={2.5} />}
              {discountCheck.verdict === 'slightly_inflated' && <Info size={12} strokeWidth={2.5} />}
              {discountCheck.verdict === 'inflated' && <AlertTriangle size={12} strokeWidth={2.5} />}
              {discountCheck.verdict === 'genuine'
                ? 'Genuine deal'
                : discountCheck.verdict === 'slightly_inflated'
                  ? 'Slightly inflated'
                  : 'Inflated discount'}
            </span>
          </div>

          {/* Explanation sentence */}
          <p
            style={{
              margin: 0,
              fontSize: '0.82rem',
              color: 'var(--text, #374151)',
              lineHeight: 1.45,
            }}
          >
            Claimed {discountCheck.claimedPct}% off MRP, but{' '}
            {discountCheck.realPct >= 0
              ? `only ${discountCheck.realPct}% below`
              : `${Math.abs(discountCheck.realPct)}% above`}{' '}
            the usual price ({formatINR(discountCheck.typicalPrice)} over the last 90 days).
          </p>

          {/* Two-bar visual */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '2px' }}>
            {/* Claimed discount bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.74rem' }}>
              <span style={{ width: '105px', color: 'var(--text-muted, #6b7280)', whiteSpace: 'nowrap' }}>
                Claimed (MRP)
              </span>
              <div style={{ flex: 1, height: '6px', backgroundColor: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${Math.min(discountCheck.claimedPct, 100)}%`,
                    height: '100%',
                    backgroundColor: '#64748b',
                    borderRadius: '3px',
                  }}
                />
              </div>
              <span style={{ width: '42px', textAlign: 'right', fontWeight: 600, color: 'var(--text-h, #111827)' }}>
                {discountCheck.claimedPct}%
              </span>
            </div>

            {/* Real discount bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.74rem' }}>
              <span style={{ width: '105px', color: 'var(--text-muted, #6b7280)', whiteSpace: 'nowrap' }}>
                Real discount
              </span>
              <div style={{ flex: 1, height: '6px', backgroundColor: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${Math.max(0, Math.min(discountCheck.realPct, 100))}%`,
                    height: '100%',
                    backgroundColor:
                      discountCheck.verdict === 'genuine'
                        ? '#16a34a'
                        : discountCheck.verdict === 'slightly_inflated'
                          ? '#ea580c'
                          : '#dc2626',
                    borderRadius: '3px',
                  }}
                />
              </div>
              <span
                style={{
                  width: '42px',
                  textAlign: 'right',
                  fontWeight: 700,
                  color:
                    discountCheck.verdict === 'genuine'
                      ? '#16a34a'
                      : discountCheck.verdict === 'slightly_inflated'
                        ? '#ea580c'
                        : '#dc2626',
                }}
              >
                {discountCheck.realPct}%
              </span>
            </div>
          </div>
        </div>
      )}


      {/* Availability text */}
      {product.availability && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: 'var(--verdict-great)',
            }}
          />
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>
            {product.availability}
          </span>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
        <button
          type="button"
          onClick={() => {
            addToCart(product)
            showToast('Added to cart')
          }}
          style={{
            flex: 1,
            backgroundColor: 'var(--ink-900)',
            color: 'var(--on-dark)',
            border: 'none',
            borderRadius: 'var(--r-pill)',
            padding: '14px 28px',
            fontSize: '0.9rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            minHeight: 48,
            letterSpacing: '0.04em',
          }}
        >
          <ShoppingCart size={16} strokeWidth={1.8} />
          Add to cart
        </button>

        <button
          type="button"
          aria-label={isSaved ? 'Remove from saved' : 'Save product'}
          onClick={() => toggleSaved(product)}
          style={{
            width: '48px',
            height: '48px',
            borderRadius: 'var(--r-pill)',
            backgroundColor: 'var(--card)',
            border: '1px solid var(--line)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isSaved ? 'var(--verdict-wait)' : 'var(--text-muted)',
            flexShrink: 0,
          }}
        >
          <Heart size={20} strokeWidth={1.6} fill={isSaved ? 'currentColor' : 'none'} />
        </button>

        <button
          type="button"
          aria-label={isCompared ? 'Remove from compare' : 'Add to compare'}
          onClick={() =>
            toggleCompare({
              id: product.id,
              title: product.title,
              price: product.price,
              imageUrl: product.image_url,
              brand: product.brand,
              category: product.category,
            })
          }
          style={{
            padding: '0 16px',
            height: '48px',
            borderRadius: 'var(--r-pill)',
            backgroundColor: isCompared ? 'var(--ink-900)' : 'var(--card)',
            color: isCompared ? '#ffffff' : 'var(--text)',
            border: '1px solid var(--line)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            fontSize: '0.82rem',
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          <Scale size={16} />
          {isCompared ? 'Comparing' : 'Compare'}
        </button>
      </div>

      {/* Specs string */}
      {specsText && (
        <div style={{ marginTop: '16px', borderTop: '1px solid var(--line)', paddingTop: '16px' }}>
          <h3
            style={{
              margin: '0 0 8px',
              fontSize: '0.75rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'var(--text-muted)',
            }}
          >
            Product details & specs
          </h3>
          <p
            style={{
              margin: 0,
              fontSize: '0.88rem',
              lineHeight: 1.6,
              color: 'var(--text)',
              fontFamily: 'Manrope, sans-serif',
            }}
          >
            {specsText}
          </p>
        </div>
      )}
    </div>
  )
}

