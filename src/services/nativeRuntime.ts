import { invoke } from "@tauri-apps/api/core";

export type SystemInfo = {
  operatingSystem: string;
  osVersion: string | null;
  architecture: string;
  logicalCpuCount: number;
  totalMemoryBytes: number | null;
  availableMemoryBytes: number | null;
  appDataDirectory: string;
};

export type GpuStatus = {
  available: boolean;
  adapterName: string | null;
  backend: string | null;
  deviceType: string | null;
  error: string | null;
};

export type ComputeResult = {
  requestedBackend: "auto" | "cpu" | "gpu";
  executionBackend: "cpu" | "gpu";
  adapterName: string | null;
  elements: number;
  elapsedMilliseconds: number;
  checksum: number;
  preview: number[];
  fallbackReason: string | null;
};

export type ComputeBackend = "auto" | "cpu" | "gpu";
export type WindowAction =
  | "center"
  | "focus"
  | "minimize"
  | "restore"
  | "toggle_fullscreen"
  | "toggle_maximize";

export type WindowSnapshot = {
  width: number;
  height: number;
  scaleFactor: number;
  isMaximized: boolean;
  isMinimized: boolean;
  isFullscreen: boolean;
};

export const getSystemInfo = () => invoke<SystemInfo>("get_system_info");
export const getGpuStatus = () => invoke<GpuStatus>("get_gpu_status");
export const getWindowSnapshot = () => invoke<WindowSnapshot>("get_window_snapshot");

export const runComputeProbe = (elements: number, backend: ComputeBackend) =>
  invoke<ComputeResult>("run_compute_probe", { elements, backend });

export const controlWindow = (action: WindowAction) =>
  invoke<WindowSnapshot>("control_window", { action });
export const closeWindow = () => invoke<void>("close_window");

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return "Unavailable";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
