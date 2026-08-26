// realizes: core/02-client.md > Conformance Test Cases > Session State and Subscription

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

const tokenFor = (claims) => {
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${encode({ alg: "none" })}.${encode(claims)}.signature`;
};

const profile = { id: "u1", email: "a@example.test", name: null, roles: [], group_ids: [], totp_enabled: false, email_verified: true };
const claims = { sub: "u1", exp: 2000 };

const makeClient = (script) => {
    const transport = ScriptedTransport.init(script);
    const client = new CTGUserClient({ base_url: "https://s", transport, clock: FixedClock.init(1000) });
    return { client, transport, auth: Authentication.init(client) };
};

const authenticatedResult = (accessToken) => ({
    mfa_required: false,
    user: profile,
    access_token: accessToken,
    access_expires_at: 2000
});

describe("core client session observation conformance", () => {

    it("on a new client session() is empty", async () => {
        const state = await CTGTest.init("new session empty")
            .stage("construct", () => makeClient([]).client.session())
            .assert("empty session", (state) => state.subject, CTGTestPredicates.equals({ access_token: null, claims: null }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("session() has exactly access_token and claims properties as the absence case for the refresh credential", async () => {
        const state = await CTGTest.init("session surface")
            .stage("construct", () => Object.keys(makeClient([]).client.session()).sort())
            .assert("two properties", (state) => state.subject, CTGTestPredicates.equals(["access_token", "claims"]))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("changing the value returned by session() does not change a later session()", async () => {
        const state = await CTGTest.init("session immutable from outside")
            .stage("mutate returned value", () => {
                const client = makeClient([]).client;
                const returned = client.session();
                try {
                    returned.access_token = "changed";
                    returned.claims = { sub: "changed" };
                } catch {
                    // A frozen return value is also conforming.
                }
                return client.session();
            })
            .assert("later session unchanged", (state) => state.subject, CTGTestPredicates.equals({ access_token: null, claims: null }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("subscribe(L) then successful login applies L once with the new session state", async () => {
        const state = await CTGTest.init("subscribe login")
            .stage("act", async () => {
                const token = tokenFor(claims);
                const seen = [];
                const { client, auth } = makeClient([
                    { response: success(authenticatedResult(token)) }
                ]);
                client.subscribe((session) => seen.push(session));
                await auth.login({ email: "a@example.test", password: "p" });
                return { count: seen.length, session: seen[0] };
            })
            .assert("listener saw login session", (state) => ({
                count: state.subject.count,
                access_token: state.subject.session?.access_token,
                claims: state.subject.session?.claims
            }), CTGTestPredicates.equals({ count: 1, access_token: tokenFor(claims), claims }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("two subscribers are applied in registration order", async () => {
        const state = await CTGTest.init("subscriber order")
            .stage("act", async () => {
                const events = [];
                const { client, auth } = makeClient([
                    { response: success(authenticatedResult(tokenFor(claims))) }
                ]);
                client.subscribe(() => events.push("first"));
                client.subscribe(() => events.push("second"));
                await auth.login({ email: "a@example.test", password: "p" });
                return events;
            })
            .assert("registration order", (state) => state.subject, CTGTestPredicates.equals(["first", "second"]))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("subscribe(L), unsubscribe(), then successful login does not apply L", async () => {
        const state = await CTGTest.init("unsubscribe before login")
            .stage("act", async () => {
                let count = 0;
                const { client, auth } = makeClient([
                    { response: success(authenticatedResult(tokenFor(claims))) }
                ]);
                const unsubscribe = client.subscribe(() => { count += 1; });
                unsubscribe();
                await auth.login({ email: "a@example.test", password: "p" });
                return count;
            })
            .assert("listener not called", (state) => state.subject, CTGTestPredicates.equals(0))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("unsubscribe() applied twice raises no error", async () => {
        const state = await CTGTest.init("unsubscribe idempotent")
            .stage("act", () => {
                const { client } = makeClient([]);
                const unsubscribe = client.subscribe(() => {});
                unsubscribe();
                unsubscribe();
                return true;
            })
            .assert("completed", (state) => state.subject, CTGTestPredicates.equals(true))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("two successive refreshes returning identical claim values apply the listener twice", async () => {
        const state = await CTGTest.init("equal refresh notifications")
            .stage("act", async () => {
                const token = tokenFor(claims);
                const seen = [];
                const { client, auth } = makeClient([
                    { response: success(authenticatedResult(token)) },
                    { response: success(authenticatedResult(token)) }
                ]);
                client.subscribe((session) => seen.push(session));
                await auth.refresh();
                await auth.refresh();
                return seen.map((session) => session.claims);
            })
            .assert("two notifications", (state) => state.subject, CTGTestPredicates.equals([claims, claims]))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });
});
