// Dependency: public transport request and response contracts.
import type { Request, Response } from "./types.js";

// Supplies stateless production transport and clock operations.
export default class CTGUserbaseUtil {

    /**
     *
     * Static Methods
     *
     */

    // :: Request -> PROMISE(Response)
    // Sends one request and returns raw response text for any HTTP status.
    static async send(request: Request): Promise<Response> {
        const response = await fetch(request.url, {
            method: request.method,
            headers: request.headers,
            body: request.body,
            credentials: request.credentials,
        });

        return {
            status: response.status,
            headers: Object.fromEntries(response.headers.entries()),
            body: await response.text(),
        };
    }

    // :: VOID -> timestamp
    // Returns current Unix time in whole seconds.
    static now(): number {
        return Math.floor(Date.now() / 1000);
    }
}

export { CTGUserbaseUtil };
