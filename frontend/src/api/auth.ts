import { apiClient } from './client'

export interface User {
  id: string
  name: string
  email: string
  created_at: string
}

export interface UserResponse {
  user: User
}

export interface Preferences {
  favorite_categories: string[]
  budget_min: number | null
  budget_max: number | null
  personalization_paused: boolean
}

export interface ActivityEvent {
  type: string
  product_id?: string
  category?: string
  brand?: string
  query?: string
  price?: number
  ts?: string
}

export interface CartItemBackend {
  productId: string
  product_id?: string
  qty: number
  quantity?: number
  title?: string
  price?: number
  originalPrice?: number
  imageUrl?: string
  brand?: string
  category?: string
  store?: string
}

export interface SavedItemBackend {
  productId: string
  product_id?: string
  title?: string
  price?: number
  originalPrice?: number
  imageUrl?: string
  brand?: string
  category?: string
  rating?: number
  discountPercentage?: number
  store?: string
  savedAt?: string
}

// ── Auth APIs ─────────────────────────────────────────────────────────────

export async function authSignUp(name: string, email: string, password: string): Promise<UserResponse> {
  return apiClient<UserResponse>('/api/v1/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  })
}

export async function authLogin(email: string, password: string): Promise<UserResponse> {
  return apiClient<UserResponse>('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
}

export async function authMe(): Promise<UserResponse> {
  return apiClient<UserResponse>('/api/v1/auth/me', {
    method: 'GET',
  })
}

export async function authLogout(): Promise<void> {
  return apiClient<void>('/api/v1/auth/logout', {
    method: 'POST',
  })
}

export async function authChangePassword(old_password: string, new_password: string): Promise<{ ok: boolean; message: string }> {
  return apiClient<{ ok: boolean; message: string }>('/api/v1/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ old_password, new_password }),
  })
}

export async function authDeleteAccount(password: string): Promise<void> {
  return apiClient<void>('/api/v1/auth/delete-account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
}

// ── Cart & Saved APIs ─────────────────────────────────────────────────────

export async function fetchUserCart(): Promise<CartItemBackend[]> {
  return apiClient<CartItemBackend[]>('/api/v1/me/cart')
}

export async function setUserCartItem(productId: string, quantity: number): Promise<CartItemBackend[]> {
  return apiClient<CartItemBackend[]>('/api/v1/me/cart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: productId, quantity }),
  })
}

export async function deleteUserCartItem(productId: string): Promise<CartItemBackend[]> {
  return apiClient<CartItemBackend[]>(`/api/v1/me/cart/${encodeURIComponent(productId)}`, {
    method: 'DELETE',
  })
}

export async function fetchUserSaved(): Promise<SavedItemBackend[]> {
  return apiClient<SavedItemBackend[]>('/api/v1/me/saved')
}

export async function addUserSavedItem(productId: string): Promise<SavedItemBackend[]> {
  return apiClient<SavedItemBackend[]>('/api/v1/me/saved', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: productId }),
  })
}

export async function deleteUserSavedItem(productId: string): Promise<SavedItemBackend[]> {
  return apiClient<SavedItemBackend[]>(`/api/v1/me/saved/${encodeURIComponent(productId)}`, {
    method: 'DELETE',
  })
}

// ── History & Activity APIs ───────────────────────────────────────────────

export async function fetchUserHistory(): Promise<Array<{ id: string; product_id: string; store?: string; ts: string }>> {
  return apiClient('/api/v1/me/history')
}

export async function recordUserHistory(productId: string, store?: string): Promise<void> {
  return apiClient<void>('/api/v1/me/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: productId, store }),
  })
}

export async function logUserActivity(event: ActivityEvent): Promise<void> {
  return apiClient<void>('/api/v1/me/activity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  })
}

export async function clearUserActivity(): Promise<void> {
  return apiClient<void>('/api/v1/me/activity', {
    method: 'DELETE',
  })
}

// ── Preferences APIs ──────────────────────────────────────────────────────

export async function fetchUserPreferences(): Promise<Preferences> {
  return apiClient<Preferences>('/api/v1/me/preferences')
}

export async function updateUserPreferences(updates: Partial<Preferences>): Promise<Preferences> {
  return apiClient<Preferences>('/api/v1/me/preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
}

// ── Recommendations & Insights APIs ──────────────────────────────────────

export interface RecommendationItem {
  id: string
  product_id: string
  title: string
  brand?: string
  category?: string
  price: number
  current_price?: number
  original_price?: number
  originalPrice?: number
  discount?: number
  discountPercentage?: number
  rating?: number
  image_url?: string
  imageUrl?: string
  store?: string
  store_availability?: any[]
  price_history?: any[]
  buy_score?: number
  score?: number
  similarity?: number
  reason: string
}

export interface RecommendationsResponse {
  items: RecommendationItem[]
  state: 'ok' | 'not_enough_activity' | 'paused'
}

export interface SavedInsightItem {
  product_id: string
  buy_score: number
  verdict: 'good_time' | 'wait' | 'fair'
  current_price: number
  lowest_price_in_history: number
}

export async function fetchUserRecommendations(limit = 12): Promise<RecommendationsResponse> {
  return apiClient<RecommendationsResponse>(`/api/v1/me/recommendations?limit=${limit}`)
}

export async function fetchUserSavedInsights(): Promise<SavedInsightItem[]> {
  return apiClient<SavedInsightItem[]>('/api/v1/me/saved/insights')
}


