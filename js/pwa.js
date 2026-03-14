/**
 * pwa.js
 * 1. Service worker registration (app shell caching)
 * 2. Per-lesson offline audio — stored as blobs in IndexedDB
 *    (avoids CORS issues with Google Drive / proxied URLs entirely)
 * 3. Media Session API — lock screen & notification controls
 */

import bus from './bus.js';
import { resolveAudioUrl } from './lessons.js';

const DB_NAME    = 'jmas_db';      // same DB as storage.js
const STORE_NAME = 'audio_blobs';  // new object store

// ── IndexedDB audio store ─────────────────────────────────────
let _audioDB = null;

async function openAudioDB() {
    if (_audioDB) return _audioDB;
    return new Promise((resolve, reject) => {
        // Open with version 2 to add the audio_blobs store
        const req = indexedDB.open(DB_NAME, 2);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('preferences')) {
                db.createObjectStore('preferences');
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
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        req.onsuccess  = (e) => { _audioDB = e.target.result; resolve(_audioDB); };
        req.onerror    = (e) => reject(e.target.error);
    });
}

function wrap(req) {
    return new Promise((res, rej) => {
        req.onsuccess = () => res(req.result);
        req.onerror   = () => rej(req.error);
    });
}

export async function getCachedLessonIds() {
    const db   = await openAudioDB();
    const keys = await wrap(db.transaction(STORE_NAME).objectStore(STORE_NAME).getAllKeys());
    return new Set(keys);
}

export async function isCachedById(lessonId) {
    const db  = await openAudioDB();
    const rec = await wrap(db.transaction(STORE_NAME).objectStore(STORE_NAME).get(lessonId));
    return !!rec;
}

export function isCached(lesson) {
    // Synchronous check not possible with IDB — use isCachedById for async
    return false;
}

export async function cacheLesson(lesson) {
    const url = resolveAudioUrl(lesson);
    bus.emit('cachingLesson', { lesson });
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        const db   = await openAudioDB();
        await wrap(
            db.transaction(STORE_NAME, 'readwrite')
              .objectStore(STORE_NAME)
              .put({ id: lesson.id, blob, cachedAt: Date.now() })
        );
        bus.emit('lessonCached', { lessonId: lesson.id });
    } catch (err) {
        console.error('[pwa] cache failed:', err);
        bus.emit('lessonCacheFailed', { lessonId: lesson.id });
    }
}

export async function deleteCachedLesson(lesson) {
    const db = await openAudioDB();
    await wrap(
        db.transaction(STORE_NAME, 'readwrite')
          .objectStore(STORE_NAME)
          .delete(lesson.id)
    );
    bus.emit('lessonUncached', { lessonId: lesson.id });
}

/**
 * Get a blob URL for a cached lesson.
 * Call URL.revokeObjectURL() when done to free memory.
 * Returns null if not cached.
 */
export async function getCachedBlobUrl(lesson) {
    const db  = await openAudioDB();
    const rec = await wrap(db.transaction(STORE_NAME).objectStore(STORE_NAME).get(lesson.id));
    if (!rec) return null;
    return URL.createObjectURL(rec.blob);
}

// ── Service Worker registration ───────────────────────────────
export async function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    try {
        await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        console.info('[pwa] Service worker registered');
    } catch (err) {
        console.warn('[pwa] SW registration failed:', err);
    }
}

// ── Media Session API ─────────────────────────────────────────
export function setupMediaSession() {
    if (!('mediaSession' in navigator)) return;

    bus.on('lessonLoaded', ({ lesson }) => {
        navigator.mediaSession.metadata = new MediaMetadata({
            title:  lesson.title,
            artist: 'الشيخ أبو عبد الرحمن فيصل الوادعي',
            album:  'جامع مسائل العقيدة الصحيحة',
            artwork: [
                { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            ],
        });
    });

    const handlers = {
        play:          () => bus.emit('mediaSessionAction', { action: 'play' }),
        pause:         () => bus.emit('mediaSessionAction', { action: 'pause' }),
        previoustrack: () => bus.emit('mediaSessionAction', { action: 'prev' }),
        nexttrack:     () => bus.emit('mediaSessionAction', { action: 'next' }),
        seekbackward:  (d) => bus.emit('mediaSessionAction', { action: 'seekBackward', offset: d.seekOffset ?? 10 }),
        seekforward:   (d) => bus.emit('mediaSessionAction', { action: 'seekForward',  offset: d.seekOffset ?? 10 }),
        seekto:        (d) => bus.emit('mediaSessionAction', { action: 'seekTo', position: d.seekTime }),
    };

    for (const [action, handler] of Object.entries(handlers)) {
        try { navigator.mediaSession.setActionHandler(action, handler); }
        catch { /* not supported on this platform */ }
    }

    bus.on('timeupdate', ({ currentTime, duration }) => {
        if (!duration) return;
        try {
            navigator.mediaSession.setPositionState({
                duration,
                position: Math.min(currentTime, duration),
                playbackRate: 1,
            });
        } catch { /* ignore */ }
    });
}