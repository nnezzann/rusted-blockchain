//! Deterministic validation for a sequence of linked block headers.
//!
//! This is an in-process educational chain only; it performs no peer or network
//! activity. Each header's proof of work and parent link are independently
//! reported so learners can see cascading invalidation.

use serde::Serialize;

use super::{block::BlockHeader, validation::inspect_header};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChainEntry {
    pub height: usize,
    pub hash: Option<String>,
    pub valid: bool,
    pub reasons: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChainValidation {
    pub valid: bool,
    pub blocks: Vec<ChainEntry>,
}

pub fn validate(headers: &[BlockHeader]) -> ChainValidation {
    let mut previous_hash = super::block::ZERO_HASH.to_string();
    let mut all_valid = true;
    let blocks = headers
        .iter()
        .enumerate()
        .map(|(height, header)| {
            let mut reasons = Vec::new();
            if header.previous_hash != previous_hash {
                reasons.push("Previous hash does not match the preceding block.".into());
            }
            let hash = match inspect_header(header) {
                Ok(inspection) => {
                    if !inspection.meets_target {
                        reasons.push("Header hash is above the proof-of-work target.".into());
                    }
                    Some(inspection.hash)
                }
                Err(error) => {
                    reasons.push(error);
                    None
                }
            };
            if let Some(hash_value) = &hash {
                previous_hash = hash_value.clone();
            }
            let valid = reasons.is_empty();
            all_valid &= valid;
            ChainEntry {
                height,
                hash,
                valid,
                reasons,
            }
        })
        .collect();
    ChainValidation {
        valid: all_valid,
        blocks,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{block::EASY_LEARNING_BITS, mining};

    fn make_header(previous_hash: String, timestamp: u32) -> BlockHeader {
        BlockHeader {
            version: 1,
            previous_hash,
            merkle_root: super::super::block::ZERO_HASH.into(),
            timestamp,
            bits: EASY_LEARNING_BITS,
            nonce: 0,
        }
    }

    #[test]
    fn validates_genesis_and_parent_hash_links() {
        let genesis = mining::mine(
            make_header(super::super::block::ZERO_HASH.into(), 1_700_000_000),
            100,
            || false,
            |_| {},
        )
        .unwrap();
        let child = mining::mine(
            make_header(genesis.hash, 1_700_000_001),
            100,
            || false,
            |_| {},
        )
        .unwrap();
        let result = validate(&[genesis.header, child.header]);
        assert!(result.valid);
        assert_eq!(result.blocks.len(), 2);
    }

    #[test]
    fn changed_parent_invalidates_its_linked_descendant() {
        let genesis = mining::mine(
            make_header(super::super::block::ZERO_HASH.into(), 1_700_000_000),
            100,
            || false,
            |_| {},
        )
        .unwrap();
        let child = mining::mine(
            make_header(genesis.hash, 1_700_000_001),
            100,
            || false,
            |_| {},
        )
        .unwrap();
        let mut changed_genesis = genesis.header;
        changed_genesis.timestamp += 1;
        let result = validate(&[changed_genesis, child.header]);
        assert!(!result.valid);
        assert!(!result.blocks[0].valid);
        assert!(!result.blocks[1].valid);
        assert!(
            result.blocks[1]
                .reasons
                .iter()
                .any(|reason| reason.contains("Previous hash"))
        );
    }
}
