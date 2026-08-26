/*
 * Script entry shape:
 * {
 *     request?: {
 *         method?: string,
 *         url?: string,
 *         headers?: object,
 *         body?: string | null,
 *         credentials?: "include"
 *     },
 *     response?: Response | (() => Response | Promise<Response>),
 *     reject?: Error | (() => Error | Promise<Error>)
 * }
 *
 * Entries are consumed in order. `reject` wins over `response`. When
 * `request` is present, the listed fields are matched before the scripted
 * result is returned. Header expectations are a subset match.
 */

import { isDeepStrictEqual } from "node:util";

export default class ScriptedTransport {

    constructor(script) {
        this._script = Array.isArray(script) ? [...script] : [];
        this._requests = [];
    }

    static init(script) {
        return new this(script);
    }

    async send(request) {
        this._requests.push(request);

        const entry = this._script.shift();
        if (entry === undefined) {
            throw new Error(`Unexpected transport request: ${request.method} ${request.url}`);
        }

        if (entry.request !== undefined) {
            ScriptedTransport.assertRequest(request, entry.request);
        }

        if (Object.hasOwn(entry, "reject")) {
            throw await ScriptedTransport._resolve(entry.reject);
        }

        return await ScriptedTransport._resolve(entry.response);
    }

    requests() {
        return [...this._requests];
    }

    static assertRequest(actual, expected) {
        for (const key of ["method", "url", "body", "credentials"]) {
            if (Object.hasOwn(expected, key) && !isDeepStrictEqual(actual[key], expected[key])) {
                throw new Error(
                    `Request ${key} mismatch: expected ${JSON.stringify(expected[key])}, ` +
                    `got ${JSON.stringify(actual[key])}`
                );
            }
        }

        if (Object.hasOwn(expected, "headers")) {
            const actualHeaders = actual.headers ?? {};
            for (const [key, value] of Object.entries(expected.headers)) {
                if (!isDeepStrictEqual(actualHeaders[key], value)) {
                    throw new Error(
                        `Request header ${key} mismatch: expected ${JSON.stringify(value)}, ` +
                        `got ${JSON.stringify(actualHeaders[key])}`
                    );
                }
            }
        }
    }

    static _resolve(value) {
        return typeof value === "function" ? value() : value;
    }
}

export { ScriptedTransport };
