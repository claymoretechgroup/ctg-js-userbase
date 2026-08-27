// @vitest-environment jsdom
// realizes: presentation.md > Conformance Test Cases > Permission Presentation

import React, { useState } from "react";
import { act } from "react-dom/test-utils";
import { describe, it, expect } from "vitest";
import CTGReactTest from "ctg-react-test";
import { CTGTestResult } from "ctg-js-test";
import CTGUserbaseClient from "../../src/core/CTGUserbaseClient.js";
import Authentication from "../../src/core/Authentication.js";
import AccountManagement from "../../src/core/AccountManagement.js";
import type { Claims } from "../../src/core/types.js";
import UserbaseProvider from "../../src/react/UserbaseProvider.jsx";
import RequirePermission from "../../src/react/RequirePermission.jsx";
import usePermission from "../../src/react/usePermission.js";
import ScriptedTransport from "../support/ScriptedTransport.js";
import FixedClock from "../support/FixedClock.js";

const S = CTGTestResult.STATUS;

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
const C = { permissions: ["users:read"], scoped_permissions: ["users:update"], group_ids: [1, 2], exp: 2000 };
const noRead = { permissions: [], scoped_permissions: ["users:update"], group_ids: [1, 2], exp: 3000 };

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

interface PermissionProbeProps {
    permission: string;
    targetGroupIds?: number[];
    id?: string;
}

const PermissionProbe = ({ permission, targetGroupIds, id = "permission" }: PermissionProbeProps) => {
    const allowed = usePermission(permission, targetGroupIds);
    return <output data-testid={id}>{allowed ? "true" : "false"}</output>;
};

const ProtectedOperationProbe = ({ account }: { account: AccountManagement }) => {
    const [outcome, setOutcome] = useState("idle");
    return (
        <>
            <button onClick={async () => {
                try {
                    await account.getProfile();
                    setOutcome("success");
                } catch (error) {
                    const clientError = error as TestErrorShape;
                    setOutcome(`${clientError.type}:${clientError.service_type}:${clientError.status}`);
                }
            }}>run protected</button>
            <output data-testid="operation">{outcome}</output>
        </>
    );
};

describe("react permission presentation conformance", () => {

    it("usePermission with no enclosing provider throws CONFIGURATION_INVALID with details.field provider", async () => {
        const state = await CTGReactTest.init("usePermission requires provider")
            .assertComponent("provider error", (screen) => screen.getByTestId("error").textContent, "CONFIGURATION_INVALID:provider")
            .start(<ErrorBoundary><PermissionProbe permission="users:read" /></ErrorBoundary>);

        expect(state.status).toBe(S.PASS);
    });

    it("usePermission(\"users:read\") is true for C and rerenders false after refresh changes the permission set", async () => {
        const { client, auth } = makeClient([
            { response: success(authenticated(C)) },
            { response: success(authenticated(noRead)) }
        ]);

        const state = await CTGReactTest.init("permission refresh rerender")
            .interact("login with read", async () => {
                await act(async () => {
                    await auth.login({ email: "a@example.test", password: "p" });
                });
            })
            .assertComponent("read allowed", (screen) => screen.getByTestId("permission").textContent, "true")
            .interact("refresh without read", async () => {
                await act(async () => {
                    await auth.refresh();
                });
            })
            .assertComponent("read no longer allowed", (screen) => screen.getByTestId("permission").textContent, "false")
            .start(<UserbaseProvider client={client}><PermissionProbe permission="users:read" /></UserbaseProvider>);

        expect(state.status).toBe(S.PASS);
    });

    it("usePermission(\"users:update\", [2]) is true", async () => {
        const { client, auth } = makeClient([{ response: success(authenticated(C)) }]);
        const state = await CTGReactTest.init("scoped permission allowed")
            .interact("login", async () => {
                await act(async () => {
                    await auth.login({ email: "a@example.test", password: "p" });
                });
            })
            .assertComponent("allowed", (screen) => screen.getByTestId("permission").textContent, "true")
            .start(<UserbaseProvider client={client}><PermissionProbe permission="users:update" targetGroupIds={[2]} /></UserbaseProvider>);

        expect(state.status).toBe(S.PASS);
    });

    it("usePermission(\"users:update\", [3]) is false", async () => {
        const { client, auth } = makeClient([{ response: success(authenticated(C)) }]);
        const state = await CTGReactTest.init("scoped permission denied")
            .interact("login", async () => {
                await act(async () => {
                    await auth.login({ email: "a@example.test", password: "p" });
                });
            })
            .assertComponent("denied", (screen) => screen.getByTestId("permission").textContent, "false")
            .start(<UserbaseProvider client={client}><PermissionProbe permission="users:update" targetGroupIds={[3]} /></UserbaseProvider>);

        expect(state.status).toBe(S.PASS);
    });

    it("RequirePermission with a false predicate renders the fallback, or nothing", async () => {
        const { client, auth } = makeClient([{ response: success(authenticated(C)) }]);
        await auth.login({ email: "a@example.test", password: "p" });

        const state = await CTGReactTest.init("require permission false")
            .assertComponent("fallback and nothing", (screen) => ({
                fallback: screen.getByText("fallback").textContent,
                protectedContent: screen.queryByText("protected") === null,
                emptyProtectedContent: screen.queryByText("empty protected") === null
            }), {
                fallback: "fallback",
                protectedContent: true,
                emptyProtectedContent: true
            })
            .start(
                <UserbaseProvider client={client}>
                    <RequirePermission permission="users:delete" fallback={<span>fallback</span>}><span>protected</span></RequirePermission>
                    <RequirePermission permission="users:delete"><span>empty protected</span></RequirePermission>
                </UserbaseProvider>
            );

        expect(state.status).toBe(S.PASS);
    });

    it("RequirePermission hiding content is not enforcement: the protected operation still reaches transport and a 403 surfaces", async () => {
        const { client, auth, account, transport } = makeClient([
            { response: success(authenticated(C)) },
            { response: failure(403, { type: "PERMISSION_DENIED", message: "Denied" }) }
        ]);
        await auth.login({ email: "a@example.test", password: "p" });

        const state = await CTGReactTest.init("permission hiding not enforcement")
            .interact("run protected operation", async ({ screen, user }) => {
                await user.click(screen.getByText("run protected"));
                await screen.findByText("SERVICE_ERROR:PERMISSION_DENIED:403");
            })
            .assertComponent("operation reached service", (screen) => ({
                fallback: screen.getByText("fallback").textContent,
                outcome: screen.getByTestId("operation").textContent,
                count: transport.requests().length
            }), {
                fallback: "fallback",
                outcome: "SERVICE_ERROR:PERMISSION_DENIED:403",
                count: 2
            })
            .start(
                <UserbaseProvider client={client}>
                    <RequirePermission permission="users:delete" fallback={<span>fallback</span>}><span>protected</span></RequirePermission>
                    <ProtectedOperationProbe account={account} />
                </UserbaseProvider>
            );

        expect(state.status).toBe(S.PASS);
    });
});
