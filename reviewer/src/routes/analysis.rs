use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::{StatusCode, header};
use axum::response::Response;

use crate::state::AppState;

pub async fn get_review_data(
    State(state): State<AppState>,
    Path(video): Path<String>,
) -> Result<Response, StatusCode> {
    let path = state
        .analysis_dir()
        .join(&video)
        .join("review_data.json");

    let data = tokio::fs::read(&path)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(data))
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
