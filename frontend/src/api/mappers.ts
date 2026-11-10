/** Field mapper — one place to translate wire-format fields to frontend types.
 *  Change backend field names here only; no other file should touch raw names.
 */

import type { Product, PricePoint } from './types'

function safeParseJSON<T>(raw: string | T | undefined, fallback: T): T {
  if (raw === undefined || raw === null) return fallback
  if (typeof raw !== 'string') return raw
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/** Map raw backend product object to a typed Product */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapProduct(raw: any): Product {
  return {
    id: String(raw.id ?? raw.product_id ?? ''),
    title: raw.title ?? '',
    brand: raw.brand,
    category: raw.category,
    price: Number(raw.price ?? raw.current_price ?? 0),
    original_price: raw.original_price !== undefined ? Number(raw.original_price) : undefined,
    discount_percentage:
      raw.discount_percentage !== undefined
        ? Number(raw.discount_percentage)
        : raw.discount !== undefined
          ? Number(raw.discount)
          : undefined,
    rating: raw.rating !== undefined ? Number(raw.rating) : undefined,
    image_url: raw.image_url,
    specs: raw.specs,
    availability: raw.availability,
    image_credit: raw.image_credit,
    store_availability: safeParseJSON<any[]>(raw.store_availability, []).map((s) => ({
      name: String(s.name ?? s.store ?? ''),
      price: s.price !== undefined ? Number(s.price) : undefined,
      url: String(s.url ?? ''),
    })),
    price_history: safeParseJSON<PricePoint[]>(raw.price_history, []),
    similarity:
      raw.similarity !== undefined
        ? Number(raw.similarity)
        : raw.similarity_score !== undefined
          ? Number(raw.similarity_score)
          : undefined,
    buy_score: raw.buy_score !== undefined ? Number(raw.buy_score) : undefined,
    buy_score_label: raw.buy_score_label,
    real_discount: raw.real_discount,
  }
}
