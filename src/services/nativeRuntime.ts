import { Channel, invoke } from "@tauri-apps/api/core";

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

export type BlockHeader = {
  version: number;
  previousHash: string;
  merkleRoot: string;
  timestamp: number;
  bits: number;
  nonce: number;
};

export type HashResult = {
  sha256: string;
  sha256d: string;
};

export type HeaderInspection = {
  hash: string;
  serializedHeader: string;
  target: string;
  meetsTarget: boolean;
};

export type ChainEntry = {
  height: number;
  hash: string | null;
  valid: boolean;
  reasons: string[];
};

export type ChainValidation = {
  valid: boolean;
  blocks: ChainEntry[];
};

export type MiningProgress = {
  attempts: number;
  hashRate: number;
  elapsedMilliseconds: number;
  currentNonce: number;
  currentHash: string;
};

export type MiningResult = {
  header: BlockHeader;
  hash: string;
  target: string;
  attempts: number;
  elapsedMilliseconds: number;
};

export type TransactionInput = {
  previousOutput: { transactionId: string; outputIndex: number };
  publicKey: string;
  signature: string;
};

export type TransactionOutput = {
  value: number;
  recipient: string;
};

export type TransactionDemo = {
  coinbaseTransactionId: string;
  transaction: {
    version: number;
    inputs: TransactionInput[];
    outputs: TransactionOutput[];
  };
  validation: {
    transactionId: string;
    inputValue: number;
    outputValue: number;
    fee: number;
    verifiedSignatures: number;
  };
  remainingUtxos: { outpoint: { transactionId: string; outputIndex: number }; output: TransactionOutput }[];
};

export type PeerView = {
  id: string;
  name: string;
  chainName: string;
  headers: BlockHeader[];
  hashes: string[];
  height: number;
  tipHash: string;
  cumulativeWork: number;
  valid: boolean;
};

export type PeerComparison = {
  leftId: string;
  rightId: string;
  leftHeight: number;
  rightHeight: number;
  commonHeight: number | null;
  leftCumulativeWork: number;
  rightCumulativeWork: number;
  preferredPeerId: string | null;
};

export type PeerPropagation = {
  adopted: boolean;
  sourceId: string;
  destinationId: string;
  sourceHeight: number;
  destinationHeight: number;
  forkHeight: number | null;
  reason: string;
};

export type MiningProgressHandler = (progress: MiningProgress) => void;

export const hashInput = (input: string) => invoke<HashResult>("hash_input", { input });
export const inspectBlock = (header: BlockHeader) =>
  invoke<HeaderInspection>("inspect_block", { header });
export const createDemoChain = () => invoke<BlockHeader[]>("create_demo_chain");
export const validateChain = (headers: BlockHeader[]) =>
  invoke<ChainValidation>("validate_chain", { headers });
export const calculateMerkleRoot = (transactionIds: string[]) =>
  invoke<string>("calculate_merkle_root", { request: { transactionIds } });
export const runTransactionDemo = (amount: number, fee: number) =>
  invoke<TransactionDemo>("run_transaction_demo", { amount, fee });
export const listPeers = () => invoke<PeerView[]>("list_peers");
export const createPeer = (name: string, copyFromId: string) =>
  invoke<PeerView>("create_peer", { name, copyFromId });
export const removePeer = (peerId: string) =>
  invoke<PeerView[]>("remove_peer", { peerId });
export const minePeerBlock = (peerId: string) =>
  invoke<PeerView>("mine_peer_block", { peerId });
export const comparePeerChains = (leftId: string, rightId: string) =>
  invoke<PeerComparison>("compare_peer_chains", { leftId, rightId });
export const propagatePeerChain = (sourceId: string, destinationId: string) =>
  invoke<PeerPropagation>("propagate_peer_chain", { sourceId, destinationId });

export function mineBlock(
  jobId: string,
  header: BlockHeader,
  maxAttempts: number,
  onProgress: MiningProgressHandler,
): Promise<MiningResult> {
  const channel = new Channel<MiningProgress>();
  channel.onmessage = onProgress;
  return invoke<MiningResult>("mine_block", {
    jobId,
    header,
    maxAttempts,
    onProgress: channel,
  });
}

export const cancelMining = (jobId: string) =>
  invoke<void>("cancel_mining", { jobId });

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
