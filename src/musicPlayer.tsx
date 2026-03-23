import { useCallback, useEffect, useRef, useState } from 'react'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import type { MulibLibraryScan } from './mulibPaths'
import { resolvePlayableLocation } from './mulibPaths'

export interface YtHitLike {
  video_id: string
  title: string
  artist?: string | null
  thumbnail_url?: string | null
  mp3_filename?: string | null
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function useMusicPlayer(libraryScan: MulibLibraryScan | null) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [nowPlaying, setNowPlaying] = useState<YtHitLike | null>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onTime = () => setCurrentTime(audio.currentTime)
    const syncDur = () => {
      const d = audio.duration
      setDuration(isFinite(d) ? d : 0)
    }
    const onEnded = () => {
      setPlaying(false)
      setCurrentTime(0)
    }
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onMediaError = () => {
      const code = audio.error?.code
      const map: Record<number, string> = {
        1: 'MEDIA_ERR_ABORTED',
        2: 'MEDIA_ERR_NETWORK',
        3: 'MEDIA_ERR_DECODE',
        4: 'MEDIA_ERR_SRC_NOT_SUPPORTED',
      }
      setError(
        code != null
          ? `Could not play (${map[code] ?? code})`
          : 'Could not load audio',
      )
    }
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('durationchange', syncDur)
    audio.addEventListener('loadedmetadata', syncDur)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('error', onMediaError)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('durationchange', syncDur)
      audio.removeEventListener('loadedmetadata', syncDur)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('error', onMediaError)
    }
  }, [])

  const play = useCallback(
    async (hit: YtHitLike) => {
      const loc = resolvePlayableLocation(hit, libraryScan)
      if (!loc) return
      const audio = audioRef.current
      if (!audio) return

      if (nowPlaying?.video_id === hit.video_id) {
        if (audio.paused) {
          try {
            await audio.play()
          } catch (e) {
            setError(String(e))
          }
        } else {
          audio.pause()
        }
        return
      }

      setError(null)
      let path: string
      try {
        path = await invoke<string>('mulib_resolve_track_path', {
          mp3Filename: loc.filename,
          albumFolderName: loc.albumFolderName,
        })
      } catch (e) {
        setError(String(e))
        return
      }

      const url = convertFileSrc(path)
      audio.preload = 'auto'
      audio.src = url
      setNowPlaying(hit)

      try {
        await audio.play()
      } catch (e) {
        setError(String(e))
        /* Keep nowPlaying + src so the bar stays; user can tap play again (new gesture). */
      }
    },
    [libraryScan, nowPlaying?.video_id],
  )

  const toggle = useCallback(async () => {
    const audio = audioRef.current
    if (!audio || !nowPlaying) return
    if (audio.paused) {
      try {
        await audio.play()
      } catch (e) {
        setError(String(e))
      }
    } else {
      audio.pause()
    }
  }, [nowPlaying])

  const seek = useCallback(
    (ratio: number) => {
      const audio = audioRef.current
      if (!audio || !isFinite(audio.duration)) return
      const r = Math.min(1, Math.max(0, ratio))
      audio.currentTime = r * audio.duration
    },
    [],
  )

  const stop = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
    }
    setNowPlaying(null)
    setPlaying(false)
    setCurrentTime(0)
    setDuration(0)
  }, [])

  return {
    audioRef,
    nowPlaying,
    playing,
    currentTime,
    duration,
    error,
    play,
    toggle,
    seek,
    stop,
    formatTime,
  }
}

export function NowPlayingBar({
  nowPlaying,
  playing,
  currentTime,
  duration,
  error,
  onToggle,
  onSeek,
  onStop,
  formatTime,
}: {
  nowPlaying: YtHitLike | null
  playing: boolean
  currentTime: number
  duration: number
  error: string | null
  onToggle: () => void
  onSeek: (ratio: number) => void
  onStop: () => void
  formatTime: (s: number) => string
}) {
  if (!nowPlaying) return null

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="nowPlayingBar" role="region" aria-label="Now playing">
      <div className="nowPlayingInner">
        <div className="nowPlayingThumb">
          {nowPlaying.thumbnail_url ? (
            <img src={nowPlaying.thumbnail_url} alt="" className="trackThumbImg" />
          ) : (
            <div className="trackThumbPlaceholder" />
          )}
        </div>
        <div className="nowPlayingMeta">
          <div className="nowPlayingTitle" title={nowPlaying.title}>
            {nowPlaying.title}
          </div>
          {nowPlaying.artist && <div className="nowPlayingArtist">{nowPlaying.artist}</div>}
          {error && <div className="nowPlayingError" role="alert">{error}</div>}
        </div>
        <div className="nowPlayingControls">
          <button
            type="button"
            className="nowPlayingPlayBtn"
            onClick={onToggle}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? <PauseGlyph /> : <PlayGlyph />}
          </button>
          <button type="button" className="nowPlayingStopBtn" onClick={onStop} aria-label="Stop">
            <StopGlyph />
          </button>
        </div>
        <div className="nowPlayingSeekWrap">
          <input
            type="range"
            className="nowPlayingSeek"
            min={0}
            max={100}
            step={0.25}
            value={pct}
            onInput={(e) => onSeek(Number((e.target as HTMLInputElement).value) / 100)}
            aria-label="Seek"
          />
          <div className="nowPlayingTimes">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function PlayGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function PauseGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  )
}

function StopGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="1" />
    </svg>
  )
}
