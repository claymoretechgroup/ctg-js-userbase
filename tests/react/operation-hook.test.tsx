// @vitest-environment jsdom
// realizes: presentation.md > Conformance Test Cases > Operation Hook

import React, { useState } from "react";
import { act } from "react-dom/test-utils";
import { describe, it, expect } from "vitest";
import CTGReactTest from "ctg-react-test";
import { CTGTestResult } from "ctg-js-test";
import CTGUserbaseClient from "../../src/core/CTGUserbaseClient.js";
import ClientError from "../../src/core/ClientError.js";
import Authentication from "../../src/core/Authentication.js";
import AccountManagement from "../../src/core/AccountManagement.js";
import type { Operation } from "../../src/react/useOperation.js";
import useOperation from "../../src/react/useOperation.js";
import ScriptedTransport from "../support/ScriptedTransport.js";
import FixedClock from "../support/FixedClock.js";

const S = CTGTestResult.STATUS;

const success = (result: unknown) => ({
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: true, result })
});

const tokenFor = (claims: TestClaims) => {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${encode({ alg: "none" })}.${encode(claims)}.signature`;
};

const profile = { id: "u1", email: "a@example.test", name: null, roles: [], group_ids: [], totp_enabled: false, email_verified: true };

const authenticated = (claims: TestClaims & { exp: number }) => ({
    mfa_required: false,
    user: profile,
    access_token: tokenFor(claims),
    access_expires_at: claims.exp
});

const makeClient = (script: TestScriptEntry[]) => {
    const transport = ScriptedTransport.init(script);
    const client = new CTGUserbaseClient({ base_url: "https://s", transport, clock: FixedClock.init(1000) });
    return { client, transport, auth: Authentication.init(client), account: AccountManagement.init(client) };
};

interface Deferred<Value> {
    promise: Promise<Value>;
    resolve: (value: Value | PromiseLike<Value>) => void;
    reject: (reason?: unknown) => void;
}

const deferred = <Value = unknown>(): Deferred<Value> => {
    let resolve: Deferred<Value>["resolve"] | null = null;
    let reject: Deferred<Value>["reject"] | null = null;
    const promise = new Promise<Value>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    if (resolve === null || reject === null) {
        throw new Error("Deferred promise callbacks were not initialized");
    }
    return { promise, resolve, reject };
};

const expectRunPromise = (promise: Promise<void> | null): Promise<void> => {
    if (promise === null) {
        throw new Error("Expected run promise");
    }
    return promise;
};

const promiseAt = (promises: Promise<void>[], index: number): Promise<void> => {
    const promise = promises[index];
    if (promise === undefined) {
        throw new Error(`Expected run promise at index ${index}`);
    }
    return promise;
};

const serviceError = () => {
    const error = new ClientError("SERVICE_ERROR");
    Object.defineProperty(error, "service_type", { value: "PERMISSION_DENIED" });
    Object.defineProperty(error, "status", { value: 403 });
    return error;
};

interface ErrorBoundaryState {
    error: TestErrorShape | null;
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error: TestErrorShape): ErrorBoundaryState {
        return { error };
    }

    render() {
        if (this.state.error) {
            return <output data-testid="error">{this.state.error.type}:{this.state.error.details?.field}</output>;
        }

        return this.props.children;
    }
}

const summarizeError = (error: ClientError | null) => error === null ? null : {
    type: error.type,
    service_type: error.service_type,
    status: error.status
};

interface OperationProbeProps<Args, Result> {
    operation: Operation<Args, Result>;
    args?: Args;
    label?: string;
    onRun?: ((promise: Promise<void>) => void) | null;
}

function OperationProbe<Args, Result>({ operation, args = undefined as Args, label = "run", onRun = null }: OperationProbeProps<Args, Result>) {
    const handle = useOperation(operation);
    return (
        <>
            <button onClick={() => {
                const promise = handle.run(args);
                onRun?.(promise);
            }}>{label}</button>
            <output data-testid="pending">{handle.pending ? "true" : "false"}</output>
            <output data-testid="result">{JSON.stringify(handle.result)}</output>
            <output data-testid="error">{JSON.stringify(summarizeError(handle.error))}</output>
        </>
    );
}

const PromiseOutcomeProbe = ({ operation }: { operation: () => Promise<unknown> }) => {
    const handle = useOperation<void, unknown>(operation);
    const [settled, setSettled] = useState("idle");
    return (
        <>
            <button onClick={() => {
                handle.run(undefined).then(
                    () => setSettled("resolved"),
                    () => setSettled("rejected")
                );
            }}>run</button>
            <output data-testid="settled">{settled}</output>
            <output data-testid="error">{JSON.stringify(summarizeError(handle.error))}</output>
        </>
    );
};

describe("react operation hook conformance", () => {

    it("useOperation(op) before any run exposes pending false, result null, and error null", async () => {
        const state = await CTGReactTest.init("operation initial")
            .assertComponent("initial state", (screen) => ({
                pending: screen.getByTestId("pending").textContent,
                result: screen.getByTestId("result").textContent,
                error: screen.getByTestId("error").textContent
            }), {
                pending: "false",
                result: "null",
                error: "null"
            })
            .start(<OperationProbe operation={async () => ({ ok: true })} />);

        expect(state.status).toBe(S.PASS);
    });

    it("run() outstanding exposes pending true, error null, and result its previous value", async () => {
        const pending = deferred();
        const state = await CTGReactTest.init("operation pending")
            .interact("start operation", async ({ screen, user }) => {
                await user.click(screen.getByText("run"));
            })
            .assertComponent("pending state", (screen) => ({
                pending: screen.getByTestId("pending").textContent,
                result: screen.getByTestId("result").textContent,
                error: screen.getByTestId("error").textContent
            }), {
                pending: "true",
                result: "null",
                error: "null"
            })
            .start(<OperationProbe operation={() => pending.promise} />);

        expect(state.status).toBe(S.PASS);
    });

    it("run() settling to a value exposes pending false, result the value, and error null", async () => {
        const pending = deferred();
        let runPromise: Promise<void> | null = null;
        const state = await CTGReactTest.init("operation success")
            .interact("run and settle", async ({ screen, user }) => {
                await user.click(screen.getByText("run"));
                await act(async () => {
                    pending.resolve({ status: "done" });
                    await expectRunPromise(runPromise);
                });
            })
            .assertComponent("success state", (screen) => ({
                pending: screen.getByTestId("pending").textContent,
                result: JSON.parse(screen.getByTestId("result").textContent),
                error: screen.getByTestId("error").textContent
            }), {
                pending: "false",
                result: { status: "done" },
                error: "null"
            })
            .start(<OperationProbe operation={() => pending.promise} onRun={(promise) => { runPromise = promise; }} />);

        expect(state.status).toBe(S.PASS);
    });

    it("run() settling to an error exposes pending false, error the structure, and result unchanged", async () => {
        const first = deferred();
        const second = deferred();
        let call = 0;
        let runPromise: Promise<void> | null = null;
        const operation = () => {
            call += 1;
            return call === 1 ? first.promise : second.promise;
        };

        const state = await CTGReactTest.init("operation error keeps result")
            .interact("settle first success", async ({ screen, user }) => {
                await user.click(screen.getByText("run"));
                await act(async () => {
                    first.resolve({ status: "kept" });
                    await expectRunPromise(runPromise);
                });
            })
            .interact("settle second failure", async ({ screen, user }) => {
                await user.click(screen.getByText("run"));
                await act(async () => {
                    second.reject(serviceError());
                    await expectRunPromise(runPromise);
                });
            })
            .assertComponent("failure state", (screen) => ({
                pending: screen.getByTestId("pending").textContent,
                result: JSON.parse(screen.getByTestId("result").textContent),
                error: JSON.parse(screen.getByTestId("error").textContent)
            }), {
                pending: "false",
                result: { status: "kept" },
                error: { type: "SERVICE_ERROR", service_type: "PERMISSION_DENIED", status: 403 }
            })
            .start(<OperationProbe operation={operation} onRun={(promise) => { runPromise = promise; }} />);

        expect(state.status).toBe(S.PASS);
    });

    it("run() whose supplied operation rejects returns a promise that resolves and exposes the error structure", async () => {
        const pending = deferred();
        const state = await CTGReactTest.init("operation returned promise resolves on failure")
            .interact("run and reject", async ({ screen, user }) => {
                await user.click(screen.getByText("run"));
                await act(async () => {
                    pending.reject(serviceError());
                    await pending.promise.catch(() => {});
                });
                await screen.findByText("resolved");
            })
            .assertComponent("resolved run promise", (screen) => ({
                settled: screen.getByTestId("settled").textContent,
                error: JSON.parse(screen.getByTestId("error").textContent)
            }), {
                settled: "resolved",
                error: { type: "SERVICE_ERROR", service_type: "PERMISSION_DENIED", status: 403 }
            })
            .start(<PromiseOutcomeProbe operation={() => pending.promise} />);

        expect(state.status).toBe(S.PASS);
    });

    it("two run applications with the first settling last expose the second result", async () => {
        const first = deferred();
        const second = deferred();
        let call = 0;
        const runPromises: Promise<void>[] = [];
        const operation = () => {
            call += 1;
            return call === 1 ? first.promise : second.promise;
        };

        const state = await CTGReactTest.init("operation latest wins")
            .interact("start twice and settle out of order", async ({ screen, user }) => {
                await user.click(screen.getByText("run"));
                await user.click(screen.getByText("run"));
                await act(async () => {
                    second.resolve({ id: "second" });
                    await promiseAt(runPromises, 1);
                });
                await act(async () => {
                    first.resolve({ id: "first" });
                    await promiseAt(runPromises, 0);
                });
            })
            .assertComponent("second result remains", (screen) =>
                JSON.parse(screen.getByTestId("result").textContent), { id: "second" })
            .start(<OperationProbe operation={operation} onRun={(promise) => { runPromises.push(promise); }} />);

        expect(state.status).toBe(S.PASS);
    });

    it("run() outstanding when content stops being rendered applies no exposed state change", async () => {
        const pending = deferred();
        const App = () => {
            const [show, setShow] = useState(true);
            return (
                <>
                    <button onClick={() => setShow(false)}>hide</button>
                    {show ? <OperationProbe operation={() => pending.promise} /> : <output data-testid="hidden">hidden</output>}
                </>
            );
        };

        const state = await CTGReactTest.init("operation unmounted")
            .interact("start and hide", async ({ screen, user }) => {
                await user.click(screen.getByText("run"));
                await user.click(screen.getByText("hide"));
                await act(async () => {
                    pending.resolve({ status: "late" });
                    await pending.promise;
                });
            })
            .assertComponent("no exposed late result", (screen) => ({
                hidden: screen.getByTestId("hidden").textContent,
                resultAbsent: screen.queryByTestId("result") === null
            }), {
                hidden: "hidden",
                resultAbsent: true
            })
            .start(<App />);

        expect(state.status).toBe(S.PASS);
    });

    it("useOperation given a value that is not an operation throws CONFIGURATION_INVALID with details.field operation", async () => {
        const state = await CTGReactTest.init("operation requires function")
            .assertComponent("operation error", (screen) => screen.getByTestId("error").textContent, "CONFIGURATION_INVALID:operation")
            .start(
                <ErrorBoundary>
                    {
                        // @ts-expect-error non-function operation verifies configuration error
                        <OperationProbe operation={{ not: "a function" }} />
                    }
                </ErrorBoundary>
            );

        expect(state.status).toBe(S.PASS);
    });

    it("useOperation given setupMFA and settling successfully exposes exactly provisioning_uri and secret and renders no QR code", async () => {
        const setupResult = { provisioning_uri: "otpauth://totp/ctg", secret: "SECRET" };
        let runPromise: Promise<void> | null = null;
        const { client, auth, account } = makeClient([
            { response: success(authenticated({ sub: "u1", exp: 2000 })) },
            { response: success(setupResult) }
        ]);
        await auth.login({ email: "a@example.test", password: "p" });

        const state = await CTGReactTest.init("operation setupMFA")
            .interact("run setupMFA", async ({ screen, user }) => {
                await user.click(screen.getByText("run"));
                await expectRunPromise(runPromise);
            })
            .assertComponent("setup result only", (screen) => ({
                result: JSON.parse(screen.getByTestId("result").textContent),
                qrAbsent: screen.queryByText(/qr/i) === null,
                imageAbsent: screen.queryByRole("img") === null
            }), {
                result: setupResult,
                qrAbsent: true,
                imageAbsent: true
            })
            .start(<OperationProbe operation={account.setupMFA.bind(account)} onRun={(promise) => { runPromise = promise; }} />);

        expect(state.status).toBe(S.PASS);
    });
});
