// realizes: core/03-authentication.md > Conformance Test Cases > Login

import { describe, it, expect } from "vitest";
import { CTGTest, CTGTestPredicates, CTGTestResult } from "ctg-js-test";
import CTGUserClient from "../../src/core/CTGUserClient.js";
import Authentication from "../../src/core/Authentication.js";
import ScriptedTransport from "../support/ScriptedTransport.js";
import FixedClock from "../support/FixedClock.js";

const { STATUS } = CTGTestResult;

const success = (result) => ({
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: true, result })
});

const failure = (status, result) => ({
    status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: false, result })
});

const tokenFor = (claims) => {
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${encode({ alg: "none" })}.${encode(claims)}.signature`;
};

const tokenWithClaimSegment = (claimSegment) => {
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${encode({ alg: "none" })}.${claimSegment}.signature`;
};

const profile = { id: "u1", email: "a@example.test", name: null, roles: [], group_ids: [], totp_enabled: false, email_verified: true };
const claims = { sub: "u1", exp: 3000, permissions: ["users:read"] };
const token = tokenFor(claims);

const authenticated = (accessToken = token) => ({
    mfa_required: false,
    user: profile,
    access_token: accessToken,
    access_expires_at: 3000
});

const challenge = {
    mfa_required: true,
    mfa_token: "mfa-token",
    mfa_expires_at: 1200
};

const makeClient = (script) => {
    const transport = ScriptedTransport.init(script);
    const client = new CTGUserClient({ base_url: "https://s", transport, clock: FixedClock.init(1000) });
    return { client, transport, auth: Authentication.init(client) };
};

const rejectValue = async (promise) => {
    try {
        await promise;
        return null;
    } catch (error) {
        return error;
    }
};

describe("authentication login conformance", () => {

    it("completed login returns the result, stores the token and decoded claims, and applies the listener once", async () => {
        const state = await CTGTest.init("login authenticated")
            .stage("act", async () => {
                const seen = [];
                const { client, auth } = makeClient([{ response: success(authenticated()) }]);
                client.subscribe((session) => seen.push(session));
                const result = await auth.login({ email: "a@example.test", password: "p" });
                return {
                    result,
                    session: client.session(),
                    listenerCount: seen.length,
                    listenerSession: seen[0]
                };
            })
            .assert("session established", (state) => state.subject, CTGTestPredicates.equals({
                result: authenticated(),
                session: { access_token: token, claims },
                listenerCount: 1,
                listenerSession: { access_token: token, claims }
            }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("MFA challenge login returns the challenge, leaves session unchanged, and applies no listener", async () => {
        const state = await CTGTest.init("login mfa challenge")
            .stage("act", async () => {
                const seen = [];
                const { client, auth } = makeClient([{ response: success(challenge) }]);
                client.subscribe((session) => seen.push(session));
                const result = await auth.login({ email: "a@example.test", password: "p" });
                return { result, session: client.session(), listenerCount: seen.length };
            })
            .assert("challenge only", (state) => state.subject, CTGTestPredicates.equals({
                result: challenge,
                session: { access_token: null, claims: null },
                listenerCount: 0
            }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("completed login result carries no refresh credential property", async () => {
        const state = await CTGTest.init("login no refresh credential")
            .stage("act", async () => {
                const { auth } = makeClient([{ response: success(authenticated()) }]);
                const result = await auth.login({ email: "a@example.test", password: "p" });
                return {
                    refresh_token: result.refresh_token,
                    refreshToken: result.refreshToken,
                    keys: Object.keys(result).sort()
                };
            })
            .assert("refresh credential absent", (state) => state.subject, CTGTestPredicates.equals({
                refresh_token: undefined,
                refreshToken: undefined,
                keys: ["access_expires_at", "access_token", "mfa_required", "user"]
            }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("login answered with access_token \"abc\" rejects TOKEN_UNREADABLE, leaves session unchanged, and applies no listener", async () => {
        const state = await CTGTest.init("login unreadable compact token")
            .stage("act", async () => {
                const seen = [];
                const { client, auth } = makeClient([{ response: success(authenticated("abc")) }]);
                client.subscribe((session) => seen.push(session));
                const error = await rejectValue(auth.login({ email: "a@example.test", password: "p" }));
                return { type: error?.type, session: client.session(), listenerCount: seen.length };
            })
            .assert("unreadable token rejected", (state) => state.subject, CTGTestPredicates.equals({
                type: "TOKEN_UNREADABLE",
                session: { access_token: null, claims: null },
                listenerCount: 0
            }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("login answered with a token whose claim segment decodes to \"x\" rejects TOKEN_UNREADABLE", async () => {
        const state = await CTGTest.init("login non-map claims")
            .stage("act", async () => {
                const badToken = tokenWithClaimSegment(Buffer.from(JSON.stringify("x")).toString("base64url"));
                const { auth } = makeClient([{ response: success(authenticated(badToken)) }]);
                const error = await rejectValue(auth.login({ email: "a@example.test", password: "p" }));
                return error?.type;
            })
            .assert("non-map claim segment rejected", (state) => state.subject,
                CTGTestPredicates.equals("TOKEN_UNREADABLE"))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("login answered 403 INVALID_CREDENTIALS rejects SERVICE_ERROR and leaves session unchanged", async () => {
        const state = await CTGTest.init("login invalid credentials")
            .stage("act", async () => {
                const { client, auth } = makeClient([
                    { response: failure(403, { type: "INVALID_CREDENTIALS", message: "Invalid credentials" }) }
                ]);
                const error = await rejectValue(auth.login({ email: "a@example.test", password: "wrong" }));
                return {
                    type: error?.type,
                    service_type: error?.service_type,
                    status: error?.status,
                    session: client.session()
                };
            })
            .assert("service failure surfaced", (state) => state.subject, CTGTestPredicates.equals({
                type: "SERVICE_ERROR",
                service_type: "INVALID_CREDENTIALS",
                status: 403,
                session: { access_token: null, claims: null }
            }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });
});
