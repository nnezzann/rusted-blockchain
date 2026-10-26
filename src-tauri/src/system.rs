use serde::Serialize;
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub operating_system: String,
    pub os_version: Option<String>,
    pub architecture: String,
    pub logical_cpu_count: usize,
    pub total_memory_bytes: Option<u64>,
    pub available_memory_bytes: Option<u64>,
    pub app_data_directory: String,
}

#[tauri::command]
pub fn get_system_info(app: AppHandle) -> Result<SystemInfo, String> {
    let app_data_directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve the app data directory: {error}"))?;
    std::fs::create_dir_all(&app_data_directory)
        .map_err(|error| format!("Could not prepare the app data directory: {error}"))?;

    let (total_memory_bytes, available_memory_bytes) = memory_info();

    Ok(SystemInfo {
        operating_system: std::env::consts::OS.to_string(),
        os_version: os_version(),
        architecture: std::env::consts::ARCH.to_string(),
        logical_cpu_count: std::thread::available_parallelism()
            .map(usize::from)
            .unwrap_or(1),
        total_memory_bytes,
        available_memory_bytes,
        app_data_directory: app_data_directory.to_string_lossy().into_owned(),
    })
}

#[cfg(target_os = "linux")]
fn os_version() -> Option<String> {
    let contents = std::fs::read_to_string("/etc/os-release").ok()?;
    contents
        .lines()
        .find_map(|line| line.strip_prefix("PRETTY_NAME="))
        .map(|value| value.trim_matches('"').to_string())
}

#[cfg(not(target_os = "linux"))]
fn os_version() -> Option<String> {
    None
}

#[cfg(target_os = "linux")]
fn memory_info() -> (Option<u64>, Option<u64>) {
    let Ok(contents) = std::fs::read_to_string("/proc/meminfo") else {
        return (None, None);
    };
    let mut total = None;
    let mut available = None;
    for line in contents.lines() {
        let (key, value) = match line.split_once(':') {
            Some(parts) => parts,
            None => continue,
        };
        let kibibytes = value
            .split_whitespace()
            .next()
            .and_then(|value| value.parse::<u64>().ok());
        match key {
            "MemTotal" => total = kibibytes.map(|value| value * 1024),
            "MemAvailable" => available = kibibytes.map(|value| value * 1024),
            _ => {}
        }
    }
    (total, available)
}

#[cfg(not(target_os = "linux"))]
fn memory_info() -> (Option<u64>, Option<u64>) {
    (None, None)
}
