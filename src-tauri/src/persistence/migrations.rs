//! Ordered SQLite schema migrations for durable experiment snapshots.

use rusqlite::Connection;

const CURRENT_VERSION: i64 = 1;

pub fn apply(connection: &mut Connection) -> Result<(), String> {
    let version = connection
        .pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
        .map_err(|error| format!("Could not read the database schema version: {error}"))?;
    if version > CURRENT_VERSION {
        return Err(format!(
            "Database schema version {version} is newer than this app supports."
        ));
    }
    if version == 0 {
        connection
            .execute_batch(
                "BEGIN IMMEDIATE;
                 CREATE TABLE experiments (
                    id TEXT PRIMARY KEY NOT NULL,
                    name TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    description TEXT NOT NULL,
                    snapshot_json TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                 );
                 CREATE INDEX experiments_updated_at ON experiments(updated_at DESC);
                 PRAGMA user_version = 1;
                 COMMIT;",
            )
            .map_err(|error| format!("Could not create the experiment database schema: {error}"))?;
    }
    Ok(())
}
