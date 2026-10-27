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
    pub merkle_root: String,
    pub leading_zeroes_required: Option<u8>,
    pub meets_leading_zeroes: Option<bool>,
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
        merkle_root: header.merkle_root.clone(),
        leading_zeroes_required: None,
        meets_leading_zeroes: None,
    })
}

pub fn inspect_header_with_leading_zeroes(
    header: &BlockHeader,
    leading_zeroes: u8,
) -> Result<HeaderInspection, String> {
    if leading_zeroes > super::mining::MAX_LEADING_ZERO_NIBBLES {
        return Err(format!(
            "Leading-zero difficulty must be between 0 and {} hexadecimal zeroes.",
            super::mining::MAX_LEADING_ZERO_NIBBLES
        ));
    }
    let mut inspection = inspect_header(header)?;
    inspection.leading_zeroes_required = Some(leading_zeroes);
    inspection.meets_leading_zeroes = Some(
        inspection
            .hash
            .as_bytes()
            .get(..usize::from(leading_zeroes))
            .is_some_and(|prefix| prefix.iter().all(|digit| *digit == b'0')),
    );
    Ok(inspection)
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

    #[test]
    fn inspection_reports_configured_zero_prefix_requirements() {
        let header = BlockHeader {
            version: 1,
            previous_hash: super::super::block::ZERO_HASH.into(),
            merkle_root: super::super::block::ZERO_HASH.into(),
            timestamp: 1_700_000_000,
            bits: EASY_LEARNING_BITS,
            nonce: 0,
        };
        let inspected = inspect_header_with_leading_zeroes(&header, 2).unwrap();
        assert_eq!(inspected.leading_zeroes_required, Some(2));
        assert_eq!(
            inspected.meets_leading_zeroes,
            Some(inspected.hash.starts_with("00"))
        );
        assert!(inspect_header_with_leading_zeroes(&header, 6).is_err());
    }
}
