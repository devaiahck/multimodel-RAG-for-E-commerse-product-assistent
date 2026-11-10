/** Deterministic price-insight algorithm.
 *  Given a product's price history and its current price, produces a verdict,
 *  human-readable label, supporting stats, and an evidence sentence.
 */

import type { PricePoint } from '../api/types.ts'
import { formatINR } from './format.ts'

// ── Public types ────────────────────────────────────────────────────────────

export type Verdict = 'great' | 'good' | 'wait' | 'fair' | 'insufficient'

export interface PriceStats {
  min: number
  minDate: string
  max: number
  maxDate: string
  avg: number
  /** 0-100 — percentage of history prices that are ≤ currentPrice */
  percentile: number
}

export interface PriceInsightResult {
  verdict: Verdict
  label: string
  stats: PriceStats | null
  evidence: string
}

export type QuickVerdict = 'buy' | 'wait' | null

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildStats(history: PricePoint[], currentPrice: number): PriceStats {
  let min = history[0].price
  let minDate = history[0].date
  let max = history[0].price
  let maxDate = history[0].date
  let sum = 0
  let countAtOrBelow = 0

  for (const point of history) {
    if (point.price < min) {
      min = point.price
      minDate = point.date
    }
    if (point.price > max) {
      max = point.price
      maxDate = point.date
    }
    sum += point.price
    if (point.price <= currentPrice) {
      countAtOrBelow++
    }
  }

  const avg = sum / history.length
  const percentile = (countAtOrBelow / history.length) * 100

  return { min, minDate, max, maxDate, avg, percentile }
}

function pctDiff(value: number, base: number): number {
  if (base === 0) return 0
  return ((value - base) / base) * 100
}

function buildEvidence(stats: PriceStats, currentPrice: number): string {
  const diff = pctDiff(currentPrice, stats.avg)
  const direction = diff <= 0 ? 'below' : 'above'
  const absDiff = Math.abs(Math.round(diff))

  return (
    `Lowest recorded: ${formatINR(stats.min)} on ${stats.minDate}. ` +
    `Average: ${formatINR(stats.avg)}. ` +
    `Today: ${formatINR(currentPrice)} (${absDiff}% ${direction} average).`
  )
}

// ── Main export ─────────────────────────────────────────────────────────────

export function computePriceInsight(
  history: PricePoint[],
  currentPrice: number,
): PriceInsightResult {
  if (history.length < 5) {
    return {
      verdict: 'insufficient',
      label: 'Not enough price history yet',
      stats: null,
      evidence: '',
    }
  }

  const stats = buildStats(history, currentPrice)
  const evidence = buildEvidence(stats, currentPrice)
  const diffFromAvg = pctDiff(currentPrice, stats.avg)

  // Within 3 % of the lowest recorded, OR in the lowest 15 %
  const nearMin = stats.min === 0
    ? currentPrice === 0
    : Math.abs(pctDiff(currentPrice, stats.min)) <= 3
  if (nearMin || stats.percentile <= 15) {
    return { verdict: 'great', label: 'Great time to buy', stats, evidence }
  }

  // At least 5 % below the average
  if (diffFromAvg <= -5) {
    return { verdict: 'good', label: 'Good price', stats, evidence }
  }

  // At least 5 % above the average, OR in the top 25 %
  if (diffFromAvg >= 5 || stats.percentile >= 75) {
    return { verdict: 'wait', label: 'Consider waiting', stats, evidence }
  }

  // Everything else
  return { verdict: 'fair', label: 'Fair price', stats, evidence }
}

// ── Buy Confidence Score (Buyhatke-style) ──────────────────────────────────

export interface BuyScoreResult {
  score: number
  verdict: 'buy_now' | 'neutral' | 'wait'
  label: string
  position: number
  nearLowBonus: number
  avgPenalty: number
  trendPenalty: number
  evidence: string[]
  stats: {
    min: number
    max: number
    avg: number
    lowestDate: string
    highestDate: string
    allTimeLow: number
    allTimeLowDate: string
    count: number
  }
}

/**
 * Computes Buy Confidence Score (0-100) using deterministic market rules:
 * - position = (max - current) / (max - min), clamped to 0..1 (if max == min use 0.5)
 * - nearLowBonus = 15 if current <= min * 1.03, else 0
 * - avgPenalty = 15 if current > average, else 0
 * - trendPenalty = 10 if avg(last 14 days) is > 3% higher than avg(14 days before that), else 0
 * - score = clamp(round(position * 70 + 15 + nearLowBonus - avgPenalty - trendPenalty), 0, 100)
 */
export function computeBuyScore(
  history: PricePoint[] | undefined | null,
  currentPrice: number,
  rangeDays?: number,
): BuyScoreResult {
  if (!history || history.length === 0) {
    return {
      score: 50,
      verdict: 'neutral',
      label: 'Fair price, okay to buy',
      position: 0.5,
      nearLowBonus: 0,
      avgPenalty: 0,
      trendPenalty: 0,
      evidence: ['No price history available yet'],
      stats: {
        min: currentPrice,
        max: currentPrice,
        avg: currentPrice,
        lowestDate: '',
        highestDate: '',
        allTimeLow: currentPrice,
        allTimeLowDate: '',
        count: 0,
      },
    }
  }

  // Sort chronologically ascending
  const sorted = [...history].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  )

  // Find all-time low across full history
  let allTimeLow = sorted[0].price
  let allTimeLowDate = sorted[0].date
  for (const p of sorted) {
    if (p.price < allTimeLow) {
      allTimeLow = p.price
      allTimeLowDate = p.date
    }
  }

  // Filter window by rangeDays if requested
  const lastPoint = sorted[sorted.length - 1]
  const lastTime = new Date(lastPoint.date).getTime()
  let window = sorted

  if (rangeDays && rangeDays > 0 && Number.isFinite(rangeDays)) {
    const cutoff = lastTime - rangeDays * 86400 * 1000
    const filtered = sorted.filter((p) => new Date(p.date).getTime() >= cutoff)
    if (filtered.length > 0) {
      window = filtered
    }
  }

  // Window statistics
  let min = window[0].price
  let lowestDate = window[0].date
  let max = window[0].price
  let highestDate = window[0].date
  let sum = 0

  for (const p of window) {
    if (p.price < min) {
      min = p.price
      lowestDate = p.date
    }
    if (p.price > max) {
      max = p.price
      highestDate = p.date
    }
    sum += p.price
  }

  const avg = sum / window.length

  // Position: 0..1 (1 = at lowest price)
  let position: number
  if (max === min) {
    position = 0.5
  } else {
    position = (max - currentPrice) / (max - min)
    position = Math.max(0, Math.min(1, position))
  }

  const nearLowBonus = currentPrice <= min * 1.03 ? 15 : 0
  const avgPenalty = currentPrice > avg ? 15 : 0

  // Trend penalty: last 14 days vs 14 days before that (using all history)
  const t14Cutoff = lastTime - 14 * 86400 * 1000
  const t28Cutoff = lastTime - 28 * 86400 * 1000

  const last14 = sorted.filter((p) => new Date(p.date).getTime() >= t14Cutoff)
  const prev14 = sorted.filter(
    (p) =>
      new Date(p.date).getTime() >= t28Cutoff &&
      new Date(p.date).getTime() < t14Cutoff
  )

  let trendPenalty = 0
  if (last14.length > 0 && prev14.length > 0) {
    const avgLast = last14.reduce((s, p) => s + p.price, 0) / last14.length
    const avgPrev = prev14.reduce((s, p) => s + p.price, 0) / prev14.length
    if (avgPrev > 0 && (avgLast - avgPrev) / avgPrev > 0.03) {
      trendPenalty = 10
    }
  }

  const rawScore = Math.round(
    position * 70 + 15 + nearLowBonus - avgPenalty - trendPenalty
  )
  const score = Math.max(0, Math.min(100, rawScore))

  let verdict: 'buy_now' | 'neutral' | 'wait'
  let label: string
  if (score >= 70) {
    verdict = 'buy_now'
    label = 'Good time to buy'
  } else if (score >= 40) {
    verdict = 'neutral'
    label = 'Fair price, okay to buy'
  } else {
    verdict = 'wait'
    label = 'Better to wait'
  }

  // Evidence lines
  const evidence: string[] = []
  const diffFromMin = currentPrice - min
  const pctFromMin = min > 0 ? ((currentPrice - min) / min) * 100 : 0

  if (Math.abs(pctFromMin) <= 0.5) {
    evidence.push('Current price is at the lowest recorded in this period')
  } else if (diffFromMin > 0) {
    evidence.push(
      `Current price is ${Math.round(pctFromMin)}% above the period low of ${formatINR(min)}`
    )
  }

  const diffFromAvg = currentPrice - avg
  const pctFromAvg = avg > 0 ? (diffFromAvg / avg) * 100 : 0
  if (diffFromAvg < 0) {
    evidence.push(
      `Price is ${formatINR(Math.abs(Math.round(diffFromAvg)))} (${Math.abs(Math.round(pctFromAvg))}%) below average (${formatINR(Math.round(avg))})`
    )
  } else if (diffFromAvg > 0) {
    evidence.push(
      `Price is ${formatINR(Math.round(diffFromAvg))} (${Math.round(pctFromAvg)}%) above average (${formatINR(Math.round(avg))})`
    )
  } else {
    evidence.push(`Price is equal to the period average of ${formatINR(Math.round(avg))}`)
  }

  evidence.push(`All-time lowest recorded was ${formatINR(allTimeLow)} on ${allTimeLowDate}`)

  return {
    score,
    verdict,
    label,
    position,
    nearLowBonus,
    avgPenalty,
    trendPenalty,
    evidence,
    stats: {
      min,
      max,
      avg,
      lowestDate,
      highestDate,
      allTimeLow,
      allTimeLowDate,
      count: window.length,
    },
  }
}

// ── Quick helper for ProductCard ────────────────────────────────────────────

export function getQuickVerdict(
  history: PricePoint[],
  currentPrice: number,
): QuickVerdict {
  const { verdict } = computePriceInsight(history, currentPrice)
  if (verdict === 'great' || verdict === 'good') return 'buy'
  if (verdict === 'wait') return 'wait'
  return null
}

// ── Real Discount (MRP Inflation Check) ─────────────────────────────────────

export type RealDiscountVerdict = 'genuine' | 'slightly_inflated' | 'inflated' | 'none'

export interface RealDiscountResult {
  claimedPct: number
  realPct: number
  typicalPrice: number
  gap: number
  verdict: RealDiscountVerdict
}

function round1(val: number): number {
  return Math.round(val * 10) / 10
}

function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 !== 0) {
    return sorted[mid]
  }
  return (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Compares store's claimed discount against real recent median price.
 * Identifies inflated MRPs where the seller inflates MRP to show a fake massive discount.
 */
export function computeRealDiscount(
  history?: PricePoint[] | null,
  currentPrice: number = 0,
  mrp?: number | null,
  windowDays: number = 90
): RealDiscountResult {
  // Handle missing or empty history or missing MRP
  if (!history || history.length === 0 || !mrp || mrp <= 0 || currentPrice <= 0) {
    const claimedPct = mrp && mrp > 0 && currentPrice > 0 ? round1(((mrp - currentPrice) / mrp) * 100) : 0
    return {
      claimedPct,
      realPct: 0,
      typicalPrice: currentPrice > 0 ? round1(currentPrice) : 0,
      gap: 0,
      verdict: 'none',
    }
  }

  // Sort history chronologically
  const sorted = [...history].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  )

  // Filter to windowDays (or use all history if shorter)
  const lastPoint = sorted[sorted.length - 1]
  const lastTime = new Date(lastPoint.date).getTime()
  let windowPoints = sorted
  if (windowDays > 0) {
    const cutoff = lastTime - windowDays * 86400 * 1000
    const filtered = sorted.filter((p) => new Date(p.date).getTime() >= cutoff)
    if (filtered.length > 0) {
      windowPoints = filtered
    }
  }

  // typicalPrice = the MEDIAN of the prices in the last windowDays
  const typicalPrice = calculateMedian(windowPoints.map((p) => p.price))

  // claimedPct = (mrp - currentPrice) / mrp * 100
  const claimedPct = round1(((mrp - currentPrice) / mrp) * 100)

  // realPct = (typicalPrice - currentPrice) / typicalPrice * 100 (can be negative)
  const realPct = typicalPrice > 0 ? round1(((typicalPrice - currentPrice) / typicalPrice) * 100) : 0

  // gap = claimedPct - realPct
  const gap = round1(claimedPct - realPct)

  // Verdict calculation:
  // - "genuine" if claimedPct >= 10 and realPct >= claimedPct * 0.6
  // - "inflated" if claimedPct >= 25 and realPct < claimedPct * 0.4
  // - "slightly_inflated" if gap >= 15 and not "inflated"
  // - "none" if claimedPct < 10 or mrp is missing
  let verdict: RealDiscountVerdict = 'none'
  if (claimedPct < 10) {
    verdict = 'none'
  } else if (claimedPct >= 25 && realPct < claimedPct * 0.4) {
    verdict = 'inflated'
  } else if (claimedPct >= 10 && realPct >= claimedPct * 0.6) {
    verdict = 'genuine'
  } else if (gap >= 15) {
    verdict = 'slightly_inflated'
  } else {
    verdict = 'none'
  }

  return {
    claimedPct,
    realPct,
    typicalPrice: round1(typicalPrice),
    gap,
    verdict,
  }
}

// ── Sale Watch Types & Pure Functions ────────────────────────────────────────

export interface PriceDip {
  start: string
  end: string
  lowestPrice: number
  normalPrice: number
  depthPct: number
  saleName?: string
}

export interface SaleCalendarEntry {
  name: string
  year: number
  start: string
  end: string
  approximate: boolean
  note?: string
}

export interface NextSalePrediction {
  name: string
  daysAway: number
  expectedDropPct: number | null
}

/**
 * Scan history to detect price dips.
 * A dip is a run of 2 or more consecutive points where price is at least 8%
 * below the median of the 30 days before the run started.
 * Returns empty array if history is shorter than 45 days.
 */
export function detectPriceDips(history?: PricePoint[] | null): PriceDip[] {
  if (!history || history.length < 2) return []

  const sorted = [...history].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  )

  const d0 = new Date(sorted[0].date).getTime()
  const dEnd = new Date(sorted[sorted.length - 1].date).getTime()
  const totalDays = (dEnd - d0) / (1000 * 86400)
  if (totalDays < 45) {
    return []
  }

  const dips: PriceDip[] = []
  let i = 0

  while (i < sorted.length) {
    const t_i = new Date(sorted[i].date).getTime()
    // Points strictly in the 30 days before point i
    const prior = sorted.filter((p) => {
      const diffDays = (t_i - new Date(p.date).getTime()) / (1000 * 86400)
      return diffDays > 0 && diffDays <= 30
    })

    if (prior.length === 0) {
      i++
      continue
    }

    const normalPrice = calculateMedian(prior.map((p) => p.price))
    if (normalPrice <= 0) {
      i++
      continue
    }

    // Check if point i is at least 8% below normalPrice
    const isDipPoint = (normalPrice - sorted[i].price) / normalPrice >= 0.08
    if (isDipPoint) {
      const run = [sorted[i]]
      let j = i + 1
      while (j < sorted.length) {
        if ((normalPrice - sorted[j].price) / normalPrice >= 0.08) {
          run.push(sorted[j])
          j++
        } else {
          break
        }
      }

      // Dip requires a run of 2 or more consecutive points
      if (run.length >= 2) {
        const lowestPrice = Math.min(...run.map((p) => p.price))
        const depthPct = Math.round(((normalPrice - lowestPrice) / normalPrice) * 1000) / 10
        dips.push({
          start: run[0].date,
          end: run[run.length - 1].date,
          lowestPrice,
          normalPrice: Math.round(normalPrice),
          depthPct,
        })
        i = j
        continue
      }
    }

    i++
  }

  return dips
}

/**
 * Attach sale name to any dip that overlaps a calendar entry.
 */
export function matchDipsToSales(
  dips: PriceDip[],
  saleCalendar: SaleCalendarEntry[]
): PriceDip[] {
  if (!dips || dips.length === 0) return []
  if (!saleCalendar || saleCalendar.length === 0) return dips

  return dips.map((dip) => {
    const matched = saleCalendar.find(
      (sale) => dip.start <= sale.end && dip.end >= sale.start
    )
    if (matched) {
      return {
        ...dip,
        saleName: matched.name,
      }
    }
    return dip
  })
}

/**
 * Find the next upcoming calendar entry (start date after today)
 * and return { name, daysAway, expectedDropPct }.
 * expectedDropPct = average depthPct of past dips for this product (rounded to 1 decimal).
 * If no past dips exist, expectedDropPct is null.
 * Returns null if there are no upcoming sales.
 */
export function predictNextSale(
  today: string | Date,
  saleCalendar: SaleCalendarEntry[],
  dips: PriceDip[]
): NextSalePrediction | null {
  if (!saleCalendar || saleCalendar.length === 0) return null

  const todayStr =
    today instanceof Date
      ? today.toISOString().slice(0, 10)
      : typeof today === 'string'
        ? today.slice(0, 10)
        : new Date().toISOString().slice(0, 10)

  const upcoming = saleCalendar
    .filter((s) => s.start > todayStr)
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))

  if (upcoming.length === 0) {
    return null
  }

  const nextSale = upcoming[0]
  const todayMs = new Date(todayStr).getTime()
  const saleStartMs = new Date(nextSale.start).getTime()
  const daysAway = Math.max(0, Math.ceil((saleStartMs - todayMs) / (1000 * 86400)))

  let expectedDropPct: number | null = null
  if (dips && dips.length > 0) {
    const sum = dips.reduce((acc, d) => acc + d.depthPct, 0)
    expectedDropPct = Math.round((sum / dips.length) * 10) / 10
  }

  return {
    name: nextSale.name,
    daysAway,
    expectedDropPct,
  }
}


