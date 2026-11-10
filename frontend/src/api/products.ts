import { apiClient } from './client'
import { mapProduct } from './mappers'
import type { Product, ProductListResponse } from './types'

export interface ListProductsParams {
  category?: string
  q?: string
  min_price?: number
  max_price?: number
  sort?: 'price_asc' | 'price_desc' | 'rating' | 'newest' | 'discount'
  limit?: number
  offset?: number
}

export async function listProducts(
  params: ListProductsParams = {},
  signal?: AbortSignal
): Promise<ProductListResponse> {
  const query = new URLSearchParams()
  if (params.category) query.set('category', params.category)
  if (params.q) query.set('q', params.q)
  if (params.min_price !== undefined) query.set('min_price', String(params.min_price))
  if (params.max_price !== undefined) query.set('max_price', String(params.max_price))
  if (params.sort) query.set('sort', params.sort)
  if (params.limit !== undefined) query.set('limit', String(params.limit))
  if (params.offset !== undefined) query.set('offset', String(params.offset))

  const queryString = query.toString()
  const endpoint = queryString ? `/api/v1/products?${queryString}` : '/api/v1/products'

  const raw = await apiClient<{
    items: unknown[]
    total: number
    limit: number
    offset: number
  }>(endpoint, { signal })

  return {
    items: Array.isArray(raw.items) ? raw.items.map(mapProduct) : [],
    total: raw.total ?? 0,
    limit: raw.limit ?? params.limit ?? 20,
    offset: raw.offset ?? params.offset ?? 0,
  }
}

export async function getProduct(id: string, signal?: AbortSignal): Promise<Product> {
  const raw = await apiClient<unknown>(`/api/v1/products/${encodeURIComponent(id)}`, { signal })
  return mapProduct(raw)
}

export async function getSimilarProducts(
  id: string,
  limit = 4,
  cheaper = true,
  signal?: AbortSignal
): Promise<Product[]> {
  const query = new URLSearchParams({
    limit: String(limit),
    cheaper: String(cheaper),
  })
  const raw = await apiClient<unknown[]>(
    `/api/v1/products/${encodeURIComponent(id)}/similar?${query.toString()}`,
    { signal }
  )
  return Array.isArray(raw) ? raw.map(mapProduct) : []
}

export interface CategoryItem {
  slug: string
  label: string
  product_count: number
}

export async function getCategories(signal?: AbortSignal): Promise<CategoryItem[]> {
  const raw = await apiClient<CategoryItem[]>('/api/v1/categories', { signal })
  return Array.isArray(raw) ? raw : []
}

