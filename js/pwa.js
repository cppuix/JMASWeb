/**
 * pwa.js
 * Handles:
 *   1. Service worker registration
 *   2. Per-lesson offline audio caching (via SW messages)
 *   3. Media Session API (lock screen / notification controls)
 */

import bus from './bus.js';
import { resolveAudioUrl } from './lessons.js';

let _cachedUrls = new Set();

// ── Service Worker registration ───────────────────────────────
export async function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    try {
        await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        console.info('[pwa] Service worker registered');
        navigator.serviceWorker.addEventListener('message', _onSWMessage);
        // Ask SW which lessons are already cached
        _postToSW({ type: 'GET_CACHED_LESSONS' });
    } catch (err) {
        console.warn('[pwa] SW registration failed:', err);
    }
}

// ── Offline audio caching ─────────────────────────────────────
export function isCached(lesson) {
    return _cachedUrls.has(resolveAudioUrl(lesson));
}

export function cacheLesson(lesson) {
    const url = resolveAudioUrl(lesson);
    _postToSW({ type: 'CACHE_AUDIO', url, lessonId: lesson.id });
    bus.emit('cachingLesson', { lesson });
}

export function deleteCachedLesson(lesson) {
    const url = resolveAudioUrl(lesson);
    _postToSW({ type: 'DELETE_AUDIO', url, lessonId: lesson.id });
}

function _postToSW(message) {
    if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage(message);
    } else {
        // SW not yet controlling — retry after it takes control
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            navigator.serviceWorker.controller?.postMessage(message);
        }, { once: true });
    }
}

function _onSWMessage(e) {
    const { type, lessonId, urls, ok } = e.data;

    if (type === 'CACHED_LESSONS') {
        _cachedUrls = new Set(urls);
        bus.emit('cachedLessonsLoaded', { urls });
    }
    if (type === 'AUDIO_CACHED') {
        if (ok) {
            _cachedUrls.add(e.data.url);
            bus.emit('lessonCached', { lessonId });
        } else {
            bus.emit('lessonCacheFailed', { lessonId });
        }
    }
    if (type === 'AUDIO_DELETED') {
        _cachedUrls.delete(e.data.url);
        bus.emit('lessonUncached', { lessonId });
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

    // Wire OS controls → player via bus
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
        catch { /* not supported */ }
    }

    // Keep OS progress bar in sync
    bus.on('timeupdate', ({ currentTime, duration }) => {
        if (!duration) return;
        try {
            navigator.mediaSession.setPositionState({ duration, position: Math.min(currentTime, duration), playbackRate: 1 });
        } catch { /* ignore */ }
    });
}