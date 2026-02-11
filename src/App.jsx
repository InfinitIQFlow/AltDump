import React, { useState, useEffect, useRef } from "react";
import "./styles.css";
import "./App.css";

/* ===== SVG Icons (inline to avoid external deps) ===== */
const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

const CheckIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const DownloadIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);

/* Category icon map */
const CATEGORY_ICONS = {
  all: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" />
    </svg>
  ),
  images: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  ),
  documents: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  videos: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
    </svg>
  ),
  links: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
  notes: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z" />
      <path d="M15 3v4a2 2 0 0 0 2 2h4" />
    </svg>
  ),
  ideas: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" /><path d="M10 22h4" />
    </svg>
  ),
  code: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
    </svg>
  ),
  csv: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18" />
    </svg>
  ),
  text: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 6.1H3" /><path d="M21 12.1H3" /><path d="M15.1 18H3" />
    </svg>
  ),
};

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
  const [dragDepth, setDragDepth] = useState(0);
  const [vaultDir, setVaultDir] = useState("");
  const [selectedItem, setSelectedItem] = useState(null);
  const textareaRef = useRef(null);

  // State transition helpers
  const enterTextMode = () => {
    if (overlayPhase !== "saving" && overlayPhase !== "confirmation") {
      setOverlayPhase("text");
      setValidationMessage("");
    }
  };

  const enterDropMode = () => {
    if (overlayPhase !== "saving" && overlayPhase !== "confirmation") {
      setOverlayPhase("drop");
      setValidationMessage("");
    }
  };

  const enterSavingMode = () => {
    setOverlayPhase("saving");
    setIsSaving(true);
    setValidationMessage("Saving...");
  };

  const enterConfirmationMode = (message = "Saved successfully") => {
    setOverlayPhase("confirmation");
    setSuccessMessage(message);
    setShowSuccessFeedback(true);
    setIsSaving(false);
    setText("");
    setDetectedCategory("");
    if (window.electronAPI && window.electronAPI.setOverlayMode) {
      window.electronAPI.setOverlayMode("confirmation");
    }
  };

  const enterErrorMode = (message) => {
    setOverlayPhase("error");
    setValidationMessage(message);
    setIsSaving(false);
    if (window.electronAPI && window.electronAPI.setOverlayMode) {
      window.electronAPI.setOverlayMode("error");
    }
  };

  const resetToNeutral = () => {
    setOverlayPhase("neutral");
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
    setIsOverlay(isOverlayMode);

    if (window.electronAPI.onSaveSuccess) {
      window.electronAPI.onSaveSuccess(() => {
        enterConfirmationMode();
      });
    }

    if (window.electronAPI.onOverlayModeChange && isOverlayMode) {
      window.electronAPI.onOverlayModeChange((mode) => {
        if (mode === "drop") enterDropMode();
        else if (mode === "text") enterTextMode();
        else if (mode === "neutral") resetToNeutral();
      });
    }
  }, []);

  const handleTextChange = (e) => {
    const newText = e.target.value;
    setText(newText);
    if (overlayPhase === "neutral" && newText.trim()) {
      enterTextMode();
    }
  };

  const handlePasteClick = async () => {
    if (overlayPhase === "saving" || overlayPhase === "confirmation") return;
    try {
      const clipboard = await navigator.clipboard.readText();
      setText(clipboard);
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
        await window.electronAPI.createTestItems();
        const newItems = await window.electronAPI.getItems();
        setItems(newItems);
      }
    } catch (error) {
      console.error("Failed to load items:", error);
    }
  }, []);

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
    }
  }, [isOverlay, loadItems]);

  useEffect(() => {
    if (!isOverlay && window.electronAPI.onItemsUpdated) {
      const unsubscribe = window.electronAPI.onItemsUpdated(() => {
        loadItems();
      });
      return () => { if (unsubscribe) unsubscribe(); };
    }
  }, [isOverlay, loadItems]);

  // Smart search
  useEffect(() => {
    const q = searchQuery.trim();
    if (!isOverlay && q.length >= 2) {
      const performSearch = async () => {
        try {
          setIsSearching(true);
          const results = await window.electronAPI.smartSearch(q);
          setSearchResults(results.results);
          setSearchExplanation(results.explanation);
        } catch (error) {
          console.error("Search failed:", error);
          setSearchResults([]);
          setSearchExplanation("Search failed");
        } finally {
          setIsSearching(false);
        }
      };
      const timeoutId = setTimeout(performSearch, 600);
      return () => clearTimeout(timeoutId);
    } else {
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
        if (isOverlay && overlayPhase === "confirmation" && window.electronAPI.hideOverlay) {
          setTimeout(() => {
            window.electronAPI.hideOverlay();
            resetToNeutral();
          }, 300);
        }
      }, 1500);
      return () => clearTimeout(hideFeedbackTimer);
    }
  }, [showSuccessFeedback, isOverlay, overlayPhase]);

  // Drag & Drop handlers
  const handleDragEnter = async (e) => {
    try {
      e.preventDefault();
      e.stopPropagation();
      setDragDepth((prev) => prev + 1);
      enterDropMode();
      setIsDragging(true);
      if (window.electronAPI && window.electronAPI.setOverlayDragState) {
        window.electronAPI.setOverlayDragState(true);
      }
    } catch (err) {
      console.error("[App] handleDragEnter error", err);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragDepth((prev) => {
      const newDepth = prev - 1;
      if (newDepth <= 0) {
        setIsDragging(false);
        if (overlayPhase === "drop") resetToNeutral();
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
      setDragDepth(0);
      setIsDragging(false);
      if (window.electronAPI && window.electronAPI.setOverlayDragState) {
        window.electronAPI.setOverlayDragState(false);
      }
      enterSavingMode();
      try {
        if (!window.api || !window.api.saveDroppedFiles) {
          throw new Error("Drop saving is not available (window.api.saveDroppedFiles missing)");
        }
        const extracted = window.api.extractDroppedFilePaths ? window.api.extractDroppedFilePaths() : [];
        const hasFullPaths = Array.isArray(extracted) ? extracted.some((p) => p && (p.includes("/") || p.includes("\\"))) : false;
        let results;
        if (hasFullPaths) {
          results = await window.api.saveDroppedFiles();
        } else {
          if (!window.electronAPI?.saveFileBlob) throw new Error("saveFileBlob is not available");
          const files = e.dataTransfer && e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
          if (!files.length) throw new Error("No files available to read from drop event");
          results = [];
          for (const file of files) {
            try {
              const arrayBuffer = await file.arrayBuffer();
              const uint8 = new Uint8Array(arrayBuffer);
              const r = await window.electronAPI.saveFileBlob({ name: file.name, buffer: uint8 });
              results.push(r);
            } catch (err) {
              results.push({ error: err && err.message ? err.message : "Unknown error", path: file.name });
            }
          }
        }
        if (!results || results.length === 0) throw new Error("No files were saved");
        const failedFiles = results.filter((r) => r.error);
        const successfulFiles = results.filter((r) => !r.error);
        if (failedFiles.length > 0) {
          if (successfulFiles.length === 0) throw new Error("All files failed to save");
          enterConfirmationMode(`Saved ${successfulFiles.length} file(s), ${failedFiles.length} failed`);
        } else {
          enterConfirmationMode();
        }
      } catch (err) {
        enterErrorMode(err && err.message ? err.message : "Failed to save file");
      }
    } catch (err) {
      enterErrorMode("Drop operation failed");
    }
  };

  // Keyboard events
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
        await window.electronAPI.saveText(text);
      } catch (error) {
        console.error("Failed to save text:", error);
        enterErrorMode("Failed to save");
      }
    }
  };

  const handleDeleteItem = async (itemId) => {
    try {
      await window.electronAPI.deleteItem(itemId);
      setItems(items.filter((i) => i.id !== itemId));
    } catch (error) {
      console.error("Failed to delete item:", error);
    }
  };

  // Utility helpers
  const formatFileSize = (bytes) => {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) { size /= 1024; unitIndex++; }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const getDisplayFileName = (raw) => {
    if (!raw) return "";
    const m = raw.match(/^(\d{5,})-(.+)$/);
    return m ? m[2] : raw;
  };

  const getItemPreview = (item) => {
    if (item.type === "text") return item.content || "";
    if (item.type === "link") return item.title || item.metadata?.url || "";
    const base = item.title || item.metadata?.filename || "";
    return getDisplayFileName(base);
  };

  const getItemPreviewSnippet = (item) => {
    if (item.type === "text") {
      const raw = item.content || "";
      if (!raw) return "";
      return raw.length > 140 ? raw.slice(0, 137) + "..." : raw;
    }
    if (item.type === "link") return item.metadata?.url || "";
    return "";
  };

  const getFileUrl = (item) => {
    const storagePath = item.storagePath || item.path;
    if (!storagePath) return null;
    const normalized = storagePath.replace(/\\/g, "/");
    return `file:///${encodeURI(normalized)}`;
  };

  const getThumbnailUrl = (item) => {
    const rel = item.metadata?.thumbnail;
    if (vaultDir && rel) {
      const normalizedVault = vaultDir.replace(/\\/g, "/");
      const normalizedRel = rel.replace(/\\/g, "/");
      return `file:///${encodeURI(`${normalizedVault}/${normalizedRel}`)}`;
    }
    return getFileUrl(item);
  };

  const getCategoryLabel = (category) => {
    const labels = {
      ideas: "Ideas", links: "Links", code: "Code", notes: "Notes",
      images: "Images", documents: "Documents", videos: "Videos", csv: "Data",
    };
    return labels[category] || category;
  };

  const getFilteredItems = () => {
    if (activeCategory === "all") return items;
    return items.filter((item) => {
      switch (activeCategory) {
        case "images": return item.type === "image" || item.category === "images";
        case "documents": return item.category === "documents";
        case "videos": return item.category === "videos";
        case "links": return item.type === "link" || item.category === "links";
        case "notes": return item.category === "notes";
        case "ideas": return item.category === "ideas";
        case "code": return item.category === "code";
        case "csv": return item.category === "csv";
        case "text": return item.type === "text";
        default: return item.category === activeCategory;
      }
    });
  };

  const getCategoryList = () => [
    "all", "images", "documents", "videos", "links", "notes", "ideas", "code", "csv", "text",
  ];

  const getCategoryCount = (cat) => {
    if (cat === "all") return items.length;
    return items.filter((item) => {
      switch (cat) {
        case "images": return item.type === "image" || item.category === "images";
        case "documents": return item.category === "documents";
        case "videos": return item.category === "videos";
        case "links": return item.type === "link" || item.category === "links";
        case "notes": return item.category === "notes";
        case "ideas": return item.category === "ideas";
        case "code": return item.category === "code";
        case "csv": return item.category === "csv";
        case "text": return item.type === "text";
        default: return item.category === cat;
      }
    }).length;
  };

  const handleOverlayKeyDown = (e) => {
    if (e.key === "Enter" && e.ctrlKey) { e.preventDefault(); handleSaveText(); }
  };

  const handleCancel = () => {
    resetToNeutral();
    if (window.electronAPI && window.electronAPI.hideOverlay) window.electronAPI.hideOverlay();
  };

  // Render preview block for cards
  const renderItemPreview = (item) => {
    const baseClass = "item-card-preview";

    // Pure text / notes / ideas / code: no preview block
    if (item.type === "text" || item.category === "ideas" || item.category === "notes" || item.category === "code") {
      return null;
    }

    // Images
    if (item.type === "image" || item.category === "images") {
      const src = getThumbnailUrl(item);
      return (
        <div className={`${baseClass} image`}>
          {src ? <img src={src} alt={item.title || item.metadata?.filename || "Image"} /> : <span style={{ color: "var(--text-tertiary)" }}>Image</span>}
        </div>
      );
    }

    // Videos
    if (item.category === "videos") {
      let src = null;
      const rel = item.metadata?.thumbnail;
      if (vaultDir && rel) {
        const nv = vaultDir.replace(/\\/g, "/");
        const nr = rel.replace(/\\/g, "/");
        src = `file:///${encodeURI(`${nv}/${nr}`)}`;
      }
      return (
        <div className={`${baseClass} image`} style={{ position: "relative" }}>
          {src ? <img src={src} alt={item.title || "Video"} /> : <span style={{ color: "var(--text-tertiary)", fontSize: 32 }}>{'>'}</span>}
          <div className="video-play-overlay">
            <div className="play-button"><PlayIcon /></div>
          </div>
        </div>
      );
    }

    // Documents & data files
    const filename = (item.metadata?.filename || "").toLowerCase();
    const isPdf = (item.metadata?.mimeType || "").includes("pdf") || filename.endsWith(".pdf");
    const isCsv = item.category === "csv" || filename.endsWith(".csv") || filename.endsWith(".tsv");
    const isDoc = filename.endsWith(".doc") || filename.endsWith(".docx");

    if (isPdf && item.metadata?.thumbnail && vaultDir) {
      const nv = vaultDir.replace(/\\/g, "/");
      const nr = item.metadata.thumbnail.replace(/\\/g, "/");
      const src = `file:///${encodeURI(`${nv}/${nr}`)}`;
      return (
        <div className={`${baseClass} image`}>
          <img src={src} alt={item.title || "PDF"} />
        </div>
      );
    }

    if (isPdf) return <div className={`${baseClass} pdf`} />;
    if (isCsv) return <div className={`${baseClass} csv`}><span className="csv-label">CSV</span></div>;
    if (isDoc) return <div className={`${baseClass} doc`} />;

    return (
      <div className={`${baseClass} file`}>
        <div>{getDisplayFileName(item.title)}</div>
        <div className="item-card-filename">{getDisplayFileName(item.metadata?.filename)}</div>
      </div>
    );
  };

  // Group items by date
  const groupItemsByDate = (itemsToGroup) => {
    const groupsMap = new Map();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    const getDayName = (date) => {
      return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][date.getDay()];
    };

    itemsToGroup.forEach((item) => {
      const created = new Date(item.metadata?.createdAt || item.timestamp);
      const dayStart = new Date(created.getFullYear(), created.getMonth(), created.getDate());
      let label;
      if (dayStart >= today) label = "Today";
      else if (dayStart >= yesterday) label = "Yesterday";
      else if (dayStart >= weekAgo) label = getDayName(dayStart);
      else label = dayStart.toLocaleDateString("en-US", { month: "long", year: "numeric" });

      if (!groupsMap.has(label)) groupsMap.set(label, { label, items: [], sortKey: dayStart.getTime() });
      groupsMap.get(label).items.push(item);
    });

    const groups = Array.from(groupsMap.values());
    groups.sort((a, b) => b.sortKey - a.sortKey);
    groups.forEach((group) => {
      group.items.sort((a, b) => {
        const da = new Date(a.metadata?.createdAt || a.timestamp).getTime();
        const db = new Date(b.metadata?.createdAt || b.timestamp).getTime();
        return db - da;
      });
    });
    return groups;
  };

  // ========== OVERLAY VIEW ==========
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
          {/* Text Mode */}
          <div className={`overlay-text-mode ${overlayPhase === "drop" ? "mode-transitioning-out" : ""}`}>
            <div className="overlay-header">
              <div className="overlay-title">Dump anything</div>
              <div className="overlay-hint">Alt + D to dump anything</div>
            </div>
            <div className="text-input-container">
              <textarea
                ref={textareaRef}
                className="overlay-textarea"
                placeholder="Type or paste anything to dump..."
                value={text}
                onChange={handleTextChange}
                onKeyDown={handleOverlayKeyDown}
                disabled={overlayPhase === "saving" || overlayPhase === "confirmation"}
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
                disabled={overlayPhase === "saving" || !text.trim()}
              >
                {overlayPhase === "saving" ? "Saving..." : "Save"}
              </button>
              <button
                className="overlay-btn cancel-btn"
                onClick={handleCancel}
                disabled={overlayPhase === "saving"}
              >
                Cancel
              </button>
            </div>
          </div>

          {/* Drop Mode */}
          <div className={`overlay-drop-mode ${overlayPhase === "drop" ? "mode-active" : ""}`}>
            <div className="drop-zone-content">
              <div className="drop-icon-wrapper">
                <DownloadIcon />
              </div>
              <div className="drop-title">Drop items here</div>
              <div className="drop-hint">Release to save to your vault</div>
            </div>
          </div>

          {/* Success */}
          {overlayPhase === "confirmation" && (
            <div className="overlay-feedback">
              <div className="feedback-icon"><CheckIcon /></div>
              <div className="feedback-message">{successMessage}</div>
            </div>
          )}

          {/* Error */}
          {overlayPhase === "error" && (
            <div className="overlay-error">
              <div className="error-icon">!</div>
              <div className="error-message">{validationMessage}</div>
              <button className="retry-btn" onClick={resetToNeutral}>Try Again</button>
            </div>
          )}

          {/* Drag Visual */}
          {isDragging && <div className="drag-overlay" />}
        </div>
      </div>
    );
  }

  // ========== LIBRARY VIEW ==========
  const filteredItems = searchQuery.trim() ? searchResults : getFilteredItems();
  const categories = getCategoryList();
  const dateGroups = activeCategory === "all" && !searchQuery.trim() ? groupItemsByDate(filteredItems) : null;

  const renderCard = (item) => (
    <div key={item.id} className="library-item-card">
      <div className="item-card-content" onClick={() => setSelectedItem(item)}>
        {renderItemPreview(item)}

        {/* Card body */}
        {item.type === "text" || item.category === "notes" || item.category === "ideas" ? (
          <div className={`item-card-text-only ${item.category === "code" ? "code-text" : ""}`}>
            {item.content || ""}
          </div>
        ) : item.category === "code" ? (
          <div className="item-card-text-only code-text">
            {item.content || ""}
          </div>
        ) : (
          <div className="item-card-body">
            <div className="item-card-title">{getItemPreview(item).split("\n")[0]}</div>
            {item.type === "link" && item.metadata?.url && (
              <div className="item-link-url">{item.metadata.url}</div>
            )}
            {getItemPreviewSnippet(item) && item.type !== "link" && (
              <div className="item-card-snippet">{getItemPreviewSnippet(item)}</div>
            )}
          </div>
        )}

        <div className="item-card-meta">
          <span className="meta-badge">
            {item.type === "image" ? "Image" : item.type === "link" ? "Link" : item.type === "file" ? "File" : "Text"}
          </span>
          <span className="meta-time">
            {new Date(item.metadata?.createdAt || item.timestamp).toLocaleDateString("en-US", {
              month: "short", day: "numeric",
            })}
          </span>
        </div>

        <button
          className="item-card-delete-btn"
          onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id); }}
          title="Delete"
          aria-label="Delete item"
        >
          {'x'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="app-container library-view">
      {/* Sidebar */}
      <nav className="sidebar" aria-label="Category navigation">
        <div className="sidebar-header">
          <div className="sidebar-brand">AltDump</div>
          <div className="sidebar-subtitle">Your vault</div>
        </div>
        <div className="sidebar-section-label">Categories</div>
        {categories.map((cat) => (
          <button
            key={cat}
            className={`sidebar-item ${activeCategory === cat ? "active" : ""}`}
            onClick={() => setActiveCategory(cat)}
          >
            <span className="sidebar-icon">{CATEGORY_ICONS[cat] || null}</span>
            <span>{cat === "all" ? "All Items" : getCategoryLabel(cat)}</span>
            <span className="sidebar-count">{getCategoryCount(cat) || ""}</span>
          </button>
        ))}
      </nav>

      {/* Main Content */}
      <div className="main-content">
        {/* Search Bar */}
        <div className="search-bar-wrapper">
          <div className="search-bar">
            <span className="search-bar-icon"><SearchIcon /></span>
            <input
              type="text"
              placeholder="Search your vault..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search vault"
            />
          </div>
          <div className="search-status">
            {isSearching && <span className="search-loading">Searching...</span>}
            {searchExplanation && !isSearching && (
              <span className="search-explanation">{searchExplanation}</span>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className="content-area">
          {items.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <div className="empty-state-title">Your vault is empty</div>
              <div className="empty-state-hint">
                Press <kbd>Alt</kbd> + <kbd>D</kbd> to start capturing content
              </div>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <SearchIcon />
              </div>
              <div className="empty-state-title">
                {searchQuery.trim() ? "No results found" : "No items in this category"}
              </div>
              <div className="empty-state-hint">
                {searchQuery.trim() ? "Try different keywords or check spelling" : "Items will appear here when you add them"}
              </div>
            </div>
          ) : dateGroups ? (
            <div className="date-grouped-items">
              {dateGroups.map((group) => (
                <div key={group.label} className="date-group">
                  <div className="date-group-header">{group.label}</div>
                  <div className="date-group-items">
                    {group.items.map(renderCard)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="regular-items">
              {filteredItems.map(renderCard)}
            </div>
          )}
        </div>
      </div>

      {/* Detail Overlay */}
      {selectedItem && (
        <div className="detail-overlay" onClick={() => setSelectedItem(null)} role="dialog" aria-modal="true">
          <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
            <div className="detail-header">
              <div className="detail-title">{getItemPreview(selectedItem).split("\n")[0]}</div>
              <button className="detail-close-btn" onClick={() => setSelectedItem(null)} aria-label="Close detail view">
                {'x'}
              </button>
            </div>
            <div className="detail-body">
              {selectedItem.type === "image" && getFileUrl(selectedItem) && (
                <div className="detail-image-wrapper">
                  <img src={getFileUrl(selectedItem)} alt={selectedItem.metadata?.filename || selectedItem.title || ""} />
                </div>
              )}
              {selectedItem.type === "text" && (
                <pre className="detail-text">{selectedItem.content || ""}</pre>
              )}
              {selectedItem.type === "file" && (
                <div className="detail-file">
                  <div className="detail-file-name">
                    {getDisplayFileName(selectedItem.metadata?.filename || selectedItem.title)}
                  </div>
                  <div className="detail-file-meta">
                    {new Date(selectedItem.metadata?.createdAt || selectedItem.timestamp).toLocaleString()}
                  </div>
                  <button
                    className="detail-open-btn"
                    onClick={() => {
                      const p = selectedItem.storagePath || selectedItem.path;
                      if (p && window.electronAPI.openItemPath) window.electronAPI.openItemPath(p);
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
