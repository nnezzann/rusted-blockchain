//! Compact proof-of-work target decoding and numeric hash comparison.
//!
//! Targets are held as 32-byte big-endian integers. Display hashes use the
//! conventional reversed digest representation, so a lexicographic byte
//! comparison is equivalent to an unsigned integer comparison.

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Target {
    pub bytes: [u8; 32],
}

impl Target {
    pub fn from_compact(bits: u32) -> Result<Self, String> {
        let exponent = (bits >> 24) as usize;
        let mantissa = bits & 0x007f_ffff;
        let negative = bits & 0x0080_0000 != 0 && mantissa != 0;
        if negative {
            return Err("Compact target must not be negative.".into());
        }
        if mantissa == 0 {
            return Err("Compact target must be greater than zero.".into());
        }

        let overflow = mantissa != 0
            && (exponent > 34
                || (mantissa > 0xff && exponent > 33)
                || (mantissa > 0xffff && exponent > 32));
        if overflow {
            return Err("Compact target exceeds the 256-bit range.".into());
        }

        let mut bytes = [0; 32];
        if exponent <= 3 {
            let value = mantissa >> (8 * (3 - exponent));
            bytes[28..].copy_from_slice(&value.to_be_bytes());
        } else {
            let mantissa_bytes = mantissa.to_be_bytes();
            for (offset, byte) in mantissa_bytes[1..].iter().enumerate() {
                if *byte == 0 {
                    continue;
                }
                let position = 32isize - exponent as isize + offset as isize;
                if !(0..32).contains(&position) {
                    return Err("Compact target exceeds the 256-bit range.".into());
                }
                bytes[position as usize] = *byte;
            }
        }
        let mut maximum = [0; 32];
        maximum[..3].copy_from_slice(&[0x7f, 0xff, 0xff]);
        if bytes > maximum {
            return Err("Target is easier than Chain-V's maximum learning target.".into());
        }
        Ok(Self { bytes })
    }

    pub fn meets(&self, displayed_hash: &str) -> Result<bool, String> {
        if displayed_hash.len() != 64 {
            return Err("A displayed hash must contain exactly 64 hexadecimal characters.".into());
        }
        let mut hash = [0; 32];
        let (pairs, _) = displayed_hash.as_bytes().as_chunks::<2>();
        for (output, pair) in hash.iter_mut().zip(pairs) {
            *output = (hex_nibble(pair[0])
                .ok_or_else(|| "Hash must contain only hexadecimal characters.".to_string())?
                << 4)
                | hex_nibble(pair[1])
                    .ok_or_else(|| "Hash must contain only hexadecimal characters.".to_string())?;
        }
        Ok(hash <= self.bytes)
    }
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
    fn decodes_the_easy_learning_target() {
        let target = Target::from_compact(0x207f_ffff).unwrap();
        assert_eq!(target.bytes[0], 0x7f);
        assert_eq!(&target.bytes[..3], &[0x7f, 0xff, 0xff]);
        assert!(target.bytes[3..].iter().all(|byte| *byte == 0));
        assert!(Target::from_compact(0x207f_fffe).is_ok());
        assert!(Target::from_compact(0x2100_ffff).is_err());
        assert_eq!(Target::from_compact(0x0101_0000).unwrap().bytes[31], 1);
    }

    #[test]
    fn rejects_zero_negative_and_overflow_targets() {
        assert!(Target::from_compact(0x0000_0000).is_err());
        assert!(Target::from_compact(0x1d80_ffff).is_err());
        assert!(Target::from_compact(0x2300_ffff).is_err());
    }

    #[test]
    fn compares_hashes_as_unsigned_256_bit_values() {
        let target = Target { bytes: [0x10; 32] };
        assert!(target.meets(&"0f".repeat(32)).unwrap());
        assert!(target.meets(&"10".repeat(32)).unwrap());
        assert!(!target.meets(&"11".repeat(32)).unwrap());
    }

    #[test]
    fn rejects_non_ascii_hashes_without_panicking() {
        let target = Target { bytes: [0xff; 32] };
        assert!(target.meets(&format!("{}é", "0".repeat(62))).is_err());
    }
}
