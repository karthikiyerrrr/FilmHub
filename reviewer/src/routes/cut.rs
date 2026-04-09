use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::{Deserialize, Serialize};

use crate::state::{AppState, CutStatus};

#[derive(Deserialize)]
pub struct CutRequest {
    pub segments_file: String,
}

#[derive(Serialize)]
pub struct CutStarted {
    pub status: String,
}

pub async fn start_cut(
    State(state): State<AppState>,
    Path(video): Path<String>,
    Json(req): Json<CutRequest>,
) -> Result<Json<CutStarted>, StatusCode> {
    // Check not already running
    {
        let status = state.cut_status.lock().unwrap();
        if let Some(CutStatus::Running) = status.get(&video) {
            return Err(StatusCode::CONFLICT);
        }
    }

    // Resolve video file with extension
    let videos_dir = state.videos_dir();
    let video_path = find_video_file(&videos_dir, &video)
        .await
        .ok_or(StatusCode::NOT_FOUND)?;

    let segments_path = state.project_root.join(&req.segments_file);
    if !segments_path.exists() {
        return Err(StatusCode::NOT_FOUND);
    }

    // Set status to running
    {
        let mut status = state.cut_status.lock().unwrap();
        status.insert(video.clone(), CutStatus::Running);
    }

    // Spawn cutting task
    let state_clone = state.clone();
    let video_clone = video.clone();
    let segments_file = req.segments_file.clone();

    tokio::spawn(async move {
        let venv_python = state_clone.project_root.join(".venv/bin/python");
        let result = tokio::process::Command::new(&venv_python)
            .arg("-m")
            .arg("filmhub.cut_video")
            .arg(&video_path)
            .arg(&segments_path)
            .current_dir(&state_clone.project_root)
            .output()
            .await;

        match result {
            Ok(output) if output.status.success() => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let output_path = stdout
                    .lines()
                    .find(|l| l.starts_with("Done! Clean video: "))
                    .map(|l| l.trim_start_matches("Done! Clean video: ").to_string())
                    .unwrap_or_default();

                // Write signal file
                let signal = serde_json::json!({
                    "segments_file": segments_file,
                    "output_file": output_path,
                    "status": "success"
                });
                let signal_path = state_clone
                    .analysis_dir()
                    .join(&video_clone)
                    .join(".review_complete.json");
                let _ = tokio::fs::write(
                    &signal_path,
                    serde_json::to_string_pretty(&signal).unwrap(),
                )
                .await;

                let mut status = state_clone.cut_status.lock().unwrap();
                status.insert(
                    video_clone,
                    CutStatus::Done {
                        segments_file,
                        output_path,
                    },
                );
            }
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                let mut status = state_clone.cut_status.lock().unwrap();
                status.insert(video_clone, CutStatus::Failed { error: stderr });
            }
            Err(e) => {
                let mut status = state_clone.cut_status.lock().unwrap();
                status.insert(
                    video_clone,
                    CutStatus::Failed {
                        error: e.to_string(),
                    },
                );
            }
        }
    });

    Ok(Json(CutStarted {
        status: "started".to_string(),
    }))
}

pub async fn get_cut_status(
    State(state): State<AppState>,
    Path(video): Path<String>,
) -> Json<CutStatus> {
    let status = state.cut_status.lock().unwrap();
    let s = status.get(&video).cloned().unwrap_or(CutStatus::Idle);
    Json(s)
}

async fn find_video_file(
    videos_dir: &std::path::Path,
    stem: &str,
) -> Option<String> {
    let mut entries = tokio::fs::read_dir(videos_dir).await.ok()?;
    while let Some(entry) = entries.next_entry().await.ok()? {
        let name = entry.file_name().to_string_lossy().to_string();
        let path = std::path::Path::new(&name);
        if path.file_stem().and_then(|s| s.to_str()) == Some(stem) {
            return Some(format!("videos/{}", name));
        }
    }
    None
}
