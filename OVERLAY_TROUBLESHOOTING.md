# Overlay Visibility Troubleshooting Guide

## Quick Debug Steps

1. **Start the dev server with console visible**:
   ```bash
   npm run dev
   ```

2. **Open DevTools in the overlay**:
   - When you see the initial window, press **F12** to open DevTools
   - Look at the **Console** tab for debug messages

3. **Check the main process console**:
   - The terminal running `npm run dev` shows main process output
   - Look for `[APP]`, `[OVERLAY]`, and `[KEY]` messages

## What to Look For

### Startup Sequence (Should see these in terminal output)

```
[APP] Creating main window...
[APP] Creating overlay window...
[APP] Setting up main window hotkey...
[APP] Setting up overlay key listener...
[APP] Startup complete - waiting for D key or Ctrl+Shift+D
```

✅ **If you see all of these**: Startup initialization is working

### Overlay Window Creation (Should see in terminal)

```
[OVERLAY] Creating overlay window...
[OVERLAY] Overlay window created, loading URL...
[OVERLAY] Loading URL: http://localhost:5173?overlay=true
[OVERLAY] setFocusable(false) applied
[OVERLAY] setIgnoreMouseEvents applied for Windows
[OVERLAY] Overlay window content loaded
```

✅ **If you see all of these**: Overlay window is created and loaded

### Overlay Mode Detection (Check DevTools console in overlay window)

```
[App] URL params: ?overlay=true
[App] isOverlay detected: true
[Overlay] Setting up keyboard listener...
[Overlay] keyboardjs loaded successfully
[Overlay] Keyboard listeners registered
```

✅ **If you see these**: isOverlay detection is working and keyboard listener is set up

### D Key Press (Press D and watch console)

**In DevTools** (F12 in the window):
```
[Overlay] D key down detected, isKeyDown: false
[Overlay] Sending notifyDKeyDown to main process
[Overlay] D key up detected
[Overlay] Sending notifyDKeyUp to main process
```

**In terminal** (main process):
```
[KEY] d-key-down IPC received, dKeyPhysicallyDown: false
[KEY] Physical D key down detected
[OVERLAY] Showing overlay window
[OVERLAY] Overlay window visible: true
```

✅ **If you see all of these**: The system is working end-to-end

## Troubleshooting Scenarios

### Scenario 1: "I don't see any [APP] messages in terminal"

**Problem**: App isn't starting properly

**Solution**:
```bash
# Kill any existing processes
taskkill /F /IM electron.exe 2>nul
# Clear build cache
rm -r dist
# Rebuild and run
npm run build
npm run dev
```

### Scenario 2: "I see [APP] messages but no [OVERLAY] messages"

**Problem**: Overlay window isn't being created

**Solution**:
1. Check if there are errors in terminal output
2. Look for any `Error:` messages after `Creating overlay window...`
3. Try restarting: `npm run dev`

### Scenario 3: "I see [OVERLAY] messages but no keyboard listener setup"

**Problem**: The overlay window hasn't loaded the URL yet

**Solution**:
1. Wait 2-3 seconds after seeing "Overlay window content loaded"
2. The DevTools console might take time to appear
3. Try pressing F12 to open DevTools

### Scenario 4: "No keyboard events are being detected"

**Problem**: keyboardjs isn't detecting the D key

**Possible causes**:
1. **Check if isOverlay is false**: Look for `[App] isOverlay detected: true`
   - If it says `false`, the URL parameter isn't being passed correctly
   
2. **Check if keyboardjs loaded**: Look for `[Overlay] keyboardjs loaded successfully`
   - If you don't see it, try pressing F12 and check DevTools console for errors
   
3. **Check if listener registered**: Look for `[Overlay] Keyboard listeners registered`
   - If you don't see it, check DevTools console for errors

4. **Try another key**: In DevTools console, try:
   ```javascript
   import("keyboardjs").then(kb => {
     kb.default.on("a", () => console.log("A pressed"));
   });
   ```
   Then press A key to test if keyboardjs works at all

### Scenario 5: "I see keyboard events but overlay doesn't show"

**Problem**: IPC message isn't reaching main process or overlay isn't showing

**Solution**:
1. Check terminal for IPC messages: `[KEY] d-key-down IPC received`
2. If you don't see them, check DevTools console for send errors
3. If you see the IPC messages but no "Showing overlay" message:
   - The condition `if (!dKeyPhysicallyDown)` might be failing
   - This means the main process thinks D is already down
   - Try: Kill the app, restart, wait for the startup messages, THEN press D

### Scenario 6: "[OVERLAY] Showing overlay window" but still don't see window"

**Problem**: The window is being shown but it's:
- Off-screen, or
- Behind other windows, or
- Too small to see, or
- Already visible but hard to see

**Solution**:
Try pressing **Ctrl+Shift+D** instead - this toggles the main app window which is larger and should be obviously visible

If the main window opens, the Electron app is working fine. Then the issue is specific to the overlay.

## Debug Checklist

Run through this checklist and report which steps fail:

- [ ] Step 1: See `[APP] Creating main window...` in terminal
- [ ] Step 2: See `[APP] Creating overlay window...` in terminal  
- [ ] Step 3: See `[OVERLAY] Overlay window content loaded` in terminal
- [ ] Step 4: Press F12, see DevTools open
- [ ] Step 5: See `[App] isOverlay detected: true` in DevTools console
- [ ] Step 6: See `[Overlay] keyboardjs loaded successfully` in DevTools console
- [ ] Step 7: See `[Overlay] Keyboard listeners registered` in DevTools console
- [ ] Step 8: Press D key
- [ ] Step 9: See `[Overlay] D key down detected` in DevTools console
- [ ] Step 10: See `[KEY] d-key-down IPC received` in terminal
- [ ] Step 11: See `[KEY] Physical D key down detected` in terminal
- [ ] Step 12: See `[OVERLAY] Showing overlay window` in terminal
- [ ] Step 13: See the overlay window appear on screen

## If You've Gone Through All Steps

If all 13 steps are passing but you still don't see the overlay:

1. **The overlay window might be positioned off-screen**:
   - Look at monitor arrangement
   - Try moving your main window to check if something is behind it

2. **The overlay might be transparent and invisible**:
   - Edit `electron/main.cjs`, find `createOverlayWindow()`
   - Change `transparent: true` to `transparent: false` temporarily
   - Rebuild: `npm run build`
   - If you now see a white rectangle, the window is working but transparency is hiding it

3. **There might be a display/driver issue**:
   - Try running in production mode instead of dev:
     ```bash
     npm run build
     npm start
     ```

## Reporting Issues

If you still can't see the overlay, please provide:

1. **Terminal output starting from "npm run dev"** - capture first 30 seconds
2. **DevTools console output** - Press F12 and paste the console logs  
3. **System info**:
   - Windows version
   - Display setup (single/dual monitor)
   - Any error messages seen

## Quick Win: Test Main Window First

Before debugging D key overlay further:

1. Start the app: `npm run dev`
2. Press **Ctrl+Shift+D**
3. Does a 500x500 window open?

✅ **If YES**: Electron is working, issue is specific to overlay
❌ **If NO**: There's a deeper issue with the Electron setup

---

Once you've worked through these steps, the issue should be resolved. The debugging messages will pinpoint exactly where the problem is!
