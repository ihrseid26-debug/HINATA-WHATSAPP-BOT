# pinterest-unofficial

Unofficial Pinterest SDK for TypeScript/Node — reverse-engineered from live
HTTP captures (HTTP Toolkit) of the Pinterest web client. Zero runtime
dependencies (Node 18.17+ native `fetch`).

> **Not affiliated with Pinterest, Inc.** Unofficial SDK — Pinterest's
> endpoints, headers, and anti-bot checks change without notice. Use at
> your own risk and in line with Pinterest's Terms of Service.

## Install

```bash
npm install pinterest-unofficial
```

## Quick start

```ts
import { PinterestClient } from "pinterest-unofficial";

const client = new PinterestClient();

// 1. Guest session: fetches the homepage to seed csrftoken + session cookie
await client.bootstrap();

// 2. Search public pins
const { data: results, bookmark } = await client.search.searchPins({ query: "anime" });
console.log(results.results.length);                 // 25
console.log(results.results[0].images?.["236x"]?.url);

// 3. Autocomplete
const suggestions = await client.search.typeahead("anime");

// 4. Paginate: pass the previous page's `bookmark` cursor
if (bookmark) {
  const page2 = await client.search.searchPins({
    query: "anime",
    bookmarks: [bookmark],
  });
  console.log(page2.data.results.length);
}
```

> Pagination uses `bookmarks` from the envelope's `resource_response.bookmark`
> field. `searchPins` returns it as `bookmark`; pass it back as
> `bookmarks: [bookmark]`.

## Anatomy of the captured API

The Pinterest web client talks to three surfaces; the SDK wraps all of them:

| Surface | Transport | Captured example |
|---|---|---|
| Resource API | `GET\|POST /resource/<Name>/<action>/?source_url=…&data=<json>` | `BaseSearchResource/get` → `v3_search_pins` |
| GraphQL | `POST /_/graphql/` with `x-pinterest-graphql-name` | `UnauthHomePageBrandBoardsEagerQuery` |
| GraphQL SSE | `POST /_/graphql/stream/` (text/event-stream) | `CloseupDetailQuery` |
| v3 REST proxy | `ApiResource/{get,create,update}` with `options.url = /v3/…` | `/v3/users/me/`, `/v3/media/uploads/` |

Captured resource surfaces covered by the SDK:

| Resource | Actions | endpoint_name |
|---|---|---|
| `BaseSearchResource` | get | `v3_search_pins` |
| `AdvancedTypeaheadResource` | get | typeahead suggestions |
| `UserHomefeedResource` | get | `v3_home_feed` |
| `PinResource` | get | `v3_get_pin` (pin closeup) |
| `RelatedModulesResource` | get | `v3_related_modules_for_pin` |
| `UnifiedCommentsResource` | get | `v3_get_aggregated_pin_data_unified_comments` |
| `AggregatedCommentResource` | create | post a comment |
| `UserResource` | get | `v3_get_user_handler` |
| `BoardsResource` | get | `v3_user_profile_boards_feed` |
| `BoardResource` | create | create board |
| `BoardPickerBoardsResource` | get | `v3_user_profile_boards_feed` |
| `UserSessionResource` | create | `v3_login_user` |
| `ApiResource` | get/create/update | generic `/v3/` proxy |

Every resource call carries `{ options, context }` in the `data` param and
these headers: `x-csrftoken` (mirroring the `csrftoken` cookie),
`x-pinterest-appstate: active`, `x-requested-with: XMLHttpRequest`,
`x-pinterest-pws-handler`, `x-app-version`.

## Auth

Cookies carry the session: `csrftoken`, `_pinterest_sess`, `_auth`,
`l_o`, `__Secure-s_a`. The SDK mirrors them automatically.

Two login paths — pick per your risk tolerance:

### 1. Raw HTTP login (`client.auth.login`)

Same wire format the web client sends (`UserSessionResource/create` →
`v3_login_user`). No browser, no extra deps.

```ts
const user = await client.auth.login({
  usernameOrEmail: "you@example.com",
  password: "hunter2",
  arkoseSessionToken: "…",   // from the Arkose widget
  recaptchaV3Token: "…",     // from the reCAPTCHA v3 token
});
```

> Pinterest's bot protection typically blocks raw logins without challenge
> tokens (Arkose/reCAPTCHA). If `login` fails with a captcha challenge,
> use the puppeteer path.

### 2. Browser login via super-puppeteer (OPTIONAL deps)

Drives a real stealth-patched Chrome through the Pinterest login form and
adopts the session into the SDK. Bypasses the captcha — a genuine browser
handles the challenges invisibly.

```bash
npm install super-puppeteer puppeteer   # optional — only needed for this path
```

```ts
const user = await client.auth.loginWithPuppeteer({
  usernameOrEmail: "you@example.com",
  password: "hunter2",
  // headless: false (default) — headless is far more likely to be detected
  headless: false,
  timeoutMs: 120_000,
});
// Session is now live in the SDK:
const me = await client.users.me();
const feed = await client.feed.homeFeed();
```

Form selectors auto-detect the streamlined vs classic login layouts
(`#streamlined-login-email` / `#email` …), with per-field override options
if Pinterest renames the DOM:

```ts
await client.auth.loginWithPuppeteer({
  usernameOrEmail: "you@example.com",
  password: "hunter2",
  selectors: { email: "#my-email-field", password: "#my-pass", submit: "button[type=submit]" },
});
```

Without the optional deps installed, `loginWithPuppeteer` throws a
`PinterestError` naming the install command; the raw HTTP path keeps
working untouched.

### Sessions without logging in

Persist/restore a session you already have (e.g. from a browser):

```ts
const cookieHeader = client.serializeCookies(); // save it
client2.restoreCookies(cookieHeader);           // load it later
```

SSO check (captured: `POST /secure/sso_info/`):

```ts
const sso = await client.auth.ssoInfo({ email: "you@example.com" });
```

## API surface

```ts
client.auth
  .login({ usernameOrEmail, password, arkoseSessionToken?, recaptchaV3Token? })
  .ssoInfo({ email })

client.search
  .searchPins({ query, scope?, bookmarks?, pageSize?, rs? })
  .typeahead(term, { pinScope?, count? })

client.feed
  .homeFeed({ bookmarks? })            // v3_home_feed, requires auth
  .v3({ url, data?, fields? }, action) // generic /v3/ proxy

client.pins
  .get({ pinId, fieldSetKey?, addFields? })  // PinResource → v3_get_pin (closeup)
  .related({ pinId, contextPinIds?, pageSize?, bookmarks? })
                                           // RelatedModulesResource → "More to explore"
  .comments({ aggregatedPinId, pageSize?, isReversed? })
                                           // UnifiedCommentsResource
  .addComment({ pinId, aggregatedPinId, text })
                                           // AggregatedCommentResource/create

client.graphqlStream({ operationName, queryHash, variables })
                                           // /_/graphql/stream/ (SSE frames)

client.users
  .get({ userId? | username?, fieldSetKey? })
  .me()                                 // requires auth

client.boards
  .list({ username, pageSize?, privacyFilter?, sort? })
  .create({ name, description?, privacy?, collabBoardEmail? })
  .picker()

// Escape hatches — everything funnels through these
client.resource({ name, action, options, sourceUrl? }) // raw resource call
client.graphql({ operationName, queryHash, variables }) // raw GraphQL
```

## Errors

All failures are typed (from `pinterest-unofficial/errors`):

- `PinterestError` — base
- `PinterestHttpError` — network/HTTP failures (status, url)
- `PinterestResourceError` — Pinterest returned a non-success `resource_response`
- `PinterestCsrfError` — 403 CSRF failure (re-`bootstrap()` and retry once)
- `PinterestAuthError` — 401/440 auth failure

## Verification

- `npm test` — replays captured request/response fixtures against the
  transport (wire-format equality, envelope parsing, error mapping) plus
  the optional puppeteer-login flow with a fake browser module.
- `npm run test:live` — live smoke test against Pinterest public endpoints
  (bootstrap → search → typeahead → v3 proxy; optional login via
  `PIN_EMAIL`/`PIN_PASSWORD`/`PIN_ARKOSE_TOKEN`/`PIN_RECAPTCHA_TOKEN` env).
- `npx tsx scripts/live-puppeteer-login.ts` — full browser login through
  super-puppeteer, then proves the adopted session on `me()`, homefeed and
  boards (requires the optional deps + `PIN_EMAIL`/`PIN_PASSWORD`).
  Note: Pinterest rate-limits repeated logins ("Too many login attempts,
  try again in 30 minutes") — don't spam it.

## Notes & caveats

- Base URL defaults to `https://id.pinterest.com` (region-aware CDN variant
  captured). `www.pinterest.com` also works; pass `baseUrl` to override.
- Query hashes (GraphQL) rotate between releases; capture fresh ones when a
  call 400s. The resource API is the more stable surface.
- Headers/UA mimic the Chrome client captured via HTTP Toolkit; Pinterest may
  tighten bot checks over time. Don't hammer the API — respect rate limits.