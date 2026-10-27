//! SQLite repository for isolated experiment metadata and JSON snapshots.

use std::{
    path::Path,
    sync::{Mutex, MutexGuard},
    time::{SystemTime, UNIX_EPOCH},
};

use rusqlite::{Connection, OptionalExtension, params};
use serde_json::Value;

use crate::domain::experiment::Experiment;

const MAX_SNAPSHOT_BYTES: usize = 1_048_576;

pub struct ExperimentRepository {
    connection: Mutex<Connection>,
}

impl ExperimentRepository {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, String> {
        let mut connection = Connection::open(path)
            .map_err(|error| format!("Could not open experiment database: {error}"))?;
        migrations::apply(&mut connection)?;
        Ok(Self {
            connection: Mutex::new(connection),
        })
    }

    pub fn in_memory() -> Result<Self, String> {
        let mut connection = Connection::open_in_memory()
            .map_err(|error| format!("Could not open in-memory experiment database: {error}"))?;
        migrations::apply(&mut connection)?;
        Ok(Self {
            connection: Mutex::new(connection),
        })
    }

    fn lock(&self) -> Result<MutexGuard<'_, Connection>, String> {
        self.connection
            .lock()
            .map_err(|_| "Experiment database lock is unavailable.".to_string())
    }

    pub fn list(&self) -> Result<Vec<Experiment>, String> {
        let connection = self.lock()?;
        let mut statement = connection
            .prepare(
                "SELECT id, name, kind, description, snapshot_json, created_at, updated_at
                 FROM experiments ORDER BY updated_at DESC, id ASC",
            )
            .map_err(|error| format!("Could not query experiments: {error}"))?;
        let rows = statement
            .query_map([], decode_experiment)
            .map_err(|error| format!("Could not read experiments: {error}"))?;
        rows.map(|row| row.map_err(|error| format!("Could not decode experiment record: {error}")))
            .collect()
    }

    pub fn get(&self, id: &str) -> Result<Option<Experiment>, String> {
        let connection = self.lock()?;
        connection
            .query_row(
                "SELECT id, name, kind, description, snapshot_json, created_at, updated_at
                 FROM experiments WHERE id = ?1",
                [id],
                decode_experiment,
            )
            .optional()
            .map_err(|error| format!("Could not load experiment: {error}"))
    }

    pub fn create(
        &self,
        name: String,
        kind: String,
        description: String,
        data: Value,
    ) -> Result<Experiment, String> {
        let now = now_millis()?;
        let experiment = Experiment {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            kind,
            description,
            data,
            created_at: now,
            updated_at: now,
        };
        let snapshot = validate_and_encode(&experiment)?;
        self.lock()?
            .execute(
                "INSERT INTO experiments (id, name, kind, description, snapshot_json, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    experiment.id,
                    experiment.name,
                    experiment.kind,
                    experiment.description,
                    snapshot,
                    experiment.created_at,
                    experiment.updated_at
                ],
            )
            .map_err(|error| format!("Could not create experiment: {error}"))?;
        Ok(experiment)
    }

    pub fn update(&self, experiment: Experiment) -> Result<Experiment, String> {
        let snapshot = validate_and_encode(&experiment)?;
        let now = now_millis()?;
        let changed = self
            .lock()?
            .execute(
                "UPDATE experiments
                 SET name = ?2, kind = ?3, description = ?4, snapshot_json = ?5, updated_at = ?6
                 WHERE id = ?1",
                params![
                    experiment.id,
                    experiment.name,
                    experiment.kind,
                    experiment.description,
                    snapshot,
                    now
                ],
            )
            .map_err(|error| format!("Could not update experiment: {error}"))?;
        if changed == 0 {
            return Err("Experiment no longer exists.".into());
        }
        self.get(&experiment.id)?
            .ok_or_else(|| "Updated experiment could not be reloaded.".to_string())
    }

    pub fn delete(&self, id: &str) -> Result<bool, String> {
        self.lock()?
            .execute("DELETE FROM experiments WHERE id = ?1", [id])
            .map(|changed| changed != 0)
            .map_err(|error| format!("Could not delete experiment: {error}"))
    }
}

fn decode_experiment(row: &rusqlite::Row<'_>) -> rusqlite::Result<Experiment> {
    let snapshot: String = row.get(4)?;
    let data = serde_json::from_str(&snapshot).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(4, rusqlite::types::Type::Text, Box::new(error))
    })?;
    Ok(Experiment {
        id: row.get(0)?,
        name: row.get(1)?,
        kind: row.get(2)?,
        description: row.get(3)?,
        data,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

fn validate_and_encode(experiment: &Experiment) -> Result<String, String> {
    if experiment.id.is_empty() || experiment.id.len() > 64 {
        return Err("Experiment ID must contain between 1 and 64 characters.".into());
    }
    if experiment.name.trim().is_empty() || experiment.name.chars().count() > 80 {
        return Err("Experiment name must contain 1 to 80 characters.".into());
    }
    if experiment.kind.chars().count() > 80 || experiment.description.chars().count() > 2_000 {
        return Err("Experiment kind or description exceeds its supported length.".into());
    }
    let snapshot = serde_json::to_string(&experiment.data)
        .map_err(|error| format!("Could not encode experiment snapshot: {error}"))?;
    if snapshot.len() > MAX_SNAPSHOT_BYTES {
        return Err(format!(
            "Experiment snapshot exceeds the {} KiB limit.",
            MAX_SNAPSHOT_BYTES / 1024
        ));
    }
    Ok(snapshot)
}

fn now_millis() -> Result<i64, String> {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("System clock is before the Unix epoch: {error}"))?
        .as_millis();
    i64::try_from(millis).map_err(|_| "System time exceeds the supported range.".into())
}

use super::migrations;

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> (String, String, String, Value) {
        (
            "My experiment".into(),
            "Header exploration".into(),
            "Saved local snapshot".into(),
            serde_json::json!({"blocks": [{"height": 0, "nonce": 7}]}),
        )
    }

    #[test]
    fn create_update_list_and_delete_keep_records_isolated() {
        let repository = ExperimentRepository::in_memory().unwrap();
        let (name, kind, description, data) = sample();
        let created = repository
            .create(name, kind, description, data.clone())
            .unwrap();
        assert_eq!(repository.get(&created.id).unwrap(), Some(created.clone()));
        assert_eq!(repository.list().unwrap(), vec![created.clone()]);

        let mut updated = created.clone();
        updated.name = "Renamed".into();
        updated.data = serde_json::json!({"blocks": [{"height": 2}]});
        let saved = repository.update(updated).unwrap();
        assert_eq!(saved.name, "Renamed");
        assert!(saved.updated_at >= created.updated_at);
        assert_eq!(repository.list().unwrap(), vec![saved]);

        assert!(repository.delete(&created.id).unwrap());
        assert!(!repository.delete(&created.id).unwrap());
        assert!(repository.list().unwrap().is_empty());
    }

    #[test]
    fn updating_one_experiment_does_not_change_another_snapshot() {
        let repository = ExperimentRepository::in_memory().unwrap();
        let (first_name, kind, description, first_data) = sample();
        let first = repository
            .create(first_name, kind.clone(), description.clone(), first_data)
            .unwrap();
        let second = repository
            .create(
                "Second experiment".into(),
                kind,
                description,
                serde_json::json!({"separate": true}),
            )
            .unwrap();

        let mut changed = first.clone();
        changed.data = serde_json::json!({"only": "first"});
        repository.update(changed).unwrap();

        assert_eq!(
            repository.get(&first.id).unwrap().unwrap().data,
            serde_json::json!({"only": "first"})
        );
        assert_eq!(
            repository.get(&second.id).unwrap().unwrap().data,
            serde_json::json!({"separate": true})
        );
    }

    #[test]
    fn records_survive_database_reopen() {
        let path =
            std::env::temp_dir().join(format!("chain-v-test-{}.sqlite3", uuid::Uuid::new_v4()));
        let (name, kind, description, data) = sample();
        let created = {
            let repository = ExperimentRepository::open(&path).unwrap();
            repository.create(name, kind, description, data).unwrap()
        };
        let reopened = ExperimentRepository::open(&path).unwrap();
        assert_eq!(reopened.get(&created.id).unwrap(), Some(created));
        drop(reopened);
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn validates_names_and_snapshot_size_before_writing() {
        let repository = ExperimentRepository::in_memory().unwrap();
        let (_, kind, description, data) = sample();
        assert!(
            repository
                .create("  ".into(), kind.clone(), description.clone(), data.clone())
                .is_err()
        );
        assert!(
            repository
                .create(
                    "Too large".into(),
                    kind,
                    description,
                    Value::String("x".repeat(MAX_SNAPSHOT_BYTES + 1)),
                )
                .is_err()
        );
        assert!(repository.list().unwrap().is_empty());
    }
}
