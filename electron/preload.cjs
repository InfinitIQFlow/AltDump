const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  saveText: (text) => ipcRenderer.invoke("save-text", text),
  saveFile: (filePath) => ipcRenderer.invoke("save-file", filePath),
  getItems: () => ipcRenderer.invoke("get-items"),
  deleteItem: (id) => ipcRenderer.invoke("delete-item", id),
  validateFile: (filePath) => ipcRenderer.invoke("validate-file", filePath),
  detectCategory: (filePath) => ipcRenderer.invoke("detect-category", filePath),
  isURLContent: (text) => ipcRenderer.invoke("is-url-content", text),
  hideOverlay: () => ipcRenderer.invoke("hide-overlay"),
  showMainWindow: () => ipcRenderer.invoke("show-main-window"),
  setOverlayDragState: (isDragging) => ipcRenderer.invoke("set-overlay-drag-state", isDragging),
  // New overlay state management
  getOverlayState: () => ipcRenderer.invoke("get-overlay-state"),
  setOverlayMode: (mode) => ipcRenderer.invoke("set-overlay-mode", mode),
  // Smart search (legacy compatibility)
  smartSearch: (query) => ipcRenderer.invoke("smart-search", query),
  // Semantic search (new SQLite + Ollama embeddings)
  semanticSearch: (query) => ipcRenderer.invoke("semantic-search", query),
  // Save item (unified save with embedding generation)
  saveItem: (itemData) => ipcRenderer.invoke("save-item", itemData),
  // Vault directory (for local file URLs like thumbnails)
  getVaultDir: () => ipcRenderer.invoke("get-vault-dir"),
  // Open an item path in the OS default app
  openItemPath: (filePath) => ipcRenderer.invoke("open-item-path", filePath),
  // Test data (development only)
  createTestItems: () => ipcRenderer.invoke("create-test-items"),
  // Items updated notification (main window only)
  onItemsUpdated: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("items-updated", handler);
    return () => ipcRenderer.removeListener("items-updated", handler);
  },
  // Listen for overlay mode changes from main process
  onOverlayModeChange: (callback) => {
    ipcRenderer.on('overlay-mode-change', (event, mode) => callback(mode));
  },
  // Listen for save success event - renderer registers callback
  onSaveSuccess: (callback) => {
    ipcRenderer.on("overlay-save-success", callback);
  },
  // Save file by sending file blob (ArrayBuffer) to main process; main will write temp file and save
  saveFileBlob: (fileMeta) => ipcRenderer.invoke("save-file-blob", fileMeta),
  // Helper to extract file path from File object (works with context isolation)
  getFilePathFromDrop: (fileObj) => {
    // Try to get the path property which Electron adds to File objects
    if (fileObj && fileObj.path) {
      return fileObj.path;
    }
    // Fallback: try other possible properties
    if (fileObj && fileObj.webkitRelativePath) {
      return fileObj.webkitRelativePath;
    }
    console.log("[Preload] File object properties:", Object.keys(fileObj || {}));
    return null;
  },
});

// Keep a capture of the last drop's file paths. Preload runs in an isolated
// context and can read File.path from the raw drop event even when the renderer
// is sandboxed. We listen in capture phase on `document` and stash the paths
// for the renderer to request via the safe `api` bridge below.
let _lastDroppedPaths = [];
let _dragDepth = 0; // Track drag depth to prevent flickering
let _lastDropEvent = null; // Store the actual drop event for file content access

const _captureDropPaths = (e) => {
  try {
    const files = e && e.dataTransfer && e.dataTransfer.files;
    if (files && files.length > 0) {
      console.log('[Preload] Processing', files.length, 'files from drop event');
      
      const paths = [];

      // Prefer URI list if provided (often contains full file:// paths on Windows)
      let uriListPaths = [];
      try {
        const uriList = e.dataTransfer.getData('text/uri-list');
        if (uriList && typeof uriList === 'string') {
          uriListPaths = uriList
            .split(/\r?\n/)
            .map(l => l.trim())
            .filter(l => l && !l.startsWith('#') && l.startsWith('file:'))
            .map(u => {
              // Convert file:///C:/... to C:\...
              const decoded = decodeURI(u);
              let p = decoded.replace(/^file:\/\//i, '');
              // On Windows we may still have a leading slash before drive letter
              if (p.startsWith('/') && /^[\/][A-Za-z]:/.test(p)) {
                p = p.slice(1);
              }
              return p.replace(/\//g, '\\');
            });
        }
      } catch (err) {
        // ignore
      }

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        let path = null;
        
        // Try multiple ways to get the file path
        if (file && file.path) {
          path = file.path;
        } else if (uriListPaths[i]) {
          path = uriListPaths[i];
        } else if (file && file.webkitRelativePath) {
          path = file.webkitRelativePath;
        } else if (file && file.name) {
          // As a fallback, at least capture the filename
          path = file.name;
          console.warn('[Preload] Only filename available, not full path:', path);
        }
        
        if (path) {
          paths.push(path);
          console.log('[Preload] Captured path:', path);
        } else {
          console.warn('[Preload] Could not extract path from file:', file);
        }
      }
      
      if (paths.length > 0) {
        _lastDroppedPaths = paths;
        console.log('[Preload] Successfully captured drop paths:', _lastDroppedPaths);
      } else {
        console.warn('[Preload] No valid file paths found in drop event');
        // Log file object properties for debugging
        if (files && files.length > 0) {
          console.log('[Preload] File object properties:', Object.keys(files[0] || {}));
          console.log('[Preload] File object:', files[0]);
        }
      }
    } else {
      console.warn('[Preload] No files found in drop event');
    }
  } catch (err) {
    console.warn('[Preload] Error capturing drop paths:', err && err.message);
    _lastDroppedPaths = [];
  }
};

// Track drag depth to prevent UI flickering
const _incrementDragDepth = (e) => {
  _dragDepth++;
  console.log('[Preload] Drag depth incremented:', _dragDepth);
};

const _decrementDragDepth = (e) => {
  _dragDepth--;
  console.log('[Preload] Drag depth decremented:', _dragDepth);
  if (_dragDepth <= 0) {
    _dragDepth = 0;
    // Do NOT clear _lastDroppedPaths here. On Windows, nested dragenter/dragleave
    // events can fire in ways that momentarily drop depth to 0 and would wipe
    // the paths before the actual drop occurs. We clear paths only after
    // saveDroppedFiles() consumes them.
    console.log('[Preload] Drag depth reset');
  }
};

// Capture on both dragenter (early) and drop (final) in the capture phase so
// we reliably capture file paths before the renderer's React handlers stop
// propagation.
document.addEventListener('dragenter', (e) => {
  _incrementDragDepth(e);
  _captureDropPaths(e);
}, true);

document.addEventListener('drop', (e) => {
  // Store the drop event for potential file content access
  _lastDropEvent = e;
  // Expose it to window object dynamically
  if (typeof window !== 'undefined') {
    window._lastDropEvent = e;
  }
  
  _captureDropPaths(e);
  _dragDepth = 0; // Reset depth on drop
  console.log('[Preload] Drop captured, drag depth reset');
}, true);

// Clear cache on dragleave to avoid stale paths
document.addEventListener('dragleave', (e) => {
  _decrementDragDepth(e);
}, true);

// Expose a small, safe API under `window.api` for the renderer to request
// the dropped file paths and to trigger saving of those files through the
// existing `save-file` IPC handler in the main process.
contextBridge.exposeInMainWorld("api", {
  // Return a copy of the last captured drop paths (array of strings)
  extractDroppedFilePaths: () => {
    return Array.from(_lastDroppedPaths);
  },

  // Save all dropped files (paths are taken from the last captured drop).
  // This calls the existing `save-file` IPC for each path and returns an
  // array of results (promises resolved in sequence).
  saveDroppedFiles: async () => {
    const paths = Array.from(_lastDroppedPaths || []);
    // Clear cache immediately to avoid double-processing
    _lastDroppedPaths = [];
    
    console.log('[Preload] saveDroppedFiles called with paths:', paths);
    
    // Hard error if no files are received
    if (!paths || paths.length === 0) {
      const error = new Error('No files received from drop event');
      console.error('[Preload] saveDroppedFiles error:', error.message);
      throw error;
    }
    
    const results = [];
    
    // Check if we have full paths or just filenames
    const hasFullPaths = paths.some(p => p && (p.includes('/') || p.includes('\\')));
    
    if (hasFullPaths) {
      // Use the standard save-file IPC for full paths
      for (const p of paths) {
        try {
          console.log('[Preload] Saving file with full path:', p);
          const r = await ipcRenderer.invoke("save-file", p);
          console.log('[Preload] File saved successfully:', p, r);
          results.push(r);
        } catch (err) {
          console.error('[Preload] Failed to save file:', p, err);
          results.push({ error: err && err.message ? err.message : 'Unknown error', path: p });
        }
      }
    } else {
      // We only have filenames, need to capture file content from the last drop event
      console.log('[Preload] Only filenames available, attempting to capture file content');
      
      // Try to get the files from the most recent drop event
      const dropEvent = window._lastDropEvent;
      if (dropEvent && dropEvent.dataTransfer && dropEvent.dataTransfer.files) {
        const files = dropEvent.dataTransfer.files;
        
        for (let i = 0; i < files.length && i < paths.length; i++) {
          const file = files[i];
          const filename = paths[i];
          
          try {
            console.log('[Preload] Reading file content for:', filename);
            const arrayBuffer = await file.arrayBuffer();
            console.log('[Preload] Got ArrayBuffer, length:', arrayBuffer.byteLength);
            
            // Create a proper Buffer from the ArrayBuffer
            const buffer = Buffer.from(arrayBuffer);
            console.log('[Preload] Created Buffer, length:', buffer.length);
            
            const fileMeta = {
              name: filename,
              buffer: buffer
            };
            
            console.log('[Preload] Sending fileMeta to main process:', { name: filename, bufferLength: buffer.length });
            const r = await ipcRenderer.invoke("save-file-blob", fileMeta);
            console.log('[Preload] File saved successfully via blob:', filename, r);
            results.push(r);
          } catch (err) {
            console.error('[Preload] Failed to save file via blob:', filename, err);
            results.push({ error: err && err.message ? err.message : 'Unknown error', path: filename });
          }
        }
      } else {
        throw new Error('Cannot access file content - no drop event available');
      }
    }
    
    // Ensure we have at least some successful saves
    const successfulSaves = results.filter(r => !r.error);
    if (successfulSaves.length === 0) {
      throw new Error('All files failed to save');
    }
    
    console.log('[Preload] saveDroppedFiles completed. Successful:', successfulSaves.length, 'Failed:', results.length - successfulSaves.length);
    return results;
  },
});

window.addEventListener("DOMContentLoaded", () => {
  // Initialize the global drop event reference
  window._lastDropEvent = null;
});

