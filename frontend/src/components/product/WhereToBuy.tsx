import { ExternalLink } from 'lucide-react'
import type { StoreLink } from '../../api/types'
import { formatINR } from '../../lib/format'
import { isSafeHttpUrl } from '../../lib/url'

interface Props {
  stores?: StoreLink[]
}

export default function WhereToBuy({ stores }: Props) {
  const storeList = Array.isArray(stores) ? stores : []

  // Find lowest price
  let minPrice = Infinity
  for (const s of storeList) {
    if (typeof s.price === 'number' && s.price > 0 && s.price < minPrice) {
      minPrice = s.price
    }
  }

  return (
    <section
      style={{
        padding: '24px',
        backgroundColor: 'var(--card)',
        borderRadius: 'var(--r-lg)',
        border: '1px solid var(--line)',
        marginTop: '32px',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <h2
        style={{
          margin: '0 0 16px',
          fontSize: '1.25rem',
          fontWeight: 600,
          fontFamily: 'Bodoni Moda, serif',
          color: 'var(--text)',
        }}
      >
        Where to buy
      </h2>

      {storeList.length === 0 ? (
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Store links coming soon.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {storeList.map((store, idx) => {
            const isCheapest = store.price === minPrice && minPrice !== Infinity
            const hasSafeUrl = isSafeHttpUrl(store.url)

            return (
              <div
                key={`${store.name}-${idx}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px',
                  padding: '12px 16px',
                  backgroundColor: 'var(--paper)',
                  borderRadius: 'var(--r-md)',
                  border: '1px solid var(--line)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)' }}>
                    {store.name}
                  </span>
                  {isCheapest && (
                    <span
                      style={{
                        backgroundColor: 'var(--verdict-great-bg)',
                        color: 'var(--verdict-great)',
                        border: '1px solid var(--verdict-great)',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 'var(--r-pill)',
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                      }}
                    >
                      Cheapest
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  {typeof store.price === 'number' && store.price > 0 && (
                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>
                      {formatINR(store.price)}
                    </span>
                  )}

                  {hasSafeUrl && (
                    <a
                      href={store.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 16px',
                        borderRadius: 'var(--r-pill)',
                        backgroundColor: 'var(--ink-900)',
                        color: 'var(--on-dark)',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        textDecoration: 'none',
                        letterSpacing: '0.02em',
                      }}
                    >
                      Visit {store.name}
                      <ExternalLink size={13} strokeWidth={1.8} />
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p
        style={{
          marginTop: '16px',
          marginBottom: 0,
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
          lineHeight: 1.5,
        }}
      >
        Store links open a search on the store. Prices shown here are demo data.
      </p>
    </section>
  )
}

