import type { Clock, timestamp } from "../../src/core/types.js";

export default class FixedClock implements Clock {

    private _timestamp: timestamp;

    constructor(timestamp: timestamp) {
        this._timestamp = timestamp;
    }

    static init(timestamp: timestamp): FixedClock {
        return new this(timestamp);
    }

    now(): timestamp {
        return this._timestamp;
    }

    set(timestamp: timestamp): void {
        this._timestamp = timestamp;
    }
}

export { FixedClock };
