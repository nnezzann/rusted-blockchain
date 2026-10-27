//! Use cases for inspecting block headers and validating a local header chain.

use crate::domain::{
    block::{BlockHeader, EASY_LEARNING_BITS, ZERO_HASH},
    chain::{self, ChainValidation},
    mining,
    validation::{self, HeaderInspection},
};

pub fn inspect(header: &BlockHeader) -> Result<HeaderInspection, String> {
    validation::inspect_header(header)
}

pub fn validate_chain(headers: &[BlockHeader]) -> ChainValidation {
    chain::validate(headers)
}

pub fn create_demo_chain() -> Result<Vec<BlockHeader>, String> {
    let mut headers = Vec::with_capacity(3);
    let mut previous_hash = ZERO_HASH.to_string();
    for height in 0..3u32 {
        let header = BlockHeader {
            version: 1,
            previous_hash,
            merkle_root: ZERO_HASH.into(),
            timestamp: 1_700_000_000 + height,
            bits: EASY_LEARNING_BITS,
            nonce: 0,
        };
        let result = mining::mine(header, 100_000, || false, |_| {})?;
        previous_hash = result.hash;
        headers.push(result.header);
    }
    Ok(headers)
}
