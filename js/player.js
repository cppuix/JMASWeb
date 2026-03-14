/**
 * player.js
 * Pure audio engine. Knows nothing about the DOM beyond the <audio> element.
 * Communicates entirely through a tiny event bus so UI and storage can react
 * without the player knowing they exist.
 *
 * Events emitted (via bus.emit):
 *   'lessonLoaded'   { lesson, index }
 *   'play'           { lesson, index }
 *   'pause'          { lesson, index }
 *   'timeupdate'     { currentTime, duration, percent }
 *   'ended'          { lesson, index }
 *   'speedChanged'   { speed }
 */

import { resolveAudioUrl } from './lessons.js';

const ICON_PLAY  = 'M8 5v14l11-7z';
const ICON_PAUSE = 'M6 5h4v14H6zm8 0h4v14h-4z';

export class Player {
    constructor(audioEl, bus) {
        this.audio   = audioEl;
        this.bus     = bus;
        this.lessons = [];
        this.index   = 0;
        this.speed   = 1;
        this.autoPlayNext = true;

        this._bindAudioEvents();
    }

    // ── Configuration ─────────────────────────────────────────────────────────

    setLessons(lessons) {
        this.lessons = lessons;
    }

    setSpeed(speed) {
        this.speed = speed;
        this.audio.playbackRate = speed;
        this.bus.emit('speedChanged', { speed });
    }

    setAutoPlayNext(val) {
        this.autoPlayNext = val;
    }

    // ── Playback control ──────────────────────────────────────────────────────

    loadLesson(index, { play = true, resumeTime = 0 } = {}) {
        if (index < 0 || index >= this.lessons.length) return;

        this.index = index;
        const lesson = this.lessons[index];

        this.audio.src = resolveAudioUrl(lesson);
        this.audio.load();
        this.audio.playbackRate = this.speed;

        if (resumeTime > 0) {
            const restore = () => {
                this.audio.currentTime = resumeTime;
                this.audio.removeEventListener('loadedmetadata', restore);
            };
            this.audio.addEventListener('loadedmetadata', restore);
        }

        this.bus.emit('lessonLoaded', { lesson, index });

        if (play) {
            this.audio.play().catch(() => {
                // Autoplay blocked — emit pause so UI shows correct icon
                this.bus.emit('pause', { lesson, index });
            });
        }
    }

    play() {
        this.audio.play();
    }

    pause() {
        this.audio.pause();
    }

    togglePlayPause() {
        this.audio.paused ? this.play() : this.pause();
    }

    skip(seconds) {
        this.audio.currentTime = Math.max(0, Math.min(
            this.audio.duration || 0,
            this.audio.currentTime + seconds
        ));
    }

    seekTo(fraction) {
        // fraction is 0–1, where 0 = start, 1 = end
        if (this.audio.duration) {
            this.audio.currentTime = fraction * this.audio.duration;
        }
    }

    next() {
        if (this.index < this.lessons.length - 1) {
            this.loadLesson(this.index + 1, { play: true });
        }
    }

    prev() {
        if (this.index > 0) {
            this.loadLesson(this.index - 1, { play: true });
        }
    }

    // ── Getters ───────────────────────────────────────────────────────────────

    get currentLesson() {
        return this.lessons[this.index];
    }

    get currentTime() {
        return this.audio.currentTime;
    }

    get duration() {
        return this.audio.duration;
    }

    get paused() {
        return this.audio.paused;
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    _bindAudioEvents() {
        this.audio.addEventListener('play', () => {
            this.bus.emit('play', { lesson: this.currentLesson, index: this.index });
        });

        this.audio.addEventListener('pause', () => {
            this.bus.emit('pause', { lesson: this.currentLesson, index: this.index });
        });

        this.audio.addEventListener('timeupdate', () => {
            const { currentTime, duration } = this.audio;
            const percent = duration ? (currentTime / duration) * 100 : 0;
            this.bus.emit('timeupdate', { currentTime, duration, percent });
        });

        this.audio.addEventListener('loadedmetadata', () => {
            const { currentTime, duration } = this.audio;
            const percent = duration ? (currentTime / duration) * 100 : 0;
            this.bus.emit('timeupdate', { currentTime, duration, percent });
        });

        this.audio.addEventListener('ended', () => {
            this.bus.emit('ended', { lesson: this.currentLesson, index: this.index });
            if (this.autoPlayNext) this.next();
        });
    }

    // ── Icon helpers (used by UI) ─────────────────────────────────────────────

    static get ICON_PLAY()  { return ICON_PLAY; }
    static get ICON_PAUSE() { return ICON_PAUSE; }
}