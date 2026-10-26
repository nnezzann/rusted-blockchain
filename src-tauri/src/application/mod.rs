//! Use cases that coordinate domain rules with infrastructure.
//!
//! This layer will receive validated requests from Tauri commands, call the
//! pure [`crate::domain`] rules, use persistence through a narrow boundary, and
//! return typed results for IPC serialization. Keep policy here; do not put
//! blockchain rules in command handlers or React. These modules are scaffolds.

pub mod blocks;
pub mod experiments;
pub mod mining;
