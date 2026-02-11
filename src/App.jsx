import React, { useState, useEffect, useRef } from "react";
import "./styles.css";
import "./App.css";

function App() {
  // Core overlay states: 'neutral' | 'text' | 'drop' | 'saving' | 'confirmation' | 'error'
  const [overlayPhase, setOverlayPhase] = useState("neutral");
  const [text, setText] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");
  const [detectedCategory, setDetectedCategory] = useState("");
  const [items, setItems] = useState([]);
  const [isOverlay, setIsOverlay] = useState(false);
  const [showSuccessFeedback, setShowSuccessFeedback] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchResults, setSearchResults] = useState([]);
  const [searchExplanation, setSearchExplanation] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [dragDepth, setDragDepth] = useState(0); // Track drag depth to prevent flickering
  const [vaultDir, setVaultDir] = useState("");
  const [selectedItem, setSelectedItem] = useState(null);
  const textareaRef = useRef(null);
  

  // State transition helpers
  const enterTextMode = () => {
    if (overlayPhase !== 'saving' && overlayPhase !== 'confirmation') {
      console.log('[App] Entering text mode');
      setOverlayPhase('text');
      setValidationMessage("");
    }
  };

  const enterDropMode = () => {
    if (overlayPhase !== 'saving' && overlayPhase !== 'confirmation') {
      console.log('[App] Entering drop mode');
      setOverlayPhase('drop');
      setValidationMessage("");
    }
  };

  const enterSavingMode = () => {
    console.log('[App] Entering saving mode');
    setOverlayPhase('saving');
    setIsSaving(true);
    setValidationMessage("Saving...");
  };

  const enterConfirmationMode = (message = "Saved ✓") => {
    console.log('[App] Entering confirmation mode');
    setOverlayPhase('confirmation');
    setSuccessMessage(message);
    setShowSuccessFeedback(true);
    setIsSaving(false);
    
    // Clear text and category after successful save
    setText("");
    setDetectedCategory("");
    
    // Notify main process about success
    if (window.electronAPI && window.electronAPI.setOverlayMode) {
      window.electronAPI.setOverlayMode('confirmation');
    }
  };

  const enterErrorMode = (message) => {
    console.log('[App] Entering error mode');
    setOverlayPhase('error');
    setValidationMessage(message);
    setIsSaving(false);
    
    // Notify main process about error state for reopen-on-failure
    if (window.electronAPI && window.electronAPI.setOverlayMode) {
      window.electronAPI.setOverlayMode('error');
    }
  };

  const resetToNeutral = () => {
    console.log('[App] Resetting to neutral mode');
    setOverlayPhase('neutral');
    setText("");
    setDetectedCategory("");
    setValidationMessage("");
    setIsSaving(false);
    setIsDragging(false);
    setDragDepth(0);
  };

  // Detect if running in overlay mode
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isOverlayMode = params.get("overlay") === "true";
    console.log("[App] URL:", window.location.href);
    console.log("[App] URL search params:", window.location.search);
    console.log("[App] isOverlay detected:", isOverlayMode);
    setIsOverlay(isOverlayMode);

    // Register listener for save success event (overlay mode)
    if (window.electronAPI.onSaveSuccess) {
      window.electronAPI.onSaveSuccess(() => {
        console.log("[App] Save success event received");
        enterConfirmationMode();
      });
    }

    // Register listener for overlay mode changes from main process
    if (window.electronAPI.onOverlayModeChange && isOverlayMode) {
      window.electronAPI.onOverlayModeChange((mode) => {
        console.log("[App] Overlay mode change received:", mode);
        
        // Handle context-aware mode changes
        if (mode === 'drop') {
          // Context-aware: open directly in drop mode
          enterDropMode();
        } else if (mode === 'text') {
          // Reopen-on-failure: restore text mode
          enterTextMode();
        } else if (mode === 'neutral') {
          // Reset to neutral
          resetToNeutral();
        }
      });
    }
  }, []);

  // Handle text input - switch to text mode when user types or pastes
  const handleTextChange = (e) => {
    const newText = e.target.value;
    setText(newText);
    
    // If user starts typing in neutral mode, switch to text mode
    if (overlayPhase === 'neutral' && newText.trim()) {
      enterTextMode();
    }
  };

  const handlePasteClick = async () => {
    // Only allow paste when not in saving/confirmation states
    if (overlayPhase === 'saving' || overlayPhase === 'confirmation') {
      return;
    }
    
    try {
      const clipboard = await navigator.clipboard.readText();
      setText(clipboard);
      
      // Pasting switches to text mode
      enterTextMode();
      
      const isURL = await window.electronAPI.isURLContent(clipboard);
      if (isURL) {
        setDetectedCategory("links");
        setValidationMessage("Detected URL - will save as Link");
      } else {
        setDetectedCategory("text");
        setValidationMessage("Detected text");
      }
      
      textareaRef.current?.focus();
    } catch (error) {
      console.error("Failed to paste from clipboard:", error);
      setValidationMessage("Failed to paste");
    }
  };

  const loadItems = React.useCallback(async () => {
    try {
      const allItems = await window.electronAPI.getItems();
      setItems(allItems);

      if (allItems.length === 0) {
        console.log("[App] No items found, creating test data...");
        await window.electronAPI.createTestItems();
        const newItems = await window.electronAPI.getItems();
        setItems(newItems);
        console.log("[App] Created test items, loaded:", newItems.length);
      }
    } catch (error) {
      console.error("Failed to load items:", error);
    }
  }, []);

  // Load items when app initializes (main window only)
  useEffect(() => {
    if (!isOverlay) {
      const loadVaultDir = async () => {
        try {
          const dir = await window.electronAPI.getVaultDir();
          setVaultDir(dir || "");
        } catch (err) {
          console.error("Failed to get vault dir:", err);
        }
      };

      loadVaultDir();
      loadItems();

      return () => {};
    }
  }, [isOverlay, loadItems]);

  // Refresh items whenever main process notifies that items were updated
  useEffect(() => {
    if (!isOverlay && window.electronAPI.onItemsUpdated) {
      const unsubscribe = window.electronAPI.onItemsUpdated(() => {
        loadItems();
      });
      return () => {
        if (unsubscribe) unsubscribe();
      };
    }
  }, [isOverlay, loadItems]);

  // Smart search functionality (main window only)
  useEffect(() => {
    const q = searchQuery.trim();
    if (!isOverlay && q.length >= 2) {
      const performSearch = async () => {
        try {
          setIsSearching(true);
          const results = await window.electronAPI.smartSearch(q);
          setSearchResults(results.results);
          setSearchExplanation(results.explanation);
          console.log("[App] Search results:", results.results.length, "items");
        } catch (error) {
          console.error("Search failed:", error);
          setSearchResults([]);
          setSearchExplanation("Search failed");
        } finally {
          setIsSearching(false);
        }
      };

      // Debounce search to avoid too many requests
      const timeoutId = setTimeout(performSearch, 600);
      return () => clearTimeout(timeoutId);
    } else {
      // Clear search results when query is empty
      setSearchResults([]);
      setSearchExplanation("");
    }
  }, [searchQuery, isOverlay]);

  useEffect(() => {
    if (overlayPhase === "text" && textareaRef.current) {
      setTimeout(() => textareaRef.current.focus(), 50);
    }
  }, [overlayPhase]);

  useEffect(() => {
    if (showSuccessFeedback) {
      const hideFeedbackTimer = setTimeout(() => {
        setShowSuccessFeedback(false);
        setSuccessMessage("");
        setIsSaving(false);
        
        if (isOverlay && overlayPhase === 'confirmation' && window.electronAPI.hideOverlay) {
          setTimeout(() => {
            window.electronAPI.hideOverlay();
            // Reset to neutral after hiding
            resetToNeutral();
          }, 300);
        }
      }, 1500);

      return () => clearTimeout(hideFeedbackTimer);
    }
  }, [showSuccessFeedback, isOverlay, overlayPhase]);

  // In error state we now keep the overlay visible until the user closes it,
  // so we don't auto-reset back to neutral and hide the message.

  // Drag/drop are handled on the actual drop target element (see drop-zone props)

  const handleDragEnter = async (e) => {
    try {
      e.preventDefault();
      e.stopPropagation();
      
      // Increment drag depth to prevent flickering
      setDragDepth(prev => prev + 1);

      // On Windows, Explorer dragenter events sometimes don't include files yet.
      // For UX, we treat any dragenter as an intent to drop and switch to drop mode
      // immediately; the drop handler + preload will validate actual files.
      console.log('[App] Drag enter - switching to drop mode');
      enterDropMode();
      setIsDragging(true);
      
      if (window.electronAPI && window.electronAPI.setOverlayDragState) {
        window.electronAPI.setOverlayDragState(true);
      }
    } catch (err) {
      console.error('[App] handleDragEnter error', err);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Decrement drag depth and only hide when depth reaches 0
    setDragDepth(prev => {
      const newDepth = prev - 1;
      if (newDepth <= 0) {
        setIsDragging(false);
        // When drag completely leaves, return to neutral if not in text mode
        if (overlayPhase === 'drop') {
          resetToNeutral();
        }
        
        if (window.electronAPI && window.electronAPI.setOverlayDragState) {
          window.electronAPI.setOverlayDragState(false);
        }
        return 0;
      }
      return newDepth;
    });
  };

  const handleDrop = async (e) => {
    try {
      e.preventDefault();
      e.stopPropagation();
      
      // Reset drag depth on drop
      setDragDepth(0);
      setIsDragging(false);
      
      if (window.electronAPI && window.electronAPI.setOverlayDragState) {
        window.electronAPI.setOverlayDragState(false);
      }
      
      // Enter saving mode immediately
      enterSavingMode();
      
      try {
        console.log('[App] Calling saveDroppedFiles...');
        try {
          console.log(
            "[App] Extracted paths:",
            window.api && window.api.extractDroppedFilePaths
              ? window.api.extractDroppedFilePaths()
              : null
          );
        } catch (e) {
          console.log("[App] Failed to read extracted paths");
        }
        if (!window.api || !window.api.saveDroppedFiles) {
          throw new Error('Drop saving is not available (window.api.saveDroppedFiles missing)');
        }

        // If we only have filenames (no full paths), the preload's blob fallback can
        // fail with DOMException on some Windows setups. In that case, read file
        // bytes here (renderer) and send them to main via saveFileBlob.
        const extracted = window.api.extractDroppedFilePaths
          ? window.api.extractDroppedFilePaths()
          : [];
        const hasFullPaths = Array.isArray(extracted)
          ? extracted.some((p) => p && (p.includes("/") || p.includes("\\")))
          : false;

        let results;
        if (hasFullPaths) {
          results = await window.api.saveDroppedFiles();
        } else {
          if (!window.electronAPI?.saveFileBlob) {
            throw new Error("saveFileBlob is not available");
          }
          const files = (e.dataTransfer && e.dataTransfer.files) ? Array.from(e.dataTransfer.files) : [];
          if (!files.length) {
            throw new Error("No files available to read from drop event");
          }

          results = [];
          for (const file of files) {
            try {
              const arrayBuffer = await file.arrayBuffer();
              const uint8 = new Uint8Array(arrayBuffer);
              const r = await window.electronAPI.saveFileBlob({
                name: file.name,
                buffer: uint8,
              });
              results.push(r);
            } catch (err) {
              console.error("[App] saveFileBlob failed:", err);
              results.push({
                error: err && err.message ? err.message : "Unknown error",
                path: file.name,
              });
            }
          }
        }

        console.log('[App] saveDroppedFiles results', results);
        
        // Check if we have valid results
        if (!results || results.length === 0) {
          throw new Error('No files were saved');
        }
        
        // Check if any files failed to save
        const failedFiles = results.filter(r => r.error);
        const successfulFiles = results.filter(r => !r.error);
        
        if (failedFiles.length > 0) {
          console.warn('[App] Some files failed to save:', failedFiles);
          if (successfulFiles.length === 0) {
            // All files failed
            throw new Error('All files failed to save');
          } else {
            // Some files failed, show partial success
            enterConfirmationMode(`Saved ${successfulFiles.length} file(s), ${failedFiles.length} failed`);
          }
        } else {
          // All files saved successfully
          console.log('[App] All files saved successfully:', successfulFiles.length);
          enterConfirmationMode();
        }
      } catch (err) {
        console.error('[App] saveDroppedFiles error', err);
        enterErrorMode(err && err.message ? err.message : 'Failed to save file');
      }
    } catch (err) {
      console.error('[App] handleDrop error', err);
      enterErrorMode('Drop operation failed');
    }
  };

  // Keyboard events for overlay
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isOverlay && overlayPhase === "text" && e.key === "Enter" && e.ctrlKey) {
        handleSaveText();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [text, overlayPhase, isOverlay]);

  const handleSaveText = async () => {
    if (text.trim()) {
      try {
        enterSavingMode();
        const savedItem = await window.electronAPI.saveText(text);
        console.log('[App] Text saved successfully:', savedItem);
        // Success feedback will be shown when overlay-save-success event arrives
      } catch (error) {
        console.error("Failed to save text:", error);
        enterErrorMode("Failed to save");
      }
    }
  };

  const handleDeleteItem = async (itemId) => {
    try {
      await window.electronAPI.deleteItem(itemId);
      setItems(items.filter(i => i.id !== itemId));
    } catch (error) {
      console.error("Failed to delete item:", error);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  // Helper to strip vault prefixes like "1770806...-" from filenames for display
  const getDisplayFileName = (raw) => {
    if (!raw) return "";
    const m = raw.match(/^(\d{5,})-(.+)$/);
    if (m) return m[2];
    return raw;
  };

  // Helper function to get item preview for display
  const getItemPreview = (item) => {
    if (item.type === "text") {
      return item.content || "";
    } else if (item.type === "link") {
      return item.title || item.metadata?.url || "";
    } else {
      const base = item.title || item.metadata?.filename || "";
      return getDisplayFileName(base);
    }
  };

  // Text snippet preview (second line in cards)
  const getItemPreviewSnippet = (item) => {
    if (item.type === "text") {
      const raw = item.content || "";
      if (!raw) return "";
      return raw.length > 140 ? raw.slice(0, 137) + "…" : raw;
    }
    if (item.type === "link") {
      return item.metadata?.url || "";
    }
    // Files/images: keep quiet, title + meta only
    return "";
  };

  const getFileUrl = (item) => {
    const storagePath = item.storagePath || item.path;
    if (!storagePath) return null;
    const normalized = storagePath.replace(/\\/g, "/");
    return `file:///${encodeURI(normalized)}`;
  };

  // Build thumbnail URL for items using vault dir + relative thumbnail path; fall back to file URL
  const getThumbnailUrl = (item) => {
    const rel = item.metadata?.thumbnail;
    if (vaultDir && rel) {
      const normalizedVault = vaultDir.replace(/\\/g, "/");
      const normalizedRel = rel.replace(/\\/g, "/");
      const full = `${normalizedVault}/${normalizedRel}`;
      return `file:///${encodeURI(full)}`;
    }
    return getFileUrl(item);
  };

  // Render top-of-card preview based on item type
  const renderItemPreview = (item) => {
    const baseClass = "item-card-preview";

    // Pure text / notes / ideas / code: no separate top preview block,
    // let the card body show the snippet once.
    if (
      item.type === "text" ||
      item.category === "ideas" ||
      item.category === "notes" ||
      item.category === "code"
    ) {
      return null;
    }

    // Images
    if (item.type === "image" || item.category === "images") {
      const src = getThumbnailUrl(item);
      return (
        <div className={`${baseClass} image`}>
          {src ? (
            <img src={src} alt={item.title || item.metadata?.filename || "Image"} />
          ) : (
            <div>🖼️</div>
          )}
        </div>
      );
    }

    // Videos
    if (item.category === "videos") {
      let src = null;
      const rel = item.metadata?.thumbnail;
      if (vaultDir && rel) {
        const normalizedVault = vaultDir.replace(/\\/g, "/");
        const normalizedRel = rel.replace(/\\/g, "/");
        const full = `${normalizedVault}/${normalizedRel}`;
        src = `file:///${encodeURI(full)}`;
      }
      return (
        <div className={`${baseClass} image`}>
          {src ? (
            <img src={src} alt={item.title || item.metadata?.filename || "Video"} />
          ) : (
            <div>▶</div>
          )}
        </div>
      );
    }

    // Documents / data files
    const filename = (item.metadata?.filename || "").toLowerCase();
    const isPdf =
      (item.metadata?.mimeType || "").includes("pdf") ||
      filename.endsWith(".pdf");
    const isCsv =
      item.category === "csv" ||
      filename.endsWith(".csv") ||
      filename.endsWith(".tsv");
    const isDoc =
      filename.endsWith(".doc") ||
      filename.endsWith(".docx");

    // For PDFs, try to show first-page thumbnail when available
    if (isPdf && item.metadata?.thumbnail && vaultDir) {
      const normalizedVault = vaultDir.replace(/\\/g, "/");
      const normalizedRel = item.metadata.thumbnail.replace(/\\/g, "/");
      const full = `${normalizedVault}/${normalizedRel}`;
      const src = `file:///${encodeURI(full)}`;
      return (
        <div className={`${baseClass} image`}>
          <img
            src={src}
            alt={item.title || item.metadata?.filename || "PDF"}
          />
        </div>
      );
    }

    // PDFs without thumbnail: generic PDF visual block (no filename inside)
    if (isPdf) {
      return <div className={`${baseClass} pdf`} />;
    }

    // CSV / data files: show data-style visual block (no filename inside)
    if (isCsv) {
      return <div className={`${baseClass} csv`} />;
    }

    // DOC / DOCX: show document-style visual block (no filename inside)
    if (isDoc) {
      return <div className={`${baseClass} doc`} />;
    }

    // Fallback for other documents/data: simple colored block with filename
    const kindClass = isPdf ? "pdf" : "file";
    return (
      <div className={`${baseClass} ${kindClass}`}>
        <div>{getDisplayFileName(item.title)}</div>
        <div className="item-card-filename">
          {getDisplayFileName(item.metadata?.filename)}
        </div>
      </div>
    );
  };

  // Helper function to get category display name
  const getCategoryLabel = (category) => {
    const categoryLabels = {
      ideas: "Ideas",
      links: "Links", 
      code: "Code",
      notes: "Notes",
      images: "Images",
      documents: "Documents",
      videos: "Videos",
      csv: "Data"
    };
    return categoryLabels[category] || category;
  };

  const getFilteredItems = () => {
    if (activeCategory === "all") return items;
    return items.filter((item) => {
      switch (activeCategory) {
        case "images":
          return item.type === "image" || item.category === "images";
        case "documents":
          return item.category === "documents";
        case "videos":
          return item.category === "videos";
        case "links":
          return item.type === "link" || item.category === "links";
        case "notes":
          return item.category === "notes";
        case "ideas":
          return item.category === "ideas";
        case "code":
          return item.category === "code";
        case "csv":
          return item.category === "csv";
        case "text":
          return item.type === "text";
        default:
          return item.category === activeCategory;
      }
    });
  };

  const getCategoryList = () => {
    // Always show a fixed set of categories, even when empty
    return ["all", "images", "documents", "videos", "links", "notes", "ideas", "code", "csv", "text"];
  };

  // Overlay-only keyboard handler for textarea (Ctrl+Enter)
  const handleOverlayKeyDown = (e) => {
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault();
      handleSaveText();
    }
  };

  const handleCancel = () => {
    // Cancel just resets the overlay to neutral, main process handles hiding
    resetToNeutral();
    if (window.electronAPI && window.electronAPI.hideOverlay) {
      window.electronAPI.hideOverlay();
    }
  };

  // OVERLAY VIEW
  if (isOverlay) {
    return (
      <div
        className={`app-container overlay-container phase-${overlayPhase}`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="overlay-surface">
          {/* Text Mode - Default clean text input */}
          <div className={`overlay-text-mode ${overlayPhase === 'drop' ? 'mode-transitioning-out' : ''}`}>
            <div className="overlay-header">
              <div className="overlay-title">Dump anything</div>
              <div className="overlay-hint">Alt + D to dump anything</div>
            </div>
            
            <div className="text-input-container">
              <textarea
                ref={textareaRef}
                className="overlay-textarea"
                placeholder="Type or paste anything to dump."
                value={text}
                onChange={handleTextChange}
                onKeyDown={handleOverlayKeyDown}
                disabled={overlayPhase === 'saving' || overlayPhase === 'confirmation'}
              />
              {detectedCategory && (
                <div className="detected-category">
                  <span className="category-label">{getCategoryLabel(detectedCategory)}</span>
                </div>
              )}
            </div>
            
            <div className="overlay-actions">
              <button
                className="overlay-btn save-btn"
                onClick={handleSaveText}
                disabled={overlayPhase === 'saving' || !text.trim()}
              >
                {overlayPhase === 'saving' ? 'Saving...' : 'Save'}
              </button>
              <button
                className="overlay-btn cancel-btn"
                onClick={handleCancel}
                disabled={overlayPhase === 'saving'}
              >
                Cancel
              </button>
            </div>
          </div>

          {/* Drop Mode - Activates on file drag */}
          <div className={`overlay-drop-mode ${overlayPhase === 'drop' ? 'mode-active' : ''}`}>
            <div className="drop-zone-content">
              <div className="drop-icon">📁</div>
              <div className="drop-title">Drop to save</div>
              <div className="drop-hint">Drag a file over this window and release to store it.</div>
            </div>
          </div>

          {/* Success Feedback */}
          {overlayPhase === 'confirmation' && (
            <div className="overlay-feedback">
              <div className="feedback-icon">✓</div>
              <div className="feedback-message">{successMessage}</div>
            </div>
          )}

          {/* Error State */}
          {overlayPhase === 'error' && (
            <div className="overlay-error">
              <div className="error-icon">⚠</div>
              <div className="error-message">{validationMessage}</div>
              <button
                className="overlay-btn retry-btn"
                onClick={resetToNeutral}
              >
                Try Again
              </button>
            </div>
          )}

          {/* Drag Overlay Visual Feedback */}
          {isDragging && (
            <div className="drag-overlay">
              <div className="drag-indicator">
                <div className="drag-pulse"></div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Helper function to group items by human-friendly dates and sort newest-first
  const groupItemsByDate = (itemsToGroup) => {
    const groupsMap = new Map();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    const getDayName = (date) => {
      const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      return days[date.getDay()];
    };

    itemsToGroup.forEach((item) => {
      const created = new Date(item.metadata?.createdAt || item.timestamp);
      const dayStart = new Date(created.getFullYear(), created.getMonth(), created.getDate());
      let label;

      if (dayStart >= today) {
        label = "Today";
      } else if (dayStart >= yesterday) {
        label = "Yesterday";
      } else if (dayStart >= weekAgo) {
        label = getDayName(dayStart);
      } else {
        label = dayStart.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      }

      if (!groupsMap.has(label)) {
        groupsMap.set(label, {
          label,
          items: [],
          sortKey: dayStart.getTime(),
        });
      }
      groupsMap.get(label).items.push(item);
    });

    const groups = Array.from(groupsMap.values());

    // Sort groups by day (newest first)
    groups.sort((a, b) => b.sortKey - a.sortKey);

    // Within each group, sort items by createdAt descending
    groups.forEach((group) => {
      group.items.sort((a, b) => {
        const da = new Date(a.metadata?.createdAt || a.timestamp).getTime();
        const db = new Date(b.metadata?.createdAt || b.timestamp).getTime();
        return db - da;
      });
    });

    return groups;
  };

  // LIBRARY VIEW
  const filteredItems = searchQuery.trim() ? searchResults : getFilteredItems();
  const categories = getCategoryList();
  const dateGroups =
    activeCategory === "all" && !searchQuery.trim()
      ? groupItemsByDate(filteredItems)
      : null;

  return (
    <div className="app-container library-view">
      {/* Search Bar - Full Width */}
      <div className="library-search-bar">
        <input
          type="text"
          className="library-search-input"
          placeholder="Search your vault... (try 'screenshot from yesterday' or 'notes about shortcuts')"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {isSearching && <div className="search-loading">Searching...</div>}
        {searchExplanation && !isSearching && (
          <div className="search-explanation">{searchExplanation}</div>
        )}
      </div>

      {/* Category Tabs - Always Show All Categories */}
      <div className="category-tabs">
        {categories.map((cat) => (
          <button
            key={cat}
            className={`category-pill ${activeCategory === cat ? "active" : ""}`}
            onClick={() => setActiveCategory(cat)}
          >
            {cat === "all" ? "All" : getCategoryLabel(cat)}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="library-content">
        {items.length === 0 ? (
          <div className="empty-vault">
            <div className="empty-vault-title">Your vault is empty</div>
            <div className="empty-vault-hint">
              Press <kbd>Alt</kbd> + <kbd>D</kbd> to start capturing content
            </div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="empty-vault">
            <div className="empty-vault-title">
              {searchQuery.trim()
                ? "No results found"
                : "No items in this category yet"}
            </div>
            <div className="empty-vault-hint">
              {searchQuery.trim()
                ? "Try different keywords or check spelling"
                : "Items will appear here when you add them"}
            </div>
          </div>
        ) : dateGroups ? (
          // Show grouped by date for "All" category (newest sections first)
          <div className="date-grouped-items">
            {dateGroups.map((group) => (
              <div key={group.label} className="date-group">
                <div className="date-group-header">{group.label}</div>
                <div className="date-group-items">
                  {group.items.map((item) => {
                    return (
                      <div key={item.id} className="library-item-card">
                        <div
                          className="item-card-content"
                          onClick={() => setSelectedItem(item)}
                        >
                          {renderItemPreview(item)}
                          <div className="item-card-details">
                            {item.type === "text" ? (
                              <div className="item-card-text-only">
                                {item.content || ""}
                              </div>
                            ) : (
                              <>
                                <div className="item-card-title">
                                  {getItemPreview(item).split("\n")[0]}
                                </div>
                                {getItemPreviewSnippet(item) && (
                                  <div className="item-card-snippet">
                                    {getItemPreviewSnippet(item)}
                                  </div>
                                )}
                              </>
                            )}
                            <div className="item-card-meta">
                              <span className="meta-badge">
                                {item.type === "image"
                                  ? "Image"
                                  : item.type === "link"
                                  ? "Link"
                                  : item.type === "file"
                                  ? "File"
                                  : "Text"}
                              </span>
                              <span className="meta-time">
                                {new Date(
                                  item.metadata?.createdAt || item.timestamp
                                ).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                          </div>
                          <button
                            className="item-card-delete-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteItem(item.id);
                            }}
                            title="Delete"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Show regular items for filtered categories or search
          <div className="regular-items">
            {filteredItems.map((item) => (
              <div key={item.id} className="library-item-card">
                <div
                  className="item-card-content"
                  onClick={() => setSelectedItem(item)}
                >
                  {renderItemPreview(item)}
                  <div className="item-card-details">
                    {item.type === "text" ? (
                      <div className="item-card-text-only">
                        {item.content || ""}
                      </div>
                    ) : (
                      <>
                        <div className="item-card-title">
                          {getItemPreview(item).split("\n")[0]}
                        </div>
                        {getItemPreviewSnippet(item) && (
                          <div className="item-card-snippet">
                            {getItemPreviewSnippet(item)}
                          </div>
                        )}
                      </>
                    )}
                    <div className="item-card-meta">
                      <span className="meta-badge">
                        {item.type === "image"
                          ? "Image"
                          : item.type === "link"
                          ? "Link"
                          : item.type === "file"
                          ? "File"
                          : "Text"}
                      </span>
                      <span className="meta-time">
                        {new Date(
                          item.metadata?.createdAt || item.timestamp
                        ).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <button
                    className="item-card-delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteItem(item.id);
                    }}
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail overlay for full item view */}
      {selectedItem && (
        <div className="detail-overlay" onClick={() => setSelectedItem(null)}>
          <div
            className="detail-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="detail-header">
              <div className="detail-title">
                {getItemPreview(selectedItem).split("\n")[0]}
              </div>
              <button
                className="detail-close-btn"
                onClick={() => setSelectedItem(null)}
              >
                ×
              </button>
            </div>
            <div className="detail-body">
              {selectedItem.type === "image" && getFileUrl(selectedItem) && (
                <div className="detail-image-wrapper">
                  <img
                    src={getFileUrl(selectedItem)}
                    alt={
                      selectedItem.metadata?.filename || selectedItem.title || ""
                    }
                  />
                </div>
              )}
              {selectedItem.type === "text" && (
                <pre className="detail-text">
                  {selectedItem.content || ""}
                </pre>
              )}
              {selectedItem.type === "file" && (
                <div className="detail-file">
                  <div className="detail-file-name">
                    {getDisplayFileName(
                      selectedItem.metadata?.filename || selectedItem.title
                    )}
                  </div>
                  <div className="detail-file-meta">
                    {new Date(
                      selectedItem.metadata?.createdAt || selectedItem.timestamp
                    ).toLocaleString()}
                  </div>
                  <button
                    className="detail-open-btn"
                    onClick={() => {
                      const path = selectedItem.storagePath || selectedItem.path;
                      if (path && window.electronAPI.openItemPath) {
                        window.electronAPI.openItemPath(path);
                      }
                    }}
                  >
                    Open in default app
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
