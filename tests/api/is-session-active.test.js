// realizes: core/02-client.md > Conformance Test Cases > `isSessionActive`

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

const clientWithClaims = async (claims, now) => {
    const token = tokenFor(claims);
    const transport = ScriptedTransport.init([
        { response: success({ mfa_required: false, user: profile, access_token: token, access_expires_at: claims.exp }) }
    ]);
    const client = new CTGUserClient({ base_url: "https://s", transport, clock: FixedClock.init(now) });
    await Authentication.init(client).login({ email: "a@example.test", password: "p" });
    return { client, transport };
};

describe("core client isSessionActive conformance", () => {

    it("claims null returns false and performs no request", async () => {
        const state = await CTGTest.init("inactive without claims")
            .stage("act", () => {
                const transport = ScriptedTransport.init([]);
                const client = new CTGUserClient({ base_url: "https://s", transport, clock: FixedClock.init(1000) });
                return { active: client.isSessionActive(), count: transport.requests().length };
            })
            .assert("inactive and no transport", (state) => state.subject,
                CTGTestPredicates.equals({ active: false, count: 0 }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("claims.exp 2000 and clock now 1999 returns true", async () => {
        const state = await CTGTest.init("active before exp")
            .stage("act", async () => {
                const { client } = await clientWithClaims({ sub: "u1", exp: 2000 }, 1999);
                return client.isSessionActive();
            })
            .assert("active", (state) => state.subject, CTGTestPredicates.equals(true))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("claims.exp 2000 and clock now 2000 returns false", async () => {
        const state = await CTGTest.init("inactive at exp")
            .stage("act", async () => {
                const { client } = await clientWithClaims({ sub: "u1", exp: 2000 }, 2000);
                return client.isSessionActive();
            })
            .assert("inactive", (state) => state.subject, CTGTestPredicates.equals(false))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("claims.exp 2000 and clock now 2001 returns false and performs no renewal request", async () => {
        const state = await CTGTest.init("inactive after exp no renewal")
            .stage("act", async () => {
                const { client, transport } = await clientWithClaims({ sub: "u1", exp: 2000 }, 2001);
                const before = transport.requests().length;
                return { active: client.isSessionActive(), extraRequests: transport.requests().length - before };
            })
            .assert("inactive and no extra transport", (state) => state.subject,
                CTGTestPredicates.equals({ active: false, extraRequests: 0 }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });
});
