# Architecture Overview

## System Design

Dump Vault is built on **Electron + React** with a **process-per-window model** and **IPC (Inter-Process Communication)** for bridging the main and renderer processes.

```
┌─────────────────────────────────────────────────────────────┐
│                    MAIN PROCESS (Node.js)                   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  electron/main.cjs                                   │   │
│  │  • Global hotkey listener (Ctrl+Shift+D)             │   │
│  │  • Window creation & lifecycle                       │   │
│  │  • IPC handlers (save/load data)                     │   │
│  │  • Auto-hide on blur                                 │   │
│  └────────────────────┬─────────────────────────────────┘   │
│                       │                                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  electron/storage.cjs                                │   │
│  │  • Load/save items.json                              │   │
│  │  • File deduplication (SHA256)                       │   │
│  │  • Vault directory management                        │   │
│  │  • UUID generation                                   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└──────────────────────────┬───────────────────────────────────┘
                           │
                      IPC Messages
                           │
┌──────────────────────────┴───────────────────────────────────┐
│                RENDERER PROCESS (Browser)                    │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  electron/preload.cjs                                │   │
│  │  • Context isolation bridge                          │   │
│  │  • Safely expose IPC methods to renderer             │   │
│  │  • window.electronAPI API                            │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  src/App.jsx (React Component)                       │   │
│  │  • Text input mode                                   │   │
│  │  • Drag-and-drop mode                                │   │
│  │  • Mode switching logic                              │   │
│  │  • Event handling (keyboard, drag)                   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  src/App.css + index.css                             │   │
│  │  • Gradient backgrounds                              │   │
│  │  • Animations & transitions                          │   │
│  │  • Button states                                     │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

## Data Flow

### Text Save Flow

```
User types text in textarea
         ↓
Presses Ctrl+Enter or clicks Save
         ↓
App.jsx: handleSaveText() called
         ↓
window.electronAPI.saveText(text)
         ↓
IPC: main.cjs receives "save-text"
         ↓
storage.cjs: addTextItem(text)
         ↓
Generate UUID + timestamp
         ↓
Append to items.json
         ↓
Return saved item to renderer
         ↓
Clear textarea, show visual feedback
```

### File Save Flow

```
User opens popup (Ctrl+Shift+D)
         ↓
User drags file from File Explorer
         ↓
dragenter event fires in App.jsx
         ↓
setMode("drag") → UI switches to drop zone
         ↓
User drops file
         ↓
drop event → get file path
         ↓
window.electronAPI.saveFile(filePath)
         ↓
IPC: main.cjs receives "save-file"
         ↓
storage.cjs: addFileItem(filePath)
         ↓
Calculate SHA256 hash of file
         ↓
Copy file to vault (deduplicated)
         ↓
Append metadata to items.json
         ↓
Return saved item to renderer
         ↓
Switch back to text mode
```

## State Management

### Popup Window State

```javascript
// main.cjs
let popupWindow;      // BrowserWindow instance
let popupVisible;     // boolean - display state
let hideTimeout;      // timeout ID for auto-hide

// Flow:
// 1. User presses Ctrl+Shift+D
// 2. globalShortcut callback fires
// 3. showPopupWindow() → popupWindow.show() + focus()
// 4. popupVisible = true
// 5. When popup loses focus → hideTimeout set
// 6. hidePopupWindow() → popupWindow.hide()
// 7. popupVisible = false
```

### UI Mode State (React)

```javascript
// App.jsx
const [mode, setMode] = useState("text");  // "text" or "drag"
const [text, setText] = useState("");      // textarea content
const [isDragging, setIsDragging] = useState(false);

// Mode transitions:
// 1. Popup opens → mode = "text"
// 2. dragenter event → mode = "drag", isDragging = true
// 3. File dropped → mode = "text", isDragging = false
// 4. User saves → mode = "text", text = ""
```

## IPC Communication Protocol

### Available IPC Handlers (main.cjs)

```javascript
ipcMain.handle("save-text", async (event, text) => {
  // Input: text (string)
  // Output: { id, type, content, timestamp }
})

ipcMain.handle("save-file", async (event, filePath) => {
  // Input: filePath (string)
  // Output: { id, type, filename, path, hash, timestamp }
})

ipcMain.handle("get-items", async (event) => {
  // Input: none
  // Output: array of all items
})

ipcMain.handle("delete-item", async (event, id) => {
  // Input: id (string)
  // Output: void
})
```

### API Exposure (preload.cjs)

```javascript
window.electronAPI = {
  saveText: (text) => ipcRenderer.invoke("save-text", text),
  saveFile: (filePath) => ipcRenderer.invoke("save-file", filePath),
  getItems: () => ipcRenderer.invoke("get-items"),
  deleteItem: (id) => ipcRenderer.invoke("delete-item", id),
}
```

## Storage Architecture

### Directory Structure

```
%APPDATA%/dump-vault/userData/vault/
├── items.json              # Metadata for all items
├── [sha256].pdf            # Stored file (hash-based name)
├── [sha256].png
├── [sha256].doc
└── [sha256].[ext]          # Any file type
```

### Data Schema

```javascript
// Text Item
{
  id: string,              // UUID v4
  type: "text",            // Literal
  content: string,         // Full text content
  timestamp: string        // ISO 8601
}

// File Item
{
  id: string,              // UUID v4
  type: "file",            // Literal
  filename: string,        // Original filename
  path: string,            // Full path in vault
  hash: string,            // SHA256 of file content
  timestamp: string        // ISO 8601
}
```

## Component Responsibilities

### electron/main.cjs

**Responsibilities:**
- Initialize app and create popup window
- Register global hotkey (`Ctrl+Shift+D`)
- Manage window visibility (show/hide)
- Auto-hide on window blur
- Handle app lifecycle events
- Route IPC messages to storage

**Key Methods:**
- `createPopupWindow()` - Creates hidden BrowserWindow
- `showPopupWindow()` - Shows and focuses window
- `hidePopupWindow()` - Hides window
- `setupGlobalHotkey()` - Registers `Ctrl+Shift+D`

### electron/storage.cjs

**Responsibilities:**
- Persistent storage (JSON file)
- File management (copy, hash, deduplicate)
- UUID generation
- Directory initialization

**Key Methods:**
- `addTextItem(text)` - Save text with metadata
- `addFileItem(filePath)` - Copy file and save metadata
- `getItems()` - Load all items
- `deleteItem(id)` - Remove item and cleanup file
- `ensureVaultDir()` - Create vault directory if missing

### electron/preload.cjs

**Responsibilities:**
- Establish secure IPC bridge
- Expose a minimal, sandboxed API
- Prevent renderer access to Node.js

**Exports:**
- `window.electronAPI` object with 4 methods

### src/App.jsx (React)

**Responsibilities:**
- Render UI based on mode (text or drag)
- Handle keyboard events (Ctrl+Enter, clipboard)
- Handle drag-and-drop events
- Smooth state transitions
- Call IPC methods via `window.electronAPI`

**Key Functions:**
- `handleSaveText()` - Save textarea content
- `handlePasteClick()` - Read clipboard
- `dragenter/dragleave/drop` event handlers

### src/App.css

**Responsibilities:**
- Purple gradient background
- Button styling (Paste, Save)
- Drag-and-drop zone styling
- Animations (bounce effect)
- Dark theme with white accents

## Security Considerations

### Context Isolation

```javascript
// electron/main.cjs
webPreferences: {
  nodeIntegration: false,        // ✅ Blocks direct Node.js access
  contextIsolation: true,         // ✅ Separate JS contexts
  enableRemoteModule: false,      // ✅ No remote access
  preload: path.join(__dirname, "preload.cjs")
}
```

### Sandboxed API

```javascript
// electron/preload.cjs - Only these methods are exposed:
contextBridge.exposeInMainWorld("electronAPI", {
  saveText: ...,     // ✅ Explicit methods only
  saveFile: ...,
  getItems: ...,
  deleteItem: ...
  // ❌ No process, fs, or path access
})
```

### File Permissions

- Files saved to user's AppData directory (user-owned)
- No system directory access
- No external network calls
- All operations logged in storage

## Performance Optimizations

1. **Deduplication**: Files with same content stored once
2. **Lazy Loading**: Window hidden by default, created once
3. **Auto-Hide**: Popup closes automatically when unfocused
4. **No External Dependencies**: Minimal JavaScript bundle
5. **React 19**: Latest hooks, efficient rendering

## Error Handling

### Storage Errors

```javascript
// storage.cjs
try {
  fs.writeFileSync(ITEMS_FILE, JSON.stringify(items));
} catch (err) {
  console.error("Failed to save items:", err);
  // Silently fail - don't crash app
}
```

### IPC Errors

```javascript
// App.jsx
try {
  await window.electronAPI.saveText(text);
  setText("");
} catch (error) {
  console.error("Failed to save text:", error);
  // User can retry
}
```

## Lifecycle Events

### App Startup

1. Electron `app.whenReady()` fires
2. `createPopupWindow()` creates hidden window
3. `setupGlobalHotkey()` registers `Ctrl+Shift+D`
4. App enters background (no visible window)

### Global Hotkey Pressed

1. `globalShortcut` callback fires
2. `popupVisible` toggled (false → true or true → false)
3. If true: `showPopupWindow()` → focus
4. If false: `hidePopupWindow()` → blur

### Window Loses Focus

1. `popupWindow.on("blur")` fires
2. `hideTimeout` set for 100ms
3. If still blurred: `hidePopupWindow()`
4. `popupVisible = false`

### App Quit

1. `app.on("will-quit")`
2. `globalShortcut.unregisterAll()`
3. Normal cleanup

## Future Architecture Enhancements

- **Database**: SQLite instead of JSON (faster queries)
- **Search Index**: ElasticSearch for instant search
- **Sync**: Local-first sync with optional cloud backup
- **Plugins**: Extensible storage backends
- **Tray Icon**: Quick access menu from system tray

---

**For user-facing documentation, see [README.md](./README.md), [QUICK_START.md](./QUICK_START.md), and [SETUP_GUIDE.md](./SETUP_GUIDE.md).**
