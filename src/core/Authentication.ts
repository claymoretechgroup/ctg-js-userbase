// Dependency: client class and symbol-keyed session mutation hooks.
import CTGUserbaseClient, { CLEAR_SESSION, ESTABLISH_SESSION } from "./CTGUserbaseClient.js";
// Dependency: public authentication result types.
import type { Authenticated, LoginResult, Profile } from "./types.js";

export interface RegisterArgs {
    email: string;
    password: string;
    name?: string | null;
}

export interface TokenArgs {
    token: string;
}

export interface LoginArgs {
    email: string;
    password: string;
}

export interface VerifyMFAArgs {
    mfa_token: string;
    code?: string;
    recovery_code?: string;
}

export interface ForgotPasswordArgs {
    email: string;
}

export interface ResetPasswordArgs {
    token: string;
    new_password: string;
    code?: string;
    recovery_code?: string;
}

// Applies authentication endpoint operations to a CTG userbase client.
export default class Authentication {

    /* Instance Fields */
    private readonly _client: CTGUserbaseClient;

    // CONSTRUCTOR :: CTGUserbaseClient -> this
    // Creates authentication operations over one client.
    constructor(client: CTGUserbaseClient) {
        this._client = client;
    }

    /**
     *
     * Instance Methods
     *
     */

    // :: {email:STRING, password:STRING, name?:STRING|NULL} -> PROMISE({status:STRING})
    // Registers a new user without sending a bearer credential.
    register(args: RegisterArgs): Promise<{ status: "verification_sent" }> {
        return this._client.request(
            "POST",
            "/auth/register",
            undefined,
            pick(args, ["email", "password", "name"]),
            "none",
        ) as Promise<{ status: "verification_sent" }>;
    }

    // :: {token:STRING} -> PROMISE(Profile)
    // Verifies an email-token flow without sending a bearer credential.
    verifyEmail(args: TokenArgs): Promise<Profile> {
        return this._client.request("POST", "/auth/verify-email", undefined, pick(args, ["token"]), "none") as Promise<Profile>;
    }

    // :: {email:STRING, password:STRING} -> PROMISE(LoginResult)
    // Logs in and stores completed sessions, while MFA challenges leave state unchanged.
    async login(args: LoginArgs): Promise<LoginResult> {
        const result = await this._client.request(
            "POST",
            "/auth/login",
            undefined,
            pick(args, ["email", "password"]),
            "none",
        ) as LoginResult;

        if (result?.mfa_required === true) {
            return result;
        }

        this._client[ESTABLISH_SESSION](result.access_token);
        return result;
    }

    // :: {mfa_token:STRING, code?:STRING, recovery_code?:STRING} -> PROMISE(Authenticated)
    // Completes an MFA login with the challenge token as bearer credential.
    async verifyMFA(args: VerifyMFAArgs): Promise<Authenticated> {
        const result = await this._client.request(
            "POST",
            "/auth/mfa/verify",
            undefined,
            pick(args, ["code", "recovery_code"]),
            args.mfa_token,
        ) as Authenticated;

        this._client[ESTABLISH_SESSION](result.access_token);
        return result;
    }

    // :: VOID -> PROMISE(Authenticated)
    // Renews the access-token session through the browser-held cookie.
    async refresh(): Promise<Authenticated> {
        try {
            const result = await this._client.request("POST", "/auth/refresh", undefined, undefined, "none") as Authenticated;
            this._client[ESTABLISH_SESSION](result.access_token);
            return result;
        } catch (error) {
            this._client[CLEAR_SESSION]();
            throw error;
        }
    }

    // :: VOID -> PROMISE({status:STRING})
    // Logs out service-side and clears local session state.
    async logout(): Promise<{ status: "logged_out" }> {
        try {
            const result = await this._client.request("POST", "/auth/logout", undefined, undefined, "none") as { status: "logged_out" };
            this._client[CLEAR_SESSION]();
            return result;
        } catch (error) {
            this._client[CLEAR_SESSION]();
            throw error;
        }
    }

    // :: {email:STRING} -> PROMISE({status:STRING})
    // Requests password reset without sending a bearer credential.
    forgotPassword(args: ForgotPasswordArgs): Promise<{ status: "reset_sent" }> {
        return this._client.request(
            "POST",
            "/password/forgot",
            undefined,
            pick(args, ["email"]),
            "none",
        ) as Promise<{ status: "reset_sent" }>;
    }

    // :: {token:STRING, new_password:STRING, code?:STRING, recovery_code?:STRING} -> PROMISE({status:STRING})
    // Resets password through a token flow without sending a bearer credential.
    resetPassword(args: ResetPasswordArgs): Promise<{ status: "password_reset" }> {
        return this._client.request(
            "POST",
            "/password/reset",
            undefined,
            pick(args, ["token", "new_password", "code", "recovery_code"]),
            "none",
        ) as Promise<{ status: "password_reset" }>;
    }

    /**
     *
     * Static Methods
     *
     */

    // Static Factory Method :: CTGUserbaseClient -> Authentication
    // Creates authentication operations over one client.
    static init(client: CTGUserbaseClient): Authentication {
        return new this(client);
    }
}

// :: OBJECT, [STRING] -> OBJECT
// Copies named present fields in listed order.
const pick = (source: object | undefined, names: string[]): Record<string, unknown> => {
    const sourceMap = source as Record<string, unknown> | undefined;
    const result: Record<string, unknown> = {};

    for (const name of names) {
        if (sourceMap?.[name] !== undefined) {
            result[name] = sourceMap[name];
        }
    }

    return result;
};

export { Authentication };
