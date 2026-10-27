//! Tauri application entry point and backend composition root.
//!
//! Infrastructure commands live beside their implementations in `compute.rs`,
//! `system.rs`, and `window.rs`. Blockchain rules stay in the pure
//! [`domain`] modules; application use cases, Tauri IPC, and SQLite persistence
//! depend inward on those rules, never the other way around.

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
            let peers = domain::peer::PeerNetwork::new().map_err(std::io::Error::other)?;
            app.manage(commands::PeerRuntime::new(peers));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::hash_input,
            commands::inspect_block,
            commands::inspect_data_block,
            commands::commit_block_data,
            commands::validate_chain,
            commands::create_demo_chain,
            commands::mine_block,
            commands::mine_data_block,
            commands::cancel_mining,
            commands::calculate_merkle_root,
            commands::run_transaction_demo,
            commands::list_experiments,
            commands::create_experiment,
            commands::update_experiment,
            commands::delete_experiment,
            commands::list_peers,
            commands::create_peer,
            commands::remove_peer,
            commands::mine_peer_block,
            commands::edit_peer_block,
            commands::remine_peer_chain,
            commands::compare_peer_chains,
            commands::propagate_peer_chain,
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
