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
    getBookmarks, toggleBookmark, getCompletions, markComplete,
    getNotes, setNotes,
} from './storage.js';
import { getCachedLessonIds, cacheLesson, deleteCachedLesson } from './pwa.js';

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
    lessonsContainer:    document.getElementById('lessonsContainer'),
    currentNum:          document.getElementById('currentNum'),
    totalNum:            document.getElementById('totalNum'),
    lessonSearch:        document.getElementById('lessonSearch'),
    freshLine:           document.getElementById('freshLine'),
    continueLine:        document.getElementById('continueLine'),
    notesBlock:          document.getElementById('notesBlock'),
    notesList:           document.getElementById('notesList'),
    addNoteBtn:          document.getElementById('addNoteBtn'),
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
let _downloading  = new Set();
let _newIds       = new Set();
let _showingNewOnly = false;
let _showingBookmarksOnly = false;
let _searchMatches = null;

// Leading-edge throttle: persist progress at most once per second
let _lastSaveAt = 0;

// ── Init ──────────────────────────────────────────────────────────────────────

export async function initUI(player) {
    _player = player;

    // Load persisted UI state
    [_bookmarks, _completions, _progressMap, _offlineLessons] = await Promise.all([
        getBookmarks(),
        getCompletions(),
        getAllProgress(),
        getCachedLessonIds(),
    ]);

    const lessons = getLessons();
    if (el.totalNum) el.totalNum.textContent = lessons.length;

    await _initFreshLine();
    _renderContinueLine();
    _bindNotes();

    _renderLessonsList();
    _bindListEvents();
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
        div.dataset.index    = index;
        div.dataset.lessonId = lesson.id;

        const saved      = _progressMap[lesson.id] ?? 0;
        const isBookmark = _bookmarks.has(lesson.id);
        const isDone     = _completions.has(lesson.id);
        const progressLabel = saved > 0
            ? `استأنف من: ${_formatTime(saved)}`
            : 'لم يبدأ بعد';

        const isOffline  = _offlineLessons.has(lesson.id);
        const isNew      = _newIds.has(lesson.id);

        div.innerHTML = `
            <div class="lesson-status">
                ${isDone ? '<span class="done-badge" title="مكتمل">✓</span>' : ''}
            </div>
            <div class="lesson-info">
                <h4>${_escapeHtml(lesson.title)}${isNew ? ' <span class="new-badge">جديد</span>' : ''}</h4>
                <p class="progress-info">${progressLabel}</p>
            </div>
            <button class="bookmark-btn ${isBookmark ? 'active' : ''}" data-action="bookmark" title="إشارة مرجعية" aria-label="bookmark">
                <svg viewBox="0 0 24 24" fill="${isBookmark ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                </svg>
            </button>
            <button class="download-btn ${isOffline ? 'active' : ''}" data-action="download" title="${isOffline ? 'محفوظ للاستخدام دون إنترنت' : 'حفظ للاستخدام دون إنترنت'}" aria-label="offline">
                <svg viewBox="0 0 24 24" fill="${isOffline ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
            </button>
        `;

        el.lessonsContainer.appendChild(div);
    });

    _applyListFilter();
}

// ── Lesson list events (delegated — one handler for all rows) ───────────────

function _bindListEvents() {
    el.lessonsContainer.addEventListener('click', async (e) => {
        const actionEl = e.target.closest('[data-action]');
        const rowEl    = e.target.closest('.lesson-item');
        if (!rowEl) return;

        const index  = parseInt(rowEl.dataset.index, 10);
        const lesson = getLessons()[index];
        if (!lesson) return;

        if (actionEl) {
            if (actionEl.dataset.action === 'bookmark') {
                const isNowBookmarked = await toggleBookmark(lesson.id);
                isNowBookmarked ? _bookmarks.add(lesson.id) : _bookmarks.delete(lesson.id);
                _updateLessonItem(index);
            } else if (actionEl.dataset.action === 'download') {
                await _handleDownload(lesson, index, actionEl);
            }
            return;
        }

        // Play the lesson
        _player.loadLesson(index, { play: true, resumeTime: _progressMap[lesson.id] ?? 0 });
        if (window.innerWidth < 900) toggleSidebar();
    });
}

async function _handleDownload(lesson, index, btn) {
    if (btn.disabled || _downloading.has(lesson.id)) return;

    if (_offlineLessons.has(lesson.id)) {
        deleteCachedLesson(lesson);
        _offlineLessons.delete(lesson.id);
        _toast('تم حذف الدرس من التخزين');
        _updateLessonItem(index);
    } else {
        _downloading.add(lesson.id);
        btn.disabled = true;
        btn.classList.add('loading');
        btn.style.setProperty('--dl', '0%');
        _toast('جارٍ التحميل...');
        cacheLesson(lesson);

        // Offline-friendly: also preload the next lesson (one extra, only on explicit download)
        const lessons = getLessons();
        const nextLesson = lessons[index + 1];
        if (nextLesson && navigator.onLine && !_offlineLessons.has(nextLesson.id) && !_downloading.has(nextLesson.id)) {
            _downloading.add(nextLesson.id);
            cacheLesson(nextLesson);
        }
    }
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
        downloadBtn.querySelectorAll('path, polyline, line').forEach((el) => {
            el.setAttribute('fill', isOffline ? 'currentColor' : 'none');
        });
        downloadBtn.title = isOffline ? 'محفوظ للاستخدام دون إنترنت' : 'حفظ للاستخدام دون إنترنت';
    }
}

// ── Continue line (where did I leave off) ────────────────────────────────────

function _renderContinueLine() {
    const lessons = getLessons();
    let idx = -1;

    // Prefer the furthest lesson you've actually started...
    for (let i = lessons.length - 1; i >= 0; i--) {
        if ((_progressMap[lessons[i].id] ?? 0) > 0) { idx = i; break; }
    }

    // ...otherwise point forward to the first not-yet-finished lesson.
    if (idx === -1) {
        idx = lessons.findIndex(l => !_completions.has(l.id));
    }

    if (idx === -1) {
        el.continueLine.hidden = true;
        return;
    }

    const lesson     = lessons[idx];
    const resumeTime = _progressMap[lesson.id];
    const next       = lessons[idx + 1];

    el.continueLine.hidden = false;
    el.continueLine.innerHTML = `
        <button class="continue-play" aria-label="استئناف الدرس">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </button>
        <div class="continue-text">
            <span class="continue-title">واصل من <strong>${_escapeHtml(lesson.title)}</strong></span>
            <span class="continue-sub">${next ? `التالي: ${_escapeHtml(next.title)}` : 'آخر درس'} · ${_formatTime(resumeTime)}</span>
        </div>
    `;
    el.continueLine.querySelector('.continue-play').addEventListener('click', () => {
        _player.loadLesson(idx, { play: true, resumeTime });
    });
}

// ── Fresh lessons (new since last visit) ─────────────────────────────────────

async function _initFreshLine() {
    const lessons = getLessons();
    const maxId = lessons.length ? Math.max(...lessons.map(l => l.id)) : 0;
    const seen  = await getPref('lastSeenMaxId', null);

    // New = lessons added since your last visit; first visit shows nothing new.
    _newIds = new Set(seen == null ? [] : lessons.filter(l => l.id > seen).map(l => l.id));

    // Remember this visit's frontier for next time.
    if (seen !== maxId) await setPref('lastSeenMaxId', maxId);

    el.freshLine.addEventListener('click', () => {
        _showingNewOnly = !_showingNewOnly;
        el.freshLine.classList.toggle('active', _showingNewOnly);
        _applyListFilter();
    });

    _renderFreshLine();
}

function _renderFreshLine() {
    if (_newIds.size === 0) {
        el.freshLine.hidden = true;
        return;
    }
    el.freshLine.hidden = false;
    el.freshLine.textContent = `جديد: ${_newIds.size} ${_newIds.size === 1 ? 'درس' : 'دروس'} منذ آخر زيارة`;
}

// ── List filtering (bookmarks / new) ─────────────────────────────────────────

function _applyListFilter() {
    const lessons = getLessons();
    el.lessonsContainer.querySelectorAll('.lesson-item').forEach((item, i) => {
        const id = lessons[i]?.id;
        let show = true;
        if (_searchMatches && !_searchMatches.has(id)) show = false;
        if (_showingBookmarksOnly && !_bookmarks.has(id)) show = false;
        if (_showingNewOnly && !_newIds.has(id)) show = false;
        item.style.display = show ? '' : 'none';
    });
}

// ── Notes (per lesson — separate, editable entries) ──────────────────────────

let _notes          = [];   // notes for the currently-open lesson
let _editingNoteId  = null; // 'new' or a note id being edited

function _newNoteId() {
    return 'n' + Date.now() + Math.random().toString(36).slice(2, 6);
}

function _bindNotes() {
    el.addNoteBtn.addEventListener('click', () => {
        _editingNoteId = 'new';
        _renderNotes();
    });

    el.notesBlock.addEventListener('click', async (e) => {
        const action = e.target.closest('[data-action]')?.dataset.action;
        if (!action) return;

        const lessonId = getLessons()[_currentIndex]?.id;
        if (lessonId == null) return;

        if (action === 'save') {
            const text = e.target.closest('.note-editor')?.querySelector('textarea')?.value.trim();
            if (!text) { _editingNoteId = null; _renderNotes(); return; }
            if (_editingNoteId === 'new') {
                _notes.unshift({ id: _newNoteId(), text, updatedAt: Date.now() });
            } else {
                const note = _notes.find(n => n.id === _editingNoteId);
                if (note) { note.text = text; note.updatedAt = Date.now(); }
            }
            _editingNoteId = null;
            await setNotes(lessonId, _notes);
            _renderNotes();
        } else if (action === 'cancel') {
            _editingNoteId = null;
            _renderNotes();
        } else if (action === 'edit') {
            _editingNoteId = e.target.closest('.note-item')?.dataset.noteId ?? null;
            _renderNotes();
        } else if (action === 'del') {
            const noteId = e.target.closest('.note-item')?.dataset.noteId;
            _notes = _notes.filter(n => n.id !== noteId);
            await setNotes(lessonId, _notes);
            _renderNotes();
        }
    });
}

function _renderNotes() {
    const list = el.notesList;
    list.innerHTML = '';

    if (_notes.length === 0 && _editingNoteId === null) {
        list.innerHTML = '<p class="notes-empty">لا ملاحظات بعد.</p>';
    }

    _notes.forEach(note => {
        const div = document.createElement('div');
        div.className = 'note-item';
        div.dataset.noteId = note.id;
        div.innerHTML = `
            <p class="note-text">${_escapeHtml(note.text)}</p>
            <div class="note-actions">
                <button class="note-edit-btn" data-action="edit" type="button">تعديل</button>
                <button class="note-del-btn" data-action="del" type="button">حذف</button>
            </div>
        `;
        list.appendChild(div);
    });

    if (_editingNoteId !== null) {
        const editingNote = _notes.find(n => n.id === _editingNoteId);
        const editor = document.createElement('div');
        editor.className = 'note-editor';
        editor.innerHTML = `
            <textarea rows="3" placeholder="اكتب ملاحظتك...">${editingNote ? _escapeHtml(editingNote.text) : ''}</textarea>
            <div class="note-editor-actions">
                <button class="note-save-btn" data-action="save" type="button">حفظ</button>
                <button class="note-cancel-btn" data-action="cancel" type="button">إلغاء</button>
            </div>
        `;
        list.appendChild(editor);
        editor.querySelector('textarea').focus();
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
    bus.on('lessonLoaded', async ({ lesson, index }) => {
        _currentIndex = index;
        _setActiveLessonItem(index);
        if (el.currentNum) el.currentNum.textContent = index + 1;

        // Description (escaped; the data uses "<br>" as a line separator)
        el.descriptionList.innerHTML = _renderDescription(lesson);

        // Load this lesson's notes (guard against a stale response after a quick switch)
        const notes = await getNotes(lesson.id);
        if (getLessons()[_currentIndex]?.id === lesson.id) {
            _notes = notes;
            _editingNoteId = null;
            _renderNotes();
        }

        // Persist last lesson, and refresh the continue line for the session
        setPref('lastLessonId', lesson.id);
        _renderContinueLine();
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

        // Leading-edge throttled progress save (at most once per second)
        const lesson = getLessons()[_currentIndex];
        if (lesson) {
            _progressMap[lesson.id] = currentTime;
            const now = Date.now();
            if (!_lastSaveAt || now - _lastSaveAt >= 1000) {
                _lastSaveAt = now;
                setProgress(lesson.id, currentTime);
                _updateLessonItem(_currentIndex);
            }
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

    bus.on('offlineUncached', () => {
        _toast('هذا الدرس غير محفوظ للاستخدام دون إنترنت');
    });

    // ── PWA cache events ──────────────────────────────────────

    bus.on('cachingProgress', ({ lessonId, percent }) => {
        if (percent == null) return; // indeterminate — keep the spinner on
        const btn = el.lessonsContainer.querySelector(`[data-lesson-id="${lessonId}"] .download-btn`);
        if (btn) btn.style.setProperty('--dl', `${percent}%`);
    });

    bus.on('lessonCached', ({ lessonId }) => {
        _downloading.delete(lessonId);
        const lessons = getLessons();
        const index = lessons.findIndex(l => l.id === lessonId);
        if (index !== -1) {
            _offlineLessons.add(lessonId);
            const btn = el.lessonsContainer.querySelector(`[data-index="${index}"] .download-btn`);
            if (btn) {
                btn.classList.remove('loading');
                btn.disabled = false;
                btn.style.removeProperty('--dl');
            }
            _toast('تم الحفظ للاستخدام دون إنترنت ✓');
            _updateLessonItem(index);
        }
    });

    bus.on('lessonCacheFailed', ({ lessonId }) => {
        _downloading.delete(lessonId);
        const lessons = getLessons();
        const index = lessons.findIndex(l => l.id === lessonId);
        if (index !== -1) {
            const btn = el.lessonsContainer.querySelector(`[data-index="${index}"] .download-btn`);
            if (btn) {
                btn.classList.remove('loading');
                btn.disabled = false;
                btn.style.removeProperty('--dl');
            }
        }
        _toast('فشل التحميل، حاول مرة أخرى');
    });

    bus.on('lessonUncached', ({ lessonId }) => {
        _offlineLessons.delete(lessonId);
        const lessons = getLessons();
        const index = lessons.findIndex(l => l.id === lessonId);
        if (index !== -1) _updateLessonItem(index);
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

    el.progressContainer.addEventListener('mousedown',  (e) => { isDragging = true; seek(e); });
    el.progressContainer.addEventListener('touchstart', (e) => { isDragging = true; seek(e); }, { passive: true });

    window.addEventListener('mousemove',  (e) => { if (isDragging) seek(e); });
    window.addEventListener('touchmove',  (e) => { if (isDragging) seek(e); }, { passive: false });
    window.addEventListener('mouseup',    () => { isDragging = false; });
    window.addEventListener('touchend',   () => { isDragging = false; });
}

// ── Search ────────────────────────────────────────────────────────────────────

function _bindSearchControls() {
    // Sidebar quick search (titles + descriptions) — composes with the filters
    el.lessonSearch.addEventListener('input', (e) => {
        const term = e.target.value.trim().toLowerCase();
        _searchMatches = term.length < 2
            ? null
            : new Set(searchLessons(term, { titles: true, desc: true, dates: false }).map(l => l.id));
        _applyListFilter();
    });

    // Deep search modal (titles, descriptions, dates)
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
                    <strong>${_escapeHtml(l.title)}</strong>
                    ${snippet ? `<p>${_escapeHtml(snippet)}</p>` : ''}
                </div>
            `;
        }).join('');

        el.globalSearchResults.querySelectorAll('.search-result-card').forEach(card => {
            card.addEventListener('click', () => {
                const index = parseInt(card.dataset.index, 10);
                _player.loadLesson(index, { play: true, resumeTime: _progressMap[lessons[index]?.id] ?? 0 });
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

export function toggleBookmarkFilter() {
    _showingBookmarksOnly = !_showingBookmarksOnly;
    const btn = document.getElementById('bookmarkFilterBtn');
    btn?.classList.toggle('active', _showingBookmarksOnly);
    _applyListFilter();
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function _formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ss = s.toString().padStart(2, '0');
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${ss}`;
    return `${m}:${ss}`;
}

function _escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function _renderDescription(lesson) {
    const items = Array.isArray(lesson.description)
        ? lesson.description
        : [lesson.description || ''];
    return items
        .map(item => `<li>${_escapeHtml(item).replace(/\s*&lt;br&gt;\s*/g, '<br>')}</li>`)
        .join('');
}

// ── Share ─────────────────────────────────────────────────────────────────────

export function shareCurrentLesson() {
    const lesson = getLessons()[_currentIndex];
    if (lesson) _shareLesson(lesson);
}

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