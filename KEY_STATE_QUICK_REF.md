# Key State Tracking - Quick Reference Guide

## For Users

### How It Works

The dump app now uses **low-level key state tracking** for the D key overlay:

- **Hold D**: Overlay window appears instantly
- **Release D**: Overlay window disappears (within 50ms)
- **Drag file while holding D**: Overlay stays visible until drop is complete
- **Ctrl+Shift+D**: Opens the main browseable app window (separate from D key overlay)

### Key Behaviors

| Action | Result |
|--------|--------|
| Press D | Overlay shows (420x180 window) |
| Release D | Overlay hides (smooth, no flicker) |
| Hold D while dragging | Overlay persists until drop completes |
| Release D while dragging | Overlay waits for drop to finish, then hides |
| Type text while D held | Text saves when you press Ctrl+Enter |
| Paste URL while D held | URL category auto-detected and saved |
| Press D, release, press D again | Smooth transitions, no flicker |
| Hold D for 10+ seconds | Overlay stays visible, no issues |
| Alt+Tab while D held | Overlay remains visible, window switch works |
| Click on other app while D held | Overlay doesn't steal focus |

### Interaction Flow

```
1. Press D (hold it down)
   ↓
2. Overlay window appears (borderless, transparent)
   ↓
3. Drag file OR type text/paste
   ↓
4. Save (for files: automatic on drop; for text: Ctrl+Enter)
   ↓
5. Release D
   ↓
6. Overlay disappears, file/text is in vault
```

### Edge Cases Handled

✅ **No flicker** on rapid taps or OS key repeat  
✅ **Focus preserved** - other apps remain active  
✅ **Drag persistence** - overlay visible until drop completes  
✅ **Multi-monitor** - overlay always moves to active monitor  
✅ **Window switching** - overlay independent of focus management  
✅ **Task switching** - overlay not shown in taskbar, can't minimize  

---

## For Developers

### Architecture Overview

The system uses a two-layer approach:

**Layer 1: Renderer (keyboardjs)**
```
User presses D key
    ↓
keyboardjs detects key event
    ↓
App.jsx handleDKeyDown() checks local isKeyDown flag
    ├─ Already down? → Ignore (repeat event filtering)
    └─ Not down? → Send IPC "d-key-down"
```

**Layer 2: Main Process (IPC + State Management)**
```
IPC "d-key-down" received
    ↓
setupOverlayKeyListener() receives event
    ↓
Check: is dKeyPhysicallyDown already true?
    ├─ YES (repeat) → Ignore event
    └─ NO (physical) → Show overlay, set flag
    ↓
User releases D
    ↓
keyboardjs detects keyup
    ↓
App.jsx handleDKeyUp() sends IPC "d-key-up"
    ↓
Main process receives, sets dKeyPhysicallyDown = false
    ↓
Schedule 50ms debounce hide
    ↓
Check: Is key down OR drag active?
    ├─ YES → Keep overlay visible
    └─ NO → Hide overlay
```

### Key State Variables

**File**: `electron/main.cjs` (lines 7-14)

```javascript
let dKeyPhysicallyDown = false;        // Actual physical key state
let pendingOverlayHide = false;        // Pending hide operation flag
let isDraggingInOverlay = false;       // Drag operation in progress
let pendingKeyUpTimer = null;          // Debounce timer ID
const KEY_UP_DEBOUNCE_MS = 50;         // Debounce delay in milliseconds
```

### Key Functions

#### `setupOverlayKeyListener()` (lines 156-195)
- Listens for IPC "d-key-down" event from renderer
- Listens for IPC "d-key-up" event from renderer
- Filters repeat events based on physical key state
- Implements debounced hide logic
- Respects drag state

**Entry point**: Called once in `app.whenReady()`

#### `showOverlayWindow()` (lines 130-138)
- Creates overlay window if needed
- Clears any pending hide operations
- Makes window visible

#### `hideOverlayWindow()` (lines 140-148)
- Only hides if no drag operation in progress
- Prevents flicker during drag operations
- Gracefully handles window closure

### IPC Handlers

#### `d-key-down` (lines 156-171)
```javascript
ipcMain.on("d-key-down", (event) => {
  if (!dKeyPhysicallyDown) {
    dKeyPhysicallyDown = true;
    showOverlayWindow();
  }
});
```

Sent from `App.jsx` when D key is pressed (via keyboardjs)

#### `d-key-up` (lines 173-195)
```javascript
ipcMain.on("d-key-up", (event) => {
  dKeyPhysicallyDown = false;
  // Schedule debounced hide...
});
```

Sent from `App.jsx` when D key is released (via keyboardjs)

#### `set-overlay-drag-state` (lines 223-231)
```javascript
ipcMain.handle("set-overlay-drag-state", async (event, isDragging) => {
  isDraggingInOverlay = isDragging;
  if (!isDragging && pendingOverlayHide && !dKeyPhysicallyDown) {
    hideOverlayWindow();
  }
});
```

Called from `App.jsx` on:
- `dragenter` → `setOverlayDragState(true)`
- `dragleave` → `setOverlayDragState(false)`
- `drop` → `setOverlayDragState(false)`

### Why keyboardjs?

**Previous approach (keyboard native module)**:
- ❌ Requires C++ compilation
- ❌ Fails on Windows without build tools
- ❌ 5-10 minute install time
- ❌ Platform-specific prebuilts

**Current approach (keyboardjs)**:
- ✅ Pure JavaScript, no compilation
- ✅ < 1 second install time
- ✅ Works on Windows/Mac/Linux
- ✅ 18KB bundled size
- ✅ IPC bridge separates concerns

### Window Configuration

**File**: `electron/main.cjs`, `createOverlayWindow()` (lines 59-80)

Focus-prevention configuration:
```javascript
BrowserWindow({
  focusable: false,           // Can't receive focus
  skipTaskbar: true,          // Not in taskbar
  alwaysOnTop: true,          // Always visible
  transparent: true,          // Transparent regions
  frame: false,               // No window frame
})

overlayWindow.setFocusable(false);  // Enforce non-focusable

// Windows-specific: don't process mouse events in a way that steals focus
if (process.platform === "win32") {
  overlayWindow.setIgnoreMouseEvents(false, { forward: true });
}
```

### Performance Considerations

- **Debounce delay**: 50ms - adjust `KEY_UP_DEBOUNCE_MS` if needed
- **IPC overhead**: Minimal, drag state updates are infrequent
- **Memory**: Each overlay window ~50MB Chromium overhead
- **CPU**: Negligible while key is held (idle monitoring only)

### Testing Integration Points

To debug key state tracking:

```javascript
// In setupOverlayKeyListener(), add logging:
keyboard.on("d", (event) => {
  console.log(`[KEY DOWN] physically down: ${dKeyPhysicallyDown}`);
  if (!dKeyPhysicallyDown) {
    dKeyPhysicallyDown = true;
    console.log(`[KEY DOWN] showing overlay`);
    showOverlayWindow();
  }
});

keyboard.on("keyup", (event) => {
  if (event.name === "d") {
    dKeyPhysicallyDown = false;
    console.log(`[KEY UP] scheduling hide with debounce`);
    // ... rest of handler
  }
});

// In createOverlayWindow(), add logging:
overlayWindow.on("show", () => console.log("[OVERLAY] shown"));
overlayWindow.on("hide", () => console.log("[OVERLAY] hidden"));
```

### Common Modifications

**Adjust debounce timing**:
```javascript
const KEY_UP_DEBOUNCE_MS = 100;  // Increase if flicker persists
```

**Change overlay hotkey**:
```javascript
// Instead of keyboard library listening to "d", use globalShortcut:
globalShortcut.register("CommandOrControl+Alt+D", () => {
  if (overlayVisible) hideOverlayWindow();
  else showOverlayWindow();
});
```

**Disable drag state protection**:
```javascript
// In hideOverlayWindow(), remove drag check:
if (overlayWindow && overlayVisible) {
  overlayWindow.hide();
  overlayVisible = false;
}
// (no more: if (!isDraggingInOverlay && ...))
```

**Add logging for all key events**:
```javascript
keyboard.on("keydown", (key) => {
  console.log(`[KEY] ${key.name} pressed, physically down: ${dKeyPhysicallyDown}`);
});
```

---

## Implementation Checklist

- [x] Physical key state tracking (`dKeyPhysicallyDown`)
- [x] OS repeat event filtering (ignore events while already down)
- [x] Debounced hide (prevents flicker on rapid taps)
- [x] Focus prevention (setFocusable, skipTaskbar, ignoreMouseEvents)
- [x] Drag state tracking (isDraggingInOverlay flag)
- [x] IPC communication (setOverlayDragState handler)
- [x] Renderer drag notifications (dragenter, dragleave, drop)
- [x] Timer cleanup on app quit
- [x] Window lifecycle management
- [x] Edge case handling (rapid taps, window switches, long holds)

---

## File Locations

| Component | File | Lines |
|-----------|------|-------|
| Key state variables | `electron/main.cjs` | 7-14 |
| Focus prevention | `electron/main.cjs` | 59-80 |
| Show logic | `electron/main.cjs` | 130-138 |
| Hide logic | `electron/main.cjs` | 140-148 |
| Hotkey setup | `electron/main.cjs` | 150-153 |
| Key listener | `electron/main.cjs` | 155-227 |
| Drag state IPC | `electron/main.cjs` | 216-231 |
| Cleanup | `electron/main.cjs` | 263-273 |
| API exposure | `electron/preload.cjs` | 13 |
| Drag tracking | `src/App.jsx` | 66-123 |

---

## Debugging Tips

### Overlay appears but doesn't disappear
- Check if `isDraggingInOverlay` is stuck as `true`
- Verify `setOverlayDragState(false)` is called in `dragleave` and `drop`
- Check console for errors in IPC handler

### Overlay disappears too quickly
- Increase `KEY_UP_DEBOUNCE_MS` from 50 to 100 or 150
- Verify D key release is not being detected prematurely
- Check if another process is capturing the key

### Overlay steals focus
- Verify `setFocusable(false)` is called in `createOverlayWindow()`
- For Windows, check if `setIgnoreMouseEvents` is applied
- Check platform-specific window manager issues

### Drag state not persisting
- Verify `setOverlayDragState(true)` in `dragenter`
- Check that `dragenter` event is firing (add console.log)
- Verify IPC communication isn't timing out

### D key not responding
- Check if `setupOverlayKeyListener()` is called
- Verify keyboard library is installed: `npm list keyboard`
- Try rebuilding: `npm rebuild keyboard`
- Check if another app has captured the D key globally

---

## Version History

**v1.0** (Current):
- Physical key state tracking with repeat filtering
- 50ms debounce for smooth hide transitions
- Focus-safe overlay window (focusable: false)
- Drag state awareness and persistence
- Full edge case handling

---

## Support & Troubleshooting

If the overlay doesn't behave as expected:

1. **Check the build**: `npm run build` should complete without errors
2. **Check syntax**: `node -c electron/main.cjs` should pass
3. **Check keyboard library**: `npm list keyboard` should show installed
4. **Check console logs**: `npm run dev` and look for error messages
5. **Test basic hotkey**: Try Ctrl+Shift+D for main window first
6. **Rebuild keyboard**: `npm rebuild keyboard` if D key doesn't work

For detailed troubleshooting, see [KEY_STATE_TESTING.md](KEY_STATE_TESTING.md).
