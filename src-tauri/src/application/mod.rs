//! Use cases that coordinate domain rules with infrastructure.
//!
//! This layer receives requests from Tauri commands, calls the pure domain
//! rules, uses persistence through a narrow boundary, and returns typed results
//! for IPC serialization. Keep policy here, not in command handlers or React.

pub mod blocks;
pub mod experiments;
pub mod mining;
pub mod transactions;
