/**
 * app.js
 */

import bus from './bus.js';
import { fetchLessons, getIndexById } from './lessons.js';
import { Player } from './player.js';
import {
    migrateFromLocalStorage,
    getPref, getAllProgress, setPref,
} from './storage.js';
import {
    initUI,
    toggleSidebar, toggleAbout, toggleGlobalSearch, switchTab,
} from './ui.js';
import { registerSW, setupMediaSession } from './pwa.js';

window.toggleSidebar      = toggleSidebar;
window.toggleAbout        = toggleAbout;
window.toggleGlobalSearch = toggleGlobalSearch;
window.switchTab          = switchTab;

const MOON_ICON = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;
const SUN_ICON  = `<circle cx="12" cy="12" r="5"/>
<line x1="12" y1="1" x2="12" y2="3"/>
<line x1="12" y1="21" x2="12" y2="23"/>
<line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
<line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
<line x1="1" y1="12" x2="3" y2="12"/>
<line x1="21" y1="12" x2="23" y2="12"/>
<line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
<line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>`;

function applyTheme(theme) {
    const root = document.documentElement;
    const icon = document.getElementById('themeIcon');
    if (theme === 'dark') {
        root.setAttribute('data-theme', 'dark');
        if (icon) icon.innerHTML = SUN_ICON;
    } else {
        root.setAttribute('data-theme', 'light');
        if (icon) icon.innerHTML = MOON_ICON;
    }
}

window.toggleTheme = function () {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setPref('theme', next);
};

async function boot() {
    await migrateFromLocalStorage();

    const savedTheme = await getPref('theme', null);
    if (savedTheme) {
        applyTheme(savedTheme);
    } else {
        applyTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    }

    let lessons;
    try {
        lessons = await fetchLessons();
    } catch (err) {
        console.error('[app] Failed to load lessons:', err);
        document.getElementById('lessonsContainer').innerHTML =
            '<p style="padding:20px;color:#c00;">فشل تحميل الدروس. يرجى التحقق من الاتصال.</p>';
        return;
    }

    const [savedSpeed, savedAuto, savedLessonId] = await Promise.all([
        getPref('playbackSpeed', 1),
        getPref('autoPlayNext',  true),
        getPref('lastLessonId',  null),
    ]);

    const progressMap = await getAllProgress();

    const audioEl = document.getElementById('audioPlayer');
    const player  = new Player(audioEl, bus);

    player.setLessons(lessons);
    player.setAutoPlayNext(savedAuto !== null ? savedAuto : true);

    const speedSelect = document.getElementById('speedSelect');
    if (speedSelect && savedSpeed) {
        speedSelect.value = savedSpeed;
        player.setSpeed(savedSpeed);
    }

    const autoPlayEl = document.getElementById('autoPlayNext');
    if (autoPlayEl) autoPlayEl.checked = savedAuto !== null ? savedAuto : true;

    await initUI(player);

    let indexToLoad = 0;
    const urlParam = new URLSearchParams(location.search).get('lesson');
    if (urlParam != null) {
        const found = getIndexById(Number(urlParam));
        if (found !== -1) indexToLoad = found;
        history.replaceState(null, '', location.pathname);
    } else if (savedLessonId != null) {
        const found = getIndexById(Number(savedLessonId));
        if (found !== -1) indexToLoad = found;
    }

    const resumeTime = progressMap[lessons[indexToLoad]?.id] ?? 0;
    player.loadLesson(indexToLoad, { play: false, resumeTime });

    registerSW();
    setupMediaSession();

    bus.on('mediaSessionAction', ({ action, offset, position }) => {
        switch (action) {
            case 'play':         player.play();                                      break;
            case 'pause':        player.pause();                                     break;
            case 'prev':         player.prev();                                      break;
            case 'next':         player.next();                                      break;
            case 'seekBackward': player.skip(-(offset ?? 10));                       break;
            case 'seekForward':  player.skip(offset ?? 10);                          break;
            case 'seekTo':       player.seekTo(position / (player.duration || 1));   break;
        }
    });
}

document.addEventListener('DOMContentLoaded', boot);