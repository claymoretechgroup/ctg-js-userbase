import { useState } from "react";
import { RequireSession, useOperation, useUserbase } from "ctg-js-userbase";

const formatValue = (value) => {
    if (value === undefined) {
        return "not present";
    }

    if (value === null) {
        return "null";
    }

    if (Array.isArray(value)) {
        return value.length === 0 ? "[]" : value.join(", ");
    }

    if (typeof value === "object") {
        return JSON.stringify(value);
    }

    return String(value);
};

function ClientErrorView({ id, error }) {
    if (error === null) {
        return null;
    }

    return (
        <div className="error" id={id} role="alert">
            <strong>{error.type ?? error.name ?? "Error"}</strong>
            <span>{error.message ? `: ${error.message}` : ""}</span>
            {error.fields !== null && error.fields !== undefined ? (
                <pre>{JSON.stringify(error.fields, null, 2)}</pre>
            ) : null}
        </div>
    );
}

function OperationStatus({ operation, successLabel }) {
    if (operation.error !== null) {
        return null;
    }

    if (operation.result === null) {
        return null;
    }

    return <p className="status">{successLabel}: {formatValue(operation.result.status ?? "ok")}</p>;
}

// Wraps an Authenticated-returning operation so the Profile it carries is
// lifted into App state before any gate unmounts the calling component
// (claims carry no email; the result's user is the only profile source).
const liftingProfile = (operation, onProfile) => async (args) => {
    const result = await operation(args);
    if (result?.user !== undefined && onProfile) {
        onProfile(result.user);
    }
    return result;
};

function LoginForm({ auth, onProfile }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const login = useOperation(liftingProfile((args) => auth.login(args), onProfile));

    const submit = (event) => {
        event.preventDefault();
        login.run({ email, password });
    };

    return (
        <form className="panel" onSubmit={submit}>
            <h2>Login</h2>
            <fieldset disabled={login.pending}>
                <label htmlFor="login-email">Email</label>
                <input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                />

                <label htmlFor="login-password">Password</label>
                <input
                    id="login-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                />

                <button id="login-submit" type="submit">
                    {login.pending ? "Logging in..." : "Login"}
                </button>
            </fieldset>
            <ClientErrorView id="login-error" error={login.error} />
            {login.result?.mfa_required === true ? (
                <p id="mfa-notice" className="notice">
                    This account requires a second factor. MFA completion is reserved for phase 2.
                </p>
            ) : null}
        </form>
    );
}

function RegisterForm({ auth }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const register = useOperation((args) => auth.register(args));

    const submit = (event) => {
        event.preventDefault();
        register.run({ email, password });
    };

    return (
        <form className="panel" onSubmit={submit}>
            <h2>Register</h2>
            <fieldset disabled={register.pending}>
                <label htmlFor="register-email">Email</label>
                <input
                    id="register-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                />

                <label htmlFor="register-password">Password</label>
                <input
                    id="register-password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                />

                <button id="register-submit" type="submit">
                    {register.pending ? "Registering..." : "Register"}
                </button>
            </fieldset>
            <ClientErrorView id="register-error" error={register.error} />
            <OperationStatus operation={register} successLabel="Register result" />
        </form>
    );
}

function ForgotPasswordForm({ auth }) {
    const [email, setEmail] = useState("");
    const forgot = useOperation((args) => auth.forgotPassword(args));

    const submit = (event) => {
        event.preventDefault();
        forgot.run({ email });
    };

    return (
        <form className="panel" onSubmit={submit}>
            <h2>Forgot Password</h2>
            <fieldset disabled={forgot.pending}>
                <label htmlFor="forgot-email">Email</label>
                <input
                    id="forgot-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                />

                <button id="forgot-submit" type="submit">
                    {forgot.pending ? "Sending..." : "Send Reset Mail"}
                </button>
            </fieldset>
            <ClientErrorView id="forgot-error" error={forgot.error} />
            <OperationStatus operation={forgot} successLabel="Forgot-password result" />
        </form>
    );
}

function SignedOutView({ auth, onProfile }) {
    const recover = useOperation(liftingProfile(() => auth.refresh(), onProfile));

    return (
        <main>
            <header>
                <h1>CTG Userbase Workbench</h1>
                <p>Staging login flow</p>
            </header>

            <section className="toolbar">
                <button id="recover-button" type="button" disabled={recover.pending} onClick={() => recover.run()}>
                    {recover.pending ? "Recovering..." : "Recover Session"}
                </button>
                <a href="/dev/mailbox.php">Staging Inbox</a>
            </section>
            <ClientErrorView id="recover-error" error={recover.error} />

            <div className="grid">
                <div className="login-column">
                    <LoginForm auth={auth} onProfile={onProfile} />
                </div>
                <RegisterForm auth={auth} />
                <ForgotPasswordForm auth={auth} />
            </div>
        </main>
    );
}

function SessionPanel({ auth, profile, onProfile }) {
    const { client, session, authenticated } = useUserbase();
    const refresh = useOperation(liftingProfile(() => auth.refresh(), onProfile));
    const logout = useOperation(() => auth.logout());
    const claims = session.claims ?? {};

    return (
        <main>
            <header>
                <h1>CTG Userbase Workbench</h1>
                <p>Active session</p>
            </header>

            <section id="session-panel" className="panel">
                <h2>Session</h2>
                <dl>
                    <div>
                        <dt>Email</dt>
                        <dd>{formatValue(profile?.email ?? claims.sub)}</dd>
                    </div>
                    <div>
                        <dt>Authenticated</dt>
                        <dd>{formatValue(authenticated)}</dd>
                    </div>
                    <div>
                        <dt>Active</dt>
                        <dd>{formatValue(client.isSessionActive())}</dd>
                    </div>
                    <div>
                        <dt>Permissions</dt>
                        <dd>{formatValue(claims.permissions)}</dd>
                    </div>
                    <div>
                        <dt>Expires</dt>
                        <dd>{formatValue(claims.exp)}</dd>
                    </div>
                </dl>

                <div className="actions">
                    <button id="refresh-button" type="button" disabled={refresh.pending} onClick={() => refresh.run()}>
                        {refresh.pending ? "Renewing..." : "Renew Now"}
                    </button>
                    <button id="logout-button" type="button" disabled={logout.pending} onClick={() => logout.run()}>
                        {logout.pending ? "Logging out..." : "Logout"}
                    </button>
                </div>
                <ClientErrorView id="refresh-error" error={refresh.error} />
                <ClientErrorView id="logout-error" error={logout.error} />
            </section>
        </main>
    );
}

export default function App({ auth }) {
    const [profile, setProfile] = useState(null);
    return (
        <RequireSession fallback={<SignedOutView auth={auth} onProfile={setProfile} />}>
            <SessionPanel auth={auth} profile={profile} onProfile={setProfile} />
        </RequireSession>
    );
}
