// Dependency: symbol-keyed client session mutation hooks.
import { CLEAR_SESSION, ESTABLISH_SESSION } from "./CTGUserClient.js";

// Applies authentication endpoint operations to a CTG user client.
export default class Authentication {

    _client;

    // CONSTRUCTOR :: CTGUserClient -> this
    // Creates authentication operations over one client.
    constructor(client) {
        this._client = client;
    }

    /**
     *
     * Instance Methods
     *
     */

    // :: {email:STRING, password:STRING, name?:STRING|NULL} -> PROMISE({status:STRING})
    // Registers a new user without sending a bearer credential.
    register(args = {}) {
        return this._client.request("POST", "/auth/register", undefined, pick(args, ["email", "password", "name"]), "none");
    }

    // :: {token:STRING} -> PROMISE(Profile)
    // Verifies an email-token flow without sending a bearer credential.
    verifyEmail(args = {}) {
        return this._client.request("POST", "/auth/verify-email", undefined, pick(args, ["token"]), "none");
    }

    // :: {email:STRING, password:STRING} -> PROMISE(LoginResult)
    // Logs in and stores completed sessions, while MFA challenges leave state unchanged.
    async login(args = {}) {
        const result = await this._client.request("POST", "/auth/login", undefined, pick(args, ["email", "password"]), "none");

        if (result?.mfa_required === true) {
            return result;
        }

        this._client[ESTABLISH_SESSION](result.access_token);
        return result;
    }

    // :: {mfa_token:STRING, code?:STRING, recovery_code?:STRING} -> PROMISE(Authenticated)
    // Completes an MFA login with the challenge token as bearer credential.
    async verifyMFA(args = {}) {
        const result = await this._client.request(
            "POST",
            "/auth/mfa/verify",
            undefined,
            pick(args, ["code", "recovery_code"]),
            args.mfa_token
        );

        this._client[ESTABLISH_SESSION](result.access_token);
        return result;
    }

    // :: VOID -> PROMISE(Authenticated)
    // Renews the access-token session through the browser-held cookie.
    async refresh() {
        try {
            const result = await this._client.request("POST", "/auth/refresh", undefined, undefined, "none");
            this._client[ESTABLISH_SESSION](result.access_token);
            return result;
        } catch (error) {
            this._client[CLEAR_SESSION]();
            throw error;
        }
    }

    // :: VOID -> PROMISE({status:STRING})
    // Logs out service-side and clears local session state.
    async logout() {
        try {
            const result = await this._client.request("POST", "/auth/logout", undefined, undefined, "none");
            this._client[CLEAR_SESSION]();
            return result;
        } catch (error) {
            this._client[CLEAR_SESSION]();
            throw error;
        }
    }

    // :: {email:STRING} -> PROMISE({status:STRING})
    // Requests password reset without sending a bearer credential.
    forgotPassword(args = {}) {
        return this._client.request("POST", "/password/forgot", undefined, pick(args, ["email"]), "none");
    }

    // :: {token:STRING, new_password:STRING, code?:STRING, recovery_code?:STRING} -> PROMISE({status:STRING})
    // Resets password through a token flow without sending a bearer credential.
    resetPassword(args = {}) {
        return this._client.request(
            "POST",
            "/password/reset",
            undefined,
            pick(args, ["token", "new_password", "code", "recovery_code"]),
            "none"
        );
    }

    /**
     *
     * Static Methods
     *
     */

    // Static Factory Method :: CTGUserClient -> Authentication
    // Creates authentication operations over one client.
    static init(client) {
        return new this(client);
    }
}

// :: OBJECT, [STRING] -> OBJECT
// Copies named present fields in listed order.
const pick = (source, names) => {
    const result = {};

    for (const name of names) {
        if (source?.[name] !== undefined) {
            result[name] = source[name];
        }
    }

    return result;
};

export { Authentication };
