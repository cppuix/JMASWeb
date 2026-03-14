/**
 * lessons.js
 * Responsible for fetching, normalising, and exposing lesson data.
 * Pure data layer — no DOM, no audio, no storage side-effects.
 */

let _lessons = [];

/**
 * Fetch and normalise lessons from lessons.json.
 * Guarantees every lesson has a numeric id.
 * @returns {Promise<Array>}
 */
export async function fetchLessons() {
    const res  = await fetch('lessons.json');
    const data = await res.json();

    _lessons = data.map((lesson, index) => ({
        ...lesson,
        id: lesson.id != null ? Number(lesson.id) : index + 1,
    }));

    return _lessons;
}

/**
 * Return the cached lesson array (after fetchLessons has been called).
 * @returns {Array}
 */
export function getLessons() {
    return _lessons;
}

/**
 * Return a single lesson by its id.
 * @param {number} id
 * @returns {Object|undefined}
 */
export function getLessonById(id) {
    return _lessons.find(l => l.id === id);
}

/**
 * Return a lesson's index in the list by id.
 * @param {number} id
 * @returns {number} -1 if not found
 */
export function getIndexById(id) {
    return _lessons.findIndex(l => l.id === id);
}

/**
 * Resolve the playable URL for a lesson.
 * Handles both direct URLs and Google Drive share links.
 * @param {Object} lesson
 * @returns {string}
 */
export function resolveAudioUrl(lesson) {
    const fileId = lesson.url?.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1];
    return fileId ? `/api/audio?id=${fileId}` : lesson.url;
}

/**
 * Search lessons by title, description, and/or date.
 * @param {string} term
 * @param {{ titles?: boolean, desc?: boolean, dates?: boolean }} opts
 * @returns {Array}
 */
export function searchLessons(term, { titles = true, desc = true, dates = false } = {}) {
    if (!term || term.length < 2) return [];
    const t = term.toLowerCase();

    return _lessons.filter(l => {
        if (titles && l.title?.toLowerCase().includes(t)) return true;
        if (dates  && l.date?.includes(t)) return true;
        if (desc) {
            const text = Array.isArray(l.description)
                ? l.description.join(' ')
                : (l.description || '');
            if (text.toLowerCase().includes(t)) return true;
        }
        return false;
    });
}

/**
 * Build a snippet from a lesson's description around a search term.
 * @param {Object} lesson
 * @param {string} term
 * @returns {string} HTML snippet or ''
 */
export function buildSnippet(lesson, term) {
    const descText = Array.isArray(lesson.description)
        ? lesson.description.join(' ')
        : (lesson.description || '');

    const t   = term.toLowerCase();
    const idx = descText.toLowerCase().indexOf(t);

    if (idx !== -1) {
        const start = Math.max(0, idx - 20);
        const end   = Math.min(descText.length, idx + 40);
        return `...${descText.substring(start, end)}...`;
    }
    if (lesson.date?.includes(term)) {
        return `التاريخ: ${lesson.date}`;
    }
    return '';
}