//! Use cases for editing, inspecting, and validating a block experiment.
//!
//! Future command handlers will call these use cases rather than assembling
//! domain state themselves. This module will coordinate [`crate::domain::block`]
//! and [`crate::domain::validation`] and return typed application results. No
//! block use cases exist yet.
