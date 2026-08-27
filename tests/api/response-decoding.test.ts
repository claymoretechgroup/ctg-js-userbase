// realizes: core/02-client.md > Conformance Test Cases > Response Decoding

import { describe, it, expect } from "vitest";
import { CTGTest, CTGTestPredicates, CTGTestResult } from "ctg-js-test";
import CTGUserbaseClient from "../../src/core/CTGUserbaseClient.js";
import type { Response } from "../../src/core/types.js";
import ScriptedTransport from "../support/ScriptedTransport.js";
import FixedClock from "../support/FixedClock.js";

const { STATUS } = CTGTestResult;

const response = (status: number, body: string): Response => ({
    status,
    headers: { "Content-Type": "application/json" },
    body
});

const success = (status: number, result: unknown) => response(status, JSON.stringify({ success: true, result }));
const failure = (status: number, result: unknown) => response(status, JSON.stringify({ success: false, result }));

const runRequest = async (scriptedResponse: Response) => {
    const transport = ScriptedTransport.init([{ response: scriptedResponse }]);
    const client = new CTGUserbaseClient({ base_url: "https://s", transport, clock: FixedClock.init(1000) });
    return await client.request("GET", "/r", undefined, undefined, "none");
};

const runRejectedRequest = async (scriptedResponse: Response) => {
    try {
        await runRequest(scriptedResponse);
        return null;
    } catch (error) {
        return error as TestErrorShape;
    }
};

describe("core client response decoding conformance", () => {

    it('status 200 with {"success":true,"result":{"id":"u1"}} returns the result', async () => {
        const state = await CTGTest.init("decode 200 success")
            .stage("act", async () => await runRequest(success(200, { id: "u1" })))
            .assert("result returned", (state) => state.subject, CTGTestPredicates.equals<unknown>({ id: "u1" }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it('status 201 with {"success":true,"result":{"id":"u1"}} returns the result', async () => {
        const state = await CTGTest.init("decode 201 success")
            .stage("act", async () => await runRequest(success(201, { id: "u1" })))
            .assert("result returned", (state) => state.subject, CTGTestPredicates.equals<unknown>({ id: "u1" }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("status 204 with empty body returns VOID and does not parse the body", async () => {
        const state = await CTGTest.init("decode 204 empty")
            .stage("act", async () => await runRequest(response(204, "")))
            .assert("void returned", (state) => state.subject, CTGTestPredicates.equals<unknown>(undefined))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("status 204 with non-JSON body still returns VOID", async () => {
        const state = await CTGTest.init("decode 204 non-json")
            .stage("act", async () => await runRequest(response(204, "not json")))
            .assert("void returned", (state) => state.subject, CTGTestPredicates.equals<unknown>(undefined))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("status 200 with non-JSON body rejects RESPONSE_NOT_JSON with status 200", async () => {
        const state = await CTGTest.init("decode non-json")
            .stage("act", async () => await runRejectedRequest(response(200, "not json")))
            .assert("error classified", (state) => ({ type: state.subject?.type, status: state.subject?.status }),
                CTGTestPredicates.equals<unknown>({ type: "RESPONSE_NOT_JSON", status: 200 }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("status 200 with decoded list body rejects MALFORMED_RESPONSE with status 200", async () => {
        const state = await CTGTest.init("decode list malformed")
            .stage("act", async () => await runRejectedRequest(response(200, "[1,2]")))
            .assert("error classified", (state) => ({ type: state.subject?.type, status: state.subject?.status }),
                CTGTestPredicates.equals<unknown>({ type: "MALFORMED_RESPONSE", status: 200 }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it('status 200 with {"result":{}} rejects MALFORMED_RESPONSE', async () => {
        const state = await CTGTest.init("decode missing success")
            .stage("act", async () => await runRejectedRequest(response(200, JSON.stringify({ result: {} }))))
            .assert("error classified", (state) => state.subject?.type, CTGTestPredicates.equals<unknown>("MALFORMED_RESPONSE"))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it('status 200 with {"success":true} rejects MALFORMED_RESPONSE', async () => {
        const state = await CTGTest.init("decode missing result")
            .stage("act", async () => await runRejectedRequest(response(200, JSON.stringify({ success: true }))))
            .assert("error classified", (state) => state.subject?.type, CTGTestPredicates.equals<unknown>("MALFORMED_RESPONSE"))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it('status 200 with {"success":"yes","result":{}} rejects MALFORMED_RESPONSE', async () => {
        const state = await CTGTest.init("decode non-boolean success")
            .stage("act", async () => await runRejectedRequest(response(200, JSON.stringify({ success: "yes", result: {} }))))
            .assert("error classified", (state) => state.subject?.type, CTGTestPredicates.equals<unknown>("MALFORMED_RESPONSE"))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("status 500 with operation failure rejects SERVICE_ERROR carrying service_type and status", async () => {
        const state = await CTGTest.init("decode service error")
            .stage("act", async () => await runRejectedRequest(failure(500, { type: "SIGNING_KEY_INVALID", message: "Internal error" })))
            .assert("error classified", (state) => ({
                type: state.subject?.type,
                service_type: state.subject?.service_type,
                status: state.subject?.status
            }), CTGTestPredicates.equals<unknown>({ type: "SERVICE_ERROR", service_type: "SIGNING_KEY_INVALID", status: 500 }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it('status 418 with {"success":false,"result":{"oops":1}} rejects PARAMETER_REJECTED with fields and status', async () => {
        const state = await CTGTest.init("decode parameter error")
            .stage("act", async () => await runRejectedRequest(failure(418, { oops: 1 })))
            .assert("error classified", (state) => ({
                type: state.subject?.type,
                fields: state.subject?.fields,
                status: state.subject?.status
            }), CTGTestPredicates.equals<unknown>({ type: "PARAMETER_REJECTED", fields: { oops: 1 }, status: 418 }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it('status 502 with body "<html>" rejects RESPONSE_NOT_JSON with full body_preview', async () => {
        const state = await CTGTest.init("decode non-json preview")
            .stage("act", async () => await runRejectedRequest(response(502, "<html>")))
            .assert("preview carried", (state) => ({
                type: state.subject?.type,
                status: state.subject?.status,
                body_preview: state.subject?.details?.body_preview
            }), CTGTestPredicates.equals<unknown>({ type: "RESPONSE_NOT_JSON", status: 502, body_preview: "<html>" }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("status 500 with 250 non-JSON characters rejects RESPONSE_NOT_JSON with exactly the first 200 characters", async () => {
        const state = await CTGTest.init("decode long preview")
            .stage("act", async () => {
                const body = "x".repeat(250);
                const error = await runRejectedRequest(response(500, body));
                return { preview: error?.details?.body_preview, expected: body.slice(0, 200) };
            })
            .assert("preview truncated", (state) => state.subject, CTGTestPredicates.satisfies<{ preview: unknown; expected: string }>((value) => (
                value.preview === value.expected && value.preview.length === 200
            )))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("status 500 with exactly 200 non-JSON characters carries the whole body_preview", async () => {
        const state = await CTGTest.init("decode exact preview")
            .stage("act", async () => {
                const body = "x".repeat(200);
                const error = await runRejectedRequest(response(500, body));
                return error?.details?.body_preview;
            })
            .assert("preview whole", (state) => state.subject, CTGTestPredicates.equals<unknown>("x".repeat(200)))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it('status 500 with {"success":false,"result":null} rejects MALFORMED_RESPONSE with status 500', async () => {
        const state = await CTGTest.init("decode null failure result")
            .stage("act", async () => await runRejectedRequest(failure(500, null)))
            .assert("error classified", (state) => ({ type: state.subject?.type, status: state.subject?.status }),
                CTGTestPredicates.equals<unknown>({ type: "MALFORMED_RESPONSE", status: 500 }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it('status 500 with {"success":false,"result":[1,2]} rejects MALFORMED_RESPONSE with status 500', async () => {
        const state = await CTGTest.init("decode list failure result")
            .stage("act", async () => await runRejectedRequest(failure(500, [1, 2])))
            .assert("error classified", (state) => ({ type: state.subject?.type, status: state.subject?.status }),
                CTGTestPredicates.equals<unknown>({ type: "MALFORMED_RESPONSE", status: 500 }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("status 401 with non-authentication failure on a non-eligible request rejects UNEXPECTED_STATUS and attempts no renewal", async () => {
        const state = await CTGTest.init("decode unexpected 401")
            .stage("act", async () => {
                const transport = ScriptedTransport.init([{ response: failure(401, { type: "X", message: "m" }) }]);
                const client = new CTGUserbaseClient({ base_url: "https://s", transport, clock: FixedClock.init(1000) });
                let error: TestErrorShape | null = null;
                try {
                    await client.request("GET", "/r", undefined, undefined, "none");
                } catch (caught) {
                    error = caught as TestErrorShape;
                }
                return { type: error?.type, status: error?.status, count: transport.requests().length };
            })
            .assert("unexpected status and no renewal", (state) => state.subject,
                CTGTestPredicates.equals<unknown>({ type: "UNEXPECTED_STATUS", status: 401, count: 1 }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("status 403 with authentication failure shape rejects UNEXPECTED_STATUS", async () => {
        const state = await CTGTest.init("decode unexpected 403")
            .stage("act", async () => await runRejectedRequest(failure(403, "Authorization token required")))
            .assert("error classified", (state) => ({ type: state.subject?.type, status: state.subject?.status }),
                CTGTestPredicates.equals<unknown>({ type: "UNEXPECTED_STATUS", status: 403 }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });
});
