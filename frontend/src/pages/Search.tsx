import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams, useLocation } from 'react-router-dom'
import { Camera, X } from 'lucide-react'
import SearchBar from '../components/search/SearchBar'
import ProductCard, { toCardData } from '../components/product/ProductCard'
import EmptyState from '../components/ui/EmptyState'
import ErrorState from '../components/ui/ErrorState'
import SearchSkeletonGrid from '../components/search/SearchSkeletonGrid'
import AnalysisCard from '../components/search/AnalysisCard'
import ComparisonTable from '../components/search/ComparisonTable'
import { useSearchProducts } from '../hooks/useSearch'
import { useCategories } from '../hooks/useHomeData'
import { validateImageFile, downscaleImageIfNeeded } from '../lib/imageUpload'
import { ApiError } from '../api/client'
import { trackActivity } from '../services/activity'

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const q = searchParams.get('q') || ''
  const categoryParam = searchParams.get('category') || ''
  const maxParam = searchParams.get('max') || ''
  const maxPrice = maxParam && !isNaN(Number(maxParam)) ? Number(maxParam) : undefined

  const locationState = location.state as { imageFile?: File } | null | undefined
  const [imageFile, setImageFile] = useState<File | null>(locationState?.imageFile || null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  // Local text input for refinement
  const [refinementText, setRefinementText] = useState(q)

  // Categories from catalog
  const { data: catalogCategories = [] } = useCategories()
  const categoryNames = useMemo(() => {
    return ['All', ...catalogCategories.map((c) => c.label)]
  }, [catalogCategories])

  // Sync imagePreview with imageFile
  useEffect(() => {
    if (!imageFile) {
      setImagePreview(null)
      return
    }
    const url = URL.createObjectURL(imageFile)
    setImagePreview(url)
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [imageFile])

  // Sync refinementText with q param
  useEffect(() => {
    setRefinementText(q)
    if (q && q.trim()) {
      trackActivity({
        type: 'search',
        query: q.trim(),
      })
    }
  }, [q])

  // Update page title
  useEffect(() => {
    if (imageFile) {
      const extra = q.trim() ? `“${q.trim()}” – ` : ''
      document.title = `${extra}Photo Search – UrbanPick`
    } else if (q.trim()) {
      document.title = `“${q.trim()}” – Search – UrbanPick`
    } else {
      document.title = 'Search – UrbanPick'
    }
  }, [q, imageFile])

  // Handle image file selection / drop / paste
  async function handleImageFile(file: File) {
    const error = validateImageFile(file)
    if (error) {
      setImageError(error)
      return
    }
    setImageError(null)
    setIsProcessing(true)
    try {
      const downscaled = await downscaleImageIfNeeded(file, 1024)
      setImageFile(downscaled)
    } catch {
      setImageError('Failed to process image.')
    } finally {
      setIsProcessing(false)
    }
  }

  function handleRemoveImage() {
    setImageFile(null)
    setImagePreview(null)
    setImageError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  function handleCategoryClick(cat: string) {
    const next = new URLSearchParams(searchParams)
    if (cat === 'All') next.delete('category')
    else next.set('category', cat)
    setSearchParams(next)
  }

  function handleRefinementSubmit() {
    const trimmed = refinementText.trim()
    const next = new URLSearchParams(searchParams)
    if (trimmed) next.set('q', trimmed)
    else next.delete('q')
    setSearchParams(next)
  }

  // Global paste handler for the search page
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const target = e.target as HTMLElement | null
      // Don't intercept if user is pasting text into an input or textarea
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') &&
        !(e.clipboardData?.files && e.clipboardData.files.length > 0)
      ) {
        return
      }

      const files = e.clipboardData?.files
      if (files && files.length > 0) {
        const file = files[0]
        if (file.type.startsWith('image/')) {
          e.preventDefault()
          handleImageFile(file)
          return
        }
      }

      const items = e.clipboardData?.items
      if (items) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile()
            if (file) {
              e.preventDefault()
              handleImageFile(file)
              return
            }
          }
        }
      }
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [])

  const hasSearch = Boolean(q.trim() || imageFile)

  const { data, isLoading, isError, error, refetch } = useSearchProducts({
    q: q.trim(),
    imageFile,
    category: categoryParam && categoryParam !== 'All' ? categoryParam : undefined,
    maxPrice,
  })

  // Format friendly error message
  const errorMessage = useMemo(() => {
    if (!error) return null
    if (error instanceof ApiError) {
      if (error.kind === 'rate_limit') {
        return 'Rate limit exceeded. Please wait a moment and try again.'
      }
      if (error.kind === 'bad_request' || error.kind === 'validation') {
        return 'Invalid search request. Try another photo or search query.'
      }
      if (error.kind === 'network') {
        return 'Unable to reach server. Check your connection and try again.'
      }
    }
    const msg = error.message || ''
    if (msg.includes('429') || msg.toLowerCase().includes('rate limit')) {
      return 'Rate limit exceeded. Please wait a moment and try again.'
    }
    if (msg.includes('400') || msg.includes('422')) {
      return 'Invalid search request. Try another photo or search query.'
    }
    if (msg.toLowerCase().includes('failed to fetch') || msg.toLowerCase().includes('network')) {
      return 'Unable to reach server. Check your connection and try again.'
    }
    return 'Unable to load search results. Please try again.'
  }, [error])

  const products = data?.recommended_products || []

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsDragging(false)
        }
      }}
      onDrop={(e) => {
        e.preventDefault()
        setIsDragging(false)
        const file = e.dataTransfer.files?.[0]
        if (file) {
          handleImageFile(file)
        }
      }}
      style={{
        padding: '32px 0 64px',
        minHeight: '80vh',
        outline: isDragging ? '2px dashed var(--champagne)' : 'none',
        outlineOffset: '-4px',
      }}
    >
      <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          aria-hidden="true"
          tabIndex={-1}
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleImageFile(file)
            e.target.value = ''
          }}
        />

        {/* Top Search Bar (when no image attached) */}
        {!imageFile && (
          <div style={{ maxWidth: 720, width: '100%', margin: '0 auto' }}>
            <SearchBar
              dark={false}
              initialQuery={q}
              onImageChange={(file) => {
                if (file) handleImageFile(file)
              }}
              onSearchSubmit={(newQ) => {
                const next = new URLSearchParams(searchParams)
                if (newQ.trim()) next.set('q', newQ.trim())
                else next.delete('q')
                setSearchParams(next)
              }}
            />
          </div>
        )}

        {/* Inline file validation error */}
        {imageError && (
          <div
            role="alert"
            style={{
              maxWidth: 720,
              width: '100%',
              margin: '0 auto',
              padding: '10px 16px',
              backgroundColor: 'rgba(217, 83, 79, 0.1)',
              border: '1px solid var(--verdict-wait)',
              borderRadius: 'var(--r-md)',
              color: 'var(--verdict-wait)',
              fontSize: '0.82rem',
              fontFamily: 'Manrope, sans-serif',
            }}
          >
            {imageError}
          </div>
        )}

        {/* Attached photo view */}
        {imageFile && (
          <div
            style={{
              maxWidth: 720,
              width: '100%',
              margin: '0 auto',
              backgroundColor: 'var(--tile)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--r-lg)',
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            {/* Thumbnail and title header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                flexWrap: 'wrap',
              }}
            >
              {imagePreview && (
                <img
                  src={imagePreview}
                  alt="Uploaded photo preview"
                  style={{
                    width: 64,
                    height: 64,
                    objectFit: 'cover',
                    borderRadius: 'var(--r-md)',
                    border: '1px solid var(--line)',
                    backgroundColor: 'var(--card)',
                    flexShrink: 0,
                  }}
                />
              )}

              <div style={{ flex: 1, minWidth: 200 }}>
                <h1
                  style={{
                    margin: 0,
                    fontSize: '1.25rem',
                    fontFamily: 'Bodoni Moda, serif',
                    fontWeight: 500,
                    color: 'var(--text)',
                  }}
                >
                  Results for your photo
                </h1>
                <p
                  style={{
                    margin: '4px 0 0',
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    fontFamily: 'Manrope, sans-serif',
                  }}
                >
                  Your photo is not stored
                </p>
              </div>

              <button
                type="button"
                aria-label="Remove photo"
                onClick={handleRemoveImage}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'none',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--r-pill)',
                  padding: '6px 14px',
                  fontSize: '0.78rem',
                  fontFamily: 'Manrope, sans-serif',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  transition: 'color var(--dur-fast), border-color var(--dur-fast)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--text)'
                  e.currentTarget.style.borderColor = 'var(--text)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--text-muted)'
                  e.currentTarget.style.borderColor = 'var(--line)'
                }}
              >
                <X size={14} strokeWidth={1.5} />
                Remove photo
              </button>
            </div>

            {/* Optional text refinement box */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="text"
                value={refinementText}
                onChange={(e) => setRefinementText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRefinementSubmit()
                }}
                placeholder="Add a few words to refine (e.g. black, analog)..."
                aria-label="Refine search with words"
                style={{
                  flex: 1,
                  height: 42,
                  padding: '0 14px',
                  backgroundColor: 'var(--card)',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--r-pill)',
                  fontSize: '0.85rem',
                  fontFamily: 'Manrope, sans-serif',
                  color: 'var(--text)',
                  outline: 'none',
                }}
              />
              <button
                type="button"
                aria-label="Apply word refinement"
                onClick={handleRefinementSubmit}
                style={{
                  height: 42,
                  padding: '0 18px',
                  backgroundColor: 'var(--ink-900)',
                  color: 'var(--on-dark)',
                  border: 'none',
                  borderRadius: 'var(--r-pill)',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  fontFamily: 'Manrope, sans-serif',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Refine
              </button>
            </div>
          </div>
        )}

        {/* Category chips row built from catalog categories */}
        {hasSearch && (
          <div
            role="region"
            aria-label="Category filter chips"
            style={{
              display: 'flex',
              gap: '8px',
              overflowX: 'auto',
              paddingBottom: '4px',
              scrollbarWidth: 'none',
            }}
          >
            {categoryNames.map((cat) => {
              const isSelected =
                (!categoryParam && cat === 'All') || categoryParam.toLowerCase() === cat.toLowerCase()
              return (
                <button
                  key={cat}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => handleCategoryClick(cat)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 'var(--r-pill)',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    fontFamily: 'Manrope, sans-serif',
                    border: isSelected ? '1px solid var(--text)' : '1px solid var(--line)',
                    backgroundColor: isSelected ? 'var(--text)' : 'var(--card)',
                    color: isSelected ? 'var(--card)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all var(--dur-fast)',
                  }}
                >
                  {cat}
                </button>
              )
            })}
          </div>
        )}

        {/* Dropzone & paste hint when no search active */}
        {!hasSearch && (
          <div
            tabIndex={0}
            role="region"
            aria-label="Image drop zone or upload area"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                fileInputRef.current?.click()
              }
            }}
            onClick={() => fileInputRef.current?.click()}
            style={{
              maxWidth: 720,
              width: '100%',
              margin: '0 auto',
              border: '1px dashed var(--line)',
              borderRadius: 'var(--r-lg)',
              padding: '36px 20px',
              textAlign: 'center',
              backgroundColor: 'var(--tile)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                backgroundColor: 'var(--card)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
              }}
            >
              <Camera size={20} strokeWidth={1.5} />
            </div>
            <p
              style={{
                margin: 0,
                fontSize: '0.9rem',
                fontWeight: 600,
                color: 'var(--text)',
                fontFamily: 'Manrope, sans-serif',
              }}
            >
              Search with a photo
            </p>
            <p
              style={{
                margin: 0,
                fontSize: '0.8rem',
                color: 'var(--text-muted)',
                fontFamily: 'Manrope, sans-serif',
              }}
            >
              Drop an image here, paste from clipboard, or click to browse
            </p>
          </div>
        )}

        {/* AI analysis card and comparison table */}
        {data?.ai_analysis && <AnalysisCard text={data.ai_analysis} />}

        {data?.comparison_table && data.comparison_table.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h2
              style={{
                margin: 0,
                fontSize: '1.1rem',
                fontFamily: 'Bodoni Moda, serif',
                fontWeight: 600,
                color: 'var(--text)',
                letterSpacing: '-0.01em',
              }}
            >
              Compare
            </h2>
            <ComparisonTable rows={data.comparison_table} />
          </div>
        )}

        {/* State: Loading */}
        {(isLoading || isProcessing) && <SearchSkeletonGrid />}

        {/* State: Error */}
        {isError && (
          <ErrorState
            message={errorMessage || 'Unable to load search results. Please try again.'}
            onRetry={() => refetch()}
          />
        )}

        {/* State: No Results */}
        {!isLoading && !isProcessing && !isError && hasSearch && products.length === 0 && (
          <EmptyState
            title="No close matches found. Try another photo or add a few words."
            message="We couldn't find items matching this photo or query."
          />
        )}

        {/* State: Results Grid (Do not show similarity numbers or percentages) */}
        {!isLoading && !isProcessing && !isError && products.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={toCardData(product)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
