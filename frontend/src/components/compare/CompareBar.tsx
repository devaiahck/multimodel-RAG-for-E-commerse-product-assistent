import { Link, useLocation } from 'react-router-dom'
import { X, ArrowRight, Scale, Trash2, Image as ImageIcon } from 'lucide-react'
import { useCompareStore } from '../../store/compare'
import { formatINR } from '../../lib/format'

export default function CompareBar() {
  const { items, removeItem, clearCompare } = useCompareStore()
  const location = useLocation()

  // Do not render on the compare page itself
  if (items.length === 0 || location.pathname === '/compare') {
    return null
  }

  const compareUrl = `/compare?ids=${items.map((i) => encodeURIComponent(i.id)).join(',')}`

  return (
    <aside
      aria-label="Product comparison dock"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 45,
        backgroundColor: 'rgba(255, 255, 255, 0.96)',
        backdropFilter: 'blur(10px)',
        borderTop: '1px solid var(--line, #e5e7eb)',
        boxShadow: '0 -4px 16px rgba(0, 0, 0, 0.08)',
        padding: '12px 20px',
      }}
    >
      <div
        style={{
          maxWidth: '1280px',
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        {/* Left: Indicator & Thumbnails */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#4f46e5',
              }}
            >
              <Scale size={16} />
            </div>
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-h, #111827)' }}>
                Compare ({items.length}/3)
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #6b7280)' }}>
                Select up to 3 products
              </div>
            </div>
          </div>

          {/* Product chips / thumbnails */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {items.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '4px 8px 4px 6px',
                  borderRadius: 'var(--r-md, 8px)',
                  backgroundColor: 'var(--bg, #f3f4f6)',
                  border: '1px solid var(--line, #e5e7eb)',
                }}
              >
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '4px',
                      objectFit: 'cover',
                      backgroundColor: '#ffffff',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '4px',
                      backgroundColor: '#e5e7eb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      color: '#6b7280',
                    }}
                  >
                    <ImageIcon size={14} color="#6b7280" strokeWidth={1.5} />
                  </div>
                )}
                <div style={{ maxWidth: '120px' }}>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: 'var(--text-h, #111827)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {item.title}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted, #6b7280)' }}>
                    {formatINR(item.price)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  title="Remove"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#9ca3af',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = '#ef4444')}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = '#9ca3af')}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={clearCompare}
            style={{
              padding: '7px 14px',
              borderRadius: 'var(--r-pill, 9999px)',
              border: '1px solid var(--line, #e5e7eb)',
              backgroundColor: 'transparent',
              color: 'var(--text-muted, #6b7280)',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Trash2 size={13} /> Clear
          </button>

          <Link
            to={compareUrl}
            style={{
              padding: '8px 20px',
              borderRadius: 'var(--r-pill, 9999px)',
              backgroundColor: 'var(--ink-900, #111827)',
              color: '#ffffff',
              fontSize: '0.82rem',
              fontWeight: 700,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            Compare ({items.length}) <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </aside>
  )
}
