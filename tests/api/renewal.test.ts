// realizes: core/02-client.md > Conformance Test Cases > Renewal

import { describe, it, expect } from "vitest";
import { CTGTest, CTGTestPredicates, CTGTestResult } from "ctg-js-test";
import CTGUserbaseClient from "../../src/core/CTGUserbaseClient.js";
import Authentication from "../../src/core/Authentication.js";
import AccountManagement from "../../src/core/AccountManagement.js";
import Administration from "../../src/core/Administration.js";
import type { Authenticated } from "../../src/core/types.js";
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

const profile = { id: "u1", email: "a@example.test", name: null, roles: [], group_ids: [], totp_enabled: false, email_verified: true };
const role = { name: "administrator", permissions: ["users:read"], scoped: false, reserved: true };
const oldToken = tokenFor({ sub: "u1", exp: 1000 });
const newToken = tokenFor({ sub: "u1", exp: 3000 });
const laterToken = tokenFor({ sub: "u1", exp: 4000 });

const authenticated = (token: string) => ({
    mfa_required: false,
    user: profile,
    access_token: token,
    access_expires_at: 3000
});

const makeSeededClient = async (script: TestScriptEntry[]) => {
    const transport = ScriptedTransport.init([
        { response: success(authenticated(oldToken)) },
        ...script
    ]);
    const client = new CTGUserbaseClient({ base_url: "https://s", transport, clock: FixedClock.init(1000) });
    await Authentication.init(client).login({ email: "a@example.test", password: "p" });
    return { client, transport };
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

describe("core client renewal conformance", () => {

    it("one eligible request, refresh succeeds, replay succeeds: user receives replay result and replay carries new token", async () => {
        const state = await CTGTest.init("renewal success")
            .stage("act", async () => {
                const { client, transport } = await makeSeededClient([
                    { response: failure(401, "Authorization token required") },
                    { response: success(authenticated(newToken)) },
                    { response: success({ ok: true }) }
                ]);
                const result = await client.request("GET", "/r");
                const requests = afterSeed(transport);
                return {
                    result,
                    count: requests.length,
                    urls: requests.map((request) => request.url),
                    replayAuthorization: transport.requestAt(3).headers?.Authorization,
                    sessionToken: client.session().access_token
                };
            })
            .assert("one renewal one replay", (state) => state.subject, CTGTestPredicates.equals<unknown>({
                result: { ok: true },
                count: 3,
                urls: ["https://s/r", "https://s/auth/refresh", "https://s/r"],
                replayAuthorization: `Bearer ${newToken}`,
                sessionToken: newToken
            }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("one eligible request, refresh succeeds, replay answers 401 again: rejects AUTHENTICATION_REQUIRED with no second refresh", async () => {
        const state = await CTGTest.init("renewal replay 401")
            .stage("act", async () => {
                const { client, transport } = await makeSeededClient([
                    { response: failure(401, "Authorization token required") },
                    { response: success(authenticated(newToken)) },
                    { response: failure(401, "Authorization token required") }
                ]);
                const error = await rejectValue(client.request("GET", "/r"));
                return {
                    type: error?.type,
                    count: afterSeed(transport).length,
                    refreshCount: afterSeed(transport).filter((request) => request.url === "https://s/auth/refresh").length
                };
            })
            .assert("no second refresh", (state) => state.subject,
                CTGTestPredicates.equals<unknown>({ type: "AUTHENTICATION_REQUIRED", count: 3, refreshCount: 1 }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("one eligible request, refresh answers 401: rejects AUTHENTICATION_REQUIRED, two transport applications, session cleared", async () => {
        const state = await CTGTest.init("renewal refresh 401")
            .stage("act", async () => {
                const { client, transport } = await makeSeededClient([
                    { response: failure(401, "Authorization token required") },
                    { response: failure(401, "Authorization token required") }
                ]);
                const error = await rejectValue(client.request("GET", "/r"));
                return { type: error?.type, count: afterSeed(transport).length, session: client.session() };
            })
            .assert("session cleared", (state) => state.subject, CTGTestPredicates.equals<unknown>({
                type: "AUTHENTICATION_REQUIRED",
                count: 2,
                session: { access_token: null, claims: null }
            }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("one eligible request, refresh transport rejects: rejects TRANSPORT_FAILED and session cleared", async () => {
        const state = await CTGTest.init("renewal refresh transport failure")
            .stage("act", async () => {
                const { client, transport } = await makeSeededClient([
                    { response: failure(401, "Authorization token required") },
                    { reject: new Error("network down") }
                ]);
                const error = await rejectValue(client.request("GET", "/r"));
                return { type: error?.type, session: client.session(), count: afterSeed(transport).length };
            })
            .assert("transport failure clears", (state) => state.subject, CTGTestPredicates.equals<unknown>({
                type: "TRANSPORT_FAILED",
                session: { access_token: null, claims: null },
                count: 2
            }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("single-flight: three eligible requests before settlement start one refresh and replay each once", async () => {
        const state = await CTGTest.init("renewal single flight success")
            .stage("act", async () => {
                const { client, transport } = await makeSeededClient([
                    { response: failure(401, "Authorization token required") },
                    { response: failure(401, "Authorization token required") },
                    { response: failure(401, "Authorization token required") },
                    { response: success(authenticated(newToken)) },
                    { response: success({ id: "a" }) },
                    { response: success({ id: "b" }) },
                    { response: success({ id: "c" }) }
                ]);
                const results = await Promise.all([
                    client.request("GET", "/a"),
                    client.request("GET", "/b"),
                    client.request("GET", "/c")
                ]);
                const requests = afterSeed(transport);
                return {
                    results,
                    refreshCount: requests.filter((request) => request.url === "https://s/auth/refresh").length,
                    replayUrls: requests.slice(4).map((request) => request.url),
                    replayAuthorizations: requests.slice(4).map((request) => request.headers?.Authorization)
                };
            })
            .assert("single refresh", (state) => state.subject, CTGTestPredicates.equals<unknown>({
                results: [{ id: "a" }, { id: "b" }, { id: "c" }],
                refreshCount: 1,
                replayUrls: ["https://s/a", "https://s/b", "https://s/c"],
                replayAuthorizations: [`Bearer ${newToken}`, `Bearer ${newToken}`, `Bearer ${newToken}`]
            }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("single-flight with failing refresh rejects all waiters, replays none, applies listener once, and uses four applications", async () => {
        const state = await CTGTest.init("renewal single flight failure")
            .stage("act", async () => {
                const { client, transport } = await makeSeededClient([
                    { response: failure(401, "Authorization token required") },
                    { response: failure(401, "Authorization token required") },
                    { response: failure(401, "Authorization token required") },
                    { response: failure(401, "Authorization token required") }
                ]);
                const notifications = [];
                client.subscribe((session) => notifications.push(session));
                const errors = await Promise.all([
                    rejectValue(client.request("GET", "/a")),
                    rejectValue(client.request("GET", "/b")),
                    rejectValue(client.request("GET", "/c"))
                ]);
                return {
                    errorTypes: errors.map((error) => error?.type),
                    count: afterSeed(transport).length,
                    notificationCount: notifications.length,
                    replayCount: afterSeed(transport).filter((request) => ["/a", "/b", "/c"].some((path) => request.url.endsWith(path))).length - 3
                };
            })
            .assert("shared failure effects", (state) => state.subject, CTGTestPredicates.equals<unknown>({
                errorTypes: ["AUTHENTICATION_REQUIRED", "AUTHENTICATION_REQUIRED", "AUTHENTICATION_REQUIRED"],
                count: 4,
                notificationCount: 1,
                replayCount: 0
            }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("renewal is not shared across settled renewals: a later request starts a second refresh", async () => {
        const state = await CTGTest.init("renewal resets after settle")
            .stage("act", async () => {
                const { client, transport } = await makeSeededClient([
                    { response: failure(401, "Authorization token required") },
                    { response: success(authenticated(newToken)) },
                    { response: success({ first: true }) },
                    { response: failure(401, "Authorization token required") },
                    { response: success(authenticated(laterToken)) },
                    { response: success({ second: true }) }
                ]);
                const first = await client.request("GET", "/r1");
                const second = await client.request("GET", "/r2");
                return {
                    first,
                    second,
                    refreshCount: afterSeed(transport).filter((request) => request.url === "https://s/auth/refresh").length
                };
            })
            .assert("two refreshes", (state) => state.subject,
                CTGTestPredicates.equals<unknown>({ first: { first: true }, second: { second: true }, refreshCount: 2 }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("403 on an eligible request rejects SERVICE_ERROR PERMISSION_DENIED with one application and no refresh", async () => {
        const state = await CTGTest.init("renewal no 403")
            .stage("act", async () => {
                const { client, transport } = await makeSeededClient([
                    { response: failure(403, { type: "PERMISSION_DENIED", message: "Denied" }) }
                ]);
                const error = await rejectValue(client.request("GET", "/r"));
                return {
                    type: error?.type,
                    service_type: error?.service_type,
                    count: afterSeed(transport).length,
                    refreshCount: afterSeed(transport).filter((request) => request.url === "https://s/auth/refresh").length
                };
            })
            .assert("no renewal on 403", (state) => state.subject, CTGTestPredicates.equals<unknown>({
                type: "SERVICE_ERROR",
                service_type: "PERMISSION_DENIED",
                count: 1,
                refreshCount: 0
            }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("401 on refresh itself uses one transport application and no nested refresh", async () => {
        const state = await CTGTest.init("refresh no nested renewal")
            .stage("act", async () => {
                const transport = ScriptedTransport.init([{ response: failure(401, "Authorization token required") }]);
                const client = new CTGUserbaseClient({ base_url: "https://s", transport, clock: FixedClock.init(1000) });
                const error = await rejectValue(Authentication.init(client).refresh());
                return {
                    type: error?.type,
                    count: transport.requests().length,
                    urls: transport.requests().map((request) => request.url)
                };
            })
            .assert("one refresh only", (state) => state.subject, CTGTestPredicates.equals<unknown>({
                type: "AUTHENTICATION_REQUIRED",
                count: 1,
                urls: ["https://s/auth/refresh"]
            }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("401 on verifyMFA uses one transport application and no refresh", async () => {
        const state = await CTGTest.init("verifyMFA no renewal")
            .stage("act", async () => {
                const { client, transport } = await makeSeededClient([
                    { response: failure(401, "Authorization token required") }
                ]);
                const error = await rejectValue(Authentication.init(client).verifyMFA({ mfa_token: "M", code: "123456" }));
                return {
                    type: error?.type,
                    count: afterSeed(transport).length,
                    authorization: transport.requestAt(1).headers?.Authorization
                };
            })
            .assert("challenge token used once", (state) => state.subject,
                CTGTestPredicates.equals<unknown>({ type: "AUTHENTICATION_REQUIRED", count: 1, authorization: "Bearer M" }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("401 on confirmEmailChange uses one transport application and no refresh", async () => {
        const state = await CTGTest.init("confirmEmailChange no renewal")
            .stage("act", async () => {
                const { client, transport } = await makeSeededClient([
                    { response: failure(401, "Authorization token required") }
                ]);
                const error = await rejectValue(AccountManagement.init(client).confirmEmailChange({ token: "email-token" }));
                return {
                    type: error?.type,
                    count: afterSeed(transport).length,
                    authorization: transport.requestAt(1).headers?.Authorization
                };
            })
            .assert("email token operation not eligible", (state) => state.subject,
                CTGTestPredicates.equals<unknown>({ type: "AUTHENTICATION_REQUIRED", count: 1, authorization: undefined }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("401 on bootstrapAdmin uses one transport application and no refresh", async () => {
        const state = await CTGTest.init("bootstrapAdmin no renewal")
            .stage("act", async () => {
                const { client, transport } = await makeSeededClient([
                    { response: failure(401, "Authorization token required") }
                ]);
                const error = await rejectValue(Administration.init(client).bootstrapAdmin({
                    secret: "s",
                    email: "admin@example.test",
                    password: "p"
                }));
                return {
                    type: error?.type,
                    count: afterSeed(transport).length,
                    authorization: transport.requestAt(1).headers?.Authorization
                };
            })
            .assert("bootstrap not eligible", (state) => state.subject,
                CTGTestPredicates.equals<unknown>({ type: "AUTHENTICATION_REQUIRED", count: 1, authorization: undefined }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("cross-origin renewal limit: refresh answers 401, original and refresh only, no replay, rejects, and session clears", async () => {
        const state = await CTGTest.init("cross-origin renewal limit")
            .stage("act", async () => {
                const { client, transport } = await makeSeededClient([
                    { response: failure(401, "Authorization token required") },
                    { response: failure(401, "Authorization token required") }
                ]);
                const error = await rejectValue(client.request("GET", "/r"));
                return {
                    type: error?.type,
                    count: afterSeed(transport).length,
                    urls: afterSeed(transport).map((request) => request.url),
                    session: client.session()
                };
            })
            .assert("no workaround", (state) => state.subject, CTGTestPredicates.equals<unknown>({
                type: "AUTHENTICATION_REQUIRED",
                count: 2,
                urls: ["https://s/r", "https://s/auth/refresh"],
                session: { access_token: null, claims: null }
            }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("login, getProfile, and listRoles each complete normally while no refresh request is made", async () => {
        const state = await CTGTest.init("non-renewal operations succeed")
            .stage("act", async () => {
                const transport = ScriptedTransport.init([
                    { response: success(authenticated(oldToken)) },
                    { response: success(profile) },
                    { response: success([role]) },
                    { response: failure(401, "Authorization token required") }
                ]);
                const client = new CTGUserbaseClient({ base_url: "https://s", transport, clock: FixedClock.init(1000) });
                const login = await Authentication.init(client).login({ email: "a@example.test", password: "p" }) as Authenticated;
                const profileResult = await AccountManagement.init(client).getProfile();
                const roles = await Administration.init(client).listRoles();
                return {
                    loginToken: login.access_token,
                    profileResult,
                    roles,
                    urls: transport.requests().map((request) => request.url),
                    refreshCount: transport.requests().filter((request) => request.url === "https://s/auth/refresh").length
                };
            })
            .assert("normal completions", (state) => state.subject, CTGTestPredicates.equals<unknown>({
                loginToken: oldToken,
                profileResult: profile,
                roles: [role],
                urls: ["https://s/auth/login", "https://s/me", "https://s/admin/roles"],
                refreshCount: 0
            }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });
});
