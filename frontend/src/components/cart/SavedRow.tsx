import { Link } from 'react-router-dom'
import { ShoppingCart, Trash2, Package } from 'lucide-react'
import type { SavedItem } from '../../store/cart'
import { formatINR } from '../../lib/format'

interface Props {
  item: SavedItem
  verdict?: 'good_time' | 'wait' | 'fair'
  onMoveToCart: (id: string) => void
  onRemove: (id: string) => void
}

export default function SavedRow({ item, verdict, onMoveToCart, onRemove }: Props) {
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>
            {formatINR(item.price)}
          </span>
          {verdict === 'good_time' && (
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
          {verdict === 'wait' && (
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
              Better to wait
            </span>
          )}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginLeft: 'auto',
        }}
      >
        <button
          type="button"
          onClick={() => onMoveToCart(item.productId)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 16px',
            borderRadius: 'var(--r-pill)',
            backgroundColor: 'var(--ink-900)',
            color: 'var(--on-dark)',
            border: 'none',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <ShoppingCart size={14} strokeWidth={1.8} />
          Move to cart
        </button>

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

