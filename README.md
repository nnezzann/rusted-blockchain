# Learning Blockchain

Learning Blockchain is a local-first desktop app for exploring how Bitcoin-like blockchain mechanisms fit together. It is designed as a set of small, visual experiments: change data, inspect the resulting state, and learn why blocks and transactions are accepted or rejected.

The project is intentionally educational. It is **not** a Bitcoin node, wallet, network client, or Bitcoin-compatible implementation. It does not handle real funds, connect to peers, or implement production security.

## What the app does today

- Provides a first-run setup flow, a navigable learning workspace, light/dark/system themes, and responsive lab screens.
- Presents Hash, Block, Mining, Chain, Transactions, and Peer Network lessons. These screens are currently UI prototypes: blockchain-derived values and consensus decisions are not yet implemented in Rust.
- Lets learners configure and compare illustrative peer copies. These are local mockups, not network peers or validated chains.
- Includes a prototype experiments screen for organizing local experiment metadata. It currently uses browser storage; it is not yet Rust-owned SQLite persistence or a saved blockchain snapshot.
- Reports host and app-data information through Rust/Tauri infrastructure commands.
- Offers an optional, generic GPU/CPU compute probe and native window controls in Settings. The compute probe checks general device support; it does not hash blocks or perform mining.
- Uses a compact, theme-matched title bar with draggable, minimize, maximize/restore, and close controls.

The Rust blockchain domain is deliberately left for implementation. Documented module scaffolds mark where hashing, blocks, transactions, Merkle trees, targets, validation, mining, experiments, application use cases, commands, and persistence will live.

## Architecture

```text
React + TypeScript frontend
  navigation, forms, themes, and learning visualizations
                │ typed Tauri invoke calls
                ▼
Rust application and command boundary
  future experiment/block/mining use cases
                │
        ┌───────┴────────┐
        ▼                ▼
Pure Rust domain     Rust infrastructure
hash, blocks,         system information,
transactions,         optional generic wgpu
validation, mining    compute, window controls
        │
        ▼
Rust-owned persistence (planned)
SQLite, migrations, experiment history
```

The domain and persistence entries in this diagram are planned boundaries, not completed features. See [BUILDING.md](BUILDING.md) for the architecture and learning roadmap, and [FRONTEND.md](FRONTEND.md) for screen and design requirements.

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
  application/               documented use-case scaffolds
  domain/                    documented blockchain-domain scaffolds
  persistence/               documented storage scaffolds
  commands.rs                future Tauri command boundary
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
