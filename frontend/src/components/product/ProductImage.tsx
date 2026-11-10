import { useState } from 'react'
import { Shirt, Footprints, Watch, Cpu, Home, Sparkles, Dumbbell, Package } from 'lucide-react'

interface Props {
  imageUrl?: string
  title: string
  category?: string
  credit?: {
    source?: string
    photographer?: string
    photo_page?: string
  }
}

function CategoryIcon({ category }: { category?: string }) {
  const cat = category?.toLowerCase() ?? ''
  const size = 64
  const sw = 1.2
  const style = { opacity: 0.35, color: 'var(--text-muted)' }

  if (cat.includes('cloth') || cat.includes('shirt')) return <Shirt size={size} strokeWidth={sw} style={style} />
  if (cat.includes('shoe') || cat.includes('foot')) return <Footprints size={size} strokeWidth={sw} style={style} />
  if (cat.includes('watch')) return <Watch size={size} strokeWidth={sw} style={style} />
  if (cat.includes('electron') || cat.includes('tech')) return <Cpu size={size} strokeWidth={sw} style={style} />
  if (cat.includes('home') || cat.includes('lamp') || cat.includes('table')) return <Home size={size} strokeWidth={sw} style={style} />
  if (cat.includes('beauty') || cat.includes('cosmet')) return <Sparkles size={size} strokeWidth={sw} style={style} />
  if (cat.includes('sport') || cat.includes('gym')) return <Dumbbell size={size} strokeWidth={sw} style={style} />
  return <Package size={size} strokeWidth={sw} style={style} />
}

export default function ProductImage({ imageUrl, title, category, credit }: Props) {
  const [imgError, setImgError] = useState(false)
  const hasImage = Boolean(imageUrl) && !imgError

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
      <div
        style={{
          width: '100%',
          aspectRatio: '1 / 1',
          borderRadius: 'var(--r-xl)',
          backgroundColor: 'var(--tile)',
          border: '1px solid var(--line)',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {hasImage ? (
          <img
            src={imageUrl}
            alt={title}
            loading="lazy"
            width={600}
            height={600}
            onError={() => setImgError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <CategoryIcon category={category} />
        )}
      </div>

      {credit && credit.photographer && (
        <p
          style={{
            margin: '4px 0 0',
            fontSize: '0.72rem',
            color: 'var(--text-muted)',
            textAlign: 'center',
          }}
        >
          Photo:{' '}
          {credit.photo_page ? (
            <a
              href={credit.photo_page}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--text-muted)', textDecoration: 'underline' }}
            >
              {credit.photographer}
            </a>
          ) : (
            credit.photographer
          )}{' '}
          / Pexels
        </p>
      )}
    </div>
  )
}

