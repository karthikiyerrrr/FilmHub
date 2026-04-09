mod routes;
mod state;
mod video_stream;

use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{Html, IntoResponse, Response};
use axum::routing::{get, post};
use axum::Router;
use clap::Parser;
use rust_embed::Embed;
use std::path::PathBuf;
use tower_http::cors::CorsLayer;

use state::AppState;

#[derive(Parser)]
#[command(name = "reviewer", about = "FilmHub segment review webapp")]
struct Cli {
    /// Project root directory
    #[arg(long, default_value = ".")]
    project_root: PathBuf,

    /// Port to listen on
    #[arg(long, default_value_t = 3456)]
    port: u16,

    /// Pre-select a video file
    #[arg(long)]
    video: Option<String>,
}

#[derive(Embed)]
#[folder = "frontend/dist"]
struct Assets;

async fn serve_embedded(path: &str) -> Response {
    let path = if path.is_empty() { "index.html" } else { path };

    match Assets::get(path) {
        Some(content) => {
            let mime = mime_guess::from_path(path).first_or_octet_stream();
            (
                StatusCode::OK,
                [(axum::http::header::CONTENT_TYPE, mime.as_ref())],
                content.data.to_vec(),
            )
                .into_response()
        }
        None => {
            // Only do SPA fallback for paths without a file extension
            // (i.e., client-side routes). Actual asset requests (.js, .css, etc.)
            // that weren't found should return 404.
            let has_extension = std::path::Path::new(path)
                .extension()
                .is_some();
            if has_extension {
                StatusCode::NOT_FOUND.into_response()
            } else {
                match Assets::get("index.html") {
                    Some(content) => Html(
                        String::from_utf8_lossy(&content.data).to_string(),
                    )
                    .into_response(),
                    None => StatusCode::NOT_FOUND.into_response(),
                }
            }
        }
    }
}

async fn static_handler(uri: axum::http::Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    serve_embedded(path).await
}

async fn video_handler(
    State(state): State<AppState>,
    Path(filename): Path<String>,
    headers: HeaderMap,
) -> Result<Response, StatusCode> {
    if filename.contains("..") {
        return Err(StatusCode::BAD_REQUEST);
    }
    let path = state.videos_dir().join(&filename);
    video_stream::serve_video(path, &headers).await
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let cli = Cli::parse();
    let project_root = cli.project_root.canonicalize().unwrap_or(cli.project_root);
    let state = AppState::new(project_root);

    let api = Router::new()
        .route("/api/videos", get(routes::videos::list_videos))
        .route("/api/analysis/{video}", get(routes::analysis::get_review_data))
        .route(
            "/api/analysis/{video}/frames/{filename}",
            get(routes::analysis::get_frame),
        )
        .route("/api/segments/{video}", post(routes::segments::save_segments))
        .route("/api/cut/{video}", post(routes::cut::start_cut))
        .route("/api/cut/{video}/status", get(routes::cut::get_cut_status));

    let app = Router::new()
        .merge(api)
        .route("/videos/{filename}", get(video_handler))
        .fallback(static_handler)
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = format!("0.0.0.0:{}", cli.port);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();

    let url = if let Some(ref video) = cli.video {
        let stem = std::path::Path::new(video)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(video);
        format!("http://localhost:{}/?video={}", cli.port, stem)
    } else {
        format!("http://localhost:{}", cli.port)
    };

    tracing::info!("Reviewer running at {}", url);

    // Auto-open browser on macOS
    let _ = std::process::Command::new("open").arg(&url).spawn();

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .unwrap();
}

async fn shutdown_signal() {
    tokio::signal::ctrl_c()
        .await
        .expect("failed to listen for ctrl-c");
    tracing::info!("Shutting down...");
}
