//! Serializable record for one isolated learning experiment.
//!
//! The snapshot payload is versioned by the exported format at the application
//! boundary. Database representation and migrations belong in persistence.

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Experiment {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub description: String,
    pub data: Value,
    pub created_at: i64,
    pub updated_at: i64,
}
