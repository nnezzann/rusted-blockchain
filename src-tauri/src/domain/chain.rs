//! A single local chain and its cumulative-work metadata belong here.
//!
//! Future chain validation should be deterministic and independent of peers or
//! network access. Competing simulated chains can build on these types later;
//! this module must not implement real P2P behavior. No chain model is present.
