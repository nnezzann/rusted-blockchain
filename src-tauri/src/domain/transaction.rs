//! Transaction, input, output, outpoint, and UTXO data types belong here.
//!
//! Future validation belongs in [`super::validation`]; transaction identifiers
//! and commitments should use [`super::hash`] and [`super::merkle`]. Represent
//! amounts as bounded integer units rather than floating point. No transaction
//! behavior is implemented yet.
