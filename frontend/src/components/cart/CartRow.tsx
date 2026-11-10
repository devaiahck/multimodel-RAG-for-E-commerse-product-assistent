import { Link } from 'react-router-dom'
import { ExternalLink, Trash2, Bookmark, Plus, Minus, Package } from 'lucide-react'
import type { CartItem } from '../../store/cart'
import { formatINR, isSafeHttpUrl } from '../../lib/format'

interface Props {
  item: CartItem
  onSetQty: (id: string, qty: number) => void
  onRemove: (id: string) => void
  onMoveToSaved: (id: string) => void
}

export default function CartRow({ item, onSetQty, onRemove, onMoveToSaved }: Props) {
  const hasSafeUrl = isSafeHttpUrl(item.storeUrl)
  const storeName = item.store || 'store'

  return (
    <article
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '16px',
        padding: '16px',
        backgroundColor: 'var(--card)',
        borderRadius: 'var(--r-md)',
        border: '1px solid var(--line)',
      }}
    >
      {/* Thumbnail or fallback */}
      <Link
        to={`/product/${item.productId}`}
        style={{
          width: '72px',
          height: '72px',
          borderRadius: 'var(--r-sm)',
          backgroundColor: 'var(--tile)',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          textDecoration: 'none',
        }}
        aria-label={item.title}
      >
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.title}
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <Package size={28} strokeWidth={1.2} style={{ opacity: 0.35, color: 'var(--text-muted)' }} />
        )}
      </Link>

      {/* Details */}
      <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {item.brand && (
          <span className="eyebrow" style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>
            {item.brand}
          </span>
        )}
        <Link
          to={`/product/${item.productId}`}
          style={{
            color: 'var(--text)',
            fontSize: '0.92rem',
            fontWeight: 600,
            textDecoration: 'none',
            lineHeight: 1.35,
          }}
        >
          {item.title}
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>
            {formatINR(item.price)}
          </span>
          {item.originalPrice && item.originalPrice > item.price && (
            <span
              style={{
                fontSize: '0.78rem',
                color: 'var(--text-muted)',
                textDecoration: 'line-through',
              }}
            >
              {formatINR(item.originalPrice)}
            </span>
          )}
        </div>
      </div>

      {/* Stepper + Actions */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '12px',
          marginLeft: 'auto',
        }}
      >
        {/* Qty Stepper */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            border: '1px solid var(--line)',
            borderRadius: 'var(--r-pill)',
            backgroundColor: 'var(--tile)',
            overflow: 'hidden',
          }}
        >
          <button
            type="button"
            aria-label="Decrease quantity"
            disabled={item.qty <= 1}
            onClick={() => onSetQty(item.productId, item.qty - 1)}
            style={{
              background: 'none',
              border: 'none',
              padding: '6px 10px',
              cursor: item.qty <= 1 ? 'not-allowed' : 'pointer',
              opacity: item.qty <= 1 ? 0.4 : 1,
              color: 'var(--text)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Minus size={14} strokeWidth={2} />
          </button>
          <span
            style={{
              padding: '0 8px',
              fontSize: '0.85rem',
              fontWeight: 600,
              minWidth: '24px',
              textAlign: 'center',
              color: 'var(--text)',
            }}
          >
            {item.qty}
          </span>
          <button
            type="button"
            aria-label="Increase quantity"
            disabled={item.qty >= 10}
            onClick={() => onSetQty(item.productId, item.qty + 1)}
            style={{
              background: 'none',
              border: 'none',
              padding: '6px 10px',
              cursor: item.qty >= 10 ? 'not-allowed' : 'pointer',
              opacity: item.qty >= 10 ? 0.4 : 1,
              color: 'var(--text)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Plus size={14} strokeWidth={2} />
          </button>
        </div>

        {/* Buy on store button */}
        {hasSafeUrl && (
          <a
            href={item.storeUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: 'var(--r-pill)',
              backgroundColor: 'var(--ink-900)',
              color: 'var(--on-dark)',
              fontSize: '0.78rem',
              fontWeight: 600,
              textDecoration: 'none',
              letterSpacing: '0.02em',
            }}
          >
            Buy on {storeName}
            <ExternalLink size={13} strokeWidth={1.8} />
          </a>
        )}

        {/* Move to saved */}
        <button
          type="button"
          aria-label="Save for later"
          onClick={() => onMoveToSaved(item.productId)}
          title="Save for later"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '8px',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            borderRadius: 'var(--r-sm)',
          }}
        >
          <Bookmark size={16} strokeWidth={1.6} />
        </button>

        {/* Remove */}
        <button
          type="button"
          aria-label="Remove item"
          onClick={() => onRemove(item.productId)}
          title="Remove"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '8px',
            color: 'var(--verdict-wait)',
            display: 'flex',
            alignItems: 'center',
            borderRadius: 'var(--r-sm)',
          }}
        >
          <Trash2 size={16} strokeWidth={1.6} />
        </button>
      </div>
    </article>
  )
}

