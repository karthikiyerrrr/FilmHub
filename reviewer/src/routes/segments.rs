use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::{Deserialize, Serialize};

use crate::state::AppState;

#[derive(Deserialize, Serialize, Clone)]
pub struct CleanSegment {
    pub start: f64,
    pub end: f64,
    pub types: Vec<String>,
    pub description: String,
}

#[derive(Serialize)]
pub struct SaveResult {
    pub file: String,
    pub sequence: u32,
}

#[derive(Deserialize, Serialize)]
pub struct ReviewSegment {
    pub start: f64,
    pub end: f64,
    pub types: Vec<String>,
    pub description: String,
    pub accepted: bool,
}

#[derive(Deserialize, Serialize)]
pub struct ReviewExport {
    pub video: String,
    pub reviewed_at: String,
    pub segments: Vec<ReviewSegment>,
    pub accepted_count: u32,
    pub rejected_count: u32,
    pub total_removed_seconds: f64,
}

pub async fn save_segments(
    State(state): State<AppState>,
    Path(video): Path<String>,
    Json(segments): Json<Vec<CleanSegment>>,
) -> Result<Json<SaveResult>, StatusCode> {
    let analysis_path = state.analysis_dir().join(&video);

    if !analysis_path.exists() {
        tokio::fs::create_dir_all(&analysis_path)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    // Find next sequence number
    let mut max_seq: u32 = 0;
    let mut entries = tokio::fs::read_dir(&analysis_path)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    {
        let name = entry.file_name().to_string_lossy().to_string();
        if let Some(rest) = name.strip_prefix("clean_") {
            if let Some(num_str) = rest.strip_suffix("_segments.json") {
                if let Ok(n) = num_str.parse::<u32>() {
                    max_seq = max_seq.max(n);
                }
            }
        }
    }

    let seq = max_seq + 1;
    let filename = format!("clean_{:02}_segments.json", seq);
    let filepath = analysis_path.join(&filename);

    let json_data = serde_json::to_string_pretty(&segments)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    tokio::fs::write(&filepath, json_data)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let relative = format!("analysis/{}/{}", video, filename);

    Ok(Json(SaveResult {
        file: relative,
        sequence: seq,
    }))
}

pub async fn save_review(
    State(state): State<AppState>,
    Path(video): Path<String>,
    Json(review): Json<ReviewExport>,
) -> Result<Json<SaveResult>, StatusCode> {
    let analysis_path = state.analysis_dir().join(&video);

    if !analysis_path.exists() {
        tokio::fs::create_dir_all(&analysis_path)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    // Find next review sequence number
    let mut max_seq: u32 = 0;
    let mut entries = tokio::fs::read_dir(&analysis_path)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    {
        let name = entry.file_name().to_string_lossy().to_string();
        if let Some(rest) = name.strip_prefix("review_") {
            if let Some(num_str) = rest.strip_suffix(".json") {
                if let Ok(n) = num_str.parse::<u32>() {
                    max_seq = max_seq.max(n);
                }
            }
        }
    }

    let seq = max_seq + 1;
    let filename = format!("review_{:02}.json", seq);
    let filepath = analysis_path.join(&filename);

    let json_data = serde_json::to_string_pretty(&review)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    tokio::fs::write(&filepath, json_data)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let relative = format!("analysis/{}/{}", video, filename);

    Ok(Json(SaveResult {
        file: relative,
        sequence: seq,
    }))
}
