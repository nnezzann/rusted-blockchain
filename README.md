# Chain-V

Chain-V is a local-first desktop app for exploring how Bitcoin-like blockchain mechanisms fit together. It is designed as a set of small, visual experiments: change data, inspect the resulting state, and learn why blocks and transactions are accepted or rejected.

The project is intentionally educational. It is **not** a Bitcoin node, wallet, network client, or Bitcoin-compatible implementation. It does not handle real funds, connect to peers, or implement production security.

## What the app does today

- Provides a first-run setup flow, a navigable learning workspace, light/dark/system themes, and responsive lab screens.
- **Hash Lab:** computes SHA-256 and Bitcoin-style displayed SHA-256d values in Rust.
- **Block Lab:** serializes the 80-byte Bitcoin-layout header, calculates its hash, decodes a bounded compact target, and reports numeric proof-of-work validity.
- **Mining:** searches header nonces in a Rust worker, streams progress to the UI, enforces an attempt limit, and supports cancellation.
- **Chain Lab:** generates and validates a short Rust-mined header chain, shows parent-link/proof-of-work errors, and lets learners change and re-mine a block and its descendants.
- **Merkle calculator:** computes a double-SHA-256 Merkle root from displayed transaction IDs in Rust.
- Lets learners configure and compare illustrative peer copies. These are local mockups, not network peers or validated chains.
- Includes a prototype experiments screen for organizing local experiment metadata. It currently uses browser storage; it is not yet Rust-owned SQLite persistence or a saved blockchain snapshot.
- Reports host and app-data information through Rust/Tauri infrastructure commands.
- Offers an optional, generic GPU/CPU compute probe and native window controls in Settings. The compute probe checks general device support; it does not hash blocks or perform mining.
- Uses a compact, theme-matched title bar with draggable, minimize, maximize/restore, and close controls.

The implemented blockchain core is an educational, local-only header model—not a Bitcoin node or compatible implementation. Its maximum permitted target is `0x207fffff`; transactions, UTXOs, signatures, full consensus rules, persistence, real peer/fork simulation, and network communication are not implemented. Those screens and behaviors are labeled as prototypes or unavailable rather than returning simulated blockchain results.

## Architecture

```text
Chain-V · React + TypeScript frontend
  navigation, forms, themes, and learning visualizations
                │ typed Tauri invoke calls
                ▼
Tauri commands and Rust application layer
  typed hashing, header, chain, Merkle, and mining use cases
                │
        ┌───────┴────────┐
        ▼                ▼
Pure Rust domain          Rust infrastructure
hashes, headers,          system information,
targets, mining,          optional generic wgpu
chains, Merkle roots      compute, window controls
                          Rust-owned persistence
                          (planned)
```

Transactions, UTXOs, persistence, and peer simulation remain planned. See [BUILDING.md](BUILDING.md) for the implemented scope and roadmap, and [FRONTEND.md](FRONTEND.md) for screen and design requirements.

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
  features/                  onboarding, learning screens, peer prototype
  services/                  typed native bridge and prototype storage
  styles/                    shared theme tokens and screen styles
src-tauri/src/
  application/               Rust-owned learning use cases
  domain/                    hashes, headers, target, mining, chain, Merkle
  persistence/               documented future storage boundary
  commands.rs                typed Tauri IPC and mining lifecycle
  compute.rs                 optional generic wgpu probe and CPU fallback
  system.rs                  host information and app-data path
  window.rs                  native window actions and state
BUILDING.md                  architecture and learning roadmap
FRONTEND.md                  frontend design and implementation guide
design/                      local design references
```

## Scope and safety

The future model is intended to teach Bitcoin-like principles with deliberately reduced proof-of-work difficulty and local-only experiments. It will not be compatible with Bitcoin consensus or its wire protocol. Any future simplified rule should be clearly identified in the relevant lesson. Do not use this app to store real wallet keys or funds.

## License

No project license has been specified yet.
