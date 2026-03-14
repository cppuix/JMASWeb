/**
 * player.js — Pure audio engine.
 * Communicates via the bus instance passed to the constructor.
 */

import { resolveAudioUrl } from './lessons.js';
import { getCachedBlobUrl } from './pwa.js';

const ICON_PLAY  = 'M8 5v14l11-7z';
const ICON_PAUSE = 'M6 5h4v14H6zm8 0h4v14h-4z';

export class Player {
    constructor(audioEl, bus) {
        this.audio        = audioEl;
        this.bus          = bus;
        this.lessons      = [];
        this.index        = 0;
        this.speed        = 1;
        this.autoPlayNext = true;
        this._blobUrl     = null;
        this._bindAudioEvents();
    }

    setLessons(lessons)      { this.lessons = lessons; }
    setAutoPlayNext(val)     { this.autoPlayNext = val; }

    setSpeed(speed) {
        this.speed = speed;
        this.audio.playbackRate = speed;
        this.bus.emit('speedChanged', { speed });
    }

    async loadLesson(index, { play = true, resumeTime = 0 } = {}) {
        if (index < 0 || index >= this.lessons.length) return;

        this.index = index;
        const lesson = this.lessons[index];

        // Try cached blob first, fall back to remote URL
        let src = resolveAudioUrl(lesson);
        try {
            const blobUrl = await getCachedBlobUrl(lesson);
            if (blobUrl) {
                if (this._blobUrl) URL.revokeObjectURL(this._blobUrl);
                this._blobUrl = blobUrl;
                src = blobUrl;
            }
        } catch { /* use remote */ }

        this.audio.src = src;
        this.audio.load();
        this.audio.playbackRate = this.speed;

        // Reset progress bar display immediately
        this.bus.emit('timeupdate', { currentTime: 0, duration: 0, percent: 0 });

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
                this.bus.emit('pause', { lesson, index });
            });
        }
    }

    play()   { this.audio.play(); }
    pause()  { this.audio.pause(); }
    togglePlayPause() { this.audio.paused ? this.play() : this.pause(); }

    skip(seconds) {
        this.audio.currentTime = Math.max(0, Math.min(
            this.audio.duration || 0,
            this.audio.currentTime + seconds
        ));
    }

    seekTo(fraction) {
        if (this.audio.duration) {
            this.audio.currentTime = fraction * this.audio.duration;
        }
    }

    next() { if (this.index < this.lessons.length - 1) this.loadLesson(this.index + 1, { play: true }); }
    prev() { if (this.index > 0) this.loadLesson(this.index - 1, { play: true }); }

    get currentLesson() { return this.lessons[this.index]; }
    get currentTime()   { return this.audio.currentTime; }
    get duration()      { return this.audio.duration; }
    get paused()        { return this.audio.paused; }

    static get ICON_PLAY()  { return ICON_PLAY; }
    static get ICON_PAUSE() { return ICON_PAUSE; }

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
}