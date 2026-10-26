//! Merkle tree construction and proof data belong here.
//!
//! Future block construction and validation will use this module to derive and
//! check transaction commitments. It should use the canonical hash interface
//! from [`super::hash`] and define odd-leaf behavior explicitly. No Merkle
//! algorithm is implemented yet.
