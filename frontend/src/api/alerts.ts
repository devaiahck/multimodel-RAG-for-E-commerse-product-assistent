import { apiClient } from './client'

export interface PriceAlert {
  id: string
  user_email: string
  product_id: string
  target_price: number | null
  notify_on_good_time: boolean
  channel: 'sms' | 'telegram' | 'email'
  destination: string
  active: boolean
  last_notified_at: string | null
  created_at: string
}

export interface CreateAlertPayload {
  user_email?: string
  product_id: string
  target_price?: number | null
  notify_on_good_time: boolean
  channel: 'sms' | 'telegram' | 'email'
  destination: string
}

export interface SendOtpResponse {
  ok: boolean
  message: string
  expires_at: string
  code?: string
}

export interface VerifyOtpResponse {
  ok: boolean
  verified: boolean
  message: string
}

export async function createAlert(payload: CreateAlertPayload): Promise<PriceAlert> {
  return apiClient<PriceAlert>('/api/v1/alerts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function getAlerts(
  _userEmail?: string,
  productId?: string
): Promise<PriceAlert[]> {
  const params = new URLSearchParams()
  if (productId) {
    params.set('product_id', productId)
  }
  const query = params.toString() ? `?${params.toString()}` : ''
  return apiClient<PriceAlert[]>(`/api/v1/alerts${query}`)
}

export async function deleteAlert(alertId: string): Promise<{ ok: boolean; message: string }> {
  return apiClient<{ ok: boolean; message: string }>(`/api/v1/alerts/${alertId}`, {
    method: 'DELETE',
  })
}

export async function sendPhoneOtp(phone: string): Promise<SendOtpResponse> {
  return apiClient<SendOtpResponse>('/api/v1/phone/send-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  })
}

export async function verifyPhoneOtp(
  phone: string,
  code: string
): Promise<VerifyOtpResponse> {
  return apiClient<VerifyOtpResponse>('/api/v1/phone/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code }),
  })
}

