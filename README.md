# Chain-V

Chain-V is a local-first desktop app for exploring how Bitcoin-like blockchain mechanisms fit together. It is designed as a set of small, visual experiments: change data, inspect the resulting state, and learn why blocks and transactions are accepted or rejected.

The project is intentionally educational. It is **not** a Bitcoin node, wallet, network client, or Bitcoin-compatible implementation. It does not handle real funds, connect to external peers, or implement production security.

## What the app does today

- Provides a first-run setup flow, a navigable learning workspace, light/dark/system themes, and responsive lab screens.
- **Hash Lab:** computes SHA-256 and Bitcoin-style displayed SHA-256d values in Rust.
- **Block Lab:** serializes the 80-byte Bitcoin-layout header, calculates its hash, decodes a bounded compact target, and reports numeric proof-of-work validity.
- **Mining:** searches header nonces in a Rust worker, streams progress to the UI, enforces an attempt limit, and supports cancellation.
- **Chain Lab:** generates and validates a short Rust-mined header chain, shows parent-link/proof-of-work errors, and lets learners change and re-mine a block and its descendants.
- **Merkle calculator:** computes a double-SHA-256 Merkle root from displayed transaction IDs in Rust.
- **Transactions & UTXOs:** creates a capped demo coinbase output, signs a spend with an ephemeral Ed25519 key, validates ownership/value/fee rules, and applies the UTXO changes in Rust. Private keys are neither returned nor saved.
- **Peer Network:** runs separate in-process header chains, mines valid competing branches, compares their shared ancestor and cumulative work, and manually propagates a stronger chain. State is memory-only and no sockets are opened.
- **Experiments:** stores metadata and JSON snapshot payloads in a versioned SQLite database under Tauri's app-data directory. Create, open, rename, duplicate, import/export, and delete operations use Rust commands; transaction, header-chain, and peer screens can save explicit snapshots. Old browser metadata is migrated once.
- Reports host and app-data information through Rust/Tauri infrastructure commands.
- Offers an optional, generic GPU/CPU compute probe and native window controls in Settings. The compute probe checks general device support; it does not hash blocks or perform mining.
- Uses a compact, theme-matched title bar with draggable, minimize, maximize/restore, and close controls.

Important limits: transaction serialization and Ed25519 authorization are a small Chain-V model, not Bitcoin transaction serialization or Script. The transaction demo creates a temporary ledger; it is not yet attached to mined block contents. Learners can explicitly save transaction, header-chain, and peer-chain snapshots; other lab state and action history are not automatically captured. Peer chains use one fixed easy target, count valid headers as comparable work units, and reset when the app exits. They are a local simulation, not P2P or network consensus. The app must never be used for funds or real key storage.

## Architecture

```text
Chain-V · React + TypeScript frontend
  navigation, forms, themes, and learning visualizations
                │ typed Tauri invoke calls
                ▼
Tauri commands and Rust application layer
  typed hash, block, transaction, peer, and storage use cases
                │
        ┌───────┴────────┐
        ▼                ▼
Pure Rust domain          Rust infrastructure
hashes, headers,          SQLite experiment repository,
transactions, UTXOs,      system information,
mining, forks, Merkle     optional generic wgpu,
                          compute, window controls
```

Follow-on work includes connecting experiment snapshots to live lab state, recording an action history, attaching validated transactions to mined blocks, and adding richer transaction/coinbase policies. See [BUILDING.md](BUILDING.md) for the implemented scope and roadmap, and [FRONTEND.md](FRONTEND.md) for screen and design requirements.

## Run locally

### Prerequisites

- Bun
- Rust toolchain and Cargo
- Tauri v2 Linux development prerequisites for GTK/WebKitGTK

For Fedora package requirements and platform setup, see the [Tauri v2 Linux prerequisites](https://v2.tauri.app/start/prerequisites/#linux).

### Development

```bash
bun install
bun run tauri dev
```

To run the frontend in a browser without the native Tauri APIs:

```bash
bun run dev
```

The desktop app is the intended environment for system information, GPU capability checks, and native window controls. These native features are unavailable in a plain browser.

### Build and test

```bash
bun run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
bun run tauri build
```

## Project layout

```text
src/                         React and TypeScript user interface
  features/                  onboarding, learning screens, peer simulation UI
  services/                  typed native bridge and experiment migration
  styles/                    shared theme tokens and screen styles
src-tauri/src/
  application/               Rust-owned learning use cases
  domain/                    hashes, headers, targets, transactions, UTXOs, peers
  persistence/               SQLite schema migration and experiment repository
  commands.rs                typed Tauri IPC, mining, peer and storage state
  compute.rs                 optional generic wgpu probe and CPU fallback
  system.rs                  host information and app-data path
  window.rs                  native window actions and state
BUILDING.md                  architecture and learning roadmap
FRONTEND.md                  frontend design and implementation guide
design/                      local design references
```

## Scope and safety

The model teaches Bitcoin-like principles with deliberately reduced proof-of-work difficulty and local-only experiments. It is not compatible with Bitcoin consensus or its wire protocol. Demo keys are ephemeral; no production wallet or key-management system exists. Do not use this app to store real keys or funds.

## License

No project license has been specified yet.
