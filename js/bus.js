/**
 * bus.js
 * Minimal event bus. Modules emit events; other modules listen.
 * Keeps player, storage, and ui completely decoupled from each other.
 *
 * Usage:
 *   import bus from './bus.js';
 *   bus.on('lessonLoaded', ({ lesson, index }) => { ... });
 *   bus.emit('lessonLoaded', { lesson, index });
 *   bus.off('lessonLoaded', handler);  // cleanup if needed
 */

class EventBus {
    constructor() {
        this._listeners = {};
    }

    on(event, handler) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(handler);
        return () => this.off(event, handler); // returns unsubscribe fn
    }

    off(event, handler) {
        if (!this._listeners[event]) return;
        this._listeners[event] = this._listeners[event].filter(h => h !== handler);
    }

    emit(event, data) {
        (this._listeners[event] || []).forEach(h => {
            try { h(data); }
            catch (err) { console.error(`[bus] Error in handler for "${event}":`, err); }
        });
    }

    once(event, handler) {
        const wrapped = (data) => { handler(data); this.off(event, wrapped); };
        this.on(event, wrapped);
    }
}

// Singleton — every module that imports bus.js gets the same instance
export default new EventBus();