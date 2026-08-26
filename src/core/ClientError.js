// Maps client and service failure classifications to stable public errors.
export default class ClientError extends Error {

    /* Static Fields */
    static TYPES = {
        TRANSPORT_FAILED: 1000,
        RESPONSE_NOT_JSON: 1001,
        MALFORMED_RESPONSE: 1002,
        UNEXPECTED_STATUS: 1003,
        AUTHENTICATION_REQUIRED: 2000,
        TOKEN_UNREADABLE: 2001,
        PARAMETER_REJECTED: 3000,
        SERVICE_ERROR: 3001,
        CONFIGURATION_INVALID: 4000
    };

    // CONSTRUCTOR :: STRING|INT -> this
    // Creates a public client error from a known type or code.
    constructor(typeOrCode) {
        const resolved = ClientError.#resolve(typeOrCode);

        super(resolved.type);
        this.name = "ClientError";
        this.type = resolved.type;
        this.code = resolved.code;
        this.status = null;
        this.service_type = null;
        this.fields = null;
        this.details = null;
    }

    /**
     *
     * Static Methods
     *
     */

    // :: STRING|INT -> INT|STRING
    // Resolves a type to its code, or a code to its type.
    static lookup(typeOrCode) {
        const resolved = ClientError.#resolve(typeOrCode);
        return typeof typeOrCode === "string" ? resolved.code : resolved.type;
    }

    /**
     *
     * Private Methods
     *
     */

    // :: STRING|INT -> {type:STRING, code:INT}
    // Resolves constructor and lookup input.
    static #resolve(typeOrCode) {
        if (typeof typeOrCode === "string" && Object.hasOwn(ClientError.TYPES, typeOrCode)) {
            return { type: typeOrCode, code: ClientError.TYPES[typeOrCode] };
        }

        if (Number.isInteger(typeOrCode)) {
            for (const [type, code] of Object.entries(ClientError.TYPES)) {
                if (code === typeOrCode) {
                    return { type, code };
                }
            }
        }

        throw new TypeError(`Unknown ClientError type or code: ${String(typeOrCode)}`);
    }
}

export { ClientError };
