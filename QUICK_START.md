# Quick Start Guide

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Development Mode (with hot reload)
```bash
npm run dev
```

The app will:
- Start Vite dev server (usually on port 5173 or 5174)
- Launch Electron window in the background
- Show console logs and errors

### 3. Press the Global Hotkey
**Press and hold: `Ctrl+Shift+D`**

A small centered popup window (~500px × 300px) will appear with:
- A text input area (focused automatically)
- Paste button (📋) to paste clipboard
- Save button (💾) with hint "Ctrl+Enter"

### 4. Try Text Mode

##### Option A: Type Text
```
1. Type anything into the textarea
2. Press Ctrl+Enter or click Save
3. Watch the data save (console shows confirmation)
4. Click outside popup or press Ctrl+Shift+D again to close
```

##### Option B: Paste Clipboard
```
1. Copy something to clipboard (Ctrl+C)
2. Open popup (Ctrl+Shift+D)
3. Click "Paste" button
4. Content appears in textarea
5. Press Ctrl+Enter to save
```

### 5. Try Drag-and-Drop Mode

```
1. Open popup (Ctrl+Shift+D)
2. Drag a file from File Explorer WHILE popup is visible
3. UI automatically switches to drop mode (showing "📥 Drop here to save")
4. Drop the file
5. UI confirms save and switches back to text mode
```

## What Gets Saved?

### Text Items

**Folder**: `%APPDATA%\dump-vault\userData\vault\items.json`

**Example content**:
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "type": "text",
    "content": "Remember to finish the report tomorrow",
    "timestamp": "2026-02-09T14:23:45.123Z"
  },
  {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "type": "text",
    "content": "Quick note: API endpoint should return 201 on success",
    "timestamp": "2026-02-09T14:25:10.456Z"
  }
]
```

### File Items

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440002",
    "type": "file",
    "filename": "meeting-notes.pdf",
    "path": "C:\\Users\\ayesh\\AppData\\Roaming\\dump-vault\\userData\\vault\\a3b2c1d4e5f6g7h8i9j0k1l2m3n4o5p6.pdf",
    "hash": "a3b2c1d4e5f6g7h8i9j0k1l2m3n4o5p6",
    "timestamp": "2026-02-09T14:26:22.789Z"
  },
  {
    "id": "550e8400-e29b-41d4-a716-446655440003",
    "type": "file",
    "filename": "screenshot.png",
    "path": "C:\\Users\\ayesh\\AppData\\Roaming\\dump-vault\\userData\\vault\\b4c3d2e1f6g7h8i9j0k1l2m3n4o5p6q7.png",
    "hash": "b4c3d2e1f6g7h8i9j0k1l2m3n4o5p6q7",
    "timestamp": "2026-02-09T14:27:05.321Z"
  }
]
```

## Testing Checklist

- [ ] App launches without errors (`npm run dev`)
- [ ] Pressing Ctrl+Shift+D opens popup
- [ ] Popup appears centered on screen
- [ ] Textarea auto-focuses (cursor visible)
- [ ] Can type text
- [ ] Paste button works (Ctrl+C something first, then click Paste)
- [ ] Saving text works (Ctrl+Enter or click Save)
- [ ] items.json file is created in vault folder
- [ ] Dragging a file switches UI to drop mode
- [ ] Dropping file saves it
- [ ] Closing popup (blur or Ctrl+Shift+D) hides window
- [ ] App stays in background (taskbar minimal)

## Keyboard Shortcuts Reference

| Key | Action |
|-----|--------|
| Ctrl+Shift+D | Toggle popup |
| Ctrl+Enter | Save text (in text mode) |
| Ctrl+V | Standard paste (in textarea) |

## File Structure After First Run

```
%APPDATA%\dump-vault\userData\vault\
├── items.json                    # All items metadata
├── [sha256-hash].pdf             # Saved files (stored by content hash)
├── [sha256-hash].png
└── [sha256-hash].* (any file type)
```

Files are deduplicated: if you save the same file twice, it's stored once but appears twice in items.json.

## Troubleshooting

### Issue: Popup doesn't open

**Solution:** 
- Ensure no other app is using `Ctrl+Shift+D`
- Check Windows Settings → Accessibility → Keyboard → Use Toggle Keys
- Try a different hotkey (see Configuration section in main SETUP_GUIDE.md)

### Issue: Text not saving

**Solution:**
- Check that vault folder exists: `%APPDATA%\dump-vault\userData\vault\`
- Press Ctrl+Enter (not just Enter)
- Look for errors in dev console

### Issue: Drag-and-drop not working

**Solution:**
- Ensure File Explorer window is visible
- Try dragging a simple file (e.g., .txt file)
- Drag while popup is already open (don't start drag before popup opens)

### Issue: Build fails

**Solution:**
```bash
npm cache clean --force
rm -r node_modules
npm install
npm run build
```

## Next Steps

1. **Customize hotkey** - Edit line 79 in `electron/main.cjs`
2. **Change colors** - Edit `src/App.css` gradient and button colors  
3. **Adjust popup size** - Edit `width`/`height` in `electron/main.cjs`
4. **Build for distribution** - Run `npm run build` then package with `electron-builder`

---

Happy dumping! 🚀
