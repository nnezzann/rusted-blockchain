# Building Chain-V

## Purpose

Build a local-first Linux desktop learning tool that demonstrates Bitcoin's core mechanisms with the computation and scale reduced for a personal computer. The frontend explains and visualizes state; Rust owns the blockchain rules, cryptographic operations, mining, and persistence.

This is an educational model, not a Bitcoin node, wallet, or compatible implementation. It will have no Bitcoin network connection, real-value coins, or production security claims.

## Color and accessibility foundation

Use a restrained neutral interface with one warm amber accent and semantic status colors. Treat charcoal/near-black as the default text and structural color, not as the meaning of “valid”; use a distinct success treatment for valid state and red for invalid/error state. Never depend on red/green hue alone: pair each state with an icon or shape, a clear text label, and a short explanation such as “Hash is above target.”

Support **System**, **Light**, and **Dark** appearance choices. Default to the Linux system preference where available, with an explicit user override. Since this project targets Fedora Linux 45 with Tauri, the Linux webview is WebKitGTK; use CSS semantic tokens and `prefers-color-scheme` rather than relying on macOS-only system colors, native controls, or vibrancy APIs. The visual language can borrow macOS-inspired clarity and fluidity while remaining legible and at home on Fedora.

| Semantic token | Light | Dark | Example usage |
|---|---|---|---|
| App background | `#F5F6F8` | `#111318` | Main canvas |
| Surface | `#FFFFFF` | `#1B1F27` | Cards and sidebar |
| Raised surface | `#EEF1F4` | `#252A33` | Inputs, hover, nested panels |
| Primary text | `#161B22` | `#F2F4F7` | Headings and body copy |
| Secondary text | `#596574` | `#B4BDC9` | Supporting labels and metadata |
| Accent | `#9A5B00` | `#F4A340` | Primary action and selected navigation |
| Valid foreground / surface | `#176B45` / `#E8F5EE` | `#8FE3B1` / `#183526` | Valid hash, accepted block |
| Invalid foreground / surface | `#B42318` / `#FDECEA` | `#FF9B91` / `#3A2024` | Invalid block, rejected transaction |

The proposed foreground/background pairings have been checked against WCAG contrast calculations: light primary text 16.00:1, muted text 5.93:1, accent-button text 5.43:1, valid status 5.81:1, and invalid status 5.75:1; dark primary text 16.86:1, muted text 8.70:1, accent 7.99:1, valid status 8.75:1, and invalid status 7.33:1. Recheck contrast when tokens or composited surfaces change. Use at least 4.5:1 for normal text, 3:1 for large text, and 3:1 for meaningful control boundaries and graphics. Avoid low-contrast placeholder text and thin status borders; include focus indicators, keyboard support, and high-contrast testing. Provide `prefers-reduced-motion` alternatives for the landing-to-workspace transition and all other animation.

An initial, editable visual reference for these choices is in [`design/color-concepts.svg`](design/color-concepts.svg).

## Current project baseline

The app uses Tauri 2 + React 19 + TypeScript + Vite. Onboarding, themes, native shell, and generic compute settings are in place. Hash, Block, Mining, Chain, Transactions, Merkle, Peer Network, and Experiments call Rust through typed Tauri commands. See [`FRONTEND.md`](FRONTEND.md) for the frontend design and implementation requirements.

## What the reference teaches

[Anders Brownworth's Blockchain Demo](https://andersbrownworth.com/blockchain/) is organized as small experiments: SHA-256, an editable block, a linked chain, separate peer chains, token transfers, and coinbase rewards. Editing data updates hashes; mining searches for a nonce that meets a simplified difficulty; changing an earlier block invalidates later links. These are useful learning interactions, but the demo's account-like transfers and four-leading-zero rule are not Bitcoin's transaction model or proof-of-work target.

The app preserves the hands-on progression while using Bitcoin-like rules in the backend: double SHA-256 over a serialized block header, a numeric target, transaction IDs and a Merkle root, UTXO-based spending, and proof-of-work-validated chains. Difficulty is intentionally low and bounded; current chain and peer lessons use fixed targets. This does not make the resulting chain compatible with Bitcoin.

## Learning features

### First useful release

1. **Hash lab:** Enter data and inspect its SHA-256 and double-SHA-256 results. Explain the avalanche effect by comparing hashes before and after a small edit.
2. **Block lab:** Inspect and edit a block's version, previous-block hash, Merkle root, timestamp, target (`nBits`), and nonce. Show the serialized header, resulting hash, target comparison, and validity.
3. **Mining:** Search nonce values until the header hash is at or below the experiment's easy target. Show attempts, elapsed time, and current status; allow cancellation. Do not use a UI-thread loop.
4. **Chain lab:** Link blocks by previous-header hash. Editing a block invalidates descendants; re-mining restores validity. Make the invalid state and the reason explicit.
5. **Transaction and reward lab:** The current demo constructs a bounded coinbase output, signs one spend, verifies input ownership and value conservation, calculates a fee, and applies UTXO changes. The independent Merkle calculator accepts displayed IDs and constructs a root.
6. **Experiment storage:** Rust-backed create, list, rename/update, open, duplicate, delete, import, and export are implemented with SQLite JSON payloads. Transaction, header-chain, and peer-chain screens can explicitly save snapshots; lab state is not automatically synchronized and action history remains future work.

The **Peer Network** screen operates a real in-process simulation: peers hold independent validated header chains, can mine competing proof-of-work blocks, compare forks and equal-target cumulative work, and manually adopt a stronger chain. It does not open sockets or communicate with external nodes.

### Follow-on learning features

- **Peer/fork simulation:** Independent in-process header chains, competing blocks, equal-target cumulative-work comparison, and manual propagation are implemented. Transaction-aware reorganization and network P2P remain follow-on work.
- **Difficulty adjustment:** Add an optional, small educational retarget window after fixed-target proof-of-work is clear. Keep its parameters distinct from Bitcoin's real 2,016-block/two-week schedule.
- **Guided lessons:** Add short explanations, prompts, and resettable examples around each experiment without making the learning flow depend on a tutorial.

## Suggested architecture

```text
React + TypeScript (Tauri webview)
  views, navigation, animations, forms, visualizations
  typed frontend service for invoke() and mining progress
                    |
          Tauri commands / channels
                    |
Rust application layer
  use cases, input validation, progress/cancellation coordination
                    |
Rust domain (independent of Tauri)
  hash, header/block, transaction, UTXO, Merkle tree, mining, chain rules
                    |
Rust infrastructure
  SQLite repository, migrations, JSON import/export
```

### Rust domain

Keep the blockchain model and its tests in ordinary Rust modules, separate from Tauri command handlers. Use explicit domain types for `BlockHeader`, `Block`, `Transaction`, `OutPoint` (transaction ID plus output index), `TxInput`, `TxOutput`, `UtxoSet`, `Target`, `Chain`, and `Experiment`. Use integer satoshi-like units, never floating-point amounts.

Define one canonical header serialization and hash implementation. For Bitcoin-like behavior, the header has the 80-byte field layout (version, previous hash, Merkle root, timestamp, compact target, nonce), with deliberate byte order and displayed-hash conversion. Proof of work is `SHA256(SHA256(serialized_header)) <= target`, not a string-prefix check. Keep the target deliberately easy and bounded for laptop-friendly mining. Test serialization, hash/endianness, Merkle construction, transaction validation, and target comparisons with fixed vectors.

Chain validation should be deterministic and independent of the UI. Editing a block's committed data makes its hash change and descendants invalid; restoring a chain may require re-mining each affected descendant in order. Mining only finds a header satisfying its target; it must not silently repair unrelated invalid transactions. Validate that a block's transactions, Merkle root, reward, and proof of work are all consistent before accepting it.

### Tauri boundary and frontend

Expose small, typed commands for creating/loading an experiment, editing or validating model data, mining, cancelling a mining job, and managing saved experiments. Commands return structured results or explicit errors; the frontend should not reimplement hashes, balances, or consensus decisions.

Mining should run away from the webview/UI thread. Use a Tauri channel for bounded progress updates (attempt count, rate, elapsed time, status) and a cancellation signal checked regularly by the Rust worker. Return the final block/result through the command response. Avoid emitting an event for every nonce; progress is presentation data, not a high-throughput trace.

The React frontend owns navigation and presentation state only: selected lesson, open experiment, form drafts, animation state, and transient progress. Treat Rust responses as the source of truth. The screen layout, theme, component styling, and transition design are specified in [`FRONTEND.md`](FRONTEND.md). Motion must not be required to understand state changes, and should respect reduced-motion preferences.

Current source boundaries:

```text
src/
  App.tsx               navigation and shared application state
  features/             onboarding, lessons, peer network, and experiments
  services/             typed Tauri invoke() adapters and migration
  types/                frontend representations of Rust responses
src-tauri/src/
  domain/               hashes, headers, transactions, UTXOs, mining, chains, and peers
  application/          Rust-owned learning and experiment use cases
  persistence/          SQLite schema migration and experiment repository
  commands.rs           typed Tauri IPC and backend runtime state
  compute.rs            optional generic wgpu compute and CPU fallback
  system.rs             host capabilities and app-data directory
  window.rs             native Tauri window state/actions
```

The Rust domain and application layers implement hashing, headers, proof of work, mining, linked chains, Merkle roots, a signed transaction/UTXO example, and the in-process peer simulation. SQLite backs isolated experiment records and JSON snapshot payloads. Application use cases and typed Tauri commands expose these operations. The block and peer chains remain header-only; transaction outputs are not committed into mined block contents.

Keep the dependency direction explicit: `domain` is pure Rust and depends on no app infrastructure; `application` coordinates domain operations and narrow infrastructure interfaces; Tauri commands are the IPC boundary; persistence and GPU/window/system services remain infrastructure. The frontend should receive typed command results and must not become the source of truth for blockchain state.

### Implemented non-domain Rust infrastructure

The Tauri shell now exposes three infrastructure areas without implementing any blockchain concepts:

- `system.rs` reports OS/architecture, logical processor count, Linux memory totals when available, and the app-specific data directory. The experiment repository separately initializes its SQLite database within that directory.
- `compute.rs` lazily discovers and caches a headless `wgpu` compute device. The Settings screen can run a bounded, generic vector-operation probe on CPU, GPU, or automatic mode. Automatic mode falls back to CPU and includes the reason in its result when GPU initialization or execution fails. This probe is not hashing, mining, or a performance benchmark. GPU availability depends on the host's adapter and drivers.
- `window.rs` reports native window size, display scale, and state, and supports center, focus, minimize, restore, maximize, and fullscreen actions.

The app now hides the separate window-manager title bar and renders a compact theme-aware title bar as part of the interface. Its draggable region and minimize, maximize/restore, and close controls use the Tauri window command boundary; Tauri's drag-region handling toggles maximize on double-click. The window's OS-level title remains set for task switchers and accessibility. The controls are generic desktop controls, not macOS traffic lights.

These services do not grant shell execution, elevated privileges, arbitrary filesystem access, or access to blockchain state. Keep domain models, validation, hashing, mining, and consensus in separate Rust modules owned by the learner.

### Implemented Rust learning core

- **Hashing:** Rust returns SHA-256 and Bitcoin-style displayed SHA-256d values for arbitrary UTF-8 input.
- **Headers and proof of work:** Rust serializes the 80-byte header, validates its hash fields and compact target, computes its SHA-256d hash, and compares that hash numerically with the target. `0x207fffff` is the easiest permitted target; the standalone Mining lesson uses `0x1f00ffff` so progress and cancellation can be observed.
- **Mining:** A bounded Rust worker searches nonce values off the UI thread, streams periodic progress over a Tauri channel, and supports cancellation. Each request is capped at ten million attempts in Rust; the UI currently requests at most two million.
- **Header chains:** Rust validates each header's proof of work and parent hash link, and returns per-height reasons. The demo chain is generated and mined in Rust. It contains empty Merkle roots and no transactions.
- **Merkle roots:** Rust decodes displayed transaction IDs, double-hashes pairs, duplicates an unpaired final node, and returns the resulting displayed root. Supplied IDs are not independently validated as transaction IDs.

The transaction demonstration is not connected to mined block contents or the Merkle root lesson. Experiment JSON snapshots can preserve explicit transaction, header-chain, or peer-chain results, but currently edited lab state is not continuously synchronized into a selected experiment. Peer simulation uses synthetic header commitments without transactions. These are explicit simplifications, not Bitcoin compatibility or production security.

### Persistence

The implemented `persistence::repository::ExperimentRepository` uses SQLite in Tauri's app-data directory. Schema version 1 stores a bounded JSON snapshot alongside independent metadata and timestamps. Repository operations surface errors and preserve record isolation. Import creates a new experiment rather than replacing an existing record; legacy browser metadata is migrated once. Transaction, chain, and peer screens can save explicit snapshots; selected experiments are not yet a live context shared by labs. Next storage work should add an append-only action history. Imported JSON is stored as data, not accepted as validated chain state.

## Delivery order

1. **Core correctness:** Define the model, canonical encodings, validation rules, and Rust unit tests before wiring up UI.
2. **Hash/block/chain lesson:** Add a hash lab, editable header, linked blocks, easy-target mining, validation feedback, and mining cancellation.
3. **Transaction lesson:** Add UTXOs, transaction validation, coinbase reward limits, fees, and Merkle commitments; introduce keys and signatures before presenting transactions as authorized spends.
4. **Tauri integration and storage:** Typed commands, bounded mining progress, SQLite-backed experiment records, schema migration, and JSON import/export are implemented. Connect live blocks/transactions to a shared selected-experiment context and add an action history.
5. **Fork lesson:** Independent in-process header chains, competing branches, equal-target cumulative-work comparison, and explicit propagation are implemented. Add transaction-aware blocks, reorganization effects, and target-weighted work as separate lessons.
6. **UI design and polish:** The main landing-to-workspace, sidebar, experiment, and peer views are implemented. Continue accessibility, responsive, and Fedora WebKitGTK checks as features evolve.

Each lesson should work independently with resettable sample data. A learner should be able to change one input, see which derived values changed, inspect why a block or transaction is valid/invalid, and restore a known-good example without losing other experiments.

## Rules and simplifications to keep visible

| Mechanism | Educational model | Not included in the first release |
|---|---|---|
| Hashing | Bitcoin-like SHA-256d for headers and transaction IDs | Bitcoin's full transaction wire format and consensus edge cases |
| Proof of work | Numeric target comparison with deliberately easy parameters | Mainnet difficulty, ASIC-scale mining, or a live network |
| Ledger | One demo transaction, Ed25519 ownership checks, UTXO spending, fees, bounded coinbase, and a separate Merkle calculator | Bitcoin transaction wire format, Script, transaction-to-block validation, and all policy/consensus rules |
| Chain choice | Validated in-process header forks and header-count work at one fixed target | Target-weighted Bitcoin work, network propagation, peer discovery, and distributed consensus |
| Identity | Ephemeral Ed25519 signing for a learning spend; private keys never leave Rust | Persistent key custody, wallet recovery, hardware signing, or real-fund use |
| Storage | SQLite experiment metadata, explicit transaction/chain/peer snapshots, and bounded JSON payloads | Automatic lab synchronization, action/event history, cross-device sync, or tamper-proof storage |

Always label simplified parameters and behaviors in the relevant lesson; do not imply that a saved experiment is part of Bitcoin or that a simulated peer is a real network node.

## Research references

- [Bitcoin Developer Guide: Block Chain](https://developer.bitcoin.org/devguide/block_chain.html) — headers, proof of work, forks, coinbase, and Merkle roots.
- [Bitcoin Developer Guide: Transactions](https://developer.bitcoin.org/devguide/transactions.html) — inputs, outputs, UTXOs, and authorization/signatures.
- [Bitcoin Developer Guide: Mining](https://developer.bitcoin.org/devguide/mining.html) — header hashing and target-based work.
- [Bitcoin Developer Guide: P2P Network](https://developer.bitcoin.org/devguide/p2p_network.html) — distinction between local chain rules and actual peer communication.
- [Tauri v2: Calling Rust from the frontend](https://v2.tauri.app/develop/calling-rust/) — typed commands, async commands, and error propagation.
- [Tauri v2: Calling the frontend from Rust](https://v2.tauri.app/develop/calling-frontend/) — events and channels for Rust-to-frontend communication.
- [Tauri v2: SQL plugin](https://v2.tauri.app/plugin/sql/) — SQLite and migrations are available; this project should keep database access in Rust rather than expose database operations directly to the webview.
- [Apple Human Interface Guidelines: Color](https://developer.apple.com/design/human-interface-guidelines/color) — consistent semantic use, appearance variants, and alternatives to color-only state.
- [GNOME HIG: UI Styling](https://developer.gnome.org/hig/guidelines/ui-styling.html) and [Accessibility](https://developer.gnome.org/hig/guidelines/accessibility.html) — system appearance, high contrast, reduced custom styling, and accessible controls for the Linux desktop context.
- [WCAG 2.2: Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), and [Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html) — contrast thresholds and non-color state cues.
