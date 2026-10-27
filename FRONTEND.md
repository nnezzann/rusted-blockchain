# Frontend implementation guide

This document is the working specification for the complete desktop frontend of Chain-V. It is written for an implementation agent who has not seen the earlier design discussion. Read it together with [`BUILDING.md`](BUILDING.md), which is the source of truth for blockchain concepts, validation, and the Rust architecture.

## 1. Product and implementation context

Build a local-first educational desktop app that lets a learner explore Bitcoin-like mechanisms through small experiments. The app demonstrates concepts; it is not a Bitcoin node, wallet, network client, or implementation compatible with Bitcoin. It must not suggest that experiments contain real money or that easy local mining represents Bitcoin network mining.

The app and its first Rust-backed learning features are implemented:

- Tauri 2, React 19, TypeScript, and Vite.
- Linux target: Fedora Linux 45. Tauri uses WebKitGTK on Linux.
- The frontend includes onboarding, a persistent workspace shell, all learning labs, settings, SQLite-backed experiment controls, and an in-process peer/fork simulation.
- The app window is configured for 1280 × 850 with a 1000 × 700 minimum.
- Rust owns hashes, header rules, mining, transaction/UTXO validation, signatures, peer chains, and experiment persistence. Transactions use a small educational format; peers do not communicate over a network.
- The Tauri bridge uses typed commands and frontend DTOs. Dependencies include React, Tauri API, rusqlite, SHA-256 and Ed25519 libraries, and the generic wgpu probe.

This guide documents current presentation and integration behavior as well as future design goals. Do not present unavailable or simplified behaviors as Bitcoin protocol compatibility.

Implement in the existing stack. Prefer small, accessible React components and CSS custom properties over introducing a UI framework. Keep domain calculations in Rust; frontend code is responsible for presentation, navigation, draft inputs, and transient UI state.

## 2. Visual reference and design intent

The user-provided **Learning Blockchain UI Concept Collage** and **Learning Blockchain Welcome Screen** are the primary visual references. The collage establishes the workspace and lab-card styling; the separate welcome image establishes first-run onboarding. Use their overall color scheme, density, spacing, hierarchy, and material treatment as the target. The earlier `design/color-concepts.svg` is a palette study, not a competing layout reference.

### Core aesthetic

- Calm, polished, modern desktop app with macOS-inspired fluidity, adapted to Fedora/GNOME rather than imitating macOS chrome.
- Bright light appearance: warm-white/light-gray page canvas, white cards, quiet gray borders, dark slate text.
- Dark appearance: deep charcoal canvas, slightly lighter charcoal surfaces, gentle borders, high-contrast near-white text.
- Warm amber/orange is the brand accent for selected navigation, primary actions, and small decorative emphasis.
- Spacious but information-dense enough to inspect hashes and block fields. Use consistent alignment and a clear type hierarchy.
- Rounded cards and inputs, restrained shadows in light mode, subtle tonal separation in dark mode. Avoid excessive blur, glass effects, gradients, thick outlines, or neon.
- Use a readable system sans-serif stack for UI and a monospace stack for hashes, serialized data, nonces, and other technical values.
- Keep default UI text comfortable at normal desktop viewing scale: body copy should generally be 14–16px, labels and supporting text at least 12px, and technical values readable without zooming. Do not shrink text to make a dense card fit; allow wrapping, scrolling within bounded technical-value regions, or responsive stacking instead.
- Use a consistent, simple icon family with labels. Prefer a single small icon dependency or local SVGs; do not mix unrelated icon styles or use emoji as interface icons.
- The illustrations in the reference are visual accents, not a dependency on remote content. Build a local SVG/CSS illustration or provide a local asset; the application should render fully offline.

### Linux-native window behavior

The application uses a compact custom title bar integrated with the app theme, with Fedora-native window actions exposed as accessible minimize, maximize/restore, and close buttons. Disable the separate native title bar so the workspace and title bar appear as one surface. Keep the OS window title set for task switching and accessibility, and retain the window manager's normal resizing, snapping, and keyboard shortcuts.

- Provide a draggable title-bar region and make sure interactive controls are excluded from dragging.
- Center the app name, align window controls at the trailing edge, and keep their hover/focus states legible in light and dark themes.
- Double-clicking an empty draggable title-bar region toggles maximize/restore.
- Do not copy macOS traffic-light styling or use macOS-specific APIs. Use the Tauri window API/commands for window actions.
- Include the same title bar during first-run onboarding so the desktop shell remains consistent.

The current 800 × 600 window is too constrained for the reference workspace. Set a practical desktop default around 1280 × 850 (or similar), with a sensible minimum around 1000 × 700; verify these values against the actual Tauri/WebKitGTK window and allow resizing. All screens still need to reflow at narrower widths without horizontal page overflow.

## 3. Color, themes, and semantic states

Use semantic CSS variables; component styles must not scatter raw color literals. Keep the light/dark token sets centralized, and use the same semantic roles in onboarding, home, every lab, experiments, dialogs, and settings.

### Starting design tokens

These tokens align with the visual references and `BUILDING.md`. Treat them as the initial specification; adjust only where real rendered contrast or system integration demonstrates a need.

| Role | Light | Dark |
|---|---|---|
| App canvas | `#F5F6F8` | `#111318` |
| Main surface / sidebar | `#FFFFFF` | `#1B1F27` |
| Raised surface / input | `#EEF1F4` | `#252A33` |
| Primary text | `#161B22` | `#F2F4F7` |
| Secondary text | `#596574` | `#B4BDC9` |
| Subtle text / decorative icon | `#697586` or darker if needed for contrast | `#A7B0BC` |
| Divider / quiet border | `#E2E6EB` | `#333943` |
| Primary accent | `#9A5B00` | `#F4A340` |
| Accent text on action | `#FFFFFF` | `#171A20` |
| Valid text / background | `#176B45` / `#E8F5EE` | `#8FE3B1` / `#183526` |
| Invalid text / background | `#B42318` / `#FDECEA` | `#FF9B91` / `#3A2024` |
| Warning text / background | `#8A4B00` / `#FFF3D6` | `#FFD08A` / `#3A2B17` |
| Information text / background | `#175A9C` / `#E9F2FF` | `#9AC7FF` / `#1D2D42` |

Status meanings must not be confused:

- **Valid / success (green):** A domain result passes validation, for example a header hash is at or below target, a transaction input exists, or a chain link matches.
- **Invalid / error (red):** A domain result fails validation, a request failed, or user input is malformed. State why and how to recover where possible.
- **Warning (amber):** A caution or non-fatal concern, such as an operation in progress, a setting that increases work, or a chain descendant invalidated by an edit.
- **Information (blue):** Explanatory/help content that is not success or failure.
- **Accent (orange):** Brand, selected navigation, primary CTA, and active tab. Do not use accent as a synonym for valid.

Always pair status color with a text label and recognizable icon/shape. Include a useful explanation, not just “invalid.” Do not color a whole large page/card red or green; apply restrained badges, callouts, or a thin status edge so the workspace remains calm. If a status is pending/unknown, say so rather than displaying green by default.

Contrast requirements:

- Normal text: WCAG contrast at least 4.5:1 against its actual background.
- Large text: at least 3:1.
- Meaningful controls, focus indicators, icons, chart lines, and state graphics: at least 3:1 against adjacent colors.
- Re-check actual token combinations when building components, including text on tinted status surfaces and accent buttons. `BUILDING.md` records the palette calculations for its first set of base pairs.
- Do not communicate state only through color. Support high-contrast/system contrast modes where feasible and test a color-blind-safe rendering.

### Theme selection

Provide three persistent settings: **System**, **Light**, and **Dark**.

- Initial/default selection is **System**.
- System mode follows the Fedora desktop's light/dark preference through `prefers-color-scheme`; update if the OS setting changes while the app is open.
- Light and Dark explicitly override the system setting.
- Apply the theme at the application root using a stable attribute/class (for example `data-theme="light|dark"`); make initial paint use the correct theme to avoid a flash of the wrong appearance.
- Persist the user's choice across relaunches. When the settings backend exists, persist through the Rust-owned preferences interface. For an earlier UI-only prototype, local storage may be a temporary adapter, not a second competing source of truth.
- Use CSS tokens for all surfaces and controls. Avoid hard-coded dark/light color assumptions in components.

## 4. Application flow and navigation

The app has two top-level experiences:

1. **First-run onboarding:** A dedicated welcome/setup flow shown on the first launch after installation, before the normal Home workspace.
2. **Main workspace:** Persistent left sidebar, screen content area, and contextual status/help controls.

Once onboarding is complete, normal app launches should open the last useful workspace or Home, not replay onboarding. Users must be able to change learning mode and appearance later in Settings. Include a way to re-open the welcome/setup experience from Settings if appropriate.

### Persistent workspace sidebar

Use a fixed-width sidebar on desktop, visually distinct from the main canvas. It contains:

- App mark and **Chain-V** name.
- **Learn** group:
  - Home
  - Hash Lab
  - Block Lab
  - Mining
  - Chain Lab
  - Transactions
- **Your Work** group:
  - Experiments
- Settings at the bottom or in a stable utility section.
- A compact local status area such as **Local · Offline** and **Learning mode**. This describes the app's local-only nature; do not imply a network connection.

Selected navigation has an amber-tinted background and icon/text emphasis. Inactive items are neutral. Every item has a text label; icons are supplementary. On smaller windows, collapse the sidebar to an accessible compact/drawer pattern without hiding navigation from keyboard or screen reader users.

Main content should have consistent page padding, title/subtitle, optional primary action in the header, and a content width that makes technical values legible. Avoid using a new browser-style page per module; navigation should feel like one desktop workspace.

## 5. First-run onboarding flow

Implement the four-step wizard from the **Welcome Screen** reference. It is an in-app first-launch screen, not an OS installer and not a web landing page. Use the full app content area below the integrated Fedora title bar; the image's macOS traffic lights and desktop background do not carry over.

### Shared wizard layout

- A narrow left rail shows the app mark/name, numbered steps (1–4), current-step highlight, and a quiet “Small steps. Big concepts.” tagline.
- A large content area uses the same theme tokens and surfaces as the app.
- Show a clear progress indication (step labels and/or progress bar/dots); never communicate progress with color alone.
- Provide Back (after step 1), Continue/Next, and an appropriate finish action, with keyboard focus order and visible focus.
- Maintain entered preferences if the user goes back and forth.
- Content should reflow at narrower window sizes; the left rail may compact or become a top progress row.
- Use gentle step transitions, not blocking animations. Respect `prefers-reduced-motion`.

### Step 1 — Welcome

Use the image's hierarchy:

- Eyebrow: “WELCOME TO”.
- Main heading: “Chain-V”, preceded by the “WELCOME TO” eyebrow; render “Chain-V” in amber accent.
- Plain-language description: “A hands-on, visual way to explore how Bitcoin works — from hashing and blocks to transactions and proof-of-work. Built for curious minds, designed for real understanding.”
- Four benefit cards:
  - **Learn by Doing** — interactive labs and visual explanations.
  - **Real Bitcoin Concepts** — hashing, blocks, Merkle trees, UTXOs, and proof-of-work made approachable.
  - **Safe & Local** — computations and experiments stay on this machine; no real funds or network.
  - **Customizable Experience** — choose learning pace, appearance, and easy local mining settings.
- A local blockchain/network illustration on the right or as a responsive visual below the hero. Use locally bundled SVG/CSS or a repository asset; no external image request at runtime.
- Primary CTA: **Get Started**.

### Step 2 — Choose Mode

Offer two accessible, clearly contrasted choice cards. This is a proposed interpretation of “Choose Mode” in the reference; it controls guidance density only and never changes consensus rules or computation:

- **Guided learning** (recommended/default): inline explanations, hints, and small prompts are visible.
- **Explore freely**: concise labels and fewer prompts; all explanations remain available via help controls.

Allow selecting by click, keyboard, and screen reader. Use a radio group or equivalent accessible single-choice semantics, not visually clickable cards without a role. Explain that the selection can be changed in Settings. Keep this distinct from system/theme mode.

### Step 3 — Appearance

Offer **System** (selected by default), **Light**, and **Dark**. Preview the theme in small UI samples, but ensure those previews use semantic tokens and do not make interactive-looking fake controls. Explain that System follows Fedora's appearance preference. Persist the selection. If the system setting changes, only System mode changes.

### Step 4 — Ready

Summarize the chosen learning mode and appearance, reassure users that all labs are local and educational, and provide the final CTA **Start Learning**. Completing the step marks onboarding complete persistently, then transitions to Home. If persistence fails, show an actionable error and do not pretend setup was saved.

## 6. Screens and feature requirements

Every screen must have a title, short orientation copy, predictable controls, loading/empty/error states, keyboard access, and a path to relevant help. Keep complex technical values copyable. Display truncated hashes only when the complete hash is available via copy/details/accessible label; include a tooltip or disclosure rather than silently omitting characters.

### Home

Purpose: orient the learner and resume/start an experiment.

- Heading and concise explainer, with **Start Learning** or **New Experiment** as the primary action.
- A small visual of connected blocks, using the app's amber and charcoal palette.
- “Quick Start” cards for Hash Lab, Block Lab, Mining, Chain Lab, Transactions, and Experiments.
- Each card has an icon, title, one-sentence purpose, and a clear link/button. Do not duplicate full screen functionality inside cards.
- Show recent experiments if available; otherwise show a friendly empty state with a create action.
- A subtle status row can show local/offline and selected mode.

### Peer Network

Purpose: compare independent chain copies and illustrate why peers may hold different valid block hashes.

- Add **Peer Network** to the persistent workspace navigation and Home quick starts.
- Overview lists Rust-managed peers, validated chain height, actual tip hash, and cumulative-work units. Peer state is in memory and resets when the app restarts.
- Create peers by copying another peer's current chain; remove peers with confirmation. Peer labels are not network addresses and no port/socket settings are exposed.
- Mine a block independently on any peer. Compare two distinct chains, common ancestor, actual block hashes, and cumulative work. Manually propagate either chain; Rust adopts it only if it is valid and strictly has greater work.
- Every peer uses the same fixed easy target, so displayed work is the count of valid headers. Explain that this is a local simulation, not target-weighted Bitcoin consensus or network P2P.

### Hash Lab

Purpose: demonstrate SHA-256 and double-SHA-256 as deterministic functions and the avalanche effect.

- Text input area with example/default data and a clear/reset action.
- On explicit submit or reactive edit (prefer reactive for a small input, with debounce only if necessary), present SHA-256 and double-SHA-256 output as separate labeled results.
- Copy action per digest with accessible success feedback.
- “Avalanche effect” explanation: changing a small part of input produces a very different output. If showing a before/after comparison, identify which text is baseline and which is current.
- Optional compact bit/hex visualization only if it remains readable and is not used instead of the full hash.
- Hashes are computed by Rust once available; show pending/error states during calls and do not maintain a competing frontend hash implementation.

### Block Lab

Purpose: show which header fields are hashed and how edits affect validity.

- Header fields: version, previous-block hash, Merkle root, timestamp, compact target (`nBits`), and nonce, using Rust model values and validation.
- Show serialized header (hex), double-SHA-256 hash, target, and comparison/validity status.
- A focused header card with editable fields and derived-value result card. Keep long values readable using monospace and copy controls.
- Explain that editing a committed header field changes the hash. For non-genesis blocks, previous hash must link to the parent block.
- Mining CTA starts a Rust job and shows progress; if mining is being explored in the dedicated Mining screen, link to it while preserving the selected experiment/block context.
- Clearly separate user-editable fields from derived/read-only hash values. Invalid field input should identify the field and not corrupt the last valid backend state.

### Mining

Purpose: make proof-of-work search visible and interactive without claiming Bitcoin-scale mining.

- Explain the local easy target and state prominently that the difficulty is for learning, not Bitcoin network difficulty.
- Show selected experiment/block, target, current candidate hash, nonce/attempts, elapsed time, and hash rate when backend provides it.
- A clear progress/status treatment: Ready, Mining, Found, Cancelled, or Error. Do not invent a percentage when the search space/probability does not support a meaningful completion estimate.
- During mining, provide **Cancel** and disable conflicting actions only as needed. Cancellation must leave the model in a coherent state.
- Use progress updates from Rust, not a frontend busy loop. Throttle/render bounded updates; never update React for every nonce.
- On success, show the found nonce and resulting hash, and update the relevant block/chain view from authoritative backend state.
- Handle no solution/target limits and errors explicitly.

### Chain Lab

Purpose: make parent-hash links and cascading invalidation visible.

- Present a small chain as vertically stacked cards or a horizontal scroll only when there is a clear responsive reason. Desktop cards show block height/index, short hash, previous hash, transaction count, and status.
- Selecting a block opens its details or focuses an editor panel.
- Show genesis distinctly; show each later block's link to its previous hash.
- Editing a block causes downstream invalidation. Show the exact cause and which descendants need revalidation/re-mining; do not imply that merely editing the first block automatically restores the chain.
- Include **Add Block**, **Mine**, and **Reset Example** controls where supported. Confirm destructive/reset actions when they would discard user edits.
- Use icons/labels plus red status to identify invalid descendants; preserve unaffected blocks' normal appearance.

### Transactions & Rewards

Purpose: demonstrate UTXO-based transactions, fees, coinbase rewards, and Merkle commitments.

- Use a tabbed or segmented layout for **Transactions**, **UTXOs**, and **Merkle Tree**, following the collage reference. Tabs must be keyboard-operable and announce selection.
- The current **Create, sign & apply** action runs a Rust-owned 50,000,000-unit coinbase-funded example. The learner supplies an integer output amount and fee; Rust generates an ephemeral Ed25519 signer, signs one input, validates the spend, and updates the temporary UTXO set.
- If a formatted BTC-like display is used, make its unit explicit and convert only at the presentation boundary; this app's units are educational.
- Show the backend validation result, input/output totals, calculated fee, transaction ID, and verified signature count. Invalid amounts and command errors are explicit.
- Explain fees as input total minus output total. The demonstration coinbase is capped at 50,000,000 learning units; this is a fixed teaching allowance, not a subsidy schedule.
- UTXO view shows the real temporary post-spend outpoints, values, and recipient public-key prefixes. Each run creates a fresh ledger.
- Merkle Tree view shows transaction IDs paired and hashed up to the root; explain odd-leaf handling as used by the Rust implementation. Make root visibly connect to selected block header.
- Keys are generated and kept in the Rust command for one demo request; no private key is returned or persisted. Explain that Ed25519 checks do not implement Bitcoin Script, a wallet, or real transaction authorization.
- The sample transaction and UTXO set are not committed into the header/peer chain. A learner may explicitly save its result as an experiment snapshot; it is not autosaved.

### Experiments (SQLite snapshots)

Purpose: let users preserve isolated work and revisit previous runs.

- List experiment name, experiment type/lesson, last updated time, short description, and relevant status.
- Primary **New Experiment** action and empty state for the first visit.
- Open the stored JSON payload, rename, duplicate, export, and delete actions. The payload is persisted by Rust in SQLite under the Tauri app-data directory.
- Transaction, linked-chain, and peer screens expose an explicit save-snapshot action. Experiments are not a live selection shared across labs, and changes are not autosaved.
- Confirm deletion and any destructive import/replace. Show explicit success/error feedback.
- Provide search/filter only when it improves a meaningful list; avoid a fake dashboard of statistics.
- Action/event history is not implemented yet; do not imply that changing a lab automatically updates an experiment snapshot. Explicitly saved snapshots preserve the result at save time.
- Import/export is JSON. Imports create new records and enforce the backend snapshot size/name limits; imported payloads are data, not validated blockchain state. Older metadata-only browser exports remain importable.
- No cloud sync; active in-process peers reset on application restart.

### Settings

- Appearance: System / Light / Dark, with an immediate preview and persistent setting.
- Learning mode: Guided learning / Explore freely.
- Learning defaults: easy mining target/difficulty preset if exposed by backend; clearly label units and constraints.
- Accessibility: reduced motion follows OS by default; optionally offer a direct override only if the app can implement it consistently. Support larger text/zoom behavior and high contrast.
- About: educational/non-compatible notice, local-only statement, app version, and links to project documentation/source when available.
- A **Replay first-run setup** action resets onboarding completion only after confirmation; it must not erase experiments.

## 7. Component and source organization

Use feature-oriented folders and keep components small. Adapt naming as implementation evolves, but preserve these responsibilities:

```text
src/
  app/
    AppShell.tsx            onboarding/workspace routing and shell
    navigation.ts           screen identifiers and nav metadata
    AppProviders.tsx        theme, preferences, experiment context
  features/
    onboarding/             four-step first-run wizard
    home/                   welcome and quick-start cards
    hash-lab/
    block-lab/
    mining/
    chain-lab/
    transactions/
    experiments/
    settings/
  components/
    Sidebar, PageHeader, Card, Button, Field, StatusBadge,
    CopyButton, EmptyState, ConfirmDialog, Tabs, Tooltip
  services/
    blockchain.ts           typed Rust invoke/channel adapter
    preferences.ts          persisted theme and learning preferences
    experiments.ts          experiment list/save/import/export adapter
  types/
    api.ts                  frontend types matching Rust serialized DTOs
  styles/
    tokens.css              light/dark semantic variables
    global.css              reset, typography, focus, app layout
    motion.css              reusable motion and reduced-motion rules
  main.tsx
```

This is a target structure, not a demand to pre-create empty files. Build the shell and first complete screens incrementally. Avoid a giant conditional `App.tsx`, duplicate style literals, and domain logic hidden in display components.

### Reusable components

- **Button:** primary, secondary, quiet, and destructive variants; explicit disabled/loading state; no generic success styling for ordinary actions.
- **StatusBadge/StatusCallout:** typed semantic status, icon, label, explanation; accessible live announcement only when state changes meaningfully.
- **Card:** consistent surface, radius, border, and spacing; avoid nesting cards without hierarchy.
- **Field:** visible label, help text, validation message, required state, and keyboard focus. Placeholders are examples only, not labels.
- **CopyButton:** copy full value; announce “Copied” to assistive technology and provide a visible but temporary confirmation.
- **Dialog:** accessible title, focus handling, Escape behavior, and explicit cancel/confirm buttons for destructive operations.
- **Tabs:** semantic tab pattern with keyboard navigation and visible selected/focus states.

## 8. Frontend/backend boundary

Rust owns blockchain data, cryptographic hashes, serialization, proof-of-work validation, UTXO rules, demo transaction/signature validity, Merkle roots, peer-chain validity/work comparison, and saved experiment records. Never recompute these in React to “preview” a result. The current generic experiment snapshot is not automatically bound to lab state.

Build a typed frontend service layer around Tauri `invoke()` and the supported Tauri channel/event mechanism. Screens should call service functions rather than invoke commands directly. The current adapter exposes the implemented hash, header, mining, transaction demo, experiment CRUD, and peer simulation commands.

Expected command capability groups:

- Setup/preferences: get and save onboarding completion, theme choice, and learning mode.
- Experiments: list, create, load, update, duplicate, rename, delete, import, and export JSON snapshots through SQLite-backed Rust commands.
- Labs: compute/display hashes, inspect headers and chains, run the signed transaction/UTXO example, and calculate Merkle roots.
- Peers: list/create/remove peers, mine a peer block, compare two chains, and manually propagate the stronger chain.
- Mining: start job with progress channel, cancel job, get final result.

Backend calls must be modeled as pending/success/error states. Disable duplicate submits when appropriate, avoid stale responses replacing a newer selection, and show actionable error messages. Do not silently replace failed backend calls with mock data. Peer simulation itself is local and must be labeled as not using real network transport.

Use channels or a bounded progress stream for mining status; don't broadcast every attempt. Clean up event listeners when components unmount or selected jobs change. Keep UI responsive and ensure cancellation works when navigating away.

## 9. Motion and interaction

Motion should reinforce continuity, not decorate every element.

- First-run **Get Started** transitions into the app workspace with a smooth, short scale/fade/slide that feels fluid. Avoid full-screen zooms, overshoot, and long delays.
- Onboarding step changes use a subtle horizontal transition and keep the wizard frame stable.
- Workspace navigation can crossfade/slide content a few pixels; sidebar itself should not jump.
- Cards/buttons use small hover/focus/pressed feedback, with no layout shift.
- Mining progress updates should be visualized smoothly but throttled and truthful.
- Respect `prefers-reduced-motion: reduce`: remove spatial transitions and animated shimmer; keep state changes immediate and fully understandable.
- Avoid flashing, blinking, rapid repeated color changes, or animation as the only indication of progress/state.
- Ensure the app remains usable if animations are disabled or do not run under WebKitGTK.

## 10. Responsive, accessibility, and Fedora/WebKit details

- Work at the reference desktop size and at smaller resizable window widths. Sidebar may compact; forms should stack; transaction panels should reflow; long hashes should wrap or scroll inside their own bounded code field, never expand the whole window.
- Use semantic headings, navigation landmarks, buttons/links, labels, tab semantics, and status announcements.
- All interactive controls work with keyboard and have visible focus. Preserve logical focus after route/screen changes and dialog close.
- Provide accessible names for icon-only controls (copy, close, menu); use `aria-hidden` for decorative icons.
- Use persistent labels instead of placeholders alone. Keep validation message adjacent to the invalid field.
- Do not rely on hover for essential content; desktop users may use keyboard or assistive input.
- Avoid platform-specific fonts unavailable on Fedora; use robust system font fallbacks. Do not download fonts at runtime.
- Test CSS features and animation in Fedora's WebKitGTK runtime, not only Chromium-based browser dev tools. Prefer well-supported CSS and provide fallbacks.
- Use Fedora-native window actions behind the integrated title bar; avoid macOS traffic lights and macOS-specific APIs.
- Support zoom/text enlargement without clipping. Verify dark mode, light mode, keyboard-only use, high contrast, and reduced motion.

## 11. Implementation phases

Build in vertical slices. Keep every phase runnable.

1. **Shell and tokens:** Replace the template with global styles, theme provider (System/Light/Dark), persistent sidebar shell, responsive sizing, and a simple route/screen state model.
2. **First-run onboarding:** Build four wizard steps, preferences, completion persistence adapter, error state, and reduced-motion transition. On first launch test the onboarding path; on later launch test direct workspace path.
3. **Home and shared components:** Add quick-start cards, empty/recent experiment surface, page headers, cards, fields, status badges, buttons, tabs, copy actions, and dialogs.
4. **Hash and block labs:** Wire form state to typed service boundaries; render authoritative hash/header result DTOs and field/domain errors.
5. **Mining and chain:** Add progress/cancel lifecycle and block/descendant validation states.
6. **Transactions and rewards:** Add transaction/UTXO/Merkle views and clear limits around signatures and simplified rules.
7. **Experiments and settings:** Add saved experiments/history, local import/export flow, preference controls, and onboarding replay.
8. **Polish and validation:** Verify both themes, WCAG contrast, onboarding persistence, no first-paint theme flash, responsive reflow, keyboard/focus behavior, reduced motion, and Fedora WebKitGTK rendering.

Do not fill screens with invented blockchain facts while the backend is incomplete. A clearly labeled development placeholder is preferable to fabricated values.

## 12. Completion checklist

The frontend is ready for integration when:

- The first launch shows onboarding; completing it is persisted; subsequent launches go to the workspace.
- Theme defaults to **System** and reacts to Fedora appearance changes. Manual Light/Dark overrides persist.
- The workspace has persistent, accessible navigation for all agreed labs, Experiments, and Settings.
- Visual hierarchy and card treatment match the reference in both appearances; the integrated title bar uses Linux window actions, not macOS window buttons.
- Every screen includes appropriate pending, empty, valid, invalid, and error states without mislabeling “unknown” as “valid.”
- Validity uses color, icon/shape, label, and explanation.
- Hash, target, transaction, and chain conclusions come from Rust, not duplicated frontend calculations.
- Mining progress remains responsive, is rate-limited, cancellable, and has truthful status.
- Long hashes/serialized data do not break layout; copy affordances operate on the complete value.
- Keyboard navigation, screen-reader naming, visible focus, reduced motion, and high contrast are checked.
- Production frontend does not silently fall back to mock data.
- `npm run build` (or the repository's configured package-manager equivalent) passes, and the Tauri app is checked in Fedora Linux 45/WebKitGTK at desktop and narrow window sizes.

## 13. Design and technical references

- User-provided `Learning Blockchain UI Concept Collage.png` — main workspace, lab screens, statuses, and design-token reference.
- User-provided `Learning Blockchain Welcome Screen.png` — first-launch, four-step setup visual reference.
- [`BUILDING.md`](BUILDING.md) — feature scope, blockchain model, backend ownership, color foundations, and delivery order.
- [Apple Human Interface Guidelines: Color](https://developer.apple.com/design/human-interface-guidelines/color) — semantic colors, appearance variants, and non-color state cues; use as design inspiration, not as a macOS platform implementation spec.
- [GNOME HIG: UI Styling](https://developer.gnome.org/hig/guidelines/ui-styling.html) — light/dark/system appearance, high contrast, and restrained custom styling.
- [GNOME HIG: Accessibility](https://developer.gnome.org/hig/guidelines/accessibility.html) — accessible names, keyboard, screen reader, and high-contrast testing.
- [WCAG 2.2: Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), and [Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html).
- [Tauri v2: Calling Rust from the frontend](https://v2.tauri.app/develop/calling-rust/) and [Calling the frontend from Rust](https://v2.tauri.app/develop/calling-frontend/) — command, error, async, and channel/event integration.
- [Tauri v2: Webview versions](https://v2.tauri.app/reference/webview-versions/) — Linux uses WebKitGTK; verify the actual platform runtime.
