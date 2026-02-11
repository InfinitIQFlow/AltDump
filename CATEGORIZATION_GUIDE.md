# Auto-Categorization & File Validation Guide

## Overview

Dump Vault now automatically categorizes every saved item without requiring any user input. The categorization happens instantly when you:
- Type or paste text
- Detect a URL in pasted content
- Drag a file over the popup
- Drop a file to save

All categorization is **automatic, instant, and invisible** to the user—it happens in real-time during drag, paste, or save operations.

## Categories

The app automatically assigns items to one of these categories:

### 1. **Documents** 
Files with document-related extensions:
- `.pdf` - Adobe PDF
- `.doc`, `.docx` - Microsoft Word  
- `.txt` - Plain text
- `.rtf` - Rich Text Format
- `.tex` - LaTeX
- `.odt` - OpenDocument Text

**Detection**: Automatic based on file extension

### 2. **Images**
Visual media files:
- `.png`, `.jpg`, `.jpeg` - Common formats
- `.gif` - Animated images
- `.webp` - Modern compressed format
- `.bmp` - Bitmap  
- `.svg` - Vector graphics
- `.ico` - Icons
- `.tiff` - Tagged/high-quality images

**Detection**: Automatic based on file extension

### 3. **Videos**
Motion video files:
- `.mp4` - MP4 video (H.264)
- `.mkv` - Matroska (multiple codec support)
- `.webm` - WebM (VP8/VP9)
- `.avi` - Audio Video Interleave
- `.mov` - QuickTime (macOS)
- `.flv` - Flash Video
- `.wmv` - Windows Media Video
- `.m4v` - Protected MP4 variant

**Detection**: Automatic based on file extension

### 4. **CSV**
Data files:
- `.csv` - Comma-Separated Values
- `.tsv` - Tab-Separated Values

**Detection**: Automatic based on file extension

### 5. **Links**
URLs and web addresses:
- `http://example.com`
- `https://example.com`  
- `www.example.com`

**Detection**: Automatic when text starts with `http://`, `https://`, or `www.`

**When it triggers**:
- User pastes a single URL → Automatically saved as "links" category
- User manually types a URL and saves → Automatically saved as "links" category

### 6. **Text**
Plain text content:
- Notes
- Code snippets
- Thoughts
- Lists
- Any text that's not a URL

**Detection**: Default for any text input that doesn't match URL pattern

## File Type Validation

### Supported Files

These file types are **accepted and saved**:

✅ **Documents**: PDF, DOC, DOCX, TXT, RTF, TEX, ODT  
✅ **Images**: PNG, JPG, JPEG, GIF, WEBP, BMP, SVG, ICO, TIFF  
✅ **Videos**: MP4, MKV, WEBM, AVI, MOV, FLV, WMV, M4V  
✅ **Data**: CSV, TSV  
✅ **Text**: Plain text input, URLs

### Blocked Files

These file types are **rejected** with an inline error message:

❌ **Audio Files**: MP3, WAV, FLAC, AAC, WMA, M4A, OGG, OPUS  
❌ **Executables**: EXE, MSI, BAT, CMD, COM, SCR, VBS, PS1, APK, APP, DEB, RPM  
❌ **Archives**: ZIP, RAR, 7Z, TAR, GZ, BZ2, ISO, DMG  
❌ **System Files**: SYS, DLL, SO, DYLIB, ICNS, JAR, CLASS, PYC, O  
❌ **Folders/Directories**: Cannot drop folders

### Why These Are Blocked

- **Audio**: Streaming/playback not relevant to "dump" use case; files are large
- **Executables**: Security risk; could be malware; not suitable for capture
- **Archives**: Should extract first; defeats purpose of quick capture
- **System Files**: Cannot be moved/copied safely; irrelevant to note-taking
- **Folders**: Not single files; should save individual files instead

## Real-Time Validation Feedback

### During Drag (Hover Over Popup)

When you drag a file over the popup, it instantly shows:

**✅ Valid File**:
```
┌─────────────────────────────────┐
│  Saving as images               │  ← Blue info banner
├─────────────────────────────────┤
│        📥                       │
│   Drop here to save            │
└─────────────────────────────────┘
```

**❌ Blocked File**:
```
┌─────────────────────────────────┐
│  Audio files not supported       │  ← Red error banner
├─────────────────────────────────┤
│        🚫                       │
│  File type not supported        │
│  Audio files not supported      │  ← Additional help text
└─────────────────────────────────┘
```

### When Pasting Text

When you paste content into the text area:

**If URL detected**:
```
Pasting: https://github.com/example
          ↓
┌─────────────────────────────────┐
│  Detected URL - will save...     │
└─────────────────────────────────┘
```

**If plain text**:
```
Pasting: My grocery list
         ↓
┌─────────────────────────────────┐
│  Detected text                  │
└─────────────────────────────────┘
```

### On Save

After successfully saving:
```
Saved as links!        ← Shows detected category
```

## How Categorization Works

### File Type Detection Algorithm

1. **Extract file extension** from the filename (case-insensitive)
   ```
   "document.pdf" → ".pdf" ✓
   "image.PNG" → ".png" ✓ (normalized to lowercase)
   "archive" → "" ✗ (no extension)
   ```

2. **Check against blocked list** 
   ```
   Is extension in REJECTED_EXTENSIONS? 
   → Yes? Show rejection reason and block drop
   → No? Proceed to category mapping
   ```

3. **Map to category**
   ```
   ".pdf" → documents
   ".jpg" → images
   ".mp4" → videos
   ".csv" → csv
   → Default: documents
   ```

4. **Return validation result**
   ```
   {
     valid: true,
     category: "images"
   }
   ```

### Text Content Detection Algorithm

1. **Check if content is URL**
   ```
   Test against regex: /^(https?:\/\/|www\.)\S+/i
   
   Matches:
   ✓ "https://github.com"
   ✓ "http://example.com/path"
   ✓ "www.example.com"
   
   Doesn't match:
   ✗ "Visit example.com"
   ✗ "My notes"
   ✗ "email@example.com"
   ```

2. **Assign category**
   ```
   Is URL? → category: "links"
   Otherwise → category: "text"
   ```

## Data Schema with Categories

Every saved item now includes a `category` field:

### Text Item
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "text",
  "category": "links",           ← NEW FIELD
  "content": "https://github.com",
  "timestamp": "2026-02-09T14:23:45.123Z"
}
```

### File Item
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "type": "file",
  "filename": "document.pdf",
  "path": "C:\\...\\vault\\abc123.pdf",
  "hash": "abc123...",
  "category": "documents",       ← NEW FIELD
  "timestamp": "2026-02-09T14:26:22.789Z"
}
```

Categories are stored as lowercase strings:
- `documents`
- `images`
- `videos`
- `csv`
- `links`
- `text`

## Implementation Details

### Storage Layer (electron/storage.cjs)

**New Functions**:
- `isRejectedFile(filePath)` - Check if file is blocked
- `getRejectionReason(filePath)` - Explain why file is blocked
- `detectCategoryFromFile(filePath)` - Get category for file
- `detectCategoryFromText(text)` - Get category for text
- `isURLContent(text)` - Check if text is URL

**Updated Functions**:
- `addTextItem(text)` - Now detects and stores category
- `addFileItem(filePath)` - Now detects category and validates

### IPC Communication (electron/main.cjs)

**New Handlers**:
- `validate-file` - Returns `{valid, reason}` or `{valid, category}`
- `detect-category` - Returns category string
- `is-url-content` - Returns boolean

### React Component (src/App.jsx)

**New State**:
- `validationMessage` - Shows inline feedback
- `detectedCategory` - Displays category hint
- `isBlocked` - Tracks if file is rejected

**New Effects**:
- Enhanced `dragenter` with validation
- Auto-clear validation message after 3 seconds
- Category hint below textarea

**New Modes**:
- `"text"` - Normal input
- `"drag"` - Valid file being dragged
- `"blocked"` - Invalid file being dragged

### Styling (src/App.css)

**New Classes**:
- `.validation-message` - Banner for feedback
- `.validation-message.info` - Blue for valid files
- `.validation-message.error` - Red for blocked files
- `.drop-zone.blocked-zone` - Red drop zone for rejected files
- `.drop-icon.blocked-icon` - Red ❌ icon for blocked
- `.category-hint` - Small text showing detected category

## User Experience Flow

### Scenario 1: Saving a PDF

```
User: Ctrl+Shift+D to open popup
       ↓
App: Shows text mode
       ↓
User: Drags document.pdf over popup
       ↓
App: Validates file → "Saving as documents"
  Shows: 📥 Drop here to save
         as documents
       ↓
User: Drops file
       ↓
App: Validates again → OK
  Saves file → Shows "Saved as documents!"
  Switches back to text mode
```

### Scenario 2: Blocking an MP3

```
User: Drags song.mp3 over popup
       ↓
App: Validates file → REJECTED
     Shows: 🚫 File type not supported
            Audio files not supported
       ↓
User: Moves away or drops outside popup
       ↓
App: Clears message, stays in text mode
```

### Scenario 3: Pasting a URL

```
User: Copies: https://github.com/example
User: Ctrl+Shift+D to open popup
      ↓
App: Shows text mode
      ↓
User: Clicks Paste
      ↓
App: Gets clipboard: "https://github.com/example"
     Detects URL: Yes! ✓
     Shows: "Detected URL - will save as Link"
     Pastes content into textarea
      ↓
User: Ctrl+Enter to save
      ↓
App: Saves as "links" category
     Shows: "Saved as links!"
```

## Configuration & Customization

### Add More Supported File Types

Edit [electron/storage.cjs](../electron/storage.cjs), lines 13-19:

```javascript
const CATEGORY_MAP = {
  documents: [".pdf", ".doc", ".docx", ".txt", ".myformat"], // ← Add here
  // ...
};
```

### Block Additional File Types

Edit [electron/storage.cjs](../electron/storage.cjs), lines 21-31:

```javascript
const REJECTED_EXTENSIONS = [
  // ... existing items
  ".yourformat",  // ← Add here
];
```

### Change URL Detection Regex

Edit [electron/storage.cjs](../electron/storage.cjs), line 67:

```javascript
const URL_REGEX = /^(https?:\/\/|www\.)\S+/i;
// Modify this regex to customize URL matching
// E.g., to match just `example.com`: /^([a-z0-9][a-z0-9-]+\.)+[a-z]{2,}/i
```

### Customize Validation Messages

Edit [src/App.jsx](../src/App.jsx), lines 32-52:

```javascript
setValidationMessage(`Saving as ${validation.category}`);
// Change the message text here
```

## Testing Categorization

### Test Cases

1. **Valid file drag**: `document.pdf`
   - Expected: "Saving as documents"
   - Result: File saves in documents category

2. **Blocked file drag**: `song.mp3`
   - Expected: "Audio files not supported"
   - Result: File rejected, stays in text mode

3. **Valid file drag**: `photo.jpg`
   - Expected: "Saving as images"
   - Result: File saves in images category

4. **URL paste**: `https://github.com`
   - Expected: "Detected URL - will save as Link"
   - Result: Text saves in links category

5. **Plain text paste**: `My todo list`
   - Expected: "Detected text"
   - Result: Text saves in text category

6. **Archive drag**: `files.zip`
   - Expected: "Archive files not supported"
   - Result: File blocked, red error shown

## Performance Notes

- **File validation**: < 1ms (just extension check)
- **URL detection**: < 1ms (regex test)
- **Real-time feedback**: Instant (no API calls)
- **No performance impact**: Validation runs only during drag/save, not during app idle

## Security Considerations

- **Extension-based validation**: Fast, reliable, repeats actual file type validation
- **No binary sniffing**: Trust OS file handling; extensions are accurate for user-dragged files
- **Blocked executables**: Prevents accidental execution of malware
- **No code execution**: Categorization is passive; no files are executed or modified
- **No external calls**: All validation is local; no cloud checks

## Future Enhancements

- [ ] MIME type detection using `file` command on Linux/macOS
- [ ] File content inspection (first few bytes) for double-validation
- [ ] Custom category creation UI
- [ ] User can override category before save
- [ ] Statistics: "X documents, Y images saved"
- [ ] Filter/search by category
- [ ] Category-specific actions (open in default app, etc.)

---

For usage instructions, see [QUICK_START.md](../QUICK_START.md).

For general features, see [README.md](../README.md).

For customization, see [SETUP_GUIDE.md](../SETUP_GUIDE.md).
