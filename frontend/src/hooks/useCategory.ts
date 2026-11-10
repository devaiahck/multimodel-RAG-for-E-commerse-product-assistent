import { useInfiniteQuery } from '@tanstack/react-query'
import { catalogService, type CatalogSort } from '../services/catalogService'
import type { ProductListResponse } from '../api/types'

export interface UseCategoryOptions {
  slug?: string
  sort?: CatalogSort
  maxPrice?: number
  limit?: number
}

export function useCategory({ slug, sort, maxPrice, limit = 100 }: UseCategoryOptions) {
  const normalizedSlug = slug?.trim() || ''

  return useInfiniteQuery<ProductListResponse, Error>({
    queryKey: ['category', normalizedSlug, { sort: sort ?? null, maxPrice: maxPrice ?? null, limit }] as const,
    queryFn: ({ pageParam, signal }) =>
      catalogService.listByCategory(
        normalizedSlug,
        {
          sort,
          maxPrice,
          limit,
          offset: typeof pageParam === 'number' ? pageParam : 0,
        },
        signal
      ),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const nextOffset = lastPage.offset + lastPage.limit
      return nextOffset < lastPage.total ? nextOffset : undefined
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    enabled: Boolean(normalizedSlug.length > 0),
  })
}

export default useCategory

