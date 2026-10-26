//! Repository interfaces and their storage-backed implementations belong here.
//!
//! Future repository methods will persist and load typed experiment snapshots
//! without exposing SQL details to [`crate::application`]. Keep writes
//! transactional and surface I/O/database failures. No storage operations are
//! implemented yet.
