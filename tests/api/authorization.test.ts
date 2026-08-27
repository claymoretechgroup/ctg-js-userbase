// realizes: core/06-authorization.md > Conformance Test Cases > Authorization

import { describe, it, expect } from "vitest";
import { CTGTest, CTGTestPredicates, CTGTestResult } from "ctg-js-test";
import Authorization from "../../src/core/Authorization.js";
import type { Claims } from "../../src/core/types.js";

const { STATUS } = CTGTestResult;

const claims = (overrides: Partial<Claims>): Claims => ({
    iss: "issuer",
    aud: "audience",
    sub: "u1",
    permissions: [],
    scoped_permissions: [],
    group_ids: [],
    scope: "",
    iat: 0,
    exp: 0,
    jti: "jti",
    ...overrides
});

const C = claims({ permissions: ["users:read"], scoped_permissions: ["users:update"], group_ids: [1, 2] });

const withAuthz = <Result>(fn: (a: Authorization, b: Authorization) => Result): Result =>
    fn(Authorization.init(), new Authorization());

describe("authorization conformance", () => {

    it("hasPermission(C, \"users:read\"): true", async () => {
        const state = await CTGTest.init("global permission")
            .stage("act", () => withAuthz((a, b) => [a.hasPermission(C, "users:read"), b.hasPermission(C, "users:read")]))
            .assert("both structures agree", (state) => state.subject, CTGTestPredicates.equals<unknown>([true, true]))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("hasPermission(C, \"users:update\"): false because scoped form never satisfies it", async () => {
        const state = await CTGTest.init("scoped does not satisfy global")
            .stage("act", () => withAuthz((a, b) => [a.hasPermission(C, "users:update"), b.hasPermission(C, "users:update")]))
            .assert("scoped ignored", (state) => state.subject, CTGTestPredicates.equals<unknown>([false, false]))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("hasPermission(C, \"users:*\"): false because there is no wildcard", async () => {
        const state = await CTGTest.init("no wildcard")
            .stage("act", () => Authorization.init().hasPermission(C, "users:*"))
            .assert("exact only", (state) => state.subject, CTGTestPredicates.equals<unknown>(false))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("hasPermission(C, \"users\"): false because there is no prefix matching", async () => {
        const state = await CTGTest.init("no prefix")
            .stage("act", () => Authorization.init().hasPermission(C, "users"))
            .assert("exact only", (state) => state.subject, CTGTestPredicates.equals<unknown>(false))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("hasPermission(C, \"USERS:READ\"): false because matching is exact", async () => {
        const state = await CTGTest.init("case sensitive")
            .stage("act", () => Authorization.init().hasPermission(C, "USERS:READ"))
            .assert("case-sensitive", (state) => state.subject, CTGTestPredicates.equals<unknown>(false))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("hasPermission(null, \"users:read\"): false", async () => {
        const state = await CTGTest.init("null claims")
            .stage("act", () => Authorization.init().hasPermission(null, "users:read"))
            .assert("false", (state) => state.subject, CTGTestPredicates.equals<unknown>(false))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("hasPermission with absent permissions: false", async () => {
        const state = await CTGTest.init("absent permissions")
            .stage("act", () => Authorization.init().hasPermission(
                // @ts-expect-error absent permissions verifies malformed claim handling
                { scoped_permissions: [], group_ids: [] },
                "users:read"
            ))
            .assert("false", (state) => state.subject, CTGTestPredicates.equals<unknown>(false))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("hasPermission with non-list permissions: false", async () => {
        const state = await CTGTest.init("non-list permissions")
            .stage("act", () => Authorization.init().hasPermission(
                // @ts-expect-error non-array permissions verifies malformed claim handling
                { permissions: "users:read", scoped_permissions: [], group_ids: [] },
                "users:read"
            ))
            .assert("false", (state) => state.subject, CTGTestPredicates.equals<unknown>(false))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("hasPermissionInAnyForm(C, \"users:read\"): true", async () => {
        const state = await CTGTest.init("any form global")
            .stage("act", () => Authorization.init().hasPermissionInAnyForm(C, "users:read"))
            .assert("true", (state) => state.subject, CTGTestPredicates.equals<unknown>(true))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("hasPermissionInAnyForm(C, \"users:update\"): true", async () => {
        const state = await CTGTest.init("any form scoped")
            .stage("act", () => Authorization.init().hasPermissionInAnyForm(C, "users:update"))
            .assert("true", (state) => state.subject, CTGTestPredicates.equals<unknown>(true))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("hasPermissionInAnyForm(C, \"users:delete\"): false", async () => {
        const state = await CTGTest.init("any form absent")
            .stage("act", () => Authorization.init().hasPermissionInAnyForm(C, "users:delete"))
            .assert("false", (state) => state.subject, CTGTestPredicates.equals<unknown>(false))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("hasPermissionInAnyForm(null, \"users:read\"): false", async () => {
        const state = await CTGTest.init("any form null")
            .stage("act", () => Authorization.init().hasPermissionInAnyForm(null, "users:read"))
            .assert("false", (state) => state.subject, CTGTestPredicates.equals<unknown>(false))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("hasPermissionOver(C, \"users:read\", []): true by clause 1", async () => {
        const state = await CTGTest.init("over global empty targets")
            .stage("act", () => Authorization.init().hasPermissionOver(C, "users:read", []))
            .assert("true", (state) => state.subject, CTGTestPredicates.equals<unknown>(true))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("hasPermissionOver(C, \"users:read\", [9]): true by clause 1", async () => {
        const state = await CTGTest.init("over global target")
            .stage("act", () => Authorization.init().hasPermissionOver(C, "users:read", [9]))
            .assert("true", (state) => state.subject, CTGTestPredicates.equals<unknown>(true))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("hasPermissionOver(C, \"users:update\", [2, 3]): true by shared group 2", async () => {
        const state = await CTGTest.init("over scoped shared group")
            .stage("act", () => Authorization.init().hasPermissionOver(C, "users:update", [2, 3]))
            .assert("true", (state) => state.subject, CTGTestPredicates.equals<unknown>(true))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("hasPermissionOver(C, \"users:update\", [3]): false", async () => {
        const state = await CTGTest.init("over scoped no shared group")
            .stage("act", () => Authorization.init().hasPermissionOver(C, "users:update", [3]))
            .assert("false", (state) => state.subject, CTGTestPredicates.equals<unknown>(false))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("hasPermissionOver(C, \"users:update\", []): false", async () => {
        const state = await CTGTest.init("over scoped empty targets")
            .stage("act", () => Authorization.init().hasPermissionOver(C, "users:update", []))
            .assert("false", (state) => state.subject, CTGTestPredicates.equals<unknown>(false))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("hasPermissionOver({ ...C, group_ids: [] }, \"users:update\", [1, 2]): false", async () => {
        const state = await CTGTest.init("over scoped empty holder groups")
            .stage("act", () => Authorization.init().hasPermissionOver({ ...C, group_ids: [] }, "users:update", [1, 2]))
            .assert("false", (state) => state.subject, CTGTestPredicates.equals<unknown>(false))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("hasPermissionOver(C, \"users:delete\", [1]): false", async () => {
        const state = await CTGTest.init("over absent permission")
            .stage("act", () => Authorization.init().hasPermissionOver(C, "users:delete", [1]))
            .assert("false", (state) => state.subject, CTGTestPredicates.equals<unknown>(false))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("hasPermissionOver(null, \"users:read\", [1]): false", async () => {
        const state = await CTGTest.init("over null claims")
            .stage("act", () => Authorization.init().hasPermissionOver(null, "users:read", [1]))
            .assert("false", (state) => state.subject, CTGTestPredicates.equals<unknown>(false))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("a predicate answers about the claim set it was given, not any other held claim set", async () => {
        const state = await CTGTest.init("predicate uses argument claims")
            .stage("act", () => {
                const sessionClaims = claims({ permissions: ["admin:*"], group_ids: [9] });
                const givenClaims = claims({ scoped_permissions: ["users:update"], group_ids: [2] });
                const authz = Authorization.init();
                return {
                    sessionWouldAllow: authz.hasPermission(sessionClaims, "admin:*"),
                    givenAllowsAdmin: authz.hasPermission(givenClaims, "admin:*"),
                    givenAllowsUpdateOver2: authz.hasPermissionOver(givenClaims, "users:update", [2])
                };
            })
            .assert("argument claims used", (state) => state.subject, CTGTestPredicates.equals<unknown>({
                sessionWouldAllow: true,
                givenAllowsAdmin: false,
                givenAllowsUpdateOver2: true
            }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("no predicate produced any transport application", async () => {
        const state = await CTGTest.init("no transport dependency")
            .stage("act", () => {
                const authz = Authorization.init();
                authz.hasPermission(C, "users:read");
                authz.hasPermissionInAnyForm(C, "users:update");
                authz.hasPermissionOver(C, "users:update", [2]);
                return "completed without a transport";
            })
            .assert("pure predicates", (state) => state.subject,
                CTGTestPredicates.equals<unknown>("completed without a transport"))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("no predicate consulted the clock: applying every predicate with a clock that throws changes no result", async () => {
        const state = await CTGTest.init("no clock dependency")
            .stage("act", () => {
                const clock = { now: () => { throw new Error("clock consulted"); } };
                const authz = Authorization.init();
                return {
                    clockPresent: typeof clock.now,
                    has: authz.hasPermission(C, "users:read"),
                    any: authz.hasPermissionInAnyForm(C, "users:update"),
                    over: authz.hasPermissionOver(C, "users:update", [2])
                };
            })
            .assert("clock independent", (state) => state.subject, CTGTestPredicates.equals<unknown>({
                clockPresent: "function",
                has: true,
                any: true,
                over: true
            }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("no Authorization operation yields or holds the refresh credential", async () => {
        const state = await CTGTest.init("authorization no refresh credential")
            .stage("act", async () => {
                const { default: CTGUserbaseClient } = await import("../../src/core/CTGUserbaseClient.js");
                const { default: Authentication } = await import("../../src/core/Authentication.js");
                const { default: AccountManagement } = await import("../../src/core/AccountManagement.js");
                const { default: Administration } = await import("../../src/core/Administration.js");
                const { default: ScriptedTransport } = await import("../support/ScriptedTransport.js");
                const { default: FixedClock } = await import("../support/FixedClock.js");

                const authz = Authorization.init();
                const client = new CTGUserbaseClient({
                    base_url: "https://s",
                    transport: ScriptedTransport.init([]),
                    clock: FixedClock.init(1000)
                });
                const structures = [
                    client,
                    Authentication.init(client),
                    AccountManagement.init(client),
                    Administration.init(client),
                    authz
                ];
                const credentialKeys = (structure: object) =>
                    [...new Set(Object.keys(structure).concat(Object.getOwnPropertyNames(structure)))]
                        .filter((key) => /refresh/i.test(key))
                        .filter((key) => typeof Reflect.get(structure, key) !== "function");
                const results = [
                    authz.hasPermission(C, "users:read"),
                    authz.hasPermissionInAnyForm(C, "users:update"),
                    authz.hasPermissionOver(C, "users:update", [2])
                ];
                return {
                    refreshNamedProperties: structures.flatMap(credentialKeys),
                    resultTypes: results.map((result) => typeof result),
                    resultValues: results
                };
            })
            .assert("refresh credential absent on every structure", (state) => state.subject, CTGTestPredicates.equals<unknown>({
                refreshNamedProperties: [],
                resultTypes: ["boolean", "boolean", "boolean"],
                resultValues: [true, true, true]
            }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });
});
