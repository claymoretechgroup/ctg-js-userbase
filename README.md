# ctg-js-userbase

`ctg-js-userbase` is a reusable JavaScript client layer for the CTG userbase API, plus a React presentation layer and a Vite workbench application. The core is a single session client — the holder and maintainer of one user's session against one service deployment — with the API surface organized as operation categories applied to that client. Renewal is reactive and single-flight, the access token lives in memory only, and the refresh credential is a browser-held HttpOnly cookie the code can never read.

**Key Features:**

* **One session client**: `CTGUserClient` owns session state, the shared request primitive, and the two declared operations (transport and clock) supplied at construction
* **Categories applied, not attached**: `Authentication`, `AccountManagement`, and `Administration` are classes constructed over a client (`Authentication.init(client)`); the client itself has no category surface and is never subclassed
* **Standalone authorization**: `Authorization` is a pure structure of predicates over a claim set — advisory only; the service is the enforcer
* **Reactive single-flight renewal**: an eligible 401 triggers one refresh and one replay, shared across concurrent requests; the refresh credential travels only as a cookie inside the transport
* **Substitutable by construction**: production binds `FetchTransport` and `DateClock`; conformance runs bind a scripted transport and a fixed clock, making every defined behavior deterministic under test
* **Lean React layer**: `UserbaseProvider`, `RequireSession`, `RequirePermission`, `useUserbase`, `usePermission`, and `useOperation` — a provider, two gates, and three hooks; all screens are application territory
* **Zero runtime dependencies**: `src/core` uses platform APIs only; `src/react` depends only on React and the core

## Install

```
npm install claymoretechgroup/ctg-js-userbase
```

React is an optional peer dependency, needed only for `src/react`.

## Examples

### Core

```javascript
import { CTGUserClient, FetchTransport, DateClock, Authentication } from "ctg-js-userbase";

const client = new CTGUserClient({
    base_url: "",                       // same-origin; or the service origin
    transport: new FetchTransport(),
    clock: new DateClock()
});

const auth = Authentication.init(client);
const result = await auth.login({ email, password });

if (result.mfa_required === true) {
    // MFAChallenge branch: hand result.mfa_token to the second-factor flow
} else {
    // Authenticated: session established; client.session() now holds claims
}
```

### React

```jsx
import { UserbaseProvider, RequireSession, useUserbase, useOperation } from "ctg-js-userbase";

<UserbaseProvider client={client}>
    <RequireSession fallback={<LoginForm/>}>
        <App/>
    </RequireSession>
</UserbaseProvider>
```

`useOperation` wraps any promise-returning operation as rendered state — `run`, `pending`, `result`, `error` — with a never-rejecting `run`, last-wins concurrency, and no state writes after unmount.

## Layout

```
src/core     the client, categories, Authorization, ClientError, production bindings
src/react    provider, gates, hooks
app/         Vite workbench (development application; not part of the library)
tests/api    scripted conformance suite (ctg-js-test)
tests/react  presentation suite (ctg-react-test)
tests/live   consumed-contract suite against live staging
tests/browser  credential-lifecycle suite (ctg-js-browser-test + Playwright)
docs/spec.md the language-specific specification (all phases, phase-marked)
```

The language-agnostic design documents live in the shared `design-docs` repository under `js-userbase/` (concepts, six core documents, presentation, four endpoints documents, and the phased `ROADMAP.md`).

## Testing

```
npm test              # scripted api + react suites (no staging needed)
npm run test:live     # consumed-contract suite against seeded staging
npm run test:browser  # Playwright credential-lifecycle suite
```

The live and browser suites need the `ctg-php-userbase` staging stack running and seeded (`make reset && make seed` in its `staging/`), and skip cleanly when the seed fixture is absent. The workbench is served same-origin from that stack at `/app/` after `npm run build` in `app/`.

## TODO

Phase 1 (client machinery, authentication without MFA, authorization, presentation) is complete and verified across all four suites. Remaining, per `design-docs/js-userbase/ROADMAP.md`:

- [ ] **Phase 2 — MFA**: workbench second-factor input (notice-only today) and a browser case completing the challenge end-to-end; scripted and live `verifyMFA` coverage already green
- [ ] **Phase 3 — AccountManagement**: live suite for `endpoints/03`, browser flows for email change and MFA enrollment, workbench account screens
- [ ] **Phase 4 — Administration**: live suite for `endpoints/04` (bootstrap acceptance cases), workbench admin screens
- [ ] **Cross-origin scenario**: Vite dev server against staging CORS, and the cross-origin renewal-limit browser case
- [ ] Move the spec's service pin forward when `ctg-php-userbase` publishes the wire-discriminant fix
- [ ] Usage guides beyond this README; 1.0 versioning decision once all phases gate green

## License

MIT
