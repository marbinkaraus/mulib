function StatusPill(props: {
  label: string
  status: 'ok' | 'error' | 'loading'
  error?: string | null
}) {
  const { label, status, error } = props
  const text =
    status === 'loading' ? 'Checking…' : status === 'ok' ? 'OK' : 'Error'

  return (
    <div className='railStatusRow'>
      <div className='railStatusLabel'>{label}</div>
      <div
        className='railStatusPill'
        data-status={status}
        title={status === 'error' ? error ?? undefined : undefined}
      >
        {text}
      </div>
    </div>
  )
}

export function ActivityRail(props: {
  ytdlp: { status: 'ok' | 'error' | 'loading'; error?: string | null }
  events: string[]
}) {
  const { ytdlp, events } = props
  const hasError = ytdlp.status === 'error'

  return (
    <div className='activityRail'>
      <section className='card railCard'>
        <header className='cardHeader'>
          <h3 className='cardTitle'>Runtime</h3>
          <p className='cardHint'>Health + recovery actions.</p>
        </header>
        <div className='cardBody'>
          <StatusPill label='yt-dlp' status={ytdlp.status} error={ytdlp.error} />

          {ytdlp.status === 'error' && ytdlp.error ? (
            <div className='railErrors' role='alert'>
              <div className='railErrorLine'>
                <strong>yt-dlp</strong>
                <span className='railErrorMsg'>{ytdlp.error}</span>
              </div>
            </div>
          ) : null}

          {hasError ? (
            <div className='railHint'>
              If this persists, rebuild the embedded runtime and relaunch the app.
            </div>
          ) : null}
        </div>
      </section>

      <section className='card railCard'>
        <header className='cardHeader'>
          <h3 className='cardTitle'>Event feed</h3>
          <p className='cardHint'>Recent progress lines.</p>
        </header>
        <div className='cardBody'>
          {events.length === 0 ? (
            <p className='railEmpty'>No recent events yet.</p>
          ) : (
            <ul className='eventFeed'>
              {events.map((line, i) => (
                <li key={`${i}-${line.slice(0, 12)}`} className='eventFeedItem' title={line}>
                  {line}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
