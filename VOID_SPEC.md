# VOID — Technical Specification
### Version 1.0 · Tauri v2 + Snapshot Architecture · 8GB-capable

---

## 1. Project Overview

VOID is a desktop browser that replaces the tab metaphor with a persistent spatial canvas. Web pages exist as cards on an infinite 2D plane. There are no tabs, no address bar, no persistent UI chrome. All interaction flows through a single command palette invoked with `Space`. Sessions are saved and restored as named layouts — complete spatial snapshots of card positions, connections, and viewport state.

**Target platform:** macOS 13+, Windows 11, Linux (Ubuntu 22.04+)  
**Target hardware:** 8GB RAM minimum (16GB recommended for 10+ card sessions)  
**Distribution:** MIT license, GitHub releases, no app store

---

## 2. Architecture

### 2.1 Rendering Model

One live WebView. All other cards are snapshots.

At any moment, exactly one card is "live" — a real Tauri `WebviewWindow` rendering the active page at full fidelity. Every other card is a static PNG texture composited onto the PixiJS canvas. When the user zooms into a different card, the live WebView is repositioned over that card, a snapshot is taken of the previously focused card, and the canvas texture updates.

This model caps memory at roughly 400–700MB regardless of how many cards are open, because only one Chromium renderer process is active at a time.

### 2.2 Snapshot Lifecycle

Cards exist in three thermal states that determine snapshot freshness:

**Hot** — interacted with in the last 5 minutes. A background WebviewWindow cycles through hot cards and refreshes their snapshots every 8 seconds. At most one background renderer runs at a time.

**Warm** — opened this session but idle for >5 minutes. Snapshot refreshes on cursor hover (300ms pre-fetch before the cursor reaches the card edge).

**Cold** — restored from a saved layout. Snapshot is the PNG persisted to disk from the last session. Refreshes only when the card becomes live.

Snapshot storage: PNG files written to `{app_data_dir}/void/snapshots/{card_id}.png`. Snapshots are not committed to the layout SQLite DB — they live on disk as loose files keyed by card UUID.

### 2.3 Canvas

The main window is a PixiJS scene running in a Tauri WebviewWindow set to full screen. It has no browser chrome — no scrollbars, no window decorations beyond the OS titlebar (hidden on macOS via `decorations: false`).

The PixiJS stage has a single root container (`stage.canvas`) whose `position` and `scale` represent the current pan and zoom. All card sprites and the SVG connection overlay are children of this container. Animating pan/zoom means animating `stage.canvas.position` and `stage.canvas.scale` — nothing else changes.

Card sprites are `PIXI.Sprite` objects with their texture set to the current snapshot PNG. The live card has its sprite hidden; the native WebviewWindow sits on top at the exact same screen coordinates.

### 2.4 Process Map

```
Main Process (Rust / Tauri)
├── IPC command bus (Tauri commands)
├── SQLite via tauri-plugin-sql
├── Snapshot manager (schedules background refreshes)
├── WebviewWindow: main canvas (PixiJS + React UI)
├── WebviewWindow: live card (active page, 1 at a time)
└── WebviewWindow: background refresher (snapshot cycling, 0–1 active)
```

---

## 3. Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Shell | Tauri | v2.x |
| Backend | Rust | stable |
| Canvas | PixiJS | 8.x |
| UI overlays | React + TypeScript | React 18 |
| Animation | GSAP | 3.x |
| Persistence | SQLite via tauri-plugin-sql | latest |
| Build | Vite | 5.x |
| Package manager | pnpm | 9.x |

---

## 4. File Structure

```
void/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs               # Tauri app entry, window setup
│   │   ├── commands/
│   │   │   ├── card.rs           # open_card, close_card, focus_card, snapshot_card
│   │   │   ├── layout.rs         # save_layout, restore_layout, list_layouts
│   │   │   └── canvas.rs         # get_canvas_state, set_canvas_state
│   │   ├── snapshot.rs           # background snapshot scheduler
│   │   ├── db.rs                 # SQLite schema init, query helpers
│   │   └── live_view.rs          # live WebviewWindow lifecycle manager
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/
│   ├── main.tsx                  # React entry point
│   ├── canvas/
│   │   ├── PixiCanvas.tsx        # PixiJS scene mount, pan/zoom
│   │   ├── CardSprite.ts         # Card sprite class, texture management
│   │   ├── ConnectionLayer.tsx   # SVG overlay for connections
│   │   └── useCanvasInput.ts     # Mouse/touch event handler, hit testing
│   ├── palette/
│   │   ├── CommandPalette.tsx    # Palette UI component
│   │   ├── commands.ts           # Command registry
│   │   └── fuzzy.ts              # Fuzzy search implementation
│   ├── store/
│   │   ├── cards.ts              # Card state (zustand)
│   │   ├── canvas.ts             # Pan/zoom/viewport state
│   │   └── layouts.ts            # Layout metadata
│   ├── hooks/
│   │   ├── useKeyboard.ts        # Global key intercepts
│   │   └── useLiveView.ts        # Live WebviewWindow sync
│   ├── types.ts                  # Shared TypeScript types
│   └── index.css                 # Global styles, CSS variables
├── package.json
└── vite.config.ts
```

---

## 5. Data Model

### 5.1 SQLite Schema

```sql
CREATE TABLE layouts (
  id          TEXT PRIMARY KEY,       -- UUID v4
  name        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,       -- Unix ms
  updated_at  INTEGER NOT NULL,
  pan_x       REAL NOT NULL DEFAULT 0,
  pan_y       REAL NOT NULL DEFAULT 0,
  zoom        REAL NOT NULL DEFAULT 1.0,
  thumbnail   TEXT                    -- path to PNG snapshot of canvas
);

CREATE TABLE cards (
  id          TEXT PRIMARY KEY,       -- UUID v4
  layout_id   TEXT NOT NULL REFERENCES layouts(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  name        TEXT,                   -- user-assigned name, nullable
  x           REAL NOT NULL,
  y           REAL NOT NULL,
  width       REAL NOT NULL DEFAULT 960,
  height      REAL NOT NULL DEFAULT 640,
  scroll_x    REAL NOT NULL DEFAULT 0,
  scroll_y    REAL NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

CREATE TABLE connections (
  id          TEXT PRIMARY KEY,
  layout_id   TEXT NOT NULL REFERENCES layouts(id) ON DELETE CASCADE,
  from_card   TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  to_card     TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  label       TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_cards_layout ON cards(layout_id);
CREATE INDEX idx_connections_layout ON connections(layout_id);
```

### 5.2 Runtime Card State (TypeScript)

```typescript
interface Card {
  id: string
  layoutId: string
  url: string
  name: string | null
  x: number           // canvas-space coordinates
  y: number
  width: number
  height: number
  scrollX: number
  scrollY: number
  thermal: 'hot' | 'warm' | 'cold'
  snapshotPath: string | null
  isLive: boolean
}

interface CanvasState {
  panX: number
  panY: number
  zoom: number        // 0.05 = full void-out, 1.0 = 1:1, up to 3.0
}

interface Connection {
  id: string
  fromCard: string
  toCard: string
  label: string
}
```

---

## 6. Canvas Behavior

### 6.1 Coordinate System

Canvas-space is a float coordinate plane, independent of screen resolution. Cards are positioned by their `x, y` canvas-space coordinates. The viewport transform is:

```
screen_pos = (canvas_pos * zoom) + pan
canvas_pos = (screen_pos - pan) / zoom
```

Pan is stored as the canvas-space position of the viewport's top-left corner. Zoom is a scalar.

### 6.2 Pan and Zoom

- **Pan:** Middle mouse button drag, or trackpad two-finger scroll. Updates `pan` immediately, no animation.
- **Zoom:** Scroll wheel (mouse) or pinch (trackpad). Zooms toward the cursor position (anchor point). Updates `zoom` immediately.
- **Zoom bounds:** 0.05 (full void view, all cards visible) to 3.0 (zoomed deep into a card).

### 6.3 Hit Testing

On any mouse event on the canvas, the input handler iterates all card sprites in reverse Z-order and checks whether the transformed event coordinates fall within the card's bounds. If a hit is found and the canvas zoom is ≥ 0.8 (near-focus), the event is forwarded to the live WebviewWindow as a synthesized input. Below 0.8 zoom, clicks are canvas interactions (drag, select), not page interactions.

### 6.4 Focus Mode

Triggered by `focus` command or double-clicking a card. Behavior:

1. Identify the target card's canvas position.
2. GSAP tween `stage.canvas.position` and `stage.canvas.scale` over 350ms (ease: `power2.inOut`) until the card fills the viewport at zoom 1.0.
3. At tween end, hide the card sprite. Position the live WebviewWindow over the card's exact screen coordinates. The WebviewWindow becomes the card.
4. Canvas overlays (dot grid, connection lines, card borders) fade to `opacity: 0` over 200ms.

### 6.5 Void Mode

Triggered by `void` command or pressing `Escape` from focus mode. Behavior:

1. Take a snapshot of the currently focused card.
2. Restore the card sprite with the new snapshot texture. Hide the live WebviewWindow.
3. GSAP tween `stage.canvas.position` and `stage.canvas.scale` until all cards are visible within the viewport (compute bounding box of all card positions, fit with padding).
4. Fade canvas overlays back to full opacity.

---

## 7. Command Palette

### 7.1 Invocation

Global `keydown` listener on `Space` in `useKeyboard.ts` (intercepted at the Tauri window level via `register_shortcut`). The palette renders as a React overlay (`position: fixed`, `z-index: 9999`) centered on screen. `Escape` closes it. `Tab` cycles through fuzzy results. `Enter` executes.

### 7.2 Command Registry

Each command is a typed object:

```typescript
interface Command {
  id: string
  keywords: string[]     // matched by fuzzy search
  description: string
  args?: CommandArg[]    // if present, palette prompts for input after selection
  execute: (args: string[], context: AppContext) => void | Promise<void>
}
```

### 7.3 Full Command List

| Command | Keywords | Args | Behavior |
|---|---|---|---|
| `open` | open, new, url, http | `<url>` | Opens new card at cursor canvas position. If no URL given, opens blank card with URL prompt. |
| `focus` | focus, zoom in, read | — | Zooms into active card (last hovered). Focus mode. |
| `void` | void, zoom out, overview | — | Zooms out until all cards visible. |
| `name` | name, rename, label | `<text>` | Assigns a name to the active card. Shown on card border. |
| `zoom` | zoom, go to, find | `<card name>` | Fuzzy-matches card names. Flies canvas to matching card. |
| `connect` | connect, link, relation | — | Enters connect mode: next two card clicks become source and target. Palette then prompts for label. |
| `save` | save, layout, session | `<name>` | Serializes current canvas to SQLite under given name. Takes canvas thumbnail. |
| `restore` | restore, load, open layout | `<name>` | Fuzzy-matches layout names. Loads layout: spawns cards, restores positions. |
| `layouts` | layouts, sessions | — | Lists saved layouts in palette. Select to restore. |
| `kill` | kill, close, remove | — | Closes active card. Removes from canvas and DB. |
| `kill all` | kill all, clear, reset | — | Closes all cards. Prompts confirmation. |
| `disconnect` | disconnect, unlink | — | Enters disconnect mode: click a connection line to delete it. |

### 7.4 Fuzzy Search

Input is matched against command `keywords` and, for `zoom`, against card names in current session. Matching algorithm: contiguous substring first (highest score), then character-sequence match (Levenshtein-adjacent). Results sorted by score descending. Implementation is a single 60-line function in `fuzzy.ts` — no external library.

---

## 8. Connection Layer

### 8.1 Rendering

An `<svg>` element positioned absolutely over the PixiJS canvas with `pointer-events: none`. Updated whenever card positions or canvas transform changes (via `requestAnimationFrame` throttle, max 30fps for the overlay).

Each connection is a cubic Bezier path. Control points:

```
p0 = card A center-bottom (or center-right if B is to the right of A)
p3 = card B center-top (or center-left)
p1 = p0 offset by (0, +80px screen-space)
p2 = p3 offset by (0, -80px screen-space)
```

Control point offsets are in screen-space so curves look consistent at any zoom level.

Label: `<text>` element positioned at the Bezier midpoint (t=0.5), offset 12px perpendicular to the curve tangent.

### 8.2 Connect Mode

Entered via `connect` command. Canvas enters a two-click state:

1. First click: identify card under cursor (hit test). Highlight it with a 2px bright border pulse.
2. Second click: identify second card. Draw a preview line following the cursor between clicks.
3. Palette auto-opens prompting for label. `Enter` commits the connection to SQLite and redraws overlay. `Escape` cancels.

---

## 9. Layout Save and Restore

### 9.1 Saving

```
save <name>
  1. Begin SQLite transaction
  2. INSERT OR REPLACE INTO layouts with current pan/zoom
  3. DELETE FROM cards WHERE layout_id = this_id (full replace)
  4. INSERT all current cards
  5. DELETE FROM connections WHERE layout_id = this_id
  6. INSERT all current connections
  7. Commit
  8. Render canvas thumbnail (PixiJS renderer.extract.canvas() → PNG, write to disk)
```

### 9.2 Restoring

```
restore <name>
  1. Kill all current live cards (close WebviewWindows)
  2. Load layout row (pan, zoom)
  3. Load all cards for layout_id
  4. Load all connections for layout_id
  5. For each card:
     a. Load snapshot PNG from disk (cold state)
     b. Create PIXI.Sprite with snapshot texture at card.x, card.y
     c. Register card in store
  6. Restore canvas transform (pan, zoom) — instant, no animation
  7. Redraw connection SVG overlay
  8. Mark most recently active card as warm (trigger hover-refresh)
```

The live WebviewWindow is not created during restore. It's created only when the user zooms into a specific card.

---

## 10. Visual Design

### 10.1 Color Tokens

```css
:root {
  --bg:             #0a0a0a;   /* canvas background */
  --dot-grid:       #1a1a1a;   /* dot grid dots */
  --card-border:    #2a2a2a;   /* inactive card border */
  --card-active:    #e0e0e0;   /* focused card border */
  --card-name:      #888888;   /* domain label text */
  --connection:     #3a3aff;   /* connection lines */
  --connection-label: #5a5aff; /* connection label text */
  --palette-bg:     #111111;
  --palette-border: #333333;
  --palette-text:   #e0e0e0;
  --palette-accent: #ffffff;
  --palette-dim:    #555555;
  --cursor:         #ffffff;
}
```

### 10.2 Typography

Single font throughout: `JetBrains Mono` (bundled). Fallback: `monospace`. No system UI font anywhere.

| Element | Size | Weight |
|---|---|---|
| Card domain label | 10px | 400 |
| Card user name | 11px | 500 |
| Palette input | 16px | 400 |
| Palette results | 13px | 400 |
| Connection labels | 10px | 400 |
| Layout names | 12px | 400 |

### 10.3 Dot Grid

Rendered as a PixiJS `Graphics` object, drawn once and cached as a texture that tiles to fill the canvas. Dot radius: 0.8px. Dot spacing: 28px canvas-space (scales with zoom). Color: `#1a1a1a`. The grid is drawn relative to the canvas container transform so it pans and zooms with the space.

### 10.4 Card Appearance

- Background: `rgba(0,0,0,0.0)` — the snapshot fills the card area entirely.
- Border: 1px `--card-border` normally; 1px `--card-active` when cursor is over the card.
- Domain label: absolute top-left of card, `--card-name`, 10px monospace, 8px padding. Stays at constant screen size regardless of canvas zoom.
- User name (if set): displayed below domain, same style, `--palette-accent`.
- Card dimensions default: 960 × 640 canvas-units (roughly a 1:1.5 aspect ratio).

### 10.5 Command Palette

Centered fixed overlay, 580px wide, max-height 400px. Background `--palette-bg`, 1px border `--palette-border`, no border-radius. Input line at top, full width. Fuzzy results below, scrollable. Highlighted result has a `background: #1e1e1e` row. No icons.

---

## 11. Performance Constraints and Mitigations

| Constraint | Mitigation |
|---|---|
| One live Chromium renderer at a time | Never more than one `WebviewWindow` for live card |
| Background snapshot refresher | At most one additional WebviewWindow, cycling through hot cards |
| PixiJS texture updates | Snapshot PNGs loaded via `PIXI.Assets.load(path)`. Textures cached in PixiJS asset cache. Replace texture on sprite, don't recreate sprite. |
| SVG overlay redraws | Throttled to 30fps via rAF. Skip redraw if no card positions changed. |
| Canvas zoom-out with 20+ cards | Card sprites use mipmapped textures (PixiJS default). At zoom < 0.2, card borders hidden to reduce draw calls. |
| Memory per session | Background refresher paused if system memory pressure detected (Tauri system tray plugin query, Linux: `/proc/meminfo`). |

**Expected memory usage:**
- Base app (main window + PixiJS): ~80MB
- Live card WebviewWindow: ~150–300MB depending on page
- Background refresher WebviewWindow: ~100–200MB (light pages for refreshing)
- PixiJS textures (20 card snapshots at 960×640): ~75MB
- SQLite + Rust process: ~20MB
- **Total, 10-card session:** ~430–680MB

---

## 12. Tauri Configuration

### 12.1 `tauri.conf.json` (relevant excerpts)

```json
{
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "VOID",
        "width": 1440,
        "height": 900,
        "decorations": false,
        "transparent": true,
        "resizable": true,
        "fullscreen": false
      }
    ]
  },
  "bundle": {
    "identifier": "void.browser",
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/icon.icns", "icons/icon.ico"]
  },
  "security": {
    "csp": null
  }
}
```

### 12.2 Tauri Permissions (capabilities)

The main window requires: `core:window:allow-set-focus`, `core:webview:allow-create-webview-window`, `tauri-plugin-sql:allow-execute`, `tauri-plugin-sql:allow-select`, `core:path:allow-app-data-dir`, `core:fs:allow-write-file`, `core:fs:allow-read-file`.

### 12.3 Rust Commands (IPC surface)

```rust
// card.rs
#[tauri::command] fn open_card(url: String, x: f64, y: f64) -> Result<Card, String>
#[tauri::command] fn close_card(id: String) -> Result<(), String>
#[tauri::command] fn focus_card(id: String) -> Result<(), String>      // activates live WebviewWindow
#[tauri::command] fn blur_card(id: String) -> Result<String, String>   // takes snapshot, hides WebviewWindow, returns snapshot path
#[tauri::command] fn refresh_snapshot(id: String, url: String) -> Result<String, String>

// layout.rs
#[tauri::command] fn save_layout(name: String, state: CanvasStatePayload) -> Result<String, String>
#[tauri::command] fn restore_layout(id: String) -> Result<LayoutPayload, String>
#[tauri::command] fn list_layouts() -> Result<Vec<LayoutMeta>, String>
#[tauri::command] fn delete_layout(id: String) -> Result<(), String>

// canvas.rs
#[tauri::command] fn get_snapshot_path(card_id: String) -> Result<Option<String>, String>
```

---

## 13. Build and Distribution

### 13.1 Development

```bash
pnpm install
pnpm tauri dev
```

### 13.2 Production Build

```bash
pnpm tauri build
```

Output: platform-specific installers in `src-tauri/target/release/bundle/`.

macOS: `.dmg`  
Windows: `.msi` + `.exe` (NSIS)  
Linux: `.deb` + `.AppImage`

### 13.3 GitHub Release Workflow (`.github/workflows/release.yml`)

Triggers on `v*` tag push. Matrix: `[macos-latest, windows-latest, ubuntu-22.04]`. Each runner installs Rust stable, Node 20, pnpm 9, runs `pnpm tauri build`, uploads artifacts to the GitHub Release. No code signing for v1.0 (users on macOS will right-click → Open on first launch).

---

## 14. Not in v1.0

These are explicitly out of scope. Do not implement:

- Paranoia layer (dark pattern detection, NLP scoring)
- Clusters — formal named groups with rendered boundary borders and collapse/expand behavior. The original concept doc included these, but they are cut for v1.0. Spatial proximity alone carries this function: cards placed near each other are implicitly grouped. No `clusters` table, no cluster UI, no collapse command.
- Multi-device sync
- Extensions / plugin API
- History / back-forward navigation (use `open <url>` to navigate; a card's internal back/forward still works via the live WebviewWindow's native navigation)
- Bookmarks (layouts replace bookmarks entirely)
- Downloads UI (Tauri's default download handler is acceptable for v1.0)
- Tab bar of any kind

---

## 15. Open Questions for Implementation

These are not design decisions — they are implementation details to resolve during build:

1. **Snapshot capture on Tauri:** The primary path is `webview.capture_image()` (Tauri v2 API). Verify this produces acceptable PNG quality at card dimensions before committing to it. Fallback: inject a `html2canvas` script into the page and retrieve the data URL via IPC.

2. **Live WebviewWindow positioning:** Tauri `WebviewWindow` position is in physical pixels. The coordinate transform from PixiJS canvas-space to screen-space physical pixels must account for device pixel ratio. Confirm `window.devicePixelRatio` is accessible from the main WebviewWindow and passed to Rust correctly.

3. **Background refresher WebviewWindow visibility:** The refresher WebviewWindow must not flash on screen. Set `visible: false` on creation and rely on `capture_image()` without ever making it visible. Test on all three platforms — WebView2 on Windows may behave differently from WebKit.

4. **System WebView version gating:** Tauri on Windows requires WebView2. Minimum WebView2 version for acceptable performance: 109+. The installer should check and prompt the user to update WebView2 if needed. Linux WebKitGTK minimum: 2.38.

---

*VOID v1.0 — canvas, cards, command palette, spatial layouts, connections, focus/void modes. No more, no less.*
