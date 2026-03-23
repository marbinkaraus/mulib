/**
 * Matches Rust `sanitize_filename` and download base names in `lib.rs` / ytmusic_download.py.
 */

const INVALID = new Set(['/', '\\', ':', '*', '?', '"', '<', '>', '|', '\0'])

export function sanitizeFilename(s: string): string {
  return [...s]
    .map((c) => (INVALID.has(c) ? '_' : c))
    .join('')
    .trim()
}

/** Final filename for a track (e.g. `Artist - Title.mp3`). */
export function expectedMp3Filename(hit: { title: string; artist?: string | null }): string {
  const artistPart = (hit.artist ?? '').trim()
  const safeTitle = sanitizeFilename(hit.title.trim())
  const base = artistPart === '' ? safeTitle : `${sanitizeFilename(artistPart)} - ${safeTitle}`
  return `${base}.mp3`
}

/** Prefer server-provided name (matches Rust download exactly); fallback to TS mirror. */
export function trackFileExpectedName(hit: {
  title: string
  artist?: string | null
  mp3_filename?: string | null
}): string {
  const f = hit.mp3_filename?.trim()
  if (f) return f
  return expectedMp3Filename(hit)
}

/** Where the file lives under `Music/mulib` (root vs album subfolder). */
export function resolvePlayableLocation(
  hit: { title: string; artist?: string | null; mp3_filename?: string | null },
  scan: MulibLibraryScan | null,
): { filename: string; albumFolderName: string | null } | null {
  if (!scan) return null
  const filename = trackFileExpectedName(hit)
  if (scan.root_mp3.includes(filename)) {
    return { filename, albumFolderName: null }
  }
  for (const a of scan.albums) {
    if (a.files.includes(filename)) {
      return { filename, albumFolderName: a.folder_name }
    }
  }
  return null
}

/** Folder name under Music/mulib for an album (matches `album_dir_for_title`). */
export function albumFolderNameFromTitle(albumTitle: string): string {
  const t = albumTitle.trim()
  return t === '' ? '_untitled_album' : sanitizeFilename(t)
}

export interface MulibLibraryScan {
  root_mp3: string[]
  albums: { folder_name: string; files: string[] }[]
}

export function songFileOnDisk(
  hit: { title: string; artist?: string | null; mp3_filename?: string | null },
  scan: MulibLibraryScan | null,
): boolean {
  if (!scan) return false
  const name = trackFileExpectedName(hit)
  if (scan.root_mp3.includes(name)) return true
  // Whole-album downloads live under album folders, not the library root.
  return scan.albums.some((a) => a.files.includes(name))
}

export function albumTrackFileOnDisk(
  albumTitle: string,
  hit: { title: string; artist?: string | null; mp3_filename?: string | null },
  scan: MulibLibraryScan | null,
): boolean {
  if (!scan) return false
  const folder = albumFolderNameFromTitle(albumTitle)
  const entry = scan.albums.find((a) => a.folder_name === folder)
  if (!entry) return false
  return entry.files.includes(trackFileExpectedName(hit))
}

export function albumFullyOnDisk(
  album: { title: string; track_count?: number | null },
  tracks: { title: string; artist?: string | null; mp3_filename?: string | null }[] | undefined,
  scan: MulibLibraryScan | null,
): boolean {
  if (!scan) return false
  const folder = albumFolderNameFromTitle(album.title)
  const entry = scan.albums.find((a) => a.folder_name === folder)
  if (!entry || entry.files.length === 0) return false
  if (tracks?.length) {
    return tracks.every((t) => entry.files.includes(trackFileExpectedName(t)))
  }
  const tc = album.track_count
  if (tc != null && tc > 0) {
    return entry.files.length >= tc
  }
  return false
}
