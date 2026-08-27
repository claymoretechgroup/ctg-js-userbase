// realizes: design-docs/js-userbase/endpoints/02-authentication.md > Conformance Test Cases > verifyMFA

import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { CTGTest, CTGTestPredicates, CTGTestResult } from "ctg-js-test";
import { totp } from "../support/totp.js";

const { STATUS } = CTGTestResult;

const baseUrl = (process.env.STAGING_URL ?? "http://localhost:8096").replace(/\/+$/, "");
const defaultFixturePath = fileURLToPath(new URL("../../../../php/ctg-php-userbase/staging/data/seed-output.json", import.meta.url));
const fixturePath = process.env.SEED_FIXTURE === undefined
    ? defaultFixturePath
    : resolve(process.cwd(), process.env.SEED_FIXTURE);
const fixtureExists = existsSync(fixturePath);
const fixture = (fixtureExists ? JSON.parse(readFileSync(fixturePath, "utf8")) : { user: { email: "", password: "" }, totp_user: { email: "", password: "", totp_secret: "" } }) as LiveFixture;
const LIVE_TIMEOUT = 65000;
// The seeded-TOTP cases wait for step boundaries (up to 4 x 30s), so
// their pipelines and vitest budgets exceed the 5s ctg-js-test default.
const MFA_LIVE_TIMEOUT = 150000;
const MFA_PIPELINE_CONFIG = { timeout: 140000 };

if (!fixtureExists) {
    console.warn(`Skipping live endpoint second-factor tests: seed fixture not found at ${fixturePath}`);
}

const splitSetCookie = (value: string): string[] => value.split(/,(?=\s*[^;=]+=[^;]+)/g).map((one) => one.trim()).filter(Boolean);

const fetchWire = async (path: string, options: LiveFetchOptions = {}): Promise<LiveWireResponse> => {
    const headers: Record<string, string> = { Accept: "application/json", ...(options.headers ?? {}) };
    let body: string | undefined;

    if (Object.hasOwn(options, "body")) {
        headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
        body = headers["Content-Type"].startsWith("application/json")
            ? JSON.stringify(options.body)
            : typeof options.body === "string" ? options.body : String(options.body);
    }
    if (options.bearer !== undefined) {
        headers.Authorization = `Bearer ${options.bearer}`;
    }
    if (options.cookie !== undefined && options.cookie !== null) {
        headers.Cookie = options.cookie;
    }

    const response = await fetch(`${baseUrl}${path}`, {
        method: options.method ?? "POST",
        headers,
        body,
        credentials: options.credentials
    });
    const text = await response.text();
    const setCookie = typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : splitSetCookie(response.headers.get("set-cookie") ?? "");

    return {
        status: response.status,
        body: (text === "" ? null : JSON.parse(text)) as TestRecord,
        text,
        setCookie,
        sent: { method: options.method ?? "POST", path, headers, body, credentials: options.credentials }
    };
};

const randomEmail = (prefix: string): string => `${prefix}-${randomUUID()}@staging.test`;
const randomPassword = () => `pass-${randomUUID()}-long-enough`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const cookieNamed = (response: LiveWireResponse, name: string): string | null => response.setCookie.find((one) => one.startsWith(`${name}=`)) ?? null;
const cookieValue = (cookie: string | null): string | null => {
    if (cookie === null) {
        return null;
    }
    return (cookie.split(";", 1)[0] ?? "").split("=").slice(1).join("=");
};
const cookieHeader = (cookie: string | null): string => `refresh_token=${cookieValue(cookie)}`;

const escapeHtml = (value: unknown): string => String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const decodeHtml = (value: unknown): string => String(value)
    .replace(/&quot;/g, "\"")
    .replace(/&#039;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

const mailboxToken = async (recipient: string, event: string): Promise<string> => {
    const response = await fetch(`${baseUrl}/dev/mailbox.php`, { headers: { Accept: "text/html" } });
    const html = await response.text();
    const recipientText = escapeHtml(recipient);
    const eventText = escapeHtml(event);
    const articles = html.match(/<article>[\s\S]*?<\/article>/g) ?? [];

    for (const article of articles) {
        if (!article.includes(`<h2>${eventText}</h2>`) || !article.includes(recipientText)) {
            continue;
        }
        const pre = article.match(/<pre>([\s\S]*?)<\/pre>/);
        if (pre === null) {
            continue;
        }
        const payload = JSON.parse(decodeHtml(pre[1] ?? "")) as TestRecord;
        if (typeof payload.token === "string") {
            return payload.token;
        }
    }
    throw new Error(`Could not extract ${event} token for ${recipient} from /dev/mailbox.php`);
};

const login = (credentials: LiveCredentials): Promise<LiveWireResponse> => fetchWire("/auth/login", {
    body: { email: credentials.email, password: credentials.password }
});

const challengeFor = async (credentials: LiveCredentials): Promise<string> => {
    const response = await login(credentials);
    return response.body.result?.mfa_token as string;
};

const waitForNextTotpStep = async () => {
    const remaining = 30000 - (Date.now() % 30000);
    await sleep(remaining + 250);
};

const seededTotpCode = async () => {
    await waitForNextTotpStep();
    return totp(fixture.totp_user.totp_secret ?? "");
};

// The seeded user's TOTP replay ledger is monotonic and persists across
// runs; a code at or below it is refused. A real user waits for the next
// code, so a seeded verify retries fresh steps until one exceeds the
// ledger.
const verifySeededMFA = async (mfaToken: string): Promise<LiveWireResponse> => {
    let response: LiveWireResponse | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
        response = await fetchWire("/auth/mfa/verify", {
            bearer: mfaToken,
            body: { code: await seededTotpCode() }
        });
        if (response.body?.result?.type !== "TOTP_CODE_REPLAYED") {
            return response;
        }
    }
    if (response === null) {
        throw new Error("MFA verification did not run");
    }
    return response;
};

const registerAndVerifyFreshUser = async (prefix: string): Promise<LiveCredentials> => {
    const email = randomEmail(prefix);
    const password = randomPassword();
    await fetchWire("/auth/register", { body: { email, password } });
    const token = await mailboxToken(email, "EMAIL_VERIFICATION");
    await fetchWire("/auth/verify-email", { body: { token } });
    return { email, password };
};

const freshTotpUser = async (): Promise<LiveTotpAccount> => {
    const account = await registerAndVerifyFreshUser("mfa-fresh");
    const signedIn = await login(account);
    const setup = await fetchWire("/mfa/setup", {
        bearer: signedIn.body.result.access_token
    });
    const secret = setup.body.result.secret;
    const confirm = await fetchWire("/mfa/confirm", {
        bearer: signedIn.body.result.access_token,
        body: { code: totp(secret as string) }
    });
    return { ...account, secret: secret as string, recovery_codes: confirm.body.result.recovery_codes ?? [] };
};

describe.skipIf(!fixtureExists)("live endpoint second-factor conformance", () => {
    it("verifyMFA({ mfa_token: M, code }) sends one POST /auth/mfa/verify request with no query, bearer credential M, and JSON body carrying code", async () => {
        const state = await CTGTest.init("mfa verify code request")
            .stage("act", async () => {
                const mfaToken = await challengeFor(fixture.totp_user);
                return verifySeededMFA(mfaToken);
            })
            .assert("code request", (state) => state.subject, CTGTestPredicates.satisfies((response: LiveWireResponse) => {
                const sentBody = JSON.parse(response.sent.body ?? "") as TestRecord;
                return response.sent.method === "POST" &&
                    response.sent.path === "/auth/mfa/verify" &&
                    response.sent.path.includes("?") === false &&
                    response.sent.headers.Authorization !== undefined && response.sent.headers.Authorization.startsWith("Bearer ") &&
                    typeof sentBody.code === "string" &&
                    response.status === 200;
            }))
            .start(undefined, MFA_PIPELINE_CONFIG);

        expect(state.status).toBe(STATUS.PASS);
    }, MFA_LIVE_TIMEOUT);

    it("verifyMFA({ mfa_token: M, recovery_code }) sends recovery_code in the JSON body and sends M only as the bearer credential", async () => {
        const state = await CTGTest.init("mfa verify recovery request")
            .stage("act", async () => {
                const account = await freshTotpUser();
                const mfaToken = await challengeFor(account);
                return fetchWire("/auth/mfa/verify", {
                    bearer: mfaToken,
                    body: { recovery_code: account.recovery_codes[0] }
                });
            })
            .assert("recovery request", (state) => state.subject, CTGTestPredicates.satisfies((response: LiveWireResponse) => {
                const sentBody = JSON.parse(response.sent.body ?? "") as TestRecord;
                return response.sent.method === "POST" &&
                    response.sent.path === "/auth/mfa/verify" &&
                    response.sent.headers.Authorization !== undefined && response.sent.headers.Authorization.startsWith("Bearer ") &&
                    sentBody.mfa_token === undefined &&
                    typeof sentBody.recovery_code === "string" &&
                    response.status === 200;
            }))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    }, LIVE_TIMEOUT);

    it("verifyMFA while a session access token is held still sends M as the bearer credential", async () => {
        const state = await CTGTest.init("mfa challenge token wins over session token")
            .stage("act", async () => {
                const session = await login(fixture.user);
                const sessionAccessToken = session.body.result.access_token as string;
                const account = await freshTotpUser();
                const mfaToken = await challengeFor(account);
                const response = await fetchWire("/auth/mfa/verify", {
                    bearer: mfaToken,
                    body: { recovery_code: account.recovery_codes[0] }
                });
                return { response, mfaToken, sessionAccessToken };
            })
            .assert("mfa bearer used", (state) => state.subject, CTGTestPredicates.satisfies(({ response, mfaToken, sessionAccessToken }: { response: LiveWireResponse; mfaToken: string; sessionAccessToken: string }) => (
                response.sent.headers.Authorization === `Bearer ${mfaToken}` &&
                response.sent.headers.Authorization !== `Bearer ${sessionAccessToken}` &&
                response.status === 200
            )))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    }, LIVE_TIMEOUT);

    it("A successful verifyMFA response returns Authenticated and sets the refresh cookie", async () => {
        const state = await CTGTest.init("mfa verify success")
            .stage("act", async () => {
                const mfaToken = await challengeFor(fixture.totp_user);
                const response = await verifySeededMFA(mfaToken);
                return { response, cookie: cookieNamed(response, "refresh_token") };
            })
            .assert("authenticated response", (state) => state.subject, CTGTestPredicates.satisfies(({ response, cookie }: { response: LiveWireResponse; cookie: string | null }) => (
                response.status === 200 &&
                typeof response.body.result.user === "object" &&
                typeof response.body.result.access_token === "string" &&
                typeof response.body.result.access_expires_at === "number" &&
                response.body.result.mfa_required === undefined &&
                cookie !== null
            )))
            .start(undefined, MFA_PIPELINE_CONFIG);

        expect(state.status).toBe(STATUS.PASS);
    }, MFA_LIVE_TIMEOUT);

    it("verifyMFA answered 401 with the authentication failure shape performs no renewal attempt", async () => {
        const state = await CTGTest.init("mfa 401 no renewal")
            .stage("act", async () => {
                const session = await login(fixture.user);
                return fetchWire("/auth/mfa/verify", {
                    bearer: "not-a-valid-challenge-token",
                    cookie: cookieHeader(cookieNamed(session, "refresh_token")),
                    body: { code: "123456" },
                    credentials: "include"
                });
            })
            .assert("authentication failure only", (state) => state.subject, CTGTestPredicates.satisfies((response: LiveWireResponse) => (
                response.status === 401 &&
                response.body.success === false &&
                typeof response.body.result === "string" &&
                response.body.result === "Authorization token required" &&
                cookieNamed(response, "refresh_token") === null
            )))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    }, LIVE_TIMEOUT);

    it("verifyMFA with neither code nor recovery_code sends the challenge token with an empty body and returns the shared operation-failure shape", async () => {
        const state = await CTGTest.init("mfa no factor")
            .stage("act", async () => {
                const mfaToken = await challengeFor(fixture.totp_user);
                return fetchWire("/auth/mfa/verify", {
                    bearer: mfaToken,
                    body: {}
                });
            })
            .assert("shared failure conventions", (state) => state.subject, CTGTestPredicates.satisfies((response: LiveWireResponse) => (
                response.sent.headers.Authorization !== undefined && response.sent.headers.Authorization.startsWith("Bearer ") &&
                response.sent.body === "{}" &&
                response.status === 422 &&
                response.body.success === false &&
                response.body.result.type === "INVALID_ARGUMENT"
            )))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    }, LIVE_TIMEOUT);
});
