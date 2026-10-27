//! Bounded proof-of-work search over canonical serialized block headers.
//!
//! Progress, cancellation, and thread coordination are supplied by the
//! application/command boundary. The search itself is pure domain work and
//! deliberately has no dependency on Tauri or `wgpu`.

use std::time::Instant;

use serde::Serialize;

use super::{block::BlockHeader, hash::sha256d, target::Target};

pub const MAX_MINING_ATTEMPTS: u64 = 10_000_000;
pub const PROGRESS_INTERVAL: u64 = 25_000;
pub const MAX_LEADING_ZERO_NIBBLES: u8 = 5;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MiningProgress {
    pub attempts: u64,
    pub hash_rate: f64,
    pub elapsed_milliseconds: f64,
    pub current_nonce: u32,
    pub current_hash: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MiningResult {
    pub header: BlockHeader,
    pub hash: String,
    pub target: String,
    pub attempts: u64,
    pub elapsed_milliseconds: f64,
}

pub fn mine(
    header: BlockHeader,
    max_attempts: u64,
    is_cancelled: impl FnMut() -> bool,
    on_progress: impl FnMut(MiningProgress),
) -> Result<MiningResult, String> {
    mine_internal(header, max_attempts, None, is_cancelled, on_progress)
}

pub fn mine_with_leading_zeros(
    header: BlockHeader,
    max_attempts: u64,
    leading_zero_nibbles: u8,
    is_cancelled: impl FnMut() -> bool,
    on_progress: impl FnMut(MiningProgress),
) -> Result<MiningResult, String> {
    if leading_zero_nibbles > MAX_LEADING_ZERO_NIBBLES {
        return Err(format!(
            "Leading-zero difficulty must be between 0 and {MAX_LEADING_ZERO_NIBBLES} hexadecimal zeroes."
        ));
    }
    mine_internal(
        header,
        max_attempts,
        Some(leading_zero_nibbles),
        is_cancelled,
        on_progress,
    )
}

fn mine_internal(
    mut header: BlockHeader,
    max_attempts: u64,
    leading_zero_nibbles: Option<u8>,
    mut is_cancelled: impl FnMut() -> bool,
    mut on_progress: impl FnMut(MiningProgress),
) -> Result<MiningResult, String> {
    if max_attempts == 0 || max_attempts > MAX_MINING_ATTEMPTS {
        return Err(format!(
            "Mining attempts must be between 1 and {MAX_MINING_ATTEMPTS}."
        ));
    }
    let target = Target::from_compact(header.bits)?;
    let target_hex = super::hash::hex(&target.bytes);
    let started = Instant::now();
    let initial_nonce = header.nonce;

    for attempt in 1..=max_attempts {
        if is_cancelled() {
            return Err("Mining was cancelled.".into());
        }
        header.nonce = initial_nonce.wrapping_add((attempt - 1) as u32);
        let hash_bytes = sha256d(&header.serialize()?);
        let hash = super::hash::display_hash(&hash_bytes);
        if hash.as_bytes() <= target_hex.as_bytes()
            && leading_zero_nibbles.is_none_or(|zeroes| {
                hash.as_bytes()
                    .get(..usize::from(zeroes))
                    .is_some_and(|prefix| prefix.iter().all(|digit| *digit == b'0'))
            })
        {
            return Ok(MiningResult {
                header,
                hash,
                target: target_hex,
                attempts: attempt,
                elapsed_milliseconds: started.elapsed().as_secs_f64() * 1000.0,
            });
        }
        if attempt % PROGRESS_INTERVAL == 0 {
            let elapsed = started.elapsed();
            on_progress(MiningProgress {
                attempts: attempt,
                hash_rate: attempt as f64 / elapsed.as_secs_f64().max(0.001),
                elapsed_milliseconds: elapsed.as_secs_f64() * 1000.0,
                current_nonce: header.nonce,
                current_hash: hash,
            });
        }
    }
    Err(format!(
        "No valid nonce found in {max_attempts} attempts. Try a higher attempt limit or an easier target."
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::block::{EASY_LEARNING_BITS, ZERO_HASH};

    fn header() -> BlockHeader {
        BlockHeader {
            version: 1,
            previous_hash: ZERO_HASH.into(),
            merkle_root: ZERO_HASH.into(),
            timestamp: 1_700_000_000,
            bits: EASY_LEARNING_BITS,
            nonce: 0,
        }
    }

    #[test]
    fn finds_a_nonce_that_meets_the_numeric_target() {
        let result = mine(header(), 100, || false, |_| {}).unwrap();
        let target = Target::from_compact(EASY_LEARNING_BITS).unwrap();
        assert!(target.meets(&result.hash).unwrap());
        assert_eq!(result.header.nonce + 1, result.attempts as u32);
    }

    #[test]
    fn respects_attempt_limit_and_cancellation() {
        assert!(mine(header(), 0, || false, |_| {}).is_err());
        let mut impossible_header = header();
        impossible_header.bits = 0x0101_0000;
        assert!(mine(impossible_header, 1, || false, |_| {}).is_err());
        assert!(
            mine(header(), 100, || true, |_| {})
                .unwrap_err()
                .contains("cancelled")
        );
    }

    #[test]
    fn mines_for_a_configurable_display_hash_zero_prefix() {
        let result = mine_with_leading_zeros(header(), 10_000, 2, || false, |_| {}).unwrap();
        assert!(result.hash.starts_with("00"));
        assert!(
            Target::from_compact(EASY_LEARNING_BITS)
                .unwrap()
                .meets(&result.hash)
                .unwrap()
        );
        assert!(mine_with_leading_zeros(header(), 10, 9, || false, |_| {}).is_err());
    }
}
