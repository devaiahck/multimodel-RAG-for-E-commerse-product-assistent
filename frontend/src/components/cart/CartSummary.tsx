import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { formatINR } from '../../lib/format'

interface Props {
  total: number
  itemCount: number
  onClearCart: () => void
}

export default function CartSummary({ total, itemCount, onClearCart }: Props) {
  const [confirming, setConfirming] = useState(false)

  return (
    <div
      style={{
        padding: '24px',
        backgroundColor: 'var(--card)',
        borderRadius: 'var(--r-lg)',
        border: '1px solid var(--line)',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        position: 'sticky',
        top: '80px',
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: '1.2rem',
          fontWeight: 600,
          fontFamily: 'Bodoni Moda, serif',
          color: 'var(--text)',
        }}
      >
        Order summary
      </h2>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          Items ({itemCount})
        </span>
        <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)' }}>
          {formatINR(total)}
        </span>
      </div>

      <div
        style={{
          borderTop: '1px solid var(--line)',
          paddingTop: '12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>
          Estimated total
        </span>
        <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text)' }}>
          {formatINR(total)}
        </span>
      </div>

      <p
        style={{
          margin: 0,
          fontSize: '0.78rem',
          color: 'var(--text-muted)',
          lineHeight: 1.45,
          backgroundColor: 'var(--paper)',
          padding: '10px 12px',
          borderRadius: 'var(--r-sm)',
        }}
      >
        Prices are estimates. You buy on the store's website.
      </p>

      {/* Clear cart with confirm step */}
      <div style={{ borderTop: '1px solid var(--line)', paddingTop: '12px' }}>
        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            style={{
              width: '100%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '10px',
              backgroundColor: 'transparent',
              color: 'var(--text-muted)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--r-pill)',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Trash2 size={14} strokeWidth={1.8} />
            Clear cart
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => {
                onClearCart()
                setConfirming(false)
              }}
              style={{
                flex: 1,
                padding: '10px',
                backgroundColor: 'var(--verdict-wait)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 'var(--r-pill)',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Confirm clear
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              style={{
                flex: 1,
                padding: '10px',
                backgroundColor: 'var(--tile)',
                color: 'var(--text)',
                border: 'none',
                borderRadius: 'var(--r-pill)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

