# Deployment & Testing Checklist

Complete this checklist before considering the app ready for use or further development.

## ✅ Pre-Launch Verification

### Code Quality
- [X] All JavaScript syntax valid (checked with `node -c`)
- [X] React build successful (`npm run build` completed)
- [X] No CSS warnings (fixed trailing brace issue)
- [X] All IPC handlers defined in main.cjs
- [X] All API methods exposed in preload.cjs
- [X] Dependencies installed (`npm install`)

### File Structure
- [X] electron/main.cjs exists and imports storage
- [X] electron/storage.cjs exists with all functions
- [X] electron/preload.cjs exposes electronAPI
- [X] src/App.jsx has both text and drag modes
- [X] src/App.css has proper styling
- [X] src/index.css sets full-screen
- [X] package.json has proper scripts

### Documentation
- [X] README.md - Project overview
- [X] QUICK_START.md - Usage guide
- [X] SETUP_GUIDE.md - Features & customization
- [X] ARCHITECTURE.md - Technical design
- [X] IMPLEMENTATION_SUMMARY.md - What was built
- [X] FILE_GUIDE.md - File reference

## 🧪 Development Testing (`npm run dev`)

### Startup
- [ ] `npm run dev` starts without errors
- [ ] Vite dev server launches (check port in terminal)
- [ ] Electron window appears in background (not shown)
- [ ] No error messages in terminal

### Global Hotkey
- [ ] Press `Ctrl+Shift+D` → popup appears
- [ ] Popup is centered on screen
- [ ] Popup is always-on-top (visible above other windows)
- [ ] Popup size looks good (~500x300)
- [ ] Press `Ctrl+Shift+D` again → popup closes

### Text Mode
- [ ] ✓ Textarea is auto-focused
- [ ] ✓ Can type text
- [ ] ✓ Text appears as you type
- [ ] ✓ "Paste" button works (copy text first, click Paste)
- [ ] ✓ Paste button puts data in textarea
- [ ] ✓ Click "Save" button → saves text
- [ ] ✓ Press `Ctrl+Enter` → saves text
- [ ] ✓ After saving, textarea clears
- [ ] ✓ items.json file created in vault folder
- [ ] ✓ Saved text appears in items.json with UUID & timestamp

### Drag-and-Drop Mode
- [ ] ✓ Open popup (`Ctrl+Shift+D`)
- [ ] ✓ Drag a file from File Explorer
- [ ] ✓ UI switches to drop zone (shows "📥 Drop here to save")
- [ ] ✓ Drop zone has dashed border and bouncing icon
- [ ] ✓ Drop the file
- [ ] ✓ UI switches back to text mode
- [ ] ✓ File appears in vault folder
- [ ] ✓ File metadata in items.json (filename, hash, timestamp)

### Window Management
- [ ] ✓ Click outside popup → popup hides (blur event)
- [ ] ✓ App stays in background (no taskbar clutter)
- [ ] ✓ Popup reappears on next `Ctrl+Shift+D`
- [ ] ✓ Multiple save cycles work smoothly

### Data Persistence
- [ ] ✓ items.json file location: `%APPDATA%\dump-vault\userData\vault\`
- [ ] ✓ Multiple items saved → all appear in JSON
- [ ] ✓ Each item has: id, type, timestamp
- [ ] ✓ Text items have: content field
- [ ] ✓ File items have: filename, path, hash fields
- [ ] ✓ Data persists after closing and reopening app

### Keyboard & Input
- [ ] ✓ Ctrl+Enter saves (in text mode)
- [ ] ✓ Escape key doesn't close popup (optional: can add later)
- [ ] ✓ Tab key navigates between textarea and Paste button
- [ ] ✓ Enter in textarea doesn't save (only Ctrl+Enter)

## 🎨 Visual Testing

### UI Appearance
- [ ] Popup has gradient background (purple tones)
- [ ] Textarea is white with shadow
- [ ] Buttons have hover effects (visible feedback)
- [ ] Drop zone has dashed border
- [ ] Drop zone icon bounces smoothly
- [ ] Overall layout feels minimal and clean

### Responsiveness (Optional - for future)
- [ ] Textarea expands with popup size
- [ ] Buttons positioned correctly
- [ ] Text doesn't overflow
- [ ] Mobile/small screen handling (if applicable)

### Animations
- [ ] Drop zone icon bounces
- [ ] Mode switch transitions smoothly (text ↔ drag)
- [ ] Button hover animation works
- [ ] No janky animations or stutters

## 🔍 Edge Cases & Error Handling

### File Operations
- [ ] ✓ Save large file (>100MB) - should work
- [ ] ✓ Save file with special characters in name - should work
- [ ] ✓ Save same file twice - gets deduplicated (stored once)
- [ ] ✓ Save PDF, image, document, text file - all work
- [ ] ✓ Drag folder instead of file - gracefully handles
- [ ] ✓ Drag from cloud sync folder - works

### Text Operations
- [ ] ✓ Save empty text - should handle gracefully
- [ ] ✓ Save very long text (>10KB) - should work
- [ ] ✓ Save text with special characters - should work
- [ ] ✓ Rapid save clicks - no duplicate saves
- [ ] ✓ Save while popup losing focus - completes save first

### Window Operations
- [ ] ✓ Press hotkey while popup is hidden - shows it
- [ ] ✓ Press hotkey while popup is visible - hides it
- [ ] ✓ Hotkey while typing - type continues, then save
- [ ] ✓ Close app while typing - data doesn't get lost
- [ ] ✓ Multiple opens/closes in succession - works smoothly

## 🏗️ Build & Distribution (Optional)

### Production Build
- [ ] `npm run build` succeeds without errors
- [ ] dist/ folder created with HTML, JS, CSS
- [ ] Can manually run Electron on dist/ (change devServer URL)
- [ ] Build output is reasonable size (~200KB)

### Package Configuration
- [ ] package.json has correct app name
- [ ] package.json has correct main entry (electron/main.cjs)
- [ ] Dependencies are production-only
- [ ] No dev dependencies in production build

## 📋 Documentation Verification

### README.md
- [ ] Accurate project description
- [ ] Correct feature list
- [ ] Valid quick start instructions
- [ ] Links to other docs work

### QUICK_START.md
- [ ] Step-by-step instructions are clear
- [ ] Testing checklist is comprehensive
- [ ] Keyboard shortcuts documented
- [ ] Data format examples are correct
- [ ] Troubleshooting covers common issues

### SETUP_GUIDE.md
- [ ] All customization options explained
- [ ] Code locations are accurate
- [ ] Configuration examples are correct
- [ ] Future enhancements listed

### ARCHITECTURE.md
- [ ] Diagrams are accurate
- [ ] Data flows explained clearly
- [ ] Component responsibilities clear
- [ ] IPC protocol documented

### FILE_GUIDE.md
- [ ] All files listed
- [ ] Purposes clearly explained
- [ ] Customization locations correct
- [ ] File dependencies accurate

## 🚀 Ready for Use?

### All Testing Passed → READY ✅

1. Share the codebase with team/users
2. Point them to [QUICK_START.md](./QUICK_START.md)
3. They can follow dev setup and run `npm run dev`
4. Share copy of vault folder location for data backup

### Some Tests Failed → DEBUG

Check [QUICK_START.md](./QUICK_START.md) troubleshooting section or [SETUP_GUIDE.md](./SETUP_GUIDE.md).

## 💾 Backup & Maintenance

### Data Backup
```
Location: %APPDATA%\dump-vault\userData\vault\
Backup: Copy items.json + all files regularly
Restore: Copy vault folder to same location
```

### Updates & Improvements
1. Edit code
2. Test in dev (`npm run dev`)
3. Rebuild (`npm run build`)
4. Redeploy

### Common Maintenance Tasks

**Clean vault (delete old items):**
- Edit items.json directly (remove entries)
- Delete unused files in vault folder

**Reset to default:**
- Delete entire `%APPDATA%\dump-vault\` folder
- App will recreate on next launch

**Change hotkey:**
- Edit [electron/main.cjs](electron/main.cjs) line 79
- Rebuild and restart

## 📞 Support & Troubleshooting

### Issue: App won't start
→ Check [QUICK_START.md](./QUICK_START.md) troubleshooting

### Issue: Data not saving
→ Verify vault folder permissions (should be user-writable)

### Issue: Hotkey not working
→ Might be registered by another app; change hotkey in main.cjs

### Issue: Missing dependencies
→ Run `npm install` again

---

## Summary

This checklist ensures the app is:
- ✅ Functionally complete (all features working)
- ✅ Visually polished (UI looks good)
- ✅ Error-resistant (handles edge cases)
- ✅ Well-documented (easy to understand & customize)
- ✅ Production-ready (can be distributed)

**After all items are checked, the app is ready for distribution or further development.**

---

Date Completed: _______________

Tested By: _______________

Notes: 

```
[Space for additional notes, issues, or ideas]
```
