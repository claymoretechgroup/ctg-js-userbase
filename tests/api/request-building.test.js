// realizes: core/02-client.md > Conformance Test Cases > Request Building

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

const tokenFor = (claims) => {
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${encode({ alg: "none" })}.${encode(claims)}.signature`;
};

const profile = { id: "u1", email: "a@example.test", name: null, roles: [], group_ids: [], totp_enabled: false, email_verified: true };

const clientWithSession = async (script) => {
    const token = tokenFor({ sub: "u1", exp: 2000 });
    const transport = ScriptedTransport.init([
        { response: success({ mfa_required: false, user: profile, access_token: token, access_expires_at: 2000 }) },
        ...script
    ]);
    const client = new CTGUserClient({ base_url: "https://s", transport, clock: FixedClock.init(1000) });
    await Authentication.init(client).login({ email: "a@example.test", password: "p" });
    return { client, transport, token };
};

const lastRequest = (transport) => transport.requests()[transport.requests().length - 1];
const hasHeader = (request, name) => Object.hasOwn(request.headers ?? {}, name);

const requestSummary = (request) => ({
    method: request.method,
    url: request.url,
    authorization: request.headers?.Authorization,
    accept: request.headers?.Accept,
    hasContentType: hasHeader(request, "Content-Type"),
    body: request.body,
    credentials: request.credentials
});

describe("core client request building conformance", () => {

    it("request GET /r on a client holding T sends GET, base URL, bearer T, no content type, null body, and credentials included", async () => {
        const state = await CTGTest.init("request with session credential")
            .stage("act", async () => {
                const { client, transport, token } = await clientWithSession([{ response: success({ ok: true }) }]);
                const before = transport.requests().length;
                await client.request("GET", "/r");
                return { request: requestSummary(lastRequest(transport)), count: transport.requests().length - before, token };
            })
            .assert("request shape", (state) => ({
                ...state.subject.request,
                expectedAuthorization: `Bearer ${state.subject.token}`,
                count: state.subject.count
            }), CTGTestPredicates.satisfies((value) => (
                value.method === "GET" &&
                value.url === "https://s/r" &&
                value.authorization === value.expectedAuthorization &&
                value.accept === "application/json" &&
                value.hasContentType === false &&
                value.body === null &&
                value.credentials === "include" &&
                value.count === 1
            )))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("request GET /r with no access token sends no authorization and a 401 produces AUTHENTICATION_REQUIRED after one transport application", async () => {
        const state = await CTGTest.init("request without session credential")
            .stage("act", async () => {
                const transport = ScriptedTransport.init([{ response: failure(401, "Authorization token required") }]);
                const client = new CTGUserClient({ base_url: "https://s", transport, clock: FixedClock.init(1000) });
                let error = null;
                try {
                    await client.request("GET", "/r");
                } catch (caught) {
                    error = caught;
                }
                return {
                    type: error?.type,
                    count: transport.requests().length,
                    authorization: transport.requests()[0].headers?.Authorization
                };
            })
            .assert("not renewal eligible", (state) => state.subject, CTGTestPredicates.equals({
                type: "AUTHENTICATION_REQUIRED",
                count: 1,
                authorization: undefined
            }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("request with credential none on a client holding T sends no authorization", async () => {
        const state = await CTGTest.init("request credential none")
            .stage("act", async () => {
                const { client, transport } = await clientWithSession([{ response: success({ ok: true }) }]);
                await client.request("GET", "/r", undefined, undefined, "none");
                return lastRequest(transport).headers?.Authorization;
            })
            .assert("authorization omitted", (state) => state.subject, CTGTestPredicates.equals(undefined))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("request with credential string M on a client holding T sends M, not T", async () => {
        const state = await CTGTest.init("request explicit bearer credential")
            .stage("act", async () => {
                const { client, transport } = await clientWithSession([{ response: success({ ok: true }) }]);
                await client.request("GET", "/r", undefined, undefined, "M");
                return lastRequest(transport).headers?.Authorization;
            })
            .assert("explicit bearer used", (state) => state.subject, CTGTestPredicates.equals("Bearer M"))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("request GET /r with limit and offset appends query parameters in listed order", async () => {
        const state = await CTGTest.init("request query order")
            .stage("act", async () => {
                const transport = ScriptedTransport.init([{ response: success({ ok: true }) }]);
                const client = new CTGUserClient({ base_url: "https://s", transport, clock: FixedClock.init(1000) });
                await client.request("GET", "/r", { limit: 10, offset: 20 }, undefined, "none");
                return transport.requests()[0].url;
            })
            .assert("query ordered", (state) => state.subject, CTGTestPredicates.equals("https://s/r?limit=10&offset=20"))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("request GET /r with only offset omits absent query properties", async () => {
        const state = await CTGTest.init("request omits absent query")
            .stage("act", async () => {
                const transport = ScriptedTransport.init([{ response: success({ ok: true }) }]);
                const client = new CTGUserClient({ base_url: "https://s", transport, clock: FixedClock.init(1000) });
                await client.request("GET", "/r", { offset: 20 }, undefined, "none");
                return transport.requests()[0].url;
            })
            .assert("only offset present", (state) => state.subject, CTGTestPredicates.equals("https://s/r?offset=20"))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("request GET /r with empty query has no question mark", async () => {
        const state = await CTGTest.init("request empty query")
            .stage("act", async () => {
                const transport = ScriptedTransport.init([{ response: success({ ok: true }) }]);
                const client = new CTGUserClient({ base_url: "https://s", transport, clock: FixedClock.init(1000) });
                await client.request("GET", "/r", {}, undefined, "none");
                return transport.requests()[0].url;
            })
            .assert("no query marker", (state) => state.subject, CTGTestPredicates.equals("https://s/r"))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("request GET /r percent-encodes query names and values", async () => {
        const state = await CTGTest.init("request percent encoding")
            .stage("act", async () => {
                const transport = ScriptedTransport.init([{ response: success({ ok: true }) }]);
                const client = new CTGUserClient({ base_url: "https://s", transport, clock: FixedClock.init(1000) });
                await client.request("GET", "/r", { id: "a b" }, undefined, "none");
                return transport.requests()[0].url;
            })
            .assert("encoded space", (state) => state.subject, CTGTestPredicates.equals("https://s/r?id=a%20b"))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("request with body { name: A } sends JSON content type and JSON body", async () => {
        const state = await CTGTest.init("request JSON body")
            .stage("act", async () => {
                const transport = ScriptedTransport.init([{ response: success({ ok: true }) }]);
                const client = new CTGUserClient({ base_url: "https://s", transport, clock: FixedClock.init(1000) });
                await client.request("POST", "/r", undefined, { name: "A" }, "none");
                const request = transport.requests()[0];
                return { contentType: request.headers?.["Content-Type"], body: request.body };
            })
            .assert("body fields", (state) => state.subject, CTGTestPredicates.equals({
                contentType: "application/json",
                body: JSON.stringify({ name: "A" })
            }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("request with body {} sends JSON text of {} and invents no property", async () => {
        const state = await CTGTest.init("request empty JSON body")
            .stage("act", async () => {
                const transport = ScriptedTransport.init([{ response: success({ ok: true }) }]);
                const client = new CTGUserClient({ base_url: "https://s", transport, clock: FixedClock.init(1000) });
                await client.request("POST", "/r", undefined, {}, "none");
                return transport.requests()[0].body;
            })
            .assert("empty JSON object", (state) => state.subject, CTGTestPredicates.equals("{}"))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("every request, whatever credential, is built with credentials included", async () => {
        const state = await CTGTest.init("request credentials included")
            .stage("act", async () => {
                const { client, transport } = await clientWithSession([
                    { response: success({ a: true }) },
                    { response: success({ b: true }) },
                    { response: success({ c: true }) }
                ]);
                await client.request("GET", "/r", undefined, undefined, "session");
                await client.request("GET", "/r", undefined, undefined, "none");
                await client.request("GET", "/r", undefined, undefined, "M");
                return transport.requests().slice(1).map((request) => request.credentials);
            })
            .assert("all credentials included", (state) => state.subject, CTGTestPredicates.equals(["include", "include", "include"]))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });
});
