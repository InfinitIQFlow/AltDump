const fs = require("fs");
const path = require("path");
const http = require("http");
const { app } = require("electron");
const { v4: uuidv4 } = require("uuid");

const VAULT_DIR = path.join(app.getPath("userData"), "vault");
const ITEMS_FILE = path.join(VAULT_DIR, "items.json");
const EMBEDDINGS_FILE = path.join(VAULT_DIR, "embeddings.json");

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

// Local LLM / vision configuration (Ollama)
const OLLAMA_ENABLED = true; // enrichment at save-time; NOT used on every search
const OLLAMA_HOST = "127.0.0.1";
const OLLAMA_PORT = 11434;
const OLLAMA_LLM_MODEL = "llama3.2";
const OLLAMA_VISION_MODEL = "llava";

// ===== LOCAL NLP & EMBEDDINGS =====

// Simple intent parser - extracts structured signals without generating text
function parseSearchIntent(query) {
  const lowerQuery = query.toLowerCase();
  
  // Time extraction (build proper Date objects, no chained setX calls)
  const buildTodayRange = () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    return { start, end };
  };

  const buildYesterdayRange = () => {
    const start = new Date();
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setDate(end.getDate() - 1);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  };

  const buildLastWeekRange = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 7);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  };

  const buildLastMonthRange = () => {
    const end = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - 1);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  };

  const timeSignals = {
    today: buildTodayRange(),
    yesterday: buildYesterdayRange(),
    "last week": buildLastWeekRange(),
    "last month": buildLastMonthRange(),
  };
  
  let timeFilter = null;
  for (const [phrase, range] of Object.entries(timeSignals)) {
    if (lowerQuery.includes(phrase)) {
      timeFilter = range;
      break;
    }
  }
  
  // Content type extraction
  const typeSignals = {
    image: ['image', 'picture', 'photo', 'screenshot', 'png', 'jpg', 'jpeg'],
    note: ['note', 'notes', 'text', 'idea', 'ideas'],
    file: ['file', 'document', 'pdf', 'doc', 'video'],
    link: ['link', 'url', 'website', 'http']
  };
  
  let contentType = null;
  for (const [type, keywords] of Object.entries(typeSignals)) {
    if (keywords.some(keyword => lowerQuery.includes(keyword))) {
      contentType = type;
      break;
    }
  }
  
  // Topic keywords extraction (remove time and type signals)
  let topicKeywords = lowerQuery;
  for (const phrase of Object.keys(timeSignals)) {
    topicKeywords = topicKeywords.replace(phrase, '');
  }
  for (const [type, keywords] of Object.entries(typeSignals)) {
    for (const keyword of keywords) {
      topicKeywords = topicKeywords.replace(keyword, '');
    }
  }
  topicKeywords = topicKeywords.replace(/\b(show|find|open|get|search|look for)\b/g, '').trim();
  
  return {
    timeFilter,
    timePhrase: timeFilter
      ? Object.keys(timeSignals).find((key) => lowerQuery.includes(key)) || null
      : null,
    contentType,
    topicKeywords: topicKeywords || null,
    originalQuery: query
  };
}

// Simple embedding simulation (in production, use a real local model like sentence-transformers)
function generateEmbedding(text) {
  // Lightweight, fully local bag-of-words embedding.
  // Deterministic and fast, suitable for desktop use.
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const embedding = {};
  words.forEach(word => {
    embedding[word] = (embedding[word] || 0) + 1;
  });
  return embedding;
}

// Semantic similarity using sparse bag-of-words embeddings
function semanticSimilarity(embedding1, embedding2) {
  const words1 = new Set(Object.keys(embedding1));
  const words2 = new Set(Object.keys(embedding2));
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  
  if (union.size === 0) return 0;
  return intersection.size / union.size; // Jaccard similarity
}

// Compute embedding for an item from its searchable fields
function computeItemEmbedding(item) {
  let text = '';
  
  if (item.type === 'text') {
    text = item.content || '';
  } else if (item.type === 'link') {
    text = `${item.title} ${item.metadata?.url || ''} ${item.metadata?.pageTitle || ''}`;
  } else {
    // For files/images, use title + filename + any extracted text (OCR or document text)
    text = `${item.title} ${item.metadata?.filename || ''} ${item.metadata?.extractedText || ''}`;
  }
  
  return generateEmbedding(text);
}

// ===== LOCAL OLLAMA HELPERS (LLM & VISION) =====

/**
 * Generic helper to call Ollama's /api/chat endpoint with streaming disabled.
 * Returns parsed JSON response or throws on hard failure.
 */
function callOllamaChat(model, messages, options = {}) {
  return new Promise((resolve, reject) => {
    if (!OLLAMA_ENABLED) {
      return reject(new Error("Ollama integration disabled"));
    }

    const body = JSON.stringify({
      model,
      stream: false,
      messages,
      ...options,
    });

    const req = http.request(
      {
        host: OLLAMA_HOST,
        port: OLLAMA_PORT,
        path: "/api/chat",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk.toString();
        });
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            resolve(json);
    } catch (err) {
            reject(err);
          }
        });
      }
    );

    req.on("error", (err) => {
      reject(err);
    });

    req.write(body);
    req.end();
  });
}

/**
 * Enrich a text item with LLM metadata (title, keywords, brief description).
 * Non-blocking: caller should use scheduleLLMEnrichment.
 */
async function enrichTextItemWithLLM(item) {
  try {
    if (!item.content || !item.content.trim()) return item;

    const prompt = [
      {
        role: "system",
        content:
          "You are a local retrieval helper. Given some user text, you MUST respond with a single JSON object only, no prose. The JSON format is: {\"title\": string, \"keywords\": [string], \"summary\": string}. Do not invent facts. Keep title short and factual, summary under 30 words.",
      },
      {
        role: "user",
        content: item.content,
      },
    ];

    const response = await callOllamaChat(OLLAMA_LLM_MODEL, prompt);
    const rawText =
      response &&
      response.message &&
      typeof response.message.content === "string"
        ? response.message.content
        : Array.isArray(response.message?.content)
        ? response.message.content.map((c) => c.text || "").join("")
        : "";

    if (!rawText) return item;

    // Extract JSON from the LLM output
    let jsonStart = rawText.indexOf("{");
    let jsonEnd = rawText.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) return item;

    const jsonSlice = rawText.slice(jsonStart, jsonEnd + 1);
    let parsed;
    try {
      parsed = JSON.parse(jsonSlice);
    } catch {
      return item;
    }

    const llmTitle = typeof parsed.title === "string" ? parsed.title : null;
    const llmKeywords = Array.isArray(parsed.keywords)
      ? parsed.keywords.filter((k) => typeof k === "string")
      : [];
    const llmSummary = typeof parsed.summary === "string" ? parsed.summary : null;

    item.metadata = {
      ...(item.metadata || {}),
      llmTitle,
      llmKeywords,
      llmSummary,
    };

    const extraTextParts = [
      llmTitle || "",
      llmSummary || "",
      llmKeywords.join(" "),
    ].filter(Boolean);

    if (extraTextParts.length > 0) {
      const combined = `${item.searchableText || ""} ${extraTextParts.join(
        " "
      )}`.trim();
      item.searchableText = combined.toLowerCase();
    }

    return item;
  } catch (err) {
    console.error("Failed to enrich text item with LLM:", err);
    return item;
  }
}

/**
 * Enrich an image item with vision model metadata (caption + keywords).
 */
async function enrichImageItemWithVision(item) {
  try {
    if (!item.storagePath) return item;

    const filePath = item.storagePath;
    if (!fs.existsSync(filePath)) return item;

    const imageBuffer = fs.readFileSync(filePath);
    const imageBase64 = imageBuffer.toString("base64");

    const prompt = [
      {
        role: "system",
        content:
          "You are a local vision helper. Given an image, you MUST respond with a single JSON object only, no prose. The JSON format is: {\"caption\": string, \"keywords\": [string]}. Caption should be a short description. Keywords should list main objects, text, and concepts.",
      },
      {
        role: "user",
        content: "Describe this image briefly and list key objects and text.",
      },
    ];

    const response = await callOllamaChat(OLLAMA_VISION_MODEL, prompt, {
      images: [imageBase64],
    });

    const rawText =
      response &&
      response.message &&
      typeof response.message.content === "string"
        ? response.message.content
        : Array.isArray(response.message?.content)
        ? response.message.content.map((c) => c.text || "").join("")
        : "";

    if (!rawText) return item;

    let jsonStart = rawText.indexOf("{");
    let jsonEnd = rawText.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) return item;

    const jsonSlice = rawText.slice(jsonStart, jsonEnd + 1);
    let parsed;
    try {
      parsed = JSON.parse(jsonSlice);
    } catch {
      return item;
    }

    const visionCaption =
      typeof parsed.caption === "string" ? parsed.caption : null;
    const visionKeywords = Array.isArray(parsed.keywords)
      ? parsed.keywords.filter((k) => typeof k === "string")
      : [];

    item.metadata = {
      ...(item.metadata || {}),
      visionCaption,
      visionKeywords,
    };

    const extraTextParts = [
      visionCaption || "",
      visionKeywords.join(" "),
    ].filter(Boolean);

    if (extraTextParts.length > 0) {
      const combined = `${item.searchableText || ""} ${extraTextParts.join(
        " "
      )}`.trim();
      item.searchableText = combined.toLowerCase();
    }

    return item;
  } catch (err) {
    console.error("Failed to enrich image item with vision model:", err);
    return item;
  }
}

/**
 * Interpret a natural language search query using the local LLM.
 * Returns an intent object compatible with the existing smartSearch logic, or null on failure.
 */
async function interpretSearchIntentWithLLM(query) {
  try {
    const messages = [
      {
        role: "system",
        content:
          "You are a local search intent parser for a personal vault. " +
          "Your ONLY job is to translate the user's query into a JSON object; DO NOT answer the question. " +
          "The JSON format is exactly: " +
          "{ \"contentType\": \"image|note|link|file|any\", " +
          "\"timeRange\": { \"from\": \"ISO8601 or null\", \"to\": \"ISO8601 or null\" } | null, " +
          "\"mustKeywords\": [string], " +
          "\"shouldKeywords\": [string] }. " +
          "contentType is your best guess of what they are looking for; use \"any\" if unclear. " +
          "timeRange is null unless they clearly reference a time (today, yesterday, last week, specific date). " +
          "mustKeywords are terms that must match; shouldKeywords are helpful extra terms. " +
          "Respond with ONLY that JSON, no prose.",
      },
      {
        role: "user",
        content: query,
      },
    ];

    const response = await callOllamaChat(OLLAMA_LLM_MODEL, messages, {
      options: { temperature: 0 },
    });

    const rawText =
      response &&
      response.message &&
      typeof response.message.content === "string"
        ? response.message.content
        : Array.isArray(response.message?.content)
        ? response.message.content.map((c) => c.text || "").join("")
        : "";

    if (!rawText) return null;

    let jsonStart = rawText.indexOf("{");
    let jsonEnd = rawText.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) return null;

    const jsonSlice = rawText.slice(jsonStart, jsonEnd + 1);
    let parsed;
    try {
      parsed = JSON.parse(jsonSlice);
    } catch {
      return null;
    }

    // Normalize content type
    const rawType =
      typeof parsed.contentType === "string"
        ? parsed.contentType.toLowerCase()
        : "any";
    let contentType = null;
    if (["image", "images", "picture", "photo", "screenshot"].includes(rawType)) {
      contentType = "image";
    } else if (["note", "notes", "text", "prompt"].includes(rawType)) {
      contentType = "note";
    } else if (["link", "url", "website"].includes(rawType)) {
      contentType = "link";
    } else if (["file", "document", "pdf", "doc"].includes(rawType)) {
      contentType = "file";
    } else {
      contentType = null; // treat "any" / unknown as no explicit type filter
    }

    // Time range → timeFilter
    let timeFilter = null;
    let timePhrase = null;
    if (parsed.timeRange && (parsed.timeRange.from || parsed.timeRange.to)) {
      const from = parsed.timeRange.from ? new Date(parsed.timeRange.from) : null;
      const to = parsed.timeRange.to ? new Date(parsed.timeRange.to) : null;
      if (from && !isNaN(from.getTime()) && to && !isNaN(to.getTime())) {
        timeFilter = { start: from, end: to };
        timePhrase = "specified range";
      }
    }

    const mustKeywords = Array.isArray(parsed.mustKeywords)
      ? parsed.mustKeywords.filter((k) => typeof k === "string")
      : [];
    const shouldKeywords = Array.isArray(parsed.shouldKeywords)
      ? parsed.shouldKeywords.filter((k) => typeof k === "string")
      : [];

    const allKeywords = [...mustKeywords, ...shouldKeywords]
      .map((k) => k.toLowerCase())
      .join(" ")
      .trim();

    return {
      timeFilter,
      timePhrase,
      contentType,
      topicKeywords: allKeywords || null,
      originalQuery: query,
    };
  } catch (err) {
    console.error("Failed to interpret search intent with LLM:", err);
    return null;
  }
}

/**
 * Resolve search intent.
 * For performance, we use the fast rule-based parser only.
 * LLM is reserved for background enrichment, not per-keystroke search.
 */
async function getSearchIntent(query) {
  return parseSearchIntent(query);
}

// Load embeddings file without recomputing.
// Embeddings are computed at save / metadata-extraction time, never during search.
function loadEmbeddingsFile() {
  ensureVaultDir();
  if (!fs.existsSync(EMBEDDINGS_FILE)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(EMBEDDINGS_FILE, "utf-8"));
  } catch (err) {
    console.error("Failed to load embeddings:", err);
    return {};
  }
}

// Persist embeddings to disk
function saveEmbeddingsFile(embeddings) {
  ensureVaultDir();
  try {
    fs.writeFileSync(EMBEDDINGS_FILE, JSON.stringify(embeddings, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save embeddings:", err);
  }
}

// Load embeddings with backward compatibility for older flat-format files
function getItemEmbeddings() {
  const raw = loadEmbeddingsFile();

  // Support legacy shape where value was the vector directly
  const normalized = {};
  for (const [id, value] of Object.entries(raw)) {
    if (value && value.vector) {
      normalized[id] = value;
    } else {
      // Legacy: wrap plain vector and keep metadata minimal
      normalized[id] = {
        vector: value || {},
        metadata: {}
      };
    }
  }

  return normalized;
}

// Update embeddings for a single item (called at save time and after metadata/ocr extraction)
function updateItemEmbedding(item) {
  const embeddings = getItemEmbeddings();
  embeddings[item.id] = {
    vector: computeItemEmbedding(item),
    metadata: {
      createdAt: item.metadata?.createdAt || null,
      source: item.metadata?.source || "overlay",
      type: item.type,
      category: item.category,
      storagePath: item.storagePath || null
    }
  };

  saveEmbeddingsFile(embeddings);
}

// ===== SMART SEARCH FUNCTION =====

/**
 * Smart semantic search with intent parsing (LLM-first, rule-based fallback)
 */
async function smartSearch(query) {
  console.log("[SEARCH] Starting smart search for:", query);
  
  const intent = await getSearchIntent(query);
  console.log("[SEARCH] Parsed intent:", intent);
  
  const items = loadItems();
  console.log("[SEARCH] Total items in storage:", items.length);
  
  if (items.length === 0) {
    console.log("[SEARCH] No items found in storage");
    return {
      results: [],
      explanation: "No items in vault",
      intent,
      totalItems: 0,
      filteredCount: 0
    };
  }
  
  const embeddings = getItemEmbeddings();
  console.log("[SEARCH] Loaded embeddings for:", Object.keys(embeddings).length, "items");

  // One-time migration: if we have items but no embeddings yet, backfill vectors
  // for all items so semantic search becomes useful for existing vault content.
  let effectiveEmbeddings = embeddings;
  if (items.length > 0 && Object.keys(embeddings).length === 0) {
    console.log("[SEARCH] No embeddings found; running one-time backfill for existing items");
    const backfilled = {};
    items.forEach((item) => {
      backfilled[item.id] = {
        vector: computeItemEmbedding(item),
        metadata: {
          createdAt: (item.metadata && item.metadata.createdAt) || item.timestamp || null,
          source: (item.metadata && item.metadata.source) || "overlay",
          type: item.type,
          category: item.category,
          storagePath: item.storagePath || null,
        },
      };
    });
    saveEmbeddingsFile(backfilled);
    effectiveEmbeddings = backfilled;
    console.log("[SEARCH] Backfill complete for", Object.keys(backfilled).length, "items");
  }
  
  const queryEmbedding = generateEmbedding(intent.topicKeywords || query);
  
  // Filter items based on intent signals
  let filteredItems = items.filter(item => {
    // Time filter
    if (intent.timeFilter) {
      const createdAtStr = (item.metadata && item.metadata.createdAt) || item.timestamp || null;
      if (!createdAtStr) {
        // If we don't know when it was created, treat as not matching a time-constrained query
        return false;
      }
      const itemDate = new Date(createdAtStr);
      if (isNaN(itemDate.getTime())) {
        return false;
      }
      if (itemDate < intent.timeFilter.start || itemDate > intent.timeFilter.end) {
        return false;
      }
    }
    
    // Content type filter
    if (intent.contentType) {
      const type = item.type;
      const category = item.category;

      if (intent.contentType === 'image') {
        // Be generous: accept legacy items where type==="file" but category==="images"
        if (!(type === 'image' || category === 'images')) return false;
      } else if (intent.contentType === 'note') {
        // Treat both "text" type and note-like categories as notes
        if (!(type === 'text' || category === 'notes' || category === 'ideas')) return false;
      } else if (intent.contentType === 'link') {
        if (type !== 'link' && category !== 'links') return false;
      } else if (intent.contentType === 'file') {
        // Any non-link, non-pure-text stored file (documents, images, videos)
        if (!['image', 'file'].includes(type) && !['documents', 'images', 'videos', 'csv'].includes(category)) {
          return false;
        }
      }
    }
    
    return true;
  });
  
  console.log("[SEARCH] Items after filtering:", filteredItems.length);
  
  // Score and rank results
  const scoredItems = filteredItems.map(item => {
    const entry = effectiveEmbeddings[item.id];
    const itemEmbedding = entry && entry.vector ? entry.vector : {};
    const semanticScore = semanticSimilarity(queryEmbedding, itemEmbedding);
    
    // Recency score (newer items get higher score). Fallback to timestamp for legacy items.
    const createdAtStr = (item.metadata && item.metadata.createdAt) || item.timestamp || null;
    let recencyScore = 0;
    if (createdAtStr) {
      const createdAtDate = new Date(createdAtStr);
      if (!isNaN(createdAtDate.getTime())) {
        const ageInDays = (Date.now() - createdAtDate.getTime()) / (1000 * 60 * 60 * 24);
        recencyScore = Math.max(0, 1 - ageInDays / 30); // Decay over 30 days
      }
    }
    
    // Type relevance score
    let typeScore = 1;
    if (intent.contentType) {
      if (intent.contentType === 'image' && item.type === 'image') typeScore = 2;
      if (intent.contentType === 'note' && item.type === 'text') typeScore = 2;
      if (intent.contentType === 'link' && item.type === 'link') typeScore = 2;
      if (intent.contentType === 'file' && ['image', 'file'].includes(item.type)) typeScore = 2;
    }
    
    // Hybrid scoring: semantic similarity + recency + type relevance
    const finalScore = (semanticScore * 0.6) + (recencyScore * 0.3) + (typeScore * 0.1);
    
    return {
      ...item,
      _searchScore: finalScore,
      _semanticScore: semanticScore,
      _recencyScore: recencyScore,
      _typeScore: typeScore
    };
  });
  
  // Sort by score and return top results
  const results = scoredItems
    .sort((a, b) => b._searchScore - a._searchScore)
    .slice(0, 20); // Limit to top 20 results
  
  console.log("[SEARCH] Final results:", results.length);
  
  // Generate explanation for UI
  let explanation = '';
  if (intent.contentType && intent.timeFilter) {
    explanation = `Showing ${intent.contentType}s from ${intent.timePhrase || 'recent period'}`;
  } else if (intent.contentType) {
    explanation = `Showing ${intent.contentType}s`;
  } else if (intent.timeFilter) {
    explanation = `Showing items from ${intent.timePhrase || 'recent period'}`;
  } else if (intent.topicKeywords) {
    explanation = `Showing results related to "${intent.topicKeywords}"`;
  } else {
    explanation = `Showing all items`;
  }
  
  return {
    results,
    explanation,
    intent,
    totalItems: items.length,
    filteredCount: filteredItems.length
  };
}

// Unified item schema: everything is an item with type-specific fields
// {
//   id: string,
//   type: "text" | "image" | "file" | "link",
//   title: string,           // AI-generated or extracted title
//   category: string,        // idea, link, code, note, images, documents, etc.
//   content?: string,        // For text items only
//   storagePath?: string,    // For files/images only
//   searchableText: string,  // For search across all types
//   metadata: {
//     size?: number,
//     mimeType?: string,
//     filename?: string,
//     thumbnail?: string,    // Relative path to thumbnail
//     extractedText?: string, // OCR or extracted text for search
//     url?: string,         // For links
//     pageTitle?: string,    // For links
//     createdAt: string,
//     source: "overlay"     // Always overlay for now
//   }
// }

// Supported categories (clean, user-friendly)
const CATEGORIES = {
  ideas: { name: "Ideas", icon: "💡" },
  links: { name: "Links", icon: "🔗" },
  code: { name: "Code", icon: "💻" },
  notes: { name: "Notes", icon: "📝" },
  images: { name: "Images", icon: "🖼️" },
  documents: { name: "Documents", icon: "📄" },
  videos: { name: "Videos", icon: "🎥" },
  csv: { name: "Data", icon: "📊" }
};

// File type to category mapping
const FILE_TYPE_MAP = {
  // Images
  ".png": "images", ".jpg": "images", ".jpeg": "images", ".gif": "images",
  ".webp": "images", ".bmp": "images", ".svg": "images", ".ico": "images",
  
  // Documents
  ".pdf": "documents", ".doc": "documents", ".docx": "documents",
  ".txt": "documents", ".rtf": "documents", ".tex": "documents",
  
  // Videos
  ".mp4": "videos", ".mkv": "videos", ".webm": "videos",
  ".avi": "videos", ".mov": "videos",
  
  // Data
  ".csv": "csv", ".tsv": "csv"
};

// Rejected file types (security and UX)
const REJECTED_TYPES = [
  // Audio
  ".mp3", ".wav", ".flac", ".aac", ".wma", ".m4a", ".ogg", ".opus",
  // Executables
  ".exe", ".msi", ".bat", ".cmd", ".com", ".scr", ".vbs", ".ps1",
  ".apk", ".app", ".deb", ".rpm",
  // Archives
  ".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".iso", ".dmg",
  // System
  ".sys", ".dll", ".so", ".dylib", ".icns", ".jar", ".class", ".pyc"
];

// ===== VALIDATION FUNCTIONS =====

/**
 * Check if a file extension is rejected
 */
function isRejectedFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return REJECTED_TYPES.includes(ext);
}

/**
 * Get rejection reason for a file
 */
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

/**
 * Detect category from file extension
 */
function detectCategoryFromFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return FILE_TYPE_MAP[ext] || "documents";
}

/**
 * Detect if text content is a URL
 */
function isURLContent(text) {
  const URL_REGEX = /^(https?:\/\/|www\.)\S+/i;
  return URL_REGEX.test(text.trim());
}

/**
 * Detect category from text content
 */
function detectCategoryFromText(text) {
  const trimmed = text.trim();
  if (isURLContent(trimmed)) {
    return "links";
  }

  // Simple heuristics for text categorization
  const lower = trimmed.toLowerCase();

  // Strong code keywords across languages
  const codeKeywords = [
    "function ",
    "const ",
    "let ",
    "var ",
    "class ",
    "import ",
    "export ",
    "require(",
    "ipcmain.",
    "ipcrenderer.",
    "async ",
    "await ",
    "public ",
    "private ",
    "def ",
    "#include",
  ];
  if (codeKeywords.some((kw) => lower.includes(kw))) {
    return "code";
  }

  // Structural signals: many semicolons/braces/arrows typically mean code
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

/**
 * Generate a title for text content (AI-like summary)
 */
function generateTextTitle(text) {
  const trimmed = text.trim();
  if (isURLContent(trimmed)) {
    return "Link: " + trimmed.substring(0, 50) + (trimmed.length > 50 ? "..." : "");
  }
  
  // Take first line or first 50 chars
  const firstLine = trimmed.split('\n')[0].trim();
  return firstLine.length > 50 ? firstLine.substring(0, 47) + "..." : firstLine || "Untitled";
}

// ===== STORAGE FUNCTIONS =====
function ensureVaultDir() {
  if (!fs.existsSync(VAULT_DIR)) {
    fs.mkdirSync(VAULT_DIR, { recursive: true });
  }
}

// Load all items from storage
function loadItems() {
  ensureVaultDir();
  if (!fs.existsSync(ITEMS_FILE)) {
    return [];
  }
  try {
    const data = fs.readFileSync(ITEMS_FILE, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    console.error("Failed to load items:", err);
    return [];
  }
}

// Save all items to storage
function saveItems(items) {
  ensureVaultDir();
  try {
    fs.writeFileSync(ITEMS_FILE, JSON.stringify(items, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save items:", err);
  }
}

// ===== METADATA & THUMBNAIL FUNCTIONS =====

/**
 * Ensure thumbnails directory exists
 */
function ensureThumbnailsDir() {
  const thumbDir = path.join(VAULT_DIR, "thumbnails");
  if (!fs.existsSync(thumbDir)) {
    fs.mkdirSync(thumbDir, { recursive: true });
  }
  return thumbDir;
}

/**
 * Get file size in bytes
 */
function getFileSize(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.size;
  } catch (err) {
    console.error("Failed to get file size:", err);
    return 0;
  }
}

/**
 * Generate image thumbnail using sharp
 * Returns promise that resolves to relative path to thumbnail, or null if generation fails
 */
async function generateImageThumbnail(sourceFilePath, fileHash) {
  try {
    const sharp = require("sharp");
    const thumbDir = ensureThumbnailsDir();
    const thumbPath = path.join(thumbDir, `${fileHash}-thumb.webp`);
    
    // Don't regenerate if already exists
    if (fs.existsSync(thumbPath)) {
      return `thumbnails/${fileHash}-thumb.webp`;
    }
    
    // Generate 100x100 webp thumbnail asynchronously
    await sharp(sourceFilePath)
      .resize(100, 100, {
        fit: "cover",
        position: "center",
        withoutEnlargement: true,
      })
      .webp({ quality: 60 })
      .toFile(thumbPath);
    
    console.log("Generated thumbnail:", thumbPath);
    return `thumbnails/${fileHash}-thumb.webp`;
  } catch (err) {
    console.error("Failed to generate image thumbnail:", err);
    return null;
  }
}

/**
 * Generate first-page thumbnail for PDFs using sharp (when supported).
 */
async function generatePdfThumbnail(sourceFilePath, fileHash) {
  try {
    const sharp = require("sharp");
    const thumbDir = ensureThumbnailsDir();
    const thumbPath = path.join(thumbDir, `${fileHash}-pdf-thumb.webp`);

    if (fs.existsSync(thumbPath)) {
      return `thumbnails/${fileHash}-pdf-thumb.webp`;
    }

    await sharp(sourceFilePath, { density: 110 })
      .resize(400, 250, {
        fit: "cover",
        position: "center",
        withoutEnlargement: true,
      })
      .webp({ quality: 70 })
      .toFile(thumbPath);

    console.log("Generated PDF cover thumbnail:", thumbPath);
    return `thumbnails/${fileHash}-pdf-thumb.webp`;
  } catch (err) {
    console.error("Failed to generate PDF thumbnail:", err);
    return null;
  }
}

/**
 * Extract PDF metadata (page count, etc.)
 */
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
      // Full extracted text for semantic search (may be large; kept local only)
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

/**
 * OCR for images using tesseract.js (fully local when language data is bundled).
 * Returns extracted text, or empty string on failure.
 */
async function ocrImageText(sourceFilePath) {
  try {
    // Lazy require so startup stays fast; runs only on image ingestion.
    const Tesseract = require("tesseract.js");
    const result = await Tesseract.recognize(sourceFilePath, "eng", {
      logger: () => {} // keep deterministic and quiet
    });
    return (result && result.data && result.data.text) ? result.data.text : "";
  } catch (err) {
    console.error("Failed to OCR image:", err);
    return "";
  }
}

/**
 * Generate a short deterministic caption for an image from filename + OCR text.
 * This is metadata only, not a free-form answer.
 */
function generateImageCaption(filename, ocrText) {
  const baseName = (filename || "").replace(/\.[^.]+$/, "");
  const words = (ocrText || "").trim().split(/\s+/).filter(Boolean);
  const snippet = words.slice(0, 6).join(" ");

  if (snippet) {
    return `${baseName ? baseName + " – " : ""}${snippet}${words.length > 6 ? "…" : ""}`;
  }

  return baseName || "Image";
}

/**
 * Extract metadata for a file (asynchronously)
 * Generates thumbnails and extracts type-specific metadata
 */
async function extractFileMetadata(item, sourceFilePath) {
  try {
    const category = item.category;
    const fileHash = item.hash;
    const filename =
      (item.metadata && item.metadata.filename) || item.title || "";
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
      // OCR text for images for semantic search
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

    // Update item with metadata
    item.metadata = {
      ...(item.metadata || {}),
      ...metadata,
    };

    // Expand searchableText with any extracted text/caption for better embeddings
    const extraSearchTextParts = [
      metadata.extractedText || "",
      metadata.caption || "",
      metadata.title || ""
    ].filter(Boolean);

    if (extraSearchTextParts.length > 0) {
      const combined = `${item.searchableText || ""} ${extraSearchTextParts.join(" ")}`.trim();
      item.searchableText = combined.toLowerCase();
    }

    return item;
  } catch (err) {
    console.error("Error extracting metadata:", err);
    return item;
  }
}

/**
 * Schedule async metadata extraction without blocking
 * Updates items.json when complete
 */
function scheduleMetadataExtraction(item, sourceFilePath) {
  // Use setImmediate to defer to next iteration of event loop
  setImmediate(async () => {
    try {
      const updatedItem = await extractFileMetadata(item, sourceFilePath);
      const items = loadItems();
      const itemIndex = items.findIndex(i => i.id === updatedItem.id);
      if (itemIndex !== -1) {
        items[itemIndex] = updatedItem;
        saveItems(items);
        console.log("Updated item metadata:", updatedItem.id);
        // Refresh embedding once richer metadata / text is available
        updateItemEmbedding(updatedItem);
      }
    } catch (err) {
      console.error("Failed to schedule metadata extraction:", err);
    }
  });
}

/**
 * Schedule LLM / vision enrichment for an item (non-blocking).
 * This runs in the background and updates items.json + embeddings if successful.
 */
function scheduleLLMEnrichment(item) {
  if (!OLLAMA_ENABLED) return;

  setImmediate(async () => {
    try {
      let enriched = item;
      if (item.type === "text") {
        enriched = await enrichTextItemWithLLM({ ...item });
      } else if (item.type === "image") {
        enriched = await enrichImageItemWithVision({ ...item });
      }

      // Only update storage if something actually changed
      if (enriched && enriched.id === item.id) {
        const items = loadItems();
        const idx = items.findIndex((i) => i.id === enriched.id);
        if (idx !== -1) {
          items[idx] = enriched;
          saveItems(items);
          updateItemEmbedding(enriched);
          console.log("[LLM] Enriched item with id:", enriched.id);
        }
      }
    } catch (err) {
      console.error("Failed to schedule LLM enrichment:", err);
    }
  });
}

/**
 * Get MIME type from file extension
 */
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

// ===== UNIFIED ITEM CREATION FUNCTIONS =====

/**
 * Create a unified text item
 */
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

/**
 * Create a unified file item (images, documents, videos, etc.)
 */
function createFileItem(filePath) {
  // Validate file path
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

  const item = {
    id: uuidv4(),
    type: fileType,
    title: fileName,
    category: category,
    hash: fileHash,
    storagePath: vaultFilePath,
    searchableText: fileName.toLowerCase(),
    metadata: {
      size: fileContent.length,
      mimeType: getMimeType(filePath),
      filename: fileName,
      createdAt: new Date().toISOString(),
      source: "overlay"
    }
  };

  // Schedule metadata extraction (thumbnails, OCR, etc.)
  scheduleMetadataExtraction(item, filePath);
  
  // Initial embedding from filename/title; will be refreshed after metadata/OCR.
  updateItemEmbedding(item);
  return item;
}

/**
 * Create a unified link item (from URL text)
 */
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

/**
 * Add any unified item to storage
 */
function addItem(item) {
  const items = loadItems();
  items.push(item);
  saveItems(items);
  
  // Update embeddings for the new item
  updateItemEmbedding(item);

  // Fire-and-forget LLM / vision enrichment in the background
  scheduleLLMEnrichment(item);
  
  return item;
}

// ===== LEGACY COMPATIBILITY FUNCTIONS =====

// Add a text item (legacy compatibility)
function addTextItem(text) {
  const item = createTextItem(text);
  return addItem(item);
}

// Add a file item (legacy compatibility)
function addFileItem(filePath) {
  const item = createFileItem(filePath);
  return addItem(item);
}

// ===== TEST DATA FUNCTIONS =====

// Create test items for development
function createTestItems() {
  console.log("[STORAGE] Creating test items...");
  
  // Test text items
  const testTexts = [
    { text: "Electron shortcut keys for overlay functionality", type: "code" },
    { text: "Screenshot of the error message from yesterday", type: "ideas" },
    { text: "Meeting notes about the new feature implementation", type: "notes" },
    { text: "Link to the documentation: https://electronjs.org/docs", type: "links" },
    { text: "Bug report: overlay not closing on key release", type: "ideas" }
  ];
  
  testTexts.forEach(({ text, type }) => {
    try {
      const item = createTextItem(text);
      item.category = type;
      addItem(item);
      console.log("[STORAGE] Created test item:", item.title);
    } catch (err) {
      console.error("[STORAGE] Failed to create test item:", err);
    }
  });
  
  console.log("[STORAGE] Test items created successfully");
}

// Get all items
function getItems() {
  return loadItems();
}

// Delete an item
function deleteItem(id) {
  let items = loadItems();
  const item = items.find(i => i.id === id);
  if (item && item.type === "file") {
    try {
      fs.unlinkSync(item.path);
    } catch (err) {
      console.error("Failed to delete file:", err);
    }
  }
  items = items.filter(i => i.id !== id);
  saveItems(items);
}

module.exports = {
  // Legacy functions (for backward compatibility)
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
};
