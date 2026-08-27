import { useState, type ChangeEventHandler, type FormEventHandler, type MouseEventHandler } from "react";
import {
    RequireSession,
    useOperation,
    useUserbase,
    type Authenticated,
    type Authentication,
    type ClientError,
    type ForgotPasswordArgs,
    type LoginArgs,
    type LoginResult,
    type Operation,
    type Profile,
    type RegisterArgs
} from "ctg-js-userbase";

type ProfileHandler = (profile: Profile) => void;
type RegisterResult = Awaited<ReturnType<Authentication["register"]>>;
type ForgotPasswordResult = Awaited<ReturnType<Authentication["forgotPassword"]>>;
type LogoutResult = Awaited<ReturnType<Authentication["logout"]>>;

interface AuthProps {
    auth: Authentication;
}

interface ClientErrorViewProps {
    id: string;
    error: ClientError | null;
}

interface OperationStatusProps<Result extends { readonly status?: unknown }> {
    operation: {
        readonly error: ClientError | null;
        readonly result: Result | null;
    };
    successLabel: string;
}

interface LoginFormProps extends AuthProps {
    onProfile: ProfileHandler;
}

interface SignedOutViewProps extends AuthProps {
    onProfile: ProfileHandler;
}

interface SessionPanelProps extends AuthProps {
    profile: Profile | null;
    onProfile: ProfileHandler;
}

const formatValue = (value: unknown): string => {
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
        return JSON.stringify(value) ?? String(value);
    }

    return String(value);
};

function ClientErrorView({ id, error }: ClientErrorViewProps) {
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

function OperationStatus<Result extends { readonly status?: unknown }>({ operation, successLabel }: OperationStatusProps<Result>) {
    if (operation.error !== null) {
        return null;
    }

    if (operation.result === null) {
        return null;
    }

    return <p className="status">{successLabel}: {formatValue(operation.result.status ?? "ok")}</p>;
}

// Wraps an Authenticated-returning operation so the Profile it carries is
// lifted into App state before a gate unmounts the calling component
// (claims carry no email; the result's user is the only profile source).
const hasProfile = (result: object): result is { readonly user: Profile } => (
    "user" in result && result.user !== undefined
);

const liftingProfile = <Args, Result extends object>(
    operation: Operation<Args, Result>,
    onProfile: ProfileHandler
): Operation<Args, Result> => async (args) => {
    const result = await operation(args);
    if (hasProfile(result)) {
        onProfile(result.user);
    }
    return result;
};

function LoginForm({ auth, onProfile }: LoginFormProps) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const login = useOperation<LoginArgs, LoginResult>(
        liftingProfile<LoginArgs, LoginResult>((args) => auth.login(args), onProfile)
    );

    const updateEmail: ChangeEventHandler<HTMLInputElement> = (event) => setEmail(event.target.value);
    const updatePassword: ChangeEventHandler<HTMLInputElement> = (event) => setPassword(event.target.value);
    const submit: FormEventHandler<HTMLFormElement> = (event) => {
        event.preventDefault();
        void login.run({ email, password });
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
                    onChange={updateEmail}
                    required
                />

                <label htmlFor="login-password">Password</label>
                <input
                    id="login-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={updatePassword}
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

function RegisterForm({ auth }: AuthProps) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const register = useOperation<RegisterArgs, RegisterResult>((args) => auth.register(args));

    const updateEmail: ChangeEventHandler<HTMLInputElement> = (event) => setEmail(event.target.value);
    const updatePassword: ChangeEventHandler<HTMLInputElement> = (event) => setPassword(event.target.value);
    const submit: FormEventHandler<HTMLFormElement> = (event) => {
        event.preventDefault();
        void register.run({ email, password });
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
                    onChange={updateEmail}
                    required
                />

                <label htmlFor="register-password">Password</label>
                <input
                    id="register-password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={updatePassword}
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

function ForgotPasswordForm({ auth }: AuthProps) {
    const [email, setEmail] = useState("");
    const forgot = useOperation<ForgotPasswordArgs, ForgotPasswordResult>((args) => auth.forgotPassword(args));

    const updateEmail: ChangeEventHandler<HTMLInputElement> = (event) => setEmail(event.target.value);
    const submit: FormEventHandler<HTMLFormElement> = (event) => {
        event.preventDefault();
        void forgot.run({ email });
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
                    onChange={updateEmail}
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

function SignedOutView({ auth, onProfile }: SignedOutViewProps) {
    const recover = useOperation<void, Authenticated>(
        liftingProfile<void, Authenticated>(() => auth.refresh(), onProfile)
    );
    const recoverSession: MouseEventHandler<HTMLButtonElement> = () => {
        void recover.run(undefined);
    };

    return (
        <main>
            <header>
                <h1>CTG Userbase Workbench</h1>
                <p>Staging login flow</p>
            </header>

            <section className="toolbar">
                <button id="recover-button" type="button" disabled={recover.pending} onClick={recoverSession}>
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

function SessionPanel({ auth, profile, onProfile }: SessionPanelProps) {
    const { client, session, authenticated } = useUserbase();
    const refresh = useOperation<void, Authenticated>(
        liftingProfile<void, Authenticated>(() => auth.refresh(), onProfile)
    );
    const logout = useOperation<void, LogoutResult>(() => auth.logout());
    const claims = session.claims;
    const refreshNow: MouseEventHandler<HTMLButtonElement> = () => {
        void refresh.run(undefined);
    };
    const logoutNow: MouseEventHandler<HTMLButtonElement> = () => {
        void logout.run(undefined);
    };

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
                        <dd>{formatValue(profile?.email ?? claims?.sub)}</dd>
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
                        <dd>{formatValue(claims?.permissions)}</dd>
                    </div>
                    <div>
                        <dt>Expires</dt>
                        <dd>{formatValue(claims?.exp)}</dd>
                    </div>
                </dl>

                <div className="actions">
                    <button id="refresh-button" type="button" disabled={refresh.pending} onClick={refreshNow}>
                        {refresh.pending ? "Renewing..." : "Renew Now"}
                    </button>
                    <button id="logout-button" type="button" disabled={logout.pending} onClick={logoutNow}>
                        {logout.pending ? "Logging out..." : "Logout"}
                    </button>
                </div>
                <ClientErrorView id="refresh-error" error={refresh.error} />
                <ClientErrorView id="logout-error" error={logout.error} />
            </section>
        </main>
    );
}

export default function App({ auth }: AuthProps) {
    const [profile, setProfile] = useState<Profile | null>(null);
    return (
        <RequireSession fallback={<SignedOutView auth={auth} onProfile={setProfile} />}>
            <SessionPanel auth={auth} profile={profile} onProfile={setProfile} />
        </RequireSession>
    );
}
