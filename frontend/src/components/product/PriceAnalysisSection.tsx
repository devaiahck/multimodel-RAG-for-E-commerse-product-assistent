import { useState, useMemo, useRef } from 'react'
import { Bell, ExternalLink, TrendingDown, TrendingUp, ShieldCheck, AlertCircle } from 'lucide-react'
import type { PricePoint, StoreLink } from '../../api/types'
import { formatINR } from '../../lib/format'
import { computeBuyScore, detectPriceDips } from '../../lib/priceInsight'
import { useToastStore } from '../ui/Toast'

export type RangeTab = '7D' | '1M' | '3M' | 'MAX'

const RANGE_DAYS: Record<RangeTab, number | undefined> = {
  '7D': 7,
  '1M': 30,
  '3M': 90,
  MAX: undefined,
}

interface Props {
  history?: PricePoint[] | null
  currentPrice: number
  stores?: StoreLink[]
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return dateStr
  }
}

function formatMonth(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-IN', { month: 'short' })
  } catch {
    return dateStr
  }
}

/**
 * Custom SVG Semicircle Gauge
 */
function SemicircleGauge({ score, color }: { score: number; color: string }) {
  const r = 70
  const cx = 90
  const cy = 85
  const strokeWidth = 11

  // Semicircle perimeter = PI * r
  const circumference = Math.PI * r
  const strokeDashoffset = circumference * (1 - score / 100)

  return (
    <div style={{ position: 'relative', width: 180, height: 100, margin: '0 auto' }}>
      <svg width={180} height={105} viewBox="0 0 180 105" style={{ overflow: 'visible' }}>
        {/* Track arc (180deg semicircle from left to right) */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="var(--line, #e5e7eb)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Progress arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ transition: 'stroke-dashoffset 0.6s ease-out, stroke 0.3s ease' }}
        />
      </svg>

      {/* Center text inside semicircle */}
      <div
        style={{
          position: 'absolute',
          top: 32,
          left: 0,
          right: 0,
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <span
          style={{
            fontSize: '2.5rem',
            fontWeight: 800,
            lineHeight: 1,
            color: 'var(--text-h, #111827)',
            fontFamily: 'Manrope, sans-serif',
          }}
        >
          {score}
        </span>
        <span
          style={{
            fontSize: '0.65rem',
            fontWeight: 700,
            letterSpacing: '0.12em',
            color: 'var(--text-muted, #6b7280)',
            marginTop: '2px',
          }}
        >
          SCORE
        </span>
      </div>
    </div>
  )
}

/**
 * Interactive SVG Area Chart
 */
function PriceAreaChart({
  points,
  rangeMin,
  rangeMax,
}: {
  points: PricePoint[]
  rangeMin: number
  rangeMax: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const width = 580
  const height = 240
  const padding = { top: 20, right: 30, bottom: 35, left: 60 }

  const chartW = width - padding.left - padding.right
  const chartH = height - padding.top - padding.bottom

  const yMin = Math.max(0, Math.floor(rangeMin * 0.95))
  const yMax = Math.ceil(rangeMax * 1.05)
  const ySpan = yMax - yMin || 1

  const coordinates = useMemo(() => {
    if (points.length <= 1) {
      return [{ x: padding.left + chartW / 2, y: padding.top + chartH / 2 }]
    }
    return points.map((p, i) => {
      const x = padding.left + (i / (points.length - 1)) * chartW
      const y = padding.top + chartH - ((p.price - yMin) / ySpan) * chartH
      return { x, y }
    })
  }, [points, yMin, ySpan, chartW, chartH, padding.left, padding.top])

  // Area path string
  const areaPath = useMemo(() => {
    if (coordinates.length === 0) return ''
    const lineParts = coordinates.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    const firstX = coordinates[0].x.toFixed(1)
    const lastX = coordinates[coordinates.length - 1].x.toFixed(1)
    const bottomY = (padding.top + chartH).toFixed(1)
    return `${lineParts.join(' ')} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`
  }, [coordinates, padding.top, chartH])

  // Stroke path string
  const strokePath = useMemo(() => {
    if (coordinates.length === 0) return ''
    return coordinates.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ')
  }, [coordinates])

  // Lowest price horizontal line Y coordinate
  const lowestY = padding.top + chartH - ((rangeMin - yMin) / ySpan) * chartH

  // X-axis month ticks: pick distinct month transitions
  const xTicks = useMemo(() => {
    if (points.length <= 1) return []
    const ticks: { x: number; label: string }[] = []
    let lastMonth = ''

    points.forEach((p, i) => {
      const m = formatMonth(p.date)
      if (m !== lastMonth) {
        ticks.push({
          x: padding.left + (i / (points.length - 1)) * chartW,
          label: m,
        })
        lastMonth = m
      }
    })

    return ticks
  }, [points, padding.left, chartW])

  // Y-axis ticks
  const yTicks = useMemo(() => {
    const count = 4
    const ticks: { y: number; val: number }[] = []
    for (let i = 0; i < count; i++) {
      const val = Math.round(yMin + (i / (count - 1)) * ySpan)
      const y = padding.top + chartH - ((val - yMin) / ySpan) * chartH
      ticks.push({ y, val })
    }
    return ticks
  }, [yMin, ySpan, padding.top, chartH])

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!containerRef.current || coordinates.length === 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const svgX = (mouseX / rect.width) * width

    // Find closest point by X
    let closestDist = Infinity
    let closestIdx = 0
    coordinates.forEach((c, idx) => {
      const dist = Math.abs(c.x - svgX)
      if (dist < closestDist) {
        closestDist = dist
        closestIdx = idx
      }
    })
    setHoverIndex(closestIdx)
  }

  const activePoint = hoverIndex !== null ? points[hoverIndex] : null
  const activeCoord = hoverIndex !== null ? coordinates[hoverIndex] : null

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id="price-history-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Horizontal gridlines */}
        {yTicks.map((t, idx) => (
          <g key={idx}>
            <line
              x1={padding.left}
              y1={t.y}
              x2={padding.left + chartW}
              y2={t.y}
              stroke="var(--line, #f3f4f6)"
              strokeDasharray="3 3"
              strokeWidth={1}
            />
            <text
              x={padding.left - 8}
              y={t.y + 3}
              textAnchor="end"
              fontSize={10}
              fill="var(--text-muted, #9ca3af)"
              fontFamily="Manrope, sans-serif"
            >
              {formatINR(t.val)}
            </text>
          </g>
        ))}

        {/* Lowest price dashed line */}
        {lowestY >= padding.top && lowestY <= padding.top + chartH && (
          <g>
            <line
              x1={padding.left}
              y1={lowestY}
              x2={padding.left + chartW}
              y2={lowestY}
              stroke="#15803d"
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
            <rect
              x={padding.left + chartW - 90}
              y={lowestY - 18}
              width={90}
              height={16}
              rx={3}
              fill="rgba(34, 197, 94, 0.15)"
            />
            <text
              x={padding.left + chartW - 45}
              y={lowestY - 6}
              textAnchor="middle"
              fontSize={9.5}
              fontWeight={700}
              fill="#15803d"
              fontFamily="Manrope, sans-serif"
            >
              Lowest: {formatINR(rangeMin)}
            </text>
          </g>
        )}

        {/* Gradient Area Fill */}
        <path d={areaPath} fill="url(#price-history-gradient)" />

        {/* Stroke Line */}
        <path d={strokePath} fill="none" stroke="#16a34a" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />

        {/* X-axis labels */}
        {xTicks.map((t, idx) => (
          <text
            key={idx}
            x={t.x}
            y={padding.top + chartH + 18}
            textAnchor="middle"
            fontSize={10.5}
            fill="var(--text-muted, #9ca3af)"
            fontFamily="Manrope, sans-serif"
          >
            {t.label}
          </text>
        ))}

        {/* Hover vertical crosshair & dot */}
        {activeCoord && (
          <g pointerEvents="none">
            <line
              x1={activeCoord.x}
              y1={padding.top}
              x2={activeCoord.x}
              y2={padding.top + chartH}
              stroke="#16a34a"
              strokeWidth={1.2}
              strokeDasharray="2 2"
            />
            <circle cx={activeCoord.x} cy={activeCoord.y} r={5} fill="#16a34a" stroke="#ffffff" strokeWidth={2} />
          </g>
        )}
      </svg>

      {/* Floating Tooltip Card */}
      {activePoint && activeCoord && (
        <div
          style={{
            position: 'absolute',
            left: `${(activeCoord.x / width) * 100}%`,
            top: `${(activeCoord.y / height) * 100}%`,
            transform: 'translate(-50%, -120%)',
            pointerEvents: 'none',
            backgroundColor: 'var(--ink-900, #111827)',
            color: 'var(--on-dark, #ffffff)',
            padding: '5px 9px',
            borderRadius: '6px',
            fontSize: '0.72rem',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
            zIndex: 10,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#86efac' }}>
            {formatINR(activePoint.price)}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.68rem' }}>
            {formatDate(activePoint.date)}
          </div>
        </div>
      )}
    </div>
  )
}

export default function PriceAnalysisSection({ history, currentPrice, stores = [] }: Props) {
  const [activeTab, setActiveTab] = useState<RangeTab>('3M')
  const showToast = useToastStore((s) => s.showToast)

  // Compute buy score & stats for the active range
  const rangeDays = RANGE_DAYS[activeTab]
  const buyScore = useMemo(
    () => computeBuyScore(history, currentPrice, rangeDays),
    [history, currentPrice, rangeDays]
  )

  // Detect price dips for "Lowest sale price" stat
  const lowestDip = useMemo(() => {
    const dips = detectPriceDips(history)
    if (dips.length === 0) return null
    return [...dips].sort((a, b) => a.lowestPrice - b.lowestPrice)[0]
  }, [history])

  // Cheapest store
  const cheapestStore = useMemo(() => {
    if (!stores || stores.length === 0) return null
    const valid = stores.filter((s) => typeof s.price === 'number')
    if (valid.length > 0) {
      return [...valid].sort((a, b) => (a.price ?? 0) - (b.price ?? 0))[0]
    }
    return stores[0]
  }, [stores])

  // Filter history points for chart
  const chartPoints = useMemo(() => {
    if (!history || history.length === 0) return []
    const sorted = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    if (!rangeDays) return sorted
    const lastDate = new Date(sorted[sorted.length - 1].date).getTime()
    const cutoff = lastDate - rangeDays * 86400 * 1000
    const filtered = sorted.filter((p) => new Date(p.date).getTime() >= cutoff)
    return filtered.length > 0 ? filtered : sorted
  }, [history, rangeDays])

  // Verdict theme colors
  const verdictColor =
    buyScore.score >= 70 ? '#15803d' : buyScore.score >= 40 ? '#ca8a04' : '#dc2626'
  const verdictBg =
    buyScore.score >= 70
      ? 'rgba(34, 197, 94, 0.12)'
      : buyScore.score >= 40
        ? 'rgba(234, 179, 8, 0.12)'
        : 'rgba(239, 68, 68, 0.12)'

  function handleSetAlertClick() {
    const el = document.getElementById('price-alert-section')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' })
    } else {
      showToast('Price drop alert registered')
    }
  }

  function handleBuyNowClick() {
    if (cheapestStore?.url) {
      window.open(cheapestStore.url, '_blank', 'noopener,noreferrer')
    } else {
      showToast('Store link not available')
    }
  }

  return (
    <section
      style={{
        marginTop: '48px',
        padding: '32px',
        backgroundColor: 'var(--card, #ffffff)',
        border: '1px solid var(--line, #e5e7eb)',
        borderRadius: 'var(--r-xl, 16px)',
        boxShadow: '0 2px 16px rgba(0,0,0,0.03)',
      }}
    >
      {/* Section Header with Range Tabs */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '28px',
          paddingBottom: '16px',
          borderBottom: '1px solid var(--line, #e5e7eb)',
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: '1.4rem',
              fontWeight: 700,
              color: 'var(--text-h, #111827)',
              fontFamily: 'Bodoni Moda, serif',
            }}
          >
            Price Analysis & History
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-muted, #6b7280)' }}>
            Track price trends and historical lows across verified retail stores
          </p>
        </div>

        {/* Range Tabs: 7D, 1M, 3M, MAX */}
        <div
          role="tablist"
          aria-label="Price history range"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            backgroundColor: 'var(--bg, #f9fafb)',
            padding: '3px',
            borderRadius: 'var(--r-pill, 9999px)',
            border: '1px solid var(--line, #e5e7eb)',
            gap: '2px',
          }}
        >
          {(['7D', '1M', '3M', 'MAX'] as RangeTab[]).map((tab) => {
            const isActive = activeTab === tab
            return (
              <button
                key={tab}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 'var(--r-pill, 9999px)',
                  border: 'none',
                  backgroundColor: isActive ? 'var(--ink-900, #111827)' : 'transparent',
                  color: isActive ? 'var(--on-dark, #ffffff)' : 'var(--text-muted, #6b7280)',
                  fontSize: '0.78rem',
                  fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'background 0.2s, color 0.2s',
                  fontFamily: 'Manrope, sans-serif',
                }}
              >
                {tab}
              </button>
            )
          })}
        </div>
      </div>

      {/* Main Grid: Chart & Stats on Left (60%), Gauge & Advice on Right (40%) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '36px',
          alignItems: 'start',
        }}
      >
        {/* Left Column: Price History Area Chart + 2x2 Stats Grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Chart Card */}
          <div
            style={{
              padding: '20px',
              backgroundColor: 'var(--bg, #fbfbfb)',
              border: '1px solid var(--line, #f0f0f0)',
              borderRadius: 'var(--r-lg, 12px)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-h, #111827)' }}>
                Price Trend ({activeTab})
              </span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #6b7280)' }}>
                {chartPoints.length} recorded data points
              </span>
            </div>

            {chartPoints.length > 0 ? (
              <PriceAreaChart
                points={chartPoints}
                rangeMin={buyScore.stats.min}
                rangeMax={buyScore.stats.max}
              />
            ) : (
              <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                No price history records in this timeframe.
              </div>
            )}
          </div>

          {/* 2x2 Stats Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '14px',
            }}
          >
            {/* 1. Lowest price in range */}
            <div
              style={{
                padding: '16px',
                backgroundColor: 'var(--bg, #fbfbfb)',
                border: '1px solid var(--line, #f0f0f0)',
                borderRadius: 'var(--r-md, 10px)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <TrendingDown size={14} color="#15803d" />
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted, #6b7280)', fontWeight: 600 }}>
                  Lowest in {activeTab}
                </span>
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-h, #111827)', fontFamily: 'Manrope, sans-serif' }}>
                {formatINR(buyScore.stats.min)}
              </div>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted, #6b7280)' }}>
                on {formatDate(buyScore.stats.lowestDate)}
              </span>
            </div>

            {/* 2. Average price in range */}
            <div
              style={{
                padding: '16px',
                backgroundColor: 'var(--bg, #fbfbfb)',
                border: '1px solid var(--line, #f0f0f0)',
                borderRadius: 'var(--r-md, 10px)',
              }}
            >
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted, #6b7280)', fontWeight: 600, marginBottom: '4px' }}>
                Range Average
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-h, #111827)', fontFamily: 'Manrope, sans-serif' }}>
                {formatINR(Math.round(buyScore.stats.avg))}
              </div>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted, #6b7280)' }}>
                Mean across {activeTab} period
              </span>
            </div>

            {/* 3. Highest price in range */}
            <div
              style={{
                padding: '16px',
                backgroundColor: 'var(--bg, #fbfbfb)',
                border: '1px solid var(--line, #f0f0f0)',
                borderRadius: 'var(--r-md, 10px)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <TrendingUp size={14} color="#dc2626" />
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted, #6b7280)', fontWeight: 600 }}>
                  Highest in {activeTab}
                </span>
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-h, #111827)', fontFamily: 'Manrope, sans-serif' }}>
                {formatINR(buyScore.stats.max)}
              </div>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted, #6b7280)' }}>
                on {formatDate(buyScore.stats.highestDate)}
              </span>
            </div>

            {/* 4. Festival-sale low (All-time low) */}
            <div
              style={{
                padding: '16px',
                backgroundColor: 'rgba(34, 197, 94, 0.06)',
                border: '1px solid rgba(34, 197, 94, 0.25)',
                borderRadius: 'var(--r-md, 10px)',
              }}
            >
              <div style={{ fontSize: '0.74rem', color: '#15803d', fontWeight: 700, marginBottom: '4px' }}>
                Festival-sale Low
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#15803d', fontFamily: 'Manrope, sans-serif' }}>
                {formatINR(buyScore.stats.allTimeLow)}
              </div>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted, #6b7280)' }}>
                on {formatDate(buyScore.stats.allTimeLowDate)}
              </span>
            </div>

            {/* 5. Lowest sale price (lowest dip price if a dip exists) */}
            {lowestDip && (
              <div
                style={{
                  padding: '16px',
                  backgroundColor: 'rgba(217, 119, 6, 0.06)',
                  border: '1px solid rgba(217, 119, 6, 0.25)',
                  borderRadius: 'var(--r-md, 10px)',
                  gridColumn: '1 / -1',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <div style={{ fontSize: '0.74rem', color: '#b45309', fontWeight: 700, marginBottom: '2px' }}>
                      Lowest Sale Price
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#b45309', fontFamily: 'Manrope, sans-serif' }}>
                      {formatINR(lowestDip.lowestPrice)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted, #6b7280)' }}>
                      on {formatDate(lowestDip.start)}
                    </span>
                    <div style={{ fontSize: '0.7rem', color: '#b45309', fontWeight: 600 }}>
                      {lowestDip.depthPct}% dip below normal
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Buy Confidence Score Gauge Card + Evidence + Buttons */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            padding: '24px',
            backgroundColor: 'var(--bg, #fbfbfb)',
            border: '1px solid var(--line, #f0f0f0)',
            borderRadius: 'var(--r-lg, 12px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-h, #111827)' }}>
              Buy Confidence Score
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.72rem',
                fontWeight: 700,
                color: verdictColor,
                backgroundColor: verdictBg,
                padding: '3px 8px',
                borderRadius: 'var(--r-pill, 9999px)',
              }}
            >
              {buyScore.score >= 70 ? <ShieldCheck size={12} /> : <AlertCircle size={12} />}
              {buyScore.label}
            </span>
          </div>

          {/* Semicircle Gauge */}
          <SemicircleGauge score={buyScore.score} color={verdictColor} />

          {/* Percentage Headline line */}
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                fontSize: '1.05rem',
                fontWeight: 800,
                color: verdictColor,
                fontFamily: 'Manrope, sans-serif',
              }}
            >
              {buyScore.score}% good time to buy
            </div>
            <p style={{ margin: '3px 0 0', fontSize: '0.76rem', color: 'var(--text-muted, #6b7280)' }}>
              Analyzed based on {activeTab} historical price fluctuation
            </p>
          </div>

          {/* Evidence bullet points */}
          <div
            style={{
              padding: '12px 14px',
              backgroundColor: 'var(--card, #ffffff)',
              borderRadius: 'var(--r-md, 8px)',
              border: '1px solid var(--line, #e5e7eb)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Price Insights
            </span>
            {buyScore.evidence.map((line, idx) => (
              <div
                key={idx}
                style={{
                  fontSize: '0.78rem',
                  lineHeight: 1.45,
                  color: 'var(--text, #374151)',
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '6px',
                }}
              >
                <span style={{ color: verdictColor, fontWeight: 700 }}>•</span>
                <span>{line}</span>
              </div>
            ))}
          </div>

          {/* Action Buttons: Set Alert & Buy Now */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
            <button
              onClick={handleSetAlertClick}
              type="button"
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: 'var(--r-pill, 9999px)',
                border: '1px solid var(--line, #d1d5db)',
                backgroundColor: 'var(--card, #ffffff)',
                color: 'var(--text-h, #111827)',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'background 0.2s',
              }}
            >
              <Bell size={14} />
              Set Alert
            </button>

            <button
              onClick={handleBuyNowClick}
              type="button"
              style={{
                flex: 1.3,
                padding: '12px',
                borderRadius: 'var(--r-pill, 9999px)',
                border: 'none',
                backgroundColor: 'var(--ink-900, #111827)',
                color: 'var(--on-dark, #ffffff)',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'opacity 0.2s',
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.opacity = '0.9')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.opacity = '1')}
            >
              <ExternalLink size={14} />
              {cheapestStore ? `Buy on ${cheapestStore.name || 'Store'}` : 'Buy Now'}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

