# 🌌 VOID
### The Spatial, Persistent Web Canvas

> "VOID is a desktop browser that replaces the tab metaphor with a persistent spatial canvas. Web pages exist as cards on an infinite 2D plane. There are no tabs, no address bar, no persistent UI chrome. All interaction flows through a single command palette."

---

## 👁️ The Vision

In standard web browsers, tabs are a file folder system designed in the 1990s. They force your thoughts into linear rows, hidden from view, accumulating memory until your computer slows to a crawl.

**VOID** frees your web browsing. Web pages are cards floating in an infinite, zoomable 2D plane. You pan through your research, group pages spatially, and draw connection lines between concepts. When you zoom into a card, it becomes a live interactive window; when you zoom out, it quietly goes to sleep, cached as a beautiful static image.

---

## ⚡ Key Architectural Features

*   **Thermal Snapshot Architecture**: To run dozens of pages on only **8GB of RAM**, VOID enforces a strict **Single-Live-Card** rule. Exactly one card (the focused one) runs a live Tauri Chromium process. Unfocused cards exist in three thermal states:
    *   **🔥 Hot** (active < 5m): Automatically refreshed every 8 seconds in the background by a single hidden cycles window.
    *   **☀️ Warm** (active > 5m): Instantly pre-fetched and refreshed as your mouse cursor hovers near the card edge.
    *   **❄️ Cold** (restored session): Loaded as a static local PNG snapshot from your hard drive, consuming 0MB of renderer memory until you double-click to wake it up.
*   **Keyboard-Driven Command Palette**: Press `Space` to summon a frameless command palette overlay. Access everything with a custom, Levenshtein-adjacent fuzzy matching engine.
*   **Vectorial Concept Links**: Connect cards together with curved, cubic Bezier vector lines. Label relations, and VOID will dynamically calculate text placements perpendicular to the curve's tangent.
*   **Persistent SQLite Layouts**: Save entire layout states—including viewport scale, panning coordinates, card shapes, and SVG connections—into atomic sessions.

---

## ⌨️ Command Cheat Sheet

Invoke the command palette by tapping **`Space`**. 

| Command | Keywords | Parameters | Action |
|---|---|---|---|
| `open` | `new`, `url`, `http` | `<url>` | Opens a new page card at viewport center |
| `focus` | `zoom in`, `read` | — | Flies the camera into the last hovered card |
| `void` | `zoom out`, `overview` | — | Zooms out until all cards are visible |
| `name` | `rename`, `label` | `<text>` | Assigns a custom name tag to the card |
| `zoom` | `go to`, `find` | `<card name>`| Fuzzy searches card names and flies view to it |
| `connect` | `link`, `relation` | — | Enter connect mode: click card A then card B |
| `save` | `layout`, `session` | `<name>` | Serializes canvas to SQLite & saves PNG preview |
| `restore`| `load`, `open layout`| `<name>` | Instantly loads layout positions & snap textures |
| `kill` | `close`, `remove` | — | Deletes card, snapshot files, and relations |

---

## 🎮 Navigation Controls

*   **Pan Space**: Drag with **`Middle Mouse Click`**, or drag with **`Space + Left Click`**, or use a trackpad's **`Two-Finger Swipe`**.
*   **Zoom Camera**: Spin your **`Scroll Wheel`** or **`Pinch Trackpad`**. Zoom anchors dynamically towards your **mouse cursor**.
*   **Instant Focus**: **`Double-Click`** any static card to smoothly fly in and begin interacting.
*   **Instant Void**: Tap **`Escape`** from focus mode to snap the card, close its webview, and zoom out.

---

## 🎨 Creative Color Palette

VOID uses a strict, developer-centric dark palette to keep the focus entirely on the spatial content:

```css
:root {
  --bg:               #0a0a0a;   /* canvas infinite void */
  --dot-grid:         #1a1a1a;   /* cache-tiled dot grid */
  --card-border:      #222222;   /* inactive card bounds */
  --card-active:      #e0e0e0;   /* active/hovered focus border */
  --card-name:        #888888;   /* card domain label */
  --connection:       #3a3aff;   /* curved Bezier link paths */
  --connection-label: #5a5aff;   /* relational text */
  --palette-bg:       #111111;   /* command palette background */
  --palette-accent:   #ffffff;   /* command palette highlights */
}
```

---

## 🛠️ Developer Setup

Requirements: [Node.js 20+](https://nodejs.org/), [pnpm 9+](https://pnpm.io/), and the [Rust toolchain](https://www.rust-lang.org/tools/install).

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/r-Shivansh01/Void_browse.git
    cd Void_browse
    ```

2.  **Install dependencies**:
    ```bash
    pnpm install
    ```

3.  **Run in developer hot-reload mode**:
    ```bash
    pnpm tauri dev
    ```

4.  **Build production installers locally**:
    ```bash
    pnpm tauri build
    ```

---

## 📦 Installer Compilation (CI/CD)

VOID uses a pre-configured GitHub Actions builder at `.github/workflows/release.yml`. 

To compile fresh platform installers (`.dmg`, `.msi`, `.deb`), simply push a release version tag:
```bash
git tag v1.0.0
git push origin v1.0.0
```
This boots cloud virtual macOS, Windows, and Linux machines to build the double-clickable binaries and publishes them directly to your repository's **Releases** tab!

---

*VOID v1.0 — a spatial web canvas. No more, no less.*
