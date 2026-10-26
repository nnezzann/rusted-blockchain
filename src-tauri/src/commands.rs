//! Tauri IPC registration and boundary for application use cases.
//!
//! At present, infrastructure commands are registered directly in
//! [`crate::run`] and implemented beside their services in `compute.rs`,
//! `system.rs`, and `window.rs`. When blockchain use cases are added, define
//! thin commands here that deserialize requests, call [`crate::application`],
//! and serialize typed results/errors. Keep validation and domain decisions
//! out of this boundary. This module intentionally declares no commands yet.
