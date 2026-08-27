// @vitest-environment jsdom
// realizes: presentation.md > Conformance Test Cases > Provider and Session Exposure

import React, { useState } from "react";
import { act } from "react-dom/test-utils";
import { describe, it, expect } from "vitest";
import CTGReactTest from "ctg-react-test";
import { CTGTestResult } from "ctg-js-test";
import CTGUserbaseClient from "../../src/core/CTGUserbaseClient.js";
import Authentication from "../../src/core/Authentication.js";
import type { SessionState } from "../../src/core/types.js";
import UserbaseProvider from "../../src/react/UserbaseProvider.jsx";
import useUserbase from "../../src/react/useUserbase.js";
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

const makeClient = (script: TestScriptEntry[], now = 1000) => {
    const transport = ScriptedTransport.init(script);
    const client = new CTGUserbaseClient({ base_url: "https://s", transport, clock: FixedClock.init(now) });
    return { client, transport, auth: Authentication.init(client) };
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

interface SessionProbeProps {
    id?: string;
    expectedClient?: CTGUserbaseClient | null;
}

const SessionProbe = ({ id = "session", expectedClient = null }: SessionProbeProps) => {
    const exposure = useUserbase();
    return (
        <output data-testid={id}>
            {JSON.stringify({
                ownClient: expectedClient === null ? true : exposure.client === expectedClient,
                token: exposure.session.access_token,
                claims: exposure.session.claims,
                authenticated: exposure.authenticated,
                active: exposure.client.isSessionActive()
            })}
        </output>
    );
};

describe("react provider and session exposure conformance", () => {

    it("UserbaseProvider given a client and content renders the content", async () => {
        const { client } = makeClient([]);
        const state = await CTGReactTest.init("provider renders content")
            .assertComponent("content rendered", (screen) => screen.getByText("content").textContent, "content")
            .start(<UserbaseProvider client={client}><span>content</span></UserbaseProvider>);

        expect(state.status).toBe(S.PASS);
    });

    it("UserbaseProvider given no client throws CONFIGURATION_INVALID with details.field client", async () => {
        const state = await CTGReactTest.init("provider requires client")
            .assertComponent("configuration error", (screen) => screen.getByTestId("error").textContent, "CONFIGURATION_INVALID:client")
            .start(
                <ErrorBoundary>
                    {
                        // @ts-expect-error missing client verifies provider configuration error
                        <UserbaseProvider><span>content</span></UserbaseProvider>
                    }
                </ErrorBoundary>
            );

        expect(state.status).toBe(S.PASS);
    });

    it("a provider that stops being rendered has unsubscribed before a later session mutation", async () => {
        const { client, auth } = makeClient([{ response: success(authenticated({ sub: "u1", exp: 2000 })) }]);
        let providerNotifications = 0;
        const subscribe = client.subscribe.bind(client);
        client.subscribe = (listener) => subscribe((session) => {
            providerNotifications += 1;
            listener(session);
        });

        const App = () => {
            const [show, setShow] = useState(true);
            const [reported, setReported] = useState("0");
            return (
                <>
                    <button onClick={() => setShow(false)}>hide</button>
                    <button onClick={() => setReported(String(providerNotifications))}>report</button>
                    <output data-testid="reported">{reported}</output>
                    {show
                        ? <UserbaseProvider client={client}><span>inside</span></UserbaseProvider>
                        : <span>outside</span>}
                </>
            );
        };

        const state = await CTGReactTest.init("provider unsubscribe")
            .interact("hide provider", async ({ screen, user }) => {
                await user.click(screen.getByText("hide"));
            })
            .interact("mutate session after unmount", async ({ screen, user }) => {
                await act(async () => {
                    await auth.login({ email: "a@example.test", password: "p" });
                });
                await user.click(screen.getByText("report"));
            })
            .assertComponent("no provider listener call", (screen) => screen.getByTestId("reported").textContent, "0")
            .start(<App />);

        expect(state.status).toBe(S.PASS);
    });

    it("two independent providers expose their own nearest client and session", async () => {
        const setupA = makeClient([{ response: success(authenticated({ sub: "a", exp: 2000 })) }]);
        const setupB = makeClient([]);
        const App = () => (
            <>
                <UserbaseProvider client={setupA.client}><SessionProbe id="a" expectedClient={setupA.client} /></UserbaseProvider>
                <UserbaseProvider client={setupB.client}><SessionProbe id="b" expectedClient={setupB.client} /></UserbaseProvider>
            </>
        );

        const state = await CTGReactTest.init("independent providers")
            .interact("login first client", async () => {
                await act(async () => {
                    await setupA.auth.login({ email: "a@example.test", password: "p" });
                });
            })
            .assertComponent("first changed, second unchanged", (screen) => ({
                a: JSON.parse(screen.getByTestId("a").textContent),
                b: JSON.parse(screen.getByTestId("b").textContent)
            }), {
                a: { ownClient: true, token: tokenFor({ sub: "a", exp: 2000 }), claims: { sub: "a", exp: 2000 }, authenticated: true, active: true },
                b: { ownClient: true, token: null, claims: null, authenticated: false, active: false }
            })
            .start(<App />);

        expect(state.status).toBe(S.PASS);
    });

    it("useUserbase inside a provider exposes that provider's client and current session state", async () => {
        const { client } = makeClient([]);
        const state = await CTGReactTest.init("useUserbase exposure")
            .assertComponent("empty session exposed", (screen) => JSON.parse(screen.getByTestId("session").textContent), {
                ownClient: true,
                token: null,
                claims: null,
                authenticated: false,
                active: false
            })
            .start(<UserbaseProvider client={client}><SessionProbe expectedClient={client} /></UserbaseProvider>);

        expect(state.status).toBe(S.PASS);
    });

    it("useUserbase with no enclosing provider throws CONFIGURATION_INVALID with details.field provider", async () => {
        const state = await CTGReactTest.init("useUserbase requires provider")
            .assertComponent("provider error", (screen) => screen.getByTestId("error").textContent, "CONFIGURATION_INVALID:provider")
            .start(<ErrorBoundary><SessionProbe /></ErrorBoundary>);

        expect(state.status).toBe(S.PASS);
    });

    it("successful login through Authentication on the provider client rerenders content with the new session", async () => {
        const claims = { sub: "u1", exp: 2000 };
        const { client, auth } = makeClient([{ response: success(authenticated(claims)) }]);
        const state = await CTGReactTest.init("provider login rerender")
            .interact("login", async () => {
                await act(async () => {
                    await auth.login({ email: "a@example.test", password: "p" });
                });
            })
            .assertComponent("session rendered", (screen) => JSON.parse(screen.getByTestId("session").textContent).claims, claims)
            .start(<UserbaseProvider client={client}><SessionProbe /></UserbaseProvider>);

        expect(state.status).toBe(S.PASS);
    });

    it("successful logout through Authentication on the provider client rerenders content with authenticated false", async () => {
        const { client, auth } = makeClient([
            { response: success(authenticated({ sub: "u1", exp: 2000 })) },
            { response: success({ status: "logged_out" }) }
        ]);
        const state = await CTGReactTest.init("provider logout rerender")
            .interact("login and logout", async () => {
                await act(async () => {
                    await auth.login({ email: "a@example.test", password: "p" });
                    await auth.logout();
                });
            })
            .assertComponent("logged out rendered", (screen) => JSON.parse(screen.getByTestId("session").textContent).authenticated, false)
            .start(<UserbaseProvider client={client}><SessionProbe /></UserbaseProvider>);

        expect(state.status).toBe(S.PASS);
    });

    it("useUserbase().authenticated with claims held and the clock past claims.exp is true", async () => {
        const claims = { sub: "u1", exp: 900 };
        const { client, auth } = makeClient([{ response: success(authenticated(claims)) }], 1000);
        await auth.login({ email: "a@example.test", password: "p" });

        const state = await CTGReactTest.init("authenticated ignores expiry")
            .assertComponent("authenticated true", (screen) => JSON.parse(screen.getByTestId("session").textContent).authenticated, true)
            .start(<UserbaseProvider client={client}><SessionProbe /></UserbaseProvider>);

        expect(state.status).toBe(S.PASS);
    });

    it("isSessionActive in the same expired-claims state is false", async () => {
        const claims = { sub: "u1", exp: 900 };
        const { client, auth } = makeClient([{ response: success(authenticated(claims)) }], 1000);
        await auth.login({ email: "a@example.test", password: "p" });

        const state = await CTGReactTest.init("isSessionActive expired")
            .assertComponent("active false", (screen) => JSON.parse(screen.getByTestId("session").textContent).active, false)
            .start(<UserbaseProvider client={client}><SessionProbe /></UserbaseProvider>);

        expect(state.status).toBe(S.PASS);
    });
});
