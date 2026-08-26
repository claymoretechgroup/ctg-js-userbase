/*
 * FixedClock is constructed from a Unix timestamp in seconds.
 * `now()` returns the current fixed timestamp; `set(timestamp)` replaces it.
 */

export default class FixedClock {

    constructor(timestamp) {
        this._timestamp = timestamp;
    }

    static init(timestamp) {
        return new this(timestamp);
    }

    now() {
        return this._timestamp;
    }

    set(timestamp) {
        this._timestamp = timestamp;
    }
}

export { FixedClock };
