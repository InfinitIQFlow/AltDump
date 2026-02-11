# Metadata & Thumbnail System - Developer Reference

## Quick Reference

### Adding New Metadata Extraction

**For a new file type:**

1. Add function in `electron/storage.cjs`:
```javascript
async function extractCUSTOMMetadata(filePath) {
  try {
    // Parse file and extract data
    return {
      customField: "value",
    };
  } catch (err) {
    console.error("Failed to extract CUSTOM metadata:", err);
    return { customField: null };
  }
}
```

2. Call in `extractFileMetadata()`:
```javascript
if (category === "custom_category") {
  const customMeta = await extractCUSTOMMetadata(sourceFilePath);
  metadata.customField = customMeta.customField;
}
```

3. Display in `src/App.jsx`:
```jsx
{item.metadata.customField && (
  <span className="metadata-tag">
    🏷️ {item.metadata.customField}
  </span>
)}
```

### Common Tasks

#### Disable Thumbnails for a Category
```javascript
// In extractFileMetadata(), comment out:
// if (category === "images") {
//   metadata.thumbnail = await generateImageThumbnail(...);
// }
```

#### Change Thumbnail Size
```javascript
// In generateImageThumbnail(), line ~230:
.resize(200, 200, {  // Change from 100, 100
```

#### Change Thumbnail Format
```javascript
// In generateImageThumbnail(), line ~244:
.avif()      // or .png(), .jpg(), etc.
```

#### Debug Metadata Extraction
```javascript
// Add logging in extractFileMetadata():
console.log("Extracting metadata for:", item.filename);
console.log("Category:", category);
console.log("Result:", metadata);
```

## Code Locations

| Feature | File | Lines |
|---------|------|-------|
| Thumbnail generation | `electron/storage.cjs` | 226-251 |
| PDF metadata | `electron/storage.cjs` | 253-273 |
| Metadata orchestration | `electron/storage.cjs` | 275-305 |
| Async scheduling | `electron/storage.cjs` | 307-325 |
| addFileItem with scheduling | `electron/storage.cjs` | 350-373 |
| Items view UI | `src/App.jsx` | 200-340 |
| Tab navigation | `src/App.jsx` | 195-207 |
| Item grid | `src/App.jsx` | 295-340 |
| Item card styling | `src/App.css` | 305-380 |
| Tab styles | `src/App.css` | 259-300 |
| Window size | `electron/main.cjs` | 11 |

## Data Flow

```
User drops file.jpg
  ↓
App.jsx drop handler
  ├─ Extract file.path (Electron property)
  ├─ Validate file exists
  ├─ Call window.electronAPI.saveFile(filePath)
  ↓
main.cjs "save-file" handler
  ├─ Validate filePath (not empty/undefined)
  ├─ Call storage.addFileItem(filePath)
  ↓
storage.cjs addFileItem()
  ├─ Validate file exists
  ├─ Validate file type (not rejected)
  ├─ Copy file to vault with hash
  ├─ Create item with empty metadata {}
  ├─ Save to items.json
  ├─ Return item to renderer
  ├─ Call scheduleMetadataExtraction(item, filePath)  [Don't await]
  ↓
storage.cjs scheduleMetadataExtraction() [Background]
  ├─ Use setImmediate() to defer
  ├─ Call extractFileMetadata(item, filePath)
  ↓
storage.cjs extractFileMetadata() [Async]
  ├─ If image: await generateImageThumbnail() → metadata.thumbnail
  ├─ If PDF: await extractPDFMetadata() → metadata.pageCount, author, etc.
  ├─ Update item.metadata
  ├─ Load items.json
  ├─ Update item in array
  ├─ Save items.json
  ↓
App.jsx Items view
  ├─ Polls getItems() every time tab switches
  ├─ Displays updated metadata with thumbnails
```

## State Management

### App.jsx States

```javascript
const [view, setView] = useState("dump");      // "dump" or "items"
const [mode, setMode] = useState("text");      // For dump view: "text", "drag", "blocked"
const [items, setItems] = useState([]);        // All saved items
const [validationMessage, setValidationMessage] = useState("");
const [detectedCategory, setDetectedCategory] = useState("");
```

### Items Auto-Load

```javascript
// Load on mount
useEffect(() => {
  const loadItems = async () => {
    const allItems = await window.electronAPI.getItems();
    setItems(allItems);
  };
  loadItems();
}, []);

// Reload when switching to items view
useEffect(() => {
  if (view === "items") {
    // Fetch fresh items (to get updated metadata)
    loadItems();
  }
}, [view]);
```

## Async Patterns Used

### Pattern 1: Deferred Execution (Non-Blocking)

```javascript
// Immediate execution
function scheduleMetadataExtraction(item, sourceFilePath) {
  // Use setImmediate to defer to next event loop iteration
  setImmediate(async () => {
    // This runs later, doesn't block current operation
    const updatedItem = await extractFileMetadata(item, sourceFilePath);
    // Update storage when done
  });
}

// Caller gets return immediately:
scheduleMetadataExtraction(item, filePath);
return item;  // Returns before extraction is done
```

### Pattern 2: Async/Await (Deferred Function)

```javascript
// All extraction happens here with proper awaiting
async function extractFileMetadata(item, sourceFilePath) {
  const metadata = {};
  
  // These await properly, but called from deferred context
  if (category === "images") {
    metadata.thumbnail = await generateImageThumbnail(sourceFilePath, fileHash);
  }
  
  if (category === "documents" && isPDF) {
    const pdfMeta = await extractPDFMetadata(sourceFilePath);
    metadata.pageCount = pdfMeta.pageCount;
  }
  
  return item;
}
```

### Pattern 3: Promise-Based (Async Generator)

```javascript
// Returns promise that resolves to path or null
async function generateImageThumbnail(sourceFilePath, fileHash) {
  const sharp = require("sharp");
  
  // This actually awaits the file write
  await sharp(sourceFilePath)
    .resize(100, 100, { fit: "cover" })
    .webp({ quality: 60 })
    .toFile(thumbPath);  // ← Awaits file write
  
  return `thumbnails/${fileHash}-thumb.webp`;
}
```

## Testing Patterns

### Unit Test: Thumbnail Generation

```javascript
// Could add to a test file:
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

async function testThumbnailGeneration() {
  const sourcePath = "/path/to/test-image.jpg";
  const result = await generateImageThumbnail(sourcePath, "testhash123");
  
  Assert.notNull(result);
  Assert.true(fs.existsSync(path.join(VAULT_DIR, result)));
  console.log("✓ Thumbnail generated successfully");
}
```

### Integration Test: Full Save Flow

```javascript
// Could add to test file:
async function testFullSaveFlow() {
  // 1. Drop image
  const filePath = "/path/to/test-image.jpg";
  
  // 2. Save (should be instant)
  const item = storage.addFileItem(filePath);
  Assert.notNull(item.id);
  Assert.null(item.metadata.thumbnail);  // Not yet generated
  
  // 3. Wait for async extraction
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // 4. Reload and check
  const items = storage.getItems();
  const savedItem = items.find(i => i.id === item.id);
  Assert.notNull(savedItem.metadata.thumbnail);  // Now generated
  console.log("✓ Full save flow works");
}
```

## Common Errors and Solutions

### Error: "Cannot read property 'path' of undefined"
**Cause**: File path not properly extracted from drag event  
**Fix**: Ensure using `e.dataTransfer.files[0].path` in drop handler, not dragenter

### Error: "ENOENT: no such file or directory"
**Cause**: Source file deleted between save and thumbnail generation  
**Fix**: Check if file exists with `fs.existsSync()` before processing

### Error: "EACCES: permission denied"
**Cause**: No permission to write to thumbnails folder  
**Fix**: Ensure vault directory is writable, check file permissions

### Error: "sharp: Platform specific binary not found"
**Cause**: Sharp installation failed  
**Fix**: `npm install --save sharp` with proper build tools

### Thumbnails not appearing in UI
**Cause**: URL path wrong or file doesn't exist  
**Fix**: Check developer console (F12) for 404 errors, verify path in items.json

## Performance Considerations

### Memory Usage During Extraction

```
Image processing (sharp):   5-20MB peak per image
PDF parsing (pdf-parse):    10-50MB peak per PDF
Thumbnail writing:          < 1MB
Total peak:                 ~50MB (same as original file size)
```

Garbage collected immediately after processing.

### CPU Usage

```
Thumbnail generation:  50-100% CPU for 20-50ms
PDF metadata:          50-80% CPU for 50-150ms
File system ops:       < 5% CPU
```

Not noticeable to user since deferred.

### Disk I/O

```
Reading source file:    Sequential (fast)
Writing thumbnail:      Sequential (fast)
Updating items.json:    Random access (slow)

Bottleneck: items.json updates
Mitigation: Update in background (deferred)
```

## Future Enhancements

### Video Poster Extraction
```javascript
async function generateVideoPoster(sourceFilePath, fileHash) {
  // Would need ffmpeg installed
  // Extract first frame at 1-second mark
  // Much more complex than image thumbnails
}
```

### Document Preview
```javascript
async function extractDocumentPreview(sourceFilePath, fileHash) {
  // For PDFs: Convert page 1 to image
  // For DOCX: Extract formatting and preview
  // For TXT: Just show first 200 characters
}
```

### Lazy Loading Thumbnails
```javascript
// Instead of loading all items at once:
function loadItemsInChunks(pageSize = 20) {
  // Load page 1 thumbnails
  // User scrolls
  // Load page 2 thumbnails on demand
  // Reduces initial load time
}
```

### Search by Metadata
```javascript
function searchItems(query) {
  return items.filter(item => 
    item.filename.includes(query) ||
    item.metadata.pageCount === parseInt(query) ||
    item.metadata.author?.includes(query)
  );
}
```

## Debug Checklist

When something breaks:

- [ ] Check console for errors: F12 DevTools
- [ ] Check items.json structure: `%APPDATA%\dump-vault\userData\vault\items.json`
- [ ] Check thumbnails exist: `%APPDATA%\dump-vault\userData\vault\thumbnails\`
- [ ] Check file paths are correct: Relative vs absolute
- [ ] Try reloading the view: Click different tab
- [ ] Try restarting app: `Ctrl+C` and `npm run dev`
- [ ] Try clearing vault: Delete vault folder (data loss!)
- [ ] Check dependencies: `npm ls sharp pdf-parse`
- [ ] Check build: `npm run build` (no errors?)
- [ ] Check syntax: `node -c electron/storage.cjs`

## Key Principles

1. **Non-Blocking**: Never wait for thumbnails, save immediately
2. **Deferred**: Use `setImmediate()` for background tasks
3. **Graceful Failures**: If thumbnail fails, item still saves
4. **Performance First**: Optimize for instant user feedback
5. **Local Caching**: All metadata/thumbnails stored locally
6. **Automatic**: No user clicks needed, everything automatic
7. **Observable**: User sees thumbnails appear naturally

## Related Documentation

- [METADATA_EXTRACTION_GUIDE.md](METADATA_EXTRACTION_GUIDE.md) - User guide
- [METADATA_IMPLEMENTATION.md](METADATA_IMPLEMENTATION.md) - Implementation details
- [FILE_PATH_FIX.md](FILE_PATH_FIX.md) - File path validation
- [CATEGORIZATION_GUIDE.md](CATEGORIZATION_GUIDE.md) - Category system

