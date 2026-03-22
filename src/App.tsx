import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import './App.css'

interface YtHit {
  video_id: string
  title: string
  artist?: string | null
  album?: string | null
  duration_label: string
  duration_secs?: number | null
  webpage_url: string
  thumbnail_url?: string | null
  year?: number | null
  is_explicit?: boolean | null
}

type DownloadStatus = 'idle' | 'queued' | 'finding' | 'downloading' | 'converting' | 'saving' | 'done' | 'failed'

interface DownloadState {
  status: DownloadStatus
  progress: number | null
  message: string
  friendlyMessage: string
}

// Lines from ytmusic_download.py are structured: "stage" or "downloading 42"
function parseScriptLine(line: string): { status: DownloadStatus; progress: number | null; friendly: string } {
  if (line.startsWith('downloading ')) {
    const pct = parseFloat(line.slice(12))
    return { status: 'downloading', progress: isFinite(pct) ? pct : null, friendly: `Downloading… ${isFinite(pct) ? Math.round(pct) + '%' : ''}` }
  }
  switch (line) {
    case 'finding': return { status: 'finding', progress: null, friendly: 'Finding song…' }
    case 'converting': return { status: 'converting', progress: null, friendly: 'Converting to MP3…' }
    case 'cover': return { status: 'converting', progress: null, friendly: 'Fetching album artwork…' }
    case 'saving': return { status: 'saving', progress: null, friendly: 'Saving to Music folder…' }
    case 'done': return { status: 'done', progress: 100, friendly: 'Saved to your Music folder' }
    default:
      if (line.startsWith('error:')) return { status: 'failed', progress: null, friendly: 'Download failed' }
      return { status: 'downloading', progress: null, friendly: 'Downloading…' }
  }
}


function ArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="13 6 19 12 13 18" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function TrackRow({ hit, downloadState, onDownload, index = 0 }: {
  hit: YtHit
  downloadState: DownloadState | null
  onDownload: (hit: YtHit) => void
  index?: number
}) {
  const status = downloadState?.status ?? 'idle'
  const progress = downloadState?.progress ?? null
  const friendlyMsg = downloadState?.friendlyMessage ?? ''
  const isActive = status === 'finding' || status === 'downloading' || status === 'converting' || status === 'saving' || status === 'queued'
  const isDone = status === 'done'
  const isFailed = status === 'failed'

  return (
    <div className="trackRow" data-status={status} role="listitem" style={{ animationDelay: `${index * 45}ms` }}>
      <div className="trackThumb">
        {hit.thumbnail_url
          ? <img src={hit.thumbnail_url} alt="" aria-hidden="true" className="trackThumbImg" />
          : <div className="trackThumbPlaceholder" />
        }
      </div>

      <div className="trackInfo">
        <div className="trackTitle" title={hit.title}>{hit.title}</div>
        <div className="trackMeta">
          {hit.artist && <span className="trackArtist">{hit.artist}</span>}
          {hit.album && <><span className="trackMetaDot">·</span><span className="trackAlbum">{hit.album}</span></>}
          {hit.year && <><span className="trackMetaDot">·</span><span className="trackYear">{hit.year}</span></>}
          {hit.is_explicit && <span className="trackExplicit">E</span>}
        </div>

        {isActive && (
          <div className="trackProgress">
            <div className="trackProgressBar">
              <div
                className="trackProgressFill"
                data-indeterminate={progress === null ? 'true' : 'false'}
                style={progress !== null ? { width: `${progress}%` } : undefined}
              />
            </div>
            <span className="trackProgressLabel">{friendlyMsg}</span>
          </div>
        )}

        {isDone && (
          <div className="trackDoneMsg">
            <CheckIcon />
            <span>In your Music folder</span>
          </div>
        )}

        {isFailed && (
          <div className="trackFailedMsg">
            <span>{friendlyMsg}</span>
            <button className="trackRetryBtn" onClick={() => onDownload(hit)}>Retry</button>
          </div>
        )}
      </div>

      <div className="trackRight">
        <span className="trackDuration">{hit.duration_label}</span>
        <button
          className="trackDownloadBtn"
          onClick={() => onDownload(hit)}
          disabled={isActive || isDone}
          aria-label={`Download ${hit.title}`}
          title={isDone ? 'Already downloaded' : 'Save to Music folder'}
        >
          {isDone ? <CheckIcon /> : <DownloadIcon />}
        </button>
      </div>
    </div>
  )
}

function App() {
  const [ytdlpStatus, setYtdlpStatus] = useState<'ok' | 'error' | 'loading'>('loading')
  const [ytdlpError, setYtdlpError] = useState<string | null>(null)
  const [ytQuery, setYtQuery] = useState('')
  const [ytHits, setYtHits] = useState<YtHit[]>([])
  const [ytSearching, setYtSearching] = useState(false)
  const [ytSearchError, setYtSearchError] = useState<string | null>(null)
  const [downloadStates, setDownloadStates] = useState<Record<string, DownloadState>>({})
  const [globalStatus, setGlobalStatus] = useState<string>('')
  const inputRef = useRef<HTMLInputElement>(null)

  const checkYtdlp = useCallback(async () => {
    setYtdlpStatus('loading')
    setYtdlpError(null)
    try {
      await invoke<string>('ytdlp_check')
      setYtdlpStatus('ok')
    } catch (err) {
      setYtdlpStatus('error')
      setYtdlpError(String(err))
    }
  }, [])

  useEffect(() => {
    checkYtdlp()
  }, [checkYtdlp])

  useEffect(() => {
    const unYtProg = listen<{ video_id: string; title: string; line: string }>('ytDownloadProgress', (e) => {
      const { video_id, line } = e.payload
      const { status, progress, friendly } = parseScriptLine(line)

      setDownloadStates((prev) => ({
        ...prev,
        [video_id]: {
          status,
          progress,
          message: line,
          friendlyMessage: friendly,
        },
      }))
      setGlobalStatus(friendly)
    })

    const unYtFin = listen<{ video_id: string; title: string; success: boolean; exit_code: number | null; last_lines: string[] }>('ytDownloadFinished', (e) => {
      const { video_id, success, last_lines } = e.payload
      const errorDetail = last_lines.filter(Boolean).join(' — ')
      const finalMsg = success
        ? 'Saved to your Music folder'
        : errorDetail
          ? errorDetail
          : 'Something went wrong — try again'
      setDownloadStates((prev) => ({
        ...prev,
        [video_id]: {
          status: success ? 'done' : 'failed',
          progress: success ? 100 : null,
          message: errorDetail,
          friendlyMessage: finalMsg,
        },
      }))
      setGlobalStatus(finalMsg)
    })

    return () => {
      unYtProg.then((fn) => fn())
      unYtFin.then((fn) => fn())
    }
  }, [])

  const handleSearch = useCallback(async () => {
    const q = ytQuery.trim()
    if (!q || ytdlpStatus !== 'ok') return
    setYtSearching(true)
    setYtSearchError(null)
    setGlobalStatus('Searching music…')
    const start = Date.now()
    try {
      const hits = await invoke<YtHit[]>('ytdlp_search', { query: q })
      setYtHits(hits)
      setGlobalStatus(`Found ${hits.length} track${hits.length !== 1 ? 's' : ''}`)
    } catch (err) {
      setYtSearchError(String(err))
      setYtHits([])
      setGlobalStatus('Search failed')
    } finally {
      const elapsed = Date.now() - start
      const minDisplay = 600
      if (elapsed < minDisplay) {
        setTimeout(() => setYtSearching(false), minDisplay - elapsed)
      } else {
        setYtSearching(false)
      }
    }
  }, [ytQuery, ytdlpStatus])

  const handleDownload = useCallback(async (hit: YtHit) => {
    if (ytdlpStatus !== 'ok') return
    setDownloadStates((prev) => ({
      ...prev,
      [hit.video_id]: { status: 'finding', progress: null, message: '', friendlyMessage: 'Finding song…' },
    }))
    setGlobalStatus('Finding song…')
    try {
      await invoke('ytdlp_download_audio', {
        request: {
          video_id: hit.video_id,
          title: hit.title,
          artist: hit.artist ?? null,
          album: hit.album ?? null,
          thumbnail_url: hit.thumbnail_url ?? null,
          webpage_url: hit.webpage_url,
        },
      })
    } catch (err) {
      setDownloadStates((prev) => ({
        ...prev,
        [hit.video_id]: { status: 'failed', progress: null, message: String(err), friendlyMessage: 'Something went wrong — try again' },
      }))
      setGlobalStatus('Something went wrong')
    }
  }, [ytdlpStatus])

  const searchDisabled = ytSearching || ytdlpStatus !== 'ok'
  const hasResults = ytHits.length > 0

  return (
    <div className="app">
      <header className="appHeader" data-tauri-drag-region>
        <div className="appBrand" data-tauri-drag-region>
          <span className="appBrandName">Mulib</span>
          <span className="appBrandSub">Music Library</span>
        </div>
        {ytdlpStatus === 'ok' && (
          <div className="statusDot statusDot--ok" aria-label="Ready" />
        )}
        {ytdlpStatus === 'loading' && (
          <span className="statusLabel statusLabel--loading">Loading…</span>
        )}
        {ytdlpStatus === 'error' && (
          <button className="statusLabel statusLabel--error" onClick={checkYtdlp} title={ytdlpError ?? undefined}>
            Tap to retry
          </button>
        )}
      </header>

      <main className="appMain">
        {ytdlpStatus === 'error' && ytdlpError && (
          <div className="errorBanner errorBanner--runtime" role="alert">
            {ytdlpError}
          </div>
        )}
        <div className="searchSection">
          <div className="searchRow">
            <input
              id="search-input"
              ref={inputRef}
              className="searchInput"
              type="search"
              value={ytQuery}
              onChange={(e) => setYtQuery(e.target.value)}
              placeholder="Artist or track…"
              disabled={searchDisabled}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
              autoFocus
            />
            <button
              className={`searchBtn ${ytSearching ? 'searchBtn--searching' : ''}`}
              onClick={handleSearch}
              disabled={searchDisabled || !ytQuery.trim()}
              aria-label={ytSearching ? 'Searching…' : 'Search'}
            >
              {ytSearching ? (
                <span className="searchPulseDots" aria-hidden="true">
                  <span className="searchPulseDot" />
                  <span className="searchPulseDot" />
                  <span className="searchPulseDot" />
                </span>
              ) : (
                <ArrowIcon />
              )}
            </button>
          </div>

          {globalStatus && (
            <div className="globalStatus" aria-live="polite">
              {globalStatus}
            </div>
          )}
        </div>

        {ytSearchError && (
          <div className="errorBanner" role="alert">{ytSearchError}</div>
        )}

        {hasResults && (
          <div className="trackList" role="list" aria-label="Search results">
            {ytHits.map((hit, i) => (
              <TrackRow
                key={hit.video_id}
                hit={hit}
                downloadState={downloadStates[hit.video_id] ?? null}
                onDownload={handleDownload}
                index={i}
              />
            ))}
          </div>
        )}

        {!hasResults && !ytSearching && !ytSearchError && (
          <div className="emptyState">
            <p className="emptyStateHeading">What are you<br />listening to?</p>
            <p className="emptyStateText">Search by artist or song. Downloads go straight to your Music folder.</p>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
