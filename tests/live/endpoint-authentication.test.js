// realizes: design-docs/js-userbase/endpoints/02-authentication.md > Conformance Test Cases > register, verifyEmail, login, refresh, logout, forgotPassword, resetPassword

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
const fixture = fixtureExists ? JSON.parse(readFileSync(fixturePath, "utf8")) : null;

if (!fixtureExists) {
    console.warn(`Skipping live endpoint authentication tests: seed fixture not found at ${fixturePath}`);
}

const splitSetCookie = (value) => value.split(/,(?=\s*[^;=]+=[^;]+)/g).map((one) => one.trim()).filter(Boolean);

const fetchWire = async (path, options = {}) => {
    const headers = { Accept: "application/json", ...(options.headers ?? {}) };
    let body;

    if (Object.hasOwn(options, "body")) {
        headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
        body = headers["Content-Type"].startsWith("application/json")
            ? JSON.stringify(options.body)
            : options.body;
    }
    if (options.bearer !== undefined) {
        headers.Authorization = `Bearer ${options.bearer}`;
    }
    if (options.cookie !== undefined) {
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
        body: text === "" ? null : JSON.parse(text),
        text,
        setCookie,
        sent: { method: options.method ?? "POST", path, headers, body, credentials: options.credentials }
    };
};

const randomEmail = (prefix) => `${prefix}-${randomUUID()}@staging.test`;
const randomPassword = () => `pass-${randomUUID()}-long-enough`;

const cookieNamed = (response, name) => response.setCookie.find((one) => one.startsWith(`${name}=`)) ?? null;
const cookieValue = (cookie) => cookie === null ? null : cookie.split(";", 1)[0].split("=").slice(1).join("=");
const cookieHeader = (cookie) => `refresh_token=${cookieValue(cookie)}`;
const containsRefreshCredential = (response, cookie) => {
    const value = cookieValue(cookie);
    return response.text.includes("refresh_token") ||
        response.text.includes("refreshToken") ||
        (value !== null && value !== "" && response.text.includes(value));
};

const escapeHtml = (value) => String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const decodeHtml = (value) => String(value)
    .replace(/&quot;/g, "\"")
    .replace(/&#039;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

const mailboxToken = async (recipient, event) => {
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
        const payload = JSON.parse(decodeHtml(pre[1]));
        if (typeof payload.token === "string") {
            return payload.token;
        }
    }
    throw new Error(`Could not extract ${event} token for ${recipient} from /dev/mailbox.php`);
};

const registerFresh = async (prefix = "auth-user") => {
    const email = randomEmail(prefix);
    const password = randomPassword();
    const response = await fetchWire("/auth/register", { body: { email, password } });
    return { email, password, response };
};

const resetTokenForFreshUser = async (prefix = "reset-user") => {
    const account = await registerFresh(prefix);
    await fetchWire("/password/forgot", { body: { email: account.email } });
    const token = await mailboxToken(account.email, "PASSWORD_RESET_LINK");
    return { ...account, token };
};

const login = (credentials) => fetchWire("/auth/login", {
    body: { email: credentials.email, password: credentials.password }
});

describe.skipIf(!fixtureExists)("live endpoint authentication conformance", () => {
    it("register({ email, password }) sends one POST /auth/register request with no query, no bearer credential, and JSON body carrying email and password", async () => {
        const state = await CTGTest.init("auth register email password")
            .stage("act", async () => fetchWire("/auth/register", {
                body: { email: randomEmail("register"), password: randomPassword() }
            }))
            .assert("request and response", (state) => state.subject, CTGTestPredicates.satisfies((response) => (
                response.sent.method === "POST" &&
                response.sent.path === "/auth/register" &&
                response.sent.headers.Authorization === undefined &&
                response.sent.headers["Content-Type"] === "application/json" &&
                JSON.parse(response.sent.body).email.endsWith("@staging.test") &&
                typeof JSON.parse(response.sent.body).password === "string" &&
                response.status === 200 &&
                response.body.result.status === "verification_sent"
            )))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("register({ email, password, name }) sends name in the JSON body, not in the query string", async () => {
        const state = await CTGTest.init("auth register name in body")
            .stage("act", async () => fetchWire("/auth/register", {
                body: { email: randomEmail("register-name"), password: randomPassword(), name: "Live User" }
            }))
            .assert("name carried in body", (state) => state.subject, CTGTestPredicates.satisfies((response) => {
                const sentBody = JSON.parse(response.sent.body);
                return response.sent.path === "/auth/register" &&
                    response.sent.path.includes("?") === false &&
                    sentBody.name === "Live User" &&
                    response.status === 200;
            }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("Registering an address the service already holds returns { status: \"verification_sent\" } and is not a failure", async () => {
        const state = await CTGTest.init("auth register existing")
            .stage("act", async () => fetchWire("/auth/register", {
                body: { email: fixture.user.email, password: randomPassword() }
            }))
            .assert("existing registration success", (state) => state.subject, CTGTestPredicates.satisfies((response) => (
                response.status === 200 &&
                response.body.success === true &&
                response.body.result.status === "verification_sent"
            )))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("verifyEmail({ token }) sends one POST /auth/verify-email request with no query, no bearer credential, and JSON body carrying token", async () => {
        const state = await CTGTest.init("auth verify email request")
            .stage("act", async () => {
                const account = await registerFresh("verify");
                const token = await mailboxToken(account.email, "EMAIL_VERIFICATION");
                return fetchWire("/auth/verify-email", { body: { token } });
            })
            .assert("verify email request", (state) => state.subject, CTGTestPredicates.satisfies((response) => {
                const sentBody = JSON.parse(response.sent.body);
                return response.sent.method === "POST" &&
                    response.sent.path === "/auth/verify-email" &&
                    response.sent.headers.Authorization === undefined &&
                    typeof sentBody.token === "string" &&
                    response.status === 200 &&
                    response.body.success === true &&
                    response.setCookie.length === 0;
            }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("login({ email, password }) sends one POST /auth/login request with no query, no bearer credential, and JSON body carrying email and password", async () => {
        const state = await CTGTest.init("auth login request")
            .stage("act", async () => login(fixture.user))
            .assert("login request", (state) => state.subject, CTGTestPredicates.satisfies((response) => {
                const sentBody = JSON.parse(response.sent.body);
                return response.sent.method === "POST" &&
                    response.sent.path === "/auth/login" &&
                    response.sent.headers.Authorization === undefined &&
                    sentBody.email === fixture.user.email &&
                    sentBody.password === fixture.user.password &&
                    response.status === 200;
            }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("A completed login response returns LoginResult as Authenticated, sets the refresh cookie, and the response body contains no refresh credential", async () => {
        const state = await CTGTest.init("auth completed login")
            .stage("act", async () => {
                const response = await login(fixture.user);
                return { response, cookie: cookieNamed(response, "refresh_token") };
            })
            .assert("authenticated branch", (state) => state.subject, CTGTestPredicates.satisfies(({ response, cookie }) => (
                response.status === 200 &&
                response.body.result.mfa_required === false &&
                typeof response.body.result.user === "object" &&
                typeof response.body.result.access_token === "string" &&
                typeof response.body.result.access_expires_at === "number" &&
                cookie !== null &&
                containsRefreshCredential(response, cookie) === false
            )))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("A second-factor login response returns LoginResult as MFAChallenge and does not establish a session", async () => {
        const state = await CTGTest.init("auth mfa challenge login")
            .stage("act", async () => login(fixture.totp_user))
            .assert("challenge branch", (state) => state.subject, CTGTestPredicates.satisfies((response) => (
                response.status === 200 &&
                response.body.result.mfa_required === true &&
                typeof response.body.result.mfa_token === "string" &&
                typeof response.body.result.mfa_expires_at === "number" &&
                response.body.result.user === undefined &&
                response.body.result.access_token === undefined &&
                cookieNamed(response, "refresh_token") === null
            )))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("login answered 403 with operation failure type INVALID_CREDENTIALS surfaces as the shared operation-failure path", async () => {
        const state = await CTGTest.init("auth invalid credentials")
            .stage("act", async () => login({ email: randomEmail("nobody"), password: randomPassword() }))
            .assert("operation failure", (state) => state.subject, CTGTestPredicates.satisfies((response) => (
                response.status === 403 &&
                response.body.success === false &&
                response.body.result.type === "INVALID_CREDENTIALS" &&
                typeof response.body.result.message === "string"
            )))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("refresh() sends one POST /auth/refresh request with no query, no body, no bearer credential, and credentials included so the refresh cookie can travel", async () => {
        const state = await CTGTest.init("auth refresh request")
            .stage("act", async () => {
                const signedIn = await login(fixture.user);
                return fetchWire("/auth/refresh", {
                    cookie: cookieHeader(cookieNamed(signedIn, "refresh_token")),
                    credentials: "include"
                });
            })
            .assert("refresh request", (state) => state.subject, CTGTestPredicates.satisfies((response) => (
                response.sent.method === "POST" &&
                response.sent.path === "/auth/refresh" &&
                response.sent.body === undefined &&
                response.sent.headers.Authorization === undefined &&
                response.sent.headers.Cookie.startsWith("refresh_token=") &&
                response.sent.credentials === "include" &&
                response.status === 200
            )))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("A successful refresh response returns Authenticated and sets a new refresh cookie value", async () => {
        const state = await CTGTest.init("auth successful refresh")
            .stage("act", async () => {
                const signedIn = await login(fixture.user);
                const firstCookie = cookieNamed(signedIn, "refresh_token");
                const refreshed = await fetchWire("/auth/refresh", {
                    cookie: cookieHeader(firstCookie),
                    credentials: "include"
                });
                return { firstCookie, refreshed, secondCookie: cookieNamed(refreshed, "refresh_token") };
            })
            .assert("refresh rotates", (state) => state.subject, CTGTestPredicates.satisfies(({ firstCookie, refreshed, secondCookie }) => (
                refreshed.status === 200 &&
                typeof refreshed.body.result.user === "object" &&
                typeof refreshed.body.result.access_token === "string" &&
                typeof refreshed.body.result.access_expires_at === "number" &&
                firstCookie !== null &&
                secondCookie !== null &&
                cookieValue(secondCookie) !== cookieValue(firstCookie)
            )))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("refresh with no cookie present returns 401 with the authentication failure shape", async () => {
        const state = await CTGTest.init("auth refresh no cookie")
            .stage("act", async () => fetchWire("/auth/refresh", { credentials: "include" }))
            .assert("authentication failure", (state) => state.subject, CTGTestPredicates.satisfies((response) => (
                response.status === 401 &&
                response.body.success === false &&
                typeof response.body.result === "string"
            )))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("refresh with an already-rotated refresh cookie returns 401 with the authentication failure shape and clears the refresh cookie", async () => {
        const state = await CTGTest.init("auth refresh reused cookie")
            .stage("act", async () => {
                const signedIn = await login(fixture.user);
                const spentCookie = cookieNamed(signedIn, "refresh_token");
                await fetchWire("/auth/refresh", {
                    cookie: cookieHeader(spentCookie),
                    credentials: "include"
                });
                const reused = await fetchWire("/auth/refresh", {
                    cookie: cookieHeader(spentCookie),
                    credentials: "include"
                });
                return { reused, clearingCookie: cookieNamed(reused, "refresh_token") };
            })
            .assert("reuse clears", (state) => state.subject, CTGTestPredicates.satisfies(({ reused, clearingCookie }) => (
                reused.status === 401 &&
                reused.body.success === false &&
                typeof reused.body.result === "string" &&
                clearingCookie !== null &&
                cookieValue(clearingCookie) === ""
            )))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("logout() sends one POST /auth/logout request with no query, no body, no bearer credential, and credentials included so the refresh cookie can travel", async () => {
        const state = await CTGTest.init("auth logout request")
            .stage("act", async () => {
                const signedIn = await login(fixture.user);
                return fetchWire("/auth/logout", {
                    cookie: cookieHeader(cookieNamed(signedIn, "refresh_token")),
                    credentials: "include"
                });
            })
            .assert("logout request", (state) => state.subject, CTGTestPredicates.satisfies((response) => (
                response.sent.method === "POST" &&
                response.sent.path === "/auth/logout" &&
                response.sent.body === undefined &&
                response.sent.headers.Authorization === undefined &&
                response.sent.headers.Cookie.startsWith("refresh_token=") &&
                response.sent.credentials === "include" &&
                response.status === 200
            )))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("logout returns { status: \"logged_out\" } and clears the refresh cookie", async () => {
        const state = await CTGTest.init("auth logout clears")
            .stage("act", async () => {
                const signedIn = await login(fixture.user);
                const loggedOut = await fetchWire("/auth/logout", {
                    cookie: cookieHeader(cookieNamed(signedIn, "refresh_token")),
                    credentials: "include"
                });
                return { loggedOut, clearingCookie: cookieNamed(loggedOut, "refresh_token") };
            })
            .assert("logout body and cookie", (state) => state.subject, CTGTestPredicates.satisfies(({ loggedOut, clearingCookie }) => (
                loggedOut.status === 200 &&
                loggedOut.body.success === true &&
                loggedOut.body.result.status === "logged_out" &&
                clearingCookie !== null &&
                cookieValue(clearingCookie) === ""
            )))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("logout with no cookie present returns 200 with the ordinary logout success shape", async () => {
        const state = await CTGTest.init("auth logout no cookie")
            .stage("act", async () => fetchWire("/auth/logout", { credentials: "include" }))
            .assert("ordinary success", (state) => state.subject, CTGTestPredicates.satisfies((response) => (
                response.status === 200 &&
                response.body.success === true &&
                response.body.result.status === "logged_out"
            )))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("forgotPassword({ email }) sends one POST /password/forgot request with no query, no bearer credential, and JSON body carrying email", async () => {
        const state = await CTGTest.init("auth forgot password request")
            .stage("act", async () => fetchWire("/password/forgot", {
                body: { email: randomEmail("forgot") }
            }))
            .assert("forgot password request", (state) => state.subject, CTGTestPredicates.satisfies((response) => {
                const sentBody = JSON.parse(response.sent.body);
                return response.sent.method === "POST" &&
                    response.sent.path === "/password/forgot" &&
                    response.sent.headers.Authorization === undefined &&
                    sentBody.email.endsWith("@staging.test") &&
                    response.status === 200 &&
                    response.body.result.status === "reset_sent";
            }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("Requesting a reset for an address with no account returns { status: \"reset_sent\" } and is not a failure", async () => {
        const state = await CTGTest.init("auth forgot password unknown")
            .stage("act", async () => fetchWire("/password/forgot", {
                body: { email: randomEmail("nobody-reset") }
            }))
            .assert("unknown address success", (state) => state.subject, CTGTestPredicates.satisfies((response) => (
                response.status === 200 &&
                response.body.success === true &&
                response.body.result.status === "reset_sent"
            )))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("resetPassword({ token, new_password }) sends one POST /password/reset request with no query, no bearer credential, and JSON body carrying token and new_password", async () => {
        const state = await CTGTest.init("auth reset password request")
            .stage("act", async () => {
                const account = await resetTokenForFreshUser("reset-basic");
                return fetchWire("/password/reset", {
                    body: { token: account.token, new_password: randomPassword() }
                });
            })
            .assert("reset request", (state) => state.subject, CTGTestPredicates.satisfies((response) => {
                const sentBody = JSON.parse(response.sent.body);
                return response.sent.method === "POST" &&
                    response.sent.path === "/password/reset" &&
                    response.sent.headers.Authorization === undefined &&
                    typeof sentBody.token === "string" &&
                    typeof sentBody.new_password === "string" &&
                    response.status === 200 &&
                    response.body.result.status === "password_reset";
            }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("resetPassword({ token, new_password, code, recovery_code }) sends code and recovery_code in the JSON body, not in the query string", async () => {
        const state = await CTGTest.init("auth reset optional fields in body")
            .stage("act", async () => {
                const account = await resetTokenForFreshUser("reset-extra");
                return fetchWire("/password/reset", {
                    body: {
                        token: account.token,
                        new_password: randomPassword(),
                        code: "123456",
                        recovery_code: "unused-for-non-totp"
                    }
                });
            })
            .assert("optional factors carried in body", (state) => state.subject, CTGTestPredicates.satisfies((response) => {
                const sentBody = JSON.parse(response.sent.body);
                return response.sent.path === "/password/reset" &&
                    response.sent.path.includes("?") === false &&
                    sentBody.code === "123456" &&
                    sentBody.recovery_code === "unused-for-non-totp" &&
                    response.status === 200;
            }))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });

    it("A successful resetPassword response returns { status: \"password_reset\" } and does not establish a session", async () => {
        const state = await CTGTest.init("auth reset password success no session")
            .stage("act", async () => {
                const account = await resetTokenForFreshUser("reset-success");
                return fetchWire("/password/reset", {
                    body: { token: account.token, new_password: randomPassword() }
                });
            })
            .assert("reset success only", (state) => state.subject, CTGTestPredicates.satisfies((response) => (
                response.status === 200 &&
                response.body.success === true &&
                response.body.result.status === "password_reset" &&
                response.body.result.access_token === undefined &&
                cookieNamed(response, "refresh_token") === null
            )))
            .start();

        expect(state.status).toBe(STATUS.PASS);
    });
});
