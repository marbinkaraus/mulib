export function ProgressBar(props: {
  mode: 'idle' | 'indeterminate' | 'determinate'
  value?: number
  label?: string
}) {
  const { mode, value, label } = props
  const pct = typeof value === 'number' ? clamp01(value) : 0
  const width = mode === 'determinate' ? `${Math.round(pct * 100)}%` : undefined

  return (
    <div
      className='progressBar'
      data-mode={mode}
      role='progressbar'
      aria-label={label || 'Progress'}
      aria-valuemin={mode === 'determinate' ? 0 : undefined}
      aria-valuemax={mode === 'determinate' ? 100 : undefined}
      aria-valuenow={mode === 'determinate' ? Math.round(pct * 100) : undefined}
    >
      <div className='progressTrack' />
      <div className='progressFill' style={width ? { width } : undefined} />
    </div>
  )
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0
  if (n <= 0) return 0
  if (n >= 1) return 1
  return n
}
