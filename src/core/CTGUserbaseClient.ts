// Dependency: public client error for request and configuration failures.
import ClientError from "./ClientError.js";
// Dependency: public core contracts for the client surface.
import type { Claims, Clock, Config, Credential, HTTPMethod, Request, Response, SessionState, Transport } from "./types.js";

export const ESTABLISH_SESSION = Symbol("establishSession");
export const CLEAR_SESSION = Symbol("clearSession");

interface OriginalRequest {
    method: HTTPMethod;
    path: string;
    query?: Record<string, unknown>;
    body?: Record<string, unknown>;
    credential: Credential;
    eligible: boolean;
    replayed: boolean;
}

interface ErrorFields {
    message?: unknown;
    status?: number | null;
    service_type?: string | null;
    fields?: unknown;
    details?: unknown;
}

type SessionListener = (session: SessionState) => void;

type MutableClientError = ClientError & {
    status: number | null;
    service_type: string | null;
    fields: Record<string, unknown> | null;
    details: Record<string, unknown> | null;
};

// Holds one user's session state and applies the shared request primitive.
export default class CTGUserbaseClient {

    /* Instance Fields */
    private readonly _baseUrl: string;
    private readonly _transport: Transport;
    private readonly _clock: Clock;
    private _sessionState: SessionState;
    private readonly _listeners: Map<number, SessionListener>;
    private _listenerId: number;
    private _renewalFlight: Promise<void> | null;

    // CONSTRUCTOR :: Config -> this
    // Creates a client over caller-supplied transport and clock operations.
    constructor(config: Config) {
        const supplied = config as Partial<Config> | undefined;
        const options = supplied ?? {};

        if (options.transport === undefined || typeof options.transport?.send !== "function") {
            throw CTGUserbaseClient._configurationError("transport");
        }

        if (options.clock === undefined || typeof options.clock?.now !== "function") {
            throw CTGUserbaseClient._configurationError("clock");
        }

        if (options.base_url !== undefined && typeof options.base_url !== "string") {
            throw CTGUserbaseClient._configurationError("base_url");
        }

        const baseUrl = options.base_url ?? "";

        this._baseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
        this._transport = options.transport;
        this._clock = options.clock;
        this._sessionState = { access_token: null, claims: null };
        this._listeners = new Map();
        this._listenerId = 0;
        this._renewalFlight = null;
    }

    /**
     *
     * Instance Methods
     *
     */

    // :: HTTPMethod, STRING, MAP<STRING, *>?, MAP<STRING, *>?, Credential? -> PROMISE(*|VOID)
    // Sends a service request through the shared primitive.
    async request(
        method: HTTPMethod,
        path: string,
        query: Record<string, unknown> | undefined = undefined,
        body: Record<string, unknown> | undefined = undefined,
        credential: Credential = "session",
    ): Promise<unknown | void> {
        return await this.#request(method, path, query, body, credential, false);
    }

    // :: VOID -> SessionState
    // Returns a defensive copy of the current session.
    session(): SessionState {
        return this.#copySession(this._sessionState);
    }

    // :: (SessionState -> VOID) -> (VOID -> VOID)
    // Registers a session listener and returns an idempotent unsubscribe.
    subscribe(listener: SessionListener): () => void {
        const id = this._listenerId;
        let subscribed = true;

        this._listenerId += 1;
        this._listeners.set(id, listener);

        return () => {
            if (!subscribed) {
                return;
            }

            subscribed = false;
            this._listeners.delete(id);
        };
    }

    // :: VOID -> BOOLEAN
    // Checks whether held claims are unexpired according to the supplied clock.
    isSessionActive(): boolean {
        return this._sessionState.claims !== null && this._clock.now() < this._sessionState.claims.exp;
    }

    // :: STRING -> VOID
    // Stores an access token and its decoded claims.
    [ESTABLISH_SESSION](accessToken: string): void {
        this.#setSession({ access_token: accessToken, claims: CTGUserbaseClient.decodeClaims(accessToken) });
    }

    // :: VOID -> VOID
    // Clears access-token session state.
    [CLEAR_SESSION](): void {
        this.#setSession({ access_token: null, claims: null });
    }

    /**
     *
     * Private Methods
     *
     */

    // :: HTTPMethod, STRING, MAP<STRING, *>?, MAP<STRING, *>?, Credential?, BOOLEAN -> PROMISE(*|VOID)
    // Applies the request algorithm, optionally marking a one-time renewal replay.
    async #request(
        method: HTTPMethod,
        path: string,
        query: Record<string, unknown> | undefined,
        body: Record<string, unknown> | undefined,
        credential: Credential,
        replayed: boolean,
    ): Promise<unknown | void> {
        const url = this.#buildUrl(path, query);
        const resolvedCredential = this.#resolveCredential(credential);
        const eligible = credential === "session" && resolvedCredential !== null;
        const request = this.#buildRequest(method, url, body, resolvedCredential);

        let response: Response;
        try {
            response = await this._transport.send(request);
        } catch {
            throw CTGUserbaseClient._transportError(method, url);
        }

        return await this.#decodeResponse(response, { method, path, query, body, credential, eligible, replayed });
    }

    // :: Response, OBJECT -> PROMISE(*|VOID)
    // Decodes and classifies one response.
    async #decodeResponse(response: Response, original: OriginalRequest): Promise<unknown | void> {
        if (response.status === 204) {
            return undefined;
        }

        const decoded = this.#parseResponseBody(response);

        if (!CTGUserbaseClient._isMap(decoded) || typeof decoded.success !== "boolean" || !Object.hasOwn(decoded, "result")) {
            throw CTGUserbaseClient._error("MALFORMED_RESPONSE", { status: response.status });
        }

        if (decoded.success) {
            return decoded.result;
        }

        if (response.status === 401) {
            if (typeof decoded.result !== "string") {
                throw CTGUserbaseClient._error("UNEXPECTED_STATUS", { status: response.status });
            }

            if (original.eligible && !original.replayed) {
                await this.#renewSession();
                return await this.#request(original.method, original.path, original.query, original.body, original.credential, true);
            }

            throw CTGUserbaseClient._error("AUTHENTICATION_REQUIRED", {
                message: decoded.result,
                status: response.status,
            });
        }

        if (typeof decoded.result === "string") {
            throw CTGUserbaseClient._error("UNEXPECTED_STATUS", { status: response.status });
        }

        if (CTGUserbaseClient._isMap(decoded.result)) {
            if (typeof decoded.result.type === "string") {
                throw CTGUserbaseClient._error("SERVICE_ERROR", {
                    status: response.status,
                    service_type: decoded.result.type,
                    message: decoded.result.message,
                    details: decoded.result.details ?? null,
                });
            }

            throw CTGUserbaseClient._error("PARAMETER_REJECTED", {
                status: response.status,
                fields: decoded.result,
            });
        }

        throw CTGUserbaseClient._error("MALFORMED_RESPONSE", { status: response.status });
    }

    // :: Response -> *
    // Parses JSON response text and maps invalid JSON to a client error.
    #parseResponseBody(response: Response): unknown {
        try {
            return JSON.parse(response.body) as unknown;
        } catch {
            throw CTGUserbaseClient._error("RESPONSE_NOT_JSON", {
                status: response.status,
                details: { body_preview: String(response.body ?? "").slice(0, 200) },
            });
        }
    }

    // :: VOID -> PROMISE(VOID)
    // Performs a single shared session renewal.
    async #renewSession(): Promise<void> {
        if (this._renewalFlight === null) {
            this._renewalFlight = this.#request("POST", "/auth/refresh", undefined, undefined, "none", true)
                .then((result) => {
                    const accessToken = CTGUserbaseClient._isMap(result) ? result.access_token : undefined;
                    this[ESTABLISH_SESSION](accessToken as string);
                })
                .catch((error: unknown) => {
                    this[CLEAR_SESSION]();
                    throw error;
                })
                .finally(() => {
                    this._renewalFlight = null;
                });
        }

        await this._renewalFlight;
    }

    // :: STRING, MAP<STRING, *>? -> STRING
    // Builds a URL with ordered percent-encoded query parameters.
    #buildUrl(path: string, query: Record<string, unknown> | undefined): string {
        const parts: string[] = [];

        for (const [name, value] of Object.entries(query ?? {})) {
            if (value !== undefined) {
                parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
            }
        }

        return `${this._baseUrl}${path}${parts.length > 0 ? `?${parts.join("&")}` : ""}`;
    }

    // :: Credential? -> STRING|NULL
    // Resolves the bearer credential for a request.
    #resolveCredential(credential: Credential | undefined): string | null {
        if (credential === "none") {
            return null;
        }

        if (credential === undefined || credential === "session") {
            return this._sessionState.access_token;
        }

        return credential;
    }

    // :: HTTPMethod, STRING, MAP<STRING, *>?, STRING|NULL -> Request
    // Builds the transport request object.
    #buildRequest(
        method: HTTPMethod,
        url: string,
        body: Record<string, unknown> | undefined,
        resolvedCredential: string | null,
    ): Request {
        const headers: Record<string, string> = { Accept: "application/json" };

        if (resolvedCredential !== null) {
            headers.Authorization = `Bearer ${resolvedCredential}`;
        }

        if (body !== undefined) {
            headers["Content-Type"] = "application/json";
        }

        return {
            method,
            url,
            headers,
            body: body === undefined ? null : JSON.stringify(this.#presentFields(body)),
            credentials: "include",
        };
    }

    // :: SessionState -> SessionState
    // Copies session state and its claim object for defensive exposure.
    #copySession(session: SessionState): SessionState {
        return {
            access_token: session.access_token,
            claims: session.claims === null ? null : { ...session.claims },
        };
    }

    // :: SessionState -> VOID
    // Replaces session state and notifies listeners in registration order.
    #setSession(session: SessionState): void {
        this._sessionState = this.#copySession(session);

        for (const listener of this._listeners.values()) {
            listener(this.session());
        }
    }

    // :: MAP<STRING, *> -> MAP<STRING, *>
    // Drops undefined fields while preserving listed property order.
    #presentFields(fields: Record<string, unknown>): Record<string, unknown> {
        const present: Record<string, unknown> = {};

        for (const [name, value] of Object.entries(fields ?? {})) {
            if (value !== undefined) {
                present[name] = value;
            }
        }

        return present;
    }

    /**
     *
     * Static Methods
     *
     */

    // :: STRING -> Claims
    // Decodes the unsigned JWT claim segment.
    static decodeClaims(accessToken: string): Claims {
        try {
            const parts = String(accessToken).split(".");
            if (parts.length !== 3 || parts[1] === undefined) {
                throw new Error("bad token");
            }

            const claims = JSON.parse(CTGUserbaseClient._base64UrlDecode(parts[1])) as unknown;
            if (!CTGUserbaseClient._isMap(claims)) {
                throw new Error("bad claims");
            }

            return claims as unknown as Claims;
        } catch {
            throw CTGUserbaseClient._error("TOKEN_UNREADABLE");
        }
    }

    // :: STRING -> STRING
    // Decodes a base64url string in browser and Node runtimes.
    static _base64UrlDecode(value: string): string {
        const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
        const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "=");
        const binary = atob(padded);
        const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));

        return new TextDecoder().decode(bytes);
    }

    // :: STRING -> ClientError
    // Creates a configuration error for a named field.
    static _configurationError(field: string): ClientError {
        return CTGUserbaseClient._error("CONFIGURATION_INVALID", { details: { field } });
    }

    // :: HTTPMethod, STRING -> ClientError
    // Creates a transport error with request coordinates.
    static _transportError(method: HTTPMethod, url: string): ClientError {
        return CTGUserbaseClient._error("TRANSPORT_FAILED", {
            status: null,
            details: { method, url },
        });
    }

    // :: STRING, OBJECT? -> ClientError
    // Creates and decorates a public client error.
    static _error(type: string, fields: ErrorFields = {}): ClientError {
        const error = new ClientError(type) as MutableClientError;

        if (Object.hasOwn(fields, "message")) {
            error.message = fields.message as string;
        }

        if (Object.hasOwn(fields, "status")) {
            error.status = fields.status ?? null;
        }

        if (Object.hasOwn(fields, "service_type")) {
            error.service_type = fields.service_type ?? null;
        }

        if (Object.hasOwn(fields, "fields")) {
            error.fields = fields.fields as Record<string, unknown> | null;
        }

        if (Object.hasOwn(fields, "details")) {
            error.details = fields.details as Record<string, unknown> | null;
        }

        return error;
    }

    // :: * -> BOOLEAN
    // Checks for a non-array object map.
    static _isMap(value: unknown): value is Record<string, unknown> {
        return value !== null && typeof value === "object" && !Array.isArray(value);
    }
}

export { CTGUserbaseClient };
