// realizes: core/03-authentication.md > Conformance Test Cases > Second Factor

import { describe, it, expect } from "vitest";
import { CTGTest, CTGTestPredicates, CTGTestResult } from "ctg-js-test";
import CTGUserbaseClient from "../../src/core/CTGUserbaseClient.js";
import Authentication from "../../src/core/Authentication.js";
import ScriptedTransport from "../support/ScriptedTransport.js";
import FixedClock from "../support/FixedClock.js";

const { STATUS } = CTGTestResult;

const success = (result: unknown) => ({
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: true, result })
});

const failure = (status: number, result: unknown) => ({
    status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: false, result })
});

const tokenFor = (claims: TestClaims) => {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${encode({ alg: "none" })}.${encode(claims)}.signature`;
};

const profile = { id: "u1", email: "a@example.test", name: null, roles: [], group_ids: [], totp_enabled: true, email_verified: true };
const oldClaims = { sub: "u1", exp: 2000 };
const newClaims = { sub: "u1", exp: 4000 };
const oldToken = tokenFor(oldClaims);
const newToken = tokenFor(newClaims);

const completedLogin = {
    mfa_required: false,
    user: profile,
    access_token: oldToken,
    access_expires_at: 2000
};

const challenge = {
    mfa_required: true,
    mfa_token: "mfa-token",
    mfa_expires_at: 1200
};

const authenticated = {
    user: profile,
    access_token: newToken,
    access_expires_at: 4000
};

const makeClient = (script: TestScriptEntry[]) => {
    const transport = ScriptedTransport.init(script);
    const client = new CTGUserbaseClient({ base_url: "https://s", transport, clock: FixedClock.init(1000) });
    return { client, transport, auth: Authentication.init(client) };
};

const makeMFAClient = async (script: TestScriptEntry[]) => {
    const setup = makeClient([
        { response: success(challenge) },
        ...script
    ]);
    await setup.auth.login({ email: "a@example.test", password: "p" });
    return setup;
};

const makeSessionAndMFAClient = async (script: TestScriptEntry[]) => {
    const setup = makeClient([
        { response: success(completedLogin) },
        { response: success(challenge) },
        ...script
    ]);
    await setup.auth.login({ email: "a@example.test", password: "p" });
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

const afterMFASeed = (transport: TestScriptedTransport) => transport.requests().slice(1);
const afterSessionAndMFASeed = (transport: TestScriptedTransport) => transport.requests().slice(2);

describe("authentication second factor conformance", () => {

    it("verifyMFA({ mfa_token: M, code: \"123456\" }) carries M, replaces session, and applies the listener once", async () => {
        const state = await CTGTest.init("verify mfa success")
            .stage("act", async () => {
                const { client, auth, transport } = await makeMFAClient([
                    { response: success(authenticated) }
                ]);
                const seen: unknown[] = [];
                client.subscribe((session) => seen.push(session));
                const result = await auth.verifyMFA({ mfa_token: challenge.mfa_token, code: "123456" });
                const request = transport.requestAt(1);
                return {
                    result,
                    request: {
                        method: request.method,
                        url: request.url,
                        authorization: request.headers?.Authorization,
                        body: request.body
                    },
                    session: client.session(),
                    listenerCount: seen.length
                };
            })
            .assert("challenge token completed", (state) => state.subject, CTGTestPredicates.equals<unknown>({
                result: authenticated,
                request: {
                    method: "POST",
                    url: "https://s/auth/mfa/verify",
                    authorization: `Bearer ${challenge.mfa_token}`,
                    body: JSON.stringify({ code: "123456" })
                },
                session: { access_token: newToken, claims: newClaims },
                listenerCount: 1
            }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("verifyMFA while a session access token is held still carries M", async () => {
        const state = await CTGTest.init("verify mfa ignores held session")
            .stage("act", async () => {
                const { auth, transport } = await makeSessionAndMFAClient([
                    { response: success(authenticated) }
                ]);
                await auth.verifyMFA({ mfa_token: challenge.mfa_token, code: "123456" });
                const request = transport.requestAt(2);
                return {
                    authorization: request.headers?.Authorization,
                    body: request.body
                };
            })
            .assert("mfa token used", (state) => state.subject, CTGTestPredicates.equals<unknown>({
                authorization: `Bearer ${challenge.mfa_token}`,
                body: JSON.stringify({ code: "123456" })
            }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("verifyMFA answered 401 rejects AUTHENTICATION_REQUIRED and performs exactly one non-renewed application", async () => {
        const state = await CTGTest.init("verify mfa 401 no renewal")
            .stage("act", async () => {
                const { auth, transport } = await makeMFAClient([
                    { response: failure(401, "Authorization token required") }
                ]);
                const error = await rejectValue(auth.verifyMFA({ mfa_token: challenge.mfa_token, code: "123456" }));
                return {
                    type: error?.type,
                    count: afterMFASeed(transport).length
                };
            })
            .assert("not renewal eligible", (state) => state.subject, CTGTestPredicates.equals<unknown>({
                type: "AUTHENTICATION_REQUIRED",
                count: 1
            }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("verifyMFA({ mfa_token: M }) with neither code nor recovery code surfaces the service answer unchanged", async () => {
        const fields = { code: "Required" };
        const state = await CTGTest.init("verify mfa missing factor")
            .stage("act", async () => {
                const { auth, transport } = await makeMFAClient([
                    { response: failure(422, fields) }
                ]);
                const error = await rejectValue(auth.verifyMFA({ mfa_token: challenge.mfa_token }));
                const request = transport.requestAt(1);
                return {
                    type: error?.type,
                    fields: error?.fields,
                    count: afterMFASeed(transport).length,
                    body: request.body
                };
            })
            .assert("parameter failure surfaced", (state) => state.subject, CTGTestPredicates.equals<unknown>({
                type: "PARAMETER_REJECTED",
                fields,
                count: 1,
                body: JSON.stringify({})
            }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });
});
