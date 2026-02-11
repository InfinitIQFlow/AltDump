# Key State Tracking - Testing & Verification Guide

## Pre-Launch Checklist

Before testing, verify the implementation is in place:

```bash
# 1. Build the application
npm run build

# 2. Verify syntax
node -c electron/main.cjs
```

Both should complete without errors.

## Test 1: Basic Show/Hide Behavior

**Objective**: Verify overlay appears on D press and disappears on D release

**Steps**:
1. Start the app: `npm run dev`
2. Hold down the D key
3. **Expected**: Overlay window (420x180) appears smoothly
4. Release the D key
5. **Expected**: Overlay window disappears smoothly (within 50ms of release)
6. Repeat 5 times

**Pass Criterion**: 
- ✅ Overlay appears immediately when D is pressed
- ✅ Overlay disappears within 50ms of D release
- ✅ No flicker or ghost windows
- ✅ Consistent behavior across all 5 repetitions

---

## Test 2: Rapid Key Taps (Flicker Prevention)

**Objective**: Verify debouncing prevents flicker on rapid taps

**Steps**:
1. Press D and release quickly (tap, don't hold)
2. Immediately tap D again (within 100ms)
3. Tap a third time
4. Tap a fourth time
5. Hold D for 2 seconds
6. Release

**Expected Behavior**:
- Each individual tap shows/hides overlay
- No visual flickering between taps
- Overlay visible during the 2-second hold
- Disappears when released

**Pass Criterion**:
- ✅ Overlay smoothly transitions between taps
- ✅ No flickering or double-show effects
- ✅ Text/file input areas remain responsive during taps

---

## Test 3: Key Repeat Event Filtering

**Objective**: Verify OS-level key repeat doesn't cause issues

**Steps**:
1. Hold down the D key for 5+ seconds (triggering OS repeat events)
2. Release

**Expected Behavior**:
- Overlay appears and stays visible the entire time
- No flicker or disappearing during hold
- Overlay disappears smoothly when released

**Pass Criterion**:
- ✅ Overlay stable throughout extended hold
- ✅ No brief disappearances during OS repeat period
- ✅ Can type text or perform operations during hold

---

## Test 4: Drag File Without Releasing D Key

**Objective**: Verify overlay persists during drag while D is held

**Steps**:
1. Press and hold D
2. Overlay appears
3. Drag any file into the overlay window
4. Hold the file position in the overlay for 2+ seconds
5. Release the mouse to drop the file
6. Release the D key

**Expected Behavior**:
- Overlay remains visible throughout entire drag operation
- No disappearing when mouse is in overlay
- Drop action completes normally
- Overlay hides after file is saved (or immediately if drag is canceled)

**Pass Criterion**:
- ✅ Overlay never disappears during active drag
- ✅ Drop detection works correctly
- ✅ File saves or error displays correctly
- ✅ Overlay hides after operation completes

---

## Test 5: Release D Key While Dragging

**Objective**: Verify overlay persists until drag completes, even if D is released during drag

**Steps**:
1. Press and hold D
2. Overlay appears
3. Begin dragging a file into the overlay
4. **While file is mid-drag**, release the D key
5. Continue dragging file over the overlay
6. Drop the file

**Expected Behavior**:
- Overlay remains visible while file is being dragged
- Overlay doesn't disappear when D is released
- File drop completes successfully
- Overlay hides after file is processed

**Pass Criterion**:
- ✅ Overlay persists through D key release during drag
- ✅ Drag operation unaffected by key release
- ✅ File saves successfully
- ✅ Overlay hides appropriately after drop

---

## Test 6: Focus Preservation

**Objective**: Verify overlay doesn't steal focus or minimize other apps

**Steps**:
1. Open an active application (web browser, text editor, etc.)
2. Click on that application to ensure it has focus
3. Note the application's title bar (should be highlighted if focused)
4. Press and hold D
5. Overlay appears
6. Observe the previously focused application's title bar
7. Type in the previously focused application (while holding D)
8. Release D

**Expected Behavior**:
- Overlay appears over the focused application
- Previously focused application's title bar remains highlighted
- Keystrokes to the previously focused app go through
- Overlay doesn't steal focus or cause the app to minimize
- Overlay hides when D is released

**Pass Criterion**:
- ✅ Application focus indicator remains unchanged
- ✅ Keystrokes reach the focused application
- ✅ Overlay is visible but doesn't interfere with interaction
- ✅ No accidental minimization of open windows
- ✅ Taskbar doesn't show overlay as a separate application

---

## Test 7: Window Switching While Overlay Visible

**Objective**: Verify overlay remains visible when switching windows

**Steps**:
1. Press and hold D
2. Overlay appears
3. Press Alt+Tab to open window switcher
4. While holding D and with switcher visible, select another application
5. Release D

**Expected Behavior**:
- Overlay remains visible above the window switcher
- Alt+Tab window switcher is usable
- New application comes to focus when selected
- Overlay is still visible above the new application
- Overlay hides when D is released

**Pass Criterion**:
- ✅ Overlay doesn't interfere with Alt+Tab
- ✅ Window switching works normally
- ✅ Overlay remains on top of target application
- ✅ Focus management works correctly

---

## Test 8: Multiple Drag Operations

**Objective**: Verify drag state tracking works across multiple sequential drags

**Steps**:
1. Press D and hold
2. Drag file #1 into overlay, drop
3. Without releasing D, drag file #2 into overlay, drop
4. Without releasing D, drag file #3 into overlay, drop
5. Release D

**Expected Behavior**:
- Overlay remains visible throughout all three drops
- Each file saves successfully
- Overlay stays visible between drops
- Overlay hides only after D is released

**Pass Criterion**:
- ✅ Overlay persists through multiple drops
- ✅ Each file saves with correct metadata
- ✅ No hidden state issues between operations
- ✅ Correct number of items in vault after test

---

## Test 9: Text Input and Paste

**Objective**: Verify text saving works while D key integration is active

**Steps**:
1. Press D and hold
2. Overlay appears
3. Type some text in the textarea
4. Press Ctrl+Enter to save
5. Release D

**Expected Behavior**:
- Text is visible in overlay textarea
- Text saves successfully with category detection
- Success message displays
- Overlay hides after 500ms

**Pass Criterion**:
- ✅ Text input works correctly
- ✅ Category detection works
- ✅ Save operation completes
- ✅ Text appears in main app Items view

---

## Test 10: Paste and URL Detection

**Objective**: Verify pasted content is properly categorized

**Steps**:
1. Copy a URL to clipboard: `https://example.com`
2. Press D and hold
3. Click the "Paste" button
4. Verify URL is detected
5. Press Ctrl+Enter to save
6. Release D

**Expected Behavior**:
- Pasted text contains URL
- Category hint shows "links" category
- URL saves with correct category
- Overlay auto-closes after save

**Pass Criterion**:
- ✅ Paste functionality works in overlay
- ✅ URL is correctly detected
- ✅ Category "links" is assigned
- ✅ Item appears in vault

---

## Test 11: Main Window (Ctrl+Shift+D) Still Works

**Objective**: Verify overlay doesn't interfere with main app hotkey

**Steps**:
1. Verify overlay is hidden (D not pressed)
2. Press Ctrl+Shift+D
3. Main application window should open (500x500)
4. Verify you can see the Dump and Items tabs
5. Press Ctrl+Shift+D again to close
6. Verify D key overlay still works

**Expected Behavior**:
- Main window opens on Ctrl+Shift+D
- Main window is separate from overlay
- Can toggle main window while overlay is hidden
- D key overlay and Ctrl+Shift+D don't conflict

**Pass Criterion**:
- ✅ Ctrl+Shift+D opens/closes main window
- ✅ Overlay hotkey independent of main window hotkey
- ✅ Both windows don't appear simultaneously
- ✅ Items tab shows previously saved items

---

## Test 12: Overlay Canvas Interaction

**Objective**: Verify clicks and interactions in overlay don't steal focus

**Steps**:
1. Open a text editor with some content
2. Place text editor in background
3. Press D to show overlay
4. Click on the overlay textarea
5. Type some text
6. Click outside overlay but within overlay window bounds
7. Release D

**Expected Behavior**:
- Overlay appears without minimizing text editor
- Clicks register in overlay textarea for typing
- Text entry works normally
- Overlay hides on D release
- Text editor remains in its previous state

**Pass Criterion**:
- ✅ Clicks work in overlay areas
- ✅ Text input captures work
- ✅ No focus-stealing to overlay
- ✅ Background app unchanged

---

## Stress Tests

### Test 13: Extended Hold with Mouse Movement

**Objective**: Verify overlay remains stable during extended use

**Steps**:
1. Press D and hold for 10 seconds
2. During the hold, move mouse around
3. Make circular motions with mouse
4. Drag file in/out multiple times (without dropping)
5. Release D

**Expected Behavior**:
- Overlay stays visible throughout
- Mouse movement doesn't affect overlay state
- No flicker or visual artifacts
- Overlay hides cleanly on release

**Pass Criterion**:
- ✅ No unexpected disappearances
- ✅ Overlay remains on screen
- ✅ Smooth performance throughout

---

### Test 14: Very Fast Key Repeats (Heavy OS Load)

**Objective**: Verify debouncing works under OS key repeat stress

**Steps**:
1. Press D, release immediately
2. Rapidly press/release D 10 times in succession
3. Then hold D for 2 seconds

**Expected Behavior**:
- Overlay appears/disappears for each tap (or stays mostly hidden)
- No flickering or visual artifacts
- During the 2-second hold, overlay stays visible
- Clean hide on final release

**Pass Criterion**:
- ✅ No crashes or hangs
- ✅ Responsive to all key events
- ✅ Smooth transitions between states

---

### Test 15: Large File Drag

**Objective**: Verify drag state handling with larger files

**Steps**:
1. Press D and hold
2. Drag a large file (100MB+) into the overlay
3. Hold the file position for 10+ seconds
4. Drop the file
5. Wait for metadata extraction to complete
6. Release D

**Expected Behavior**:
- Overlay remains visible during entire drag
- File saves successfully despite size
- Metadata extraction starts automatically
- Overlay hides after save completes

**Pass Criterion**:
- ✅ No timeout issues
- ✅ Large file handled correctly
- ✅ Overlay state stable throughout
- ✅ Item appears in vault correctly

---

## Verification Checklist

After running all tests, verify:

- [ ] Test 1: Basic Show/Hide - PASS
- [ ] Test 2: Rapid Taps - PASS
- [ ] Test 3: Key Repeat - PASS
- [ ] Test 4: Drag Without Release - PASS
- [ ] Test 5: Release During Drag - PASS
- [ ] Test 6: Focus Preservation - PASS
- [ ] Test 7: Window Switching - PASS
- [ ] Test 8: Multiple Drags - PASS
- [ ] Test 9: Text Input - PASS
- [ ] Test 10: URL Paste - PASS
- [ ] Test 11: Main Window Hotkey - PASS
- [ ] Test 12: Overlay Interaction - PASS
- [ ] Test 13: Extended Hold - PASS
- [ ] Test 14: Fast Repeats - PASS
- [ ] Test 15: Large File - PASS

**Overall Result**: ✅ All tests pass = Implementation is production-ready

---

## Troubleshooting

### Overlay Flickers on D Press/Release

**Possible Cause**: Debounce timing is too short for your system
**Solution**: Increase `KEY_UP_DEBOUNCE_MS` in `electron/main.cjs` from 50 to 100

### Overlay Steals Focus

**Possible Cause**: Window configuration issue
**Solution**: Verify in `createOverlayWindow()`:
- `focusable: false` is set
- `setFocusable(false)` is called
- `setIgnoreMouseEvents(false, { forward: true })` for Windows

### Overlay Disappears During Drag

**Possible Cause**: Drag state not being communicated
**Solution**: Verify in `App.jsx`:
- `setOverlayDragState(true)` called in `dragenter`
- `setOverlayDragState(false)` called in `drop` and `dragleave`

### D Key Doesn't Respond

**Possible Cause**: Keyboard library not initialized
**Solution**: Check `npm list keyboard` and reinstall if needed:
```bash
npm rebuild keyboard
```

### Main Window Hotkey (Ctrl+Shift+D) Not Working

**Possible Cause**: Different keyboard layout
**Solution**: In `setupMainWindowHotkey()`, the hotkey registration can be device-specific.
Verify with: `console.log()` statements in the hotkey callback

---

## Performance Metrics

After testing, expected performance characteristics:

- **D key response time**: < 10ms (instant perceived)
- **Overlay hide delay**: 50ms (imperceptible, smooth feel)
- **Drag state sync**: < 5ms IPC latency
- **CPU usage on hold**: < 0.1% (idle monitoring)
- **Memory overhead**: ~0.5MB per overlay window instance

---

## Conclusion

This comprehensive test suite verifies that the key state tracking system provides:
1. Native-feeling D key interaction
2. Zero flicker across all scenarios
3. Proper focus management
4. Seamless drag operation support
5. Robustness under edge cases

Run this test suite regularly to ensure stability as the codebase evolves.
