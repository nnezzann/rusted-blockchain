//! Bitcoin-layout block headers and deterministic serialization.
//!
//! A block header is exactly 80 bytes: little-endian scalar fields and the
//! internal (wire-order) previous hash/Merkle root. Hash display order is
//! reversed by [`super::hash`]. This module deliberately does not define a
//! Bitcoin transaction wire format.

use serde::{Deserialize, Serialize};

use super::hash::{display_hash, parse_display_hash, sha256d};

pub const ZERO_HASH: &str = "0000000000000000000000000000000000000000000000000000000000000000";
pub const EASY_LEARNING_BITS: u32 = 0x207f_ffff;
pub const MAX_LEARNING_DATA_BYTES: usize = 64 * 1024;

pub fn commit_data(header: &BlockHeader, data: &str) -> Result<BlockHeader, String> {
    if data.len() > MAX_LEARNING_DATA_BYTES {
        return Err(format!(
            "Block data must not exceed {MAX_LEARNING_DATA_BYTES} UTF-8 bytes."
        ));
    }
    let mut committed = header.clone();
    if !data.is_empty() {
        let data_id = display_hash(&sha256d(data.as_bytes()));
        committed.merkle_root = super::merkle::root(&[committed.merkle_root.clone(), data_id])?;
    }
    Ok(committed)
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BlockHeader {
    pub version: i32,
    pub previous_hash: String,
    pub merkle_root: String,
    pub timestamp: u32,
    pub bits: u32,
    pub nonce: u32,
}

impl BlockHeader {
    pub fn serialize(&self) -> Result<[u8; 80], String> {
        let previous = parse_display_hash(&self.previous_hash)
            .map_err(|error| format!("Previous block hash: {error}"))?;
        let merkle = parse_display_hash(&self.merkle_root)
            .map_err(|error| format!("Merkle root: {error}"))?;
        let mut bytes = [0; 80];
        bytes[0..4].copy_from_slice(&self.version.to_le_bytes());
        bytes[4..36].copy_from_slice(&previous);
        bytes[36..68].copy_from_slice(&merkle);
        bytes[68..72].copy_from_slice(&self.timestamp.to_le_bytes());
        bytes[72..76].copy_from_slice(&self.bits.to_le_bytes());
        bytes[76..80].copy_from_slice(&self.nonce.to_le_bytes());
        Ok(bytes)
    }

    pub fn hash(&self) -> Result<String, String> {
        Ok(display_hash(&sha256d(&self.serialize()?)))
    }

    pub fn serialized_hex(&self) -> Result<String, String> {
        Ok(super::hash::hex(&self.serialize()?))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> BlockHeader {
        BlockHeader {
            version: 1,
            previous_hash: ZERO_HASH.into(),
            merkle_root: ZERO_HASH.into(),
            timestamp: 1_700_000_000,
            bits: EASY_LEARNING_BITS,
            nonce: 42,
        }
    }

    #[test]
    fn serializes_header_to_exactly_80_bytes_in_wire_order() {
        let header = sample();
        let bytes = header.serialize().unwrap();
        assert_eq!(bytes.len(), 80);
        assert_eq!(&bytes[0..4], &[1, 0, 0, 0]);
        assert_eq!(&bytes[68..72], &1_700_000_000u32.to_le_bytes());
        assert_eq!(&bytes[72..76], &EASY_LEARNING_BITS.to_le_bytes());
        assert_eq!(&bytes[76..80], &42u32.to_le_bytes());
    }

    #[test]
    fn hashes_the_bitcoin_genesis_header_using_display_byte_order() {
        let header = BlockHeader {
            version: 1,
            previous_hash: ZERO_HASH.into(),
            merkle_root: "4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b".into(),
            timestamp: 1_231_006_505,
            bits: 0x1d00_ffff,
            nonce: 2_083_236_893,
        };
        assert_eq!(
            header.hash().unwrap(),
            "000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f"
        );
    }

    #[test]
    fn rejects_malformed_hash_fields() {
        let mut header = sample();
        header.previous_hash = "abc".into();
        assert!(
            header
                .serialize()
                .unwrap_err()
                .contains("Previous block hash")
        );
    }

    #[test]
    fn arbitrary_payload_is_committed_through_the_merkle_root() {
        let header = sample();
        let first = commit_data(&header, "hello").unwrap();
        let same = commit_data(&header, "hello").unwrap();
        let changed = commit_data(&header, "hello!").unwrap();

        assert_eq!(first, same);
        assert_ne!(first.merkle_root, changed.merkle_root);
        assert_eq!(header.merkle_root, ZERO_HASH);
    }

    #[test]
    fn empty_payload_preserves_the_existing_merkle_root() {
        let header = sample();
        assert_eq!(commit_data(&header, "").unwrap(), header);
    }

    #[test]
    fn rejects_payloads_over_the_learning_limit() {
        let header = sample();
        let oversized = "x".repeat(MAX_LEARNING_DATA_BYTES + 1);
        assert!(commit_data(&header, &oversized).is_err());
    }
}
