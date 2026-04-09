use axum::body::Body;
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::Response;
use tokio::fs::File;
use tokio::io::{AsyncReadExt, AsyncSeekExt};

const MAX_CHUNK_SIZE: u64 = 2 * 1024 * 1024; // 2MB

fn mime_for_ext(ext: &str) -> &'static str {
    match ext {
        "mp4" => "video/mp4",
        "mov" => "video/quicktime",
        "mkv" => "video/x-matroska",
        "avi" => "video/x-msvideo",
        "webm" => "video/webm",
        _ => "application/octet-stream",
    }
}

pub async fn serve_video(
    path: std::path::PathBuf,
    headers: &HeaderMap,
) -> Result<Response, StatusCode> {
    let metadata = tokio::fs::metadata(&path)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;
    let total_size = metadata.len();

    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let content_type = mime_for_ext(&ext);

    let range_header = headers
        .get(header::RANGE)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("bytes="));

    match range_header {
        Some(range_str) => {
            let (start, end) = parse_range(range_str, total_size)
                .ok_or(StatusCode::RANGE_NOT_SATISFIABLE)?;

            let chunk_end = std::cmp::min(end, start + MAX_CHUNK_SIZE - 1);
            let chunk_len = chunk_end - start + 1;

            let mut file = File::open(&path)
                .await
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
            file.seek(std::io::SeekFrom::Start(start))
                .await
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

            let mut buf = vec![0u8; chunk_len as usize];
            file.read_exact(&mut buf)
                .await
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

            Ok(Response::builder()
                .status(StatusCode::PARTIAL_CONTENT)
                .header(header::CONTENT_TYPE, content_type)
                .header(header::ACCEPT_RANGES, "bytes")
                .header(
                    header::CONTENT_RANGE,
                    format!("bytes {}-{}/{}", start, chunk_end, total_size),
                )
                .header(header::CONTENT_LENGTH, chunk_len.to_string())
                .body(Body::from(buf))
                .unwrap())
        }
        None => {
            let file = File::open(&path)
                .await
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
            let stream = tokio_util::io::ReaderStream::new(file);

            Ok(Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, content_type)
                .header(header::ACCEPT_RANGES, "bytes")
                .header(header::CONTENT_LENGTH, total_size.to_string())
                .body(Body::from_stream(stream))
                .unwrap())
        }
    }
}

fn parse_range(range_str: &str, total: u64) -> Option<(u64, u64)> {
    let parts: Vec<&str> = range_str.splitn(2, '-').collect();
    if parts.len() != 2 {
        return None;
    }

    let start = if parts[0].is_empty() {
        // suffix range: -500 means last 500 bytes
        let suffix: u64 = parts[1].parse().ok()?;
        total.checked_sub(suffix)?
    } else {
        parts[0].parse().ok()?
    };

    let end = if parts[1].is_empty() {
        total - 1
    } else {
        parts[1].parse().ok()?
    };

    if start > end || start >= total {
        return None;
    }

    Some((start, std::cmp::min(end, total - 1)))
}
