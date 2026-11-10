import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Image as ImageIcon, AlertCircle, RotateCcw } from 'lucide-react'
import { useCategories } from '../hooks/useHomeData'
import { postBudgetPlan, type BudgetPlanResponse, type BudgetPlanItem } from '../api/budget'
import { useCompareStore } from '../store/compare'
import { formatINR } from '../lib/format'

const STORAGE_KEY = 'urbanpick_budget_amount'
const QUICK_AMOUNTS = [2000, 5000, 10000, 25000]

function getInitialAmount(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && !isNaN(Number(saved)) && Number(saved) >= 100) {
      return saved
    }
  } catch {
    // Ignore localStorage errors
  }
  return '10000'
}

export default function Budget() {
  const [amountInput, setAmountInput] = useState<string>(getInitialAmount)
  const [mode, setMode] = useState<'single' | 'mix'>('mix')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [planData, setPlanData] = useState<BudgetPlanResponse | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const { data: categories = [] } = useCategories()
  const isInCompare = useCompareStore((s) => s.isInCompare)
  const toggleCompare = useCompareStore((s) => s.toggleItem)

  const fetchPlan = useCallback(
    async (targetAmount?: string, targetMode?: 'single' | 'mix', targetCats?: string[]) => {
      const amtStr = targetAmount ?? amountInput
      const num = parseFloat(amtStr.replace(/,/g, '').trim())
      if (isNaN(num) || num < 100) {
        setError('Please enter a budget of at least ₹100.')
        return
      }
      if (num > 10000000) {
        setError('Budget cannot exceed ₹10,000,000.')
        return
      }

      try {
        localStorage.setItem(STORAGE_KEY, String(num))
      } catch {
        // Ignore localStorage error
      }

      setIsLoading(true)
      setError(null)

      try {
        const activeCats = targetCats !== undefined ? targetCats : selectedCategories
        const activeMode = targetMode !== undefined ? targetMode : mode

        const res = await postBudgetPlan({
          budget: num,
          categories: activeCats.length > 0 ? activeCats : undefined,
          mode: activeMode,
        })
        setPlanData(res)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unable to generate budget plan.'
        setError(msg)
      } finally {
        setIsLoading(false)
      }
    },
    [amountInput, mode, selectedCategories]
  )

  // Fetch plan on initial mount
  useEffect(() => {
    fetchPlan()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleAmountChange = (val: string) => {
    const clean = val.replace(/[^0-9]/g, '')
    setAmountInput(clean)
    setError(null)
  }

  const handleQuickAmount = (val: number) => {
    setAmountInput(String(val))
    setError(null)
    fetchPlan(String(val), mode, selectedCategories)
  }

  const handleModeChange = (newMode: 'single' | 'mix') => {
    setMode(newMode)
    fetchPlan(amountInput, newMode, selectedCategories)
  }

  const toggleCategory = (catLabel: string) => {
    let next: string[]
    if (selectedCategories.includes(catLabel)) {
      next = selectedCategories.filter((c) => c !== catLabel)
    } else {
      next = [...selectedCategories, catLabel]
    }
    setSelectedCategories(next)
    fetchPlan(amountInput, mode, next)
  }

  const selectAllCategories = () => {
    setSelectedCategories([])
    fetchPlan(amountInput, mode, [])
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    fetchPlan()
  }

  return (
    <div
      style={{
        backgroundColor: 'var(--bg, #fbfbf9)',
        minHeight: '100vh',
        padding: '2.5rem 1rem 5rem',
        fontFamily: 'Manrope, sans-serif',
      }}
    >
      <div style={{ maxWidth: '960px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <p
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-muted, #6b7280)',
              marginBottom: '0.35rem',
            }}
          >
            Planning
          </p>
          <h1
            style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              color: 'var(--text-h, #111827)',
              letterSpacing: '-0.02em',
              margin: 0,
            }}
          >
            Budget planner
          </h1>
          <p
            style={{
              fontSize: '0.88rem',
              color: 'var(--text-muted, #6b7280)',
              marginTop: '0.35rem',
              marginBottom: 0,
            }}
          >
            Find the highest-value items within your budget based on price history, buy confidence, and ratings.
          </p>
        </div>

        {/* Input Card */}
        <div
          style={{
            backgroundColor: 'var(--surface, #ffffff)',
            border: '1px solid var(--line, #e5e7eb)',
            borderRadius: 'var(--r-lg, 12px)',
            padding: '1.5rem',
            marginBottom: '2rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          }}
        >
          <form onSubmit={handleSubmit}>
            {/* Amount Input */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label
                htmlFor="budget-amount-input"
                style={{
                  display: 'block',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: 'var(--text-h, #111827)',
                  marginBottom: '0.5rem',
                }}
              >
                Target budget
              </label>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  border: '1px solid var(--line, #e5e7eb)',
                  borderRadius: 'var(--r-md, 8px)',
                  padding: '0 12px',
                  backgroundColor: '#ffffff',
                  maxWidth: '360px',
                }}
              >
                <span
                  style={{
                    fontSize: '1.1rem',
                    fontWeight: 600,
                    color: 'var(--text-muted, #6b7280)',
                    marginRight: '6px',
                  }}
                >
                  ₹
                </span>
                <input
                  id="budget-amount-input"
                  type="text"
                  inputMode="numeric"
                  value={amountInput}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  placeholder="10000"
                  style={{
                    border: 'none',
                    outline: 'none',
                    fontSize: '1.1rem',
                    fontWeight: 600,
                    color: 'var(--text-h, #111827)',
                    width: '100%',
                    padding: '10px 0',
                    fontFamily: 'Manrope, sans-serif',
                  }}
                />
              </div>

              {/* Quick Pills */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px',
                  marginTop: '0.75rem',
                }}
              >
                {QUICK_AMOUNTS.map((amt) => {
                  const isActive = amountInput === String(amt)
                  return (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => handleQuickAmount(amt)}
                      style={{
                        padding: '5px 12px',
                        borderRadius: 'var(--r-pill, 9999px)',
                        fontSize: '0.78rem',
                        fontWeight: isActive ? 600 : 500,
                        border: isActive ? '1px solid var(--ink-900, #111827)' : '1px solid var(--line, #e5e7eb)',
                        backgroundColor: isActive ? 'var(--ink-900, #111827)' : 'transparent',
                        color: isActive ? '#ffffff' : 'var(--text-h, #111827)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {formatINR(amt)}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Category Filter Chips */}
            {categories.length > 0 && (
              <div style={{ marginBottom: '1.25rem' }}>
                <span
                  style={{
                    display: 'block',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    color: 'var(--text-h, #111827)',
                    marginBottom: '0.5rem',
                  }}
                >
                  Categories
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={selectAllCategories}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 'var(--r-pill, 9999px)',
                      fontSize: '0.78rem',
                      fontWeight: selectedCategories.length === 0 ? 600 : 500,
                      border:
                        selectedCategories.length === 0
                          ? '1px solid var(--ink-900, #111827)'
                          : '1px solid var(--line, #e5e7eb)',
                      backgroundColor: selectedCategories.length === 0 ? 'var(--ink-900, #111827)' : 'transparent',
                      color: selectedCategories.length === 0 ? '#ffffff' : 'var(--text-h, #111827)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    All
                  </button>
                  {categories.map((cat) => {
                    const isSelected = selectedCategories.includes(cat.label)
                    return (
                      <button
                        key={cat.slug}
                        type="button"
                        onClick={() => toggleCategory(cat.label)}
                        style={{
                          padding: '5px 12px',
                          borderRadius: 'var(--r-pill, 9999px)',
                          fontSize: '0.78rem',
                          fontWeight: isSelected ? 600 : 500,
                          border: isSelected
                            ? '1px solid var(--ink-900, #111827)'
                            : '1px solid var(--line, #e5e7eb)',
                          backgroundColor: isSelected ? 'var(--ink-900, #111827)' : 'transparent',
                          color: isSelected ? '#ffffff' : 'var(--text-h, #111827)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {cat.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Mode Segmented Control + Show Plan Action */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                paddingTop: '0.5rem',
                borderTop: '1px solid var(--line, #e5e7eb)',
              }}
            >
              {/* Segmented Control */}
              <div
                style={{
                  display: 'inline-flex',
                  backgroundColor: 'var(--bg, #f3f4f6)',
                  borderRadius: 'var(--r-md, 8px)',
                  padding: '3px',
                }}
              >
                <button
                  type="button"
                  onClick={() => handleModeChange('single')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    fontSize: '0.82rem',
                    fontWeight: mode === 'single' ? 600 : 500,
                    border: 'none',
                    backgroundColor: mode === 'single' ? '#ffffff' : 'transparent',
                    color: mode === 'single' ? 'var(--text-h, #111827)' : 'var(--text-muted, #6b7280)',
                    cursor: 'pointer',
                    boxShadow: mode === 'single' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Single best buy
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange('mix')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    fontSize: '0.82rem',
                    fontWeight: mode === 'mix' ? 600 : 500,
                    border: 'none',
                    backgroundColor: mode === 'mix' ? '#ffffff' : 'transparent',
                    color: mode === 'mix' ? 'var(--text-h, #111827)' : 'var(--text-muted, #6b7280)',
                    cursor: 'pointer',
                    boxShadow: mode === 'mix' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Plan a mix
                </button>
              </div>

              {/* Show Plan Button */}
              <button
                type="submit"
                disabled={isLoading}
                style={{
                  padding: '9px 20px',
                  borderRadius: 'var(--r-md, 8px)',
                  backgroundColor: 'var(--ink-900, #111827)',
                  color: '#ffffff',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  border: 'none',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  opacity: isLoading ? 0.7 : 1,
                  fontFamily: 'Manrope, sans-serif',
                  transition: 'opacity 0.15s ease',
                }}
              >
                {isLoading ? 'Planning...' : 'Show plan'}
              </button>
            </div>
          </form>
        </div>

        {/* Error State */}
        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1rem 1.25rem',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 'var(--r-md, 8px)',
              marginBottom: '1.5rem',
              color: '#991b1b',
              fontSize: '0.88rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => fetchPlan()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 10px',
                borderRadius: '6px',
                backgroundColor: '#ffffff',
                border: '1px solid #fca5a5',
                color: '#991b1b',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <RotateCcw size={13} />
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* Loading Skeleton */}
        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '2rem' }}>
            <div
              style={{
                height: '24px',
                width: '260px',
                backgroundColor: 'var(--line, #e5e7eb)',
                borderRadius: '4px',
              }}
            />
            <div
              style={{
                height: '90px',
                backgroundColor: 'var(--surface, #ffffff)',
                border: '1px solid var(--line, #e5e7eb)',
                borderRadius: 'var(--r-md, 8px)',
              }}
            />
            <div
              style={{
                height: '90px',
                backgroundColor: 'var(--surface, #ffffff)',
                border: '1px solid var(--line, #e5e7eb)',
                borderRadius: 'var(--r-md, 8px)',
              }}
            />
          </div>
        )}

        {/* Empty State / Message from API */}
        {!isLoading && planData && planData.plan.items.length === 0 && (
          <div
            style={{
              padding: '2rem',
              backgroundColor: 'var(--surface, #ffffff)',
              border: '1px solid var(--line, #e5e7eb)',
              borderRadius: 'var(--r-md, 8px)',
              textAlign: 'center',
              color: 'var(--text-muted, #6b7280)',
              fontSize: '0.9rem',
              marginBottom: '2rem',
            }}
          >
            <p style={{ margin: 0 }}>
              {planData.message || 'Nothing in the catalog fits this budget yet.'}
            </p>
          </div>
        )}

        {/* Plan Results */}
        {!isLoading && planData && planData.plan.items.length > 0 && (
          <div style={{ marginBottom: '2.5rem' }}>
            {/* One-line summary */}
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
                marginBottom: '1rem',
              }}
            >
              <h2
                style={{
                  fontSize: '1.05rem',
                  fontWeight: 700,
                  color: 'var(--text-h, #111827)',
                  margin: 0,
                }}
              >
                Recommended plan
              </h2>
              <span
                style={{
                  fontSize: '0.84rem',
                  color: 'var(--text-muted, #6b7280)',
                  fontWeight: 500,
                }}
              >
                Total {formatINR(planData.plan.total)} of {formatINR(planData.budget)},{' '}
                {formatINR(planData.plan.remaining)} left
              </span>
            </div>

            {/* Plan Item Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {planData.plan.items.map((item) => (
                <BudgetItemRow
                  key={item.id}
                  item={item}
                  isInCompare={isInCompare(item.id)}
                  onToggleCompare={() =>
                    toggleCompare({
                      id: item.id,
                      title: item.title,
                      price: item.price,
                      imageUrl: item.image_url,
                      brand: item.brand,
                      category: item.category,
                    })
                  }
                />
              ))}
            </div>
          </div>
        )}

        {/* Good to buy now Section */}
        {!isLoading && planData && planData.buy_now.length > 0 && (
          <div style={{ marginBottom: '2.5rem' }}>
            <div style={{ marginBottom: '0.75rem' }}>
              <h3
                style={{
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  color: 'var(--text-h, #111827)',
                  margin: 0,
                }}
              >
                Good to buy now
              </h3>
              <p
                style={{
                  fontSize: '0.78rem',
                  color: 'var(--text-muted, #6b7280)',
                  margin: '2px 0 0',
                }}
              >
                High buy confidence products within your price range.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {planData.buy_now.map((item) => (
                <CompactItemRow
                  key={item.id}
                  item={item}
                  isInCompare={isInCompare(item.id)}
                  onToggleCompare={() =>
                    toggleCompare({
                      id: item.id,
                      title: item.title,
                      price: item.price,
                      imageUrl: item.image_url,
                      brand: item.brand,
                      category: item.category,
                    })
                  }
                />
              ))}
            </div>
          </div>
        )}

        {/* Better to wait Section */}
        {!isLoading && planData && planData.wait.length > 0 && (
          <div style={{ marginBottom: '2.5rem' }}>
            <div style={{ marginBottom: '0.75rem' }}>
              <h3
                style={{
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  color: 'var(--text-h, #111827)',
                  margin: 0,
                }}
              >
                Better to wait
              </h3>
              <p
                style={{
                  fontSize: '0.78rem',
                  color: 'var(--text-muted, #6b7280)',
                  margin: '2px 0 0',
                }}
              >
                Priced above typical levels or showing low buy scores.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {planData.wait.map((item) => (
                <CompactItemRow
                  key={item.id}
                  item={item}
                  isInCompare={isInCompare(item.id)}
                  onToggleCompare={() =>
                    toggleCompare({
                      id: item.id,
                      title: item.title,
                      price: item.price,
                      imageUrl: item.image_url,
                      brand: item.brand,
                      category: item.category,
                    })
                  }
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface BudgetItemRowProps {
  item: BudgetPlanItem
  isInCompare: boolean
  onToggleCompare: () => void
}

function BudgetItemRow({ item, isInCompare, onToggleCompare }: BudgetItemRowProps) {
  const [imgFailed, setImgFailed] = useState(false)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'var(--surface, #ffffff)',
        border: '1px solid var(--line, #e5e7eb)',
        borderRadius: 'var(--r-md, 8px)',
        padding: '12px 14px',
        gap: '12px',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1 1 280px' }}>
        {/* Product Image / Neutral Fallback */}
        <div
          style={{
            width: '54px',
            height: '54px',
            borderRadius: '6px',
            backgroundColor: '#f3f4f6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            flexShrink: 0,
            border: '1px solid var(--line, #e5e7eb)',
          }}
        >
          {item.image_url && !imgFailed ? (
            <img
              src={item.image_url}
              alt={item.title}
              onError={() => setImgFailed(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <ImageIcon size={22} color="var(--text-muted, #9ca3af)" />
          )}
        </div>

        {/* Title, Brand & Factual Why */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <Link
              to={`/product/${item.id}`}
              style={{
                fontSize: '0.88rem',
                fontWeight: 600,
                color: 'var(--text-h, #111827)',
                textDecoration: 'none',
              }}
            >
              {item.title}
            </Link>
            {item.buy_score !== undefined && (
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backgroundColor:
                    item.buy_score >= 70 ? 'rgba(34, 197, 94, 0.12)' : 'rgba(249, 115, 22, 0.12)',
                  color: item.buy_score >= 70 ? '#15803d' : '#c2410c',
                }}
              >
                Buy score {item.buy_score}
              </span>
            )}
          </div>

          {item.brand && (
            <span
              style={{
                display: 'block',
                fontSize: '0.74rem',
                color: 'var(--text-muted, #6b7280)',
                marginTop: '1px',
              }}
            >
              {item.brand}
            </span>
          )}

          {item.why && (
            <p
              style={{
                fontSize: '0.78rem',
                color: 'var(--text-muted, #4b5563)',
                margin: '4px 0 0',
                lineHeight: 1.4,
              }}
            >
              {item.why}
            </p>
          )}
        </div>
      </div>

      {/* Price & Compare Checkbox */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          marginLeft: 'auto',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: '0.94rem', fontWeight: 700, color: 'var(--text-h, #111827)' }}>
          {formatINR(item.price)}
        </span>

        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '0.74rem',
            fontWeight: isInCompare ? 600 : 500,
            color: isInCompare ? 'var(--text-h, #111827)' : 'var(--text-muted, #6b7280)',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <input
            type="checkbox"
            checked={isInCompare}
            onChange={onToggleCompare}
            style={{
              accentColor: 'var(--ink-900, #111827)',
              width: '13px',
              height: '13px',
              cursor: 'pointer',
            }}
          />
          <span>Compare</span>
        </label>
      </div>
    </div>
  )
}

function CompactItemRow({ item, isInCompare, onToggleCompare }: BudgetItemRowProps) {
  const [imgFailed, setImgFailed] = useState(false)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'var(--surface, #ffffff)',
        border: '1px solid var(--line, #e5e7eb)',
        borderRadius: 'var(--r-md, 8px)',
        padding: '8px 12px',
        gap: '10px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '4px',
            backgroundColor: '#f3f4f6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          {item.image_url && !imgFailed ? (
            <img
              src={item.image_url}
              alt={item.title}
              onError={() => setImgFailed(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <ImageIcon size={16} color="var(--text-muted, #9ca3af)" />
          )}
        </div>

        <div style={{ minWidth: 0 }}>
          <Link
            to={`/product/${item.id}`}
            style={{
              fontSize: '0.82rem',
              fontWeight: 600,
              color: 'var(--text-h, #111827)',
              textDecoration: 'none',
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {item.title}
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '1px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-h, #111827)' }}>
              {formatINR(item.price)}
            </span>
            {item.buy_score !== undefined && (
              <span
                style={{
                  fontSize: '0.66rem',
                  fontWeight: 600,
                  color: item.buy_score >= 70 ? '#15803d' : '#c2410c',
                }}
              >
                Score {item.buy_score}
              </span>
            )}
          </div>
        </div>
      </div>

      <label
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '0.72rem',
          color: isInCompare ? 'var(--text-h, #111827)' : 'var(--text-muted, #6b7280)',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        <input
          type="checkbox"
          checked={isInCompare}
          onChange={onToggleCompare}
          style={{ accentColor: 'var(--ink-900, #111827)', width: '12px', height: '12px' }}
        />
        <span>Compare</span>
      </label>
    </div>
  )
}

