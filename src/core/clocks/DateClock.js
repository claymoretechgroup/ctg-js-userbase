// Supplies Unix timestamps from the host Date clock.
export default class DateClock {

    // CONSTRUCTOR :: VOID -> this
    // Creates a Date-backed clock.
    constructor() {}

    /**
     *
     * Instance Methods
     *
     */

    // :: VOID -> timestamp
    // Returns current Unix time in whole seconds.
    now() {
        return Math.floor(Date.now() / 1000);
    }
}

export { DateClock };
