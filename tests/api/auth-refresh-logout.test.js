// realizes: core/03-authentication.md > Conformance Test Cases > Refresh and Logout

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

const profile = { id: "u1", email: "a@example.test", name: null, roles: [], group_ids: [], totp_enabled: false, email_verified: true };
const oldClaims = { sub: "u1", exp: 2000 };
const newClaims = { sub: "u1", exp: 4000 };
const oldToken = tokenFor(oldClaims);
const newToken = tokenFor(newClaims);

const authenticated = (accessToken, expiresAt = 3000) => ({
    mfa_required: false,
    user: profile,
    access_token: accessToken,
    access_expires_at: expiresAt
});

const makeClient = (script) => {
    const transport = ScriptedTransport.init(script);
    const client = new CTGUserClient({ base_url: "https://s", transport, clock: FixedClock.init(1000) });
    return { client, transport, auth: Authentication.init(client) };
};

const makeSeededClient = async (script) => {
    const setup = makeClient([
        { response: success(authenticated(oldToken, 2000)) },
        ...script
    ]);
    await setup.auth.login({ email: "a@example.test", password: "p" });
    return setup;
};

const rejectValue = async (promise) => {
    try {
        await promise;
        return null;
    } catch (error) {
        return error;
    }
};

const afterSeed = (transport) => transport.requests().slice(1);
const hasHeader = (request, name) => Object.hasOwn(request.headers ?? {}, name);

const requestSummary = (request) => ({
    method: request.method,
    url: request.url,
    authorization: request.headers?.Authorization,
    body: request.body,
    credentials: request.credentials,
    hasContentType: hasHeader(request, "Content-Type")
});

describe("authentication refresh and logout conformance", () => {

    it("refresh succeeding sends POST /auth/refresh with no authorization or body, replaces session, and applies the listener once", async () => {
        const state = await CTGTest.init("refresh success")
            .stage("act", async () => {
                const { client, auth, transport } = await makeSeededClient([
                    { response: success(authenticated(newToken, 4000)) }
                ]);
                const seen = [];
                client.subscribe((session) => seen.push(session));
                const result = await auth.refresh();
                return {
                    result,
                    request: requestSummary(afterSeed(transport)[0]),
                    session: client.session(),
                    listenerCount: seen.length
                };
            })
            .assert("refresh effects", (state) => state.subject, CTGTestPredicates.equals({
                result: authenticated(newToken, 4000),
                request: {
                    method: "POST",
                    url: "https://s/auth/refresh",
                    authorization: undefined,
                    body: null,
                    credentials: "include",
                    hasContentType: false
                },
                session: { access_token: newToken, claims: newClaims },
                listenerCount: 1
            }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("refresh answered 401 rejects AUTHENTICATION_REQUIRED, clears session, and applies the listener once", async () => {
        const state = await CTGTest.init("refresh 401")
            .stage("act", async () => {
                const { client, auth } = await makeSeededClient([
                    { response: failure(401, "Refresh required") }
                ]);
                const seen = [];
                client.subscribe((session) => seen.push(session));
                const error = await rejectValue(auth.refresh());
                return { type: error?.type, session: client.session(), listenerCount: seen.length };
            })
            .assert("refresh auth failure clears", (state) => state.subject, CTGTestPredicates.equals({
                type: "AUTHENTICATION_REQUIRED",
                session: { access_token: null, claims: null },
                listenerCount: 1
            }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("refresh whose transport rejects rejects TRANSPORT_FAILED with POST /auth/refresh details, clears session, and applies the listener once", async () => {
        const state = await CTGTest.init("refresh transport failure")
            .stage("act", async () => {
                const { client, auth } = await makeSeededClient([
                    { reject: new Error("network down") }
                ]);
                const seen = [];
                client.subscribe((session) => seen.push(session));
                const error = await rejectValue(auth.refresh());
                return {
                    type: error?.type,
                    method: error?.details?.method,
                    urlEndsWithRefresh: error?.details?.url?.endsWith("/auth/refresh"),
                    session: client.session(),
                    listenerCount: seen.length
                };
            })
            .assert("transport failure surfaced", (state) => state.subject, CTGTestPredicates.equals({
                type: "TRANSPORT_FAILED",
                method: "POST",
                urlEndsWithRefresh: true,
                session: { access_token: null, claims: null },
                listenerCount: 1
            }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("a refused cross-origin preflight surfaces TRANSPORT_FAILED with request details and no second attempt", async () => {
        const state = await CTGTest.init("refresh preflight refusal")
            .stage("act", async () => {
                const { auth, transport } = await makeSeededClient([
                    { reject: new TypeError("Failed to fetch") }
                ]);
                const error = await rejectValue(auth.refresh());
                const requests = afterSeed(transport);
                return {
                    type: error?.type,
                    status: error?.status,
                    method: error?.details?.method,
                    url: error?.details?.url,
                    count: requests.length,
                    credentials: requests[0]?.credentials
                };
            })
            .assert("single credentialed attempt", (state) => state.subject, CTGTestPredicates.equals({
                type: "TRANSPORT_FAILED",
                status: null,
                method: "POST",
                url: "https://s/auth/refresh",
                count: 1,
                credentials: "include"
            }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("logout succeeding returns logged_out, clears session, applies the listener once, and carries no authorization header", async () => {
        const state = await CTGTest.init("logout success")
            .stage("act", async () => {
                const { client, auth, transport } = await makeSeededClient([
                    { response: success({ status: "logged_out" }) }
                ]);
                const seen = [];
                client.subscribe((session) => seen.push(session));
                const result = await auth.logout();
                return {
                    result,
                    request: requestSummary(afterSeed(transport)[0]),
                    session: client.session(),
                    listenerCount: seen.length
                };
            })
            .assert("logout effects", (state) => state.subject, CTGTestPredicates.equals({
                result: { status: "logged_out" },
                request: {
                    method: "POST",
                    url: "https://s/auth/logout",
                    authorization: undefined,
                    body: null,
                    credentials: "include",
                    hasContentType: false
                },
                session: { access_token: null, claims: null },
                listenerCount: 1
            }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("logout whose transport rejects rejects TRANSPORT_FAILED and still clears session and applies the listener", async () => {
        const state = await CTGTest.init("logout transport failure")
            .stage("act", async () => {
                const { client, auth } = await makeSeededClient([
                    { reject: new Error("network down") }
                ]);
                const seen = [];
                client.subscribe((session) => seen.push(session));
                const error = await rejectValue(auth.logout());
                return { type: error?.type, session: client.session(), listenerCount: seen.length };
            })
            .assert("logout failure clears", (state) => state.subject, CTGTestPredicates.equals({
                type: "TRANSPORT_FAILED",
                session: { access_token: null, claims: null },
                listenerCount: 1
            }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("logout with no service session answered 200 logged_out returns it with no error", async () => {
        const state = await CTGTest.init("logout no service session")
            .stage("act", async () => {
                const { auth } = makeClient([{ response: success({ status: "logged_out" }) }]);
                return await auth.logout();
            })
            .assert("idempotent logout", (state) => state.subject,
                CTGTestPredicates.equals({ status: "logged_out" }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });
});
