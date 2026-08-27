interface ClientErrorResolution {
    type: string;
    code: number;
}

// Maps client and service failure classifications to stable public errors.
export default class ClientError extends Error {

    /* Static Fields */
    static readonly TYPES = {
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

    /* Instance Fields */
    readonly type: string;
    readonly code: number;
    readonly status: number | null;
    readonly service_type: string | null;
    readonly fields: Record<string, unknown> | null;
    readonly details: Record<string, unknown> | null;

    // CONSTRUCTOR :: STRING|NUMBER -> this
    // Creates a public client error from a known type or code.
    constructor(typeOrCode: string | number) {
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

    // :: STRING|NUMBER -> NUMBER|STRING
    // Resolves a type to its code, or a code to its type.
    static lookup(typeOrCode: string | number): number | string {
        const resolved = ClientError.#resolve(typeOrCode);
        return typeof typeOrCode === "string" ? resolved.code : resolved.type;
    }

    /**
     *
     * Private Methods
     *
     */

    // :: STRING|NUMBER -> {type:STRING, code:NUMBER}
    // Resolves constructor and lookup input.
    static #resolve(typeOrCode: string | number): ClientErrorResolution {
        if (typeof typeOrCode === "string" && Object.hasOwn(ClientError.TYPES, typeOrCode)) {
            const type = typeOrCode as keyof typeof ClientError.TYPES;
            return { type, code: ClientError.TYPES[type] };
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
