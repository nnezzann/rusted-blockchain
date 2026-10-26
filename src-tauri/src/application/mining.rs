//! Use cases for starting, observing, and cancelling mining jobs.
//!
//! Future orchestration will take domain mining inputs, select an available
//! execution backend, and expose bounded progress/cancellation to Tauri. The
//! existing `compute.rs` probe is generic infrastructure only; it is not
//! a mining implementation or a ready-made consensus hasher.
