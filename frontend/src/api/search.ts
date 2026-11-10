/** Search API caller for POST /api/v1/search */

import { apiClient, ApiError } from './client'
import { mapProduct } from './mappers'
import type { SearchRequest, SearchResponse } from './types'

export type SearchParams = SearchRequest & {
  q?: string
  imageFile?: File | null
  maxPrice?: number
  topK?: number
}

export async function searchProducts(
  params: SearchParams,
  signal?: AbortSignal
): Promise<SearchResponse> {
  const formData = new FormData()

  const text = params.text_prompt ?? params.q
  if (text && text.trim()) {
    formData.append('text_prompt', text.trim())
  }

  const image = params.image_file ?? params.imageFile
  if (image) {
    formData.append('image_file', image)
  }

  const maxPrice = params.max_price ?? params.maxPrice
  if (maxPrice !== undefined && maxPrice !== null && !isNaN(maxPrice)) {
    formData.append('max_price', String(maxPrice))
  }

  if (params.category && params.category !== 'All') {
    formData.append('category', params.category)
  }

  const topK = params.top_k ?? params.topK ?? 5
  formData.append('top_k', String(topK))

  const raw = await apiClient<{
    query: string
    recommended_products: unknown[]
    ai_analysis: string
    comparison_table: Record<string, unknown>[]
    total_results: number
    search_type: 'text' | 'image' | 'multimodal'
  }>('/api/v1/search', {
    method: 'POST',
    body: formData,
    signal,
  })

  return {
    ...raw,
    recommended_products: Array.isArray(raw.recommended_products)
      ? raw.recommended_products.map((p) => mapProduct(p))
      : [],
    comparison_table: Array.isArray(raw.comparison_table) ? raw.comparison_table : [],
  }
}

export interface SearchByImageOptions {
  text?: string
  category?: string
  maxPrice?: number
  topK?: number
}

export async function searchByImage(
  file: File,
  options?: SearchByImageOptions,
  signal?: AbortSignal
): Promise<SearchResponse> {
  return searchProducts(
    {
      image_file: file,
      text_prompt: options?.text,
      category: options?.category,
      max_price: options?.maxPrice,
      top_k: options?.topK,
    },
    signal
  )
}

export { ApiError }

