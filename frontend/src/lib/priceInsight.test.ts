/**
 * Unit tests for computeBuyScore in frontend/src/lib/priceInsight.ts
 *
 * Test cases:
 * 1. Flat prices: all points identical, position=0.5 -> score in neutral zone (65)
 * 2. Price at all-time low: current = min -> position=1, nearLowBonus=15 -> score=100 (buy_now)
 * 3. Price at all-time high: current = max -> position=0, avgPenalty=15 -> score=0 (wait)
 * 4. Rising trend: last 14 days avg > 3% higher than prior 14 days -> trendPenalty=10 applied
 */

import {
  computeBuyScore,
  computeRealDiscount,
  detectPriceDips,
  matchDipsToSales,
  predictNextSale,
  type SaleCalendarEntry,
} from './priceInsight.ts'
import type { PricePoint } from '../api/types.ts'

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`)
    throw new Error(message)
  }
  console.log(`✅ PASS: ${message}`)
}

console.log('Running computeBuyScore unit tests...\n')

// ── Case 1: Flat prices ─────────────────────────────────────────────────────
{
  const dates = ['2026-08-01', '2026-08-15', '2026-09-01', '2026-09-15', '2026-10-01', '2026-10-15', '2026-11-01']
  const history: PricePoint[] = dates.map((date) => ({ date, price: 1000 }))
  const res = computeBuyScore(history, 1000)

  // position = 0.5, nearLowBonus = 15, avgPenalty = 0, trendPenalty = 0
  // score = round(0.5 * 70 + 15 + 15 - 0 - 0) = 65
  assert(res.score === 65, `Case 1 (Flat prices): Expected score 65, got ${res.score}`)
  assert(res.verdict === 'neutral', `Case 1: Expected verdict 'neutral', got '${res.verdict}'`)
  assert(res.label === 'Fair price, okay to buy', `Case 1: Expected label 'Fair price, okay to buy', got '${res.label}'`)
}

// ── Case 2: Price at all-time low ───────────────────────────────────────────
{
  const history: PricePoint[] = [
    { date: '2026-08-01', price: 1500 },
    { date: '2026-09-01', price: 1400 },
    { date: '2026-10-01', price: 1300 },
    { date: '2026-11-01', price: 1000 },
  ]
  const res = computeBuyScore(history, 1000)

  // position = (1500 - 1000) / (1500 - 1000) = 1.0
  // nearLowBonus = 15 (1000 <= 1000 * 1.03)
  // avgPenalty = 0 (1000 < avg 1300)
  // score = clamp(round(1.0 * 70 + 15 + 15 - 0 - 0)) = 100
  assert(res.score === 100, `Case 2 (All-time low): Expected score 100, got ${res.score}`)
  assert(res.verdict === 'buy_now', `Case 2: Expected verdict 'buy_now', got '${res.verdict}'`)
  assert(res.label === 'Good time to buy', `Case 2: Expected label 'Good time to buy', got '${res.label}'`)
}

// ── Case 3: Price at all-time high ──────────────────────────────────────────
{
  const history: PricePoint[] = [
    { date: '2026-08-01', price: 1000 },
    { date: '2026-09-01', price: 1100 },
    { date: '2026-10-01', price: 1200 },
    { date: '2026-11-01', price: 1500 },
  ]
  const res = computeBuyScore(history, 1500)

  // position = (1500 - 1500) / (1500 - 1000) = 0.0
  // nearLowBonus = 0 (1500 > 1000 * 1.03)
  // avgPenalty = 15 (1500 > avg 1200)
  // score = clamp(round(0 * 70 + 15 + 0 - 15 - 0)) = 0
  assert(res.score === 0, `Case 3 (All-time high): Expected score 0, got ${res.score}`)
  assert(res.verdict === 'wait', `Case 3: Expected verdict 'wait', got '${res.verdict}'`)
  assert(res.label === 'Better to wait', `Case 3: Expected label 'Better to wait', got '${res.label}'`)
}

// ── Case 4: Rising trend penalty ────────────────────────────────────────────
{
  // Anchor dates: last point = 2026-11-06
  // Prev 14 days (2026-10-10 to 2026-10-22): avg 1000
  // Last 14 days (2026-10-24 to 2026-11-06): avg 1150 (+15% > +3%)
  const history: PricePoint[] = [
    { date: '2026-10-10', price: 1000 },
    { date: '2026-10-15', price: 1000 },
    { date: '2026-10-20', price: 1000 },
    { date: '2026-10-25', price: 1150 },
    { date: '2026-10-30', price: 1150 },
    { date: '2026-11-06', price: 1150 },
  ]

  const resWithTrend = computeBuyScore(history, 1150)

  assert(resWithTrend.trendPenalty === 10, `Case 4 (Rising trend): Expected trendPenalty=10, got ${resWithTrend.trendPenalty}`)
  assert(resWithTrend.score <= 35, `Case 4 (Rising trend): Expected score <= 35, got ${resWithTrend.score}`)
}

console.log('\n🎉 All 4 computeBuyScore unit test cases passed successfully!')

console.log('\nRunning computeRealDiscount unit tests...\n')

// ── Case 5: Genuine deal ────────────────────────────────────────────────────
// MRP 2000, currentPrice 1200 (40% claimed), typicalPrice 1800 (33.3% real)
// claimedPct = 40.0, realPct = 33.3, realPct >= 40 * 0.6 (24.0) -> "genuine"
{
  const history: PricePoint[] = [
    { date: '2026-08-15', price: 1800 },
    { date: '2026-09-01', price: 1800 },
    { date: '2026-10-01', price: 1800 },
    { date: '2026-11-01', price: 1200 },
  ]
  const res = computeRealDiscount(history, 1200, 2000)
  assert(res.claimedPct === 40, `Case 5: Expected claimedPct 40, got ${res.claimedPct}`)
  assert(res.realPct === 33.3, `Case 5: Expected realPct 33.3, got ${res.realPct}`)
  assert(res.typicalPrice === 1800, `Case 5: Expected typicalPrice 1800, got ${res.typicalPrice}`)
  assert(res.verdict === 'genuine', `Case 5: Expected verdict 'genuine', got '${res.verdict}'`)
}

// ── Case 6: Inflated MRP with flat prices ───────────────────────────────────
// MRP 5000, currentPrice 1000 (80% claimed), prices flat at 1000 (0% real)
// claimedPct = 80.0, realPct = 0.0, claimedPct >= 25 & realPct < 80 * 0.4 (32.0) -> "inflated"
{
  const history: PricePoint[] = [
    { date: '2026-08-15', price: 1000 },
    { date: '2026-09-01', price: 1000 },
    { date: '2026-10-01', price: 1000 },
    { date: '2026-11-01', price: 1000 },
  ]
  const res = computeRealDiscount(history, 1000, 5000)
  assert(res.claimedPct === 80, `Case 6: Expected claimedPct 80, got ${res.claimedPct}`)
  assert(res.realPct === 0, `Case 6: Expected realPct 0, got ${res.realPct}`)
  assert(res.typicalPrice === 1000, `Case 6: Expected typicalPrice 1000, got ${res.typicalPrice}`)
  assert(res.gap === 80, `Case 6: Expected gap 80, got ${res.gap}`)
  assert(res.verdict === 'inflated', `Case 6: Expected verdict 'inflated', got '${res.verdict}'`)
}

// ── Case 7: No MRP (null / undefined / missing) ─────────────────────────────
{
  const history: PricePoint[] = [
    { date: '2026-08-15', price: 1000 },
    { date: '2026-09-01', price: 1000 },
  ]
  const resNull = computeRealDiscount(history, 1000, null)
  assert(resNull.verdict === 'none', `Case 7 (null MRP): Expected verdict 'none', got '${resNull.verdict}'`)
  const resUndef = computeRealDiscount(history, 1000, undefined)
  assert(resUndef.verdict === 'none', `Case 7 (undefined MRP): Expected verdict 'none', got '${resUndef.verdict}'`)
}

// ── Case 8: Empty history ───────────────────────────────────────────────────
{
  const resEmpty = computeRealDiscount([], 1000, 2000)
  assert(resEmpty.verdict === 'none', `Case 8 (Empty history): Expected verdict 'none', got '${resEmpty.verdict}'`)
  const resMissing = computeRealDiscount(null, 1000, 2000)
  assert(resMissing.verdict === 'none', `Case 8 (Null history): Expected verdict 'none', got '${resMissing.verdict}'`)
}

console.log('\n🎉 All computeRealDiscount unit test cases passed successfully!')

console.log('\nRunning detectPriceDips and predictNextSale unit tests...\n')

// ── Case 9: Flat prices (no dips) ───────────────────────────────────────────
{
  const dates = [
    '2026-08-01', '2026-08-10', '2026-08-20', '2026-08-30',
    '2026-09-10', '2026-09-20', '2026-09-30', '2026-10-10',
  ] // 70 days span, all price 1000
  const history: PricePoint[] = dates.map((date) => ({ date, price: 1000 }))
  const dips = detectPriceDips(history)
  assert(dips.length === 0, `Case 9 (Flat prices): Expected 0 dips, got ${dips.length}`)
}

// ── Case 10: One clear dip ──────────────────────────────────────────────────
{
  // Baseline: 2026-08-01 to 2026-09-15 at 1000
  // Dip: 2026-09-20 (850), 2026-09-25 (850) -> 15% drop below 1000
  // Recovery: 2026-10-01 to 2026-10-15 at 1000 (total span 75 days)
  const history: PricePoint[] = [
    { date: '2026-08-01', price: 1000 },
    { date: '2026-08-10', price: 1000 },
    { date: '2026-08-20', price: 1000 },
    { date: '2026-08-30', price: 1000 },
    { date: '2026-09-10', price: 1000 },
    { date: '2026-09-20', price: 850 },
    { date: '2026-09-25', price: 850 },
    { date: '2026-10-01', price: 1000 },
    { date: '2026-10-15', price: 1000 },
  ]
  const dips = detectPriceDips(history)
  assert(dips.length === 1, `Case 10 (One clear dip): Expected 1 dip, got ${dips.length}`)
  assert(dips[0].lowestPrice === 850, `Case 10: Expected lowestPrice 850, got ${dips[0].lowestPrice}`)
  assert(dips[0].normalPrice === 1000, `Case 10: Expected normalPrice 1000, got ${dips[0].normalPrice}`)
  assert(dips[0].depthPct === 15.0, `Case 10: Expected depthPct 15.0, got ${dips[0].depthPct}`)
  assert(dips[0].start === '2026-09-20', `Case 10: Expected start '2026-09-20', got ${dips[0].start}`)
  assert(dips[0].end === '2026-09-25', `Case 10: Expected end '2026-09-25', got ${dips[0].end}`)

  // Test matchDipsToSales
  const calendar: SaleCalendarEntry[] = [
    { name: 'Festival Sale', year: 2026, start: '2026-09-18', end: '2026-09-26', approximate: true },
    { name: 'Black Friday', year: 2026, start: '2026-11-25', end: '2026-11-30', approximate: true },
  ]
  const matched = matchDipsToSales(dips, calendar)
  assert(matched[0].saleName === 'Festival Sale', `Case 10: Expected saleName 'Festival Sale', got '${matched[0].saleName}'`)

  // Test predictNextSale with upcoming sale
  const pred = predictNextSale('2026-10-20', calendar, dips)
  assert(pred !== null, `Case 10: Expected prediction not null`)
  assert(pred?.name === 'Black Friday', `Case 10: Expected next sale 'Black Friday', got '${pred?.name}'`)
  assert(pred?.expectedDropPct === 15.0, `Case 10: Expected expectedDropPct 15.0, got ${pred?.expectedDropPct}`)
  assert(typeof pred?.daysAway === 'number' && pred.daysAway > 0, `Case 10: Expected daysAway > 0`)
}

// ── Case 11: History too short (< 45 days) ──────────────────────────────────
{
  // Span is 20 days (shorter than 45 days)
  const shortHistory: PricePoint[] = [
    { date: '2026-09-01', price: 1000 },
    { date: '2026-09-05', price: 1000 },
    { date: '2026-09-10', price: 700 },
    { date: '2026-09-15', price: 700 },
    { date: '2026-09-20', price: 1000 },
  ]
  const dips = detectPriceDips(shortHistory)
  assert(dips.length === 0, `Case 11 (Short history): Expected 0 dips for <45 days, got ${dips.length}`)
}

// ── Case 12: No upcoming sale ───────────────────────────────────────────────
{
  const pastCalendar: SaleCalendarEntry[] = [
    { name: 'Past Spring Sale', year: 2026, start: '2026-03-01', end: '2026-03-10', approximate: true },
    { name: 'Past Summer Sale', year: 2026, start: '2026-06-01', end: '2026-06-10', approximate: true },
  ]
  const dummyDips = [{ start: '2026-03-02', end: '2026-03-05', lowestPrice: 800, normalPrice: 1000, depthPct: 20.0 }]
  const pred = predictNextSale('2026-11-08', pastCalendar, dummyDips)
  assert(pred === null, `Case 12 (No upcoming sale): Expected null prediction, got ${JSON.stringify(pred)}`)
}

console.log('\n🎉 All detectPriceDips and predictNextSale unit tests passed successfully!\n')

