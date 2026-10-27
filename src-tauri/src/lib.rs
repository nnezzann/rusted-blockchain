//! Tauri application entry point and backend composition root.
//!
//! Infrastructure commands currently live beside their implementations in
//! `compute.rs`, `system.rs`, and `window.rs`. The [`domain`], [`application`],
//! [`commands`], and [`persistence`] modules are the extension points for the
//! learner's blockchain implementation. Keep the dependency direction inward:
//! domain code should not depend on Tauri, persistence, or GPU libraries.

use tauri::Manager;

pub mod application;
pub mod commands;
mod compute;
pub mod domain;
pub mod persistence;
mod system;
mod window;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(compute::ComputeRuntime::default())
        .manage(commands::MiningRuntime::default())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().map_err(std::io::Error::other)?;
            std::fs::create_dir_all(&app_data_dir)?;
            let repository = persistence::repository::ExperimentRepository::open(
                app_data_dir.join("chain-v.sqlite3"),
            )
            .map_err(std::io::Error::other)?;
            app.manage(repository);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::hash_input,
            commands::inspect_block,
            commands::validate_chain,
            commands::create_demo_chain,
            commands::mine_block,
            commands::cancel_mining,
            commands::calculate_merkle_root,
            commands::run_transaction_demo,
            commands::list_experiments,
            commands::create_experiment,
            commands::update_experiment,
            commands::delete_experiment,
            system::get_system_info,
            compute::get_gpu_status,
            compute::run_compute_probe,
            window::get_window_snapshot,
            window::control_window,
            window::close_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
