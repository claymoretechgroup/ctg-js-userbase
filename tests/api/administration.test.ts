// realizes: core/05-administration.md > Conformance Test Cases > Administration

import { describe, it, expect } from "vitest";
import { CTGTest, CTGTestPredicates, CTGTestResult } from "ctg-js-test";
import CTGUserbaseClient from "../../src/core/CTGUserbaseClient.js";
import Authentication from "../../src/core/Authentication.js";
import Administration from "../../src/core/Administration.js";
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
const createdProfile = { id: "u2", email: "b@example.test", name: null, roles: [], group_ids: [], totp_enabled: false, email_verified: true };
const role = { name: "r", permissions: [], scoped: false, reserved: false };
const group = { id: 3, name: "g", roles: [] };
const claims = { sub: "u1", exp: 3000 };
const token = tokenFor(claims);

const authenticated = {
    mfa_required: false,
    user: profile,
    access_token: token,
    access_expires_at: 3000
};

const makeClient = (script: TestScriptEntry[]) => {
    const transport = ScriptedTransport.init(script);
    const client = new CTGUserbaseClient({ base_url: "https://s", transport, clock: FixedClock.init(1000) });
    return { client, transport, auth: Authentication.init(client), admin: Administration.init(client) };
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

describe("administration conformance", () => {

    it("adminCreateUser({ email, password }) answered 201 returns the profile", async () => {
        const state = await CTGTest.init("admin create user")
            .stage("act", async () => {
                const { admin } = await makeSeededClient([
                    { response: success(createdProfile, 201) }
                ]);
                return await admin.adminCreateUser({ email: "b@example.test", password: "p" });
            })
            .assert("created profile", (state) => state.subject, CTGTestPredicates.equals<unknown>(createdProfile))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("adminDeleteUser({ id }) answered 204 returns VOID", async () => {
        const state = await CTGTest.init("admin delete user")
            .stage("act", async () => {
                const { admin, transport } = await makeSeededClient([
                    { response: noContent() }
                ]);
                const result = await admin.adminDeleteUser({ id: "u2" });
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
            .assert("void delete", (state) => state.subject, CTGTestPredicates.equals<unknown>({
                result: undefined,
                request: {
                    method: "DELETE",
                    url: "https://s/admin/user?id=u2",
                    authorization: `Bearer ${token}`,
                    body: null
                }
            }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("updateRole({ name: \"r\", permissions: [], scoped: false }) sends name in the URL and not in the body", async () => {
        const state = await CTGTest.init("admin update role")
            .stage("act", async () => {
                const { admin, transport } = await makeSeededClient([
                    { response: success(role) }
                ]);
                await admin.updateRole({ name: "r", permissions: [], scoped: false });
                const request = transport.requestAt(1);
                return {
                    url: request.url,
                    body: request.body
                };
            })
            .assert("role request split", (state) => state.subject, CTGTestPredicates.equals<unknown>({
                url: "https://s/admin/role?name=r",
                body: JSON.stringify({ permissions: [], scoped: false })
            }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("updateRole({ name: \"r\", permissions: [] }) sends no scoped default and surfaces PARAMETER_REJECTED", async () => {
        const fields = { scoped: "Required" };
        const state = await CTGTest.init("admin update role missing scoped")
            .stage("act", async () => {
                const { admin, transport } = await makeSeededClient([
                    { response: failure(422, fields) }
                ]);
                const error = await rejectValue(admin.updateRole(
                    // @ts-expect-error missing scoped verifies runtime parameter rejection
                    { name: "r", permissions: [] }
                ));
                const requests = afterSeed(transport);
                return {
                    type: error?.type,
                    fields: error?.fields,
                    count: requests.length,
                    body: transport.requestAt(1).body
                };
            })
            .assert("scoped absent", (state) => state.subject, CTGTestPredicates.equals<unknown>({
                type: "PARAMETER_REJECTED",
                fields,
                count: 1,
                body: JSON.stringify({ permissions: [] })
            }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("updateGroup({ id: 3, name: \"g\" }) sends name and no roles", async () => {
        const state = await CTGTest.init("admin update group name only")
            .stage("act", async () => {
                const { admin, transport } = await makeSeededClient([
                    { response: success(group) }
                ]);
                await admin.updateGroup({ id: 3, name: "g" });
                const request = transport.requestAt(1);
                return {
                    url: request.url,
                    body: request.body
                };
            })
            .assert("group name only", (state) => state.subject, CTGTestPredicates.equals<unknown>({
                url: "https://s/admin/group?id=3",
                body: JSON.stringify({ name: "g" })
            }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("createGroup({ name: \"g\" }) sends name and no roles", async () => {
        const state = await CTGTest.init("admin create group name only")
            .stage("act", async () => {
                const { admin, transport } = await makeSeededClient([
                    { response: success(group, 201) }
                ]);
                await admin.createGroup({ name: "g" });
                return transport.requestAt(1).body;
            })
            .assert("group create body", (state) => state.subject,
                CTGTestPredicates.equals<unknown>(JSON.stringify({ name: "g" })))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("bootstrapAdmin({ secret, email, password }) while a session is held carries no authorization header", async () => {
        const state = await CTGTest.init("admin bootstrap no session credential")
            .stage("act", async () => {
                const { admin, transport } = await makeSeededClient([
                    { response: success(createdProfile, 201) }
                ]);
                await admin.bootstrapAdmin({ secret: "setup", email: "b@example.test", password: "p" });
                const request = transport.requestAt(1);
                return {
                    authorization: request.headers?.Authorization,
                    body: request.body
                };
            })
            .assert("setup secret credential", (state) => state.subject, CTGTestPredicates.equals<unknown>({
                authorization: undefined,
                body: JSON.stringify({ secret: "setup", email: "b@example.test", password: "p" })
            }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("deleteRole answered 404 ROLE_NOT_FOUND rejects SERVICE_ERROR with status 404", async () => {
        const state = await CTGTest.init("admin delete role not found")
            .stage("act", async () => {
                const { admin } = await makeSeededClient([
                    { response: failure(404, { type: "ROLE_NOT_FOUND", message: "Role not found" }) }
                ]);
                const error = await rejectValue(admin.deleteRole({ name: "missing" }));
                return {
                    type: error?.type,
                    service_type: error?.service_type,
                    status: error?.status
                };
            })
            .assert("role not found surfaced", (state) => state.subject, CTGTestPredicates.equals<unknown>({
                type: "SERVICE_ERROR",
                service_type: "ROLE_NOT_FOUND",
                status: 404
            }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("adminUpdateUser answered 403 PERMISSION_DENIED rejects SERVICE_ERROR", async () => {
        const state = await CTGTest.init("admin update user permission denied")
            .stage("act", async () => {
                const { admin } = await makeSeededClient([
                    { response: failure(403, { type: "PERMISSION_DENIED", message: "Denied" }) }
                ]);
                const error = await rejectValue(admin.adminUpdateUser({ id: "u2", name: "B" }));
                return {
                    type: error?.type,
                    service_type: error?.service_type,
                    status: error?.status
                };
            })
            .assert("permission denial surfaced", (state) => state.subject, CTGTestPredicates.equals<unknown>({
                type: "SERVICE_ERROR",
                service_type: "PERMISSION_DENIED",
                status: 403
            }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("adminListUsers({ offset: 20 }) sends offset and no limit", async () => {
        const state = await CTGTest.init("admin list users offset only")
            .stage("act", async () => {
                const { admin, transport } = await makeSeededClient([
                    { response: success([profile]) }
                ]);
                await admin.adminListUsers({ offset: 20 });
                return transport.requestAt(1).url;
            })
            .assert("limit omitted", (state) => state.subject,
                CTGTestPredicates.equals<unknown>("https://s/admin/users?offset=20"))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });
});
