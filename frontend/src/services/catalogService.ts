import { listProducts, getProduct, getCategories, type CategoryItem } from '../api/products'
import type { Product, ProductListResponse } from '../api/types'

export type CatalogSort =
  | 'price_asc'
  | 'price_desc'
  | 'rating'
  | 'newest'
  | 'discount'
  | 'real_discount_desc'

export interface ListByCategoryOptions {
  sort?: CatalogSort
  maxPrice?: number
  limit?: number
  offset?: number
  signal?: AbortSignal
}

export const catalogService = {
  async listByCategory(
    slug: string,
    options: ListByCategoryOptions = {},
    signal?: AbortSignal
  ): Promise<ProductListResponse> {
    const effectiveSignal = signal ?? options.signal
    const apiSort =
      options.sort === 'real_discount_desc' ? undefined : options.sort
    return listProducts(
      {
        category: slug,
        sort: apiSort,
        max_price: options.maxPrice,
        limit: options.limit ?? 20,
        offset: options.offset ?? 0,
      },
      effectiveSignal
    )
  },

  async listTrending(limit = 8, signal?: AbortSignal): Promise<Product[]> {
    const res = await listProducts({ limit, sort: 'rating' }, signal)
    return res.items
  },

  async getCategories(signal?: AbortSignal): Promise<CategoryItem[]> {
    return getCategories(signal)
  },

  async getProduct(id: string, signal?: AbortSignal): Promise<Product> {
    return getProduct(id, signal)
  },
}

export default catalogService

