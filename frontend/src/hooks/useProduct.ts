import { useQuery } from '@tanstack/react-query'
import { getProduct } from '../api/products'
import { isApiError } from '../api/client'
import type { Product } from '../api/types'

export function useProduct(id?: string) {
  return useQuery<Product, Error>({
    queryKey: ['product', id],
    queryFn: ({ signal }) => {
      if (!id) throw new Error('Product ID required')
      return getProduct(id, signal)
    },
    enabled: Boolean(id && id.trim().length > 0),
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: (failureCount, error) => {
      if (isApiError(error) && (error.status === 404 || error.kind === 'bad_request')) {
        return false
      }
      return failureCount < 1
    },
  })
}

