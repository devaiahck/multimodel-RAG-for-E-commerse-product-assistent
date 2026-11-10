import { useQuery } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  Shirt,
  Footprints,
  Watch,
  Cpu,
  Home as HomeIcon,
  Sparkles,
  Dumbbell,
  Package,
} from 'lucide-react'
import { getCategories, type CategoryItem } from '../api/products'
import { catalogService } from '../services/catalogService'
import type { Product } from '../api/types'

export function getCategoryIcon(slug: string): LucideIcon {
  const s = slug.toLowerCase()
  if (s.includes('cloth') || s.includes('shirt')) return Shirt
  if (s.includes('shoe') || s.includes('foot')) return Footprints
  if (s.includes('watch')) return Watch
  if (s.includes('electron') || s.includes('tech') || s.includes('cpu')) return Cpu
  if (s.includes('home')) return HomeIcon
  if (s.includes('beauty') || s.includes('cosmet')) return Sparkles
  if (s.includes('sport') || s.includes('gym')) return Dumbbell
  return Package
}

export function useCategories() {
  return useQuery<CategoryItem[], Error>({
    queryKey: ['categories'],
    queryFn: ({ signal }) => getCategories(signal),
    staleTime: 10 * 60 * 1000,
  })
}

export function useTrending(limit = 8) {
  return useQuery<Product[], Error>({
    queryKey: ['trending', limit],
    queryFn: ({ signal }) => catalogService.listTrending(limit, signal),
    staleTime: 10 * 60 * 1000,
  })
}

export function useFeaturedCollection(category = '', limit = 4) {
  return useQuery<Product[], Error>({
    queryKey: ['featured-collection', category, limit],
    queryFn: async ({ signal }) => {
      if (!category) return []
      const res = await catalogService.listByCategory(
        category,
        { sort: 'discount', limit },
        signal
      )
      return res.items
    },
    enabled: Boolean(category),
    staleTime: 10 * 60 * 1000,
  })
}

