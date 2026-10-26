//! Pure blockchain concepts and rules, to be implemented as a learning exercise.
//!
//! This layer will own canonical data types and deterministic rules. It must
//! not depend on Tauri commands, the webview, SQLite, or the GPU runtime.
//! Application use cases will call into these modules; infrastructure and UI
//! should consume their results rather than reproduce their decisions.
//!
//! The submodules below are intentionally empty. Add one concept at a time and
//! accompany its implementation with ordinary Rust unit tests and fixed test
//! vectors where relevant.

pub mod block;
pub mod chain;
pub mod experiment;
pub mod hash;
pub mod merkle;
pub mod mining;
pub mod target;
pub mod transaction;
pub mod validation;
