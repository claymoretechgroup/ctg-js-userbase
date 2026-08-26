// realizes: core/02-client.md > Conformance Test Cases > Error Constructor

import { describe, it, expect } from "vitest";
import { CTGTest, CTGTestPredicates, CTGTestResult } from "ctg-js-test";
import ClientError from "../../src/core/ClientError.js";

const { STATUS } = CTGTestResult;

const thrownBy = (fn) => {
    try {
        fn();
        return null;
    } catch (error) {
        return error;
    }
};

describe("core client error constructor conformance", () => {

    it('error constructor with "SERVICE_ERROR" produces type SERVICE_ERROR and code 3001', async () => {
        const state = await CTGTest.init("error constructor name")
            .stage("construct", () => new ClientError("SERVICE_ERROR"))
            .assert("type and code", (state) => ({ type: state.subject.type, code: state.subject.code }),
                CTGTestPredicates.equals({ type: "SERVICE_ERROR", code: 3001 }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("error constructor with 3001 produces type SERVICE_ERROR and code 3001", async () => {
        const state = await CTGTest.init("error constructor code")
            .stage("construct", () => new ClientError(3001))
            .assert("type and code", (state) => ({ type: state.subject.type, code: state.subject.code }),
                CTGTestPredicates.equals({ type: "SERVICE_ERROR", code: 3001 }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it('error constructor with "NOT_A_TYPE" raises the platform native argument error immediately', async () => {
        const state = await CTGTest.init("error constructor bad name")
            .stage("construct", () => thrownBy(() => new ClientError("NOT_A_TYPE")))
            .assert("native argument error", (state) => state.subject instanceof TypeError, CTGTestPredicates.equals(true))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("error constructor with 9999 raises the platform native argument error", async () => {
        const state = await CTGTest.init("error constructor bad code")
            .stage("construct", () => thrownBy(() => new ClientError(9999)))
            .assert("native argument error", (state) => state.subject instanceof TypeError, CTGTestPredicates.equals(true))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it('lookup("TRANSPORT_FAILED") resolves 1000 and lookup(1000) resolves "TRANSPORT_FAILED"', async () => {
        const state = await CTGTest.init("error lookup")
            .stage("lookup", () => ({
                code: ClientError.lookup("TRANSPORT_FAILED"),
                type: ClientError.lookup(1000)
            }))
            .assert("bidirectional lookup", (state) => state.subject,
                CTGTestPredicates.equals({ code: 1000, type: "TRANSPORT_FAILED" }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it('lookup("NOT_A_TYPE") raises the platform native argument error', async () => {
        const state = await CTGTest.init("error lookup bad name")
            .stage("lookup", () => thrownBy(() => ClientError.lookup("NOT_A_TYPE")))
            .assert("native argument error", (state) => state.subject instanceof TypeError, CTGTestPredicates.equals(true))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });
});
