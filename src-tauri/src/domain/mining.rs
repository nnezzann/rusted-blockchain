//! Domain-level proof-of-work search rules belong here.
//!
//! Future mining should operate on domain block/header inputs and report
//! progress/cancellation through an application-owned boundary. It must not
//! depend directly on Tauri or `wgpu`; CPU/GPU execution selection is
//! infrastructure, not a consensus rule. No mining behavior is present.
