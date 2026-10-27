//! Use cases for listing and maintaining isolated saved experiments.

use serde_json::Value;

use crate::{domain::experiment::Experiment, persistence::repository::ExperimentRepository};

pub fn list(repository: &ExperimentRepository) -> Result<Vec<Experiment>, String> {
    repository.list()
}

pub fn create(
    repository: &ExperimentRepository,
    name: String,
    kind: String,
    description: String,
    data: Value,
) -> Result<Experiment, String> {
    repository.create(name, kind, description, data)
}

pub fn update(
    repository: &ExperimentRepository,
    id: String,
    name: String,
    kind: String,
    description: String,
    data: Value,
) -> Result<Experiment, String> {
    repository.update(Experiment {
        id,
        name,
        kind,
        description,
        data,
        created_at: 0,
        updated_at: 0,
    })
}

pub fn delete(repository: &ExperimentRepository, id: &str) -> Result<bool, String> {
    repository.delete(id)
}
