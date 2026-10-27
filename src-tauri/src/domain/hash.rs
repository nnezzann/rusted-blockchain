//! SHA-256 primitives and display encoding for domain data.
//!
//! Block headers and Merkle nodes call these pure functions. Hash bytes are
//! returned in SHA-256 digest order; Bitcoin-style displayed hashes reverse
//! those bytes. Callers must choose explicitly which representation they need.

use sha2::{Digest, Sha256};

pub fn sha256(bytes: &[u8]) -> [u8; 32] {
    Sha256::digest(bytes).into()
}

pub fn sha256d(bytes: &[u8]) -> [u8; 32] {
    sha256(&sha256(bytes))
}

pub fn display_hash(hash: &[u8; 32]) -> String {
    hex(&hash.iter().rev().copied().collect::<Vec<_>>())
}

pub fn hex(bytes: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(DIGITS[(byte >> 4) as usize] as char);
        output.push(DIGITS[(byte & 0x0f) as usize] as char);
    }
    output
}

pub fn parse_display_hash(value: &str) -> Result<[u8; 32], String> {
    if value.len() != 64 {
        return Err("A hash must contain exactly 64 hexadecimal characters.".into());
    }
    let mut bytes = [0; 32];
    let (pairs, _) = value.as_bytes().as_chunks::<2>();
    for (output, pair) in bytes.iter_mut().zip(pairs) {
        *output = (hex_nibble(pair[0])
            .ok_or_else(|| "A hash may contain only hexadecimal characters.".to_string())?
            << 4)
            | hex_nibble(pair[1])
                .ok_or_else(|| "A hash may contain only hexadecimal characters.".to_string())?;
    }
    bytes.reverse();
    Ok(bytes)
}

fn hex_nibble(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sha256_matches_standard_empty_vector() {
        assert_eq!(
            hex(&sha256(b"")),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn displayed_hash_round_trips_to_internal_byte_order() {
        let digest = sha256d(b"hello");
        let displayed = display_hash(&digest);
        assert_eq!(parse_display_hash(&displayed).unwrap(), digest);
    }

    #[test]
    fn rejects_non_ascii_hashes_without_panicking() {
        assert!(parse_display_hash(&format!("{}é", "0".repeat(62))).is_err());
    }
}
