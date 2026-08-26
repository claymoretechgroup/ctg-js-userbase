// realizes: core/02-client.md > Conformance Test Cases > Failure Shape Classification

import { describe, it, expect } from "vitest";
import { CTGTest, CTGTestPredicates, CTGTestResult } from "ctg-js-test";
import CTGUserClient from "../../src/core/CTGUserClient.js";
import ScriptedTransport from "../support/ScriptedTransport.js";
import FixedClock from "../support/FixedClock.js";

const { STATUS } = CTGTestResult;

const failure = (status, result) => ({
    status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: false, result })
});

const rejectFrom = async (scriptedResponse) => {
    const transport = ScriptedTransport.init([{ response: scriptedResponse }]);
    const client = new CTGUserClient({ base_url: "https://s", transport, clock: FixedClock.init(1000) });
    try {
        await client.request("GET", "/r", undefined, undefined, "none");
        return null;
    } catch (error) {
        return error;
    }
};

describe("core client failure shape classification conformance", () => {

    it('result "Authorization token required" is an authentication failure', async () => {
        const state = await CTGTest.init("classify authentication failure")
            .stage("act", async () => await rejectFrom(failure(401, "Authorization token required")))
            .assert("auth error", (state) => ({
                type: state.subject?.type,
                message: state.subject?.message,
                status: state.subject?.status
            }), CTGTestPredicates.equals({
                type: "AUTHENTICATION_REQUIRED",
                message: "Authorization token required",
                status: 401
            }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it('result with type USER_NOT_FOUND and message Resource not found is an operation failure', async () => {
        const state = await CTGTest.init("classify operation failure")
            .stage("act", async () => await rejectFrom(failure(404, { type: "USER_NOT_FOUND", message: "Resource not found" })))
            .assert("service error", (state) => ({
                type: state.subject?.type,
                service_type: state.subject?.service_type,
                message: state.subject?.message
            }), CTGTestPredicates.equals({
                type: "SERVICE_ERROR",
                service_type: "USER_NOT_FOUND",
                message: "Resource not found"
            }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("result with email and password messages is a parameter failure with fields equal to that map", async () => {
        const fields = { email: "Required", password: "Required" };
        const state = await CTGTest.init("classify parameter failure")
            .stage("act", async () => await rejectFrom(failure(422, fields)))
            .assert("fields carried", (state) => ({
                type: state.subject?.type,
                fields: state.subject?.fields
            }), CTGTestPredicates.equals({ type: "PARAMETER_REJECTED", fields }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it('result {"type":7} is a parameter failure because type is not a string', async () => {
        const state = await CTGTest.init("classify non-string type")
            .stage("act", async () => await rejectFrom(failure(422, { type: 7 })))
            .assert("fields carried", (state) => ({
                type: state.subject?.type,
                fields: state.subject?.fields
            }), CTGTestPredicates.equals({ type: "PARAMETER_REJECTED", fields: { type: 7 } }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("SERVICE_ERROR carrying service details preserves that map and carrying none sets details null", async () => {
        const state = await CTGTest.init("classify service details")
            .stage("act", async () => {
                const withDetails = await rejectFrom(failure(500, {
                    type: "X",
                    message: "m",
                    details: { reason: "r" }
                }));
                const withoutDetails = await rejectFrom(failure(500, { type: "Y", message: "n" }));
                return { withDetails: withDetails?.details, withoutDetails: withoutDetails?.details };
            })
            .assert("details shape", (state) => state.subject,
                CTGTestPredicates.equals({ withDetails: { reason: "r" }, withoutDetails: null }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("result null is none of the three failure shapes and rejects MALFORMED_RESPONSE", async () => {
        const state = await CTGTest.init("classify null")
            .stage("act", async () => await rejectFrom(failure(500, null)))
            .assert("malformed", (state) => state.subject?.type, CTGTestPredicates.equals("MALFORMED_RESPONSE"))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("result 42 is none of the three failure shapes and rejects MALFORMED_RESPONSE", async () => {
        const state = await CTGTest.init("classify number")
            .stage("act", async () => await rejectFrom(failure(500, 42)))
            .assert("malformed", (state) => state.subject?.type, CTGTestPredicates.equals("MALFORMED_RESPONSE"))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });
});
