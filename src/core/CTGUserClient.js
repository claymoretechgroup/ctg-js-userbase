// Dependency: public client error for request and configuration failures.
import ClientError from "./ClientError.js";

export const ESTABLISH_SESSION = Symbol("establishSession");
export const CLEAR_SESSION = Symbol("clearSession");

// Holds one user's session state and applies the shared request primitive.
export default class CTGUserClient {

    _baseUrl;
    _transport;
    _clock;
    _sessionState;
    _listeners;
    _listenerId;
    _renewalFlight;

    // CONSTRUCTOR :: Config -> this
    // Creates a client over caller-supplied transport and clock operations.
    constructor(config = {}) {
        if (config.transport === undefined || typeof config.transport?.send !== "function") {
            throw CTGUserClient._configurationError("transport");
        }

        if (config.clock === undefined || typeof config.clock?.now !== "function") {
            throw CTGUserClient._configurationError("clock");
        }

        if (config.base_url !== undefined && typeof config.base_url !== "string") {
            throw CTGUserClient._configurationError("base_url");
        }

        const baseUrl = config.base_url ?? "";

        this._baseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
        this._transport = config.transport;
        this._clock = config.clock;
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
    async request(method, path, query = undefined, body = undefined, credential = "session") {
        return await this.#request(method, path, query, body, credential, false);
    }

    // :: VOID -> SessionState
    // Returns a defensive copy of the current session.
    session() {
        return this.#copySession(this._sessionState);
    }

    // :: (SessionState -> VOID) -> (VOID -> VOID)
    // Registers a session listener and returns an idempotent unsubscribe.
    subscribe(listener) {
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

    // :: VOID -> BOOL
    // Checks whether held claims are unexpired according to the supplied clock.
    isSessionActive() {
        return this._sessionState.claims !== null && this._clock.now() < this._sessionState.claims.exp;
    }

    // :: STRING -> VOID
    // Stores an access token and its decoded claims.
    [ESTABLISH_SESSION](accessToken) {
        this.#setSession({ access_token: accessToken, claims: CTGUserClient.decodeClaims(accessToken) });
    }

    // :: VOID -> VOID
    // Clears access-token session state.
    [CLEAR_SESSION]() {
        this.#setSession({ access_token: null, claims: null });
    }

    /**
     *
     * Private Methods
     *
     */

    // :: HTTPMethod, STRING, MAP<STRING, *>?, MAP<STRING, *>?, Credential?, BOOL -> PROMISE(*|VOID)
    // Applies the request algorithm, optionally marking a one-time renewal replay.
    async #request(method, path, query, body, credential, replayed) {
        const url = this.#buildUrl(path, query);
        const resolvedCredential = this.#resolveCredential(credential);
        const eligible = credential === "session" && resolvedCredential !== null;
        const request = this.#buildRequest(method, url, body, resolvedCredential);

        let response;
        try {
            response = await this._transport.send(request);
        } catch {
            throw CTGUserClient._transportError(method, url);
        }

        try {
            return await this.#decodeResponse(response, { method, path, query, body, credential, eligible, replayed });
        } catch (error) {
            throw error;
        }
    }

    // :: Response, OBJECT -> PROMISE(*|VOID)
    // Decodes and classifies one response.
    async #decodeResponse(response, original) {
        if (response.status === 204) {
            return undefined;
        }

        const decoded = this.#parseResponseBody(response);

        if (!CTGUserClient._isMap(decoded) || typeof decoded.success !== "boolean" || !Object.hasOwn(decoded, "result")) {
            throw CTGUserClient._error("MALFORMED_RESPONSE", { status: response.status });
        }

        if (decoded.success) {
            return decoded.result;
        }

        if (response.status === 401) {
            if (typeof decoded.result !== "string") {
                throw CTGUserClient._error("UNEXPECTED_STATUS", { status: response.status });
            }

            if (original.eligible && !original.replayed) {
                await this.#renewSession();
                return await this.#request(original.method, original.path, original.query, original.body, original.credential, true);
            }

            throw CTGUserClient._error("AUTHENTICATION_REQUIRED", {
                message: decoded.result,
                status: response.status
            });
        }

        if (typeof decoded.result === "string") {
            throw CTGUserClient._error("UNEXPECTED_STATUS", { status: response.status });
        }

        if (CTGUserClient._isMap(decoded.result)) {
            if (typeof decoded.result.type === "string") {
                throw CTGUserClient._error("SERVICE_ERROR", {
                    status: response.status,
                    service_type: decoded.result.type,
                    message: decoded.result.message,
                    details: decoded.result.details ?? null
                });
            }

            throw CTGUserClient._error("PARAMETER_REJECTED", {
                status: response.status,
                fields: decoded.result
            });
        }

        throw CTGUserClient._error("MALFORMED_RESPONSE", { status: response.status });
    }

    // :: Response -> *
    // Parses JSON response text and maps invalid JSON to a client error.
    #parseResponseBody(response) {
        try {
            return JSON.parse(response.body);
        } catch {
            throw CTGUserClient._error("RESPONSE_NOT_JSON", {
                status: response.status,
                details: { body_preview: String(response.body ?? "").slice(0, 200) }
            });
        }
    }

    // :: VOID -> PROMISE(VOID)
    // Performs a single shared session renewal.
    async #renewSession() {
        if (this._renewalFlight === null) {
            this._renewalFlight = this.#request("POST", "/auth/refresh", undefined, undefined, "none", true)
                .then((result) => {
                    this[ESTABLISH_SESSION](result.access_token);
                })
                .catch((error) => {
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
    #buildUrl(path, query) {
        const parts = [];

        for (const [name, value] of Object.entries(query ?? {})) {
            if (value !== undefined) {
                parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
            }
        }

        return `${this._baseUrl}${path}${parts.length > 0 ? `?${parts.join("&")}` : ""}`;
    }

    // :: Credential? -> STRING|NULL
    // Resolves the bearer credential for a request.
    #resolveCredential(credential) {
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
    #buildRequest(method, url, body, resolvedCredential) {
        const headers = { Accept: "application/json" };

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
            credentials: "include"
        };
    }

    // :: SessionState -> SessionState
    // Copies session state and its claim object for defensive exposure.
    #copySession(session) {
        return {
            access_token: session.access_token,
            claims: session.claims === null ? null : { ...session.claims }
        };
    }

    // :: SessionState -> VOID
    // Replaces session state and notifies listeners in registration order.
    #setSession(session) {
        this._sessionState = this.#copySession(session);

        for (const listener of this._listeners.values()) {
            listener(this.session());
        }
    }

    // :: MAP<STRING, *> -> MAP<STRING, *>
    // Drops undefined fields while preserving listed property order.
    #presentFields(fields) {
        const present = {};

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
    static decodeClaims(accessToken) {
        try {
            const parts = String(accessToken).split(".");
            if (parts.length !== 3) {
                throw new Error("bad token");
            }

            const claims = JSON.parse(CTGUserClient._base64UrlDecode(parts[1]));
            if (!CTGUserClient._isMap(claims)) {
                throw new Error("bad claims");
            }

            return claims;
        } catch {
            throw CTGUserClient._error("TOKEN_UNREADABLE");
        }
    }

    // :: STRING -> STRING
    // Decodes a base64url string in browser and Node runtimes.
    static _base64UrlDecode(value) {
        const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
        const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "=");

        if (typeof atob === "function") {
            const binary = atob(padded);
            const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
            return new TextDecoder().decode(bytes);
        }

        return Buffer.from(padded, "base64").toString("utf8");
    }

    // :: STRING -> ClientError
    // Creates a configuration error for a named field.
    static _configurationError(field) {
        return CTGUserClient._error("CONFIGURATION_INVALID", { details: { field } });
    }

    // :: HTTPMethod, STRING -> ClientError
    // Creates a transport error with request coordinates.
    static _transportError(method, url) {
        return CTGUserClient._error("TRANSPORT_FAILED", {
            status: null,
            details: { method, url }
        });
    }

    // :: STRING, OBJECT? -> ClientError
    // Creates and decorates a public client error.
    static _error(type, fields = {}) {
        const error = new ClientError(type);

        if (Object.hasOwn(fields, "message")) {
            error.message = fields.message;
        }

        if (Object.hasOwn(fields, "status")) {
            error.status = fields.status;
        }

        if (Object.hasOwn(fields, "service_type")) {
            error.service_type = fields.service_type;
        }

        if (Object.hasOwn(fields, "fields")) {
            error.fields = fields.fields;
        }

        if (Object.hasOwn(fields, "details")) {
            error.details = fields.details;
        }

        return error;
    }

    // :: * -> BOOL
    // Checks for a non-array object map.
    static _isMap(value) {
        return value !== null && typeof value === "object" && !Array.isArray(value);
    }
}

export { CTGUserClient };
