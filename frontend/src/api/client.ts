/** API Client for UrbanPick backend
 * Handles base URLs, timeouts, and ApiError classification.
 */

export type ApiErrorKind =
  | 'rate_limit'
  | 'validation'
  | 'bad_request'
  | 'unauthorized'
  | 'network'
  | 'server'
  | 'timeout'
  | 'unknown'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status: number
  readonly data?: unknown

  constructor(message: string, kind: ApiErrorKind, status = 0, data?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
    this.data = data
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL
  }
  // When running in browser, match the hostname (127.0.0.1 or localhost) to prevent cross-origin issues
  if (typeof window !== 'undefined' && window.location.hostname === '127.0.0.1') {
    return 'http://127.0.0.1:8001'
  }
  return 'http://localhost:8001'
}

export const API_BASE_URL = getApiBaseUrl()

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`
  const headers = new Headers(options.headers || {})

  const timeoutMs = 60000
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  let signal = controller.signal
  if (options.signal) {
    if (options.signal.aborted) {
      clearTimeout(timeoutId)
      controller.abort()
    } else {
      options.signal.addEventListener('abort', () => {
        clearTimeout(timeoutId)
        controller.abort()
      })
    }
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal,
      credentials: options.credentials || 'include',
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      let data: unknown
      let detailMsg = ''
      try {
        data = await response.json()
        if (
          typeof data === 'object' &&
          data !== null &&
          'detail' in data &&
          typeof (data as { detail: unknown }).detail === 'string'
        ) {
          detailMsg = (data as { detail: string }).detail
        }
      } catch {
        // Response was not JSON
      }

      let kind: ApiErrorKind = 'unknown'
      if (response.status === 429) {
        kind = 'rate_limit'
      } else if (response.status === 422) {
        kind = 'validation'
      } else if (response.status === 400) {
        kind = 'bad_request'
      } else if (response.status === 401) {
        kind = 'unauthorized'
      } else if (response.status >= 500) {
        kind = 'server'
      }

      const msg =
        detailMsg ||
        (kind === 'rate_limit'
          ? "You're searching very fast. Please wait a moment."
          : `Request failed with status ${response.status}`)

      throw new ApiError(msg, kind, response.status, data)
    }

    if (response.status === 204) {
      return undefined as T
    }

    return (await response.json()) as T
  } catch (err: unknown) {
    clearTimeout(timeoutId)
    if (err instanceof ApiError) {
      throw err
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      if (options.signal?.aborted) {
        throw new ApiError('Request aborted', 'unknown', 0)
      }
      throw new ApiError('Request timed out. Please try again.', 'timeout', 408)
    }
    const message = err instanceof Error ? err.message : 'Network request failed'
    throw new ApiError(message, 'network', 0)
  }
}

