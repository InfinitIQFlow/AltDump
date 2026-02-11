# Dump Vault - Desktop App

A lightweight Electron + React desktop application that acts as a "dump now, find later" tool. Press **Ctrl+Shift+D** to instantly open a popup window for capturing text or files.

## Features

- **Instant Popup**: Press and hold **Ctrl+Shift+D** to open the capture window
- **Text Mode** (Default): Type or paste text and save with **Ctrl+Enter** or click the Save button
- **Drag-and-Drop Mode**: Start dragging a file while the popup is open, and the UI automatically switches to drop mode
- **Auto-Mode Detection**: If you open the popup while already dragging a file, it shows the drop UI directly
- **Local Storage**: All items saved locally with metadata (timestamp, type, filename)
- **Minimal & Keyboard-Friendly**: Focus on speed and keyboard shortcuts
- **Always-on-Top**: Popup stays visible on top of other windows

## Installation

```bash
npm install
```

This installs all required dependencies:
- React 19
- Electron 40
- Vite 7 (build tool)
- UUID (for item IDs)

## Development

Run the app in development mode with hot reload:

```bash
npm run dev
```

This command:
1. Starts Vite dev server on `http://localhost:5173` (or next available port)
2. Launches Electron pointing to the dev server
3. Enables hot reload for React changes

The app remains in the background until you:
- Press **Ctrl+Shift+D** to show the popup
- Or click the window to focus it

## Usage

### Text Input Mode (Default)

1. Press **Ctrl+Shift+D** to open popup
2. Type or paste text into the textarea
3. Press **Ctrl+Enter** or click **Save** button to save
4. Text is saved with timestamp and stored locally

### File Drag-and-Drop Mode

1. Press **Ctrl+Shift+D** to open popup (popup shows text mode initially)
2. Start dragging a file (PDF, image, document, etc.) from File Explorer
3. UI automatically switches to **"Drop here to save"** mode
4. Drop the file to save it
5. File is saved with metadata (filename, size, timestamp)

### Paste from Clipboard

While in text mode:
- Click **Paste** button to paste clipboard contents
- Or use standard Ctrl+V after clicking in textarea

## Data Storage

All saved items are stored in:
- **Windows**: `%APPDATA%\dump-vault\userData\vault\items.json`
- **macOS**: `~/Library/Application Support/dump-vault/vault/items.json`
- **Linux**: `~/.config/dump-vault/vault/items.json`

Each item includes:
- `id`: Unique identifier (UUID)
- `type`: "text" or "file"
- `content` (for text) or `filename`/`path` (for files)
- `timestamp`: ISO 8601 format

File content is deduplicated using SHA256 hashing.

## Building for Production

Build the app for distribution:

```bash
npm run build
```

This creates an optimized build in the `dist/` folder.

## Project Structure

```
dump-vault/
├── electron/
│   ├── main.cjs          # Electron main process, window management, hotkey
│   ├── preload.cjs       # Secure API exposure to renderer
│   └── storage.cjs       # Data persistence and file handling
├── src/
│   ├── App.jsx           # Main React component with UI modes
│   ├── App.css           # Styles (gradient, animations, responsive)
│   ├── index.css         # Global styles
│   └── main.jsx          # React entry point
├── public/               # Static assets
├── package.json          # Dependencies and scripts
├── vite.config.js        # Vite configuration
└── index.html            # HTML template
```

## Key Components

### App.jsx - Main UI Component

Handles two rendering modes:
- **Text Mode**: Textarea + Paste + Save buttons
- **Drag Mode**: Drop zone with visual feedback

Features:
- Auto-focus on textarea
- Smooth mode transitions
- Keyboard shortcuts (Ctrl+Enter to save)
- Drag-and-drop event handling

### main.cjs - Electron Main Process

Responsibilities:
- Register global **Ctrl+Shift+D** shortcut
- Create and manage popup window (hidden by default)
- Handle show/hide on hotkey press
- Auto-hide on window blur
- IPC communication with renderer
- Window cleanup on exit

### storage.cjs - Data Persistence

Features:
- JSON file storage
- UUID generation for items
- File deduplication via SHA256
- Automatic vault directory creation
- Error handling and recovery

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **Ctrl+Shift+D** | Toggle popup open/closed |
| **Ctrl+Enter** (in text mode) | Save text |
| **Click Save** | Save text |
| **Click Paste** | Paste from clipboard |
| **Drag file + Drop** | Save file |

## Customization

### Change Global Hotkey

Edit [electron/main.cjs](electron/main.cjs), line ~79:

```javascript
globalShortcut.register("ctrl+shift+d", () => {
  // Change "ctrl+shift+d" to any valid Electron accelerator
});
```

Valid accelerators: `CommandOrControl+A`, `Shift+F`, `Ctrl+Alt+X`, etc.

### Adjust Popup Size

Edit [electron/main.cjs](electron/main.cjs), line ~11:

```javascript
const popupWindow = new BrowserWindow({
  width: 500,   // Change this
  height: 300,  // Or this
  // ...
});
```

### Modify Colors/Theme

Edit [src/App.css](src/App.css):
- Line 10: Background gradient colors
- Line 85-90: Button colors
- Update CSS custom properties as needed

## Troubleshooting

### Popup doesn't appear

1. Ensure **Ctrl+Shift+D** isn't registered as a global shortcut elsewhere
2. Check if Electron window is created during startup
3. Try running in a terminal to see error messages: `npm run dev`

### Custom hotkey not registering

- Use valid Electron accelerator strings
- Check for conflicts with system/other-app shortcuts
- Some hotkeys may be blocked by OS (e.g., Cmd on macOS)

### Files not saving

- Check vault directory has write permissions
- Verify `%APPDATA%\dump-vault\userData\vault\` exists
- Look for errors in dev console (F12)

### Drag-and-drop not switching modes

- Ensure you're dragging from a file manager
- Try dragging a simple file type first (JPG, TXT)
- Check that `dragenter` event fires in devtools

## Performance & Optimization

- React 19 with Strict Mode for development
- No unnecessary re-renders (memoization ready)
- Efficient IPC communication
- File deduplication reduces storage
- Prompt cleanup on window blur

## Security

- `contextIsolation: true` - Renderer can't access Node APIs directly
- `preload.cjs` - Explicit API exposure only
- No external dependencies in renderer beyond React
- No `nodeIntegration`
- IPC validates all messages

## Next Steps / Future Enhancements

- [ ] Search/filter saved items
- [ ] Preview text snippets in UI
- [ ] Export items to markdown/CSV
- [ ] Categories/tags for organization
- [ ] Dark mode toggle
- [ ] Sync across devices
- [ ] Windows/macOS/Linux app signing & distribution
- [ ] Tray icon with quick access menu

## License

MIT

## Development Notes

- **Framework**: React 19.2 + Electron 40.2 + Vite 7.3
- **Node Version**: 24.11.1+
- **OS**: Cross-platform (Windows, macOS, Linux)
- **Package Manager**: npm 10+

---

Built with ❤️ as a quick-capture tool for the modern developer.
