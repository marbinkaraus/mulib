import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import {
  albumFullyOnDisk,
  albumTrackFileOnDisk,
  type MulibLibraryScan,
  songFileOnDisk,
} from './mulibPaths'
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
  /** Same basename Rust uses for downloads; preferred for library matching. */
  mp3_filename?: string | null
}

interface YtAlbumHit {
  kind: 'album'
  browse_id: string
  title: string
  artist?: string | null
  year?: number | null
  thumbnail_url?: string | null
  track_count?: number | null
}

type SearchResultItem = ({ kind: 'song' } & YtHit) | YtAlbumHit

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
    case 'saving': return { status: 'saving', progress: null, friendly: 'Saving to Music/mulib…' }
    case 'done': return { status: 'done', progress: 100, friendly: 'Saved to Music/mulib' }
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

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg className="albumChevron" data-open={open ? 'true' : 'false'} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function isActiveDownloadStatus(s: DownloadStatus): boolean {
  return s === 'finding' || s === 'downloading' || s === 'converting' || s === 'saving' || s === 'queued'
}

/** Progress line for “Download album” (sequential track downloads). */
function computeAlbumBulkLine(
  videoIds: string[] | undefined,
  downloadStates: Record<string, DownloadState>,
): { progress: number | null; label: string } | null {
  if (!videoIds?.length) return null
  const total = videoIds.length
  let done = 0
  let failed = 0
  let activeIdx = -1
  videoIds.forEach((id, i) => {
    const st = downloadStates[id]?.status ?? 'idle'
    if (st === 'done') done++
    else if (st === 'failed') failed++
    if (activeIdx < 0 && isActiveDownloadStatus(st)) {
      activeIdx = i
    }
  })
  if (activeIdx >= 0) {
    const active = downloadStates[videoIds[activeIdx]]
    if (active) {
      return {
        progress: active.progress,
        label: `Track ${activeIdx + 1} of ${total} · ${active.friendlyMessage}`,
      }
    }
  }
  if (done === total && total > 0) {
    return { progress: 100, label: `All ${total} tracks saved to Music/mulib` }
  }
  if (failed > 0 && done + failed >= total) {
    return { progress: null, label: 'Finished with errors — check tracks below' }
  }
  if (done > 0 && done < total) {
    return { progress: null, label: `Track ${done + 1} of ${total} · Preparing…` }
  }
  return { progress: null, label: `Starting… (${total} tracks)` }
}

function TrackRow({ hit, downloadState, onDownload, onDisk, index = 0 }: {
  hit: YtHit
  downloadState: DownloadState | null
  onDownload: (hit: YtHit) => void
  /** Present in Music/mulib (from disk scan). */
  onDisk: boolean
  index?: number
}) {
  const status = downloadState?.status ?? 'idle'
  const progress = downloadState?.progress ?? null
  const friendlyMsg = downloadState?.friendlyMessage ?? ''
  const isActive = status === 'finding' || status === 'downloading' || status === 'converting' || status === 'saving' || status === 'queued'
  const isDone = status === 'done' || onDisk
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
            <span>In Music/mulib</span>
          </div>
        )}

        {isFailed && !onDisk && (
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
          title={isDone ? (onDisk ? 'Already in Music/mulib' : 'Downloaded') : 'Save to Music/mulib'}
        >
          {isDone ? <CheckIcon /> : <DownloadIcon />}
        </button>
      </div>
    </div>
  )
}

function AlbumRow({
  album,
  downloadStates,
  onDownloadAlbum,
  onDownloadTrack,
  onExpand,
  tracks,
  tracksLoading,
  tracksError,
  bulkVideoIds,
  libraryScan,
  index,
}: {
  album: YtAlbumHit
  downloadStates: Record<string, DownloadState>
  onDownloadAlbum: (a: YtAlbumHit) => void
  onDownloadTrack: (hit: YtHit, album: YtAlbumHit) => void
  onExpand: (a: YtAlbumHit) => void
  tracks: YtHit[] | undefined
  tracksLoading: boolean
  tracksError: string | null
  bulkVideoIds: string[] | null
  libraryScan: MulibLibraryScan | null
  index: number
}) {
  const [open, setOpen] = useState(false)

  const handleToggle: React.ReactEventHandler<HTMLDetailsElement> = (e) => {
    const el = e.currentTarget
    setOpen(el.open)
    if (el.open) onExpand(album)
  }

  const countLabel = album.track_count != null ? `${album.track_count} songs` : (tracks ? `${tracks.length} songs` : 'Songs')

  const bulkLine = computeAlbumBulkLine(bulkVideoIds ?? undefined, downloadStates)
  const bulkSessionLocked = bulkVideoIds != null && bulkVideoIds.length > 0

  const anyTrackBusy = tracks?.some((t) => isActiveDownloadStatus(downloadStates[t.video_id]?.status ?? 'idle')) ?? false
  const albumDownloaded = albumFullyOnDisk(album, tracks, libraryScan)
  const downloadAlbumDisabled = bulkSessionLocked || anyTrackBusy || albumDownloaded

  return (
    <details
      className="albumRow"
      data-bulk-active={bulkSessionLocked ? 'true' : 'false'}
      style={{ animationDelay: `${index * 45}ms` }}
      onToggle={handleToggle}
    >
      <summary className="albumRowSummary">
        <span className="albumRowSummaryInner">
          <ChevronIcon open={open} />
          <div className="albumRowThumb">
            {album.thumbnail_url
              ? <img src={album.thumbnail_url} alt="" className="trackThumbImg" />
              : <div className="trackThumbPlaceholder" />}
          </div>
          <div className="albumRowMain">
            <div className="albumRowLabelRow">
              <span className="albumBadge">Album</span>
              <span className="albumRowTitle" title={album.title}>{album.title}</span>
            </div>
            <div className="albumRowMeta">
              {album.artist && <span>{album.artist}</span>}
              {album.year != null && <><span className="trackMetaDot">·</span><span>{album.year}</span></>}
              <span className="trackMetaDot">·</span>
              <span className="albumRowSongsHint">{countLabel}</span>
            </div>
            {bulkSessionLocked && bulkLine && (
              <div className="albumRowProgress" aria-live="polite">
                <div className="trackProgressBar albumRowProgressBar">
                  <div
                    className="trackProgressFill"
                    data-indeterminate={bulkLine.progress === null ? 'true' : 'false'}
                    style={bulkLine.progress !== null ? { width: `${bulkLine.progress}%` } : undefined}
                  />
                </div>
                <span className="albumRowProgressLabel">{bulkLine.label}</span>
              </div>
            )}
          </div>
          <button
            type="button"
            className={`albumDownloadAllBtn ${albumDownloaded ? 'albumDownloadAllBtn--done' : ''}`}
            disabled={downloadAlbumDisabled}
            title={albumDownloaded ? 'Album folder already in Music/mulib' : 'Download entire album'}
            onClick={(ev) => {
              ev.preventDefault()
              ev.stopPropagation()
              onDownloadAlbum(album)
            }}
          >
            {albumDownloaded ? (
              <span className="albumDownloadAllBtnDone">
                <CheckIcon />
                <span>In library</span>
              </span>
            ) : (
              'Download album'
            )}
          </button>
        </span>
      </summary>
      <div className="albumRowPanel" role="region" aria-label={`Tracks for ${album.title}`}>
        {tracksLoading && (
          <div className="albumTracksLoading">Loading songs…</div>
        )}
        {tracksError && (
          <div className="albumTracksError" role="alert">{tracksError}</div>
        )}
        {tracks && tracks.length === 0 && !tracksLoading && (
          <div className="albumTracksEmpty">No playable tracks.</div>
        )}
        {tracks && tracks.length > 0 && (
          <ul className="albumTrackList" role="list">
            {tracks.map((hit) => {
              const st = downloadStates[hit.video_id] ?? null
              const status = st?.status ?? 'idle'
              const onDisk = albumTrackFileOnDisk(album.title, hit, libraryScan)
              const isActive = status === 'finding' || status === 'downloading' || status === 'converting' || status === 'saving' || status === 'queued'
              const isDone = status === 'done' || onDisk
              return (
                <li key={hit.video_id} className="albumTrackItem">
                  <span className="albumTrackTitle" title={hit.title}>{hit.title}</span>
                  <span className="albumTrackDur">{hit.duration_label}</span>
                  <button
                    type="button"
                    className={`albumTrackDlBtn ${isDone ? 'albumTrackDlBtn--done' : ''}`}
                    onClick={() => onDownloadTrack(hit, album)}
                    disabled={isActive || isDone}
                    aria-label={`Download ${hit.title}`}
                    title={isDone ? 'Already in Music/mulib' : `Download ${hit.title}`}
                  >
                    {isDone ? <CheckIcon /> : <DownloadIcon />}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </details>
  )
}

function App() {
  const [ytdlpStatus, setYtdlpStatus] = useState<'ok' | 'error' | 'loading'>('loading')
  const [ytdlpError, setYtdlpError] = useState<string | null>(null)
  const [ytQuery, setYtQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([])
  const [ytSearching, setYtSearching] = useState(false)
  const [ytSearchError, setYtSearchError] = useState<string | null>(null)
  const [downloadStates, setDownloadStates] = useState<Record<string, DownloadState>>({})
  const [globalStatus, setGlobalStatus] = useState<string>('')
  const [albumTracks, setAlbumTracks] = useState<Record<string, YtHit[]>>({})
  const [albumTracksLoading, setAlbumTracksLoading] = useState<Record<string, boolean>>({})
  const [albumTracksError, setAlbumTracksError] = useState<Record<string, string | null>>({})
  const [resultsTab, setResultsTab] = useState<'songs' | 'albums'>('songs')
  const [albumDownloadSession, setAlbumDownloadSession] = useState<{ browseId: string; videoIds: string[] } | null>(null)
  const [libraryScan, setLibraryScan] = useState<MulibLibraryScan | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  /** Bumps on each search so background album-track prefetch ignores stale runs. */
  const albumPrefetchEpochRef = useRef(0)

  const refreshLibraryScan = useCallback(async () => {
    try {
      const s = await invoke<MulibLibraryScan>('mulib_scan_library')
      setLibraryScan(s)
    } catch {
      /* ignore */
    }
  }, [])

  const visibleResults = useMemo(
    () => searchResults.filter((r) => (resultsTab === 'songs' ? r.kind === 'song' : r.kind === 'album')),
    [searchResults, resultsTab],
  )

  const songCount = useMemo(() => searchResults.filter((i) => i.kind === 'song').length, [searchResults])
  const albumCount = useMemo(() => searchResults.filter((i) => i.kind === 'album').length, [searchResults])

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
    if (ytdlpStatus !== 'ok') return
    let cancelled = false
    void (async () => {
      try {
        const s = await invoke<MulibLibraryScan>('mulib_scan_library')
        if (!cancelled) setLibraryScan(s)
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ytdlpStatus])

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
        ? 'Saved to Music/mulib'
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
      if (success) {
        invoke<MulibLibraryScan>('mulib_scan_library')
          .then((s) => setLibraryScan(s))
          .catch(() => { })
      }
    })

    return () => {
      unYtProg.then((fn) => fn())
      unYtFin.then((fn) => fn())
    }
  }, [])

  const handleSearch = useCallback(async () => {
    const q = ytQuery.trim()
    if (!q || ytdlpStatus !== 'ok') return
    albumPrefetchEpochRef.current += 1
    const searchEpoch = albumPrefetchEpochRef.current
    setYtSearching(true)
    setYtSearchError(null)
    setAlbumTracks({})
    setAlbumTracksLoading({})
    setAlbumTracksError({})
    setResultsTab('songs')
    setAlbumDownloadSession(null)
    setGlobalStatus('Searching music…')
    const start = Date.now()
    try {
      const items = await invoke<SearchResultItem[]>('ytdlp_search', { query: q })
      if (albumPrefetchEpochRef.current !== searchEpoch) return
      setSearchResults(items)
      const nSongs = items.filter((i) => i.kind === 'song').length
      const nAlbums = items.filter((i) => i.kind === 'album').length
      const parts: string[] = []
      if (nSongs) parts.push(`${nSongs} song${nSongs !== 1 ? 's' : ''}`)
      if (nAlbums) parts.push(`${nAlbums} album${nAlbums !== 1 ? 's' : ''}`)
      setGlobalStatus(parts.length ? `Found ${parts.join(' and ')}` : 'No results')

      const albums = items.filter((i): i is YtAlbumHit => i.kind === 'album')
      const chunkSize = 3
      void (async () => {
        for (let i = 0; i < albums.length; i += chunkSize) {
          if (albumPrefetchEpochRef.current !== searchEpoch) return
          const slice = albums.slice(i, i + chunkSize)
          await Promise.all(
            slice.map(async (album) => {
              if (albumPrefetchEpochRef.current !== searchEpoch) return
              try {
                const t = await invoke<YtHit[]>('ytdlp_get_album_tracks', { browseId: album.browse_id })
                if (albumPrefetchEpochRef.current !== searchEpoch) return
                setAlbumTracks((prev) => {
                  if (prev[album.browse_id] !== undefined) return prev
                  return { ...prev, [album.browse_id]: t }
                })
              } catch {
                /* ignore — user can expand to load */
              }
            }),
          )
        }
      })()
    } catch (err) {
      setYtSearchError(String(err))
      setSearchResults([])
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
    } finally {
      await refreshLibraryScan()
    }
  }, [ytdlpStatus, refreshLibraryScan])

  const handleDownloadTrackFromAlbum = useCallback(async (hit: YtHit, album: YtAlbumHit) => {
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
          album: hit.album ?? album.title,
          thumbnail_url: hit.thumbnail_url ?? album.thumbnail_url ?? null,
          webpage_url: hit.webpage_url,
          album_folder: {
            album_title: album.title,
          },
        },
      })
    } catch (err) {
      setDownloadStates((prev) => ({
        ...prev,
        [hit.video_id]: { status: 'failed', progress: null, message: String(err), friendlyMessage: 'Something went wrong — try again' },
      }))
      setGlobalStatus('Something went wrong')
    } finally {
      await refreshLibraryScan()
    }
  }, [ytdlpStatus, refreshLibraryScan])

  const handleDownloadAlbum = useCallback(async (album: YtAlbumHit) => {
    if (ytdlpStatus !== 'ok') return
    let tracksList = albumTracks[album.browse_id]
    if (!tracksList) {
      setAlbumTracksLoading((p) => ({ ...p, [album.browse_id]: true }))
      setAlbumTracksError((p) => ({ ...p, [album.browse_id]: null }))
      try {
        tracksList = await invoke<YtHit[]>('ytdlp_get_album_tracks', { browseId: album.browse_id })
        setAlbumTracks((p) => ({ ...p, [album.browse_id]: tracksList! }))
      } catch (err) {
        setAlbumTracksError((p) => ({ ...p, [album.browse_id]: String(err) }))
        setGlobalStatus(String(err))
        return
      } finally {
        setAlbumTracksLoading((p) => ({ ...p, [album.browse_id]: false }))
      }
    }
    if (!tracksList?.length) {
      setGlobalStatus('No tracks to download')
      return
    }
    const videoIds = tracksList.map((t) => t.video_id)
    setAlbumDownloadSession({ browseId: album.browse_id, videoIds })
    setGlobalStatus('Downloading album…')
    try {
      await invoke('ytdlp_download_album', {
        request: {
          browse_id: album.browse_id,
          title: album.title,
          thumbnail_url: album.thumbnail_url ?? null,
        },
      })
    } catch (err) {
      setGlobalStatus(String(err))
    } finally {
      setAlbumDownloadSession(null)
      await refreshLibraryScan()
    }
  }, [ytdlpStatus, albumTracks, refreshLibraryScan])

  const ensureAlbumTracksLoaded = useCallback(async (album: YtAlbumHit) => {
    if (albumTracks[album.browse_id] !== undefined || albumTracksLoading[album.browse_id]) return
    setAlbumTracksLoading((p) => ({ ...p, [album.browse_id]: true }))
    setAlbumTracksError((p) => ({ ...p, [album.browse_id]: null }))
    try {
      const t = await invoke<YtHit[]>('ytdlp_get_album_tracks', { browseId: album.browse_id })
      setAlbumTracks((p) => ({ ...p, [album.browse_id]: t }))
    } catch (err) {
      setAlbumTracksError((p) => ({ ...p, [album.browse_id]: String(err) }))
    } finally {
      setAlbumTracksLoading((p) => ({ ...p, [album.browse_id]: false }))
    }
  }, [albumTracks, albumTracksLoading])

  const searchDisabled = ytSearching || ytdlpStatus !== 'ok'
  const hasResults = searchResults.length > 0
  const hasVisibleResults = visibleResults.length > 0

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
              placeholder="Artist, song, or album…"
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
          <div className="resultsBlock">
            <div className="resultsTabBar" role="tablist" aria-label="Result type">
              <button
                type="button"
                role="tab"
                className={`resultsTabBtn ${resultsTab === 'songs' ? 'resultsTabBtn--active' : ''}`}
                aria-selected={resultsTab === 'songs'}
                onClick={() => setResultsTab('songs')}
              >
                Songs
                <span className="resultsTabCount">{songCount}</span>
              </button>
              <button
                type="button"
                role="tab"
                className={`resultsTabBtn ${resultsTab === 'albums' ? 'resultsTabBtn--active' : ''}`}
                aria-selected={resultsTab === 'albums'}
                onClick={() => setResultsTab('albums')}
              >
                Albums
                <span className="resultsTabCount">{albumCount}</span>
              </button>
            </div>

            {!hasVisibleResults && (
              <div className="resultsTabEmpty" role="status">
                {resultsTab === 'songs'
                  ? 'No songs in this search. Try the Albums tab or change your search.'
                  : 'No albums in this search. Try the Songs tab or change your search.'}
              </div>
            )}

            {hasVisibleResults && (
              <div className="trackList" role="list" aria-label="Search results">
                {visibleResults.map((item, i) => {
                  if (item.kind === 'song') {
                    const { kind: _k, ...hit } = item
                    return (
                      <TrackRow
                        key={hit.video_id}
                        hit={hit}
                        downloadState={downloadStates[hit.video_id] ?? null}
                        onDownload={handleDownload}
                        onDisk={songFileOnDisk(hit, libraryScan)}
                        index={i}
                      />
                    )
                  }
                  return (
                    <AlbumRow
                      key={`album-${item.browse_id}`}
                      album={item}
                      downloadStates={downloadStates}
                      onDownloadAlbum={handleDownloadAlbum}
                      onDownloadTrack={handleDownloadTrackFromAlbum}
                      onExpand={ensureAlbumTracksLoaded}
                      tracks={albumTracks[item.browse_id]}
                      tracksLoading={albumTracksLoading[item.browse_id] ?? false}
                      tracksError={albumTracksError[item.browse_id] ?? null}
                      bulkVideoIds={albumDownloadSession?.browseId === item.browse_id ? albumDownloadSession.videoIds : null}
                      libraryScan={libraryScan}
                      index={i}
                    />
                  )
                })}
              </div>
            )}
          </div>
        )}

        {!hasResults && !ytSearching && !ytSearchError && (
          <div className="emptyState">
            <p className="emptyStateHeading">What are you<br />listening to?</p>
            <p className="emptyStateText">Search for songs or albums. Everything saves under Music/mulib — albums in their own folder by title.</p>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
