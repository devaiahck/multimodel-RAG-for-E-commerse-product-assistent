interface Props {
  text?: string
  analysis?: string
}

export default function AnalysisCard({ text, analysis }: Props) {
  const content = (text ?? analysis)?.trim()
  if (!content) return null

  return (
    <div
      style={{
        backgroundColor: 'var(--card)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r-lg)',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
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
        Why these picks
      </h2>
      <p
        style={{
          margin: 0,
          fontSize: '0.9rem',
          lineHeight: 1.6,
          color: 'var(--text)',
          fontFamily: 'Manrope, sans-serif',
          whiteSpace: 'pre-wrap',
        }}
      >
        {content}
      </p>
    </div>
  )
}

