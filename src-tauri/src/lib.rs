use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncBufReadExt;
use tokio::process::Command as TokioCommand;
use tokio::sync::Mutex;

// ── Runtime setup ────────────────────────────────────────────────────────────

fn ensure_runtime_dir(app: &AppHandle) -> Result<PathBuf, String> {
  let app_data_dir = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("failed to resolve app data dir: {e}"))?;

  let runtime_dir = app_data_dir.join("runtime");

  let resource_runtime_dir = app
    .path()
    .resolve("resources/python-runtime", tauri::path::BaseDirectory::Resource)
    .map_err(|e| format!("failed to resolve embedded runtime: {e}"))?;

  if !resource_runtime_dir.exists() {
    return Err(format!(
      "embedded runtime directory not found at {}",
      resource_runtime_dir.display()
    ));
  }

  let python_path = bundled_python_path(&runtime_dir);
  let should_refresh = !runtime_dir.exists() || !python_path.exists();
  if should_refresh {
    if runtime_dir.exists() {
      fs::remove_dir_all(&runtime_dir)
        .map_err(|e| format!("failed to remove stale runtime: {e}"))?;
    }
    copy_dir_all(&resource_runtime_dir, &runtime_dir)
      .map_err(|e| format!("failed to copy runtime: {e}"))?;
  }

  let python_path = bundled_python_path(&runtime_dir);
  if !python_path.exists() {
    return Err(format!(
      "Python runtime not found at {} (bundle at {})",
      python_path.display(),
      resource_runtime_dir.display()
    ));
  }

  Ok(runtime_dir)
}

fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
  fs::create_dir_all(dst)?;
  for entry in fs::read_dir(src)? {
    let entry = entry?;
    let file_type = entry.file_type()?;
    let src_path = entry.path();
    let dst_path = dst.join(entry.file_name());

    if file_type.is_dir() {
      copy_dir_all(&src_path, &dst_path)?;
    } else {
      fs::copy(&src_path, &dst_path)?;
    }
  }
  Ok(())
}

/// `python-build-standalone` install_only layout: `python/bin/python3` uses
/// `@rpath` to `libpython` inside the same prefix (no Homebrew Cellar paths).
fn bundled_python_path(runtime_dir: &Path) -> PathBuf {
  runtime_dir.join("python").join("bin").join("python3")
}

fn bundled_site_packages(runtime_dir: &Path) -> PathBuf {
  runtime_dir
    .join("python")
    .join("lib")
    .join("python3.12")
    .join("site-packages")
}

fn search_script_path(app: &AppHandle) -> Result<PathBuf, String> {
  app
    .path()
    .resolve("resources/ytmusic_search.py", tauri::path::BaseDirectory::Resource)
    .map_err(|e| format!("failed to resolve search script: {e}"))
}

fn download_script_path(app: &AppHandle) -> Result<PathBuf, String> {
  app
    .path()
    .resolve("resources/ytmusic_download.py", tauri::path::BaseDirectory::Resource)
    .map_err(|e| format!("failed to resolve download script: {e}"))
}

fn album_search_script_path(app: &AppHandle) -> Result<PathBuf, String> {
  app
    .path()
    .resolve("resources/ytmusic_album_search.py", tauri::path::BaseDirectory::Resource)
    .map_err(|e| format!("failed to resolve album search script: {e}"))
}

fn album_tracks_script_path(app: &AppHandle) -> Result<PathBuf, String> {
  app
    .path()
    .resolve("resources/ytmusic_album_tracks.py", tauri::path::BaseDirectory::Resource)
    .map_err(|e| format!("failed to resolve album tracks script: {e}"))
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn is_dir_writable(path: &Path) -> bool {
  if !path.exists() {
    return fs::create_dir_all(path).is_ok();
  }
  if !path.is_dir() {
    return false;
  }
  let test_file = path.join(".write_test");
  let ok = fs::write(&test_file, []).is_ok();
  let _ = fs::remove_file(&test_file);
  ok
}

fn sanitize_yt_query(q: &str) -> Result<String, String> {
  let q = q.trim();
  if q.is_empty() {
    return Err("Empty search query".to_string());
  }
  if q.len() > 300 {
    return Err("Search query too long (max 300 characters)".to_string());
  }
  if q.chars().any(|c| c == '\n' || c == '\r' || c == '\0') {
    return Err("Invalid characters in search".to_string());
  }
  Ok(q.to_string())
}

fn sanitize_filename(s: &str) -> String {
  s.chars()
    .map(|c| match c {
      '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '\0' => '_',
      c => c,
    })
    .collect::<String>()
    .trim()
    .to_string()
}

/// Same basename as `download_audio_track` uses for the output `.mp3` (for library scan matching).
fn compute_mp3_filename(hit: &YtSearchHit) -> String {
  let artist_part = hit.artist.as_deref().unwrap_or("").trim();
  let safe_title = sanitize_filename(hit.title.trim());
  let base_name = if artist_part.is_empty() {
    safe_title
  } else {
    format!("{} - {}", sanitize_filename(artist_part), safe_title)
  };
  format!("{}.mp3", base_name)
}

fn default_music_dir(app: &AppHandle) -> PathBuf {
  if let Ok(p) = app.path().audio_dir() {
    return p;
  }
  if let Some(home) = std::env::var_os("HOME") {
    return PathBuf::from(home).join("Music");
  }
  PathBuf::from("Music")
}

/// `Music/mulib/` — all Mulib downloads (songs flat, albums in subfolders).
fn mulib_library_dir(app: &AppHandle) -> PathBuf {
  default_music_dir(app).join("mulib")
}

/// `Music/mulib/{Album name}/` (album title only).
fn album_dir_for_title(app: &AppHandle, album_title: &str) -> PathBuf {
  let t = album_title.trim();
  if t.is_empty() {
    mulib_library_dir(app).join("_untitled_album")
  } else {
    mulib_library_dir(app).join(sanitize_filename(t))
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
struct YtSearchHit {
  video_id: String,
  title: String,
  artist: Option<String>,
  album: Option<String>,
  duration_label: String,
  duration_secs: Option<i64>,
  webpage_url: String,
  thumbnail_url: Option<String>,
  year: Option<i64>,
  is_explicit: Option<bool>,
  /// Output filename for `Music/mulib` matching (same rules as download).
  #[serde(default)]
  mp3_filename: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct YtAlbumSearchHit {
  browse_id: String,
  title: String,
  artist: Option<String>,
  year: Option<i64>,
  thumbnail_url: Option<String>,
  track_count: Option<i64>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum SearchResultItem {
  Song {
    #[serde(flatten)]
    song: YtSearchHit,
  },
  Album {
    #[serde(flatten)]
    album: YtAlbumSearchHit,
  },
}

#[derive(Clone, Serialize)]
struct YtDownloadProgressPayload {
  video_id: String,
  title: String,
  line: String,
}

#[derive(Clone, Serialize)]
struct YtDownloadFinishedPayload {
  video_id: String,
  title: String,
  success: bool,
  exit_code: Option<i32>,
  last_lines: Vec<String>,
}

#[derive(Serialize, Clone, Debug)]
struct MulibAlbumScan {
  folder_name: String,
  files: Vec<String>,
}

#[derive(Serialize, Clone, Debug)]
struct MulibLibraryScan {
  root_mp3: Vec<String>,
  albums: Vec<MulibAlbumScan>,
}

#[derive(Debug, Deserialize)]
struct YtAlbumFolderHint {
  album_title: String,
}

#[derive(Debug, Deserialize)]
struct YtDownloadRequest {
  video_id: String,
  title: String,
  #[serde(default)]
  artist: Option<String>,
  #[serde(default)]
  album: Option<String>,
  #[serde(default)]
  thumbnail_url: Option<String>,
  #[serde(default)]
  output_dir: Option<String>,
  #[serde(default)]
  webpage_url: Option<String>,
  /// When set, files go to `Music/mulib/{album_title}/` (single track from an album).
  #[serde(default)]
  album_folder: Option<YtAlbumFolderHint>,
}

#[derive(Debug, Deserialize)]
struct YtDownloadAlbumRequest {
  browse_id: String,
  title: String,
  #[serde(default)]
  thumbnail_url: Option<String>,
}

// ── Commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
fn ytdlp_check(app: AppHandle) -> Result<String, String> {
  let runtime_dir = ensure_runtime_dir(&app)?;
  let python = bundled_python_path(&runtime_dir);
  if !python.exists() {
    return Err("Python runtime not found".to_string());
  }
  let site_packages = bundled_site_packages(&runtime_dir);

  // Check both yt-dlp and ytmusicapi
  let output = Command::new(&python)
    .current_dir(&runtime_dir)
    .env("PYTHONPATH", &site_packages)
    .args(["-m", "yt_dlp", "--version"])
    .output()
    .map_err(|e| format!("yt-dlp check failed: {e}"))?;
  if !output.status.success() {
    return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
  }
  let ytdlp_ver = String::from_utf8_lossy(&output.stdout).trim().to_string();

  let ytm_check = Command::new(&python)
    .current_dir(&runtime_dir)
    .env("PYTHONPATH", &site_packages)
    .args(["-c", "from ytmusicapi import YTMusic; print('ok')"])
    .output()
    .map_err(|e| format!("ytmusicapi check failed: {e}"))?;
  if !ytm_check.status.success() {
    return Err("ytmusicapi not available in runtime".to_string());
  }

  Ok(ytdlp_ver)
}

fn parse_ndjson_songs(stdout: &str) -> Result<Vec<YtSearchHit>, String> {
  let mut hits: Vec<YtSearchHit> = Vec::new();
  for line in stdout.lines() {
    let line = line.trim();
    if line.is_empty() {
      continue;
    }
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
      if let Some(err) = v.get("error").and_then(|e| e.as_str()) {
        if hits.is_empty() {
          return Err(err.to_string());
        }
        break;
      }
      if let Ok(mut hit) = serde_json::from_value::<YtSearchHit>(v) {
        hit.mp3_filename = compute_mp3_filename(&hit);
        hits.push(hit);
      }
    }
  }
  Ok(hits)
}

fn parse_ndjson_albums(stdout: &str) -> Vec<YtAlbumSearchHit> {
  let mut hits: Vec<YtAlbumSearchHit> = Vec::new();
  for line in stdout.lines() {
    let line = line.trim();
    if line.is_empty() {
      continue;
    }
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
      if v.get("error").is_some() {
        break;
      }
      if let Ok(hit) = serde_json::from_value::<YtAlbumSearchHit>(v) {
        hits.push(hit);
      }
    }
  }
  hits
}

/// Search YouTube Music: song hits plus album hits in one response (songs first, then albums).
#[tauri::command]
async fn ytdlp_search(
  app: AppHandle,
  query: String,
  _music_catalog: Option<bool>,
) -> Result<Vec<SearchResultItem>, String> {
  let q = sanitize_yt_query(&query)?;
  let runtime_dir = ensure_runtime_dir(&app)?;
  let python = bundled_python_path(&runtime_dir);
  let song_script = search_script_path(&app)?;
  let album_script = album_search_script_path(&app)?;
  let site_packages = bundled_site_packages(&runtime_dir);

  if !song_script.exists() {
    return Err(format!("Search script not found at {}", song_script.display()));
  }
  if !album_script.exists() {
    return Err(format!(
      "Album search script not found at {}",
      album_script.display()
    ));
  }

  let q_a = q.clone();
  let runtime_a = runtime_dir.clone();
  let python_a = python.clone();
  let album_a = album_script.clone();
  let site_a = site_packages.clone();

  let (song_output, album_stdout) = tokio::task::spawn_blocking(move || {
    let song_output = Command::new(&python)
      .current_dir(&runtime_dir)
      .env("PYTHONPATH", &site_packages)
      .args([
        song_script.as_os_str(),
        std::ffi::OsStr::new(&q),
        std::ffi::OsStr::new("20"),
      ])
      .output()
      .map_err(|e| format!("song search failed: {e}"))?;

    let album_result = Command::new(&python_a)
      .current_dir(&runtime_a)
      .env("PYTHONPATH", &site_a)
      .args([
        album_a.as_os_str(),
        std::ffi::OsStr::new(&q_a),
        std::ffi::OsStr::new("8"),
      ])
      .output();

    let album_stdout = match album_result {
      Ok(o) => String::from_utf8_lossy(&o.stdout).to_string(),
      Err(_) => String::new(),
    };

    Ok::<_, String>((song_output, album_stdout))
  })
  .await
  .map_err(|e| format!("search task failed: {e}"))??;

  let song_stdout = String::from_utf8_lossy(&song_output.stdout);
  let songs = parse_ndjson_songs(&song_stdout);

  let mut items: Vec<SearchResultItem> = Vec::new();
  if let Ok(ref song_hits) = songs {
    for h in song_hits {
      items.push(SearchResultItem::Song { song: h.clone() });
    }
  }

  for a in parse_ndjson_albums(&album_stdout) {
    items.push(SearchResultItem::Album { album: a });
  }

  if items.is_empty() {
    if let Err(e) = songs {
      return Err(e);
    }
    let err = String::from_utf8_lossy(&song_output.stderr);
    let msg = err.trim();
    return Err(if msg.is_empty() {
      "No results found. Try a different search.".to_string()
    } else {
      msg.to_string()
    });
  }

  Ok(items)
}

async fn fetch_album_tracks(app: &AppHandle, browse_id: &str) -> Result<Vec<YtSearchHit>, String> {
  let bid = browse_id.trim().to_string();
  if bid.is_empty() || !bid.starts_with("MPRE") {
    return Err("Invalid album id".to_string());
  }

  let runtime_dir = ensure_runtime_dir(app)?;
  let python = bundled_python_path(&runtime_dir);
  let script = album_tracks_script_path(app)?;
  let site_packages = bundled_site_packages(&runtime_dir);

  if !script.exists() {
    return Err(format!(
      "Album tracks script not found at {}",
      script.display()
    ));
  }

  let output = tokio::task::spawn_blocking(move || {
    Command::new(&python)
      .current_dir(&runtime_dir)
      .env("PYTHONPATH", &site_packages)
      .args([script.as_os_str(), std::ffi::OsStr::new(&bid)])
      .output()
      .map_err(|e| format!("album tracks failed: {e}"))
  })
  .await
  .map_err(|e| format!("album tracks task failed: {e}"))??;

  let stdout = String::from_utf8_lossy(&output.stdout);
  let hits = parse_ndjson_songs(&stdout);
  match hits {
    Ok(v) if !v.is_empty() => Ok(v),
    Ok(_) => {
      let err = String::from_utf8_lossy(&output.stderr);
      let msg = err.trim();
      Err(if msg.is_empty() {
        "Could not load album tracks.".to_string()
      } else {
        msg.to_string()
      })
    }
    Err(e) => Err(e),
  }
}

/// List tracks for an album browse id (for the expandable album UI).
#[tauri::command]
async fn ytdlp_get_album_tracks(app: AppHandle, browse_id: String) -> Result<Vec<YtSearchHit>, String> {
  fetch_album_tracks(&app, &browse_id).await
}

/// Download every track in an album into `Music/mulib/{Album name}/`.
#[tauri::command]
async fn ytdlp_download_album(request: YtDownloadAlbumRequest, app: AppHandle) -> Result<(), String> {
  let browse_id = request.browse_id.trim().to_string();
  if browse_id.is_empty() || !browse_id.starts_with("MPRE") {
    return Err("Invalid album id".to_string());
  }

  let tracks = fetch_album_tracks(&app, &browse_id).await?;
  if tracks.is_empty() {
    return Err("No playable tracks in this album.".to_string());
  }

  let album_title = request.title.trim().to_string();
  let album_dir = album_dir_for_title(&app, &album_title);
  if !is_dir_writable(&album_dir) {
    return Err(format!(
      "Album folder is not writable: {}",
      album_dir.display()
    ));
  }

  let album_thumb = request.thumbnail_url.clone();

  for track in tracks {
    let req = YtDownloadRequest {
      video_id: track.video_id.clone(),
      title: track.title.clone(),
      artist: track.artist.clone(),
      album: Some(album_title.clone()),
      thumbnail_url: track
        .thumbnail_url
        .clone()
        .or_else(|| album_thumb.clone()),
      output_dir: Some(album_dir.to_string_lossy().into_owned()),
      webpage_url: Some(track.webpage_url.clone()),
      album_folder: None,
    };
    download_audio_track(app.clone(), req).await?;
  }

  Ok(())
}

/// Download audio via the ytmusic_download.py script.
/// The script handles: yt-dlp audio extraction → iTunes cover download → ffmpeg embed.
async fn download_audio_track(app: AppHandle, request: YtDownloadRequest) -> Result<(), String> {
  let output_dir = if let Some(ref hint) = request.album_folder {
    let title = hint.album_title.trim();
    if title.is_empty() {
      return Err("Album title is required for album folder downloads.".to_string());
    }
    album_dir_for_title(&app, title)
  } else {
    request
      .output_dir
      .as_ref()
      .map(|s| s.trim().to_string())
      .filter(|s| !s.is_empty())
      .map(PathBuf::from)
      .unwrap_or_else(|| mulib_library_dir(&app))
  };

  if !is_dir_writable(&output_dir) {
    return Err(format!(
      "Output directory is not writable: {}",
      output_dir.display()
    ));
  }

  let vid = request.video_id.trim().to_string();
  if vid.is_empty() || vid.chars().any(|c| !c.is_ascii_alphanumeric() && c != '-' && c != '_') {
    return Err("Invalid video id".to_string());
  }

  let runtime_dir = ensure_runtime_dir(&app)?;
  let python = bundled_python_path(&runtime_dir);
  if !python.exists() {
    return Err("Python runtime not found".to_string());
  }

  let script = download_script_path(&app)?;
  if !script.exists() {
    return Err(format!("Download script not found at {}", script.display()));
  }

  let site_packages = bundled_site_packages(&runtime_dir);

  let url = request
    .webpage_url
    .as_ref()
    .map(|s| s.trim().to_string())
    .filter(|u| u.starts_with("https://") || u.starts_with("http://"))
    .filter(|u| u.contains("youtube.com") || u.contains("youtu.be"))
    .unwrap_or_else(|| format!("https://music.youtube.com/watch?v={vid}"));

  let artist_part = request.artist.as_deref().unwrap_or("").trim().to_string();
  let safe_title = sanitize_filename(request.title.trim());
  let base_name = if artist_part.is_empty() {
    safe_title
  } else {
    format!("{} - {}", sanitize_filename(&artist_part), safe_title)
  };

  let cover_url = request.thumbnail_url.as_deref().unwrap_or("").to_string();
  let artist = request.artist.as_deref().unwrap_or("").to_string();
  let album = request.album.as_deref().unwrap_or("").to_string();

  let mut child = TokioCommand::new(&python)
    .current_dir(&runtime_dir)
    .env("PYTHONUNBUFFERED", "1")
    .env("PYTHONPATH", &site_packages)
    .args([
      script.as_os_str(),
      std::ffi::OsStr::new(&url),
      output_dir.as_os_str(),
      std::ffi::OsStr::new(&base_name),
      std::ffi::OsStr::new(&cover_url),
      std::ffi::OsStr::new(&artist),
      std::ffi::OsStr::new(&album),
    ])
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()
    .map_err(|e| format!("failed to start download script: {e}"))?;

  let video_id = vid.clone();
  let title = request.title.clone();

  let _ = app.emit("ytDownloadProgress", YtDownloadProgressPayload {
    video_id: video_id.clone(),
    title: title.clone(),
    line: "finding".to_string(),
  });

  let stdout = child.stdout.take();
  let stderr = child.stderr.take();

  let app_o = app.clone();
  let vid_o = video_id.clone();
  let title_o = title.clone();
  let last_error: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));
  let last_error_o = Arc::clone(&last_error);

  let read_out = async move {
    if let Some(stdout) = stdout {
      let mut lines = tokio::io::BufReader::new(stdout).lines();
      while let Ok(Some(line)) = lines.next_line().await {
        let line = line.trim().to_string();
        if line.is_empty() { continue; }
        // Parse the JSON progress objects emitted by the script
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) {
          let stage = v.get("stage").and_then(|s| s.as_str()).unwrap_or("");
          let emit_line = match stage {
            "finding"     => "finding".to_string(),
            "downloading" => {
              let pct = v.get("percent").and_then(|p| p.as_f64()).unwrap_or(0.0);
              format!("downloading {:.0}", pct)
            }
            "converting"  => "converting".to_string(),
            "cover"       => "cover".to_string(),
            "saving"      => "saving".to_string(),
            "done"        => "done".to_string(),
            "warning"     => continue, // non-fatal, skip UI update
            "error"       => {
              let msg = v.get("message").and_then(|m| m.as_str()).unwrap_or("unknown error");
              let mut e = last_error_o.lock().await;
              *e = msg.to_string();
              format!("error: {msg}")
            }
            _ => continue, // unknown stage, skip
          };
          let _ = app_o.emit("ytDownloadProgress", YtDownloadProgressPayload {
            video_id: vid_o.clone(),
            title: title_o.clone(),
            line: emit_line,
          });
        }
      }
    }
  };

  // Collect stderr — if the script crashes before emitting JSON we need this
  let stderr_buf: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
  let stderr_buf_w = Arc::clone(&stderr_buf);
  let read_err = async move {
    if let Some(stderr) = stderr {
      let mut lines = tokio::io::BufReader::new(stderr).lines();
      while let Ok(Some(line)) = lines.next_line().await {
        let line = line.trim().to_string();
        if !line.is_empty() {
          stderr_buf_w.lock().await.push(line);
        }
      }
    }
  };

  let h1 = tokio::spawn(read_out);
  let h2 = tokio::spawn(read_err);
  let _ = h1.await;
  let _ = h2.await;

  let status = child.wait().await.map_err(|e| format!("wait failed: {e}"))?;
  let success = status.success();
  let exit_code = status.code();
  let err_msg = last_error.lock().await.clone();
  let stderr_lines = stderr_buf.lock().await.clone();

  // Build the best error message we can from all available sources
  let last_lines = if !success {
    if !err_msg.is_empty() {
      vec![err_msg]
    } else if !stderr_lines.is_empty() {
      // Script crashed before emitting JSON — surface the raw stderr
      stderr_lines.into_iter().rev().take(3).rev().collect()
    } else {
      vec![format!("Process exited with code {:?}", exit_code)]
    }
  } else {
    vec![]
  };

  let _ = app.emit("ytDownloadFinished", YtDownloadFinishedPayload {
    video_id: video_id.clone(),
    title: title.clone(),
    success,
    exit_code,
    last_lines,
  });

  Ok(())
}

#[tauri::command]
async fn ytdlp_download_audio(request: YtDownloadRequest, app: AppHandle) -> Result<(), String> {
  download_audio_track(app, request).await
}

/// Scan `Music/mulib`: root `*.mp3` (singles) and one subfolder per album with track files.
/// Used to persist “already downloaded” UI across sessions.
#[tauri::command]
fn mulib_scan_library(app: AppHandle) -> Result<MulibLibraryScan, String> {
  let root = mulib_library_dir(&app);
  if !root.exists() {
    return Ok(MulibLibraryScan {
      root_mp3: Vec::new(),
      albums: Vec::new(),
    });
  }

  let mut root_mp3 = Vec::new();
  let mut albums = Vec::new();

  for entry in fs::read_dir(&root).map_err(|e| e.to_string())? {
    let entry = entry.map_err(|e| e.to_string())?;
    let path = entry.path();
    let name = entry.file_name().to_string_lossy().to_string();
    if name.starts_with('.') {
      continue;
    }

    if path.is_file() {
      if path
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("mp3"))
      {
        root_mp3.push(name);
      }
      continue;
    }

    if path.is_dir() {
      let mut files = Vec::new();
      for sub in fs::read_dir(&path).map_err(|e| format!("read {}: {e}", path.display()))? {
        let sub = sub.map_err(|e| e.to_string())?;
        let p = sub.path();
        if p.is_file()
          && p.extension()
            .and_then(|e| e.to_str())
            .is_some_and(|e| e.eq_ignore_ascii_case("mp3"))
        {
          files.push(sub.file_name().to_string_lossy().to_string());
        }
      }
      files.sort();
      albums.push(MulibAlbumScan { folder_name: name, files });
    }
  }

  root_mp3.sort();
  albums.sort_by(|a, b| a.folder_name.cmp(&b.folder_name));

  Ok(MulibLibraryScan { root_mp3, albums })
}

fn validate_mulib_rel_segment(s: &str, label: &str) -> Result<(), String> {
  if s.is_empty() {
    return Err(format!("Invalid {label}"));
  }
  if s.contains("..") || s.contains('/') || s.contains('\\') {
    return Err(format!("Invalid {label}"));
  }
  Ok(())
}

/// Absolute path to an existing `.mp3` under `Music/mulib` (for `convertFileSrc` playback).
/// Args are flattened for Tauri IPC (`mp3Filename` / `albumFolderName` from JS).
#[tauri::command]
fn mulib_resolve_track_path(
  app: AppHandle,
  mp3_filename: String,
  album_folder_name: Option<String>,
) -> Result<String, String> {
  validate_mulib_rel_segment(&mp3_filename, "file name")?;
  let root = mulib_library_dir(&app);
  let path = if let Some(folder) = album_folder_name
    .as_ref()
    .map(|s| s.trim())
    .filter(|s| !s.is_empty())
  {
    validate_mulib_rel_segment(folder, "album folder")?;
    root.join(folder).join(&mp3_filename)
  } else {
    root.join(&mp3_filename)
  };
  if !path.is_file() {
    return Err(format!("File not found: {}", path.display()));
  }
  path
    .canonicalize()
    .map(|p| p.to_string_lossy().to_string())
    .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
      ytdlp_check,
      ytdlp_search,
      ytdlp_get_album_tracks,
      ytdlp_download_album,
      ytdlp_download_audio,
      mulib_scan_library,
      mulib_resolve_track_path,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
