// Applies account-management endpoint operations to a CTG user client.
export default class AccountManagement {

    _client;

    // CONSTRUCTOR :: CTGUserClient -> this
    // Creates account-management operations over one client.
    constructor(client) {
        this._client = client;
    }

    /**
     *
     * Instance Methods
     *
     */

    // :: VOID -> PROMISE(Profile)
    // Reads the current profile using the session bearer credential.
    getProfile() {
        return this._client.request("GET", "/me");
    }

    // :: {name?:STRING|NULL} -> PROMISE(Profile)
    // Updates current profile fields.
    updateProfile(args = {}) {
        return this._client.request("PATCH", "/me", undefined, pick(args, ["name"]));
    }

    // :: {current_password:STRING, new_password:STRING} -> PROMISE({status:STRING})
    // Changes the current password.
    changePassword(args = {}) {
        return this._client.request("POST", "/me/password", undefined, pick(args, ["current_password", "new_password"]));
    }

    // :: {new_email:STRING, password:STRING, code?:STRING, recovery_code?:STRING} -> PROMISE({status:STRING})
    // Starts an email-change verification flow.
    requestEmailChange(args = {}) {
        return this._client.request(
            "POST",
            "/me/email",
            undefined,
            pick(args, ["new_email", "password", "code", "recovery_code"])
        );
    }

    // :: {token:STRING} -> PROMISE(Profile)
    // Confirms an email-change token without sending a bearer credential.
    confirmEmailChange(args = {}) {
        return this._client.request("POST", "/me/email/confirm", undefined, pick(args, ["token"]), "none");
    }

    // :: {token:STRING} -> PROMISE({status:STRING})
    // Reverts an email-change token without sending a bearer credential.
    revertEmailChange(args = {}) {
        return this._client.request("POST", "/me/email/revert", undefined, pick(args, ["token"]), "none");
    }

    // :: VOID -> PROMISE({provisioning_uri:STRING, secret:STRING})
    // Requests MFA setup material without rendering QR concerns.
    setupMFA() {
        return this._client.request("POST", "/mfa/setup");
    }

    // :: {code:STRING} -> PROMISE({recovery_codes:[STRING]})
    // Confirms MFA setup.
    confirmMFA(args = {}) {
        return this._client.request("POST", "/mfa/confirm", undefined, pick(args, ["code"]));
    }

    // :: {password:STRING, code?:STRING, recovery_code?:STRING} -> PROMISE(Profile)
    // Disables MFA on the current account.
    disableMFA(args = {}) {
        return this._client.request("POST", "/mfa/disable", undefined, pick(args, ["password", "code", "recovery_code"]));
    }

    // :: VOID -> PROMISE([SessionSummary])
    // Lists sessions for the current account.
    listSessions() {
        return this._client.request("GET", "/me/sessions");
    }

    // :: {id:STRING} -> PROMISE(VOID)
    // Revokes one session by query id.
    revokeSession(args = {}) {
        return this._client.request("DELETE", "/me/session", pick(args, ["id"]));
    }

    // :: VOID -> PROMISE({status:STRING, count:INT})
    // Revokes all other sessions for the current account.
    revokeOtherSessions() {
        return this._client.request("DELETE", "/me/sessions");
    }

    /**
     *
     * Static Methods
     *
     */

    // Static Factory Method :: CTGUserClient -> AccountManagement
    // Creates account-management operations over one client.
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

export { AccountManagement };
