// Dependency: shared client request primitive.
import CTGUserbaseClient from "./CTGUserbaseClient.js";
// Dependency: token args shared from authentication operations.
import type { TokenArgs } from "./Authentication.js";
// Dependency: public account result types.
import type { Profile, SessionSummary } from "./types.js";

export interface UpdateProfileArgs {
    name?: string | null;
}

export interface ChangePasswordArgs {
    current_password: string;
    new_password: string;
}

export interface RequestEmailChangeArgs {
    new_email: string;
    password: string;
    code?: string;
    recovery_code?: string;
}

export interface ConfirmMFAArgs {
    code: string;
}

export interface DisableMFAArgs {
    password: string;
    code?: string;
    recovery_code?: string;
}

export interface IdStringArgs {
    id: string;
}

// Applies account-management endpoint operations to a CTG userbase client.
export default class AccountManagement {

    /* Instance Fields */
    private readonly _client: CTGUserbaseClient;

    // CONSTRUCTOR :: CTGUserbaseClient -> this
    // Creates account-management operations over one client.
    constructor(client: CTGUserbaseClient) {
        this._client = client;
    }

    /**
     *
     * Instance Methods
     *
     */

    // :: VOID -> PROMISE(Profile)
    // Reads the current profile using the session bearer credential.
    getProfile(): Promise<Profile> {
        return this._client.request("GET", "/me") as Promise<Profile>;
    }

    // :: {name?:STRING|NULL} -> PROMISE(Profile)
    // Updates current profile fields.
    updateProfile(args: UpdateProfileArgs): Promise<Profile> {
        return this._client.request("PATCH", "/me", undefined, pick(args, ["name"])) as Promise<Profile>;
    }

    // :: {current_password:STRING, new_password:STRING} -> PROMISE({status:STRING})
    // Changes the current password.
    changePassword(args: ChangePasswordArgs): Promise<{ status: "password_changed" }> {
        return this._client.request(
            "POST",
            "/me/password",
            undefined,
            pick(args, ["current_password", "new_password"]),
        ) as Promise<{ status: "password_changed" }>;
    }

    // :: {new_email:STRING, password:STRING, code?:STRING, recovery_code?:STRING} -> PROMISE({status:STRING})
    // Starts an email-change verification flow.
    requestEmailChange(args: RequestEmailChangeArgs): Promise<{ status: "verification_sent" }> {
        return this._client.request(
            "POST",
            "/me/email",
            undefined,
            pick(args, ["new_email", "password", "code", "recovery_code"]),
        ) as Promise<{ status: "verification_sent" }>;
    }

    // :: {token:STRING} -> PROMISE(Profile)
    // Confirms an email-change token without sending a bearer credential.
    confirmEmailChange(args: TokenArgs): Promise<Profile> {
        return this._client.request("POST", "/me/email/confirm", undefined, pick(args, ["token"]), "none") as Promise<Profile>;
    }

    // :: {token:STRING} -> PROMISE({status:STRING})
    // Reverts an email-change token without sending a bearer credential.
    revertEmailChange(args: TokenArgs): Promise<{ status: "reverted" }> {
        return this._client.request(
            "POST",
            "/me/email/revert",
            undefined,
            pick(args, ["token"]),
            "none",
        ) as Promise<{ status: "reverted" }>;
    }

    // :: VOID -> PROMISE({provisioning_uri:STRING, secret:STRING})
    // Requests MFA setup material without rendering QR concerns.
    setupMFA(): Promise<{ provisioning_uri: string; secret: string }> {
        return this._client.request("POST", "/mfa/setup") as Promise<{ provisioning_uri: string; secret: string }>;
    }

    // :: {code:STRING} -> PROMISE({recovery_codes:[STRING]})
    // Confirms MFA setup.
    confirmMFA(args: ConfirmMFAArgs): Promise<{ recovery_codes: string[] }> {
        return this._client.request("POST", "/mfa/confirm", undefined, pick(args, ["code"])) as Promise<{ recovery_codes: string[] }>;
    }

    // :: {password:STRING, code?:STRING, recovery_code?:STRING} -> PROMISE(Profile)
    // Disables MFA on the current account.
    disableMFA(args: DisableMFAArgs): Promise<Profile> {
        return this._client.request(
            "POST",
            "/mfa/disable",
            undefined,
            pick(args, ["password", "code", "recovery_code"]),
        ) as Promise<Profile>;
    }

    // :: VOID -> PROMISE([SessionSummary])
    // Lists sessions for the current account.
    listSessions(): Promise<SessionSummary[]> {
        return this._client.request("GET", "/me/sessions") as Promise<SessionSummary[]>;
    }

    // :: {id:STRING} -> PROMISE(VOID)
    // Revokes one session by query id.
    revokeSession(args: IdStringArgs): Promise<void> {
        return this._client.request("DELETE", "/me/session", pick(args, ["id"])) as Promise<void>;
    }

    // :: VOID -> PROMISE({status:STRING, count:NUMBER})
    // Revokes all other sessions for the current account.
    revokeOtherSessions(): Promise<{ status: "revoked"; count: number }> {
        return this._client.request("DELETE", "/me/sessions") as Promise<{ status: "revoked"; count: number }>;
    }

    /**
     *
     * Static Methods
     *
     */

    // Static Factory Method :: CTGUserbaseClient -> AccountManagement
    // Creates account-management operations over one client.
    static init(client: CTGUserbaseClient): AccountManagement {
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

export { AccountManagement };
