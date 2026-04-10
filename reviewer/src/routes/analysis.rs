use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::{StatusCode, header};
use axum::response::Response;

use crate::state::AppState;

/// Run ffprobe to extract the video frame rate as a float.
async fn probe_fps(video_path: &std::path::Path) -> Option<f64> {
    let output = tokio::process::Command::new("ffprobe")
        .args([
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=r_frame_rate",
            "-of", "default=noprint_wrappers=1:nokey=1",
        ])
        .arg(video_path)
        .output()
        .await
        .ok()?;

    let raw = String::from_utf8_lossy(&output.stdout);
    let trimmed = raw.trim();
    // r_frame_rate is typically "30/1" or "30000/1001"
    if let Some((num, den)) = trimmed.split_once('/') {
        let n: f64 = num.parse().ok()?;
        let d: f64 = den.parse().ok()?;
        if d > 0.0 { Some(n / d) } else { None }
    } else {
        trimmed.parse().ok()
    }
}

/// Snap a detected fps value to the nearest common frame rate.
fn snap_fps(raw: f64) -> f64 {
    const COMMON: &[f64] = &[23.976, 24.0, 25.0, 29.97, 30.0, 48.0, 50.0, 59.94, 60.0];
    COMMON
        .iter()
        .copied()
        .min_by(|a, b| (a - raw).abs().partial_cmp(&(b - raw).abs()).unwrap())
        .unwrap_or(raw)
}

pub async fn get_review_data(
    State(state): State<AppState>,
    Path(video): Path<String>,
) -> Result<Response, StatusCode> {
    let path = state
        .analysis_dir()
        .join(&video)
        .join("review_data.json");

    let raw = tokio::fs::read(&path)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;

    // Parse, inject fps from ffprobe, re-serialize
    let mut doc: serde_json::Value =
        serde_json::from_slice(&raw).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Some(video_obj) = doc.get_mut("video").and_then(|v| v.as_object_mut()) {
        // Resolve the actual video file path
        if let Some(filename) = video_obj.get("filename").and_then(|f| f.as_str()) {
            let video_path = state.videos_dir().join(filename);
            if let Some(raw_fps) = probe_fps(&video_path).await {
                let fps = snap_fps(raw_fps);
                video_obj.insert("fps".to_string(), serde_json::json!(fps));
            }
        }
    }

    let body = serde_json::to_vec(&doc).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(body))
        .unwrap())
}

pub async fn get_frame(
    State(state): State<AppState>,
    Path((video, filename)): Path<(String, String)>,
) -> Result<Response, StatusCode> {
    // Prevent path traversal
    if filename.contains("..") || filename.contains('/') {
        return Err(StatusCode::BAD_REQUEST);
    }

    let path = state
        .analysis_dir()
        .join(&video)
        .join("graphics_frames")
        .join(&filename);

    let data = tokio::fs::read(&path)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;

    let content_type = mime_guess::from_path(&path)
        .first_or_octet_stream()
        .to_string();

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type)
        .body(Body::from(data))
        .unwrap())
}
