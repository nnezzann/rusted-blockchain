//! Typed Tauri IPC commands for the learning blockchain domain.
//!
//! Commands validate transport-level constraints, delegate to
//! [`crate::application`], and serialize typed responses. They do not duplicate
//! hash, target, mining, transaction, or chain rules. Persistence operations
//! delegate to the Rust-owned SQLite repository.

use std::{
    collections::HashMap,
    sync::{
        Arc, Mutex, MutexGuard,
        atomic::{AtomicBool, Ordering},
    },
};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{State, ipc::Channel};

use crate::{
    application::{blocks, experiments, mining, transactions},
    domain::{
        block::BlockHeader,
        chain::ChainValidation,
        experiment::Experiment,
        hash::{display_hash, sha256, sha256d},
        mining::{MAX_MINING_ATTEMPTS, MiningProgress, MiningResult},
        peer::{PeerComparison, PeerNetwork, PeerView, PropagationResult},
        validation::HeaderInspection,
    },
    persistence::repository::ExperimentRepository,
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

pub struct PeerRuntime {
    network: Mutex<PeerNetwork>,
}

impl PeerRuntime {
    pub fn new(network: PeerNetwork) -> Self {
        Self {
            network: Mutex::new(network),
        }
    }

    fn lock(&self) -> Result<MutexGuard<'_, PeerNetwork>, String> {
        self.network
            .lock()
            .map_err(|_| "Peer simulation state is unavailable.".to_string())
    }
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
pub fn inspect_data_block(
    header: BlockHeader,
    data: String,
    leading_zero_nibbles: u8,
) -> Result<HeaderInspection, String> {
    blocks::inspect_data(&header, &data, leading_zero_nibbles)
}

#[tauri::command]
pub fn commit_block_data(header: BlockHeader, data: String) -> Result<BlockHeader, String> {
    blocks::commit_data(&header, &data)
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
pub async fn mine_data_block(
    runtime: State<'_, MiningRuntime>,
    job_id: String,
    header: BlockHeader,
    data: String,
    leading_zero_nibbles: u8,
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
    if leading_zero_nibbles > crate::domain::mining::MAX_LEADING_ZERO_NIBBLES {
        return Err(format!(
            "Leading-zero difficulty must be between 0 and {} hexadecimal zeroes.",
            crate::domain::mining::MAX_LEADING_ZERO_NIBBLES
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
        mining::mine_header_with_data(
            header,
            &data,
            leading_zero_nibbles,
            max_attempts,
            worker_cancelled.clone(),
            |progress| {
                if on_progress.send(progress).is_err() {
                    worker_cancelled.store(true, Ordering::Relaxed);
                }
            },
        )
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

#[tauri::command]
pub fn run_transaction_demo(
    amount: u64,
    fee: u64,
) -> Result<transactions::TransactionDemo, String> {
    transactions::run_demo(amount, fee)
}

#[tauri::command]
pub fn list_experiments(
    repository: State<'_, ExperimentRepository>,
) -> Result<Vec<Experiment>, String> {
    experiments::list(&repository)
}

#[tauri::command]
pub fn create_experiment(
    repository: State<'_, ExperimentRepository>,
    name: String,
    kind: String,
    description: String,
    data: Option<Value>,
) -> Result<Experiment, String> {
    experiments::create(
        &repository,
        name,
        kind,
        description,
        data.unwrap_or_else(|| serde_json::json!({})),
    )
}

#[tauri::command]
pub fn update_experiment(
    repository: State<'_, ExperimentRepository>,
    id: String,
    name: String,
    kind: String,
    description: String,
    data: Value,
) -> Result<Experiment, String> {
    experiments::update(&repository, id, name, kind, description, data)
}

#[tauri::command]
pub fn delete_experiment(
    repository: State<'_, ExperimentRepository>,
    id: String,
) -> Result<bool, String> {
    experiments::delete(&repository, &id)
}

#[tauri::command]
pub fn list_peers(runtime: State<'_, PeerRuntime>) -> Result<Vec<PeerView>, String> {
    runtime.lock()?.views()
}

#[tauri::command]
pub fn create_peer(
    runtime: State<'_, PeerRuntime>,
    name: String,
    copy_from_id: Option<String>,
) -> Result<PeerView, String> {
    let mut network = runtime.lock()?;
    let peer = network.create(name, copy_from_id.as_deref())?;
    network.view(&peer.id)
}

#[tauri::command]
pub fn remove_peer(
    runtime: State<'_, PeerRuntime>,
    peer_id: String,
) -> Result<Vec<PeerView>, String> {
    let mut network = runtime.lock()?;
    network.remove(&peer_id)?;
    network.views()
}

#[tauri::command]
pub fn mine_peer_block(
    runtime: State<'_, PeerRuntime>,
    peer_id: String,
    leading_zero_nibbles: u8,
) -> Result<PeerView, String> {
    let mut network = runtime.lock()?;
    network.mine_next(&peer_id, leading_zero_nibbles)?;
    network.view(&peer_id)
}

#[tauri::command]
pub fn edit_peer_block(
    runtime: State<'_, PeerRuntime>,
    peer_id: String,
    height: usize,
    header: BlockHeader,
    data: String,
) -> Result<PeerView, String> {
    runtime.lock()?.edit_block(&peer_id, height, header, data)
}

#[tauri::command]
pub fn remine_peer_chain(
    runtime: State<'_, PeerRuntime>,
    peer_id: String,
    height: usize,
    leading_zero_nibbles: u8,
) -> Result<PeerView, String> {
    runtime
        .lock()?
        .remine_from(&peer_id, height, leading_zero_nibbles)
}

#[tauri::command]
pub fn compare_peer_chains(
    runtime: State<'_, PeerRuntime>,
    left_id: String,
    right_id: String,
) -> Result<PeerComparison, String> {
    runtime.lock()?.compare(&left_id, &right_id)
}

#[tauri::command]
pub fn propagate_peer_chain(
    runtime: State<'_, PeerRuntime>,
    source_id: String,
    destination_id: String,
) -> Result<PropagationResult, String> {
    runtime.lock()?.propagate(&source_id, &destination_id)
}
