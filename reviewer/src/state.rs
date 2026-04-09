use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use serde::Serialize;

#[derive(Clone, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum CutStatus {
    Idle,
    Running,
    Done {
        segments_file: String,
        output_path: String,
    },
    Failed {
        error: String,
    },
}

#[derive(Clone)]
pub struct AppState {
    pub project_root: PathBuf,
    pub cut_status: Arc<Mutex<HashMap<String, CutStatus>>>,
}

impl AppState {
    pub fn new(project_root: PathBuf) -> Self {
        Self {
            project_root,
            cut_status: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn videos_dir(&self) -> PathBuf {
        self.project_root.join("videos")
    }

    pub fn analysis_dir(&self) -> PathBuf {
        self.project_root.join("analysis")
    }
}
