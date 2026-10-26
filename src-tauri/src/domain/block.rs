//! Block and header data types belong here.
//!
//! A future block should own its header and transactions and expose no UI or
//! Tauri concerns. Header serialization and identifiers should use
//! [`super::hash`], while transaction commitments should use [`super::merkle`].
//! No block model or rules are implemented yet.
