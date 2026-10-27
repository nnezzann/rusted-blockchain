//! Rust-owned persistence infrastructure for local application state.
//!
//! SQLite repositories store isolated snapshots from
//! [`crate::domain::experiment`] under the Tauri app-data directory. Keep
//! database concerns behind repository operations so domain and application
//! rules remain independent of SQL.

pub mod migrations;
pub mod repository;
