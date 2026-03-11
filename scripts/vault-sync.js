#!/usr/bin/env node
/**
 * vault-sync.js
 * Bidirectional sync between /data/vault filesystem and CouchDB (LiveSync format).
 * Runs as a background daemon alongside the openclaw gateway.
 */

const fs = require('fs').promises;
const path = require('path');
const chokidar = require('chokidar');
const axios = require('axios');

const VAULT_PATH = process.env.VAULT_PATH || '/data/vault';
const COUCHDB_USER = process.env.COUCHDB_USER || 'admin';
const COUCHDB_PASSWORD = process.env.COUCHDB_PASSWORD || '';
const COUCHDB_HOST = process.env.COUCHDB_HOST || 'localhost:5984';
const LIVESYNC_DB = process.env.LIVESYNC_DB || 'huginnvault';

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

// Debounce map to avoid rapid-fire writes
const debounceMap = new Map();

function debounce(key, fn, ms = 500) {
  if (debounceMap.has(key)) clearTimeout(debounceMap.get(key));
  debounceMap.set(key, setTimeout(() => { debounceMap.delete(key); fn(); }, ms));
}

function isText(filePath) {
  return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

async function waitForCouchDB(retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      await axios.get(`${SERVER_URL}/_up`, { auth: AUTH });
      console.log('[vault-sync] CouchDB is ready');
      return true;
    } catch (err) {
      console.log(`[vault-sync] Waiting for CouchDB... (${i + 1}/${retries}) — ${err.message}`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  console.warn('[vault-sync] CouchDB not reachable after retries — sync disabled');
  return false;
}

async function upsertDoc(relPath, content) {
  const id = relPath.replace(/\\/g, '/');
  try {
    let rev;
    try {
      const { data } = await axios.get(`${DB_URL}/${encodeURIComponent(id)}`, { auth: AUTH });
      rev = data._rev;
    } catch (e) {
      if (e.response?.status !== 404) throw e;
    }

    const isTextFile = isText(relPath);
    const doc = {
      _id: id,
      ...(rev ? { _rev: rev } : {}),
      data: isTextFile ? content.toString('utf8') : content.toString('base64'),
      datatype: isTextFile ? 'plain' : 'base64',
      type: 'plain',
      mtime: Date.now(),
      ctime: Date.now(),
      size: content.length,
      children: [],
      deleted: false,
    };

    await axios.put(`${DB_URL}/${encodeURIComponent(id)}`, doc, { auth: AUTH });
    console.log(`[vault-sync] ↑ pushed: ${relPath}`);
  } catch (err) {
    console.error(`[vault-sync] Error pushing ${relPath}:`, err.message);
  }
}

async function deleteDoc(relPath) {
  const id = relPath.replace(/\\/g, '/');
  try {
    const { data } = await axios.get(`${DB_URL}/${encodeURIComponent(id)}`, { auth: AUTH });
    await axios.put(`${DB_URL}/${encodeURIComponent(id)}`, { ...data, deleted: true }, { auth: AUTH });
    console.log(`[vault-sync] ✗ deleted: ${relPath}`);
  } catch (err) {
    if (err.response?.status !== 404) {
      console.error(`[vault-sync] Error deleting ${relPath}:`, err.message);
    }
  }
}

async function writeFileFromDoc(doc) {
  if (!doc._id || doc._id.startsWith('_')) return;
  const filePath = path.join(VAULT_PATH, doc._id);
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const content = doc.datatype === 'base64'
      ? Buffer.from(doc.data || '', 'base64')
      : (doc.data || '');
    await fs.writeFile(filePath, content);
    console.log(`[vault-sync] ↓ pulled: ${doc._id}`);
  } catch (err) {
    console.error(`[vault-sync] Error writing ${doc._id}:`, err.message);
  }
}

async function initialPull() {
  console.log('[vault-sync] Initial pull from CouchDB...');
  try {
    const { data } = await axios.get(`${DB_URL}/_all_docs?include_docs=true`, { auth: AUTH });
    for (const row of data.rows || []) {
      const doc = row.doc;
      if (!doc || doc.deleted || doc._id.startsWith('_')) continue;
      await writeFileFromDoc(doc);
    }
    console.log(`[vault-sync] Initial pull complete (${data.rows?.length || 0} docs)`);
  } catch (err) {
    console.error('[vault-sync] Initial pull failed:', err.message);
  }
}

async function watchCouchDBChanges(since = 'now') {
  while (true) {
    try {
      const url = `${DB_URL}/_changes?feed=longpoll&include_docs=true&since=${since}&timeout=60000`;
      const { data } = await axios.get(url, { auth: AUTH, timeout: 70000 });
      for (const change of data.results || []) {
        if (change.doc?.deleted) continue;
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
  console.log(`[vault-sync] Starting — vault=${VAULT_PATH} db=${LIVESYNC_DB}`);

  const ready = await waitForCouchDB();
  if (!ready) {
    console.warn('[vault-sync] Exiting: CouchDB unavailable');
    process.exit(0); // Non-fatal: gateway still works without sync
  }

  await fs.mkdir(VAULT_PATH, { recursive: true });
  await initialPull();

  // Watch filesystem → push to CouchDB
  const watcher = chokidar.watch(VAULT_PATH, { ignored: IGNORED, persistent: true, ignoreInitial: true });

  watcher
    .on('add', (p) => debounce(p, async () => {
      const buf = await fs.readFile(p);
      await upsertDoc(path.relative(VAULT_PATH, p), buf);
    }))
    .on('change', (p) => debounce(p, async () => {
      const buf = await fs.readFile(p);
      await upsertDoc(path.relative(VAULT_PATH, p), buf);
    }))
    .on('unlink', (p) => deleteDoc(path.relative(VAULT_PATH, p)));

  console.log('[vault-sync] Watching vault for changes...');

  // Watch CouchDB → pull to filesystem
  watchCouchDBChanges();
}

main().catch(err => {
  console.error('[vault-sync] Fatal:', err);
  process.exit(1);
});
