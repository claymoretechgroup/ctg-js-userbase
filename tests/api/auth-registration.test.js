// realizes: core/03-authentication.md > Conformance Test Cases > Registration and Verification

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

const profile = { id: "u1", email: "a@example.test", name: null, roles: [], group_ids: [], totp_enabled: false, email_verified: true };

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

describe("authentication registration and verification conformance", () => {

    it("register({ email, password }) succeeding: returns verification_sent, session unchanged, no listener applied", async () => {
        const state = await CTGTest.init("register success")
            .stage("act", async () => {
                const seen = [];
                const { client, auth } = makeClient([{ response: success({ status: "verification_sent" }) }]);
                client.subscribe((session) => seen.push(session));
                const result = await auth.register({ email: "a@example.test", password: "p" });
                return { result, session: client.session(), listenerCount: seen.length };
            })
            .assert("register effects", (state) => state.subject, CTGTestPredicates.equals({
                result: { status: "verification_sent" },
                session: { access_token: null, claims: null },
                listenerCount: 0
            }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("register with an existing address and the same service success shape returns it with no error", async () => {
        const state = await CTGTest.init("register existing address")
            .stage("act", async () => {
                const { auth } = makeClient([{ response: success({ status: "verification_sent" }) }]);
                return await auth.register({ email: "a@example.test", password: "p" });
            })
            .assert("no enumeration", (state) => state.subject,
                CTGTestPredicates.equals({ status: "verification_sent" }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("register({ email: \"nope\" }) surfaces the service's 422 parameter failure with fields verbatim after one application", async () => {
        const fields = { email: "Invalid email", password: "Required" };
        const state = await CTGTest.init("register parameter rejected")
            .stage("act", async () => {
                const { auth, transport } = makeClient([{ response: failure(422, fields) }]);
                const error = await rejectValue(auth.register({ email: "nope" }));
                return { type: error?.type, fields: error?.fields, count: transport.requests().length };
            })
            .assert("parameter failure", (state) => state.subject, CTGTestPredicates.equals({
                type: "PARAMETER_REJECTED",
                fields,
                count: 1
            }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("verifyEmail({ token }) succeeding: returns the profile and leaves session state unchanged", async () => {
        const state = await CTGTest.init("verify email success")
            .stage("act", async () => {
                const { client, auth } = makeClient([{ response: success(profile) }]);
                const result = await auth.verifyEmail({ token: "verify-token" });
                return { result, session: client.session() };
            })
            .assert("verified profile without session", (state) => state.subject, CTGTestPredicates.equals({
                result: profile,
                session: { access_token: null, claims: null }
            }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });
});
