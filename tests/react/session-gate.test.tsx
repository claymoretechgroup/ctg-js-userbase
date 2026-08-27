// @vitest-environment jsdom
// realizes: presentation.md > Conformance Test Cases > Session Gate

import { describe, it, expect } from "vitest";
import CTGReactTest from "ctg-react-test";
import { CTGTestResult } from "ctg-js-test";
import CTGUserbaseClient from "../../src/core/CTGUserbaseClient.js";
import Authentication from "../../src/core/Authentication.js";
import UserbaseProvider from "../../src/react/UserbaseProvider.jsx";
import RequireSession from "../../src/react/RequireSession.jsx";
import ScriptedTransport from "../support/ScriptedTransport.js";
import FixedClock from "../support/FixedClock.js";

const S = CTGTestResult.STATUS;

const success = (result: unknown) => ({
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: true, result })
});

const tokenFor = (claims: TestClaims) => {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${encode({ alg: "none" })}.${encode(claims)}.signature`;
};

const profile = { id: "u1", email: "a@example.test", name: null, roles: [], group_ids: [], totp_enabled: false, email_verified: true };

const authenticated = (claims: TestClaims & { exp: number }) => ({
    mfa_required: false,
    user: profile,
    access_token: tokenFor(claims),
    access_expires_at: claims.exp
});

const makeClient = (script: TestScriptEntry[]) => {
    const transport = ScriptedTransport.init(script);
    const client = new CTGUserbaseClient({ base_url: "https://s", transport, clock: FixedClock.init(1000) });
    return { client, transport, auth: Authentication.init(client) };
};

describe("react session gate conformance", () => {

    it("RequireSession with no session and a fallback renders fallback, not content, and performs no transport application", async () => {
        const { client, transport } = makeClient([]);
        const state = await CTGReactTest.init("session fallback")
            .assertComponent("fallback without request", (screen) => ({
                fallback: screen.getByText("fallback").textContent,
                contentAbsent: screen.queryByText("protected") === null,
                requestCount: transport.requests().length
            }), {
                fallback: "fallback",
                contentAbsent: true,
                requestCount: 0
            })
            .start(
                <UserbaseProvider client={client}>
                    <RequireSession fallback={<span>fallback</span>}><span>protected</span></RequireSession>
                </UserbaseProvider>
            );

        expect(state.status).toBe(S.PASS);
    });

    it("RequireSession with no session and no fallback renders nothing", async () => {
        const { client } = makeClient([]);
        const state = await CTGReactTest.init("session no fallback")
            .assertComponent("nothing rendered", (screen) => screen.queryByText("protected") === null, true)
            .start(<UserbaseProvider client={client}><RequireSession><span>protected</span></RequireSession></UserbaseProvider>);

        expect(state.status).toBe(S.PASS);
    });

    it("RequireSession with claims held renders content, not fallback", async () => {
        const { client, auth } = makeClient([{ response: success(authenticated({ sub: "u1", exp: 2000 })) }]);
        await auth.login({ email: "a@example.test", password: "p" });

        const state = await CTGReactTest.init("session content")
            .assertComponent("content rendered", (screen) => ({
                content: screen.getByText("protected").textContent,
                fallbackAbsent: screen.queryByText("fallback") === null
            }), {
                content: "protected",
                fallbackAbsent: true
            })
            .start(
                <UserbaseProvider client={client}>
                    <RequireSession fallback={<span>fallback</span>}><span>protected</span></RequireSession>
                </UserbaseProvider>
            );

        expect(state.status).toBe(S.PASS);
    });
});
