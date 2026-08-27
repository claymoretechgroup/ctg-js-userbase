// realizes: design-docs/js-userbase/endpoints/01-conventions.md > Conformance Test Cases

import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { CTGTest, CTGTestPredicates, CTGTestResult } from "ctg-js-test";

const { STATUS } = CTGTestResult;

const baseUrl = (process.env.STAGING_URL ?? "http://localhost:8096").replace(/\/+$/, "");
const defaultFixturePath = fileURLToPath(new URL("../../../../php/ctg-php-userbase/staging/data/seed-output.json", import.meta.url));
const fixturePath = process.env.SEED_FIXTURE === undefined
    ? defaultFixturePath
    : resolve(process.cwd(), process.env.SEED_FIXTURE);
const fixtureExists = existsSync(fixturePath);
const fixture = (fixtureExists ? JSON.parse(readFileSync(fixturePath, "utf8")) : { user: { email: "", password: "" }, totp_user: { email: "", password: "", totp_secret: "" } }) as LiveFixture;

if (!fixtureExists) {
    console.warn(`Skipping live endpoint convention tests: seed fixture not found at ${fixturePath}`);
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
        body
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
        sent: { method: options.method ?? "POST", path, headers, body }
    };
};

const randomEmail = (prefix: string): string => `${prefix}-${randomUUID()}@staging.test`;
const randomPassword = () => `pass-${randomUUID()}-long-enough`;

const cookieNamed = (response: LiveWireResponse, name: string): string | null => response.setCookie.find((one) => one.startsWith(`${name}=`)) ?? null;
const cookieValue = (cookie: string | null): string | null => {
    if (cookie === null) {
        return null;
    }
    return (cookie.split(";", 1)[0] ?? "").split("=").slice(1).join("=");
};
const hasAttribute = (cookie: string | null, name: string): boolean =>
    cookie !== null && cookie.split(";").some((part) => part.trim().toLowerCase() === name.toLowerCase());
const attribute = (cookie: string | null, name: string): string | null => {
    if (cookie === null) {
        return null;
    }
    const prefix = `${name.toLowerCase()}=`;
    const part = cookie.split(";").map((one: string) => one.trim()).find((one: string) => one.toLowerCase().startsWith(prefix));
    return part === undefined ? null : part.slice(name.length + 1);
};

const mentionsRefreshCredential = (response: LiveWireResponse, cookie: string | null): boolean => {
    const value = cookieValue(cookie);
    return response.text.includes("refresh_token") ||
        response.text.includes("refreshToken") ||
        (value !== null && value !== "" && response.text.includes(value));
};

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

const registerAndVerifyFreshUser = async () => {
    const email = randomEmail("conventions-user");
    const password = randomPassword();
    await fetchWire("/auth/register", { body: { email, password } });
    const token = await mailboxToken(email, "EMAIL_VERIFICATION");
    await fetchWire("/auth/verify-email", { body: { token } });
    return { email, password };
};

const login = (credentials: LiveCredentials): Promise<LiveWireResponse> => fetchWire("/auth/login", {
    body: { email: credentials.email, password: credentials.password }
});

describe.skipIf(!fixtureExists)("live endpoint convention conformance", () => {
    // Cross-origin renewal is owned by the browser suite because Node fetch cannot model browser SameSite withholding and replay behavior.

    it("A success response with a body is JSON object { success: true, result: <the endpoint's success shape> }", async () => {
        const state = await CTGTest.init("conventions success envelope")
            .stage("act", async () => fetchWire("/auth/register", {
                body: { email: randomEmail("success"), password: randomPassword() }
            }))
            .assert("success envelope", (state) => state.subject, CTGTestPredicates.satisfies((response: LiveWireResponse) => (
                response.status === 200 &&
                response.body.success === true &&
                response.body.result.status === "verification_sent"
            )))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("A failure response is JSON object { success: false, result: <one of the three failure shapes> }", async () => {
        const state = await CTGTest.init("conventions failure envelope")
            .stage("act", async () => login({ email: randomEmail("nobody"), password: randomPassword() }))
            .assert("failure envelope", (state) => state.subject, CTGTestPredicates.satisfies((response: LiveWireResponse) => (
                response.status === 403 &&
                response.body.success === false &&
                typeof response.body.result === "object" &&
                response.body.result.type === "INVALID_CREDENTIALS"
            )))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("A response with status 204 carries no body", async () => {
        const state = await CTGTest.init("conventions bodyless 204")
            .stage("act", async () => {
                const account = await registerAndVerifyFreshUser();
                await login(account);
                const second = await login(account);
                const sessions = await fetchWire("/me/sessions", {
                    method: "GET",
                    bearer: second.body.result.access_token
                });
                const target = sessions.body.result.find((one) => one.current === false) ?? sessions.body.result[0];
                if (target === undefined || target.id === undefined) {
                    throw new Error("Expected a session target");
                }
                return fetchWire(`/me/session?id=${encodeURIComponent(target.id)}`, {
                    method: "DELETE",
                    bearer: second.body.result.access_token
                });
            })
            .assert("empty response", (state) => state.subject, CTGTestPredicates.satisfies((response: LiveWireResponse) => (
                response.status === 204 &&
                response.text === "" &&
                response.body === null
            )))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("A 401 response carries the authentication failure shape: result is a plain string, and success is false", async () => {
        const state = await CTGTest.init("conventions 401 authentication failure")
            .stage("act", async () => fetchWire("/auth/refresh"))
            .assert("plain string result", (state) => state.subject, CTGTestPredicates.satisfies((response: LiveWireResponse) => (
                response.status === 401 &&
                response.body.success === false &&
                typeof response.body.result === "string"
            )))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("A 403 response carries the operation failure shape, and a permission refusal carries type PERMISSION_DENIED", async () => {
        const state = await CTGTest.init("conventions 403 permission failure")
            .stage("act", async () => {
                const signedIn = await login(fixture.user);
                return fetchWire("/admin/users", {
                    method: "GET",
                    bearer: signedIn.body.result.access_token
                });
            })
            .assert("permission denied result", (state) => state.subject, CTGTestPredicates.satisfies((response: LiveWireResponse) => (
                response.status === 403 &&
                response.body.success === false &&
                response.body.result.type === "PERMISSION_DENIED"
            )))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("A parameter failure carries success false and a result map keyed by parameter name", async () => {
        const state = await CTGTest.init("conventions parameter failure")
            .stage("act", async () => fetchWire("/auth/login", {
                body: { email: randomEmail("missing-password") }
            }))
            .assert("parameter map", (state) => state.subject, CTGTestPredicates.satisfies((response: LiveWireResponse) => (
                response.status === 400 &&
                response.body.success === false &&
                response.body.result.password === "Required"
            )))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("A non-empty request body with a non-JSON content type is rejected with status 400 and the operation failure shape", async () => {
        const state = await CTGTest.init("conventions rejects non-json")
            .stage("act", async () => fetchWire("/auth/login", {
                body: `email=${encodeURIComponent(randomEmail("form"))}&password=${encodeURIComponent(randomPassword())}`,
                headers: { "Content-Type": "application/x-www-form-urlencoded" }
            }))
            .assert("invalid content type", (state) => state.subject, CTGTestPredicates.satisfies((response: LiveWireResponse) => (
                response.status === 400 &&
                response.body.success === false &&
                response.body.result.type === "INVALID_CONTENT_TYPE"
            )))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("No response body contains a plaintext refresh credential", async () => {
        const state = await CTGTest.init("conventions no refresh credential in body")
            .stage("act", async () => {
                const signedIn = await login(fixture.user);
                const cookie = cookieNamed(signedIn, "refresh_token");
                return { signedIn, cookie };
            })
            .assert("body excludes cookie credential", (state) => state.subject, CTGTestPredicates.satisfies(({ signedIn, cookie }: { signedIn: LiveWireResponse; cookie: string | null }) => (
                cookie !== null &&
                mentionsRefreshCredential(signedIn, cookie) === false
            )))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("A response that sets the refresh cookie uses HttpOnly, Secure, SameSite=Strict, and Path=/auth", async () => {
        const state = await CTGTest.init("conventions refresh cookie attributes")
            .stage("act", async () => cookieNamed(await login(fixture.user), "refresh_token"))
            .assert("refresh cookie attributes", (state) => state.subject, CTGTestPredicates.satisfies((cookie: string | null) => (
                cookie !== null &&
                cookie.startsWith("refresh_token=") &&
                hasAttribute(cookie, "HttpOnly") &&
                hasAttribute(cookie, "Secure") &&
                attribute(cookie, "SameSite") === "Strict" &&
                attribute(cookie, "Path") === "/auth"
            )))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("A refresh request with no cookie present returns 401 with the authentication failure shape", async () => {
        const state = await CTGTest.init("conventions refresh no cookie")
            .stage("act", async () => fetchWire("/auth/refresh"))
            .assert("401 authentication failure", (state) => state.subject, CTGTestPredicates.satisfies((response: LiveWireResponse) => (
                response.status === 401 &&
                response.body.success === false &&
                typeof response.body.result === "string"
            )))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });

    it("A logout request with no cookie present returns 200 with the ordinary logout success shape", async () => {
        const state = await CTGTest.init("conventions logout no cookie")
            .stage("act", async () => fetchWire("/auth/logout"))
            .assert("ordinary logout success", (state) => state.subject, CTGTestPredicates.satisfies((response: LiveWireResponse) => (
                response.status === 200 &&
                response.body.success === true &&
                response.body.result.status === "logged_out"
            )))
            .start(undefined);

        expect(state.status).toBe(STATUS.PASS);
    });
});
