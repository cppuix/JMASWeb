/**
 * ui.js
 * Owns every DOM interaction.
 * Listens to the bus and updates the view.
 * Delegates user actions to player/storage via the bus or direct calls.
 */

import bus from './bus.js';
import { Player } from './player.js';
import { getLessons, searchLessons, buildSnippet, getIndexById } from './lessons.js';
import {
    setProgress, getAllProgress, setPref, getPref,
    getBookmarks, toggleBookmark, getCompletions, markComplete
} from './storage.js';
import { isCached, cacheLesson, deleteCachedLesson } from './pwa.js';

// ── Cached DOM refs ───────────────────────────────────────────────────────────

const el = {
    playPauseBtn:        document.getElementById('playPauseBtn'),
    prevBtn:             document.getElementById('prevBtn'),
    nextBtn:             document.getElementById('nextBtn'),
    skipBackBtn:         document.getElementById('skipBackBtn'),
    skipForwardBtn:      document.getElementById('skipForwardBtn'),
    speedSelect:         document.getElementById('speedSelect'),
    autoPlayNext:        document.getElementById('autoPlayNext'),
    progressBar:         document.querySelector('.progress'),
    progressContainer:   document.querySelector('.progress-bar'),
    currentTimeSpan:     document.getElementById('currentTime'),
    durationSpan:        document.getElementById('duration'),
    descriptionList:     document.getElementById('descriptionList'),
    transcriptionContent:document.getElementById('transcriptionContent'),
    lessonsContainer:    document.getElementById('lessonsContainer'),
    currentNum:          document.getElementById('currentNum'),
    totalNum:            document.getElementById('totalNum'),
    lessonSearch:        document.getElementById('lessonSearch'),
    globalSearchInput:   document.getElementById('globalSearchInput'),
    globalSearchResults: document.getElementById('globalSearchResults'),
    searchTitles:        document.getElementById('searchTitles'),
    searchDesc:          document.getElementById('searchDesc'),
    searchDates:         document.getElementById('searchDates'),
    sidebar:             document.getElementById('sidebar'),
    aboutModal:          document.getElementById('aboutModal'),
    searchModal:         document.getElementById('searchModal'),
};

// ── State local to UI ─────────────────────────────────────────────────────────

let _player       = null;
let _bookmarks    = new Set();
let _completions  = new Set();
let _offlineLessons = new Set();
let _progressMap  = {};
let _currentIndex = 0;

// Throttle progress saves to once per second
let _saveTimer = null;

// ── Init ──────────────────────────────────────────────────────────────────────

export async function initUI(player) {
    _player = player;

    // Load persisted UI state
    [_bookmarks, _completions, _progressMap] = await Promise.all([
        getBookmarks(),
        getCompletions(),
        getAllProgress(),
    ]);

    const lessons = getLessons();
    if (el.totalNum) el.totalNum.textContent = lessons.length;

    _renderLessonsList();
    _bindPlayerControls();
    _bindBusEvents();
    _bindModalControls();
    _bindSearchControls();
    _bindSeekBar();
    _bindKeyboardShortcuts();
}

// ── Lesson list rendering ─────────────────────────────────────────────────────

function _renderLessonsList() {
    const lessons = getLessons();
    el.lessonsContainer.innerHTML = '';

    lessons.forEach((lesson, index) => {
        const div = document.createElement('div');
        div.className = 'lesson-item';
        div.dataset.index = index;

        const saved      = _progressMap[lesson.id] ?? 0;
        const isBookmark = _bookmarks.has(lesson.id);
        const isDone     = _completions.has(lesson.id);
        const progressLabel = saved > 0
            ? `استأنف من: ${_formatTime(saved)}`
            : 'لم يبدأ بعد';

        const isOffline  = _offlineLessons.has(lesson.id);

        div.innerHTML = `
            <div class="lesson-status">
                ${isDone ? '<span class="done-badge" title="مكتمل">✓</span>' : ''}
            </div>
            <div class="lesson-info">
                <h4>${lesson.title}</h4>
                <p class="progress-info">${progressLabel}</p>
            </div>
            <button class="share-btn" title="مشاركة" aria-label="share">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                </svg>
            </button>
            <button class="bookmark-btn ${isBookmark ? 'active' : ''}" title="إشارة مرجعية" aria-label="bookmark">
                <svg viewBox="0 0 24 24" fill="${isBookmark ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                </svg>
            </button>
            <button class="download-btn ${isOffline ? 'active' : ''}" title="${isOffline ? 'محفوظ للاستخدام دون إنترنت' : 'حفظ للاستخدام دون إنترنت'}" aria-label="offline">
                <svg viewBox="0 0 24 24" fill="${isOffline ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
            </button>
        `;

        div.querySelector('.share-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            _shareLesson(lesson);
        });

        div.querySelector('.bookmark-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            const isNowBookmarked = await toggleBookmark(lesson.id);
            isNowBookmarked ? _bookmarks.add(lesson.id) : _bookmarks.delete(lesson.id);
            _updateLessonItem(index);
        });

        div.querySelector('.download-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            const btn = e.currentTarget;
            const lessons = getLessons();
            const lesson  = lessons[index];
            const nowCached = _offlineLessons.has(lesson.id);
            if (nowCached) {
                deleteCachedLesson(lesson);
                _offlineLessons.delete(lesson.id);
                _toast('تم حذف الدرس من التخزين');
                _updateLessonItem(index);
            } else {
                btn.classList.add('loading');
                _toast('جارٍ التحميل...');
                cacheLesson(lesson);
            }
        });

        div.addEventListener('click', () => {
            _player.loadLesson(index, { play: true, resumeTime: _progressMap[lesson.id] ?? 0 });
            if (window.innerWidth < 900) toggleSidebar();
        });

        el.lessonsContainer.appendChild(div);
    });
}

function _updateLessonItem(index) {
    const lessons = getLessons();
    const lesson  = lessons[index];
    if (!lesson) return;

    const div = el.lessonsContainer.querySelector(`[data-index="${index}"]`);
    if (!div) return;

    const isBookmark = _bookmarks.has(lesson.id);
    const isDone     = _completions.has(lesson.id);
    const isOffline  = _offlineLessons.has(lesson.id);
    const saved      = _progressMap[lesson.id] ?? 0;

    const statusEl = div.querySelector('.lesson-status');
    if (statusEl) statusEl.innerHTML = isDone ? '<span class="done-badge" title="مكتمل">✓</span>' : '';

    const progressEl = div.querySelector('.progress-info');
    if (progressEl) progressEl.textContent = saved > 0 ? `استأنف من: ${_formatTime(saved)}` : 'لم يبدأ بعد';

    const bookmarkBtn = div.querySelector('.bookmark-btn');
    if (bookmarkBtn) {
        bookmarkBtn.classList.toggle('active', isBookmark);
        bookmarkBtn.querySelector('path').setAttribute('fill', isBookmark ? 'currentColor' : 'none');
    }

    const downloadBtn = div.querySelector('.download-btn');
    if (downloadBtn) {
        downloadBtn.classList.toggle('active', isOffline);
        downloadBtn.querySelector('path, polyline, line')?.parentElement
            ?.querySelector('path')?.setAttribute('fill', isOffline ? 'currentColor' : 'none');
        downloadBtn.title = isOffline ? 'محفوظ للاستخدام دون إنترنت' : 'حفظ للاستخدام دون إنترنت';
    }
}

function _setActiveLessonItem(index) {
    el.lessonsContainer.querySelectorAll('.lesson-item').forEach((item, i) => {
        item.classList.toggle('active', i === index);
    });
    // Scroll active item into view in the sidebar
    const activeItem = el.lessonsContainer.querySelector('.lesson-item.active');
    activeItem?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// ── Player controls ───────────────────────────────────────────────────────────

function _bindPlayerControls() {
    el.playPauseBtn.addEventListener('click',     () => _player.togglePlayPause());
    el.prevBtn.addEventListener('click',          () => _player.prev());
    el.nextBtn.addEventListener('click',          () => _player.next());
    el.skipBackBtn.addEventListener('click',      () => _player.skip(-5));
    el.skipForwardBtn.addEventListener('click',   () => _player.skip(5));

    el.speedSelect.addEventListener('change', (e) => {
        const speed = parseFloat(e.target.value);
        _player.setSpeed(speed);
        setPref('playbackSpeed', speed);
    });

    el.autoPlayNext.addEventListener('change', (e) => {
        _player.setAutoPlayNext(e.target.checked);
        setPref('autoPlayNext', e.target.checked);
    });
}

// ── Bus event handlers ────────────────────────────────────────────────────────

function _bindBusEvents() {
    bus.on('lessonLoaded', ({ lesson, index }) => {
        _currentIndex = index;
        _setActiveLessonItem(index);
        if (el.currentNum) el.currentNum.textContent = index + 1;

        // Description
        el.descriptionList.innerHTML = Array.isArray(lesson.description)
            ? lesson.description.map(item => `<li>${item}</li>`).join('')
            : `<li>${lesson.description || ''}</li>`;

        // Transcription
        el.transcriptionContent.innerHTML = lesson.transcription || 'لا يوجد نص متاح حالياً.';

        // Persist last lesson
        setPref('lastLessonId', lesson.id);
    });

    bus.on('play', () => {
        _setPlayIcon('pause');
    });

    bus.on('pause', () => {
        _setPlayIcon('play');
        const lesson = getLessons()[_currentIndex];
        if (lesson && _player.currentTime > 0) {
            setProgress(lesson.id, _player.currentTime);
        }
    });

    bus.on('timeupdate', ({ currentTime, duration, percent }) => {
        el.progressBar.style.width = `${percent}%`;
        el.currentTimeSpan.textContent = _formatTime(currentTime);
        // Only set duration once — avoids layout jiggle on seek
        if (duration && el.durationSpan.textContent === '0:00') {
            el.durationSpan.textContent = _formatTime(duration);
        }

        // Throttled progress save
        const lesson = getLessons()[_currentIndex];
        if (lesson) {
            _progressMap[lesson.id] = currentTime;
            clearTimeout(_saveTimer);
            _saveTimer = setTimeout(() => {
                setProgress(lesson.id, currentTime);
                _updateLessonItem(_currentIndex);
            }, 1000);
        }

        // Completion: mark at 90%
        if (percent >= 90 && lesson && !_completions.has(lesson.id)) {
            _completions.add(lesson.id);
            markComplete(lesson.id);
            _updateLessonItem(_currentIndex);
        }
    });

    bus.on('ended', () => {
        _setPlayIcon('play');
        const lesson = getLessons()[_currentIndex];
        if (lesson) {
            setProgress(lesson.id, 0);
            _progressMap[lesson.id] = 0;
            _updateLessonItem(_currentIndex);
        }
    });
}

function _setPlayIcon(state) {
    const path = el.playPauseBtn.querySelector('path');
    if (path) path.setAttribute('d', state === 'play' ? Player.ICON_PLAY : Player.ICON_PAUSE);
}

// ── Seek bar ──────────────────────────────────────────────────────────────────

function _bindSeekBar() {
    let isDragging = false;

    const seek = (e) => {
        const rect    = el.progressContainer.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const pos     = Math.max(0, Math.min(1, 1 - (clientX - rect.left) / rect.width));
        _player.seekTo(pos);
    };

    el.progressContainer.addEventListener('click',      seek);
    el.progressContainer.addEventListener('mousedown',  (e) => { isDragging = true; seek(e); });
    el.progressContainer.addEventListener('touchstart', (e) => { isDragging = true; seek(e); }, { passive: true });

    window.addEventListener('mousemove',  (e) => { if (isDragging) seek(e); });
    window.addEventListener('touchmove',  (e) => { if (isDragging) seek(e); }, { passive: false });
    window.addEventListener('mouseup',    () => { isDragging = false; });
    window.addEventListener('touchend',   () => { isDragging = false; });
}

// ── Search ────────────────────────────────────────────────────────────────────

function _bindSearchControls() {
    // Sidebar quick search
    el.lessonSearch.addEventListener('input', (e) => {
        const term  = e.target.value.toLowerCase();
        const items = el.lessonsContainer.querySelectorAll('.lesson-item');
        const lessons = getLessons();
        items.forEach((item, i) => {
            const matches = lessons[i]?.title.toLowerCase().includes(term);
            item.style.display = matches ? '' : 'none';
        });
    });

    // Global search modal
    el.globalSearchInput.addEventListener('input', (e) => {
        const term = e.target.value;
        if (term.length < 2) { el.globalSearchResults.innerHTML = ''; return; }

        const opts = {
            titles: el.searchTitles.checked,
            desc:   el.searchDesc.checked,
            dates:  el.searchDates.checked,
        };

        const matches = searchLessons(term, opts);
        const lessons = getLessons();

        el.globalSearchResults.innerHTML = matches.map(l => {
            const index   = getIndexById(l.id);
            const snippet = buildSnippet(l, term);
            return `
                <div class="search-result-card" data-index="${index}">
                    <strong>${l.title}</strong>
                    ${snippet ? `<p>${snippet}</p>` : ''}
                </div>
            `;
        }).join('');

        el.globalSearchResults.querySelectorAll('.search-result-card').forEach(card => {
            card.addEventListener('click', () => {
                const index = parseInt(card.dataset.index, 10);
                const lesson = lessons[index];
                _player.loadLesson(index, { play: true, resumeTime: _progressMap[lesson?.id] ?? 0 });
                toggleGlobalSearch();
            });
        });
    });
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

function _bindKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Don't fire when typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        switch (e.key) {
            case ' ':
                e.preventDefault();
                _player.togglePlayPause();
                break;
            case 'ArrowRight':
                e.preventDefault();
                _player.skip(5);
                break;
            case 'ArrowLeft':
                e.preventDefault();
                _player.skip(-5);
                break;
            case 'ArrowUp':
                e.preventDefault();
                _player.prev();
                break;
            case 'ArrowDown':
                e.preventDefault();
                _player.next();
                break;
        }

        // 0–9: seek to that tenth of the lesson
        if (e.key >= '0' && e.key <= '9') {
            _player.seekTo(parseInt(e.key, 10) / 10);
        }
    });
}

// ── Modal controls ────────────────────────────────────────────────────────────

function _bindModalControls() {
    window.addEventListener('click', (e) => {
        if (e.target === el.aboutModal)  toggleAbout();
        if (e.target === el.searchModal) toggleGlobalSearch();
    });
}

// ── Global UI functions (called from HTML onclick attributes) ─────────────────

export function toggleSidebar() {
    el.sidebar.classList.toggle('open');
}

let _showingBookmarksOnly = false;

export function toggleBookmarkFilter() {
    _showingBookmarksOnly = !_showingBookmarksOnly;
    const btn = document.getElementById('bookmarkFilterBtn');
    btn?.classList.toggle('active', _showingBookmarksOnly);

    const lessons = getLessons();
    const items   = el.lessonsContainer.querySelectorAll('.lesson-item');
    items.forEach((item, i) => {
        const lesson  = lessons[i];
        const visible = !_showingBookmarksOnly || _bookmarks.has(lesson?.id);
        item.style.display = visible ? '' : 'none';
    });
}

export function toggleAbout() {
    const visible = el.aboutModal.style.display === 'flex';
    el.aboutModal.style.display = visible ? 'none' : 'flex';
}

export function toggleGlobalSearch() {
    const modal   = el.searchModal;
    const input   = el.globalSearchInput;
    const visible = modal.style.display === 'flex';

    modal.style.display = visible ? 'none' : 'flex';

    if (!visible) {
        document.body.style.overflow  = 'hidden';
        document.body.style.position  = 'fixed';
        document.body.style.width     = '100%';
        input.value = '';
        el.globalSearchResults.innerHTML = '';
        setTimeout(() => input.focus(), 100);
    } else {
        document.body.style.overflow  = '';
        document.body.style.position  = '';
        document.body.style.width     = '';
    }
}

export function switchTab(evt, tabId) {
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    evt.currentTarget.classList.add('active');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Share ─────────────────────────────────────────────────────────────────────

async function _shareLesson(lesson) {
    const url = `${location.origin}${location.pathname}?lesson=${lesson.id}`;

    // Use native share sheet on mobile if available
    if (navigator.share) {
        try {
            await navigator.share({ title: lesson.title, url });
            return;
        } catch {
            // User cancelled or share failed — fall through to clipboard
        }
    }

    try {
        await navigator.clipboard.writeText(url);
        _toast('تم نسخ الرابط ✓');
    } catch {
        _toast('تعذّر نسخ الرابط');
    }
}

let _toastTimer = null;

function _toast(message) {
    let toast = document.getElementById('jmas-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'jmas-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => toast.classList.remove('visible'), 2200);
}