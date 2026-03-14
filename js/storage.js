/**
 * storage.js
 * Thin async wrapper around IndexedDB.
 * Stores all app state: progress, preferences, bookmarks, completions.
 *
 * DB: jmas_db  v1
 * Stores:
 *   preferences  — key/value pairs (lastLessonId, playbackSpeed, autoPlayNext, skipAmount)
 *   progress     — { id, currentTime, updatedAt }
 *   bookmarks    — { id, bookmarkedAt }
 *   completions  — { id, completedAt }
 */

const DB_NAME    = 'jmas_db';
const DB_VERSION = 1;

let _db = null;

function openDB() {
    if (_db) return Promise.resolve(_db);

    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('preferences')) {
                db.createObjectStore('preferences'); // out-of-line keys
            }
            if (!db.objectStoreNames.contains('progress')) {
                db.createObjectStore('progress', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('bookmarks')) {
                db.createObjectStore('bookmarks', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('completions')) {
                db.createObjectStore('completions', { keyPath: 'id' });
            }
        };

        req.onsuccess  = (e) => { _db = e.target.result; resolve(_db); };
        req.onerror    = (e) => reject(e.target.error);
    });
}

function tx(storeName, mode = 'readonly') {
    return _db.transaction(storeName, mode).objectStore(storeName);
}

function wrap(req) {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
    });
}

// ── Preferences ──────────────────────────────────────────────────────────────

export async function getPref(key, fallback = null) {
    await openDB();
    const val = await wrap(tx('preferences').get(key));
    return val !== undefined ? val : fallback;
}

export async function setPref(key, value) {
    await openDB();
    return wrap(tx('preferences', 'readwrite').put(value, key));
}

export async function getAllPrefs() {
    await openDB();
    const store = tx('preferences');
    const keys   = await wrap(store.getAllKeys());
    const values = await wrap(tx('preferences').getAll());
    return Object.fromEntries(keys.map((k, i) => [k, values[i]]));
}

// ── Progress ─────────────────────────────────────────────────────────────────

export async function getProgress(lessonId) {
    await openDB();
    const rec = await wrap(tx('progress').get(lessonId));
    return rec?.currentTime ?? 0;
}

export async function setProgress(lessonId, currentTime) {
    await openDB();
    return wrap(tx('progress', 'readwrite').put({ id: lessonId, currentTime, updatedAt: Date.now() }));
}

export async function getAllProgress() {
    await openDB();
    const all = await wrap(tx('progress').getAll());
    return Object.fromEntries(all.map(r => [r.id, r.currentTime]));
}

// ── Bookmarks ─────────────────────────────────────────────────────────────────

export async function getBookmarks() {
    await openDB();
    const all = await wrap(tx('bookmarks').getAllKeys());
    return new Set(all);
}

export async function toggleBookmark(lessonId) {
    await openDB();
    const existing = await wrap(tx('bookmarks').get(lessonId));
    if (existing) {
        await wrap(tx('bookmarks', 'readwrite').delete(lessonId));
        return false; // now un-bookmarked
    } else {
        await wrap(tx('bookmarks', 'readwrite').put({ id: lessonId, bookmarkedAt: Date.now() }));
        return true;  // now bookmarked
    }
}

// ── Completions ───────────────────────────────────────────────────────────────

export async function getCompletions() {
    await openDB();
    const all = await wrap(tx('completions').getAllKeys());
    return new Set(all);
}

export async function markComplete(lessonId) {
    await openDB();
    return wrap(tx('completions', 'readwrite').put({ id: lessonId, completedAt: Date.now() }));
}

// ── Migration: pull old localStorage data into IndexedDB once ────────────────

export async function migrateFromLocalStorage() {
    await openDB();
    const migrated = await getPref('_migrated');
    if (migrated) return;

    try {
        // Progress
        const oldProgress = localStorage.getItem('lessonProgress');
        if (oldProgress) {
            const parsed = JSON.parse(oldProgress);
            const store = tx('progress', 'readwrite');
            for (const [id, currentTime] of Object.entries(parsed)) {
                store.put({ id: Number(id), currentTime, updatedAt: Date.now() });
            }
        }

        // Preferences
        const speed    = localStorage.getItem('playbackSpeed');
        const auto     = localStorage.getItem('autoPlayNext');
        const lastId   = localStorage.getItem('lastLessonId');
        if (speed)  await setPref('playbackSpeed',  parseFloat(speed));
        if (auto)   await setPref('autoPlayNext',   auto === 'true');
        if (lastId) await setPref('lastLessonId',   Number(lastId));

        await setPref('_migrated', true);
        console.info('[storage] Migrated from localStorage → IndexedDB');
    } catch (err) {
        console.warn('[storage] Migration failed, will retry next load:', err);
    }
}