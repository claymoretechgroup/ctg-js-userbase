# ctg-js-userbase — Language-Specific Specification

**Realizes:** js-userbase design set: `concepts.md`, `core/`, `presentation.md`, and `endpoints/`; all phases are specified here and phase-marked per `design-docs/js-userbase/ROADMAP.md`.
**Service Pin:** `ctg-php-userbase` at commit `cb9cf9c` (pushed HEAD). The Endpoint documents restate the consumed contract; the pin names the commit conformance is verified against.
**Target:** JavaScript (ES modules, browser; Node for tests), Vite workbench.
**Code Style:** `ctg-project-proc/code-styles/js-code-style.md`.
**Test Frameworks:** `ctg-js-test` for the api suite, `ctg-react-test` for the React suite, and `ctg-js-browser-test` for the browser suite.

---

## 1. Realization Map

| Design Structure | JS Realization | Module | Phase | Notes |
|---|---|---|---:|---|
| `client` | `CTGUserClient` | `src/core/CTGUserClient.js` | 1 | Zero-dependency ES module class. |
| `ClientError` | `ClientError` | `src/core/ClientError.js` | 1 | Extends `Error`; accepts type name or integer code. |
| `Transport` | supplied object with `send` | construction value | 1 | Declared operation structure. |
| `Clock` | supplied object with `now` | construction value | 1 | Declared operation structure. |
| production transport | `FetchTransport` | `src/core/transports/FetchTransport.js` | 1 | Browser `fetch` binding. |
| production clock | `DateClock` | `src/core/clocks/DateClock.js` | 1 | `Date`-based clock. |
| test transport | `ScriptedTransport` | `tests/support/ScriptedTransport.js` | 1 | Ordered request script and request log. |
| test clock | `FixedClock` | `tests/support/FixedClock.js` | 1 | Test-set timestamp. |
| `Authentication(client)` | `new Authentication(client)` / `Authentication.init(client)` | `src/core/Authentication.js` | 1, 2 | Class; constructor accepts the client; static `init` factory; `verifyMFA` is phase 2. |
| `AccountManagement(client)` | `new AccountManagement(client)` / `AccountManagement.init(client)` | `src/core/AccountManagement.js` | 3 | Class; constructor accepts the client; static `init` factory. |
| `Administration(client)` | `new Administration(client)` / `Administration.init(client)` | `src/core/Administration.js` | 5 | Class; constructor accepts the client; static `init` factory. |
| `Authorization` | `new Authorization()` / `Authorization.init()` | `src/core/Authorization.js` | 4 | Standalone class; constructor accepts nothing; never a client property. |
| `UserbaseProvider` | `UserbaseProvider` | `src/react/UserbaseProvider.jsx` | 1 | React component. |
| `RequireSession` | `RequireSession` | `src/react/RequireSession.jsx` | 1 | React component. |
| `RequirePermission` | `RequirePermission` | `src/react/RequirePermission.jsx` | 1 | React component over Authorization predicates. |
| `useUserbase` | `useUserbase` | `src/react/useUserbase.js` | 1 | React hook. |
| `usePermission` | `usePermission` | `src/react/usePermission.js` | 1 | React hook. |
| `useOperation` | `useOperation` | `src/react/useOperation.js` | 1 | React hook. |
| Vite workbench | application files | `app/` | 1-5 | Lighter bar, no design document; grows by phase. |

> **Ruled — the client class is `CTGUserClient`:** the CTG class prefix applies, and the holder is named for the user whose session it manages. Supersedes the earlier recorded intended name. Category factories and the six React presentation names stay unprefixed: the factories are the design's own application notation, and hook names must begin with `use`.

> **Ruled — operation groups are classes:** each category is a class whose constructor accepts the client instance, with a supporting static `init(client)` factory per the CTG code style. The design's application form `Authentication(client)` is realized as construction. Instances hold the client; two constructions over one client share that client's session and renewal; the client itself is never subclassed.

> **Ruled (extended) — Authorization is a class too:** standalone and pure; its constructor accepts nothing (`new Authorization()` / `Authorization.init()`), it holds no client, transport, clock, or state, and it is never a client property. Same class idiom as the service-backed groups.

> **Judgment Call — production bindings named `FetchTransport` and `DateClock`:** Core declares `Transport` and `Clock` but leaves production names to this spec. These names state the platform binding plainly and keep the declared operations constructor-supplied rather than hidden inside `CTGUserClient`.

> **Ruled — `useOperation` takes the operation directly; `OperationSelection` is deleted:** the hook is a pure asynchronous state machine over any promise-returning operation. The application constructs operation groups itself (`Authentication.init(client)`) and hands the hook a bound operation. The selection indirection existed to hide application forms from render code; with class construction being one line, it duplicated the application mechanism and is removed. Because the hook no longer reads the provider's client, it no longer requires an enclosing provider.

---

## 2. Public Surface

### 2.1 Package Layout

Phase: all directories are declared now; files are implemented by their row phase.

```
src/
    core/
        CTGUserClient.js
        ClientError.js
        Authentication.js
        AccountManagement.js
        Administration.js
        Authorization.js
        transports/
            FetchTransport.js
        clocks/
            DateClock.js
    react/
        UserbaseProvider.jsx
        RequireSession.jsx
        RequirePermission.jsx
        useUserbase.js
        usePermission.js
        useOperation.js
app/
tests/
    api/
    react/
    browser/
    support/
index.js
```

`src/core` has zero runtime dependencies. `src/react` depends only on React and `src/core`. `app/` is a Vite workbench and is not a normative design source. No QR component or QR helper exists anywhere in `src/`.

### 2.2 Types

Phase: types appear when first used by implemented behavior; all are specified now.

```
TYPE :: timestamp => integer

TYPE :: SessionState => {
    access_token: string | null,
    claims:       Claims | null
}

TYPE :: Claims => {
    iss: string, aud: string, sub: string,
    permissions:        [string],
    scoped_permissions: [string],
    group_ids:          [integer],
    scope: string, iat: timestamp, exp: timestamp, jti: string
}

TYPE :: Profile => {
    id: string, email: string, name: string | null,
    roles: [string], group_ids: [integer],
    totp_enabled: bool, email_verified: bool
}

TYPE :: Authenticated => {
    mfa_required?:     false,
    user:              Profile,
    access_token:      string,
    access_expires_at: timestamp
}

TYPE :: MFAChallenge => {
    mfa_required:   true,
    mfa_token:      string,
    mfa_expires_at: timestamp
}

TYPE :: LoginResult => MFAChallenge | Authenticated

TYPE :: SessionSummary => {
    id: string, ip: string | null, user_agent: string | null,
    created_at: timestamp, last_used_at: timestamp | null,
    current: bool
}

TYPE :: RoleEntry       => { name: string, permissions: [string], scoped: bool, reserved: bool }
TYPE :: PermissionEntry => { id: string, name: string, reserved: bool }
TYPE :: GroupEntry      => { id: integer, name: string, roles: [string] }

TYPE :: Request => {
    method:      HTTPMethod,
    url:         string,
    headers:     MAP<string, string>,
    body:        string | null,
    credentials: "include"
}

TYPE :: Response => {
    status:  integer,
    headers: MAP<string, string>,
    body:    string
}

TYPE :: HTTPMethod => "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
TYPE :: Credential => "session" | "none" | string

TYPE :: Config => {
    base_url?: string,
    transport: Transport,
    clock:     Clock
}

DECLARED :: Transport => { send: (Request) -> PROMISE<Response> }
DECLARED :: Clock     => { now:  (VOID) -> timestamp }
```

`Authenticated.mfa_required` is the optional literal `false`. It is present on the completed `login` branch and absent on `verifyMFA` and `refresh` results.

### 2.3 `CTGUserClient`

Phase: 1.

`CTGUserClient` is the only client class. One instance holds one user's session against one service deployment.

```
CLASS :: CTGUserClient : (Config) => {
    request:         (HTTPMethod, string, MAP<string, value>?, MAP<string, value>?, Credential?) -> PROMISE<value | VOID>,
    session:         (VOID) -> SessionState,
    subscribe:       ((SessionState) -> VOID) -> ((VOID) -> VOID),
    isSessionActive: (VOID) -> bool
}
```

Constructor behavior:

| Rule | Result |
|---|---|
| `transport` is absent or lacks `send` | throw `CONFIGURATION_INVALID`, `details: { field: "transport" }` |
| `clock` is absent or lacks `now` | throw `CONFIGURATION_INVALID`, `details: { field: "clock" }` |
| `base_url` is absent | use `""` |
| `base_url` is not a string | throw `CONFIGURATION_INVALID`, `details: { field: "base_url" }` |
| `base_url` has a trailing `/` | remove the trailing slash |

The constructor is synchronous, starts with `{ access_token: null, claims: null }`, reads no persistent storage, and performs no request.

`request` builds `base_url + path`, appends supplied query parameters in operation-listed order, omits absent values, percent-encodes names and values, emits JSON bodies only, and always sets `credentials: "include"`. It always sends `Accept` for JSON. It sends `Content-Type` for JSON only when a body is present. The bearer credential is:

| Credential argument | Authorization header |
|---|---|
| absent or `"session"` | the held access token, when non-null |
| `"none"` | none |
| token string | that exact string |

Renewal eligibility belongs to `request`: an invocation is eligible only when its credential resolved to the held session access token and that token was non-null. On eligible 401 authentication failure, renewal is single-flight, performs `refresh` once, and replays each waiting original request once with the new access token. If renewal fails, session state is cleared and listeners are notified exactly once for that shared renewal.

`session()` returns the current two-property session state without giving the application a way to mutate internal state through the returned value. `subscribe(listener)` registers a listener, returns an idempotent unsubscribe operation, and notifies listeners in registration order after every session-state mutation, even equal-looking mutations. `isSessionActive()` returns true only when `claims` is non-null and `clock.now()` is strictly less than `claims.exp`; it performs no request and starts no renewal.

`decodeClaims(access_token)` is an internal pure operation unless implementation needs expose it for tests through a non-package-root test-only entry. It splits the token into three parts, base64url-decodes the claim segment, parses JSON, requires a map, returns it, and verifies no signature, issuer, audience, algorithm, key, scope, or time window. A failure throws `TOKEN_UNREADABLE`.

### 2.4 `ClientError`

Phase: 1.

`ClientError` extends `Error`.

```
CLASS :: ClientError : (string | integer) => {
    type:         string,
    code:         integer,
    message:      string,
    status:       integer | null,
    service_type: string | null,
    fields:       MAP<string, value> | null,
    details:      MAP<string, value> | null
}
```

| Type | Code | Phase | Notes |
|---|---:|---:|---|
| `TRANSPORT_FAILED` | 1000 | 1 | `details: { method, url }`, `status: null`. |
| `RESPONSE_NOT_JSON` | 1001 | 1 | `details: { body_preview }`, at most 200 characters. |
| `MALFORMED_RESPONSE` | 1002 | 1 | Decoded body is not the required success/failure object. |
| `UNEXPECTED_STATUS` | 1003 | 1 | Authentication failure shape at non-401, or non-authentication failure shape at 401. |
| `AUTHENTICATION_REQUIRED` | 2000 | 1 | Message is the service's plain string; `status: 401`. |
| `TOKEN_UNREADABLE` | 2001 | 1 | Access token claim segment cannot be decoded to a map. |
| `PARAMETER_REJECTED` | 3000 | 1 | `fields` is the service map, verbatim. |
| `SERVICE_ERROR` | 3001 | 1 | `service_type`, `message`, and `details` carry the service failure. |
| `CONFIGURATION_INVALID` | 4000 | 1 | Configuration and presentation-context failures. |

The constructor accepts a type name or integer code and resolves the other. Unknown names and codes raise the native argument error immediately. `lookup` resolves in either direction and raises the native argument error for unknown keys.

### 2.5 Declared Operation Bindings

Phase: 1.

`FetchTransport` realizes production `Transport`.

```
CLASS :: FetchTransport : (VOID) => {
    send: (Request) -> PROMISE<Response>
}
```

`send` maps `Request` to browser `fetch` field for field, returns a `Response` for any HTTP status, rejects only when no response was obtained, does not retry, and does not expose cookies. `Response.body` is raw text.

`DateClock` realizes production `Clock`.

```
CLASS :: DateClock : (VOID) => {
    now: (VOID) -> timestamp
}
```

`now()` returns `Math.floor(Date.now() / 1000)`.

`ScriptedTransport` and `FixedClock` are test support, not production package exports.

```
CLASS :: ScriptedTransport : ([OBJECT]) => {
    send:     (Request) -> PROMISE<Response>,
    requests: (VOID) -> [Request]
}

CLASS :: FixedClock : (timestamp) => {
    now: (VOID) -> timestamp,
    set: (timestamp) -> VOID
}
```

### 2.6 Authentication

Phases: 1 for all operations except `verifyMFA`; 2 for `verifyMFA`.

`Authentication` is a class; construction over a client (`new Authentication(client)` or `Authentication.init(client)`) yields its operation structure over that exact client.

| Operation | Signature | Method | Path | Query | Body | Credential | Phase |
|---|---|---|---|---|---|---|---:|
| `register` | `({ email: string, password: string, name?: string \| null }) -> PROMISE<{ status: "verification_sent" }>` | `POST` | `/auth/register` | none | supplied fields | `"none"` | 1 |
| `verifyEmail` | `({ token: string }) -> PROMISE<Profile>` | `POST` | `/auth/verify-email` | none | `token` | `"none"` | 1 |
| `login` | `({ email: string, password: string }) -> PROMISE<LoginResult>` | `POST` | `/auth/login` | none | `email`, `password` | `"none"` | 1 |
| `verifyMFA` | `({ mfa_token: string, code?: string, recovery_code?: string }) -> PROMISE<Authenticated>` | `POST` | `/auth/mfa/verify` | none | `code?`, `recovery_code?` | supplied `mfa_token` | 2 |
| `refresh` | `(VOID) -> PROMISE<Authenticated>` | `POST` | `/auth/refresh` | none | none | `"none"` | 1 |
| `logout` | `(VOID) -> PROMISE<{ status: "logged_out" }>` | `POST` | `/auth/logout` | none | none | `"none"` | 1 |
| `forgotPassword` | `({ email: string }) -> PROMISE<{ status: "reset_sent" }>` | `POST` | `/password/forgot` | none | `email` | `"none"` | 1 |
| `resetPassword` | `({ token: string, new_password: string, code?: string, recovery_code?: string }) -> PROMISE<{ status: "password_reset" }>` | `POST` | `/password/reset` | none | supplied fields | `"none"` | 1 |

`login` mutates session state only on the completed branch. The MFA branch returns the challenge and leaves session state unchanged. `verifyMFA` mutates session state on success and is not renewal-eligible because the bearer credential is the MFA token. `refresh` uses the browser-held cookie, mutates session state on success, and clears session state on failure. `logout` clears session state whatever the request outcome, then returns or throws according to the request result.

Registering an existing address, requesting a reset for an unknown address, and logging out without a session are success outcomes, not errors.

### 2.7 AccountManagement

Phase: 3.

`AccountManagement` is a class; construction over a client yields its operation structure over that exact client.

| Operation | Signature | Method | Path | Query | Body | Credential | Phase |
|---|---|---|---|---|---|---|---:|
| `getProfile` | `(VOID) -> PROMISE<Profile>` | `GET` | `/me` | none | none | `"session"` | 3 |
| `updateProfile` | `({ name?: string \| null }) -> PROMISE<Profile>` | `PATCH` | `/me` | none | `name?` | `"session"` | 3 |
| `changePassword` | `({ current_password: string, new_password: string }) -> PROMISE<{ status: "password_changed" }>` | `POST` | `/me/password` | none | both fields | `"session"` | 3 |
| `requestEmailChange` | `({ new_email: string, password: string, code?: string, recovery_code?: string }) -> PROMISE<{ status: "verification_sent" }>` | `POST` | `/me/email` | none | supplied fields | `"session"` | 3 |
| `confirmEmailChange` | `({ token: string }) -> PROMISE<Profile>` | `POST` | `/me/email/confirm` | none | `token` | `"none"` | 3 |
| `revertEmailChange` | `({ token: string }) -> PROMISE<{ status: "reverted" }>` | `POST` | `/me/email/revert` | none | `token` | `"none"` | 3 |
| `setupMFA` | `(VOID) -> PROMISE<{ provisioning_uri: string, secret: string }>` | `POST` | `/mfa/setup` | none | none | `"session"` | 3 |
| `confirmMFA` | `({ code: string }) -> PROMISE<{ recovery_codes: [string] }>` | `POST` | `/mfa/confirm` | none | `code` | `"session"` | 3 |
| `disableMFA` | `({ password: string, code?: string, recovery_code?: string }) -> PROMISE<Profile>` | `POST` | `/mfa/disable` | none | supplied fields | `"session"` | 3 |
| `listSessions` | `(VOID) -> PROMISE<[SessionSummary]>` | `GET` | `/me/sessions` | none | none | `"session"` | 3 |
| `revokeSession` | `({ id: string }) -> PROMISE<VOID>` | `DELETE` | `/me/session` | `id` | none | `"session"` | 3 |
| `revokeOtherSessions` | `(VOID) -> PROMISE<{ status: "revoked", count: integer }>` | `DELETE` | `/me/sessions` | none | none | `"session"` | 3 |

No AccountManagement operation changes session state. `confirmEmailChange` and `revertEmailChange` send no bearer credential even when session state holds one and are not renewal-eligible. A successful email confirmation or reversion clears the refresh cookie service-side; local access-token state changes only through later renewal behavior. `setupMFA` exposes `{ provisioning_uri, secret }` exactly; QR rendering is outside `src/`.

### 2.8 Administration

Phase: 5.

`Administration` is a class; construction over a client yields its operation structure over that exact client.

| Operation | Signature | Method | Path | Query | Body | Credential | Phase |
|---|---|---|---|---|---|---|---:|
| `bootstrapAdmin` | `({ secret: string, email: string, password: string }) -> PROMISE<Profile>` | `POST` | `/admin/bootstrap` | none | all fields | `"none"` | 5 |
| `adminListUsers` | `({ limit?: integer, offset?: integer }) -> PROMISE<[Profile]>` | `GET` | `/admin/users` | `limit?`, `offset?` | none | `"session"` | 5 |
| `adminGetUser` | `({ id: string }) -> PROMISE<Profile>` | `GET` | `/admin/user` | `id` | none | `"session"` | 5 |
| `adminCreateUser` | `({ email: string, password: string, name?: string \| null, roles?: [string], status?: string, email_verified?: bool }) -> PROMISE<Profile>` | `POST` | `/admin/users` | none | supplied fields | `"session"` | 5 |
| `adminUpdateUser` | `({ id: string, name?: string \| null, status?: string, roles?: [string] }) -> PROMISE<Profile>` | `PATCH` | `/admin/user` | `id` | `name?`, `status?`, `roles?` | `"session"` | 5 |
| `adminDeleteUser` | `({ id: string }) -> PROMISE<VOID>` | `DELETE` | `/admin/user` | `id` | none | `"session"` | 5 |
| `listRoles` | `(VOID) -> PROMISE<[RoleEntry]>` | `GET` | `/admin/roles` | none | none | `"session"` | 5 |
| `createRole` | `({ name: string, permissions: [string], scoped: bool }) -> PROMISE<RoleEntry>` | `POST` | `/admin/roles` | none | all fields | `"session"` | 5 |
| `updateRole` | `({ name: string, permissions: [string], scoped: bool }) -> PROMISE<RoleEntry>` | `PUT` | `/admin/role` | `name` | `permissions`, `scoped` | `"session"` | 5 |
| `deleteRole` | `({ name: string }) -> PROMISE<VOID>` | `DELETE` | `/admin/role` | `name` | none | `"session"` | 5 |
| `listPermissions` | `(VOID) -> PROMISE<[PermissionEntry]>` | `GET` | `/admin/permissions` | none | none | `"session"` | 5 |
| `createPermission` | `({ name: string }) -> PROMISE<PermissionEntry>` | `POST` | `/admin/permissions` | none | `name` | `"session"` | 5 |
| `updatePermission` | `({ name: string, new_name: string }) -> PROMISE<PermissionEntry>` | `PUT` | `/admin/permission` | `name` | `new_name` | `"session"` | 5 |
| `deletePermission` | `({ name: string }) -> PROMISE<VOID>` | `DELETE` | `/admin/permission` | `name` | none | `"session"` | 5 |
| `listGroups` | `(VOID) -> PROMISE<[GroupEntry]>` | `GET` | `/admin/groups` | none | none | `"session"` | 5 |
| `getGroup` | `({ id: integer }) -> PROMISE<GroupEntry>` | `GET` | `/admin/group` | `id` | none | `"session"` | 5 |
| `createGroup` | `({ name: string, roles?: [string] }) -> PROMISE<GroupEntry>` | `POST` | `/admin/groups` | none | `name`, `roles?` | `"session"` | 5 |
| `updateGroup` | `({ id: integer, name?: string, roles?: [string] }) -> PROMISE<GroupEntry>` | `PATCH` | `/admin/group` | `id` | `name?`, `roles?` | `"session"` | 5 |
| `deleteGroup` | `({ id: integer }) -> PROMISE<VOID>` | `DELETE` | `/admin/group` | `id` | none | `"session"` | 5 |
| `addGroupMember` | `({ id: integer, user_id: string }) -> PROMISE<{ status: "member_added" }>` | `POST` | `/admin/group/member` | `id`, `user_id` | none | `"session"` | 5 |
| `removeGroupMember` | `({ id: integer, user_id: string }) -> PROMISE<VOID>` | `DELETE` | `/admin/group/member` | `id`, `user_id` | none | `"session"` | 5 |

No Administration operation changes session state. `bootstrapAdmin` is not renewal-eligible and sends no bearer credential; the setup secret is in the JSON body. The service accepts bootstrap only while a setup secret is configured and no user holds the administrator role. With the correct secret after initialization, the service returns status 409 with operation failure `ADMIN_EXISTS` and message `"Already initialized"`. The service checks the secret before administrator existence.

`adminCreateUser.status` and `adminUpdateUser.status` may be `"pending"`, `"active"`, or `"locked"` by service contract; the client sends the supplied string and performs no local value validation. Adding an existing group member and removing a non-member are success outcomes.

### 2.9 Authorization

Phase: 4.

`Authorization` is a standalone class; its constructor accepts nothing. An instance accepts no client, reaches no service, reads no session state, reads no clock, and mutates nothing.

| Operation | Signature | Phase |
|---|---|---:|
| `hasPermission` | `(Claims \| null, string) -> bool` | 4 |
| `hasPermissionInAnyForm` | `(Claims \| null, string) -> bool` | 4 |
| `hasPermissionOver` | `(Claims \| null, string, [integer]) -> bool` | 4 |

`hasPermission` returns true only when `claims.permissions` is a list containing the exact permission string. `hasPermissionInAnyForm` returns true when the exact string appears in `permissions` or `scoped_permissions`. `hasPermissionOver` returns true for global authority or for scoped authority when `target_group_ids` and `claims.group_ids` intersect. Null claims, absent lists, non-list values, empty target groups without global authority, and empty holder groups for scoped checks all return false. There are no wildcards, prefixes, hierarchy, or case folding.

### 2.10 React Presentation

Phase: 1.

The React layer realizes the six fixed presentation names.

```
TYPE :: Content => React node
TYPE :: RenderedContent => React rendered output

TYPE :: UserbaseExposure => {
    client:        CTGUserClient,
    session:       SessionState,
    authenticated: bool
}

TYPE :: Operation<Args, Result> => (Args) -> PROMISE<Result>

TYPE :: OperationHandle<Args, Result> => {
    run:     (Args) -> PROMISE<VOID>,
    pending: bool,
    result:  Result | null,
    error:   ClientError | null
}
```

| Structure | Form | Signature | Phase |
|---|---|---|---:|
| `UserbaseProvider` | component | `({ client: CTGUserClient, children: Content }) -> RenderedContent` | 1 |
| `RequireSession` | component | `({ children: Content, fallback?: Content }) -> RenderedContent` | 1 |
| `RequirePermission` | component | `({ permission: string, target_group_ids?: [integer], children: Content, fallback?: Content }) -> RenderedContent` | 1 |
| `useUserbase` | hook | `(VOID) -> UserbaseExposure` | 1 |
| `usePermission` | hook | `(string, [integer]?) -> bool` | 1 |
| `useOperation` | hook | `(Operation<Args, Result>) -> OperationHandle<Args, Result>` | 1 |

> **Judgment Call — React content prop is `children`:** The design uses `content` as rendering-runtime-neutral notation. In React, the concrete slot is `children`, while behavior remains the design behavior.

`UserbaseProvider` renders children unchanged, supplies the nearest client and current session state, subscribes while rendered, unsubscribes when removed, and throws `CONFIGURATION_INVALID` with `details: { field: "client" }` when no client is supplied.

`useUserbase` returns the provider client, the current session, and `authenticated`, where authenticated means `session.claims !== null`, not `isSessionActive()`. Used outside a provider, it throws `CONFIGURATION_INVALID` with `details: { field: "provider" }`.

`usePermission(permission, target_group_ids?)` obtains `Authorization()` and evaluates against the current session's claims. Without target groups it uses `hasPermission`; with target groups it uses `hasPermissionOver`. Used outside a provider, it throws `CONFIGURATION_INVALID` with `details: { field: "provider" }`.

`useOperation(operation)` takes a promise-returning operation the application supplies — typically one bound from a constructed operation group (`const auth = Authentication.init(client)`), but any operation returning a PROMISE qualifies. A non-function argument throws `CONFIGURATION_INVALID` with `details: { field: "operation" }` when the hook is applied. Before any run, `pending` is false and `result` and `error` are null. During a run, `pending` is true, `error` is null, and `result` keeps its previous value. On success, `pending` is false, `result` is the value, and `error` is null. On failure, `pending` is false, `error` is the `ClientError`, and `result` is unchanged. The asynchronous result returned by `run` never rejects; it settles after exposed state has been updated. If two runs overlap, the later run's outcome is exposed and any older late-settling outcome is discarded. A stopped render receives no exposed state change. `useOperation` reads no provider context and does not require an enclosing provider.

`RequireSession` renders children while authenticated is true, otherwise fallback or nothing, and performs no request. `RequirePermission` renders children when `usePermission` is true, otherwise fallback or nothing. Hiding content is advisory; service refusal remains independent.

---

## 3. Method Signatures (Complete)

All signatures use the HM-like notation from `ctg-project-proc/code-styles/js-code-style.md`. Tables above carry operation names; signatures here show concrete JS member names.

### CTGUserClient

```javascript
// CONSTRUCTOR :: Config -> this
constructor(config)

// :: HTTPMethod, STRING, MAP<STRING, value>?, MAP<STRING, value>?, Credential? -> PROMISE(value | VOID)
request(method, path, query, body, credential)

// :: VOID -> SessionState
session()

// :: (SessionState -> VOID) -> (VOID -> VOID)
subscribe(listener)

// :: VOID -> BOOL
isSessionActive()
```

### ClientError

```javascript
// CONSTRUCTOR :: STRING | INT -> this
constructor(typeOrCode)

// :: STRING | INT -> INT | STRING
static lookup(typeOrCode)
```

### FetchTransport

```javascript
// CONSTRUCTOR :: VOID -> this
constructor()

// :: Request -> PROMISE(Response)
send(request)
```

### DateClock

```javascript
// CONSTRUCTOR :: VOID -> this
constructor()

// :: VOID -> timestamp
now()
```

### ScriptedTransport

```javascript
// CONSTRUCTOR :: [OBJECT] -> this
constructor(script)

// :: Request -> PROMISE(Response)
send(request)

// :: VOID -> [Request]
requests()
```

### FixedClock

```javascript
// CONSTRUCTOR :: timestamp -> this
constructor(timestamp)

// :: VOID -> timestamp
now()

// :: timestamp -> VOID
set(timestamp)
```

### Authentication

```javascript
// CONSTRUCTOR :: CTGUserClient -> this
constructor(client)

// STATIC :: CTGUserClient -> Authentication
static init(client)

// :: { email: STRING, password: STRING, name?: STRING | NULL } -> PROMISE({ status: "verification_sent" })
register(args)

// :: { token: STRING } -> PROMISE(Profile)
verifyEmail(args)

// :: { email: STRING, password: STRING } -> PROMISE(LoginResult)
login(args)

// :: { mfa_token: STRING, code?: STRING, recovery_code?: STRING } -> PROMISE(Authenticated)
verifyMFA(args)

// :: VOID -> PROMISE(Authenticated)
refresh()

// :: VOID -> PROMISE({ status: "logged_out" })
logout()

// :: { email: STRING } -> PROMISE({ status: "reset_sent" })
forgotPassword(args)

// :: { token: STRING, new_password: STRING, code?: STRING, recovery_code?: STRING } -> PROMISE({ status: "password_reset" })
resetPassword(args)
```

### AccountManagement

```javascript
// CONSTRUCTOR :: CTGUserClient -> this
constructor(client)

// STATIC :: CTGUserClient -> AccountManagement
static init(client)

// :: VOID -> PROMISE(Profile)
getProfile()

// :: { name?: STRING | NULL } -> PROMISE(Profile)
updateProfile(args)

// :: { current_password: STRING, new_password: STRING } -> PROMISE({ status: "password_changed" })
changePassword(args)

// :: { new_email: STRING, password: STRING, code?: STRING, recovery_code?: STRING } -> PROMISE({ status: "verification_sent" })
requestEmailChange(args)

// :: { token: STRING } -> PROMISE(Profile)
confirmEmailChange(args)

// :: { token: STRING } -> PROMISE({ status: "reverted" })
revertEmailChange(args)

// :: VOID -> PROMISE({ provisioning_uri: STRING, secret: STRING })
setupMFA()

// :: { code: STRING } -> PROMISE({ recovery_codes: [STRING] })
confirmMFA(args)

// :: { password: STRING, code?: STRING, recovery_code?: STRING } -> PROMISE(Profile)
disableMFA(args)

// :: VOID -> PROMISE([SessionSummary])
listSessions()

// :: { id: STRING } -> PROMISE(VOID)
revokeSession(args)

// :: VOID -> PROMISE({ status: "revoked", count: INT })
revokeOtherSessions()
```

### Administration

```javascript
// CONSTRUCTOR :: CTGUserClient -> this
constructor(client)

// STATIC :: CTGUserClient -> Administration
static init(client)

// :: { secret: STRING, email: STRING, password: STRING } -> PROMISE(Profile)
bootstrapAdmin(args)

// :: { limit?: INT, offset?: INT } -> PROMISE([Profile])
adminListUsers(args)

// :: { id: STRING } -> PROMISE(Profile)
adminGetUser(args)

// :: { email: STRING, password: STRING, name?: STRING | NULL, roles?: [STRING], status?: STRING, email_verified?: BOOL } -> PROMISE(Profile)
adminCreateUser(args)

// :: { id: STRING, name?: STRING | NULL, status?: STRING, roles?: [STRING] } -> PROMISE(Profile)
adminUpdateUser(args)

// :: { id: STRING } -> PROMISE(VOID)
adminDeleteUser(args)

// :: VOID -> PROMISE([RoleEntry])
listRoles()

// :: { name: STRING, permissions: [STRING], scoped: BOOL } -> PROMISE(RoleEntry)
createRole(args)

// :: { name: STRING, permissions: [STRING], scoped: BOOL } -> PROMISE(RoleEntry)
updateRole(args)

// :: { name: STRING } -> PROMISE(VOID)
deleteRole(args)

// :: VOID -> PROMISE([PermissionEntry])
listPermissions()

// :: { name: STRING } -> PROMISE(PermissionEntry)
createPermission(args)

// :: { name: STRING, new_name: STRING } -> PROMISE(PermissionEntry)
updatePermission(args)

// :: { name: STRING } -> PROMISE(VOID)
deletePermission(args)

// :: VOID -> PROMISE([GroupEntry])
listGroups()

// :: { id: INT } -> PROMISE(GroupEntry)
getGroup(args)

// :: { name: STRING, roles?: [STRING] } -> PROMISE(GroupEntry)
createGroup(args)

// :: { id: INT, name?: STRING, roles?: [STRING] } -> PROMISE(GroupEntry)
updateGroup(args)

// :: { id: INT } -> PROMISE(VOID)
deleteGroup(args)

// :: { id: INT, user_id: STRING } -> PROMISE({ status: "member_added" })
addGroupMember(args)

// :: { id: INT, user_id: STRING } -> PROMISE(VOID)
removeGroupMember(args)
```

### Authorization

```javascript
// CONSTRUCTOR :: VOID -> this
constructor()

// STATIC :: VOID -> Authorization
static init()

// :: Claims | NULL, STRING -> BOOL
hasPermission(claims, permission)

// :: Claims | NULL, STRING -> BOOL
hasPermissionInAnyForm(claims, permission)

// :: Claims | NULL, STRING, [INT] -> BOOL
hasPermissionOver(claims, permission, targetGroupIds)
```

### React Presentation

```javascript
// COMPONENT :: { client: CTGUserClient, children: Content } -> RenderedContent
UserbaseProvider(props)

// COMPONENT :: { children: Content, fallback?: Content } -> RenderedContent
RequireSession(props)

// COMPONENT :: { permission: STRING, target_group_ids?: [INT], children: Content, fallback?: Content } -> RenderedContent
RequirePermission(props)

// HOOK :: VOID -> UserbaseExposure
useUserbase()

// HOOK :: STRING, [INT]? -> BOOL
usePermission(permission, targetGroupIds)

// HOOK :: Operation<Args, Result> -> OperationHandle<Args, Result>
useOperation(operation)
```

---

## 4. Resolution of Deferred Decisions

### 4.1 Constructor and Export Policy

Root `index.js` exports `CTGUserClient`, `ClientError`, `FetchTransport`, `DateClock`, `Authentication`, `AccountManagement`, `Administration`, `Authorization`, and the six React presentation structures. `ScriptedTransport` and `FixedClock` live under `tests/support` and are test support only.

Class files follow the JS code style: imports first, class purpose comment, `export default class ClassName`, `_` instance fields, static fields before instance fields, constructor before properties and methods, and a static `init` factory on every operation-group class.

### 4.2 Operation Group Application

Service-backed operation groups are not client properties. They are applied explicitly, by construction:

```javascript
const client = new CTGUserClient({ base_url, transport, clock });
const auth = Authentication.init(client);
const account = AccountManagement.init(client);
const admin = Administration.init(client);
const authorization = Authorization.init();
```

Two applications of the same group to one client share that client's session and renewal. Two clients built from the same configuration have isolated state. Application-defined operation groups use the same class form:

```javascript
export default class Reports {

    static init(client) {
        return new Reports(client);
    }

    constructor(client) {
        this._client = client;
    }

    list(args = {}) {
        return this._client.request("GET", "/reports", args, undefined, "session");
    }
}
```

Application-defined groups take the same shape — a class constructed over the client — and must target the same deployment and response convention because they use `CTGUserClient.request`.

### 4.3 Response Classification

The client classifies every non-204 response. Success requires a JSON object with Boolean `success` and present `result`. Failure classification is structural:

| Failure `result` | Error |
|---|---|
| string at 401 on ineligible request or replay | `AUTHENTICATION_REQUIRED` |
| string at 401 on eligible original request | renewal path |
| string at non-401 | `UNEXPECTED_STATUS` |
| map with string `type` at 401 | `UNEXPECTED_STATUS` |
| map with string `type` at any other status | `SERVICE_ERROR` |
| any other map | `PARAMETER_REJECTED` |
| anything else | `MALFORMED_RESPONSE` |

Status 204 returns `VOID` without parsing the body.

### 4.4 Testing Ownership by Phase

| Case Group | Suite | Phase |
|---|---|---:|
| client surface, construction, session observation, request building, response classification, errors, claim decoding, renewal single-flight | `tests/api` with scripted transport and fixed clock | 1 |
| Authentication except `verifyMFA` | `tests/api` with scripted transport and fixed clock; live staging api cases where endpoint behavior is required | 1 |
| Endpoint conventions and Authentication endpoint mapping except `verifyMFA` | `tests/api` against live staging | 1 |
| Presentation provider, gates, hooks, operation hook, DOM-is-the-proof assertions, no QR in `src/` | `tests/react` | 1 |
| Credential lifecycle same-site renewal, logout cookie behavior, browser-held refresh cookie behavior | `tests/browser` against same-site staging | 1 |
| `verifyMFA` Core behavior and endpoint mapping | `tests/api` scripted and live staging with seeded TOTP-enabled user | 2 |
| AccountManagement Core behavior and endpoint mapping, including MFA enrollment and email-change flows | `tests/api` scripted and live staging | 3 |
| Credential-lifecycle browser tests for email change, MFA enrollment, and same-site renewal after account changes | `tests/browser` same-site | 3 |
| Authorization pure predicates | `tests/api` or unit subset using `ctg-js-test`; no transport and no clock applications | 4 |
| Authorization-backed presentation gates | `tests/react` DOM-is-the-proof | 4 |
| Administration Core behavior and endpoint mapping | `tests/api` scripted and live staging with seeded administrator | 5 |

The api suite is cross-origin and cannot exercise renewal through the refresh cookie. Renewal machinery is proven with scripted transport in the api suite; credential-lifecycle renewal is owned by same-site browser tests. Endpoint cases are live-staging api cases against the pinned service.

### 4.5 Endpoint Contract

Every request body emitted by the client is JSON. A non-empty non-JSON body is outside this client. The refresh cookie is named `refresh_token` and is service-set with `HttpOnly; Secure; SameSite=Strict; Path=/auth`. No response body contains a plaintext refresh credential.

Cross-origin deployment can use endpoints for one access-token lifetime but cannot perform renewal when `SameSite=Strict` withholds the refresh cookie. The specified behavior is one refresh attempt, session clear, no replay, and `AUTHENTICATION_REQUIRED`.

### 4.6 Open Validation Boundary

The client validates construction and presentation context only. It does not validate email format, password strength, role names, group names, permission strings, status strings, identifier format, list contents, or MFA code format. Values are sent as supplied and service parameter failures surface verbatim.

---

## 5. Anti-Pattern Enforcement

| Anti-Pattern | Enforcement |
|---|---|
| refresh credential in JS | No property, operation, result, or error exposes it. |
| persisted access token or claims | `CTGUserClient` starts empty and reads no store. |
| proactive renewal | Only eligible 401 failures can start renewal. |
| retry beyond one renewal replay | One renewal and one replay; replay result is final. |
| renewal inside categories | Only `CTGUserClient.request` owns renewal. |
| wide client with category methods | Client surface is constructor, `request`, `session`, `subscribe`, `isSessionActive`. |
| category structures as client properties | No `authentication`, `accountManagement`, `administration`, or `authorization` property exists. |
| client subclassing for operations | Operation groups are classes constructed over a client; the client is never subclassed. |
| Authorization on the client | Authorization is standalone and takes claims as a parameter. |
| client-side permission enforcement | Authorization is advisory; service refusal is still required. |
| QR code in `src/` | No QR component or helper ships in Core or React. |
| client-side field validation | Service owns field validation. |
| non-JSON body emission | The request primitive emits only JSON bodies. |
| workaround for cross-origin renewal limit | No alternate credential route exists. |

---

## 6. Extension Surfaces

| Surface | Mechanism | Phase |
|---|---|---:|
| application-defined service operation groups | class whose constructor accepts `CTGUserClient`, using `client.request` | 1 |
| custom transport | object with `send(Request) -> PROMISE<Response>` supplied to constructor | 1 |
| custom clock | object with `now() -> timestamp` supplied to constructor | 1 |
| React operation execution | `useOperation` accepts any promise-returning operation, including application-defined group operations | 1 |
| application screens | `app/` workbench and application code compose the public surface | 1-5 |

Extensions do not mutate session state except through Authentication operations and renewal. They do not read or store the refresh credential. They do not add methods to `CTGUserClient` by subclassing.

---

## 7. Judgment Calls Index

1. **Client class named `CTGUserClient`** (§1) — ruled by the user; CTG prefix applied, holder named for the user; supersedes `SessionClient`.
2. **Operation groups as classes** (§1) — ruled by the user: constructor accepts the client, static `init` factory; same-session double application and app-group symmetry hold; supersedes the drafted factory-function call.
3. **Authorization as a class** (§1) — nullary constructor plus `init()`; standalone and client-free; extends the Q2 ruling for idiom consistency.
4. **Production bindings named `FetchTransport` and `DateClock`** (§1) — names the browser HTTP and `Date` clock bindings without hiding declared operations in the client.
5. **`useOperation` takes the operation directly** (§1) — ruled by the user; `OperationSelection` deleted; the hook is a pure async state machine and needs no provider.
6. **React content prop is `children`** (§2.10) — binds the design's runtime-neutral `content` slot to idiomatic React.

---

## 8. Resolved Questions

### Q1: Is `CTGUserClient` the class name?

Yes — ruled. `CTGUserClient` is the JS class name for the design `client` structure, superseding the earlier recorded intended name `SessionClient`.

### Q2: Are operation categories classes?

Yes — ruled. Each category is a class whose constructor accepts the client instance, with a static `init(client)` factory. The design left the realization form to this spec; construction is the ruled application form.

### Q3: Is Authorization stored on the client?

No. `Authorization()` is standalone. React presentation may pair it with the current session's claims inside `usePermission`, but the Authorization structure never reads a client.

### Q4: Where do production and test declared operations live?

Production bindings are `src/core/transports/FetchTransport.js` and `src/core/clocks/DateClock.js`. Test doubles are `tests/support/ScriptedTransport.js` and `tests/support/FixedClock.js`.

### Q5: What does `useOperation` take?

Ruled: the operation itself — any promise-returning function, typically bound from a constructed operation group. There is no selection value; `OperationSelection` was deleted with the ruling.

### Q6: Which suite proves renewal?

Scripted renewal logic is in `tests/api`. Cookie-credentialed renewal is same-site and belongs to `tests/browser`; the cross-origin live api suite cannot exercise it.

---

## Report

1. Line count: 877
2. Judgment calls:
   - `CTGUserClient` without `CTG` prefix.
   - Operation groups as classes (ruled).
   - Authorization as a factory function.
   - Production bindings named `FetchTransport` and `DateClock`.
   - `useOperation` takes the operation directly (ruled; OperationSelection deleted).
   - React content prop is `children`.
3. Design gaps found:
   - Category application form was intentionally left to the language specification.
   - Production binding names and module paths for `Transport` and `Clock` were intentionally left to the language specification.
   - React prop naming for the content slot was not fixed by the rendering-runtime-neutral presentation design.
4. Class-name table:

| Design structure | JS class/function name |
|---|---|
| `client` | `CTGUserClient` |
| `ClientError` | `ClientError` |
| `Transport` production binding | `FetchTransport` |
| `Clock` production binding | `DateClock` |
| `Authentication(client)` | `Authentication` |
| `AccountManagement(client)` | `AccountManagement` |
| `Administration(client)` | `Administration` |
| `Authorization` | `Authorization` |
| `UserbaseProvider` | `UserbaseProvider` |
| `RequireSession` | `RequireSession` |
| `RequirePermission` | `RequirePermission` |
| `useUserbase` | `useUserbase` |
| `usePermission` | `usePermission` |
| `useOperation` | `useOperation` |
| scripted transport test double | `ScriptedTransport` |
| fixed clock test double | `FixedClock` |

5. Could not specify:
   - (resolved by ruling) invalid input to `useOperation` is a non-function argument: `CONFIGURATION_INVALID`, `details.field: "operation"`, at hook application.
