//! Serializable domain snapshot types for one isolated learning experiment.
//!
//! Future snapshots can aggregate blocks, transactions, and local chain state.
//! Persistence belongs in [`crate::persistence`], while use cases that open,
//! reset, or update snapshots belong in [`crate::application`]. No experiment
//! model is implemented yet.
