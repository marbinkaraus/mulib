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

fn default_music_dir(app: &AppHandle) -> PathBuf {
  if let Ok(p) = app.path().audio_dir() {
    return p;
  }
  if let Some(home) = std::env::var_os("HOME") {
    return PathBuf::from(home).join("Music");
  }
  PathBuf::from("Music")
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

/// Search YouTube Music using ytmusicapi (fast, no age-gate, full metadata).
/// Returns up to `limit` song results with artist, album, duration, thumbnail.
/// Async so the frontend can paint loading state before the blocking Python call runs.
#[tauri::command]
async fn ytdlp_search(
  app: AppHandle,
  query: String,
  _music_catalog: Option<bool>,
) -> Result<Vec<YtSearchHit>, String> {
  let q = sanitize_yt_query(&query)?;
  let runtime_dir = ensure_runtime_dir(&app)?;
  let python = bundled_python_path(&runtime_dir);
  let script = search_script_path(&app)?;
  let site_packages = bundled_site_packages(&runtime_dir);

  if !script.exists() {
    return Err(format!("Search script not found at {}", script.display()));
  }

  let output = tokio::task::spawn_blocking(move || {
    Command::new(&python)
      .current_dir(&runtime_dir)
      .env("PYTHONPATH", &site_packages)
      .args([script.as_os_str(), std::ffi::OsStr::new(&q), std::ffi::OsStr::new("20")])
      .output()
      .map_err(|e| format!("search failed: {e}"))
  })
  .await
  .map_err(|e| format!("search task failed: {e}"))??;

  let stdout = String::from_utf8_lossy(&output.stdout);

  // The script outputs one JSON object per line (NDJSON)
  let mut hits: Vec<YtSearchHit> = Vec::new();
  for line in stdout.lines() {
    let line = line.trim();
    if line.is_empty() {
      continue;
    }
    // Check if the script returned an error object
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
      if let Some(err) = v.get("error").and_then(|e| e.as_str()) {
        if hits.is_empty() {
          return Err(err.to_string());
        }
        // Partial results — stop but return what we have
        break;
      }
      if let Ok(hit) = serde_json::from_value::<YtSearchHit>(v) {
        hits.push(hit);
      }
    }
  }

  if hits.is_empty() {
    // Surface stderr if we got nothing
    let err = String::from_utf8_lossy(&output.stderr);
    let msg = err.trim();
    return Err(if msg.is_empty() {
      "No results found. Try a different search.".to_string()
    } else {
      msg.to_string()
    });
  }

  Ok(hits)
}

/// Download audio via the ytmusic_download.py script.
/// The script handles: yt-dlp audio extraction → iTunes cover download → ffmpeg embed.
#[tauri::command]
async fn ytdlp_download_audio(request: YtDownloadRequest, app: AppHandle) -> Result<(), String> {
  let output_dir = request
    .output_dir
    .as_ref()
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
    .map(PathBuf::from)
    .unwrap_or_else(|| default_music_dir(&app));

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
      ytdlp_check,
      ytdlp_search,
      ytdlp_download_audio,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
