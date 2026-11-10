import Skeleton from '../ui/Skeleton'

export default function SearchSkeletonGrid() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <p
        aria-live="polite"
        style={{
          margin: 0,
          fontSize: '0.9rem',
          color: 'var(--text-muted)',
          fontFamily: 'Manrope, sans-serif',
        }}
      >
        Finding the best matches...
      </p>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            style={{
              backgroundColor: 'var(--card)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--r-lg)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              paddingBottom: '12px',
            }}
          >
            <Skeleton height={180} rounded="lg" style={{ borderRadius: 0 }} />
            <div
              style={{
                padding: '0 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <Skeleton width="40%" height={12} rounded="sm" />
              <Skeleton width="85%" height={16} rounded="sm" />
              <Skeleton width="50%" height={18} rounded="sm" />
            </div>
            <div style={{ padding: '0 12px', marginTop: 'auto' }}>
              <Skeleton height={40} rounded="full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

