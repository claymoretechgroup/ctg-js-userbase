// realizes: core/04-account-management.md > Conformance Test Cases > Account Management

import { describe, it, expect } from "vitest";
import { CTGTest, CTGTestPredicates, CTGTestResult } from "ctg-js-test";
import CTGUserbaseClient from "../../src/core/CTGUserbaseClient.js";
import Authentication from "../../src/core/Authentication.js";
import AccountManagement from "../../src/core/AccountManagement.js";
import ScriptedTransport from "../support/ScriptedTransport.js";
import FixedClock from "../support/FixedClock.js";

const { STATUS } = CTGTestResult;

const success = (result: unknown, status = 200) => ({
    status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: true, result })
});

const failure = (status: number, result: unknown) => ({
    status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: false, result })
});

const noContent = () => ({
    status: 204,
    headers: {},
    body: ""
});

const tokenFor = (claims: TestClaims) => {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${encode({ alg: "none" })}.${encode(claims)}.signature`;
};

const profile = { id: "u1", email: "a@example.test", name: null, roles: [], group_ids: [], totp_enabled: false, email_verified: true };
const updatedProfile = { ...profile, name: "A" };
const claims = { sub: "u1", exp: 3000 };
const token = tokenFor(claims);

const authenticated = {
    mfa_required: false,
    user: profile,
    access_token: token,
    access_expires_at: 3000
};

const sessions = [
    { id: "s1", ip: "127.0.0.1", user_agent: "UA", created_at: 1000, last_used_at: 1100, current: true }
];

const makeClient = (script: TestScriptEntry[]) => {
    const transport = ScriptedTransport.init(script);
    const client = new CTGUserbaseClient({ base_url: "https://s", transport, clock: FixedClock.init(1000) });
    return { client, transport, auth: Authentication.init(client), account: AccountManagement.init(client) };
};

const makeSeededClient = async (script: TestScriptEntry[]) => {
    const setup = makeClient([
        { response: success(authenticated) },
        ...script
    ]);
    await setup.auth.login({ email: "a@example.test", password: "p" });
    return setup;
};

const rejectValue = async (promise: TestPromise): Promise<TestErrorShape | null> => {
    try {
        await promise;
        return null;
    } catch (error) {
        return error as TestErrorShape;
    }
};

const afterSeed = (transport: TestScriptedTransport) => transport.requests().slice(1);

describe("account management conformance", () => {

    it("getProfile succeeding returns the profile and leaves session state unchanged", async () => {
        const state = await CTGTest.init("account get profile")
            .stage("act", async () => {
                const { client, account } = await makeSeededClient([
                    { response: success(profile) }
                ]);
                const result = await account.getProfile();
                return { result, session: client.session() };
            })
            .assert("profile read", (state) => state.subject, CTGTestPredicates.equals<unknown>({
                result: profile,
                session: { access_token: token, claims }
            }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("listSessions succeeding returns the list of summaries", async () => {
        const state = await CTGTest.init("account list sessions")
            .stage("act", async () => {
                const { account } = await makeSeededClient([
                    { response: success(sessions) }
                ]);
                return await account.listSessions();
            })
            .assert("sessions returned", (state) => state.subject, CTGTestPredicates.equals<unknown>(sessions))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("revokeSession({ id }) answered 204 returns VOID", async () => {
        const state = await CTGTest.init("account revoke session")
            .stage("act", async () => {
                const { account, transport } = await makeSeededClient([
                    { response: noContent() }
                ]);
                const result = await account.revokeSession({ id: "s1" });
                const request = transport.requestAt(1);
                return {
                    result,
                    request: {
                        method: request.method,
                        url: request.url,
                        authorization: request.headers?.Authorization,
                        body: request.body
                    }
                };
            })
            .assert("void revoke", (state) => state.subject, CTGTestPredicates.equals<unknown>({
                result: undefined,
                request: {
                    method: "DELETE",
                    url: "https://s/me/session?id=s1",
                    authorization: `Bearer ${token}`,
                    body: null
                }
            }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("revokeOtherSessions succeeding returns revoked count and leaves session state unchanged", async () => {
        const state = await CTGTest.init("account revoke other sessions")
            .stage("act", async () => {
                const { client, account } = await makeSeededClient([
                    { response: success({ status: "revoked", count: 2 }) }
                ]);
                const result = await account.revokeOtherSessions();
                return { result, session: client.session() };
            })
            .assert("other sessions revoked", (state) => state.subject, CTGTestPredicates.equals<unknown>({
                result: { status: "revoked", count: 2 },
                session: { access_token: token, claims }
            }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("confirmEmailChange({ token }) while a session is held carries no authorization and leaves session unchanged", async () => {
        const state = await CTGTest.init("account confirm email change")
            .stage("act", async () => {
                const { client, account, transport } = await makeSeededClient([
                    { response: success(updatedProfile) }
                ]);
                const result = await account.confirmEmailChange({ token: "email-token" });
                const request = transport.requestAt(1);
                return {
                    result,
                    authorization: request.headers?.Authorization,
                    body: request.body,
                    session: client.session()
                };
            })
            .assert("email token credential", (state) => state.subject, CTGTestPredicates.equals<unknown>({
                result: updatedProfile,
                authorization: undefined,
                body: JSON.stringify({ token: "email-token" }),
                session: { access_token: token, claims }
            }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("revertEmailChange({ token }) carries no authorization and leaves session unchanged", async () => {
        const state = await CTGTest.init("account revert email change")
            .stage("act", async () => {
                const { client, account, transport } = await makeSeededClient([
                    { response: success({ status: "reverted" }) }
                ]);
                const result = await account.revertEmailChange({ token: "revert-token" });
                const request = transport.requestAt(1);
                return {
                    result,
                    authorization: request.headers?.Authorization,
                    body: request.body,
                    session: client.session()
                };
            })
            .assert("revert token credential", (state) => state.subject, CTGTestPredicates.equals<unknown>({
                result: { status: "reverted" },
                authorization: undefined,
                body: JSON.stringify({ token: "revert-token" }),
                session: { access_token: token, claims }
            }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("changePassword answered 422 PASSWORD_POLICY_VIOLATION surfaces SERVICE_ERROR details.failed", async () => {
        const state = await CTGTest.init("account change password policy")
            .stage("act", async () => {
                const { account } = await makeSeededClient([
                    {
                        response: failure(422, {
                            type: "PASSWORD_POLICY_VIOLATION",
                            message: "Password policy violation",
                            details: { failed: ["length"] }
                        })
                    }
                ]);
                const error = await rejectValue(account.changePassword({
                    current_password: "old",
                    new_password: "short"
                }));
                return {
                    type: error?.type,
                    service_type: error?.service_type,
                    details: error?.details
                };
            })
            .assert("policy details surfaced", (state) => state.subject, CTGTestPredicates.equals<unknown>({
                type: "SERVICE_ERROR",
                service_type: "PASSWORD_POLICY_VIOLATION",
                details: { failed: ["length"] }
            }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("confirmMFA({ code }) succeeding returns recovery codes", async () => {
        const recovery = { recovery_codes: ["r1", "r2"] };
        const state = await CTGTest.init("account confirm mfa")
            .stage("act", async () => {
                const { account } = await makeSeededClient([
                    { response: success(recovery) }
                ]);
                return await account.confirmMFA({ code: "123456" });
            })
            .assert("recovery codes returned", (state) => state.subject, CTGTestPredicates.equals<unknown>(recovery))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("updateProfile({}) sends JSON text of {} and invents no property", async () => {
        const state = await CTGTest.init("account update profile empty")
            .stage("act", async () => {
                const { account, transport } = await makeSeededClient([
                    { response: success(profile) }
                ]);
                await account.updateProfile({});
                return transport.requestAt(1).body;
            })
            .assert("empty body", (state) => state.subject, CTGTestPredicates.equals<unknown>(JSON.stringify({})))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });
});
