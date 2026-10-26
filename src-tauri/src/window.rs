use serde::{Deserialize, Serialize};
use tauri::WebviewWindow;

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WindowAction {
    Center,
    Focus,
    Minimize,
    Restore,
    ToggleFullscreen,
    ToggleMaximize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowSnapshot {
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
    pub is_maximized: bool,
    pub is_minimized: bool,
    pub is_fullscreen: bool,
}

#[tauri::command]
pub fn get_window_snapshot(window: WebviewWindow) -> Result<WindowSnapshot, String> {
    let size = window
        .inner_size()
        .map_err(|error| format!("Could not read the window size: {error}"))?;
    let scale_factor = window
        .scale_factor()
        .map_err(|error| format!("Could not read the display scale factor: {error}"))?;
    let is_maximized = window
        .is_maximized()
        .map_err(|error| format!("Could not read the maximized state: {error}"))?;
    let is_minimized = window
        .is_minimized()
        .map_err(|error| format!("Could not read the minimized state: {error}"))?;
    let is_fullscreen = window
        .is_fullscreen()
        .map_err(|error| format!("Could not read the fullscreen state: {error}"))?;

    Ok(WindowSnapshot {
        width: size.width,
        height: size.height,
        scale_factor,
        is_maximized,
        is_minimized,
        is_fullscreen,
    })
}

#[tauri::command]
pub fn control_window(
    window: WebviewWindow,
    action: WindowAction,
) -> Result<WindowSnapshot, String> {
    match action {
        WindowAction::Center => window.center(),
        WindowAction::Focus => window.set_focus(),
        WindowAction::Minimize => window.minimize(),
        WindowAction::Restore => (|| {
            window.set_fullscreen(false)?;
            window.unmaximize()?;
            window.set_focus()
        })(),
        WindowAction::ToggleFullscreen => (|| {
            window.set_fullscreen(!window.is_fullscreen()?)?;
            Ok(())
        })(),
        WindowAction::ToggleMaximize => (|| {
            if window.is_maximized()? {
                window.unmaximize()
            } else {
                window.maximize()
            }
        })(),
    }
    .map_err(|error| format!("Could not apply the window action: {error}"))?;

    get_window_snapshot(window)
}

#[tauri::command]
pub fn close_window(window: WebviewWindow) -> Result<(), String> {
    window
        .close()
        .map_err(|error| format!("Could not close the application window: {error}"))
}
