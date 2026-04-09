use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use serde::Serialize;

use crate::state::AppState;

const SUPPORTED_EXTENSIONS: &[&str] = &["mp4", "mkv", "mov", "avi", "webm"];

#[derive(Serialize)]
pub struct VideoInfo {
    pub name: String,
    pub path: String,
    pub has_analysis: bool,
    pub analysis_types: Vec<String>,
}

pub async fn list_videos(
    State(state): State<AppState>,
) -> Result<Json<Vec<VideoInfo>>, StatusCode> {
    let videos_dir = state.videos_dir();
    let analysis_dir = state.analysis_dir();

    let mut entries =
        tokio::fs::read_dir(&videos_dir)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut videos = Vec::new();

    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    {
        let name = entry.file_name().to_string_lossy().to_string();
        let ext = std::path::Path::new(&name)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        if !SUPPORTED_EXTENSIONS.contains(&ext.as_str()) {
            continue;
        }

        let stem = std::path::Path::new(&name)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();

        let analysis_path = analysis_dir.join(&stem);
        let has_analysis = analysis_path.exists();

        let mut analysis_types = Vec::new();
        if has_analysis {
            if analysis_path.join("music.json").exists() {
                analysis_types.push("music".to_string());
            }
            if analysis_path.join("graphics_candidates.json").exists() {
                analysis_types.push("graphics".to_string());
            }
            if analysis_path.join("transcript.json").exists() {
                analysis_types.push("transcript".to_string());
            }
            if analysis_path.join("review_data.json").exists() {
                analysis_types.push("review_data".to_string());
            }
        }

        videos.push(VideoInfo {
            path: format!("videos/{}", name),
            name,
            has_analysis,
            analysis_types,
        });
    }

    videos.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(Json(videos))
}
