const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const { v4: uuidv4 } = require("uuid");
const Database = require("better-sqlite3");

const VAULT_DIR = path.join(app.getPath("userData"), "vault");
const DB_PATH = path.join(VAULT_DIR, "vault.db");

// Optional video thumbnail support
let ffmpeg = null;
let ffmpegPath = null;
try {
  ffmpeg = require("fluent-ffmpeg");
  ffmpegPath = require("ffmpeg-static");
  if (ffmpeg && ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
  }
} catch (err) {
  console.warn("Video thumbnail support not fully configured:", err && err.message);
}

// Local embedding model configuration (@xenova/transformers)
const TRANSFORMERS_MODEL_ID = "Xenova/all-MiniLM-L6-v2";

// ===== DATABASE INITIALIZATION =====

let db = null;

function initDatabase() {
  ensureVaultDir();
  
  db = new Database(DB_PATH);
  
  // Create items table
  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      raw_path TEXT,
      thumbnail_path TEXT,
      embedding TEXT,
      mime_type TEXT,
      hash TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      metadata TEXT
    );
    
    CREATE INDEX IF NOT EXISTS idx_created_at ON items(created_at);
    CREATE INDEX IF NOT EXISTS idx_type ON items(type);
    CREATE INDEX IF NOT EXISTS idx_hash ON items(hash);
  `);
  
  console.log("[DB] Database initialized at:", DB_PATH);
  return db;
}

function getDatabase() {
  if (!db) {
    return initDatabase();
  }
  return db;
}

// ===== LOCAL TRANSFORMERS EMBEDDINGS (@xenova/transformers) =====

// Lazy-loaded, shared embedding pipeline
let embeddingPipelinePromise = null;

async function getEmbeddingPipeline() {
  if (!embeddingPipelinePromise) {
    embeddingPipelinePromise = (async () => {
      try {
        const { pipeline } = await import("@xenova/transformers");
        console.log("[EMBED] Initializing transformers pipeline with model:", TRANSFORMERS_MODEL_ID);
        const pipe = await pipeline("feature-extraction", TRANSFORMERS_MODEL_ID);
        return pipe;
      } catch (err) {
        console.error("[EMBED] Failed to initialize transformers pipeline:", err);
        throw err;
      }
    })();
  }
  return embeddingPipelinePromise;
}

/**
 * Generate a normalized embedding vector for the given text using
 * Xenova/all-MiniLM-L6-v2.
 *
 * - Runs the model once per call
 * - Uses mean pooling over token embeddings
 * - Applies L2 normalization
 * - Returns a plain number[]
 */
async function generateEmbedding(text) {
  try {
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return null;
    }

    const pipe = await getEmbeddingPipeline();
    // Use built-in mean pooling + normalization from the pipeline
    const output = await pipe(text.trim(), {
      pooling: "mean",
      normalize: true,
    });

    // output is a Tensor; convert to plain number[]
    if (!output || !output.data) {
      return null;
    }

    const arr = Array.from(output.data);
    return arr;
  } catch (err) {
    console.error("[EMBED] Failed to generate embedding with transformers:", err);
    return null;
  }
}

/**
 * Compute cosine similarity between two embedding vectors
 */
function cosineSimilarity(embedding1, embedding2) {
  if (!embedding1 || !embedding2 || embedding1.length !== embedding2.length) {
    return 0;
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    norm1 += embedding1[i] * embedding1[i];
    norm2 += embedding2[i] * embedding2[i];
  }

  const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

// ===== STORAGE FUNCTIONS =====

function ensureVaultDir() {
  if (!fs.existsSync(VAULT_DIR)) {
    fs.mkdirSync(VAULT_DIR, { recursive: true });
  }
}

function ensureThumbnailsDir() {
  const thumbDir = path.join(VAULT_DIR, "thumbnails");
  if (!fs.existsSync(thumbDir)) {
    fs.mkdirSync(thumbDir, { recursive: true });
  }
  return thumbDir;
}

// ===== METADATA & THUMBNAIL FUNCTIONS =====

function getFileSize(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.size;
  } catch (err) {
    console.error("Failed to get file size:", err);
    return 0;
  }
}

async function generateImageThumbnail(sourceFilePath, fileHash) {
  try {
    const sharp = require("sharp");
    const thumbDir = ensureThumbnailsDir();
    const thumbPath = path.join(thumbDir, `${fileHash}-thumb.webp`);
    
    if (fs.existsSync(thumbPath)) {
      return `thumbnails/${fileHash}-thumb.webp`;
    }
    
    // Generate a larger, sharper thumbnail so it looks crisp in cards
    await sharp(sourceFilePath)
      .resize(480, 320, {
        fit: "cover",
        position: "center",
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toFile(thumbPath);
    
    console.log("Generated thumbnail:", thumbPath);
    return `thumbnails/${fileHash}-thumb.webp`;
  } catch (err) {
    console.error("Failed to generate image thumbnail:", err);
    return null;
  }
}

async function generatePdfThumbnail(sourceFilePath, fileHash) {
  try {
    const sharp = require("sharp");
    const thumbDir = ensureThumbnailsDir();
    const thumbPath = path.join(thumbDir, `${fileHash}-pdf-thumb.webp`);

    if (fs.existsSync(thumbPath)) {
      return `thumbnails/${fileHash}-pdf-thumb.webp`;
    }

    // Higher-resolution first-page preview for clearer PDF thumbnails
    await sharp(sourceFilePath, { density: 140 })
      .resize(480, 320, {
        fit: "cover",
        position: "center",
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toFile(thumbPath);

    console.log("Generated PDF cover thumbnail:", thumbPath);
    return `thumbnails/${fileHash}-pdf-thumb.webp`;
  } catch (err) {
    console.error("Failed to generate PDF thumbnail:", err);
    return null;
  }
}

async function extractPDFMetadata(filePath) {
  try {
    const pdfParse = require("pdf-parse");
    const fileBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(fileBuffer);
    
    return {
      pageCount: pdfData.numpages || 0,
      author: pdfData.info?.Author || null,
      title: pdfData.info?.Title || null,
      creationDate: pdfData.info?.CreationDate || null,
      text: pdfData.text || ""
    };
  } catch (err) {
    console.error("Failed to extract PDF metadata:", err);
    return {
      pageCount: null,
      author: null,
      title: null,
      creationDate: null,
      text: ""
    };
  }
}

async function ocrImageText(sourceFilePath) {
  try {
    const Tesseract = require("tesseract.js");
    const result = await Tesseract.recognize(sourceFilePath, "eng", {
      logger: () => {}
    });
    return (result && result.data && result.data.text) ? result.data.text : "";
  } catch (err) {
    console.error("Failed to OCR image:", err);
    return "";
  }
}

function generateImageCaption(filename, ocrText) {
  const baseName = (filename || "").replace(/\.[^.]+$/, "");
  const words = (ocrText || "").trim().split(/\s+/).filter(Boolean);
  const snippet = words.slice(0, 6).join(" ");

  if (snippet) {
    return `${baseName ? baseName + " – " : ""}${snippet}${words.length > 6 ? "…" : ""}`;
  }

  return baseName || "Image";
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.mp4': 'video/mp4',
    '.mkv': 'video/x-matroska',
    '.webm': 'video/webm',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

// File type to category mapping
const FILE_TYPE_MAP = {
  ".png": "images", ".jpg": "images", ".jpeg": "images", ".gif": "images",
  ".webp": "images", ".bmp": "images", ".svg": "images", ".ico": "images",
  ".pdf": "documents", ".doc": "documents", ".docx": "documents",
  ".txt": "documents", ".rtf": "documents", ".tex": "documents",
  ".mp4": "videos", ".mkv": "videos", ".webm": "videos",
  ".avi": "videos", ".mov": "videos",
  ".csv": "csv", ".tsv": "csv"
};

const REJECTED_TYPES = [
  ".mp3", ".wav", ".flac", ".aac", ".wma", ".m4a", ".ogg", ".opus",
  ".exe", ".msi", ".bat", ".cmd", ".com", ".scr", ".vbs", ".ps1",
  ".apk", ".app", ".deb", ".rpm",
  ".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".iso", ".dmg",
  ".sys", ".dll", ".so", ".dylib", ".icns", ".jar", ".class", ".pyc"
];

function isRejectedFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return REJECTED_TYPES.includes(ext);
}

function getRejectionReason(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  
  if (!ext) {
    return "File has no extension";
  }

  if ([".mp3", ".wav", ".flac", ".aac", ".wma", ".m4a", ".ogg", ".opus"].includes(ext)) {
    return "Audio files not supported";
  }

  if ([".exe", ".msi", ".bat", ".cmd", ".com", ".scr", ".vbs", ".ps1", ".apk", ".app", ".deb", ".rpm"].includes(ext)) {
    return "Executable files not allowed";
  }

  if ([".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".iso", ".dmg"].includes(ext)) {
    return "Archive files not supported";
  }

  if ([".sys", ".dll", ".so", ".dylib", ".icns", ".jar", ".class", ".pyc", ".o"].includes(ext)) {
    return "System files not supported";
  }

  return "File type not supported";
}

function detectCategoryFromFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return FILE_TYPE_MAP[ext] || "documents";
}

function isURLContent(text) {
  const URL_REGEX = /^(https?:\/\/|www\.)\S+/i;
  return URL_REGEX.test(text.trim());
}

function detectCategoryFromText(text) {
  const trimmed = text.trim();
  if (isURLContent(trimmed)) {
    return "links";
  }
  
  const lower = trimmed.toLowerCase();
  const codeKeywords = [
    "function ", "const ", "let ", "var ", "class ", "import ", "export ",
    "require(", "ipcmain.", "ipcrenderer.", "async ", "await ", "public ",
    "private ", "def ", "#include",
  ];
  if (codeKeywords.some((kw) => lower.includes(kw))) {
    return "code";
  }

  const semiCount = (trimmed.match(/;/g) || []).length;
  const braceCount = (trimmed.match(/[{}]/g) || []).length;
  const arrowCount = (trimmed.match(/=>/g) || []).length;

  if (semiCount + braceCount + arrowCount >= 3) {
    return "code";
  }

  if (trimmed.length > 500) {
    return "notes";
  }
  
  return "ideas";
}

function generateTextTitle(text) {
  const trimmed = text.trim();
  if (isURLContent(trimmed)) {
    return "Link: " + trimmed.substring(0, 50) + (trimmed.length > 50 ? "..." : "");
  }
  
  const firstLine = trimmed.split('\n')[0].trim();
  return firstLine.length > 50 ? firstLine.substring(0, 47) + "..." : firstLine || "Untitled";
}

/**
 * Extract metadata for a file (asynchronously)
 */
async function extractFileMetadata(item, sourceFilePath) {
  try {
    const category = item.category;
    const fileHash = item.hash;
    const filename = (item.metadata && item.metadata.filename) || item.title || "";
    const metadata = {
      size: getFileSize(sourceFilePath),
      thumbnail: null,
      pageCount: null,
      author: null,
      title: null,
      extractedText: "",
      caption: null,
    };

    // Generate image thumbnails
    if (category === "images") {
      metadata.thumbnail = await generateImageThumbnail(sourceFilePath, fileHash);
      const ocrText = await ocrImageText(sourceFilePath);
      metadata.extractedText = ocrText;
      metadata.caption = generateImageCaption(filename, ocrText);
    }

    // Extract PDF metadata
    if (category === "documents" && filename.toLowerCase().endsWith(".pdf")) {
      const pdfMeta = await extractPDFMetadata(sourceFilePath);
      metadata.pageCount = pdfMeta.pageCount;
      metadata.author = pdfMeta.author;
      metadata.title = pdfMeta.title;
      metadata.extractedText = pdfMeta.text || "";
      metadata.thumbnail = await generatePdfThumbnail(sourceFilePath, fileHash);
    }

    // Plain text and CSV documents: read full text for search
    if ((category === "documents" || category === "csv") && !metadata.extractedText) {
      const ext = path.extname(filename || "").toLowerCase();
      if (ext === ".txt" || ext === ".csv" || ext === ".tsv") {
        try {
          const raw = fs.readFileSync(sourceFilePath, "utf-8");
          metadata.extractedText = raw;
        } catch (err) {
          console.error("Failed to read document text:", err);
        }
      }
    }

    // Video thumbnails
    if (category === "videos" && ffmpeg && ffmpegPath) {
      try {
        const thumbDir = ensureThumbnailsDir();
        const thumbPath = path.join(thumbDir, `${fileHash}-video-thumb.jpg`);
        if (!fs.existsSync(thumbPath)) {
          await new Promise((resolve, reject) => {
            ffmpeg(sourceFilePath)
              .on("end", resolve)
              .on("error", reject)
              .screenshots({
                timestamps: ["00:00:01"],
                filename: `${fileHash}-video-thumb.jpg`,
                folder: thumbDir,
                size: "400x?"
              });
          });
          console.log("Generated video thumbnail:", thumbPath);
        }
        metadata.thumbnail = `thumbnails/${fileHash}-video-thumb.jpg`;
      } catch (err) {
        console.error("Failed to generate video thumbnail:", err);
      }
    }

    return metadata;
  } catch (err) {
    console.error("Error extracting metadata:", err);
    return {
      size: getFileSize(sourceFilePath),
      thumbnail: null,
      extractedText: "",
    };
  }
}

// ===== ITEM CREATION & SAVE =====

/**
 * Build searchable text from item for embedding generation
 */
function buildSearchableText(item, extractedMetadata = {}) {
  const parts = [];
  
  if (item.title) parts.push(item.title);
  if (item.content) parts.push(item.content);
  if (item.metadata?.filename) parts.push(item.metadata.filename);
  if (extractedMetadata.extractedText) parts.push(extractedMetadata.extractedText);
  if (extractedMetadata.caption) parts.push(extractedMetadata.caption);
  if (item.metadata?.url) parts.push(item.metadata.url);
  
  return parts.join(" ").trim();
}

/**
 * Save item to SQLite database with embedding
 */
async function saveItem(itemData) {
  const db = getDatabase();
  const now = new Date().toISOString();
  
  // Prepare item data
  const item = {
    id: itemData.id || uuidv4(),
    type: itemData.type,
    title: itemData.title,
    content: itemData.content || null,
    raw_path: itemData.storagePath || null,
    thumbnail_path: null,
    embedding: null,
    mime_type: itemData.metadata?.mimeType || null,
    hash: itemData.hash || null,
    created_at: itemData.metadata?.createdAt || now,
    updated_at: now,
    metadata: JSON.stringify(itemData.metadata || {}),
  };

  // Extract metadata and generate thumbnail if file
  let extractedMetadata = {};
  if (itemData.storagePath && fs.existsSync(itemData.storagePath)) {
    extractedMetadata = await extractFileMetadata(itemData, itemData.storagePath);
    item.thumbnail_path = extractedMetadata.thumbnail || null;
    
    // Update metadata with extracted info
    const currentMeta = itemData.metadata || {};
    item.metadata = JSON.stringify({
      ...currentMeta,
      ...extractedMetadata,
      filename: currentMeta.filename || path.basename(itemData.storagePath),
      createdAt: item.created_at,
      source: currentMeta.source || "overlay",
    });
  }

  // Generate embedding from searchable text
  const searchableText = buildSearchableText(itemData, extractedMetadata);
  if (searchableText) {
    const embedding = await generateEmbedding(searchableText);
    if (embedding) {
      item.embedding = JSON.stringify(embedding);
    }
  }

  // Insert or update item
  const stmt = db.prepare(`
    INSERT INTO items (
      id, type, title, content, raw_path, thumbnail_path, embedding,
      mime_type, hash, created_at, updated_at, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      content = excluded.content,
      raw_path = excluded.raw_path,
      thumbnail_path = excluded.thumbnail_path,
      embedding = excluded.embedding,
      mime_type = excluded.mime_type,
      hash = excluded.hash,
      updated_at = excluded.updated_at,
      metadata = excluded.metadata
  `);

  stmt.run(
    item.id,
    item.type,
    item.title,
    item.content,
    item.raw_path,
    item.thumbnail_path,
    item.embedding,
    item.mime_type,
    item.hash,
    item.created_at,
    item.updated_at,
    item.metadata
  );

  console.log("[DB] Saved item:", item.id, item.type);

  // Return item in format compatible with existing code
  const savedMetadata = JSON.parse(item.metadata);
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    content: item.content,
    category: itemData.category || savedMetadata.category || "documents",
    storagePath: item.raw_path,
    hash: item.hash,
    searchableText: searchableText.toLowerCase(),
    metadata: {
      ...savedMetadata,
      filename: savedMetadata.filename || path.basename(item.raw_path || ""),
      createdAt: item.created_at,
      mimeType: item.mime_type,
      thumbnail: item.thumbnail_path,
    },
    timestamp: item.created_at,
  };
}

// ===== ITEM RETRIEVAL =====

/**
 * Load all items from database
 */
function loadItems() {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM items ORDER BY created_at DESC");
  const rows = stmt.all();
  
  return rows.map(row => {
    const metadata = JSON.parse(row.metadata || "{}");
    // Infer category from type and metadata if not present
    let category = metadata.category;
    if (!category) {
      if (row.type === "image") category = "images";
      else if (row.type === "link") category = "links";
      else if (row.type === "text") {
        // Try to infer from content
        category = detectCategoryFromText(row.content || "");
      } else if (row.type === "file") {
        // Try to infer from filename
        const filename = metadata.filename || row.title || "";
        category = detectCategoryFromFile(filename);
      }
    }
    
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      content: row.content,
      category: category || "documents",
      storagePath: row.raw_path,
      searchableText: (row.title + " " + (row.content || "")).toLowerCase(),
      metadata: {
        ...metadata,
        filename: metadata.filename || path.basename(row.raw_path || ""),
        createdAt: row.created_at,
        mimeType: row.mime_type,
        thumbnail: row.thumbnail_path,
      },
      timestamp: row.created_at,
    };
  });
}

function getItems() {
  return loadItems();
}

function deleteItem(id) {
  const db = getDatabase();
  const stmt = db.prepare("DELETE FROM items WHERE id = ?");
  stmt.run(id);
  console.log("[DB] Deleted item:", id);
}

// ===== SEMANTIC SEARCH =====

/**
 * Semantic search using cosine similarity
 */
async function semanticSearch(query) {
  const db = getDatabase();
  
  // Generate query embedding
  const queryEmbedding = await generateEmbedding(query);
  if (!queryEmbedding) {
    console.warn("[SEARCH] Failed to generate query embedding");
    return [];
  }

  // Load all items with embeddings
  const stmt = db.prepare("SELECT * FROM items WHERE embedding IS NOT NULL");
  const rows = stmt.all();

  // Compute similarities
  const results = [];
  for (const row of rows) {
    try {
      const itemEmbedding = JSON.parse(row.embedding);
      const similarity = cosineSimilarity(queryEmbedding, itemEmbedding);
      
      results.push({
        item: {
          id: row.id,
          type: row.type,
          title: row.title,
          content: row.content,
          storagePath: row.raw_path,
          metadata: JSON.parse(row.metadata || "{}"),
          timestamp: row.created_at,
        },
        similarity,
      });
    } catch (err) {
      console.error("[SEARCH] Failed to parse embedding for item:", row.id, err);
    }
  }

  // Sort by similarity descending and return top 5
  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, 5).map(r => r.item);
}

// ===== LEGACY COMPATIBILITY FUNCTIONS =====

function createTextItem(text) {
  const category = detectCategoryFromText(text);
  const title = generateTextTitle(text);
  
  return {
    id: uuidv4(),
    type: "text",
    title: title,
    category: category,
    content: text,
    searchableText: text.toLowerCase(),
    metadata: {
      createdAt: new Date().toISOString(),
      source: "overlay"
    }
  };
}

function createFileItem(filePath) {
  if (!filePath || typeof filePath !== "string" || filePath.trim() === "") {
    throw new Error("File path is required and must be a non-empty string");
  }
  
  if (!fs.existsSync(filePath)) {
    throw new Error("File does not exist: " + filePath);
  }
  
  if (isRejectedFile(filePath)) {
    const reason = getRejectionReason(filePath);
    throw new Error(`File rejected: ${reason}`);
  }

  const fileName = path.basename(filePath);
  const fileContent = fs.readFileSync(filePath);
  const fileHash = require("crypto")
    .createHash("sha256")
    .update(fileContent)
    .digest("hex");
  
  const category = detectCategoryFromFile(filePath);
  const fileType = category === "images" ? "image" : "file";
  
  // Copy file to vault storage
  const vaultFilePath = path.join(VAULT_DIR, `${fileHash}${path.extname(fileName)}`);
  if (!fs.existsSync(vaultFilePath)) {
    fs.copyFileSync(filePath, vaultFilePath);
  }

  return {
    id: uuidv4(),
    type: fileType,
    title: fileName,
    category: category,
    storagePath: vaultFilePath,
    searchableText: fileName.toLowerCase(),
    hash: fileHash,
    metadata: {
      size: fileContent.length,
      mimeType: getMimeType(filePath),
      filename: fileName,
      createdAt: new Date().toISOString(),
      source: "overlay"
    }
  };
}

function createLinkItem(url, title = null) {
  const cleanUrl = url.trim();
  const linkTitle = title || cleanUrl;
  
  return {
    id: uuidv4(),
    type: "link",
    title: linkTitle,
    category: "links",
    searchableText: cleanUrl.toLowerCase(),
    metadata: {
      url: cleanUrl,
      pageTitle: title,
      createdAt: new Date().toISOString(),
      source: "overlay"
    }
  };
}

async function addItem(item) {
  return await saveItem(item);
}

async function addTextItem(text) {
  const item = createTextItem(text);
  return await saveItem(item);
}

async function addFileItem(filePath) {
  const item = createFileItem(filePath);
  return await saveItem(item);
}

// Legacy search function for compatibility
async function smartSearch(query) {
  const results = await semanticSearch(query);
  return {
    results,
    explanation: `Found ${results.length} results`,
    totalItems: loadItems().length,
    filteredCount: results.length,
  };
}

// Test data function (stub for compatibility)
function createTestItems() {
  console.log("[DB] Test items creation not implemented in SQLite version");
}

// Initialize database on module load
initDatabase();

module.exports = {
  // Database
  initDatabase,
  getDatabase,
  // Core functions
  saveItem,
  loadItems,
  getItems,
  deleteItem,
  semanticSearch,
  // Legacy compatibility
  addTextItem,
  addFileItem,
  createTextItem,
  createFileItem,
  createLinkItem,
  addItem,
  smartSearch,
  // Validation
  isRejectedFile,
  getRejectionReason,
  detectCategoryFromFile,
  detectCategoryFromText,
  isURLContent,
  // Test data
  createTestItems,
  // Constants
  VAULT_DIR,
  FILE_TYPE_MAP,
  REJECTED_TYPES,
};
