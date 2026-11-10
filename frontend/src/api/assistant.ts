import { apiClient } from './client'
import { mapProduct } from './mappers'
import type { Product } from './types'

export interface ChatHistoryItem {
  role: 'user' | 'assistant'
  content: string
}

export interface AssistantChatResponse {
  answer: string
  products: Product[]
  filters_used: Record<string, unknown>
  grounded: boolean
}

export async function assistantChat(
  message: string,
  history?: ChatHistoryItem[],
  signal?: AbortSignal
): Promise<AssistantChatResponse> {
  const payload = {
    message,
    history: history && history.length > 0 ? history.slice(-6) : undefined,
  }

  const raw = await apiClient<{
    answer: string
    products: unknown[]
    filters_used: Record<string, unknown>
    grounded: boolean
  }>('/api/v1/assistant/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  })

  return {
    answer: raw.answer,
    products: Array.isArray(raw.products) ? raw.products.map(mapProduct) : [],
    filters_used: raw.filters_used || {},
    grounded: raw.grounded ?? true,
  }
}

export async function getAssistantSuggestions(signal?: AbortSignal): Promise<string[]> {
  try {
    const raw = await apiClient<string[]>('/api/v1/assistant/suggestions', { signal })
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}


