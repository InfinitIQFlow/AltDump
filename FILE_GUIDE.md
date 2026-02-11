# File Guide

Quick reference to every file in the project and what it does.

## 📄 Documentation Files

### README.md
**The main project README**
- Overview of features
- Tech stack overview
- Quick start instructions
- Project structure
- Links to detailed docs

### QUICK_START.md
**Step-by-step usage guide**
- How to install & run
- How to test each feature (text mode, drag-drop)
- Keyboard shortcuts reference
- Expected data format
- Troubleshooting common issues
- Testing checklist (important—run through this!)

### SETUP_GUIDE.md
**Detailed feature & customization reference**
- All features explained in depth
- How to customize hotkey, size, colors
- Security notes
- Performance optimizations
- Future enhancement ideas

### ARCHITECTURE.md
**Technical deep dive for developers**
- System design diagrams
- Data flow charts
- Component responsibilities
- IPC protocol definition
- Storage schema
- Error handling strategy
- Performance optimizations

### IMPLEMENTATION_SUMMARY.md
**What was built and how to get started**
- Summary of completed features
- File changes list
- Quick start steps
- Code location reference (where to edit)
- Testing checklist
- Project stats

## 🔧 Source Code Files

### electron/main.cjs
**Electron main process - heart of the app**
- Global hotkey registration (`Ctrl+Shift+D`)
- Popup window creation (BrowserWindow)
- Window visibility control (show/hide/blur)
- IPC handlers (save-text, save-file, get-items, delete-item)
- Auto-hide logic on blur
- Cleanup on app quit
- ~120 lines of code

**Key functions:**
- `createPopupWindow()` - Create the popup (lines 9-35)
- `showPopupWindow()` - Show and focus popup
- `hidePopupWindow()` - Hide popup
- `setupGlobalHotkey()` - Register Ctrl+Shift+D (line 79)

### electron/storage.cjs
**Data persistence - handles everything file-related**
- JSON file reading/writing
- UUID generation for items
- File SHA256 hashing and deduplication
- Vault directory creation
- Functions for adding/removing/listing items
- Meta handling for text (content, timestamp)
- File handling (hash, path, original name)
- ~150 lines of code

**Key functions:**
- `addTextItem(text)` - Save text with metadata
- `addFileItem(filePath)` - Copy file to vault and save metadata
- `getItems()` - Load all items from JSON
- `deleteItem(id)` - Remove item and cleanup files
- `ensureVaultDir()` - Create vault folder if missing

### electron/preload.cjs
**IPC Bridge - secure API exposure**
- Exposes safe API to React component
- Via `window.electronAPI` object
- Prevents direct Node.js access
- ~15 lines of code

**Exposed API:**
- `window.electronAPI.saveText(text)`
- `window.electronAPI.saveFile(filePath)`
- `window.electronAPI.getItems()`
- `window.electronAPI.deleteItem(id)`

## ⚛️ React Component Files

### src/App.jsx
**Main React component - the UI**
- Text input mode (textarea + buttons)
- Drag-and-drop mode (drop zone)
- State management (mode, text, isDragging)
- Event handlers:
  - Keyboard (Ctrl+Enter to save)
  - Drag events (dragenter/over/leave/drop)
  - Clipboard (paste button)
- Auto-mode switching (text ↔ drag)
- ~100 lines of code

**Key state:**
- `mode` - "text" or "drag"
- `text` - textarea content
- `isDragging` - is file being dragged?

**Key functions:**
- `handleSaveText()` - Save textarea via IPC
- `handlePasteClick()` - Read clipboard
- Drag event handlers auto-switch modes

### src/App.css
**Popup styling**
- Purple gradient background
- Textarea styling (white, focused state)
- Button styling (Paste, Save, hover effects)
- Drop zone styling (dashed border, bounce animation)
- Smooth transitions between modes
- ~190 lines of code

**Key classes:**
- `.app-container` - Main background + layout
- `.text-mode` - Text input UI
- `.input-textarea` - Textarea styling
- `.drag-mode` - Drop zone container
- `.drop-zone` - Drop zone visual
- `.btn` - Button basics
- `.btn-save`, `.btn-paste` - Button variants

### src/index.css
**Global styles**
- Font family setup
- HTML/body full-screen (width: 100%, height: 100%)
- Reset margins/padding
- Background transparency
- ~25 lines of code

### src/main.jsx
**React entry point (unchanged)**
- Creates React app
- Mounts to #root element
- Wraps App in StrictMode for dev checks
- ~10 lines of code

## 📦 Configuration Files

### package.json
**Node.js project configuration**
- Scripts: `dev`, `build`
- Dependencies:
  - react, react-dom (UI library)
  - electron (desktop app)
  - vite (build & dev server)
  - uuid (unique IDs)
- DevDependencies: ESLint, Vite plugins, TypeScript types
- Main entry: `electron/main.cjs`

### vite.config.js
**Vite build configuration (unchanged)**
- React plugin for JSX support
- Dev server settings implicit

### eslint.config.js
**Linting rules (unchanged)**
- Basic React/ESLint setup

### index.html
**HTML template (unchanged)**
- Root div for React mounting
- Window history disabled for Electron

## 📁 Asset Folders

### public/
**Static assets** (e.g., logos)
- Currently empty (you can add custom icons here)

### dist/
**Build output** (created by `npm run build`)
- Contains compiled app
- Ready for Electron packaging
- ~200KB total size

### node_modules/
**Installed packages** (created by `npm install`)
- All dependencies and their sub-dependencies
- ~500+ packages total

## 🔑 Key Files to Edit for Customization

### Change Global Hotkey
→ Edit [electron/main.cjs](electron/main.cjs), line 79

### Change Popup Size
→ Edit [electron/main.cjs](electron/main.cjs), lines 11-12

### Change Colors/Theme
→ Edit [src/App.css](src/App.css), lines 10-12 (gradient) and 59-65 (buttons)

### Change Data Storage Location
→ Edit [electron/storage.cjs](electron/storage.cjs), line 6

### Add More IPC Handlers
→ Add in [electron/main.cjs](electron/main.cjs) (search for `ipcMain.handle`)
→ Add in [electron/preload.cjs](electron/preload.cjs) (export in `electronAPI`)

## 📊 File Dependencies

```
App.jsx
├── Imports: useState, useRef, useEffect from React
├── Uses: window.electronAPI (from preload.cjs)
├── Styles: App.css
└── Mounted in: main.jsx

main.jsx
├── Imports: React, ReactDOM
├── Renders: App.jsx
└── Uses: index.html #root element

main.cjs
├── Imports: electron, path, storage.cjs
├── Uses: preload.cjs for IPC bridge
└── Creates: BrowserWindow (loads to dev server or dist/)

storage.cjs
├── Imports: fs, path, electron, uuid
├── Used by: main.cjs IPC handlers
└── Writes to: %APPDATA%/dump-vault/userData/vault/

preload.cjs
├── Imports: electron
├── Uses: ipcRenderer (main process bridge)
└── Exposes: window.electronAPI to App.jsx
```

## 🚀 Build Output Structure

```
dist/
├── index.html               (450 bytes)
├── assets/
│   ├── index-HASH.js       (195 KB - React + app code)
│   └── index-HASH.css      (2.5 KB - styles)
└── [static assets]          (if any in public/)
```

When Electron loads this in production, it serves from `dist/index.html`.

## 📈 Code Statistics

| File | Type | Lines | Purpose |
|------|------|-------|---------|
| main.cjs | Backend | ~120 | Electron & windows |
| storage.cjs | Backend | ~150 | Data persistence |
| preload.cjs | Backend | ~15 | IPC bridge |
| App.jsx | Frontend | ~100 | React UI |
| App.css | Styling | ~190 | Popup design |
| index.css | Styling | ~25 | Global styles |
| **Total** | | **~600** | |

## 🔍 Finding Things

**Need to...** → **Edit this file:**

- Add new hotkey → `electron/main.cjs` line 79
- Save additional metadata → `electron/storage.cjs` (addTextItem/addFileItem)
- Expose new API to React → `electron/preload.cjs` + `electron/main.cjs` (add handler)
- Change UI appearance → `src/App.css`
- Add new React functionality → `src/App.jsx`
- Change app name/metadata → `package.json`

---

For detailed explanations of how each component works, see [ARCHITECTURE.md](./ARCHITECTURE.md).

For usage instructions, see [QUICK_START.md](./QUICK_START.md).

For customization guides, see [SETUP_GUIDE.md](./SETUP_GUIDE.md).
