//! Rust-owned persistence infrastructure for local application state.
//!
//! Future repositories will store validated snapshots from
//! [`crate::domain::experiment`] under the app-data directory exposed by
//! `system.rs`. Keep database concerns behind repository operations so
//! domain and application tests can run without Tauri or SQLite. No database
//! connection, schema, or persistence behavior is implemented yet.

pub mod migrations;
pub mod repository;
