import { AlertCircle } from 'lucide-react'
import Button from './Button'

interface Props {
  message: string
  onRetry?: () => void
}

export default function ErrorState({ message, onRetry }: Props) {
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '36px 24px',
        backgroundColor: 'var(--card)',
        borderRadius: 'var(--r-lg)',
        border: '1px solid var(--line)',
        maxWidth: 480,
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box',
        gap: 16,
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 'var(--r-pill)',
          backgroundColor: 'var(--verdict-wait-bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--verdict-wait)',
        }}
      >
        <AlertCircle size={26} strokeWidth={1.5} />
      </div>

      <p
        style={{
          margin: 0,
          fontSize: '0.9rem',
          color: 'var(--text)',
          fontFamily: 'Manrope, sans-serif',
          lineHeight: 1.5,
          maxWidth: 400,
        }}
      >
        {message}
      </p>

      {onRetry && (
        <Button variant="primary-light" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

