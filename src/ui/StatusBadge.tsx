export function StatusBadge(props: {
  status: 'ok' | 'loading' | 'error'
  label: string
  detail?: string | null
}) {
  const { status, label, detail } = props
  const text =
    status === 'loading' ? 'Checking' : status === 'ok' ? 'OK' : 'Error'

  return (
    <div className='statusBadge' data-status={status} title={detail || undefined}>
      <span className='statusBadgeLabel'>{label}</span>
      <span className='statusBadgeValue'>{text}</span>
    </div>
  )
}
