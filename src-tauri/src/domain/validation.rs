//! Structured validation output for block headers.
//!
//! This first implementation validates serialized header syntax and proof of
//! work. Transaction, reward, and signature checks are not yet in scope and
//! must not be inferred from a valid header.

use serde::Serialize;

use super::{block::BlockHeader, hash::hex, target::Target};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeaderInspection {
    pub hash: String,
    pub serialized_header: String,
    pub target: String,
    pub meets_target: bool,
}

pub fn inspect_header(header: &BlockHeader) -> Result<HeaderInspection, String> {
    let target = Target::from_compact(header.bits)?;
    let hash = header.hash()?;
    let target_hex = hex(&target.bytes);
    let meets_target = target.meets(&hash)?;
    Ok(HeaderInspection {
        hash,
        serialized_header: header.serialized_hex()?,
        target: target_hex,
        meets_target,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{block::EASY_LEARNING_BITS, mining};

    #[test]
    fn inspection_reports_real_hash_serialization_and_pow_state() {
        let header = BlockHeader {
            version: 1,
            previous_hash: super::super::block::ZERO_HASH.into(),
            merkle_root: super::super::block::ZERO_HASH.into(),
            timestamp: 1_700_000_000,
            bits: EASY_LEARNING_BITS,
            nonce: 0,
        };
        let result = mining::mine(header, 100, || false, |_| {}).unwrap();
        let inspected = inspect_header(&result.header).unwrap();
        assert_eq!(inspected.hash, result.hash);
        assert_eq!(inspected.serialized_header.len(), 160);
        assert!(inspected.meets_target);
    }
}
