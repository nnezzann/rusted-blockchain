//! Pure blockchain concepts and rules owned by the Rust learning model.
//!
//! This layer owns canonical data types and deterministic rules. It must not
//! depend on Tauri commands, the webview, SQLite, or the GPU runtime.
//! Application use cases will call into these modules; infrastructure and UI
//! should consume their results rather than reproduce their decisions.
//!
//! Protocol simplifications are intentional and are not Bitcoin consensus.

pub mod block;
pub mod chain;
pub mod experiment;
pub mod hash;
pub mod merkle;
pub mod mining;
pub mod peer;
pub mod target;
pub mod transaction;
pub mod validation;
