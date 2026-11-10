import {
  useState,
  useRef,
  useEffect,
  type KeyboardEvent,
  type DragEvent,
  type ClipboardEvent,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Camera, X } from 'lucide-react'
import { validateImageFile, downscaleImageIfNeeded } from '../../lib/imageUpload'

interface Props {
  dark?: boolean
  placeholder?: string
  initialQuery?: string
  imageFile?: File | null
  onImageChange?: (file: File | null) => void
  onQueryChange?: (query: string) => void
  onSearchSubmit?: (query: string, file: File | null) => void
}

export default function SearchBar({
  dark = true,
  placeholder = 'Search the whole market…',
  initialQuery = '',
  imageFile: controlledImageFile,
  onImageChange,
  onQueryChange,
  onSearchSubmit,
}: Props) {
  const [internalQuery, setInternalQuery] = useState(initialQuery)
  const [internalImageFile, setInternalImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string>('')
  const [isProcessingImage, setIsProcessingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const currentImage = controlledImageFile !== undefined ? controlledImageFile : internalImageFile

  useEffect(() => {
    setInternalQuery(initialQuery)
  }, [initialQuery])

  useEffect(() => {
    if (!currentImage) {
      setImagePreview(null)
      return
    }
    const url = URL.createObjectURL(currentImage)
    setImagePreview(url)
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [currentImage])

  async function handleFileSelected(file: File) {
    const error = validateImageFile(file)
    if (error) {
      setImageError(error)
      return
    }
    setImageError('')
    setIsProcessingImage(true)
    try {
      const downscaled = await downscaleImageIfNeeded(file, 1024)
      if (onImageChange) {
        onImageChange(downscaled)
      } else {
        setInternalImageFile(downscaled)
      }

      if (onSearchSubmit) {
        onSearchSubmit(internalQuery, downscaled)
      } else {
        // Navigate to search page with the selected image
        const params = new URLSearchParams()
        if (internalQuery.trim()) params.set('q', internalQuery.trim())
        navigate(`/search?${params}`, { state: { imageFile: downscaled } })
      }
    } catch {
      setImageError('Failed to process image.')
    } finally {
      setIsProcessingImage(false)
    }
  }

  function handleRemoveImage() {
    setImageError('')
    if (onImageChange) {
      onImageChange(null)
    } else {
      setInternalImageFile(null)
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  function handleSearch() {
    if (!internalQuery.trim() && !currentImage) return
    if (onSearchSubmit) {
      onSearchSubmit(internalQuery.trim(), currentImage)
    } else {
      const params = new URLSearchParams()
      if (internalQuery.trim()) params.set('q', internalQuery.trim())
      navigate(`/search?${params}`, { state: { imageFile: currentImage } })
    }
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleSearch()
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) {
      handleFileSelected(file)
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const file = e.clipboardData.files?.[0]
    if (file) {
      e.preventDefault()
      handleFileSelected(file)
      return
    }
    const items = e.clipboardData.items
    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.type.startsWith('image/')) {
          const itemFile = item.getAsFile()
          if (itemFile) {
            e.preventDefault()
            handleFileSelected(itemFile)
            return
          }
        }
      }
    }
  }

  const bg = dark ? 'var(--ink-700)' : 'var(--card)'
  const border = dark ? 'var(--border-dark)' : 'var(--line)'
  const textColor = dark ? '#ffffff' : 'var(--text)'
  const placeholderColor = dark ? 'var(--on-dark-muted)' : 'var(--text-muted)'

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Attached image preview banner if active and not controlled externally */}
      {imagePreview && controlledImageFile === undefined && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            backgroundColor: dark ? 'var(--ink-800)' : 'var(--tile)',
            border: `1px solid ${border}`,
            borderRadius: 'var(--r-md)',
            padding: '8px 12px',
          }}
        >
          <img
            src={imagePreview}
            alt="Search preview thumbnail"
            style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 'var(--r-sm)' }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontSize: '0.8rem',
                color: textColor,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {currentImage?.name}
            </p>
          </div>
          <button
            type="button"
            aria-label="Remove selected image"
            onClick={handleRemoveImage}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: placeholderColor,
              padding: 4,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>
      )}

      {/* Main input bar */}
      <div
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        style={{
          display: 'flex',
          alignItems: 'center',
          backgroundColor: bg,
          border: `1px solid ${border}`,
          borderRadius: 'var(--r-pill)',
          overflow: 'hidden',
          height: 52,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            paddingLeft: '18px',
            color: placeholderColor,
          }}
        >
          <Search size={16} strokeWidth={1.5} />
        </div>

        <input
          type="search"
          value={internalQuery}
          onChange={(e) => {
            setInternalQuery(e.target.value)
            onQueryChange?.(e.target.value)
          }}
          onKeyDown={handleKey}
          onPaste={handlePaste}
          placeholder={placeholder}
          aria-label="Search products"
          style={{
            flex: 1,
            border: 'none',
            background: 'transparent',
            color: textColor,
            fontSize: '0.9rem',
            fontFamily: 'Manrope, sans-serif',
            padding: '0 12px',
            outline: 'none',
          }}
        />

        {/* Camera / Photo upload button */}
        <button
          type="button"
          aria-label="Upload an image to search"
          disabled={isProcessingImage}
          onClick={() => fileInputRef.current?.click()}
          style={{
            background: 'none',
            border: 'none',
            cursor: isProcessingImage ? 'wait' : 'pointer',
            padding: '0 12px',
            color: placeholderColor,
            display: 'flex',
            alignItems: 'center',
            minHeight: 44,
            transition: 'color var(--dur-fast)',
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.color = dark
              ? 'var(--on-dark)'
              : 'var(--text)')
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.color = placeholderColor)
          }
        >
          <Camera size={16} strokeWidth={1.5} />
        </button>

        {/* Search submit button */}
        <button
          type="button"
          aria-label="Submit search"
          onClick={handleSearch}
          style={{
            backgroundColor: 'var(--champagne)',
            color: '#000000',
            border: 'none',
            borderRadius: 'var(--r-pill)',
            margin: '6px',
            padding: '0 22px',
            height: 40,
            fontSize: '0.8rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            cursor: 'pointer',
            fontFamily: 'Manrope, sans-serif',
            whiteSpace: 'nowrap',
            transition: 'background-color var(--dur-fast)',
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.backgroundColor =
              'var(--champagne-hover)')
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--champagne)')
          }
        >
          Search
        </button>
      </div>

      {/* Error message */}
      {imageError && (
        <p
          role="alert"
          style={{
            margin: 0,
            padding: '0 18px',
            fontSize: '0.75rem',
            color: 'var(--verdict-wait)',
            fontFamily: 'Manrope, sans-serif',
          }}
        >
          {imageError}
        </p>
      )}

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
          if (file) handleFileSelected(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}
