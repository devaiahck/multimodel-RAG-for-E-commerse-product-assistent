import { useState, useEffect, useRef, useId, useCallback } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  Sparkles,
  X,
  Send,
  RotateCcw,
  Scale,
  Image as ImageIcon,
  Check,
  AlertCircle,
  ExternalLink,
} from 'lucide-react'
import { assistantChat, getAssistantSuggestions, type ChatHistoryItem } from '../../api/assistant'
import type { Product } from '../../api/types'
import { useCompareStore } from '../../store/compare'
import { formatINR } from '../../lib/format'
import { computeBuyScore, computeRealDiscount } from '../../lib/priceInsight'
import { isApiError } from '../../api/client'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  products?: Product[]
  error?: string
}

const STORAGE_KEY = 'urbanpick_assistant_chat'

function loadMessages(): Message[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveMessages(msgs: Message[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(msgs))
  } catch {
    // Ignore storage quota errors
  }
}

export default function AssistantChatDrawer() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>(loadMessages)
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])

  // Load suggestions from GET /api/v1/assistant/suggestions (show nothing if the call fails)
  useEffect(() => {
    let ignore = false
    if (isOpen && suggestions.length === 0) {
      getAssistantSuggestions()
        .then((items) => {
          if (!ignore && Array.isArray(items)) {
            setSuggestions(items)
          }
        })
        .catch(() => {
          if (!ignore) setSuggestions([])
        })
    }
    return () => {
      ignore = true
    }
  }, [isOpen, suggestions.length])

  const location = useLocation()
  const navigate = useNavigate()
  const compareItems = useCompareStore((state) => state.items)
  const { addItem, isInCompare } = useCompareStore()

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputId = useId()

  // Track window width for responsive full-screen sheet on mobile
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 640 : false
  )

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 640)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Auto-scroll to bottom of messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isLoading, isOpen])

  // Focus management: move to input when opened, return to button when closed
  useEffect(() => {
    if (isOpen) {
      // Delay slightly for render transition
      const timer = setTimeout(() => {
        inputRef.current?.focus()
      }, 50)
      return () => clearTimeout(timer)
    } else {
      triggerRef.current?.focus()
    }
  }, [isOpen])

  // Handle Esc key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  // Save messages to sessionStorage
  useEffect(() => {
    saveMessages(messages)
  }, [messages])

  const handleClearChat = useCallback(() => {
    setMessages([])
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      // Ignore
    }
  }, [])

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend ?? input).trim()
    if (!text || isLoading) return

    if (text.length > 300) return

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
    }

    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setInput('')
    setIsLoading(true)

    // Build history of last 6 turns
    const history: ChatHistoryItem[] = updatedMessages
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content }))

    try {
      const resp = await assistantChat(text, history)
      const assistantMsg: Message = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: resp.answer,
        products: resp.products,
      }
      setMessages((prev) => [...prev, assistantMsg])
    } catch (err: unknown) {
      let errorText = 'Could not reach the assistant. Try again.'
      if (isApiError(err)) {
        if (err.status === 429 || err.kind === 'rate_limit') {
          errorText = 'Too many questions, please wait a minute.'
        }
      }
      const errorMsg: Message = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: errorText,
        error: errorText,
      }
      setMessages((prev) => [...prev, errorMsg])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDownInput = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  // Calculate bottom positioning so floating button never overlaps with CompareBar
  const isCompareBarVisible = compareItems.length > 0 && location.pathname !== '/compare'
  const buttonBottom = isCompareBarVisible ? '84px' : '24px'

  return (
    <>
      {/* Floating "Ask UrbanPick" Button */}
      <button
        ref={triggerRef}
        type="button"
        aria-label="Open UrbanPick Shopping Assistant"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        style={{
          position: 'fixed',
          bottom: buttonBottom,
          right: '24px',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 20px',
          backgroundColor: '#111827',
          color: '#ffffff',
          borderRadius: 'var(--r-pill, 9999px)',
          border: '1px solid rgba(255,255,255,0.15)',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.22)',
          fontFamily: 'Manrope, sans-serif',
          fontSize: '0.9rem',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'bottom 0.25s ease, transform 0.15s ease, background-color 0.2s ease',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-2px)')}
        onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
      >
        <Sparkles size={16} color="#fbbf24" />
        <span>Ask UrbanPick</span>
      </button>

      {/* Backdrop for mobile / outside click */}
      {isOpen && (
        <div
          role="presentation"
          onClick={() => setIsOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: isMobile ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.25)',
            backdropFilter: 'blur(2px)',
            zIndex: 99,
          }}
        />
      )}

      {/* Chat Drawer / Sheet Panel */}
      {isOpen && (
        <aside
          role="dialog"
          aria-label="UrbanPick Assistant"
          aria-modal="true"
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: isMobile ? '100vw' : '400px',
            maxWidth: '100vw',
            height: '100vh',
            backgroundColor: 'var(--card, #ffffff)',
            zIndex: 100,
            boxShadow: '-6px 0 28px rgba(0, 0, 0, 0.16)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--line, #e5e7eb)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: 'var(--bg, #fbfbfb)',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={18} color="#d97706" />
                <h2
                  className="font-display"
                  style={{
                    margin: 0,
                    fontSize: '1.05rem',
                    fontWeight: 600,
                    color: 'var(--text-h, #111827)',
                  }}
                >
                  UrbanPick Assistant
                </h2>
              </div>
              <p
                style={{
                  margin: '2px 0 0',
                  fontSize: '0.72rem',
                  color: 'var(--text-muted, #6b7280)',
                }}
              >
                Answers use only products in our catalog
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {messages.length > 0 && (
                <button
                  type="button"
                  title="New chat"
                  aria-label="Start new chat"
                  onClick={handleClearChat}
                  style={{
                    padding: '8px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    borderRadius: 'var(--r-md, 8px)',
                    color: 'var(--text-muted, #6b7280)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--line, #e5e7eb)'
                    e.currentTarget.style.color = 'var(--text-h, #111827)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                    e.currentTarget.style.color = 'var(--text-muted, #6b7280)'
                  }}
                >
                  <RotateCcw size={16} />
                </button>
              )}
              <button
                type="button"
                aria-label="Close assistant"
                onClick={() => setIsOpen(false)}
                style={{
                  padding: '8px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderRadius: 'var(--r-md, 8px)',
                  color: 'var(--text-muted, #6b7280)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--line, #e5e7eb)'
                  e.currentTarget.style.color = 'var(--text-h, #111827)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                  e.currentTarget.style.color = 'var(--text-muted, #6b7280)'
                }}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Message List / Content */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            {/* Empty State with Suggestions */}
            {messages.length === 0 && (
              <div
                style={{
                  padding: '24px 8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                }}
              >
                <div
                  style={{
                    padding: '14px 16px',
                    borderRadius: 'var(--r-md, 8px)',
                    backgroundColor: 'var(--bg, #f9fafb)',
                    border: '1px solid var(--line, #e5e7eb)',
                    fontSize: '0.86rem',
                    lineHeight: 1.5,
                    color: 'var(--text, #374151)',
                  }}
                >
                  Ask about products, prices or deals.
                </div>

                {suggestions.length > 0 && (
                  <div>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        color: 'var(--text-muted, #6b7280)',
                        letterSpacing: '0.04em',
                      }}
                    >
                      Suggested Questions
                    </span>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        marginTop: '8px',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          navigate('/budget')
                          setIsOpen(false)
                        }}
                        style={{
                          textAlign: 'left',
                          padding: '10px 14px',
                          borderRadius: 'var(--r-md, 8px)',
                          backgroundColor: 'var(--bg, #f9fafb)',
                          border: '1px solid var(--line, #e5e7eb)',
                          color: 'var(--text-h, #111827)',
                          fontSize: '0.84rem',
                          fontFamily: 'Manrope, sans-serif',
                          fontWeight: 500,
                          cursor: 'pointer',
                          transition: 'background-color 0.15s ease, border-color 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'rgba(217, 119, 6, 0.08)'
                          e.currentTarget.style.borderColor = 'rgba(217, 119, 6, 0.3)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--bg, #f9fafb)'
                          e.currentTarget.style.borderColor = 'var(--line, #e5e7eb)'
                        }}
                      >
                        Plan my budget
                      </button>
                      {suggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => handleSendMessage(suggestion)}
                          style={{
                            textAlign: 'left',
                            padding: '10px 14px',
                            borderRadius: 'var(--r-md, 8px)',
                            backgroundColor: 'var(--bg, #f9fafb)',
                            border: '1px solid var(--line, #e5e7eb)',
                            color: 'var(--text-h, #111827)',
                            fontSize: '0.84rem',
                            fontFamily: 'Manrope, sans-serif',
                            fontWeight: 500,
                            cursor: 'pointer',
                            transition: 'background-color 0.15s ease, border-color 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(217, 119, 6, 0.08)'
                            e.currentTarget.style.borderColor = 'rgba(217, 119, 6, 0.3)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--bg, #f9fafb)'
                            e.currentTarget.style.borderColor = 'var(--line, #e5e7eb)'
                          }}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Conversation Messages */}
            {messages.map((m) => {
              const isUser = m.role === 'user'
              return (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isUser ? 'flex-end' : 'flex-start',
                    gap: '10px',
                    maxWidth: '100%',
                  }}
                >
                  {/* Bubble */}
                  <div
                    style={{
                      padding: isUser ? '10px 14px' : '14px 16px',
                      borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      backgroundColor: isUser
                        ? '#111827'
                        : m.error
                          ? 'rgba(239, 68, 68, 0.08)'
                          : 'var(--bg, #f9fafb)',
                      color: isUser
                        ? '#ffffff'
                        : m.error
                          ? '#b91c1c'
                          : 'var(--text, #374151)',
                      border: isUser
                        ? 'none'
                        : `1px solid ${m.error ? 'rgba(239, 68, 68, 0.25)' : 'var(--line, #e5e7eb)'}`,
                      fontSize: '0.88rem',
                      lineHeight: 1.5,
                      whiteSpace: 'pre-wrap',
                      maxWidth: '92%',
                      wordBreak: 'break-word',
                    }}
                  >
                    {m.error && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                        <AlertCircle size={15} color="#b91c1c" />
                        <strong style={{ fontSize: '0.82rem' }}>Error</strong>
                      </div>
                    )}
                    {m.content}
                  </div>

                  {/* Product Cards for Assistant Response */}
                  {!isUser && Array.isArray(m.products) && m.products.length > 0 && (
                    <div
                      style={{
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        marginTop: '4px',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          color: 'var(--text-muted, #6b7280)',
                          letterSpacing: '0.04em',
                        }}
                      >
                        Matching Catalog Products ({m.products.length})
                      </div>

                      {m.products.map((product) => (
                        <AssistantProductCard
                          key={product.id}
                          product={product}
                          isInCompare={isInCompare(product.id)}
                          onToggleCompare={() =>
                            addItem({
                              id: product.id,
                              title: product.title,
                              price: product.price,
                              imageUrl: product.image_url,
                              brand: product.brand,
                              category: product.category,
                            })
                          }
                          onCloseDrawer={() => setIsOpen(false)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Loading Indicator */}
            {isLoading && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 16px',
                  borderRadius: '16px 16px 16px 4px',
                  backgroundColor: 'var(--bg, #f9fafb)',
                  border: '1px solid var(--line, #e5e7eb)',
                  color: 'var(--text-muted, #6b7280)',
                  fontSize: '0.84rem',
                  maxWidth: '70%',
                }}
              >
                <Sparkles size={14} className="animate-spin" color="#d97706" />
                <span>Thinking…</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div
            style={{
              padding: '14px 18px',
              borderTop: '1px solid var(--line, #e5e7eb)',
              backgroundColor: 'var(--card, #ffffff)',
            }}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleSendMessage()
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
            >
              <label htmlFor={inputId} className="sr-only">
                Ask about products
              </label>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: '8px',
                  borderRadius: 'var(--r-md, 10px)',
                  border: '1px solid var(--line, #e5e7eb)',
                  backgroundColor: 'var(--bg, #fbfbfb)',
                  padding: '8px 10px',
                }}
              >
                <textarea
                  id={inputId}
                  ref={inputRef}
                  rows={2}
                  maxLength={300}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDownInput}
                  placeholder="Ask about products, brands or budget…"
                  aria-label="Ask about products"
                  style={{
                    flex: 1,
                    resize: 'none',
                    border: 'none',
                    backgroundColor: 'transparent',
                    fontSize: '0.86rem',
                    fontFamily: 'Manrope, sans-serif',
                    color: 'var(--text-h, #111827)',
                    outline: 'none',
                    lineHeight: 1.4,
                  }}
                />
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  aria-label="Send message"
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--r-sm, 6px)',
                    backgroundColor: isLoading || !input.trim() ? 'var(--line, #e5e7eb)' : '#111827',
                    color: isLoading || !input.trim() ? 'var(--text-muted, #9ca3af)' : '#ffffff',
                    border: 'none',
                    cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'background-color 0.15s ease',
                  }}
                >
                  <Send size={15} />
                </button>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '0.7rem',
                  color: 'var(--text-muted, #6b7280)',
                }}
              >
                <span>Press Enter to send, Shift+Enter for new line</span>
                <span>{input.length}/300</span>
              </div>
            </form>
          </div>
        </aside>
      )}
    </>
  )
}

/**
 * Compact Product Card rendered inside assistant messages.
 */
function AssistantProductCard({
  product,
  isInCompare,
  onToggleCompare,
  onCloseDrawer,
}: {
  product: Product
  isInCompare: boolean
  onToggleCompare: () => void
  onCloseDrawer: () => void
}) {
  const [imgError, setImgError] = useState(false)

  // Compute or read buy score
  const history = Array.isArray(product.price_history) ? product.price_history : []
  const buyScoreResult = computeBuyScore(history, product.price)
  const buyScore = product.buy_score ?? buyScoreResult.score

  // Compute or read real discount verdict
  const realDisc = product.real_discount ?? computeRealDiscount(history, product.price, product.original_price)
  const isInflated = realDisc.verdict === 'inflated'

  return (
    <div
      style={{
        display: 'flex',
        gap: '12px',
        padding: '10px',
        borderRadius: 'var(--r-md, 10px)',
        backgroundColor: '#ffffff',
        border: '1px solid var(--line, #e5e7eb)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
      }}
    >
      {/* Thumbnail */}
      <div
        style={{
          width: '64px',
          height: '64px',
          borderRadius: 'var(--r-sm, 6px)',
          backgroundColor: 'var(--bg, #f3f4f6)',
          overflow: 'hidden',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {product.image_url && !imgError ? (
          <img
            src={product.image_url}
            alt={product.title}
            onError={() => setImgError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <ImageIcon size={22} color="#9ca3af" strokeWidth={1.5} />
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <Link
          to={`/product/${product.id}`}
          onClick={onCloseDrawer}
          style={{
            fontSize: '0.82rem',
            fontWeight: 600,
            color: 'var(--text-h, #111827)',
            textDecoration: 'none',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            display: 'block',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#d97706')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-h, #111827)')}
        >
          {product.title}
        </Link>

        {/* Price & Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: '0.88rem',
              fontWeight: 800,
              color: 'var(--text-h, #111827)',
              fontFamily: 'Manrope, sans-serif',
            }}
          >
            {formatINR(product.price)}
          </span>

          {/* Buy Score badge */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '1px 6px',
              borderRadius: 'var(--r-pill, 9999px)',
              fontSize: '0.66rem',
              fontWeight: 700,
              backgroundColor: buyScore >= 70 ? 'rgba(34, 197, 94, 0.12)' : 'rgba(107, 114, 128, 0.1)',
              color: buyScore >= 70 ? '#15803d' : '#4b5563',
            }}
          >
            Buy score {buyScore}
          </span>

          {/* Real Discount if Inflated */}
          {isInflated && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '1px 6px',
                borderRadius: '4px',
                fontSize: '0.64rem',
                fontWeight: 700,
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: '#b91c1c',
              }}
            >
              Inflated MRP
            </span>
          )}
        </div>

        {/* Action buttons: View & Compare */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
          <Link
            to={`/product/${product.id}`}
            onClick={onCloseDrawer}
            style={{
              fontSize: '0.72rem',
              fontWeight: 600,
              color: '#d97706',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
            }}
          >
            View product <ExternalLink size={10} />
          </Link>

          <button
            type="button"
            onClick={onToggleCompare}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 8px',
              borderRadius: 'var(--r-sm, 4px)',
              backgroundColor: isInCompare ? 'rgba(99, 102, 241, 0.1)' : 'var(--bg, #f3f4f6)',
              color: isInCompare ? '#4f46e5' : 'var(--text-muted, #6b7280)',
              border: `1px solid ${isInCompare ? 'rgba(99, 102, 241, 0.3)' : 'transparent'}`,
              fontSize: '0.7rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {isInCompare ? (
              <>
                <Check size={11} /> In compare
              </>
            ) : (
              <>
                <Scale size={11} /> Compare
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

