// realizes: browser-owned credential-lifecycle coverage for presentation.md test posture + endpoints/01 cookie conventions.

import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import CTGBrowserTest, { CTGTestPredicates, CTGTestResult } from "ctg-js-browser-test";

const { STATUS } = CTGTestResult;

const TEST_TIMEOUT = 90000;
const baseUrl = (process.env.STAGING_URL ?? "http://localhost:8096").replace(/\/+$/, "");
const workbenchUrl = `${baseUrl}/app/`;
const defaultFixturePath = fileURLToPath(new URL("../../../../php/ctg-php-userbase/staging/data/seed-output.json", import.meta.url));
const fixturePath = process.env.SEED_FIXTURE === undefined
    ? defaultFixturePath
    : resolve(process.cwd(), process.env.SEED_FIXTURE);
const fixtureExists = existsSync(fixturePath);
const fixture = fixtureExists ? JSON.parse(readFileSync(fixturePath, "utf8")) : null;

if (!fixtureExists) {
    console.warn(`Skipping browser credential lifecycle tests: seed fixture not found at ${fixturePath}`);
}

const selectors = {
    loginEmail: "#login-email",
    loginPassword: "#login-password",
    loginSubmit: "#login-submit",
    logoutButton: "#logout-button",
    refreshButton: "#refresh-button",
    recoverButton: "#recover-button",
    sessionPanel: "#session-panel",
    loginError: "#login-error",
    recoverError: "#recover-error",
    mfaNotice: "#mfa-notice"
};

const browserConfig = {
    headless: true,
    timeout: TEST_TIMEOUT
};

const randomEmail = (prefix) => `${prefix}-${randomUUID()}@staging.test`;
const randomPassword = () => `pass-${randomUUID()}-long-enough`;

const waitForAnyVisible = async (page, cssSelectors, timeout = 15000) => {
    await page.waitForFunction((candidates) => candidates.some((selector) => {
        const element = document.querySelector(selector);

        if (element === null) {
            return false;
        }

        const style = window.getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden";
    }), cssSelectors, { timeout });
};

const submitLogin = async (page, credentials, outcomes = [selectors.sessionPanel, selectors.loginError, selectors.mfaNotice]) => {
    await page.locator(selectors.loginEmail).fill(credentials.email);
    await page.locator(selectors.loginPassword).fill(credentials.password);
    await page.locator(selectors.loginSubmit).click();
    await waitForAnyVisible(page, outcomes);
};

const visible = async (page, selector) => await page.locator(selector).isVisible();

const readableCookiesContainRefreshToken = async (page) => {
    return await page.evaluate(() => document.cookie.includes("refresh_token"));
};

const sessionText = async (page) => {
    if (!await visible(page, selectors.sessionPanel)) {
        return "";
    }

    return (await page.locator(selectors.sessionPanel).textContent()) ?? "";
};

const sessionDetails = async (page) => {
    if (!await visible(page, selectors.sessionPanel)) {
        return {};
    }

    return await page.locator(`${selectors.sessionPanel} dl > div`).evaluateAll((rows) => {
        return Object.fromEntries(rows.map((row) => [
            row.querySelector("dt")?.textContent?.trim() ?? "",
            row.querySelector("dd")?.textContent?.trim() ?? ""
        ]));
    });
};

const currentSession = async (page) => {
    return {
        visible: await visible(page, selectors.sessionPanel),
        text: await sessionText(page),
        details: await sessionDetails(page)
    };
};

const currentSignedOutState = async (page) => {
    return {
        loginVisible: await visible(page, selectors.loginEmail),
        sessionVisible: await visible(page, selectors.sessionPanel)
    };
};

const errorText = async (page, selector) => {
    if (!await visible(page, selector)) {
        return "";
    }

    return (await page.locator(selector).textContent()) ?? "";
};

const waitForEndpointResult = (page, path, timeout = 15000) => new Promise((resolveResult, reject) => {
    let timer;

    const done = (callback, value) => {
        clearTimeout(timer);
        page.off("response", handler);
        callback(value);
    };

    const handler = async (response) => {
        let pathname;

        try {
            pathname = new URL(response.url()).pathname;
        } catch {
            return;
        }

        if (pathname !== path) {
            return;
        }

        try {
            done(resolveResult, await response.json());
        } catch (error) {
            done(reject, error);
        }
    };

    timer = setTimeout(() => {
        done(reject, new Error(`Timed out waiting for ${path}`));
    }, timeout);

    page.on("response", handler);
});

describe.skipIf(!fixtureExists)("browser credential lifecycle", { timeout: TEST_TIMEOUT }, () => {
    // The cross-origin renewal-limit case stays unwritten in phase 1; it needs a cross-origin serving setup.

    it("Login end-to-end keeps the refresh credential browser-owned and script-inaccessible", async () => {
        const state = await CTGBrowserTest.init("browser credential login")
            .navigate("open workbench", workbenchUrl)
            .interact("submit seeded credentials", async ({ page }) => {
                await submitLogin(page, fixture.user, [selectors.sessionPanel]);
            })
            .assertPage("session panel contains the seeded user's email", currentSession, CTGTestPredicates.satisfies((session) => (
                session.visible === true &&
                session.text.includes(fixture.user.email)
            )))
            .assertPage("document.cookie does not expose refresh_token", readableCookiesContainRefreshToken, false)
            .start(workbenchUrl, browserConfig);

        expect(state.status).toBe(STATUS.PASS);
    }, TEST_TIMEOUT);

    it("Wrong credentials for a throwaway email surface service refusal and establish no session", async () => {
        const credentials = {
            email: randomEmail("browser-invalid"),
            password: randomPassword()
        };

        const state = await CTGBrowserTest.init("browser credential invalid login")
            .navigate("open workbench", workbenchUrl)
            .interact("submit throwaway credentials", async ({ page }) => {
                await submitLogin(page, credentials, [selectors.loginError]);
            })
            .assertPage("login error shows service refusal", async (page) => {
                return await errorText(page, selectors.loginError);
            }, CTGTestPredicates.satisfies((text) => (
                text.includes("SERVICE_ERROR") &&
                text.length > "SERVICE_ERROR".length
            )))
            .assertPage("no session panel appears", async (page) => await visible(page, selectors.sessionPanel), false)
            .start(workbenchUrl, browserConfig);

        expect(state.status).toBe(STATUS.PASS);
    }, TEST_TIMEOUT);

    it("Reload starts empty and Recover Session renews from the browser-held cookie", async () => {
        const state = await CTGBrowserTest.init("browser credential reload recover")
            .navigate("open workbench", workbenchUrl)
            .interact("login then reload", async ({ page }) => {
                await submitLogin(page, fixture.user, [selectors.sessionPanel]);
                await page.reload({ waitUntil: "load" });
                await page.locator(selectors.loginEmail).waitFor({ state: "visible" });
            })
            .assertPage("reload returns to the signed-out memory-only view", currentSignedOutState, {
                loginVisible: true,
                sessionVisible: false
            })
            .interact("recover without entering credentials", async ({ page }) => {
                await page.locator(selectors.recoverButton).click();
                await waitForAnyVisible(page, [selectors.sessionPanel]);
            })
            .assertPage("session panel returns from cookie-backed recovery", currentSession, CTGTestPredicates.satisfies((session) => (
                session.visible === true &&
                session.text.includes(fixture.user.email)
            )))
            .assertPage("refresh_token remains unreadable to page script", readableCookiesContainRefreshToken, false)
            .start(workbenchUrl, browserConfig);

        expect(state.status).toBe(STATUS.PASS);
    }, TEST_TIMEOUT);

    it("Renew Now preserves the visible session and rotates the browser-visible access token", async () => {
        let loginAccessToken = null;
        let refreshAccessToken = null;

        const state = await CTGBrowserTest.init("browser credential renew now")
            .navigate("open workbench", workbenchUrl)
            .interact("login and capture issued access token", async ({ page }) => {
                const loginResult = waitForEndpointResult(page, "/auth/login");
                await submitLogin(page, fixture.user, [selectors.sessionPanel]);
                loginAccessToken = (await loginResult).result.access_token;
            })
            .interact("click renew now and capture renewed access token", async ({ page }) => {
                const refreshResult = waitForEndpointResult(page, "/auth/refresh");
                await page.locator(selectors.refreshButton).click();
                await waitForAnyVisible(page, [selectors.sessionPanel]);
                refreshAccessToken = (await refreshResult).result.access_token;
            })
            .assertPage("session panel remains for the seeded user", currentSession, CTGTestPredicates.satisfies((session) => (
                session.visible === true &&
                session.text.includes(fixture.user.email) &&
                session.details.Authenticated === "true"
            )))
            .assertPage("renewal issued a different access token", async () => (
                typeof loginAccessToken === "string" &&
                typeof refreshAccessToken === "string" &&
                refreshAccessToken !== loginAccessToken
            ), true)
            .assertPage("document.cookie still does not expose refresh_token", readableCookiesContainRefreshToken, false)
            .start(workbenchUrl, browserConfig);

        expect(state.status).toBe(STATUS.PASS);
    }, TEST_TIMEOUT);

    it("Logout ends cookie recovery", async () => {
        const state = await CTGBrowserTest.init("browser credential logout recovery")
            .navigate("open workbench", workbenchUrl)
            .interact("login then logout", async ({ page }) => {
                await submitLogin(page, fixture.user, [selectors.sessionPanel]);
                await page.locator(selectors.logoutButton).click();
                await page.locator(selectors.loginEmail).waitFor({ state: "visible" });
            })
            .assertPage("logout returns to signed-out view", currentSignedOutState, {
                loginVisible: true,
                sessionVisible: false
            })
            .interact("recover after logout", async ({ page }) => {
                await page.locator(selectors.recoverButton).click();
                await waitForAnyVisible(page, [selectors.recoverError]);
            })
            .assertPage("recovery refusal surfaces", async (page) => {
                return await errorText(page, selectors.recoverError);
            }, CTGTestPredicates.satisfies((text) => (
                text.includes("AUTHENTICATION_REQUIRED") &&
                text.length > "AUTHENTICATION_REQUIRED".length
            )))
            .assertPage("no session is restored after logout", async (page) => await visible(page, selectors.sessionPanel), false)
            .start(workbenchUrl, browserConfig);

        expect(state.status).toBe(STATUS.PASS);
    }, TEST_TIMEOUT);

    it("MFA notice renders for the seeded totp_user without establishing a session or readable refresh cookie", async () => {
        const state = await CTGBrowserTest.init("browser credential mfa notice")
            .navigate("open workbench", workbenchUrl)
            .interact("submit seeded totp user credentials", async ({ page }) => {
                await submitLogin(page, fixture.totp_user, [selectors.mfaNotice]);
            })
            .assertPage("mfa notice renders", async (page) => await visible(page, selectors.mfaNotice), true)
            .assertPage("mfa branch does not render a session panel", async (page) => await visible(page, selectors.sessionPanel), false)
            .assertPage("mfa branch exposes no refresh_token to page script", readableCookiesContainRefreshToken, false)
            .start(workbenchUrl, browserConfig);

        expect(state.status).toBe(STATUS.PASS);
    }, TEST_TIMEOUT);
});
