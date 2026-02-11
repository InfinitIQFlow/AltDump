# 🚀 Dump Vault

**A lightning-fast desktop app for capturing thoughts, snippets, and files instantly.**

Dump Vault is a minimal, keyboard-first desktop application built with **Electron + React**. Press **Ctrl+Shift+D** anytime to instantly capture text or files locally. Perfect for quick note-taking, code snippets, or saving important documents without disrupting your workflow.

![Dump Vault Demo](./FEATURES.md)

## ✨ Key Features

- **Instant Capture**: Press `Ctrl+Shift+D` → Start typing → Press `Ctrl+Enter` to save
- **Drag & Drop Files**: Dragging a file auto-switches from text mode to drop mode  
- **Smart Mode Switching**: No need to click buttons—UI adapts to your actions
- **Always-on-Top Popup**: Lightweight, centered window that stays focused
- **Local-First Storage**: All data saved locally with zero cloud dependencies
- **Keyboard-Friendly**: Optimized for speed with global hotkeys and shortcuts
- **Auto-Categorization**: Every item automatically categorized (Documents, Images, Videos, Links, etc.)
- **Intelligent Validation**: Rejects unsupported files (executables, archives, audio) with inline feedback
- **URL Detection**: Pastes URLs automatically recognized and saved as "links"
- **Cross-Platform**: Works on Windows, macOS, and Linux

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [Features & Usage](#features--usage)
- [Categories & Validation](#categories--validation)
- [Project Structure](#project-structure)
- [Development](#development)
- [Customization](#customization)
- [Data Storage](#data-storage)

## 🏃 Quick Start

### Installation

```bash
# Clone/download this repo, then:
npm install
```

### Run Development Server

```bash
npm run dev
```

This starts:
- Vite dev server (hot reload enabled)
- Electron with live reloading

### Try It Out

1. Press **`Ctrl+Shift+D`** to open the popup
2. Type something in the textarea that appears
3. Press **`Ctrl+Enter`** or click **Save** button
4. Your text is saved! Popup closes automatically

See [QUICK_START.md](./QUICK_START.md) for detailed usage examples.

## 🎯 Features & Usage

### Text Input Mode (Default)

The popup opens in text mode with:
- **Textarea** - Type or paste your thoughts
- **Paste Button** - Click to paste from clipboard  
- **Save Button** - Click or press `Ctrl+Enter` to save

### File Drag-and-Drop Mode

While the popup is open:
1. Start dragging a file from File Explorer
2. UI automatically switches to **"Drop here to save"** mode
3. Drop the file to save it with metadata

If you open the popup while already dragging, it shows the drop UI immediately.

### Examples

**Saving a code snippet:**
```
Ctrl+Shift+D (opens popup)
→ Paste code (Ctrl+V or Paste button)
→ Ctrl+Enter (saves)
```

**Saving a screenshot:**
```
Ctrl+Shift+D (opens popup)
→ Drag screenshot.png from File Explorer
→ UI switches to drop mode
→ Drop the file (saves with timestamp & filename)
```

## 💾 Data Storage

All items are saved locally in:
- **Windows**: `%APPDATA%\dump-vault\userData\vault\items.json`
- **macOS**: `~/Library/Application Support/dump-vault/vault/items.json`
- **Linux**: `~/.config/dump-vault/vault/items.json`

Each saved item includes:
- **ID**: Unique UUID
- **Type**: "text" or "file"
- **Timestamp**: ISO 8601 format
- **Content**: Text or filename reference

Files are deduplicated using SHA256 hashing to save space.

Example `items.json`:
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "type": "text",
    "content": "Quick note: Need to review PR#123",
    "timestamp": "2026-02-09T14:23:45.123Z"
  },
  {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "type": "file",
    "filename": "design-mockup.png",
    "hash": "abc123def456...",
    "timestamp": "2026-02-09T14:26:22.789Z"
  }
]
```

## 🎮 Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+D` | Toggle popup open/close |
| `Ctrl+Enter` | Save text (in text mode) |
| `Ctrl+V` | Paste into textarea |

## 🏷️ Categories & Validation

Every saved item is **automatically categorized** without user input:

### Supported Categories
- **Documents**: PDF, DOC, DOCX, TXT, RTF, etc.
- **Images**: PNG, JPG, JPEG, GIF, WEBP, etc.
- **Videos**: MP4, MKV, WEBM, AVI, MOV, etc.
- **CSV**: Data files (CSV, TSV)
- **Links**: URLs detected in pasted text
- **Text**: Plain text notes

### Smart Validation & Blocking
Invalid file types show inline error messages and are rejected:
- ❌ Audio files (MP3, WAV, FLAC, etc.)
- ❌ Executables (EXE, MSI, APK, DEB, etc.)
- ❌ Archives (ZIP, RAR, 7Z, etc.)
- ❌ System files (DLL, SO, SYS, etc.)

### URL Detection
Paste a URL → Automatically detected and saved as "links" category:
- `https://github.com/example` → Saved as Links
- `www.example.com` → Saved as Links
- `My grocery list` → Saved as Text

**See [CATEGORIZATION_GUIDE.md](./CATEGORIZATION_GUIDE.md) for detailed information on categories, validation, and customization.**

## 🛠️ Project Structure

```
dump-vault/
├── electron/
│   ├── main.cjs          # Main process, window mgmt, hotkey listener
│   ├── preload.cjs       # Secure IPC bridge
│   └── storage.cjs       # Data persistence & file handling
├── src/
│   ├── App.jsx           # Main React component (text/drag modes)
│   ├── App.css           # Popup styles (gradient, animations)
│   ├── index.css         # Global styles
│   └── main.jsx          # React entry point
├── public/               # Static assets
├── package.json          # Dependencies & npm scripts
├── vite.config.js        # Vite configuration
├── index.html            # HTML template
├── QUICK_START.md        # Step-by-step usage guide
└── SETUP_GUIDE.md        # Detailed feature & customization docs
```

## 🔧 Development

### Scripts

```bash
npm run dev      # Start dev server + Electron
npm run build    # Build optimized production bundle
```

### Tech Stack

- **React 19.2** - UI components
- **Electron 40.2** - Desktop app framework
- **Vite 7.3** - Build tool & dev server
- **UUID** - Generate unique item IDs
- **Vanilla CSS** - Styling (no CSS-in-JS)

### Hot Reload

Changes to React components (`src/` folder) automatically reload in the app.

Changes to main process (`electron/main.cjs`) require manual reload (close and restart the app).

## ⚙️ Customization

### Change Global Hotkey

Edit `electron/main.cjs`, line ~79:

```javascript
globalShortcut.register("ctrl+shift+d", () => {
  // Change to any valid Electron accelerator:
  // "ctrl+alt+d", "cmd+shift+d", "shift+f", etc.
});
```

### Adjust Popup Size

Edit `electron/main.cjs`, line ~11:

```javascript
const popupWindow = new BrowserWindow({
  width: 500,   // ← Change width
  height: 300,  // ← Change height
  // ...
});
```

### Customize Theme

Edit `src/App.css`:
- **Lines 10-11**: Background gradient
- **Lines 59-65**: Button colors
- **Lines 66+**: Hover/active states

Example - change from purple to blue gradient:
```css
.app-container {
  background: linear-gradient(135deg, #4169E1 0%, #1E90FF 100%);
}
```

### Change Data Storage Location

Edit `electron/storage.cjs`, line ~6:

```javascript
const VAULT_DIR = path.join(app.getPath("userData"), "vault");
// Change app.getPath("userData") to a custom path
```

## 📦 Building for Distribution

```bash
npm run build
```

This creates an optimized bundle in `dist/` folder.

To package as a standalone app, install and use [`electron-builder`]:

```bash
npm install --save-dev electron-builder
npx electron-builder
```

## 🐛 Troubleshooting

**Popup doesn't open?**
- Check that `Ctrl+Shift+D` isn't used by another app
- Try running `npm run dev` in a terminal to see error messages

**Files not saving?**
- Ensure vault folder has write permissions
- Check `%APPDATA%\dump-vault\userData\vault\` exists

**Drag-and-drop not working?**
- Make sure File Explorer window is visible
- Try dragging while popup is already open

## 🚀 Future Enhancements

- [ ] Search/filter saved items
- [ ] Preview pane for text snippets
- [ ] Tags/categories for organization
- [ ] Export to markdown/CSV
- [ ] Dark mode toggle
- [ ] Sync across devices
- [ ] Context menu integration
- [ ] Tray icon with quick menu

## 📝 License

MIT

## 💡 Tips

- **For code snippets**: Copy code → `Ctrl+Shift+D` → Paste → `Ctrl+Enter`
- **For quick notes**: Faster than opening Notepad or Teams
- **For screenshots**: `Ctrl+Shift+D` → Drag the screenshot file
- **For PDFs/docs**: Just drag and drop, file reference stays in vault

---

**See [QUICK_START.md](./QUICK_START.md) for step-by-step usage guide and examples.**

**See [SETUP_GUIDE.md](./SETUP_GUIDE.md) for detailed feature documentation and customization.**

Built with ❤️ for people who dump a lot and find rarely.
