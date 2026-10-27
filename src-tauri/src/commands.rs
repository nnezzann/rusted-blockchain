//! Typed Tauri IPC commands for the learning blockchain domain.
//!
//! Commands validate transport-level constraints, delegate to
//! [`crate::application`], and serialize typed responses. They do not duplicate
//! hash, target, mining, or chain rules. Transaction validation and
//! persistence-backed experiments are not implemented yet.

use std::{
    collections::HashMap,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
};

use serde::{Deserialize, Serialize};
use tauri::{State, ipc::Channel};

use crate::{
    application::{blocks, mining},
    domain::{
        block::BlockHeader,
        chain::ChainValidation,
        hash::{display_hash, sha256, sha256d},
        mining::{MAX_MINING_ATTEMPTS, MiningProgress, MiningResult},
        validation::HeaderInspection,
    },
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HashResult {
    pub sha256: String,
    pub sha256d: String,
}

#[derive(Default)]
pub struct MiningRuntime {
    jobs: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

#[tauri::command]
pub fn hash_input(input: String) -> HashResult {
    HashResult {
        sha256: crate::domain::hash::hex(&sha256(input.as_bytes())),
        sha256d: display_hash(&sha256d(input.as_bytes())),
    }
}

#[tauri::command]
pub fn inspect_block(header: BlockHeader) -> Result<HeaderInspection, String> {
    blocks::inspect(&header)
}

#[tauri::command]
pub fn validate_chain(headers: Vec<BlockHeader>) -> ChainValidation {
    blocks::validate_chain(&headers)
}

#[tauri::command]
pub fn create_demo_chain() -> Result<Vec<BlockHeader>, String> {
    blocks::create_demo_chain()
}

#[tauri::command]
pub async fn mine_block(
    runtime: State<'_, MiningRuntime>,
    job_id: String,
    header: BlockHeader,
    max_attempts: u64,
    on_progress: Channel<MiningProgress>,
) -> Result<MiningResult, String> {
    if job_id.is_empty() || job_id.len() > 64 {
        return Err("Mining job ID must contain between 1 and 64 characters.".into());
    }
    if max_attempts == 0 || max_attempts > MAX_MINING_ATTEMPTS {
        return Err(format!(
            "Mining attempts must be between 1 and {MAX_MINING_ATTEMPTS}."
        ));
    }

    let cancelled = Arc::new(AtomicBool::new(false));
    {
        let mut jobs = runtime
            .jobs
            .lock()
            .map_err(|_| "Mining job registry is unavailable.".to_string())?;
        if jobs.contains_key(&job_id) {
            return Err("A mining job with this ID is already running.".into());
        }
        jobs.insert(job_id.clone(), cancelled.clone());
    }

    let worker_cancelled = cancelled.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        mining::mine_header(header, max_attempts, worker_cancelled.clone(), |progress| {
            if on_progress.send(progress).is_err() {
                worker_cancelled.store(true, Ordering::Relaxed);
            }
        })
    })
    .await
    .map_err(|error| format!("Mining worker failed: {error}"));

    runtime
        .jobs
        .lock()
        .map_err(|_| "Mining job registry is unavailable.".to_string())?
        .remove(&job_id);
    result?
}

#[tauri::command]
pub fn cancel_mining(runtime: State<'_, MiningRuntime>, job_id: String) -> Result<(), String> {
    let jobs = runtime
        .jobs
        .lock()
        .map_err(|_| "Mining job registry is unavailable.".to_string())?;
    let cancelled = jobs
        .get(&job_id)
        .ok_or_else(|| "No active mining job matches that ID.".to_string())?;
    cancelled.store(true, Ordering::Relaxed);
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MerkleRequest {
    pub transaction_ids: Vec<String>,
}

#[tauri::command]
pub fn calculate_merkle_root(request: MerkleRequest) -> Result<String, String> {
    crate::domain::merkle::root(&request.transaction_ids)
}
