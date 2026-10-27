//! Merkle root construction over displayed transaction identifiers.
//!
//! IDs are decoded to wire-order bytes; each pair is concatenated and
//! double-hashed. An unpaired final node is duplicated, matching the learning
//! model documented in BUILDING.md.

use super::hash::{display_hash, parse_display_hash, sha256d};

pub fn root(transaction_ids: &[String]) -> Result<String, String> {
    if transaction_ids.is_empty() {
        return Ok(super::block::ZERO_HASH.to_string());
    }
    let mut level = transaction_ids
        .iter()
        .map(|id| parse_display_hash(id))
        .collect::<Result<Vec<_>, _>>()?;
    while level.len() > 1 {
        let mut next = Vec::with_capacity(level.len().div_ceil(2));
        for pair in level.chunks(2) {
            let right = pair.get(1).unwrap_or(&pair[0]);
            let mut joined = [0; 64];
            joined[..32].copy_from_slice(&pair[0]);
            joined[32..].copy_from_slice(right);
            next.push(sha256d(&joined));
        }
        level = next;
    }
    Ok(display_hash(&level[0]))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_tree_uses_zero_hash() {
        assert_eq!(root(&[]).unwrap(), super::super::block::ZERO_HASH);
    }

    #[test]
    fn one_leaf_is_its_own_root() {
        let id = "11".repeat(32);
        assert_eq!(root(std::slice::from_ref(&id)).unwrap(), id);
    }

    #[test]
    fn duplicates_odd_final_leaf() {
        let ids = ["00", "01", "02"].map(|byte| format!("{byte}{}", "00".repeat(31)));
        let ids = ids.to_vec();
        let root_three = root(&ids).unwrap();
        let root_four = root(&[
            ids[0].clone(),
            ids[1].clone(),
            ids[2].clone(),
            ids[2].clone(),
        ])
        .unwrap();
        assert_eq!(root_three, root_four);
    }
}
