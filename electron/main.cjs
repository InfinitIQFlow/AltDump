const { app, BrowserWindow, globalShortcut, ipcMain, Menu, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const storage = require("./storage.cjs");
const {
  addTextItem,
  addFileItem,
  getItems,
  deleteItem,
  loadItems,
  saveItems,
  VAULT_DIR,
  // New unified functions
  createTextItem,
  createFileItem,
  createLinkItem,
  addItem,
  // Smart search
  smartSearch,
  parseSearchIntent,
  getItemEmbeddings,
  updateItemEmbedding,
  // Test data
  createTestItems,
  // Validation & detection functions
  isRejectedFile,
  getRejectionReason,
  detectCategoryFromFile,
  detectCategoryFromText,
  isURLContent,
  // Categories
  CATEGORIES,
  FILE_TYPE_MAP,
  REJECTED_TYPES
} = storage;
// Use a single low-level global hook for deterministic press-and-hold behavior
// uiohook-napi is included in package.json and provides global keydown/keyup events
let uiohook = null;
try {
  uiohook = require("uiohook-napi");
} catch (err) {
  console.error('[KEYBOARD] Failed to require uiohook-napi:', err && err.message);
}
// Will hold the actual emitter we attach handlers to (either uiohook or uiohook.uIOhook)
let uiohookEmitter = null;

let mainWindow;
let mainWindowVisible = false;
let mainWindowHideTimeout;

let overlayWindow;
let overlayVisible = false;

// Key state tracking - managed entirely by main process
let isDraggingInOverlay = false;
// Trigger state for Alt + D chord
let altPhysicallyDown = false;
let dPhysicallyDown = false;
// Overlay state machine: 'hidden' | 'pressing' | 'latched' | 'saving'
let overlayState = 'hidden';
let stateBeforePressing = null; // Track state before entering pressing for toggle logic
let pressTimer = null;
let pressStartTime = null; // Track when press started for duration detection
const PRESS_THRESHOLD_MS = 400; // hold threshold to enter latched mode

function setOverlayState(newState, reason = '') {
  if (overlayState === newState) return;
  
  const logReason = reason ? ` (${reason})` : '';
  console.log(`[OVERLAY][FSM] ${overlayState} -> ${newState}${logReason}`);
  const previousState = overlayState;
  overlayState = newState;

  // Clear any pending timer on state change
  if (pressTimer) {
    clearTimeout(pressTimer);
    pressTimer = null;
  }

  switch (newState) {
    case 'hidden':
      // Only hide overlay when explicitly transitioning to hidden state
      // Never hide while dragging
      if (!isDraggingInOverlay && overlayWindow && overlayVisible) {
        hideOverlayWindow();
      }
      stateBeforePressing = null;
      break;

    case 'pressing':
      // Show overlay immediately on press, start threshold timer
      if (overlayWindow && !overlayVisible) {
        showOverlayWindow();
      }
      // Remember the state we came from for toggle logic on release
      if (previousState !== 'pressing' && previousState !== 'saving') {
        stateBeforePressing = previousState;
      }
      // Start hold timer: if we reach threshold, transition to latched
      pressTimer = setTimeout(() => {
        pressTimer = null;
        // Timer fired while in pressing state → transition to latched
        setOverlayState('latched', 'hold timeout expired');
      }, PRESS_THRESHOLD_MS);
      break;

    case 'latched':
      // Latched: overlay locked visible, independent of key state
      if (overlayWindow && !overlayVisible) {
        showOverlayWindow();
      }
      stateBeforePressing = null;
      break;

    case 'saving':
      // Save in progress: lock overlay visible, block all hide transitions
      if (overlayWindow && !overlayVisible) {
        showOverlayWindow();
      }
      break;

    default:
      break;
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    show: true,
    alwaysOnTop: false,
    center: true,
    frame: true,
    transparent: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
    },
  });

  const isDev = !app.isPackaged;
  mainWindow.loadURL(
    isDev
      ? "http://localhost:5173"
      : `file://${path.join(__dirname, "../dist/index.html")}`
  );

  // Debug: log when the main renderer loads and surface its console output
  mainWindow.webContents.on("did-finish-load", () => {
    try {
      console.log("[MAIN WINDOW] did-finish-load URL:", mainWindow.webContents.getURL());
      // DevTools auto-open disabled; open manually with Ctrl+Shift+I when needed
    } catch (e) {
      console.error("[MAIN WINDOW] did-finish-load handler error:", e && e.message);
    }
  });

  mainWindow.webContents.on("console-message", (event, level, message, line, sourceId) => {
    console.log(`[MAIN WINDOW CONSOLE][level=${level}] ${message} (${sourceId}:${line})`);
  });

  // Also surface overlay renderer console logs for debugging drops/saves
  try {
    overlayWindow && overlayWindow.webContents && overlayWindow.webContents.on("console-message", (event, level, message, line, sourceId) => {
      console.log(`[OVERLAY CONSOLE][level=${level}] ${message} (${sourceId}:${line})`);
    });
  } catch (e) {}

  mainWindow.webContents.on("render-process-gone", (event, details) => {
    console.error("[MAIN WINDOW] renderer process gone:", details);
  });

  // NOTE: Global keyboard hook is set up in setupGlobalKeyboardHook()
  // This process uses a single low-level hook (uiohook) for the overlay trigger
  // which allows detection even when app is not focused

  // Handle window closed
  mainWindow.on("closed", () => {
    mainWindow = null;
    mainWindowVisible = false;
  });

  // We no longer auto-hide the main window on blur; user can close it manually or via shortcut.

  return mainWindow;
}

function createOverlayWindow() {
  console.log("[OVERLAY] Creating overlay window...");
  overlayWindow = new BrowserWindow({
    width: 420,
    height: 180,
    show: false,
    alwaysOnTop: true,
    center: true,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    focusable: true,  // Allow focus so it can receive keyboard events
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
    },
  });

  console.log("[OVERLAY] Overlay window created, loading URL...");
  const isDev = !app.isPackaged;
  const overlayUrl = isDev
    ? "http://localhost:5173?overlay=true"
    : `file://${path.join(__dirname, "../dist/index.html")}?overlay=true`;
  
  console.log("[OVERLAY] Loading URL:", overlayUrl);
  overlayWindow.loadURL(overlayUrl);

  // Prevent default navigation behaviors which can cause dropped files to open
  overlayWindow.webContents.on("will-navigate", (e) => {
    e.preventDefault();
  });

  // Prevent attaching webviews into the overlay
  overlayWindow.webContents.on("will-attach-webview", (e) => {
    e.preventDefault();
  });

  // Deny any window.open attempts from the overlay
  if (typeof overlayWindow.webContents.setWindowOpenHandler === 'function') {
    overlayWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  }

  // On Windows, use setIgnoreMouseEvents configuration for overlays
  if (process.platform === "win32") {
    // Set to false to allow the overlay to receive mouse and drag events
    overlayWindow.setIgnoreMouseEvents(false);
    console.log("[OVERLAY] setIgnoreMouseEvents(false) - overlay will receive events");
  }

  // Track drag state for mouse events
  let isDraggingInOverlayWindow = false;

  // Handle window closed
  overlayWindow.on("closed", () => {
    console.log("[OVERLAY] Overlay window closed");
    overlayWindow = null;
    overlayVisible = false;
    triggerPhysicallyDown = false;
    isDraggingInOverlay = false;
  });

  overlayWindow.webContents.on("did-finish-load", () => {
    console.log("[OVERLAY] Overlay window content loaded");
    // DevTools no longer auto-open for the overlay to avoid focus/blur hiding the window.
    // Open manually with Ctrl+Shift+I when needed.
  });

  overlayWindow.webContents.on("console-message", (event, level, message, line, sourceId) => {
    console.log(`[OVERLAY CONSOLE][level=${level}] ${message} (${sourceId}:${line})`);
  });

  console.log("[OVERLAY] Overlay window fully configured");
  return overlayWindow;
}

function showMainWindow() {
  if (!mainWindow) {
    createMainWindow();
  }
  if (mainWindow) {
    clearTimeout(mainWindowHideTimeout);
    mainWindow.show();
    mainWindow.focus();
    mainWindowVisible = true;
  }
}

function hideMainWindow() {
  if (mainWindow && mainWindowVisible) {
    mainWindow.hide();
    mainWindowVisible = false;
  }
}

function showOverlayWindow() {
  if (!overlayWindow) {
    console.log("[OVERLAY] Creating overlay window");
    createOverlayWindow();
  }
  if (overlayWindow && !overlayVisible) {
    console.log("[OVERLAY] Showing overlay window");
    overlayWindow.show();
    overlayVisible = true;
    console.log("[OVERLAY] Overlay window visible:", overlayVisible);
  } else {
    console.log("[OVERLAY] Overlay already visible or window is null");
  }
}

function hideOverlayWindow() {
  if (!isDraggingInOverlay && overlayWindow && overlayVisible) {
    console.log("[OVERLAY] Hiding overlay window");
    overlayWindow.hide();
    overlayVisible = false;
    console.log("[OVERLAY] Overlay window hidden");
  } else {
    console.log("[OVERLAY] Cannot hide: dragging=", isDraggingInOverlay, "visible=", overlayVisible);
  }
}

// Setup global hotkey for main window (Ctrl+Shift+D)
function setupMainWindowHotkey() {
  const ret = globalShortcut.register("ctrl+shift+d", () => {
    if (mainWindowVisible) {
      hideMainWindow();
    } else {
      showMainWindow();
    }
  });

  if (!ret) {
    console.error("Failed to register main window hotkey (Ctrl+Shift+D)");
  } else {
    console.log("Main window hotkey registered: Ctrl+Shift+D");
  }
}

// Handle Left Alt key down - show overlay when Left Alt is physically pressed
// Old Left Alt handler removed. Using single global hook (uiohook) for deterministic
// press-and-hold behavior. The new hook listens for CapsLock keydown/keyup and
// shows/hides the overlay immediately.

// IPC Handlers
ipcMain.handle("save-text", async (event, text) => {
  // Enter saving state to lock overlay visible until renderer finishes confirmation
  try {
    setOverlayState('saving');
  } catch (e) {}
  const saved = await storage.addTextItem(text);
  if (mainWindow) {
    mainWindow.webContents.send("items-updated");
  }
  // Send success event to renderer - stay in saving state
  // Renderer will show success animation and call hide-overlay when done
  if (overlayWindow && overlayVisible) {
    overlayWindow.webContents.send('overlay-save-success');
  }
  return saved;
});

ipcMain.handle("save-file", async (event, filePath) => {
  console.log("[MAIN] save-file handler called with:", filePath);
  // Validate that we received a real filesystem path
  if (!filePath || typeof filePath !== "string" || filePath.trim() === "") {
    console.log("[MAIN] Invalid file path provided");
    throw new Error("Invalid file path: path must be a non-empty string");
  }
  try {
    console.log("[MAIN] Setting overlay state to saving");
    setOverlayState('saving');
  } catch (e) {
    console.error("[MAIN] Error setting overlay state:", e);
  }
  
  console.log("[MAIN] Calling storage.addFileItem with:", filePath);
  const saved = await storage.addFileItem(filePath);
  console.log("[MAIN] File saved successfully:", saved);
  if (mainWindow) {
    mainWindow.webContents.send("items-updated");
  }
  
  // Send success event to renderer - stay in saving state
  // Renderer will show success animation and call hide-overlay when done
  if (overlayWindow && overlayVisible) {
    console.log("[MAIN] Sending overlay-save-success event to renderer");
    overlayWindow.webContents.send('overlay-save-success');
  } else {
    console.log("[MAIN] Overlay window not available or not visible:", { overlayWindow: !!overlayWindow, overlayVisible });
  }
  
  return saved;
});

// Accept file blobs from renderer when File.path is not available (e.g., some drop events)
ipcMain.handle("save-file-blob", async (event, fileMeta) => {
  try {
    console.log('[MAIN] save-file-blob called', fileMeta && fileMeta.name);
    if (!fileMeta || !fileMeta.name || !fileMeta.buffer) {
      throw new Error('Invalid file blob payload');
    }

    // Create a temporary file path
    const tmp = require('os').tmpdir();
    const tmpName = `${Date.now()}-${fileMeta.name}`;
    const tmpPath = path.join(tmp, tmpName);

    // Buffer may come as an ArrayBuffer-like object; ensure Buffer
    let buf;
    if (Buffer.isBuffer(fileMeta.buffer)) {
      buf = fileMeta.buffer;
      console.log('[MAIN] Buffer is already a Buffer');
    } else if (fileMeta.buffer && fileMeta.buffer.data) {
      buf = Buffer.from(fileMeta.buffer.data);
      console.log('[MAIN] Buffer created from buffer.data');
    } else if (fileMeta.buffer instanceof ArrayBuffer) {
      buf = Buffer.from(fileMeta.buffer);
      console.log('[MAIN] Buffer created from ArrayBuffer');
    } else if (fileMeta.buffer instanceof Uint8Array) {
      buf = Buffer.from(fileMeta.buffer);
      console.log('[MAIN] Buffer created from Uint8Array');
    } else if (typeof fileMeta.buffer === 'object') {
      // Try to handle other buffer-like objects
      try {
        buf = Buffer.from(fileMeta.buffer);
        console.log('[MAIN] Buffer created from generic object');
      } catch (e) {
        console.log('[MAIN] Failed to create buffer from generic object, trying JSON stringify');
        buf = Buffer.from(JSON.stringify(fileMeta.buffer));
      }
    } else {
      console.error('[MAIN] Unsupported buffer format. Buffer type:', typeof fileMeta.buffer);
      console.log('[MAIN] Buffer constructor:', fileMeta.buffer && fileMeta.buffer.constructor ? fileMeta.buffer.constructor.name : 'unknown');
      throw new Error('Unsupported buffer format: ' + typeof fileMeta.buffer);
    }

    console.log('[MAIN] Buffer length:', buf.length, 'bytes');

    // Write temp file
    fs.writeFileSync(tmpPath, buf);
    console.log('[MAIN] Wrote temp file for blob at', tmpPath);

    // Use existing save-file flow by calling storage.addFileItem
    try {
      setOverlayState('saving');
    } catch (e) {}
    const saved = await storage.addFileItem(tmpPath);

    if (overlayWindow && overlayVisible) {
      console.log('[MAIN] Sending overlay-save-success event to renderer (blob)');
      overlayWindow.webContents.send('overlay-save-success');
    }

    // Optionally delete the tmp file after saving to vault; storage copied file into VAULT_DIR
    try { fs.unlinkSync(tmpPath); } catch (e) {}

    if (mainWindow) {
      mainWindow.webContents.send("items-updated");
    }

    return saved;
  } catch (err) {
    console.error('[MAIN] save-file-blob error:', err && err.message);
    throw err;
  }
});

ipcMain.handle("get-items", async (event) => {
  return storage.getItems();
});

ipcMain.handle("delete-item", async (event, id) => {
  storage.deleteItem(id);
});

// Vault path for building local file URLs (thumbnails, etc.)
ipcMain.handle("get-vault-dir", async () => {
  return VAULT_DIR;
});

// Open a stored file in the OS default application
ipcMain.handle("open-item-path", async (event, filePath) => {
  if (!filePath || typeof filePath !== "string") return;
  try {
    await shell.openPath(filePath);
  } catch (err) {
    console.error("[MAIN] Failed to open item path:", err && err.message);
  }
});

// Validation & Detection IPC Handlers
ipcMain.handle("validate-file", async (event, filePath) => {
  const isRejected = storage.isRejectedFile(filePath);
  if (isRejected) {
    return {
      valid: false,
      reason: storage.getRejectionReason(filePath),
    };
  }
  return {
    valid: true,
    category: storage.detectCategoryFromFile(filePath),
  };
});

ipcMain.handle("detect-category", async (event, filePath) => {
  return storage.detectCategoryFromFile(filePath);
});

ipcMain.handle("is-url-content", async (event, text) => {
  return storage.isURLContent(text);
});

// Overlay control
ipcMain.handle("hide-overlay", async () => {
  // Renderer requested explicit hide (e.g., after save confirmation). Transition state-driven.
  isDraggingInOverlay = false;
  setOverlayState('hidden');
});

ipcMain.handle("show-main-window", async () => {
  showMainWindow();
});

// Overlay state communication to renderer
ipcMain.handle("get-overlay-state", async () => {
  return {
    state: overlayState,
    isDragging: isDraggingInOverlay,
    reason: stateBeforePressing
  };
});

// Smart search handler
ipcMain.handle("smart-search", async (event, query) => {
  try {
    console.log("[MAIN] Smart search query:", query);
    const results = await storage.smartSearch(query);
    console.log("[MAIN] Search results:", results.results.length, "items");
    return results;
  } catch (error) {
    console.error("[MAIN] Smart search error:", error);
    return { results: [], explanation: "Search failed", error: error.message };
  }
});

// Test data handler (for development)
ipcMain.handle("create-test-items", async () => {
  try {
    console.log("[MAIN] Creating test items...");
    storage.createTestItems();
    return { success: true, message: "Test items created" };
  } catch (error) {
    console.error("[MAIN] Failed to create test items:", error);
    return { success: false, error: error.message };
  }
});

// Context-aware mode setting
ipcMain.handle("set-overlay-mode", async (event, mode) => {
  if (overlayWindow && overlayVisible) {
    console.log('[MAIN] Setting overlay mode to:', mode);
    overlayWindow.webContents.send('overlay-mode-change', mode);
  }
});
ipcMain.handle("set-overlay-drag-state", async (event, isDragging) => {
  isDraggingInOverlay = isDragging;
  
  // On Windows, temporarily disable setIgnoreMouseEvents during drag to allow file data transfer
  if (process.platform === "win32" && overlayWindow) {
    try {
      if (isDragging) {
        // Disable ignore mouse events during drag so Windows can pass file data
        overlayWindow.setIgnoreMouseEvents(false);
        console.log("[OVERLAY] Drag started: setIgnoreMouseEvents(false) for file transfer");
      } else {
        // Re-enable ignore mouse events after drag is complete
        overlayWindow.setIgnoreMouseEvents(false);
        console.log("[OVERLAY] Drag ended: setIgnoreMouseEvents(false) restored");
      }
    } catch (err) {
      console.error("[OVERLAY] Error setting ignore mouse events:", err);
    }
  }
  
  // Drag state tracked for renderer; overlay hide/show is driven solely by the
  // low-level trigger hook (uiohook). We do not perform debounced or fallback
  // hide logic here to keep behavior deterministic.
});

// Setup single global low-level keyboard hook using uiohook-napi
function setupUiohookTrigger() {
  if (!uiohook) {
    console.error("[KEYBOARD] uiohook not available; cannot setup trigger hook");
    return;
  }

  console.log("[KEYBOARD] Setting up uiohook Alt + D chord trigger...");

  // Key detection helpers
  const isAltKey = (ev) => {
  const keycode = ev.keycode ?? ev.keyCode;
  return keycode === 56 || keycode === 3640; // Left Alt + Right Alt (AltGr)
};


  const isDKey = (ev) => {
    if (!ev) return false;
    const keycode = ev.keycode ?? ev.keyCode;
    // D key: keycode 32 on most systems
    return keycode === 32;
  };

  const isChorded = () => {
    // Trigger only when BOTH Alt and D are physically down
    return altPhysicallyDown && dPhysicallyDown;
  };

  // Determine event emitter API
  const emitter = uiohook.uIOhook || uiohook;
  uiohookEmitter = emitter;

  if (!emitter) {
    console.error('[KEYBOARD] uiohook does not expose event methods; cannot attach listeners');
    return;
  }

  // Alt + D chord: keyDown handler
  emitter.on("keydown", (ev) => {
    try {
      if (!ev) return;

      // Track Alt key state
      if (isAltKey(ev)) {
        if (!altPhysicallyDown) {
          altPhysicallyDown = true;
          // Record press start time when first key goes down
          if (!pressStartTime && !dPhysicallyDown) {
            pressStartTime = Date.now();
          }
          try { console.log('[KEYBOARD] Alt pressed, chord state: Alt=' + altPhysicallyDown + ' D=' + dPhysicallyDown); } catch (e) {}
        }
        // Check if both keys are now down to trigger overlay
        if (altPhysicallyDown && dPhysicallyDown) {
          handleAltDChord();
        }
        return;
      }

      // Track D key state
      if (isDKey(ev)) {
        if (!dPhysicallyDown) {
          dPhysicallyDown = true;
          // Record press start time when first key goes down
          if (!pressStartTime && !altPhysicallyDown) {
            pressStartTime = Date.now();
          }
          try { console.log('[KEYBOARD] D pressed, chord state: Alt=' + altPhysicallyDown + ' D=' + dPhysicallyDown); } catch (e) {}
        }
        // Check if both keys are now down to trigger overlay
        if (altPhysicallyDown && dPhysicallyDown) {
          handleAltDChord();
        }
        return;
      }
    } catch (err) {
      console.error('[KEYBOARD] Error in keydown handler:', err && err.message);
    }
  });

  // Alt + D chord: keyUp handler
  emitter.on("keyup", (ev) => {
    try {
      if (!ev) return;

      let wasChordActive = isChorded();

      // Track Alt key release
      if (isAltKey(ev)) {
        altPhysicallyDown = false;
        // Reset press start time when chord breaks
        if (wasChordActive) {
          pressStartTime = null;
        }
        try { console.log('[KEYBOARD] Alt released, chord state: Alt=' + altPhysicallyDown + ' D=' + dPhysicallyDown); } catch (e) {}
        // If chord was active, hide overlay
        if (wasChordActive) {
          handleAltDRelease();
        }
        return;
      }

      // Track D key release
      if (isDKey(ev)) {
        dPhysicallyDown = false;
        // Reset press start time when chord breaks
        if (wasChordActive) {
          pressStartTime = null;
        }
        try { console.log('[KEYBOARD] D released, chord state: Alt=' + altPhysicallyDown + ' D=' + dPhysicallyDown); } catch (e) {}
        // If chord was active, hide overlay
        if (wasChordActive) {
          handleAltDRelease();
        }
        return;
      }
    } catch (err) {
      console.error('[KEYBOARD] Error in keyup handler:', err && err.message);
    }
  });

  // Handler: Alt + D chord pressed (both keys down)
  function handleAltDChord() {
    // Ignore key events while saving (block all transitions during save)
    if (overlayState === 'saving') {
      console.log('[OVERLAY][FSM] Ignoring Alt+D while saving');
      return;
    }

    // Context-aware open: if user is dragging, open directly in drop mode
    if (isDraggingInOverlay) {
      console.log('[OVERLAY][FSM] Context-aware open: user is dragging, opening in drop mode');
      setOverlayState('latched', 'context-aware (dragging)');
      return;
    }

    // Reopen-on-failure: if overlay recently closed due to error, reopen in same mode
    if (overlayState === 'hidden' && stateBeforePressing === 'error') {
      console.log('[OVERLAY][FSM] Reopen-on-failure: reopening in previous mode');
      setOverlayState('pressing', 'reopen-on-failure');
      return;
    }

    // FSM transition rules for Alt+D chord:
    if (overlayState === 'hidden') {
      // hidden + Alt+D → pressing (show overlay, start hold timer)
      setOverlayState('pressing', 'Alt+D press from hidden state');
    } else if (overlayState === 'latched') {
      // latched + Alt+D → pressing (restart toggle cycle)
      setOverlayState('pressing', 'Alt+D press from latched state (toggle cycle)');
    } else if (overlayState === 'pressing') {
      // Already in pressing state → no transition (both keys held)
      console.log('[OVERLAY][FSM] Ignoring chord while already pressing (held)');
    }
  }

  // Handler: Alt or D released (chord broken)
  function handleAltDRelease() {
    // Ignore key events while saving (block all transitions during save)
    if (overlayState === 'saving') {
      console.log('[OVERLAY][FSM] Ignoring chord release while saving');
      return;
    }

    // FSM transition rules for chord release:
    if (overlayState === 'pressing') {
      // pressing + chord release (before hold timeout) → toggle based on previous state
      // This enforces the toggle rule: hidden ↔ latched via quick press/release
      if (stateBeforePressing === 'hidden') {
        setOverlayState('latched', 'quick release transitions hidden→latched');
      } else if (stateBeforePressing === 'latched') {
        setOverlayState('hidden', 'quick release transitions latched→hidden');
      } else {
        // Fallback: treat as returning to hidden
        console.log('[OVERLAY][FSM] Fallback: chord release in pressing with unknown previous state, returning to hidden');
        setOverlayState('hidden', 'quick release (state unknown)');
      }
    } else if (overlayState === 'latched') {
      // latched + chord release → no transition (overlay remains latched)
      // This prevents hide until explicit Alt+D press returns to pressing → hidden cycle
      console.log('[OVERLAY][FSM] Chord release while latched: no transition (overlay locked)');
    } else if (overlayState === 'hidden') {
      // hidden + chord release → no transition (should not happen)
      console.log('[OVERLAY][FSM] Chord release while hidden: no transition');
    }
  }

  // Start uiohook service if available (it may be a function on root or nested)
  try {
    if (typeof uiohook.start === "function") {
      uiohook.start();
    } else if (uiohook && uiohook.uIOhook && typeof uiohook.uIOhook.start === "function") {
      uiohook.uIOhook.start();
    } else if (typeof emitter.start === "function") {
      emitter.start();
    } else {
      console.warn('[KEYBOARD] uiohook start method not found; events may already be active');
    }
    console.log("[KEYBOARD] uiohook started - listening for Alt + D chord");
  } catch (err) {
    console.error('[KEYBOARD] Failed to start uiohook or attach listeners:', err && err.message);
  }
}

// Note: per new design, no window-based keyup detection or fallback timers are used.
// All overlay show/hide decisions come solely from the low-level uiohook listener.

// App event handlers
app.whenReady().then(() => {
  console.log("[APP] Creating main window...");
  createMainWindow();

  console.log("[APP] Creating overlay window...");
  createOverlayWindow(); // ✅ THIS WAS MISSING

  console.log("[APP] Setting up main window hotkey...");
  setupMainWindowHotkey();

  console.log("[APP] Setting up global trigger hook (Alt + D)...");
  setupUiohookTrigger();

  console.log("[APP] Startup complete - waiting for trigger press");
});

app.on("before-quit", () => {
  console.log("[APP] Cleaning up keyboard hook...");
  if (uiohook) {
    try {
      if (uiohookEmitter && typeof uiohookEmitter.removeAllListeners === 'function') {
        try { uiohookEmitter.removeAllListeners(); } catch (e) {}
      }
      if (typeof uiohook.stop === 'function') {
        uiohook.stop();
      } else if (uiohook && uiohook.uIOhook && typeof uiohook.uIOhook.stop === 'function') {
        uiohook.uIOhook.stop();
      }
      console.log('[KEYBOARD] uiohook stopped');
    } catch (err) {
      console.error('[APP] Error stopping uiohook:', err && err.message);
    }
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createMainWindow();
  }
});

app.on("will-quit", () => {
  // Clear any pending timers
  if (mainWindowHideTimeout) {
    clearTimeout(mainWindowHideTimeout);
    mainWindowHideTimeout = null;
  }
  globalShortcut.unregisterAll();
});
