import type { ReactNode } from 'react'
import Table, { type TableColumn } from '../ui/Table'
import { formatINR } from '../../lib/format'

interface Props {
  rows?: Record<string, unknown>[]
  table?: Record<string, unknown>[]
}

function humanizeHeader(key: string): string {
  return key
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

function stringifyShort(val: unknown): string {
  if (val === null || val === undefined) return '—'
  if (typeof val !== 'object') return String(val)
  if (Array.isArray(val)) {
    return val.map((v) => (typeof v === 'object' ? stringifyShort(v) : String(v))).join(', ')
  }
  const entries = Object.entries(val as Record<string, unknown>)
  return entries
    .map(([k, v]) => `${humanizeHeader(k)}: ${typeof v === 'object' ? stringifyShort(v) : String(v)}`)
    .join(' | ')
}

export default function ComparisonTable({ rows, table }: Props) {
  const dataRows = rows ?? table
  if (!dataRows || dataRows.length === 0) return null

  // Collect union of keys across all rows, omitting product_id
  const keySet = new Set<string>()
  for (const row of dataRows) {
    for (const k of Object.keys(row)) {
      if (k !== 'product_id') {
        keySet.add(k)
      }
    }
  }

  if (keySet.size === 0) return null

  // Prioritize title/name as sticky first column if present
  const allKeys = Array.from(keySet)
  const firstColCandidates = ['title', 'product_name', 'name', 'product']
  const firstKey = firstColCandidates.find((k) => keySet.has(k))
  const orderedKeys = firstKey ? [firstKey, ...allKeys.filter((k) => k !== firstKey)] : allKeys

  const columns: TableColumn[] = orderedKeys.map((key) => {
    const isPrice = key.toLowerCase() === 'price'
    const isKeyPoints = key.toLowerCase() === 'key_points'

    return {
      key,
      header: humanizeHeader(key),
      align: isPrice ? 'right' : 'left',
      render: (row: Record<string, unknown>): ReactNode => {
        const val = row[key]
        if (val === undefined || val === null || val === '') return '—'

        if (isPrice) {
          if (typeof val === 'number') return formatINR(val)
          if (typeof val === 'string') {
            const num = Number(val.replace(/[^0-9.-]+/g, ''))
            return !isNaN(num) ? formatINR(num) : val
          }
          return String(val)
        }

        if (isKeyPoints && Array.isArray(val)) {
          return (
            <ul
              style={{
                margin: 0,
                paddingLeft: '16px',
                listStyleType: 'disc',
                fontSize: '0.8rem',
                lineHeight: 1.4,
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
                textAlign: 'left',
              }}
            >
              {val.map((item, idx) => (
                <li key={idx}>
                  {typeof item === 'object' && item !== null ? stringifyShort(item) : String(item)}
                </li>
              ))}
            </ul>
          )
        }

        if (typeof val === 'object') {
          return stringifyShort(val)
        }

        return String(val)
      },
    }
  })

  return <Table columns={columns} rows={dataRows} />
}

