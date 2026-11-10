import { useMemo } from 'react'
import { Calendar, Tag, TrendingDown, Clock, Info } from 'lucide-react'
import type { PricePoint } from '../../api/types'
import { formatINR } from '../../lib/format'
import {
  detectPriceDips,
  matchDipsToSales,
  predictNextSale,
  computeBuyScore,
  type PriceDip,
  type SaleCalendarEntry,
} from '../../lib/priceInsight'
import rawCalendar from '../../config/saleCalendar.json'

interface Props {
  history?: PricePoint[] | null
  currentPrice: number
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return dateStr
  }
}

function formatShortDateRange(startStr: string, endStr: string): string {
  try {
    const d1 = new Date(startStr)
    const d2 = new Date(endStr)
    const opt: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
    const s1 = d1.toLocaleDateString('en-IN', opt)
    const s2 = d2.toLocaleDateString('en-IN', { ...opt, year: 'numeric' })
    return `${s1} – ${s2}`
  } catch {
    return `${startStr} – ${endStr}`
  }
}

export default function SaleWatchSection({ history, currentPrice }: Props) {
  const saleCalendar = rawCalendar as SaleCalendarEntry[]

  // Check history length in calendar days
  const historyDays = useMemo(() => {
    if (!history || history.length < 2) return 0
    const sorted = [...history].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )
    const d0 = new Date(sorted[0].date).getTime()
    const d1 = new Date(sorted[sorted.length - 1].date).getTime()
    return (d1 - d0) / (1000 * 86400)
  }, [history])

  // Detect and match dips to calendar sales
  const matchedDips = useMemo(() => {
    const rawDips = detectPriceDips(history)
    return matchDipsToSales(rawDips, saleCalendar)
  }, [history, saleCalendar])

  // Recent dips (max 3, most recent first)
  const recentDips = useMemo(() => {
    return [...matchedDips]
      .sort((a, b) => new Date(b.end).getTime() - new Date(a.end).getTime())
      .slice(0, 3)
  }, [matchedDips])

  // Lowest dip overall
  const lowestDip: PriceDip | null = useMemo(() => {
    if (matchedDips.length === 0) return null
    return [...matchedDips].sort((a, b) => a.lowestPrice - b.lowestPrice)[0]
  }, [matchedDips])

  // Buy score for current horizon (30 days)
  const buyScore = useMemo(() => {
    return computeBuyScore(history, currentPrice, 30).score
  }, [history, currentPrice])

  // Predict next upcoming sale
  const nextSale = useMemo(() => {
    return predictNextSale(new Date(), saleCalendar, matchedDips)
  }, [saleCalendar, matchedDips])

  const hasEnoughHistory = historyDays >= 45
  const canPredict = hasEnoughHistory && nextSale !== null && nextSale.expectedDropPct !== null

  return (
    <section
      aria-labelledby="sale-watch-heading"
      style={{
        marginTop: '32px',
        padding: '28px',
        backgroundColor: 'var(--card, #ffffff)',
        border: '1px solid var(--line, #e5e7eb)',
        borderRadius: 'var(--r-xl, 16px)',
        boxShadow: '0 2px 14px rgba(0,0,0,0.03)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              backgroundColor: 'rgba(217, 119, 6, 0.1)',
              color: '#b45309',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Calendar size={18} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2
                id="sale-watch-heading"
                className="font-display"
                style={{
                  margin: 0,
                  fontSize: '1.25rem',
                  fontWeight: 500,
                  color: 'var(--text-h, #111827)',
                }}
              >
                Sale Watch
              </h2>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '2px 8px',
                  borderRadius: 'var(--r-pill, 9999px)',
                  backgroundColor: 'rgba(217, 119, 6, 0.1)',
                  color: '#b45309',
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Event Timing
              </span>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--text-muted, #6b7280)' }}>
              Historical sale dip patterns and upcoming seasonal event intelligence.
            </p>
          </div>
        </div>

        {/* Lowest Sale Price Stat if a dip exists */}
        {lowestDip && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '8px 14px',
              backgroundColor: 'rgba(34, 197, 94, 0.08)',
              border: '1px solid rgba(34, 197, 94, 0.25)',
              borderRadius: 'var(--r-md, 10px)',
            }}
          >
            <div>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#15803d', textTransform: 'uppercase' }}>
                Lowest Sale Price
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#15803d', fontFamily: 'Manrope, sans-serif' }}>
                {formatINR(lowestDip.lowestPrice)}
              </div>
              <div style={{ fontSize: '0.66rem', color: 'var(--text-muted, #6b7280)' }}>
                on {formatDate(lowestDip.start)}
                {lowestDip.saleName ? ` (${lowestDip.saleName})` : ''}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Prediction Banner */}
      <div
        style={{
          padding: '16px 20px',
          borderRadius: 'var(--r-lg, 12px)',
          backgroundColor: canPredict ? 'rgba(99, 102, 241, 0.06)' : 'var(--bg, #f9fafb)',
          border: `1px solid ${canPredict ? 'rgba(99, 102, 241, 0.2)' : 'var(--line, #e5e7eb)'}`,
          marginBottom: '24px',
        }}
      >
        {canPredict ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <Clock size={18} color="#4f46e5" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '0.88rem', lineHeight: 1.5, color: 'var(--text-h, #111827)' }}>
              <strong>{nextSale.name}</strong> is in <strong>{nextSale.daysAway} days</strong>. Past dips on this
              product averaged <strong>{nextSale.expectedDropPct}%</strong> below the usual price. If you can wait, a
              sale may lower the price. Today's buy score: <strong>{buyScore}</strong>.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Info size={16} color="var(--text-muted, #6b7280)" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '0.86rem', color: 'var(--text-muted, #6b7280)' }}>
              Not enough price history yet to predict sales for this product.
            </span>
          </div>
        )}
      </div>

      {/* Past Price Dips Section */}
      <div style={{ marginBottom: '18px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px',
          }}
        >
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-h, #111827)' }}>
            Past Price Dips {recentDips.length > 0 ? `(${recentDips.length} recorded)` : ''}
          </div>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #6b7280)' }}>
            Runs of ≥2 consecutive points at least 8% below 30-day baseline
          </span>
        </div>

        {recentDips.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {recentDips.map((dip, idx) => (
              <div
                key={`${dip.start}-${idx}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px',
                  padding: '12px 16px',
                  borderRadius: 'var(--r-md, 10px)',
                  backgroundColor: 'var(--bg, #fbfbfb)',
                  border: '1px solid var(--line, #f0f0f0)',
                }}
              >
                {/* Left: Date range and matched sale */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <TrendingDown size={16} color="#15803d" />
                  <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-h, #111827)' }}>
                      {formatShortDateRange(dip.start, dip.end)}
                    </div>
                    {dip.saleName && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          marginTop: '2px',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(217, 119, 6, 0.1)',
                          color: '#b45309',
                          fontSize: '0.68rem',
                          fontWeight: 600,
                        }}
                      >
                        <Tag size={10} /> {dip.saleName}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: Lowest price and depth */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#15803d', fontFamily: 'Manrope, sans-serif' }}>
                    {formatINR(dip.lowestPrice)}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #6b7280)' }}>
                    <strong>{dip.depthPct}%</strong> below normal ({formatINR(dip.normalPrice)})
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              padding: '24px 16px',
              textAlign: 'center',
              backgroundColor: 'var(--bg, #fbfbfb)',
              border: '1px solid var(--line, #f0f0f0)',
              borderRadius: 'var(--r-md, 10px)',
              color: 'var(--text-muted, #6b7280)',
              fontSize: '0.82rem',
            }}
          >
            No major price dips detected in tracked history.
          </div>
        )}
      </div>

      {/* Footnote */}
      <div
        style={{
          marginTop: '16px',
          paddingTop: '12px',
          borderTop: '1px dashed var(--line, #e5e7eb)',
          fontSize: '0.74rem',
          color: 'var(--text-muted, #6b7280)',
        }}
      >
        * Based on this product's tracked price history. Predictions improve as more history is collected.
      </div>
    </section>
  )
}
