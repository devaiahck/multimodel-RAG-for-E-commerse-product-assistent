import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { searchProducts } from '../api/search'
import { ApiError } from '../api/client'
import type { SearchResponse } from '../api/types'

export interface UseSearchProductsParams {
  q?: string
  imageFile?: File | null
  category?: string
  maxPrice?: number
  topK?: number
}

export function useSearchProducts({
  q,
  imageFile,
  category,
  maxPrice,
  topK,
}: UseSearchProductsParams): UseQueryResult<SearchResponse, Error> {
  const trimmedQ = q?.trim() || ''
  const hasText = trimmedQ.length > 0
  const hasImage = Boolean(imageFile)

  const imageKey = imageFile
    ? `${imageFile.name}:${imageFile.size}:${imageFile.lastModified}`
    : null

  const queryKey = [
    'search',
    {
      q: trimmedQ,
      imageKey,
      category: category || null,
      maxPrice: maxPrice ?? null,
      topK: topK ?? null,
    },
  ] as const

  return useQuery<SearchResponse, Error>({
    queryKey,
    queryFn: ({ signal }) =>
      searchProducts(
        {
          q: trimmedQ,
          imageFile,
          category,
          maxPrice,
          topK,
        },
        signal
      ),
    staleTime: 5 * 60 * 1000, // 5 min
    retry: (failureCount: number, error: unknown) => {
      if (
        error instanceof ApiError &&
        (error.kind === 'rate_limit' ||
          error.kind === 'validation' ||
          error.kind === 'bad_request')
      ) {
        return false
      }
      return failureCount < 1
    },
    enabled: hasText || hasImage,
  })
}

export default useSearchProducts
