// realizes: core/02-client.md > Conformance Test Cases > Client Surface and Category Application

import { describe, it, expect } from "vitest";
import { CTGTest, CTGTestPredicates, CTGTestResult } from "ctg-js-test";
import CTGUserbaseClient from "../../src/core/CTGUserbaseClient.js";
import Authentication from "../../src/core/Authentication.js";
import AccountManagement from "../../src/core/AccountManagement.js";
import Administration from "../../src/core/Administration.js";
import Authorization from "../../src/core/Authorization.js";
import type { Authenticated } from "../../src/core/types.js";
import ScriptedTransport from "../support/ScriptedTransport.js";
import FixedClock from "../support/FixedClock.js";

const { STATUS } = CTGTestResult;

const authOperations = ["register", "verifyEmail", "login", "verifyMFA", "refresh", "logout", "forgotPassword", "resetPassword"];
const accountOperations = ["getProfile", "updateProfile", "changePassword", "requestEmailChange", "confirmEmailChange", "revertEmailChange", "setupMFA", "confirmMFA", "disableMFA", "listSessions", "revokeSession", "revokeOtherSessions"];
const adminOperations = ["bootstrapAdmin", "adminListUsers", "adminGetUser", "adminCreateUser", "adminUpdateUser", "adminDeleteUser", "listRoles", "createRole", "updateRole", "deleteRole", "listPermissions", "createPermission", "updatePermission", "deletePermission", "listGroups", "getGroup", "createGroup", "updateGroup", "deleteGroup", "addGroupMember", "removeGroupMember"];
const authorizationOperations = ["hasPermission", "hasPermissionInAnyForm", "hasPermissionOver"];

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

const authenticated = (token: string): Authenticated => ({
    mfa_required: false,
    user: profile,
    access_token: token,
    access_expires_at: 3000
});

const clientFor = (script: TestScriptEntry[]) => {
    const transport = ScriptedTransport.init(script);
    const client = new CTGUserbaseClient({ base_url: "https://s", transport, clock: FixedClock.init(1000) });
    return { client, transport };
};

const operationNames = (object: object): string[] => {
    const names = new Set<string>();
    for (let current = object; current !== null && current !== Object.prototype; current = Object.getPrototypeOf(current)) {
        for (const name of Object.getOwnPropertyNames(current)) {
            if (name !== "constructor" && typeof Reflect.get(object, name) === "function") {
                names.add(name);
            }
        }
    }
    return [...names].sort();
};

const collectClientSurface = (client: CTGUserbaseClient) => {
    const extra = client as CTGUserbaseClient & Partial<Record<"authentication" | "accountManagement" | "administration" | "authorization", unknown>>;
    return {
        request: typeof client.request,
        session: typeof client.session,
        subscribe: typeof client.subscribe,
        isSessionActive: typeof client.isSessionActive,
        authentication: extra.authentication,
        accountManagement: extra.accountManagement,
        administration: extra.administration,
        authorization: extra.authorization
    };
};

const rejectValue = async (promise: TestPromise): Promise<TestErrorShape | null> => {
    try {
        await promise;
        return null;
    } catch (error) {
        return error as TestErrorShape;
    }
};

describe("core client surface and category application conformance", () => {

    it("client has fixed surface and no authentication, accountManagement, administration, or authorization property", async () => {
        const state = await CTGTest.init("client fixed surface")
            .stage("construct", () => collectClientSurface(clientFor([]).client))
            .assert("surface", (state) => state.subject, CTGTestPredicates.equals<unknown>({
                request: "function",
                session: "function",
                subscribe: "function",
                isSessionActive: "function",
                authentication: undefined,
                accountManagement: undefined,
                administration: undefined,
                authorization: undefined
            }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("each category applied to a client carries its own contract operations and no service-backed operation is reachable directly on the client", async () => {
        const state = await CTGTest.init("category operation surfaces")
            .stage("construct", () => {
                const { client } = clientFor([]);
                const auth = Authentication.init(client);
                const account = AccountManagement.init(client);
                const admin = Administration.init(client);
                const allServiceOps = [...authOperations, ...accountOperations, ...adminOperations];
                const duplicateCount = allServiceOps.length - new Set(allServiceOps).size;
                return {
                    auth: operationNames(auth),
                    account: operationNames(account),
                    admin: operationNames(admin),
                    authorization: operationNames(Authorization.init()),
                    duplicateCount,
                    clientOps: allServiceOps.filter((name) => typeof Reflect.get(client, name) === "function")
                };
            })
            .assert("category surfaces", (state) => state.subject, CTGTestPredicates.equals<unknown>({
                auth: [...authOperations].sort(),
                account: [...accountOperations].sort(),
                admin: [...adminOperations].sort(),
                authorization: [...authorizationOperations].sort(),
                duplicateCount: 0,
                clientOps: []
            }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("applying a category to a client yields operations that behave as specified", async () => {
        const state = await CTGTest.init("category operation behavior")
            .stage("act", async () => {
                const { client, transport } = clientFor([{ response: success(authenticated(oldToken)) }]);
                const result = await Authentication.init(client).login({ email: "a@example.test", password: "p" }) as Authenticated;
                return {
                    result,
                    request: transport.requestAt(0),
                    sessionToken: client.session().access_token
                };
            })
            .assert("login behavior", (state) => ({
                url: state.subject.request.url,
                method: state.subject.request.method,
                authorization: state.subject.request.headers?.Authorization,
                resultToken: state.subject.result.access_token,
                sessionToken: state.subject.sessionToken
            }), CTGTestPredicates.equals<unknown>({
                url: "https://s/auth/login",
                method: "POST",
                authorization: undefined,
                resultToken: oldToken,
                sessionToken: oldToken
            }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("two applications of Authentication to the same client operate on the same session", async () => {
        const state = await CTGTest.init("same category same client")
            .stage("act", async () => {
                const { client } = clientFor([
                    { response: success(authenticated(oldToken)) },
                    { response: success({ status: "logged_out" }) }
                ]);
                const auth1 = Authentication.init(client);
                const auth2 = Authentication.init(client);
                await auth1.login({ email: "a@example.test", password: "p" });
                const afterLogin = client.session().access_token;
                await auth2.logout();
                return { afterLogin, afterLogout: client.session() };
            })
            .assert("shared session", (state) => state.subject,
                CTGTestPredicates.equals<unknown>({ afterLogin: oldToken, afterLogout: { access_token: null, claims: null } }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("two clients built from the same configuration have isolated category structures", async () => {
        const state = await CTGTest.init("two clients isolated")
            .stage("act", async () => {
                const transport = ScriptedTransport.init([{ response: success(authenticated(oldToken)) }]);
                const config = { base_url: "https://s", transport, clock: FixedClock.init(1000) };
                const clientA = new CTGUserbaseClient(config);
                const clientB = new CTGUserbaseClient(config);
                await Authentication.init(clientA).login({ email: "a@example.test", password: "p" });
                return { a: clientA.session().access_token, b: clientB.session() };
            })
            .assert("client B unchanged", (state) => state.subject,
                CTGTestPredicates.equals<unknown>({ a: oldToken, b: { access_token: null, claims: null } }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("mutation through Authentication is visible to AccountManagement on the next getProfile request", async () => {
        const state = await CTGTest.init("cross category token visibility")
            .stage("act", async () => {
                const { client, transport } = clientFor([
                    { response: success(authenticated(oldToken)) },
                    { response: success(profile) }
                ]);
                await Authentication.init(client).login({ email: "a@example.test", password: "p" });
                await AccountManagement.init(client).getProfile();
                return transport.requestAt(1).headers?.Authorization;
            })
            .assert("new token carried", (state) => state.subject, CTGTestPredicates.equals<unknown>(`Bearer ${oldToken}`))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("renewal started by AccountManagement is shared with concurrent Administration over the same client", async () => {
        const state = await CTGTest.init("cross category shared renewal")
            .stage("act", async () => {
                const { client, transport } = clientFor([
                    { response: success(authenticated(oldToken)) },
                    { response: failure(401, "Authorization token required") },
                    { response: failure(401, "Authorization token required") },
                    { response: success(authenticated(newToken)) },
                    { response: success(profile) },
                    { response: success([role]) }
                ]);
                await Authentication.init(client).login({ email: "a@example.test", password: "p" });
                const account = AccountManagement.init(client);
                const admin = Administration.init(client);
                const [profileResult, rolesResult] = await Promise.all([account.getProfile(), admin.listRoles()]);
                return {
                    count: transport.requests().length - 1,
                    urls: transport.requests().slice(1).map((request) => request.url),
                    replayAuthorization: transport.requests().slice(4).map((request) => request.headers?.Authorization),
                    profileResult,
                    rolesResult
                };
            })
            .assert("single shared renewal", (state) => state.subject, CTGTestPredicates.equals<unknown>({
                count: 5,
                urls: ["https://s/me", "https://s/admin/roles", "https://s/auth/refresh", "https://s/me", "https://s/admin/roles"],
                replayAuthorization: [`Bearer ${newToken}`, `Bearer ${newToken}`],
                profileResult: profile,
                rolesResult: [role]
            }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("application-defined group over the same client carries the held session access token and is renewal-eligible", async () => {
        const state = await CTGTest.init("application group session credential")
            .stage("act", async () => {
                const { client, transport } = clientFor([
                    { response: success(authenticated(oldToken)) },
                    { response: success({ ok: true }) }
                ]);
                await Authentication.init(client).login({ email: "a@example.test", password: "p" });
                const group = { current: () => client.request("GET", "/app/current", undefined, undefined, "session") };
                const result = await group.current();
                return { result, authorization: transport.requestAt(1).headers?.Authorization };
            })
            .assert("group uses session token", (state) => state.subject,
                CTGTestPredicates.equals<unknown>({ result: { ok: true }, authorization: `Bearer ${oldToken}` }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("application-defined group operation answered with expired-token failure renews once and replays", async () => {
        const state = await CTGTest.init("application group renews")
            .stage("act", async () => {
                const { client, transport } = clientFor([
                    { response: success(authenticated(oldToken)) },
                    { response: failure(401, "Authorization token required") },
                    { response: success(authenticated(newToken)) },
                    { response: success({ ok: true }) }
                ]);
                await Authentication.init(client).login({ email: "a@example.test", password: "p" });
                const before = transport.requests().length;
                const result = await client.request("GET", "/app/current", undefined, undefined, "session");
                const requests = transport.requests().slice(before);
                return {
                    result,
                    count: requests.length,
                    urls: requests.map((request) => request.url),
                    replayAuthorization: transport.requestAt(before + 2).headers?.Authorization,
                    sessionToken: client.session().access_token
                };
            })
            .assert("group renewal", (state) => state.subject, CTGTestPredicates.equals<unknown>({
                result: { ok: true },
                count: 3,
                urls: ["https://s/app/current", "https://s/auth/refresh", "https://s/app/current"],
                replayAuthorization: `Bearer ${newToken}`,
                sessionToken: newToken
            }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("category structure applied to client A never reads or mutates client B session state", async () => {
        const state = await CTGTest.init("category A not B")
            .stage("act", async () => {
                const transportA = ScriptedTransport.init([{ response: success(authenticated(oldToken)) }]);
                const transportB = ScriptedTransport.init([]);
                const clock = FixedClock.init(1000);
                const clientA = new CTGUserbaseClient({ base_url: "https://s", transport: transportA, clock });
                const clientB = new CTGUserbaseClient({ base_url: "https://s", transport: transportB, clock });
                await Authentication.init(clientA).login({ email: "a@example.test", password: "p" });
                return { clientA: clientA.session().access_token, clientB: clientB.session(), bRequests: transportB.requests().length };
            })
            .assert("B untouched", (state) => state.subject, CTGTestPredicates.equals<unknown>({
                clientA: oldToken,
                clientB: { access_token: null, claims: null },
                bRequests: 0
            }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("client has no authorization property and no Authorization operation is reachable through a client", async () => {
        const state = await CTGTest.init("authorization absence")
            .stage("construct", () => {
                const { client } = clientFor([]);
                return {
                    authorizationProperty: Reflect.get(client, "authorization"),
                    reachable: authorizationOperations.filter((name) => typeof Reflect.get(client, name) === "function")
                };
            })
            .assert("not on client", (state) => state.subject,
                CTGTestPredicates.equals<unknown>({ authorizationProperty: undefined, reachable: [] }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });
});
