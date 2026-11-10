import { apiClient } from './client'
import { mapProduct } from './mappers'
import type { Product } from './types'

export interface BudgetPlanItem extends Product {
  value_score?: number
  why?: string
}

export interface BudgetPlanDetails {
  items: BudgetPlanItem[]
  total: number
  remaining: number
}

export interface BudgetPlanResponse {
  budget: number
  mode: 'single' | 'mix'
  plan: BudgetPlanDetails
  buy_now: BudgetPlanItem[]
  wait: BudgetPlanItem[]
  message?: string | null
}

export interface BudgetPlanRequest {
  budget: number
  categories?: string[]
  mode?: 'single' | 'mix'
}

function mapBudgetItem(raw: any): BudgetPlanItem {
  const product = mapProduct(raw)
  return {
    ...product,
    value_score: raw.value_score !== undefined ? Number(raw.value_score) : undefined,
    why: raw.why ? String(raw.why) : undefined,
  }
}

export async function postBudgetPlan(
  request: BudgetPlanRequest,
  signal?: AbortSignal
): Promise<BudgetPlanResponse> {
  const raw = await apiClient<{
    budget: number
    mode: 'single' | 'mix'
    plan: {
      items: any[]
      total: number
      remaining: number
    }
    buy_now: any[]
    wait: any[]
    message?: string | null
  }>('/api/v1/budget/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      budget: request.budget,
      categories: request.categories && request.categories.length > 0 ? request.categories : undefined,
      mode: request.mode ?? 'mix',
    }),
    signal,
  })

  return {
    budget: Number(raw.budget),
    mode: raw.mode,
    plan: {
      items: Array.isArray(raw.plan?.items) ? raw.plan.items.map(mapBudgetItem) : [],
      total: Number(raw.plan?.total ?? 0),
      remaining: Number(raw.plan?.remaining ?? 0),
    },
    buy_now: Array.isArray(raw.buy_now) ? raw.buy_now.map(mapBudgetItem) : [],
    wait: Array.isArray(raw.wait) ? raw.wait.map(mapBudgetItem) : [],
    message: raw.message ?? undefined,
  }
}

