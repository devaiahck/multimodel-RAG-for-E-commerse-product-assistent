import { useQuery } from '@tanstack/react-query'
import { listProducts } from '../api/products'
import type { Product } from '../api/types'

interface Params {
  productId?: string
  category?: string
}

export function useSimilar({ productId, category }: Params) {
  return useQuery<Product[], Error>({
    queryKey: ['similar-products', productId, category],
    queryFn: async ({ signal }) => {
      if (!category) return []

      // 1) Try full category string (e.g. "Clothing / T-Shirts")
      const primaryRes = await listProducts(
        { category, limit: 9 },
        signal
      )

      let filtered = (primaryRes.items || []).filter((p) => p.id !== productId)

      // 2) If fewer than 4 come back, fall back to top-level category
      if (filtered.length < 4 && category.includes(' / ')) {
        const topCat = category.split(' / ')[0].trim()
        const fallbackRes = await listProducts(
          { category: topCat, limit: 12 },
          signal
        )
        filtered = (fallbackRes.items || []).filter((p) => p.id !== productId)
      }

      return filtered.slice(0, 8)
    },
    enabled: Boolean(productId && category && category.trim().length > 0),
    staleTime: 10 * 60 * 1000, // 10 minutes
  })
}

