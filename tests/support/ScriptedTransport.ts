import type { Request, Response, Transport } from "../../src/core/types.js";

type MaybePromise<Value> = Value | Promise<Value>;

type Resolvable<Value> = Value | (() => MaybePromise<Value>);

type RequestAssertKey = "method" | "url" | "body" | "credentials";

interface ScriptRequest {
    method?: Request["method"];
    url?: string;
    headers?: Partial<Request["headers"]>;
    body?: string | null;
    credentials?: Request["credentials"];
}

export interface ScriptEntry {
    request?: ScriptRequest;
    response?: Resolvable<Response>;
    reject?: Resolvable<Error>;
}

export default class ScriptedTransport implements Transport {

    private readonly _script: ScriptEntry[];
    private readonly _requests: Request[];

    constructor(script: ScriptEntry[]) {
        this._script = Array.isArray(script) ? [...script] : [];
        this._requests = [];
    }

    static init(script: ScriptEntry[]): ScriptedTransport {
        return new this(script);
    }

    async send(request: Request): Promise<Response> {
        this._requests.push(request);

        const entry = this._script.shift();
        if (entry === undefined) {
            throw new Error(`Unexpected transport request: ${request.method} ${request.url}`);
        }

        if (entry.request !== undefined) {
            ScriptedTransport.assertRequest(request, entry.request);
        }

        if (Object.hasOwn(entry, "reject")) {
            if (entry.reject === undefined) {
                throw new Error("Scripted reject entry must define an error");
            }
            throw await ScriptedTransport._resolve(entry.reject);
        }

        if (entry.response === undefined) {
            throw new Error("Scripted transport entry must define a response");
        }
        return await ScriptedTransport._resolve(entry.response);
    }

    requests(): Request[] {
        return [...this._requests];
    }

    requestAt(index: number): Request {
        const request = this._requests[index];
        if (request === undefined) {
            throw new Error(`Expected transport request at index ${index}`);
        }
        return request;
    }

    lastRequest(): Request {
        if (this._requests.length === 0) {
            throw new Error("Expected at least one transport request");
        }
        return this.requestAt(this._requests.length - 1);
    }

    static assertRequest(actual: Request, expected: ScriptRequest): void {
        for (const key of ["method", "url", "body", "credentials"] as const satisfies readonly RequestAssertKey[]) {
            if (Object.hasOwn(expected, key) && !ScriptedTransport._isDeepStrictEqual(actual[key], expected[key])) {
                throw new Error(
                    `Request ${key} mismatch: expected ${JSON.stringify(expected[key])}, ` +
                    `got ${JSON.stringify(actual[key])}`
                );
            }
        }

        if (expected.headers !== undefined) {
            const actualHeaders = actual.headers ?? {};
            for (const [key, value] of Object.entries(expected.headers)) {
                if (!ScriptedTransport._isDeepStrictEqual(actualHeaders[key], value)) {
                    throw new Error(
                        `Request header ${key} mismatch: expected ${JSON.stringify(value)}, ` +
                        `got ${JSON.stringify(actualHeaders[key])}`
                    );
                }
            }
        }
    }

    private static _resolve<Value>(value: Resolvable<Value>): MaybePromise<Value> {
        if (typeof value === "function") {
            return (value as () => MaybePromise<Value>)();
        }
        return value;
    }

    private static _isDeepStrictEqual(left: unknown, right: unknown): boolean {
        return JSON.stringify(left) === JSON.stringify(right);
    }
}

export { ScriptedTransport };
