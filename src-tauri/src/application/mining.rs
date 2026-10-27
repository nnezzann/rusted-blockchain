//! Application orchestration for bounded, cancellable block-header mining.
//!
//! The Tauri command owns the job registry/channel, while the pure mining loop
//! in the domain owns nonce search and target decisions. The generic
//! `compute.rs` probe remains unrelated to hashing or mining.

use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

use crate::domain::{
    block::{self, BlockHeader},
    mining::{self, MiningProgress, MiningResult},
};

pub fn mine_header(
    header: BlockHeader,
    max_attempts: u64,
    cancelled: Arc<AtomicBool>,
    on_progress: impl FnMut(MiningProgress),
) -> Result<MiningResult, String> {
    mining::mine(
        header,
        max_attempts,
        || cancelled.load(Ordering::Relaxed),
        on_progress,
    )
}

pub fn mine_header_with_data(
    header: BlockHeader,
    data: &str,
    leading_zero_nibbles: u8,
    max_attempts: u64,
    cancelled: Arc<AtomicBool>,
    on_progress: impl FnMut(MiningProgress),
) -> Result<MiningResult, String> {
    let committed = block::commit_data(&header, data)?;
    mining::mine_with_leading_zeros(
        committed,
        max_attempts,
        leading_zero_nibbles,
        || cancelled.load(Ordering::Relaxed),
        on_progress,
    )
}
