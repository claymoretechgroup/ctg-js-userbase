// realizes: core/02-client.md > Conformance Test Cases > Construction

import { describe, it, expect } from "vitest";
import { CTGTest, CTGTestPredicates, CTGTestResult } from "ctg-js-test";
import CTGUserClient from "../../src/core/CTGUserClient.js";
import AccountManagement from "../../src/core/AccountManagement.js";
import Authentication from "../../src/core/Authentication.js";
import ScriptedTransport from "../support/ScriptedTransport.js";
import FixedClock from "../support/FixedClock.js";

const { STATUS } = CTGTestResult;

const success = (result) => ({
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: true, result })
});

const errorFrom = (fn) => {
    try {
        fn();
        return null;
    } catch (error) {
        return error;
    }
};

const tokenFor = (claims) => {
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${encode({ alg: "none" })}.${encode(claims)}.signature`;
};

const claims = { sub: "u1", exp: 2000 };
const profile = { id: "u1", email: "a@example.test", name: null, roles: [], group_ids: [], totp_enabled: false, email_verified: true };

describe("core client construction conformance", () => {

    it("constructor with base_url, transport, and clock returns a client and performs no request", async () => {
        const state = await CTGTest.init("constructor accepted")
            .stage("construct", () => {
                const transport = ScriptedTransport.init([]);
                const client = new CTGUserClient({ base_url: "https://s", transport, clock: FixedClock.init(1000) });
                return { client, transport };
            })
            .assert("client shape and zero requests", (state) => ({
                hasClient: state.subject.client instanceof CTGUserClient,
                requestCount: state.subject.transport.requests().length
            }), CTGTestPredicates.equals({ hasClient: true, requestCount: 0 }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("constructor without transport is rejected with CONFIGURATION_INVALID for transport", async () => {
        const state = await CTGTest.init("constructor missing transport")
            .stage("construct", () => errorFrom(() => new CTGUserClient({ base_url: "https://s", clock: FixedClock.init(1000) })))
            .assert("transport field error", (state) => ({
                type: state.subject?.type,
                field: state.subject?.details?.field
            }), CTGTestPredicates.equals({ type: "CONFIGURATION_INVALID", field: "transport" }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("constructor without clock is rejected with CONFIGURATION_INVALID for clock", async () => {
        const state = await CTGTest.init("constructor missing clock")
            .stage("construct", () => errorFrom(() => new CTGUserClient({ base_url: "https://s", transport: ScriptedTransport.init([]) })))
            .assert("clock field error", (state) => ({
                type: state.subject?.type,
                field: state.subject?.details?.field
            }), CTGTestPredicates.equals({ type: "CONFIGURATION_INVALID", field: "clock" }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("constructor with non-string base_url is rejected with CONFIGURATION_INVALID for base_url", async () => {
        const state = await CTGTest.init("constructor invalid base_url")
            .stage("construct", () => errorFrom(() => new CTGUserClient({
                base_url: 7,
                transport: ScriptedTransport.init([]),
                clock: FixedClock.init(1000)
            })))
            .assert("base_url field error", (state) => ({
                type: state.subject?.type,
                field: state.subject?.details?.field
            }), CTGTestPredicates.equals({ type: "CONFIGURATION_INVALID", field: "base_url" }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("constructor without base_url is accepted and a later getProfile request uses /me", async () => {
        const state = await CTGTest.init("constructor default base_url")
            .stage("arrange and act", async () => {
                const transport = ScriptedTransport.init([
                    { response: success(profile) }
                ]);
                const client = new CTGUserClient({ transport, clock: FixedClock.init(1000) });
                await AccountManagement.init(client).getProfile();
                return transport.requests()[0].url;
            })
            .assert("url is path only", (state) => state.subject, CTGTestPredicates.equals("/me"))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("constructor strips trailing slash before a later getProfile request", async () => {
        const state = await CTGTest.init("constructor strips slash")
            .stage("arrange and act", async () => {
                const transport = ScriptedTransport.init([
                    { response: success(profile) }
                ]);
                const client = new CTGUserClient({ base_url: "https://s/", transport, clock: FixedClock.init(1000) });
                await AccountManagement.init(client).getProfile();
                return transport.requests()[0].url;
            })
            .assert("url has one slash before /me", (state) => state.subject, CTGTestPredicates.equals("https://s/me"))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("client constructed after another client completed login starts with empty session", async () => {
        const state = await CTGTest.init("constructor no persistence")
            .stage("login first client then construct second", async () => {
                const token = tokenFor(claims);
                const transport = ScriptedTransport.init([
                    { response: success({ mfa_required: false, user: profile, access_token: token, access_expires_at: 2000 }) }
                ]);
                const clock = FixedClock.init(1000);
                const clientA = new CTGUserClient({ base_url: "https://s", transport, clock });
                await Authentication.init(clientA).login({ email: "a@example.test", password: "p" });
                const clientB = new CTGUserClient({ base_url: "https://s", transport: ScriptedTransport.init([]), clock });
                return clientB.session();
            })
            .assert("second client session empty", (state) => state.subject, CTGTestPredicates.equals({ access_token: null, claims: null }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });
});
