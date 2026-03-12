#!/usr/bin/env node
/**
 * vault-sync.js
 * Bidirectional sync between /data/vault filesystem and CouchDB (LiveSync format).
 * Runs as a background daemon alongside the openclaw gateway.
 *
 * Handles Obsidian LiveSync's chunked document format:
 *   - Small files: content stored directly in doc.data
 *   - Large files: content split across h:xxx "leaf" docs, referenced by doc.children
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const chokidar = require('chokidar');
const axios = require('axios');

const VAULT_PATH = process.env.VAULT_PATH || '/data/vault';
const COUCHDB_USER = process.env.COUCHDB_USER || 'admin';
const COUCHDB_PASSWORD = process.env.COUCHDB_PASSWORD || '';
const COUCHDB_HOST = process.env.COUCHDB_HOST || 'localhost:5984';
const LIVESYNC_DB = process.env.LIVESYNC_DB || 'hugginvault';

// LiveSync splits files larger than this into chunks
const CHUNK_SIZE = 250000; // ~250 KB, matches LiveSync default

// Build base CouchDB URL (no credentials — auth via axios config).
function buildBaseUrl() {
  const raw = COUCHDB_HOST;
  let protocol, host;
  if (raw.startsWith('https://')) {
    protocol = 'https';
    host = raw.slice(8).replace(/\/$/, '');
  } else if (raw.startsWith('http://')) {
    protocol = 'http';
    host = raw.slice(7).replace(/\/$/, '');
  } else {
    protocol = raw.includes('.up.railway.app') ? 'https' : 'http';
    host = raw;
  }
  return `${protocol}://${host}`;
}

const SERVER_URL = buildBaseUrl();
const DB_URL = `${SERVER_URL}/${LIVESYNC_DB}`;
const AUTH = { username: COUCHDB_USER, password: COUCHDB_PASSWORD };
const IGNORED = /(^|[/\\])(\.|_couch|node_modules)/;
const TEXT_EXTENSIONS = new Set(['.md', '.txt', '.json', '.yaml', '.yml', '.css', '.js', '.ts', '.html', '.xml', '.csv']);

// Tracks files recently written by CouchDB pull — suppresses chokidar -> push loop
const recentPulls = new Map();
const PULL_GUARD_MS = 2000;

// Tracks revs we just pushed — suppresses CouchDB changes -> pull loop
const recentPushRevs = new Set();

// Debounce map to avoid rapid-fire writes
const debounceMap = new Map();

function debounce(key, fn, ms = 500) {
  if (debounceMap.has(key)) clearTimeout(debounceMap.get(key));
  debounceMap.set(key, setTimeout(() => { debounceMap.delete(key); fn(); }, ms));
}

function isText(filePath) {
  return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

// LiveSync stores chunks as h:xxx docs and metadata as obsydian_livesync_*.
function isLiveSyncInternal(id) {
  return id.startsWith('h:') || id.startsWith('obsydian_livesync');
}

// Check if a doc is a vault file (not a LiveSync internal/design doc)
function isVaultDoc(doc) {
  if (!doc || !doc._id) return false;
  if (doc._id.startsWith('_')) return false;
  if (isLiveSyncInternal(doc._id)) return false;
  if (doc.deleted) return false;
  return true;
}

async function waitForCouchDB(retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      await axios.get(`${SERVER_URL}/_up`, { auth: AUTH });
      console.log('[vault-sync] CouchDB is ready');
      return true;
    } catch (err) {
      console.log(`[vault-sync] Waiting for CouchDB... (${i + 1}/${retries}) -- ${err.message}`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  console.warn('[vault-sync] CouchDB not reachable after retries -- sync disabled');
  return false;
}

// ---------------------------------------------------------------------------
// Reading: reassemble chunked LiveSync documents
// ---------------------------------------------------------------------------

/**
 * Fetch a single leaf/chunk document by ID.
 */
async function fetchChunk(chunkId) {
  try {
    const { data } = await axios.get(`${DB_URL}/${encodeURIComponent(chunkId)}`, { auth: AUTH });
    return data.data || '';
  } catch (err) {
    console.error(`[vault-sync] Failed to fetch chunk ${chunkId}:`, err.message);
    return '';
  }
}

/**
 * Reassemble the full content of a LiveSync document.
 * If the doc has children (chunk references), fetch and concatenate them.
 * Otherwise, use doc.data directly.
 */
async function reassembleContent(doc) {
  const children = doc.children || [];

  if (children.length === 0) {
    // No chunks — content is stored directly in doc.data
    return doc.data || '';
  }

  // Chunked document: fetch each leaf and concatenate
  const parts = [];
  for (const chunkId of children) {
    const chunkData = await fetchChunk(chunkId);
    parts.push(chunkData);
  }
  return parts.join('');
}

/**
 * Write a CouchDB doc to the local filesystem, handling LiveSync chunks.
 */
async function writeFileFromDoc(doc) {
  if (!isVaultDoc(doc)) return;

  const filePath = path.join(VAULT_PATH, doc._id);
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    const rawContent = await reassembleContent(doc);

    let content;
    if (doc.datatype === 'base64') {
      content = Buffer.from(rawContent, 'base64');
    } else {
      content = rawContent;
    }

    // Mark this file as "just pulled" so chokidar ignores the write
    recentPulls.set(filePath, Date.now());
    await fs.writeFile(filePath, content);
    setTimeout(() => recentPulls.delete(filePath), PULL_GUARD_MS);

    const chunkInfo = (doc.children?.length) ? ` (${doc.children.length} chunks)` : '';
    console.log(`[vault-sync] \u2193 pulled: ${doc._id}${chunkInfo}`);
  } catch (err) {
    console.error(`[vault-sync] Error writing ${doc._id}:`, err.message);
  }
}

// ---------------------------------------------------------------------------
// Writing: create LiveSync-compatible documents with chunking
// ---------------------------------------------------------------------------

/**
 * Generate a LiveSync-compatible chunk ID.
 * LiveSync uses h:<hash> where hash is derived from the content.
 */
function makeChunkId(content) {
  const hash = crypto.createHash('sha1').update(content).digest('hex').slice(0, 32);
  return `h:${hash}`;
}

/**
 * Split content into chunks and store them as leaf documents.
 * Returns an array of chunk IDs (for the parent doc's children field).
 */
async function writeChunks(contentStr) {
  const chunkIds = [];
  for (let i = 0; i < contentStr.length; i += CHUNK_SIZE) {
    const piece = contentStr.slice(i, i + CHUNK_SIZE);
    const chunkId = makeChunkId(piece);
    chunkIds.push(chunkId);

    try {
      // Check if chunk already exists (content-addressed — same content = same ID)
      let rev;
      try {
        const { data } = await axios.get(`${DB_URL}/${encodeURIComponent(chunkId)}`, { auth: AUTH });
        rev = data._rev;
        // Chunk already exists with same content, skip write
        continue;
      } catch (e) {
        if (e.response?.status !== 404) throw e;
      }

      const chunkDoc = {
        _id: chunkId,
        data: piece,
        type: 'leaf',
      };
      await axios.put(`${DB_URL}/${encodeURIComponent(chunkId)}`, chunkDoc, { auth: AUTH });
    } catch (err) {
      console.error(`[vault-sync] Error writing chunk ${chunkId}:`, err.message);
    }
  }
  return chunkIds;
}

/**
 * Push a local file to CouchDB in LiveSync format.
 * Small files go directly in doc.data; large files are chunked.
 */
async function upsertDoc(relPath, content) {
  const id = relPath.replace(/\\/g, '/');
  try {
    // Fetch existing doc for _rev (conflict avoidance)
    let existingDoc;
    try {
      const { data } = await axios.get(`${DB_URL}/${encodeURIComponent(id)}`, { auth: AUTH });
      existingDoc = data;
    } catch (e) {
      if (e.response?.status !== 404) throw e;
    }

    const isTextFile = isText(relPath);
    const contentStr = isTextFile ? content.toString('utf8') : content.toString('base64');
    const needsChunking = contentStr.length > CHUNK_SIZE;

    let children = [];
    let docData = contentStr;

    if (needsChunking) {
      children = await writeChunks(contentStr);
      docData = ''; // Content is in chunks, not in the main doc
    }

    const doc = {
      _id: id,
      ...(existingDoc?._rev ? { _rev: existingDoc._rev } : {}),
      data: docData,
      datatype: isTextFile ? 'plain' : 'base64',
      type: existingDoc?.type || 'plain',
      mtime: Date.now(),
      ctime: existingDoc?.ctime || Date.now(),
      size: content.length,
      children: children,
      deleted: false,
    };

    const result = await axios.put(`${DB_URL}/${encodeURIComponent(id)}`, doc, { auth: AUTH });
    if (result.data?.rev) {
      recentPushRevs.add(result.data.rev);
      setTimeout(() => recentPushRevs.delete(result.data.rev), 10000);
    }
    const chunkInfo = needsChunking ? ` (${children.length} chunks)` : '';
    console.log(`[vault-sync] \u2191 pushed: ${relPath}${chunkInfo}`);
  } catch (err) {
    console.error(`[vault-sync] Error pushing ${relPath}:`, err.message);
  }
}

async function deleteDoc(relPath) {
  const id = relPath.replace(/\\/g, '/');
  try {
    const { data } = await axios.get(`${DB_URL}/${encodeURIComponent(id)}`, { auth: AUTH });
    await axios.put(`${DB_URL}/${encodeURIComponent(id)}`, { ...data, deleted: true }, { auth: AUTH });
    console.log(`[vault-sync] \u2717 deleted: ${relPath}`);
  } catch (err) {
    if (err.response?.status !== 404) {
      console.error(`[vault-sync] Error deleting ${relPath}:`, err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Initial sync
// ---------------------------------------------------------------------------

async function initialPull() {
  console.log('[vault-sync] Initial pull from CouchDB...');
  try {
    const { data } = await axios.get(`${DB_URL}/_all_docs?include_docs=true`, { auth: AUTH });
    let pulled = 0;
    for (const row of data.rows || []) {
      if (!isVaultDoc(row.doc)) continue;
      await writeFileFromDoc(row.doc);
      pulled++;
    }
    console.log(`[vault-sync] Initial pull complete (${pulled} vault docs)`);
  } catch (err) {
    console.error('[vault-sync] Initial pull failed:', err.message);
  }
}

async function scanDir(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (IGNORED.test(entry.name)) continue;
    if (entry.isDirectory()) {
      files.push(...await scanDir(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

async function initialPush() {
  console.log('[vault-sync] Initial push -- checking for local files missing from CouchDB...');
  try {
    const { data } = await axios.get(`${DB_URL}/_all_docs`, { auth: AUTH });
    const remoteIds = new Set(data.rows.map(r => r.id));
    const localFiles = await scanDir(VAULT_PATH);
    let pushed = 0;
    for (const filePath of localFiles) {
      const relPath = path.relative(VAULT_PATH, filePath);
      const id = relPath.replace(/\\/g, '/');
      if (!remoteIds.has(id)) {
        const buf = await fs.readFile(filePath);
        await upsertDoc(relPath, buf);
        pushed++;
      }
    }
    console.log(`[vault-sync] Initial push complete (${pushed} new files pushed)`);
  } catch (err) {
    console.error('[vault-sync] Initial push failed:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Live change watchers
// ---------------------------------------------------------------------------

async function watchCouchDBChanges(since = 'now') {
  while (true) {
    try {
      const url = `${DB_URL}/_changes?feed=longpoll&include_docs=true&since=${since}&timeout=60000`;
      const { data } = await axios.get(url, { auth: AUTH, timeout: 70000 });
      for (const change of data.results || []) {
        if (change.doc?.deleted) continue;
        // Skip LiveSync internal chunk/metadata docs
        if (isLiveSyncInternal(change.id)) continue;
        // Skip changes we pushed ourselves
        const rev = change.doc?._rev;
        if (rev && recentPushRevs.has(rev)) continue;
        if (change.doc && !change.id.startsWith('_')) {
          await writeFileFromDoc(change.doc);
        }
      }
      since = data.last_seq || since;
    } catch (err) {
      if (err.code !== 'ECONNABORTED') {
        console.error('[vault-sync] CouchDB changes error:', err.message);
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }
}

async function main() {
  console.log(`[vault-sync] Starting -- vault=${VAULT_PATH} db=${LIVESYNC_DB}`);

  const ready = await waitForCouchDB();
  if (!ready) {
    console.warn('[vault-sync] Exiting: CouchDB unavailable');
    process.exit(0); // Non-fatal: gateway still works without sync
  }

  await fs.mkdir(VAULT_PATH, { recursive: true });
  await initialPull();
  await initialPush();

  // Watch filesystem -> push to CouchDB
  const watcher = chokidar.watch(VAULT_PATH, { ignored: IGNORED, persistent: true, ignoreInitial: true });

  watcher
    .on('add', (p) => debounce(p, async () => {
      if (recentPulls.has(p)) return;
      const buf = await fs.readFile(p);
      await upsertDoc(path.relative(VAULT_PATH, p), buf);
    }))
    .on('change', (p) => debounce(p, async () => {
      if (recentPulls.has(p)) return;
      const buf = await fs.readFile(p);
      await upsertDoc(path.relative(VAULT_PATH, p), buf);
    }))
    .on('unlink', (p) => deleteDoc(path.relative(VAULT_PATH, p)));

  console.log('[vault-sync] Watching vault for changes...');

  // Watch CouchDB -> pull to filesystem
  watchCouchDBChanges();
}

main().catch(err => {
  console.error('[vault-sync] Fatal:', err);
  process.exit(1);
});
