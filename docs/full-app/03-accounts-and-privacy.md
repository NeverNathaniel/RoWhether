# Accounts and privacy

Today RoWhether has no accounts. Nothing about a person leaves their browser except the dock reports on dev (choices only, no identity) and the suggestion form (text that becomes a GitHub issue). Settings live in `localStorage` under `putney-rowing-*-v1` keys (`src/config.js`, `src/storage.js`).

This document plans accounts for the full app and the privacy rules around them. It defines:

- What needs an account in each phase, and what never will.
- Sign in: passkeys first, an emailed one-time code as the fallback and recovery path. Verified to run on Cloudflare Workers.
- Every account flow, step by step, with sample copy.
- `auth_sessions`: the cookie, token storage, lifetime, rotation, CSRF defense, rate limits, Turnstile, codes and enumeration.
- The profile, favorites and settings sync, including the first sign-in merge and offline behavior.
- Site roles (`user`, `moderator`, `admin`) and the hook for club roles.
- Minors and safeguarding: COPPA, junior accounts, guardian links, and product rules derived from the U.S. Center for SafeSport MAAPP, with UK and Canadian notes.
- Privacy: data inventory, precise location, analytics, cookies, processors, GDPR, UK GDPR, CCPA, PIPEDA, Vermont's design code, data requests, breach response, and the account deletion cascade across every table the other docs define.
- A terms of use outline, a draft safety disclaimer, security (audit log, takeover defenses, secrets, backups), the D1 tables, the endpoints and the UI.

Out of scope here: club roles and club data (06-clubs.md), reports, hazards, outings and moderation queues (04-reports-and-check-ins.md), push and email alerts (05-notifications.md), navigation, the picker and units display (07-product-and-ux.md), and canonical migration numbering and Worker structure (08-architecture.md). This doc proposes tables and routes; 08 owns the final schema.

Facts are marked "verified live 2026-10-17" (checked today with a request, a package download or a local run), "from docs (URL)", or "unverified". Legal readings are not legal advice and are marked for review.

## Contents

1. Principles
2. What needs an account, by phase
3. Sign-in approach
4. Flows
5. Sessions (`auth_sessions`)
6. Codes, rate limits and abuse
7. Profile
8. Favorites
9. Settings sync
10. Site roles
11. Minors and safeguarding
12. Privacy
13. Terms, disclaimer and legal review
14. Security
15. D1 schema
16. API
17. UI
18. Code changes by phase
19. Costs
20. Tests
21. Open questions and decisions

## 1. Principles

- An account is optional and adds sync, identity and club features. It never gates safety information. Every forecast, every tab, every report and hazard, public club water status and the Share button work signed out, in every phase.
- Passkeys first, then a 6-digit code sent by email. No passwords, no SMS, no magic links.
- Collect the least data that works. No birth date is stored, no raw coordinates from reports or check-ins, no IP addresses in D1, no analytics beyond one aggregate count of app opens per location (08 10.9), no ads, nothing sold.
- The Now screen stays the fast, quiet answer. Nothing about accounts runs before the first render. The sign-in code and the WebAuthn browser library load only when the sign-in dialog opens.
- Putney Landing and existing installs keep working exactly as now. Signing in for the first time never changes a threshold without asking (9.5).
- No private messages between users, ever (11.4). This is the safeguarding rule that shapes everything social.
- Keys live in Worker secrets only, never in the repo, `wrangler.jsonc` or the browser (CLAUDE.md hard constraint).

## 2. What needs an account, by phase

| Feature | Phase | Signed out | Account needed for |
| --- | --- | --- | --- |
| Now, Week and every tab, Share, refresh | 0 to 7 | Yes | Never |
| Settings and Plan a row choices | 0 to 7 | Yes, in this browser (as today) | Sync across devices (phase 2) |
| Location picker, recent locations, install | 1 | Yes | Never |
| Owner tools (`/admin`, `/api/admin/*`) | 1 | No | Phase 1: Cloudflare Access (3.7). From phase 2: site role `admin` |
| Favorites | 2 | Yes, in this browser (Decision in 8) | Sync |
| Profile, sign-in methods, export, delete | 2 | n/a | Yes |
| Reading reports, hazards, location pages | 3 | Yes | Never |
| One-tap choice-only conditions report (today's dock report) | 3 | Yes, as today on dev | Never; 04 decides whether signed-in reports show a name |
| Reports with text or photos, hazards, hazard votes | 3 | No | Yes (04) |
| Adding a location, suggesting or making edits | 3 | No | Yes; account 24 hours old to add, 7 days old to suggest (01, 12.1 and 13.1) |
| Outings, float plans, personal row log | 3 | No | Yes (04) |
| Location alerts | 4 | No (05 13) | Every alert: push, email and rules that follow you across devices (05) |
| Public club page, club water status | 5 | Yes | Never |
| Club membership, sign-out board, club rules, safety officers | 5 | No | Yes (06) |
| Schedule, attendance, lineups, boats, booking | 6 | No | Yes (06) |
| Suggestion form | today | Yes | Never |

Never needs an account, in any phase: the forecast and its verdict (Go, Caution or Stay off) for any location, every detail tab, reports and hazards as read, public club water status, the location's launch notes, the install flow, Share, and per-browser settings.

## 3. Sign-in approach

### 3.1 Recommendation

Passkeys (WebAuthn discoverable credentials) as the main way in, with a 6-digit code emailed to the account address as the fallback, the way to create an account, and the recovery path. One flow serves sign up and sign in: the person types an email, gets a code, and if no account exists, the same code creates one. Passkey sign-in needs no email at all.

Why this fits RoWhether:

- Phones are the main device and the app is an installed PWA. iOS home screen web apps keep separate cookies and storage from Safari (from Apple's WWDC23 "What's new in web apps", via search on 2026-10-17; WebKit bug 181849 says this is by design). A magic link opens in Safari, not in the installed app, so the session lands in the wrong place. A typed code works in whichever context asked for it, and `autocomplete="one-time-code"` lets the phone offer it from Mail.
- Passkeys are phishing resistant, sync across a person's devices through their platform account, and sign in with one tap and a screen lock.
- Rowers row in the morning with cold, wet hands. Passkey plus Face ID or a fingerprint beats typing.

Decision: Passkeys plus emailed 6-digit codes, codes only (no magic links).
- Alternative: codes plus a magic link in the same email, for desktop browsers (breaks in the iOS installed app, and links in mail are a phishing pattern).
- Alternative: passwords plus codes (a password database to protect, resets to build, worse on phones).

Not offered: SMS codes (cost per message, SIM swap risk, phone numbers are more personal than email).

### 3.2 Sign in with Google and Apple

Decision: Do not offer Sign in with Google or Apple at launch. Revisit if code email deliverability is a problem.
- Alternative: add both in phase 2. Apple's Developer Program costs $99 a year (verified live 2026-10-17, https://developer.apple.com/programs/, which also says advanced capabilities need membership; that Sign in with Apple on the web specifically needs it is from third-party guides via search, unverified on Apple's pages). Google lists no charge for Sign in with Google (unverified; no pricing statement found) and needs an OAuth consent screen with privacy policy and terms links on an authorized domain (from search of Google's client ID guide, 2026-10-17). Each adds a processor, a data flow and a table (`oauth_identities`) to protect.
- Alternative: Google only (most Android users already have synced passkeys through Google Password Manager, so the gain is small).

### 3.3 WebAuthn library, verified on Workers

Use `@simplewebauthn/server` and `@simplewebauthn/browser`, pinned exactly (CLAUDE.md requires exact pins):

```json
"dependencies": {
  "@simplewebauthn/server": "14.0.3",
  "@simplewebauthn/browser": "14.0.0"
}
```

| Fact | Status |
| --- | --- |
| `@simplewebauthn/server` latest is 14.0.3 (published 2026-09-25); `@simplewebauthn/browser` latest is 14.0.0 (2026-09-02) | verified live 2026-10-17 (`npm view`) |
| The server package gets crypto from `getWebCrypto()`, which returns `globalThis.crypto`. No `node:` imports in its ESM build | verified live 2026-10-17 (read the 14.0.3 package source) |
| The project README lists Cloudflare Workers among compatible runtimes | verified live 2026-10-17 (GitHub README) |
| Runs in workerd: a test Worker using `generateRegistrationOptions`, `verifyRegistrationResponse`, `generateAuthenticationOptions` and `verifyAuthenticationResponse`, under `wrangler dev` 4.149.0 with `compatibility_date` 2026-09-01 and no `nodejs_compat` flag (the same date as `wrangler.jsonc`). A synthetic authenticator (packed, `none` attestation, ES256, built with `@levischuck/tiny-cbor`) registered (`verified: true`) and authenticated (`verified: true`, counter 1). A wrong challenge was rejected ("Unexpected authentication response challenge") | verified live 2026-10-17 |
| Default algorithms offered in workerd: -8 (Ed25519), -7 (ES256), -257 (RS256). The ML-DSA (post-quantum) preference added in 14.0.0 does not switch on in workerd | verified live 2026-10-17 |
| Challenge is 32 bytes, 43 characters base64url | verified live 2026-10-17 |
| Worker bundle with the library: 695.28 KiB, 126.71 KiB gzipped (`wrangler deploy --dry-run`) | verified live 2026-10-17 |
| Worker size limit is 64 MiB uncompressed on Free and Paid, with no compressed limit | from docs (https://developers.cloudflare.com/workers/platform/limits/, updated Oct 12, 2026) |
| Browser side: `startRegistration`, `startAuthentication`, `browserSupportsWebAuthn`, `browserSupportsWebAuthnAutofill` bundle to 8,650 bytes, 2,863 gzipped (esbuild, minified) | verified live 2026-10-17 |
| 14.0.2 fixed two moderate advisories (GHSA-2g3p-m8c9-hhwh, GHSA-j3h4-m3m2-7p7j) in certificate revocation handling. RoWhether uses `attestationType: 'none'`, so that path does not run, but 14.0.3 includes the fix | verified live 2026-10-17 (changelog) |
| 14.0.0 added `sendSignal()` in the browser package for the WebAuthn Signal API | verified live 2026-10-17 (changelog); browser support for the Signal API unverified |
| `crypto.subtle.timingSafeEqual(a, b)` exists in Workers as a non-standard extension | from docs (https://developers.cloudflare.com/workers/runtime-apis/web-crypto/) |
| Conditional mediation (passkey autofill) is Baseline widely available since October 2023; the `webauthn` autocomplete token goes last in the list | from docs (MDN, `isConditionalMediationAvailable` and the `autocomplete` attribute) |
| WebAuthn works inside an iOS home screen web app (standalone) | unverified; test on a device before phase 2 ships (20.4) |

`package.json` says `"engines": { "node": ">=20.19" }`. The library's 14.x README targets Node 22 LTS and later; its `package.json` still says `>=20.0.0` (verified live 2026-10-17). CI runs Node 22 (`.github/workflows`). Raise the repo's `engines.node` to `>=22` in phase 2 so local tests match.

The browser library loads with a dynamic `import()` from the sign-in dialog code, so the main bundle that draws the Now screen does not grow.

### 3.4 Relying party settings

| Setting | Value | Why |
| --- | --- | --- |
| `rpName` | `RoWhether` | Shown by some passkey managers. |
| `rpID` | The request host when it is in `AUTH_HOSTS`: `rowhether.com` in production, the Preview host on dev, `localhost` locally | A passkey works only on its RP ID. Previews are separate hosts with a separate D1, so dev passkeys never touch production. |
| `expectedOrigin` | `https://` plus the host (`http://localhost:8787` locally) | |
| `userID` | `users.webauthn_handle`: 16 random bytes, base64url, made at sign up | Not the email or user id, so the authenticator stores nothing personal. One handle per user, so a second passkey on the same authenticator replaces the first. |
| `userName` | The email | What the passkey manager shows. |
| `userDisplayName` | The display name | |
| `residentKey` | `required` | Discoverable passkeys, so sign-in needs no email first. |
| `userVerification` | `required` | Passkeys always verify the person (screen lock or biometric). With UV, a passkey is two factors in one. Security keys without a PIN cannot be used; acceptable. |
| `attestationType` | `none` | No device attestation needed; avoids the attestation code path entirely. |
| `excludeCredentials` | The user's existing passkeys | Stops duplicates on one authenticator. |
| `timeout` | 300,000 ms | Five minutes, matching the challenge row lifetime. |
| Algorithms | Library default | -8, -7, -257 on Workers (3.3). |
| Counter check | Reject only if both stored and new counters are above 0 and the new one is not larger | Synced passkeys report 0. |

### 3.5 Email delivery

| Option | Cost | Works on Workers Free | How the Worker sends | Notes |
| --- | --- | --- | --- | --- |
| Cloudflare Email Service | Needs Workers Paid ($5 a month minimum per account). 3,000 emails a month included, then $0.35 per 1,000 | No: "Sending to arbitrary recipients requires the Workers Paid plan" | `send_email` binding: `{ "send_email": [{ "name": "EMAIL" }] }`, then `await env.EMAIL.send({ to, from, subject, html, text })`. No API key | The domain must use Cloudflare DNS. rowhether.com does, because a Worker Custom Domain needs an active Cloudflare zone. Onboarding adds SPF, DKIM, DMARC and bounce MX records (on `cf-bounce`). New accounts start with a conservative daily quota that grows with reputation (number not published). Sending to verified destination addresses is free and works before onboarding. Up to 50 recipients and 5 MiB per message |
| Resend | Free: 3,000 a month, 100 a day, 3 domains. Pro: $20 a month for 50,000 | Yes | HTTPS API, key in secret `RESEND_API_KEY` (plain `fetch`, no SDK needed; npm `resend` is 6.34.1) | DPA covers GDPR with EU and UK Standard Contractual Clauses; processing mainly in the US; EU-U.S. Data Privacy Framework |
| Postmark | Free developer plan: 100 a month. Basic: $15 a month for 10,000, overage $1.80 per 1,000 | Yes | HTTPS API with a server token | |
| Amazon SES | $0.10 per 1,000 with no plan. New accounts start on the Essentials plan from July 21, 2026: $0.16 per 1,000 | Yes | AWS SigV4-signed requests (needs a signing library) | Sandbox exit request; most setup |

Sources: Cloudflare pricing from docs (https://developers.cloudflare.com/email-service/platform/pricing/, updated Jun 9, 2026), binding from docs (https://developers.cloudflare.com/email-service/api/send-emails/workers-api/), onboarding and limits from docs (https://developers.cloudflare.com/email-service/get-started/send-emails/, https://developers.cloudflare.com/email-service/platform/limits/, updated Sep 25, 2026), Custom Domains from docs (https://developers.cloudflare.com/workers/configuration/routing/custom-domains/). Resend, Postmark and SES prices verified live 2026-10-17 on their pricing pages; Resend DPA verified live 2026-10-17 (https://resend.com/legal/dpa).

Decision: Cloudflare Email Service, on the Workers Paid plan from phase 2.
- Alternative: Resend Free on Workers Free (a second processor and a secret; 100 a day cap is tight on a busy first weekend).
- Alternative: Postmark (best known deliverability; $15 a month).

Volume estimate (an estimate, not measured): 1,000 accounts, each needing about 1.5 codes a month (new devices, the iOS installed app, lapsed sessions) is about 1,500 codes, plus about 300 security notices. That is inside the 3,000 included. 05's email alerts count against the same quota, so 05 caps alert email at 70% of `EMAIL_DAILY_LIMIT` and sends overdue mail ahead of it (05 5.7).

Sending identity: `RoWhether <signin@rowhether.com>` for codes and account notices. No reply address on code emails. A `help@rowhether.com` inbox (Cloudflare Email Routing to the owner's mailbox; free per Cloudflare's product page, unverified) receives data requests and support.

No tracking pixels and no link tracking in any email.

### 3.6 Account emails

Code email (identical for a new or existing address, so the email itself reveals nothing):

- Subject: `482913 is your RoWhether code`
- Text body:

```
Your RoWhether code is 482913.

Enter it in RoWhether to sign in. It works for 10 minutes.

If you did not ask for this, ignore this email. Someone may have typed your address by mistake.
No one from RoWhether will ever ask you for this code.

RoWhether
https://rowhether.com/
```

- HTML body: the same words, the code large in Archivo with tabular figures, no images, no remote fonts (a system font stack is fine in mail).

Other account emails, all from `signin@rowhether.com`, times in the account's home location time zone (America/New_York when none is set), with the zone named:

| Event | Subject | First line |
| --- | --- | --- |
| Passkey added | A passkey was added to your RoWhether account | "On Oct 17 at 7:42 PM Eastern, a passkey named iPhone was added. If this was not you, sign in and remove it, then sign out everywhere." |
| Passkey removed | A passkey was removed from your RoWhether account | "A passkey named Work laptop was removed on Oct 17 at 7:42 PM Eastern." |
| Email changed (sent to the old address) | Your RoWhether email was changed | "On Oct 17 at 7:42 PM Eastern, your account email was changed to s***@example.org. If this was you, there is nothing to do. If it was not, undo it within 7 days: https://rowhether.com/account/revert#t=..." |
| Data downloaded | Your RoWhether data was downloaded | "A copy of your account data was downloaded on Oct 17 at 7:42 PM Eastern." |
| Account deleted | Your RoWhether account was deleted | "Your account was deleted on Oct 17. Copies in our backups are erased within 30 days." |
| Site role changed | Your RoWhether role changed | "You are now a moderator. Moderator tools need a passkey sign-in." |
| Guardian invite (phase 5) | Jamie asked you to link as their guardian | 11.5 |
| Junior turns 18 soon (phase 5) | Jamie's account becomes an adult account on May 1 | 11.5 |

Masking for addresses shown in mail and on screen: first character, `***`, then `@` and the domain (`s***@example.org`).

### 3.7 Owner access before accounts (phase 1)

The `/admin` tools (07 14.5's Metrics tab in phase 1) are owner only before accounts exist. Phase 1 discovery is a local script, not a route (08 5.6, K5). Use Cloudflare Access:

1. In Zero Trust, add a self-hosted Access application for `rowhether.com/admin*` and `rowhether.com/api/admin/*`. Access can protect a hostname, a Custom Domain or a path (from docs, https://developers.cloudflare.com/workers/configuration/routing/custom-domains/). Policy: allow the owner's email only. Login method: the Cloudflare identity provider (the default for new Zero Trust organizations since 2026, from docs, https://developers.cloudflare.com/changelog/post/2026-06-18-cloudflare-idp-default/) or one-time PIN.
2. The Worker also validates the `Cf-Access-Jwt-Assertion` header on those paths with `jose` (`jwtVerify` and `createRemoteJWKSet` against `${TEAM_DOMAIN}/cdn-cgi/access/certs`, issuer `TEAM_DOMAIN`, audience `POLICY_AUD`), the pattern Cloudflare documents (from docs, https://developers.cloudflare.com/changelog/post/2025-10-03-one-click-access-for-workers/). Pin `"jose": "6.2.12"` (latest, verified live 2026-10-17). Vars: `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` (not secret).
3. Zero Trust Free plan seat count: believed to be 50 users, unverified (not stated on the pages checked).

From phase 2, admin routes require `site_role = 'admin'` in a passkey session (10). Decision: keep Cloudflare Access in front of `/admin*` and `/api/admin/*` after phase 2 as a second lock. Access allows the owner only and answers before the Worker runs, so no moderator route sits under it: moderators use the `/mod` page and `/api/mod/*`, guarded by site role and a passkey session alone (08 3.5, 07 5.14).
- Alternative: remove Access in phase 2 and rely on site roles alone (one less system; one less layer).

## 4. Flows

Each flow names the screens, the API calls (16) and the copy. Screen titles are sentence case. "Confirm it's you" (4.12) appears wherever a step says recent sign-in is needed: the person proved who they are within the last 10 minutes.

### 4.1 Sign up (new email)

1. The person taps "Sign in" (17.1). The `<dialog id="signin">` opens. The client dynamically imports `src/auth.js` and `@simplewebauthn/browser`.
   - Title: "Sign in"
   - Lead: "An account keeps your settings and favorites on all your devices. Forecasts, reports and every tab work without one."
   - Button: "Use a passkey" (shown when `browserSupportsWebAuthn()`)
   - Divider text: "or"
   - Field: label "Email", `type="email"`, `autocomplete="username webauthn"` when `browserSupportsWebAuthnAutofill()` resolves true, otherwise `autocomplete="email"`.
   - Button: "Email me a code"
   - Fine print: "New here? The same code creates your account. By continuing you agree to the Terms and the Privacy notice." (links to `/terms` and `/privacy`)
2. When the email field first gets focus, the Turnstile script loads (6.3) and renders an `interaction-only` widget with action `auth`, as `src/suggest.js` does for `suggest`.
3. "Email me a code" sends `POST /api/auth/code` `{ "email": "sam@example.com", "purpose": "signin", "turnstile": "<token>" }`. The response is the same for any address (6.4).
4. Screen "Check your email":
   - "We sent a 6-digit code to sam@example.com. It works for 10 minutes."
   - Field: label "Code", `inputmode="numeric"`, `autocomplete="one-time-code"`, `pattern="[0-9]{6}"`, `maxlength="6"`. Pasting a code with spaces works (spaces are stripped).
   - Button: "Continue"
   - Links: "Send a new code" (disabled for 30 seconds, reading "Send a new code in 24 s"), "Use a different email".
   - Hint: "Not there after a minute? Check spam."
5. "Continue" sends `POST /api/auth/code/verify` `{ "codeId": "...", "code": "482913" }`. For an address with no account the answer is `{ "status": "new_account", "ticket": "..." }`.
6. Screen "Create your account":
   - Field "Name". Hint: "Shown with your reports and in your clubs. A first name and last initial works well." 2 to 40 characters (7).
   - Fields "Month and year you were born": a month select (blank, then January to December) and a 4-digit year text field. Hint: "Only used to apply the rules for junior rowers. We do not keep your birth date."
   - Field "Home location": a select, preset to the location open now ("Putney Landing"), with "None".
   - Button: "Create account"
   - Fine print: "By creating an account you agree to the Terms and the Privacy notice."
7. `POST /api/auth/signup` `{ "ticket", "displayName", "birthMonth", "birthYear", "homeLocation", "terms": "2026-11-01" }`:
   - Under 13 (11.2): 403 `too_young`. The server deletes the code row and ticket; nothing about the person is kept. The client writes `rowhether-agegate-v1` with the time, and for 24 hours the dialog opens straight to this screen. Title: "You need to be 13 or older for an account". Body: "RoWhether works fully without one. Forecasts, reports and every tab are the same." Button: "Back to the forecast".
   - 13 to 17: 201, a junior account (11.3). Extra line on the next screen: "Your account has junior settings. Your name is shown only to your clubs."
   - 18 or older: 201.
   - The response sets the session cookie (5.1).
8. Screen "Add a passkey?" (only when `platformAuthenticatorIsAvailable()` is true):
   - "Next time, sign in with your face, fingerprint or screen lock. No code needed."
   - Buttons: "Add a passkey" (runs 4.4 without the recent sign-in check, since the person just proved their email) and "Not now".
9. If this browser has settings or favorites, the first sign-in merge runs (9.5).
10. The dialog closes. A status line (`aria-live="polite"`) says "Signed in as Sam R." The header shows the name (17.1).

### 4.2 Sign in with a passkey

Button path:

1. "Use a passkey" sends `POST /api/auth/passkey/options` `{}`. Answer: `{ "challengeId", "options" }` with an empty `allowCredentials` (discoverable).
2. `startAuthentication({ optionsJSON: options })`. The platform shows its passkey sheet.
3. `POST /api/auth/passkey/verify` `{ "challengeId", "response" }`. On success the cookie is set and the answer is `{ "user": {...} }`.
4. The passkey offer is skipped. The merge runs if needed (9.5). The dialog closes.

Autofill path: when the dialog opens and `browserSupportsWebAuthnAutofill()` is true, the client fetches options and calls `startAuthentication({ optionsJSON, useBrowserAutofill: true })`. The browser lists passkeys in the email field's suggestions. Picking one continues at step 3. Typing an email and choosing "Email me a code" aborts the pending request (`WebAuthnAbortService`, exported by the browser package).

Errors:

| Case | Copy |
| --- | --- |
| The person cancels (`NotAllowedError`) | No message. The dialog stays open. |
| 404 `unknown_passkey` (removed from the account) | "This passkey is no longer on your account. Sign in with an email code, then add a new passkey." The client calls `sendSignal` to report the unknown credential where supported. |
| 403 `suspended` | "This account is paused until November 1. Write to help@rowhether.com if you think this is a mistake." |
| Network failure | "Could not reach RoWhether. Check your connection and try again." |
| 400 `passkey_failed` | "That passkey did not work. Try again, or sign in with an email code." |

### 4.3 Sign in with an email code (existing account)

Steps 1 to 5 of 4.1. The verify answer is `{ "status": "signed_in", "user": {...} }` with the cookie. Then:

- If this device has not shown the passkey offer in 30 days (`rowhether-passkey-offer-v1`), the account has fewer than 10 passkeys, and a platform authenticator is available: show "Add a passkey on this device?" with the 4.1 step 8 copy.
- The merge runs if needed (9.5).

A code sign-in gives a session with `auth_method = 'code'`. Moderator and admin powers need a passkey session (10).

### 4.4 Add a passkey

From Account, "Sign-in methods", "Add a passkey". Needs a recent sign-in.

1. `POST /api/me/passkeys/options` gives `{ "challengeId", "options" }` with `excludeCredentials`.
2. `startRegistration({ optionsJSON: options })`.
3. `POST /api/me/passkeys` `{ "challengeId", "response" }`. The server verifies and stores the passkey. Default name from the user agent: "iPhone", "iPad", "Mac", "Android phone", "Windows PC", "Linux PC" or "Passkey", plus " (synced)" when `backed_up` is 1. The person can rename it.
4. Copy: "Passkey added. Use it here and on devices that share your passkeys."
5. Email "A passkey was added" (3.6). Audit `auth.passkey_added`.

Errors: `InvalidStateError` (this authenticator already has one) shows "This device already has a passkey for your account." 409 `too_many` (10 passkeys) shows "You have 10 passkeys. Remove one before adding another."

### 4.5 Sign in on a new device

Three ways, all from the same dialog:

1. A synced passkey (same Apple Account, Google account or password manager): "Use a passkey" works at once.
2. A passkey on a phone, signing in on a laptop: the browser's own "use a phone or tablet" option shows a QR code (cross-device sign-in is built into browsers; nothing to build here).
3. An email code (4.3).

The iOS installed app counts as a new device: it does not share cookies with Safari (3.1). A person signed in in Safari opens the installed app signed out, and signs in there once.

### 4.6 Lost or stolen device

Copy on the Account page, under "Where you're signed in": "Lost a phone? Sign it out here. Your passkeys need that phone's screen lock, so the phone alone cannot get in."

1. On any other device, sign in with a passkey or an email code.
2. Account, "Where you're signed in": find "Safari on iPhone, last used Oct 12" and tap "Sign out", or "Sign out everywhere" (4.9).
3. Account, "Sign-in methods": remove a passkey that lived only on that device ("singleDevice"). A synced passkey stays; the person secures it through their Apple, Google or password manager account.

Lost both the email account and every passkey: RoWhether cannot prove who the person is.

Decision: No account recovery without the email address or a passkey. The person makes a new account; club admins add them back to their clubs.
- Alternative: manual recovery by the owner with proof (a club admin vouching). Social engineering risk, and it needs a written procedure.

### 4.7 Change email

Account, "Email", "Change email". Needs a recent sign-in.

1. Field "New email", Turnstile (action `auth`). `POST /api/me/email` `{ "email", "turnstile" }` sends a code to the new address. 3 requests per account per day.
2. Screen "Check your new email" (same as 4.1 step 4).
3. `POST /api/me/email/verify` `{ "codeId", "code" }`.
   - 200: "Your email is now sam@example.org." The session token rotates (5.4).
   - 409 `email_taken`: "That email belongs to another account. Sign in to that account, or delete it first." Only someone who controls the new address learns this.
4. The old address gets "Your RoWhether email was changed" with an undo link (3.6). The link is `https://rowhether.com/account/revert#t=<token>`: the token sits in the fragment, so it never reaches server logs or a `Referer` header. The page shows "Undo the email change?" and a button that sends `POST /api/auth/revert` `{ "token" }`. Undo puts the old email back, ends every session, removes passkeys added since the change, and writes `auth.email_reverted`. The token is 32 random bytes, stored as an HMAC in `login_codes` (`purpose = 'revert_email'`), valid 7 days, single use.

### 4.8 Sign out

Account, "Sign out" (also a link at the foot of Settings).

- Dialog: "Sign out on this device?" Checkbox: "Also remove my settings and favorites from this device". Hint: "Tick this on a shared device, like the boathouse tablet." Buttons: "Sign out", "Cancel".
- `POST /api/auth/signout` deletes the session row and clears the cookie.
- The client deletes `rowhether-me-v1` and `rowhether-sync-v1`. With the box ticked it also deletes `rowhether-settings-v2`, `rowhether-favorites-v1` and `rowhether-plan-v1`. The forecast cache stays.
- Status line: "Signed out. Your settings stay on this device." (or "Signed out. This device is back to the defaults.")

### 4.9 Sign out everywhere

Account, "Where you're signed in", "Sign out everywhere". No recent sign-in needed: it only removes access.

- Confirm: "Sign out on every device, including this one? You will need a passkey or an email code to sign back in." Buttons: "Sign out everywhere", "Cancel".
- `POST /api/auth/signout-all` deletes every `auth_sessions` row for the user. Audit `auth.signout_all`.

### 4.10 Delete account

Account, "Your data", "Delete account". Needs a recent sign-in.

Page "Delete your account":

- "This deletes your account, sign-in methods, synced settings, favorites, outings and row log, emergency contacts, alerts and club memberships. It cannot be undone."
- "Kept without your name: conditions reports, hazards and location edits you made, because other rowers rely on them. Club records such as damage reports keep the facts but not your name." (12.9 has the full list.)
- "Settings saved in this browser stay here until you clear them. You can download your data first." (link to 4.11)
- Field: "Type delete to confirm". Button "Delete account" (disabled until the field says `delete`).

The page loads `GET /api/me/delete` first, which lists blockers and notes.

One blocker:

| Blocker | Copy |
| --- | --- |
| A boat signed out and not back (phase 3) | "You have a boat signed out. Sign it in first, so no one is alerted by mistake." Signing in runs 04's normal all clear, which is what 04 asks to happen before a deletion. |

Notes, not blocking (a person's right to delete must not depend on someone else acting):

- Only admin of a club (phase 5): "You are the only admin of Putney Rowing Club. When your account is deleted, the club's safety officer or longest-serving coach becomes admin." (06 3.6 succession)
- Guardian links (phase 5): "Your guardian link with Jamie ends."

`POST /api/me/delete` `{ "confirm": "delete" }` runs 12.9 in one D1 batch. The client clears every account key (4.8 with the box ticked) and shows "Your account is deleted. Thank you for rowing with RoWhether." The address gets "Your RoWhether account was deleted".

Decision: Delete at once, with no grace period.
- Alternative: a 14-day grace period with "Cancel deletion" (safer against a takeover that deletes, but keeps data longer and needs a pending state everywhere).

### 4.11 Download my data

Account, "Your data", "Download my data". Needs a recent sign-in. Once per 10 minutes.

- Copy: "A file with everything your account holds. It opens in any text editor."
- `GET /api/me/export` returns `rowhether-data-2026-10-17.json` (`Content-Disposition: attachment`). Format in 16.6.
- Email "Your RoWhether data was downloaded". Audit `data.export`.

### 4.12 Confirm it's you

Shown when an action answers 403 `recent_auth`, then the action is retried.

- Title: "Confirm it's you"
- Body: "For your security, confirm it's you before changing sign-in details or your data."
- Buttons: "Use a passkey" (`POST /api/auth/passkey/options` then `/verify` with `"purpose": "reauth"`), "Email me a code" (`POST /api/auth/code` with `"purpose": "reauth"`; the address comes from the session).
- On success `auth_at` becomes now and the token rotates.

### 4.13 Terms change

When `users.terms_version` is older than the current version, the next app open shows a quiet banner above the hero (the same place as `#setNudge`): "We updated the Terms on Nov 1. Read what changed." with "OK". "OK" sends `POST /api/me/terms` `{ "version" }`. Nothing is blocked while the banner shows.

## 5. Sessions (`auth_sessions`)

### 5.1 Cookie

```
Set-Cookie: __Host-rw_session=<token>; Path=/; Max-Age=15552000; HttpOnly; Secure; SameSite=Lax
```

- `__Host-` prefix: the cookie must be `Secure`, set by an HTTPS page, with no `Domain` and `Path=/` (from docs, MDN Set-Cookie). It stays on the exact host, so a Preview host never sees production cookies.
- `HttpOnly`: page scripts cannot read it.
- `SameSite=Lax`: sent on same-site requests and on cross-site top-level navigations with safe methods only, never on cross-site `POST`, `PUT` or `DELETE` (from docs, MDN). `Strict` would drop the cookie when someone opens a rowhether.com link from mail or chat, so they would look signed out on that first load.
- `Max-Age` is the idle lifetime, 180 days (5.3), and shrinks near the absolute limit. Chrome caps cookie lifetimes at 400 days (from docs, https://developer.chrome.com/blog/cookie-max-age-expires).
- Clearing: `__Host-rw_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`.
- Locally, `Secure` is accepted on `http://localhost` (from docs, MDN: "The https: requirements are ignored when the Secure attribute is set by localhost"). Test in each browser (20.4).

This is the only cookie the app sets for people. A paired club boathouse screen also gets `rw_kiosk` (06 8.5; 08 K34).

### 5.2 Token and storage

- Token: 32 bytes from `crypto.getRandomValues`, base64url, 43 characters.
- Stored: `token_hash` = SHA-256 of the token, hex (64 characters). The token itself is never stored or logged. A D1 leak does not give working sessions. A plain hash is enough because the token has 256 bits of entropy.
- Each row also has an `id` (`crypto.randomUUID()`) that the Account page uses to name and revoke sessions. The hash never leaves the server.
- Per row: `auth_method` (`passkey` or `code`), `auth_at`, `device` (a short label parsed from `User-Agent`, such as "Safari on iPhone", 60 characters at most), `country` (`request.cf.country`), `created_at`, `last_seen_at`, `expires_at`. No IP address.
- At most 30 sessions per user. A new sign-in beyond that deletes the one with the oldest `last_seen_at`.

### 5.3 Lifetime and renewal

- Idle limit: 180 days. Rowing has an off-season of four to five months; 90 days would sign everyone out over the winter.
- Absolute limit: 400 days from `created_at`, the Chrome cookie cap.
- Renewal: on any request with a valid session where `now - last_seen_at > 24 h`, update `last_seen_at = now`, `expires_at = min(now + 180 d, created_at + 400 d)`, and send the cookie again with the matching `Max-Age`. At most one D1 write per session per day.
- Expired rows are deleted when met, and by a daily cleanup (5.8).

Decision: 180-day idle and 400-day absolute session lifetime.
- Alternative: 90-day idle (more sign-ins after the winter break).
- Alternative: 30-day idle with silent passkey re-auth (more prompts; passkey support in the iOS installed app is unverified).

### 5.4 Rotation and recent sign-in

A new token is issued, and the old row deleted, at:

- Every sign-in (passkey or code). A cookie present before sign-in is ignored and its row deleted (no session fixation).
- "Confirm it's you" (4.12).
- Email change and email revert.
- A change to the user's `site_role`: all their sessions are deleted.

No periodic rotation. Several open tabs would race to rotate, and with `HttpOnly` cookies and hashed storage it adds little.

Recent sign-in means `now - auth_at <= 10 minutes`. Needed for: adding or removing a passkey, changing email, export, delete, guardian link changes (phase 5), and admin actions that change roles or suspend users (10).

### 5.5 Reading the session in the Worker

`getSession(request, env, now)` in `worker/auth/session.js`, called once per request and passed on:

1. Read `__Host-rw_session` from the `Cookie` header. None: return null.
2. Hash it. `SELECT s.id, s.user_id, s.auth_method, s.auth_at, s.created_at, s.last_seen_at, s.expires_at, u.display_name, u.site_role, u.junior_until, u.suspended_until, u.terms_version FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`. One indexed lookup, about 2 rows read.
3. Expired: delete the row in `ctx.waitUntil`, return null, and add the clearing cookie to the response.
4. Renew if due (5.3).

Guards in `worker/auth/guard.js` return a `Response` to send, or null to go on: `requireUser(s)`, `requireRecentAuth(s, now)`, `requirePasskeySession(s)`, `requireSiteRole(s, 'moderator' | 'admin')`, `requireNotSuspended(s)` (on writes to shared content). 06 adds `requireClubRole(s, clubId, roles)`.

`GET /api/me` answers 200 `{ "user": null }` when signed out, never 401, so the signed-out page load keeps a clean console (CLAUDE.md test).

### 5.6 CSRF defense

1. `SameSite=Lax` (5.1).
2. Origin check: every `/api/*` request with a method other than `GET` or `HEAD` must carry an `Origin` header equal to the request's own origin (`new URL(request.url).origin`). Missing or different: 403 `bad_origin` "That request came from another site." Browsers send `Origin` on same-origin `POST` from `fetch`.
3. JSON only: request bodies must have `Content-Type: application/json`, else 415 `bad_type` "Send JSON." A cross-site form cannot send that type without a CORS preflight, and the API answers no preflight.
4. `GET` never changes state. The email undo link is a page plus a `POST` (4.7).
   One exception to rule 2: `POST /api/notify/unsubscribe` (05 7.6) skips the `Origin` check, because mail servers send RFC 8058 one-click posts from their own hosts. It acts only on the HMAC token it carries, never on a session (08 7.1, K37).
5. No CORS headers on `/api/*`. Same origin only.
6. `Cache-Control: no-store` on every personal response (as `worker/reports.js` does today). The service worker never handles `/api/*` (`navigateFallbackDenylist: [/^\/api\//]` in `vite.config.js`).

The check lives in `worker/index.js` before routing, so every later route (04, 05, 06) inherits it.

### 5.7 Environments

| Environment | Accounts | rpID and cookie host | Email | Notes |
| --- | --- | --- | --- | --- |
| Production (`master`) | On, from phase 2 | `rowhether.com` only (`AUTH_HOSTS` var) | Cloudflare Email Service, `signin@rowhether.com` | Needs a production D1 binding, which does not exist yet (CLAUDE.md). On other hosts, such as the production `workers.dev` address, `/api/auth/*` answers 404 `accounts_off` and `/api/info` says `accounts: false`. |
| Previews (`dev` and branches) | On, behind Cloudflare Access | The Preview host | Only to verified destination addresses (the owner's test inboxes), which Email Service allows before onboarding and for free (from docs, limits page) | `rowhether-dev` D1. `AUTH_PEPPER` gets its own dev value as a Preview secret, or a plain Preview var if Preview secrets cannot be set (08 6.5, K49); the dev database holds only test accounts. Cloudflare Access can be turned on for Preview URLs in one click (from docs, changelog 2025-10-03). Whether the `previews` block accepts a `send_email` binding is unverified. |
| Local (`wrangler dev`) | On | `localhost` | Not sent. When `APP_ENV` is `local` and the host is `localhost`, the code is written to the console | A local D1 (CLAUDE.md "For dock reports against a real database"). |

`/api/info` grows to `{ "env": "production", "reports": true, "accounts": true }`. The app hides every account control when `accounts` is false or `/api/info` fails (a static host with no `/api`).

Decision: Turn accounts on for Previews, protected by Cloudflare Access, with email limited to verified addresses.
- Alternative: accounts off on Previews; test only locally (no phone testing of passkeys on a real HTTPS host before production).

### 5.8 Cleanup

A daily job (the `scheduled` handler 05 adds to `worker/index.js`; until then, run on each sign-in, at most once an hour) deletes:

- `auth_sessions` with `expires_at < now`
- `auth_challenges` with `expires_at < now`
- `login_codes` older than 24 hours, except unexpired `revert_email` rows
- `guardian_links` pending past `code_expires_at` (phase 5)
- `audit_log` rows past `expires_at`
- `email_blocks` past `expires_at`
- `users.junior_until` set to null once it has passed (11.3)

## 6. Codes, rate limits and abuse

### 6.1 Login codes

- 6 digits from `crypto.getRandomValues(new Uint32Array(1))`. Values at or above 4,294,000,000 (the largest multiple of 1,000,000 below 2^32) are drawn again, then `n % 1,000,000`, zero padded. Uniform.
- Stored as `code_hash` = HMAC-SHA256 with key `AUTH_PEPPER` over `<codeId>:<code>`, hex. A database leak alone does not reveal codes, even though a 6-digit space is small.
- Compared with `crypto.subtle.timingSafeEqual`.
- Expires 10 minutes after creation.
- 5 wrong tries kill the code (`status = 'dead'`).
- A new code for the same address and purpose marks earlier `sent` codes `replaced`.
- A verified sign-in code becomes `used`. For a new address it becomes `verified` and holds a signup ticket (32 random bytes, base64url, stored as SHA-256) valid 30 minutes.
- Spaces and dashes in the typed code are stripped before checking.

### 6.2 Rate limits

| What | Limit | How |
| --- | --- | --- |
| Every `POST /api/auth/*` per connection | 10 per 60 s | New binding `AUTH_LIMIT`, `simple: { limit: 10, period: 60 }`, key `CF-Connecting-IP` |
| Code requests per connection | 3 per 60 s | New binding `CODE_LIMIT`, `simple: { limit: 3, period: 60 }`, same key |
| Codes per address | 1 per 30 s, 5 per hour, 10 per 24 hours | D1 count on `login_codes (email, created_at)` |
| Wrong codes per code | 5, then the code is dead | `login_codes.attempts` |
| Wrong codes per address | 10 per hour (sum of `attempts`), then code sign-in for that address pauses for an hour | D1 |
| Email change requests | 3 per account per 24 hours | D1 |
| Guardian link code tries (phase 5) | 5 per account per hour | D1 |
| Export | 1 per account per 10 minutes | D1, last `data.export` in `audit_log` |
| Passkey options | counted in `AUTH_LIMIT` | |

Rate limit bindings take a period of 10 or 60 seconds only, and count within a single Cloudflare location (from docs, https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/; the repo's `wrangler.jsonc` notes the same). They stop bursts. Longer windows are D1 counts. Namespace ids: proposed `1011` and `1012` for `AUTH_LIMIT` (production, Previews) and `1013` and `1014` for `CODE_LIMIT`; 08 assigns the final numbers after `SUGGEST_LIMIT` (1001, 1002) and `REPORT_LIMIT` (1003, 1004).

Copy for limits: "Too many tries. Wait a minute and try again." (binding), "Too many codes for that address. Wait an hour, or use a passkey." (per address). These apply to any address, so they say nothing about whether an account exists.

### 6.3 Turnstile

- Required on `POST /api/auth/code` (all purposes except `reauth`, which already has a session) and `POST /api/me/email`. Not on passkey routes: a passkey assertion is its own proof.
- Action `auth`. `worker/turnstile.js` `verifyTurnstile(env, token, ip)` becomes `verifyTurnstile(env, token, ip, action)`; the suggest route passes `'suggest'`.
- Tokens are valid for 300 seconds and can be validated once; a replay fails with `timeout-or-duplicate` (from docs, https://developers.cloudflare.com/turnstile/get-started/server-side-validation/, updated Sep 16, 2026). After a failed send, the client calls `turnstile.reset` before the next try.
- Script loading: CLAUDE.md allows the Turnstile script only "when the suggestion form is first opened". Accounts need it when the sign-in email field first gets focus. If it fails to load: "The spam check did not load. Check your connection, or use a passkey."

Decision: Extend the CLAUDE.md Turnstile exception to 08 10.8's sentence: "It loads only when a form that needs it is first opened: suggestions, sign in, changing your email, inviting a guardian, a report sent while signed out, and the status link's safe button." This changes a hard-constraint sentence and needs the owner's approval.
- Alternative: no Turnstile on codes; rely on rate limits alone (cheaper to abuse for sending mail to strangers).

### 6.4 No account enumeration

- `POST /api/auth/code` answers the same 200 `{ "codeId", "expiresAt", "resendAfter" }` for any well-formed address, and sends the same email either way (a new address gets a code that can create an account).
- Email sending runs in `ctx.waitUntil`, so response time does not depend on the provider.
- Passkey sign-in is usernameless: nothing to probe.
- Suspension and junior status are shown only after the person proves the address or passkey.
- `email_taken` on email change (4.7) is shown only to someone who controls the new address.

### 6.5 Suspension and blocks

- `users.suspended_until` and `suspended_reason`, set by admins (10). A suspended person can sign in, read, export and delete. Writes to shared content (reports, hazards, locations, club posts) answer 403 `suspended`: "Your account is paused until November 1, so you cannot post. You can still read, download your data or delete your account."
- A ban is a suspension until year 9999 plus a row in `email_blocks` (an HMAC of the address with `AUTH_PEPPER`, kept 1 year). If the person deletes the account, the same address cannot make a new one for that year. The privacy notice says so.
- No blocking of disposable email domains.

## 7. Profile

| Field | Column | Rules | Who sees it |
| --- | --- | --- | --- |
| Email | `users.email` | Trimmed, lowercased, NFC, 6 to 254 characters, one `@` with a dot after it. Unique. | The person; admins (each view logged, 14.2). Never other users or club admins (06 contacts members through the app). |
| Display name | `users.display_name` | NFC, trimmed, inner spaces collapsed, 2 to 40 characters. No `@`, no `://`, no control characters. Refused when it contains, as a whole word and ignoring case: rowhether, admin, administrator, moderator, support, official; or equals "former member" or "a rower" (labels the app uses). | Adults: wherever their contributions appear. Juniors: their clubs only (11.3). |
| Junior until | `users.junior_until` | ms when a junior account becomes adult (11.2). Null for adults. | The person; their guardians; their club admins see a "Junior" label (06). |
| Home location | `users.home_location_id` | A location `id` (01 records keep `id` even when the slug changes). Null allowed. | The person. |
| Units | `users.units` | `auto`, `us`, `uk` or `metric` (`uk` from 07 7.1; 08 K30). 07 defines what `auto` means. | The person. |
| Phone | `users.phone`, `users.phone_for_contacts` | E.164, optional. Shown on the status link to the person's emergency contacts only when `phone_for_contacts` is 1 (04 6.1). Guardians share theirs with club staff per club (`memberships.share_phone`, 06 5.2). Added by 08 (K42). | The person; their contacts and club staff as chosen. |
| Terms version | `users.terms_version`, `terms_at` | The version accepted, such as `2026-11-01`, and when. | The person; admins. |
| Site role | `users.site_role` | 10. | Admins; the person sees their own. |

Editing: name, home location and units on the Account page (`PATCH /api/me`), no recent sign-in needed. Email through 4.7. Birth month and year are never stored, so they cannot be edited; a junior who entered the wrong year writes to help@rowhether.com and an admin corrects `junior_until` (audit `user.age_corrected`). Users cannot edit it themselves, so a junior cannot switch off junior rules.

No public profile pages, no avatars, no bios, no follower lists.

Moderators can reset an offensive display name to "Rower" plus 4 digits (audit `user.name_reset`). The person sees "A moderator reset your name. Choose a new one." on next open.

## 8. Favorites

Favorites are the locations a person pins at the top of the picker (07 places them).

- Signed out: kept in this browser, `rowhether-favorites-v1` = `{ "ids": ["19fe7acb-..."], "t": <ms> }`, up to 50 location ids in order.
- Signed in: synced to `favorites` (15) as an ordered list with one `users.favorites_at` time. The whole list is last-writer-wins: `PUT /api/me/favorites` `{ "ids": [...], "updatedAt": <ms> }`; if the server's `favorites_at` is newer, it answers 409 `stale` with the server list and the client adopts it.
- First sign-in on a device: union, server order first, then local-only ids in local order, capped at 50.
- Ids, not slugs, so a renamed location keeps its favorite. 01 13.7 moves favorites to the survivor on a merge. An archived location stays in the list with 01's note "This location was archived."
- `location_id` has no foreign key in phase 2, because locations live in static files until phase 3 (01 7.1). The Worker checks ids against `/locations/index.json` through `env.ASSETS` in phase 2 and against D1 from phase 3.

Decision: Favorites work signed out, kept in the browser; an account only syncs them.
- Alternative: favorites need an account (simpler, but adds a reason to sign in that the principles avoid).

## 9. Settings sync

### 9.1 What syncs

| Item | Scope | Syncs | Why |
| --- | --- | --- | --- |
| Threshold overrides: `windCaution`, `windOff`, `gustCaution`, `gustOff`, `rainCaution`, `rainOff`, `coldCombined`, `flowCaution`, `flowOff`, `aqiCaution`, `aqiOff`, `streamCaution`, `streamOff`, `minLaunch`, `levelLow`, `levelHigh` (01 11.1) | Per location | Yes | The point of sync. Saved with `limitBasis`, the binding each flow, tide and level limit was set for (01 11.1), so a limit never meets a different gauge or unit. |
| `heading` (personal course heading, 01 8.6) | Per location | Yes | |
| `waterOverride` (dock water temperature reading) | Per location | Yes | Same person, same dock, any device. |
| `saved` (first time Settings was saved for this location) | Per location | Yes | Keeps the Settings reminder (`#setNudge`) hidden on every device. |
| `useClubRules` (01 11.7, phase 5) | Per location | Yes | |
| Plan a row choices (`minutes`, `when`) | Global, key `plan` | Yes | |
| Wind unit and clock (`windUnit`, `clock`), limit sets `set1` to `set6`, and per location `activeSet` (07 7.1, 8.4) | Global; `activeSet` per location | Yes | 08 7.5 lists every allowed key (K31). |
| Notification settings `{ quietFrom, quietTo, tz, emailFallback }` (05 4.4, phase 4) | Global, key `notify` | Yes | Written through 05's `PUT /api/me/notify/settings`. For juniors the Worker widens quiet hours to at least 10 PM to 6 AM for non-safety club messages (11.3). |
| Units, home location | Profile columns (7) | Yes | |
| Favorites | 8 | Yes | |
| Forecast cache, location record cache, recent list, last location | Device | No | Device state, not preferences. |
| Install bar choice, nudge dismissal, passkey offer, age gate | Device | No | About this browser. |
| Add a location draft (`rowhether-add-draft-v1`, 01 12.2) | Device | No | 01 saves server drafts. |

### 9.2 Storage

Server: `user_settings`, one row per user, scope and key (15). Scope is `global` or `loc:<location id>`. Value is JSON: a finite number, `""` (a level turned off, as today), an object for `plan`, or null (cleared, back to the location default). `updated_at` is the client's edit time; `server_at` is when the server stored it.

Allowed keys are listed once in `src/settings-keys.js` (new, pure) and imported by the app and the Worker (`worker/auth/settings.js`). Unknown keys answer 400 `invalid` with `"field"`. Limits: 40 keys per scope, 300 scopes per user, 200 changes per request, 64 KB body.

Client: 01 8.6 defines `rowhether-settings-v2` as `{ "<slug>": { "saved": <ms>, "values": {...} } }`. Phase 2 adds the location `id` and per-key edit times:

```json
{
  "putney-landing": {
    "id": "19fe7acb-de20-48c9-b25d-20d5e99d113a",
    "saved": 1760700000000,
    "values": { "windCaution": 12, "rainOff": "" },
    "t": { "windCaution": 1760700000000, "rainOff": 1760600000000, "gustOff": 1760650000000 }
  }
}
```

A key in `t` but not in `values` is a cleared override (a tombstone). Older entries without `t` count as edited at `saved`.

### 9.3 Conflict rule

Per key, last writer wins by `updated_at`.

- The server clamps `updated_at` to between `now - 400 days` and `now`, so a phone with a wrong clock cannot win forever.
- Equal times: the stored value stays.
- Why per key: two devices that change different limits both keep their change.

Decision: Per-key last writer wins, with a prompt only at first sign-in on a device (9.5).
- Alternative: the stricter of the two values always wins (safe, but surprising when someone deliberately loosened a limit).
- Alternative: whole-document last writer wins (one device's save erases another's unrelated change).

### 9.4 Pull and push

- Pull: `GET /api/me/settings?since=<server_at>` returns rows with `server_at > since`, plus `now` to use as the next `since`. Runs after the first render: at app start, when the page becomes visible, and with the 10-minute refresh (`REFRESH_MS`). Usually zero rows.
- Push: `PUT /api/me/settings` `{ "changes": [{ "scope", "key", "value", "updatedAt" }] }`. Each change applies if newer. The answer lists `stale` rows where the server had a newer value; the client adopts them.
- Applying a pulled or stale value updates `rowhether-settings-v2` and redraws with `render()` only if the open location's values changed.

### 9.5 First sign-in on a device

Runs after any sign-in where `rowhether-sync-v1.userId` is not this user (a first sign-in, or a different account than last time).

1. Pull everything (`since=0`).
2. Compare each scope and key:
   - Only on this device: push it.
   - Only in the account: apply it here.
   - Same value: nothing.
   - Different values: a conflict.
3. Favorites merge as in 8. Plan choices follow the settings rule.
4. If there are conflicts, one dialog:
   - Title: "Which settings should this device use?"
   - Body: "This device has different limits from your account for 2 locations."
   - Up to 5 lines, then "and 3 more": "Putney Landing: wind caution 12 mph here, 10 mph in your account." "Putney Landing: rain stay off turned off here, 90% in your account."
   - Note: "Your choice applies to these differences only. Everything else is combined."
   - Buttons: "Use my account's settings" (primary), "Keep this device's settings".
   - When the last user on this device was a different account, add: "These settings were saved by another account on this device."
5. The chosen side's values get `updatedAt = now` and are pushed or applied.
6. Write `rowhether-sync-v1` = `{ "userId", "since", "outbox": [] }`.

Why ask: these limits decide Go, Caution or Stay off. Silently replacing a stricter limit with a looser one is a safety problem.

### 9.6 Offline

- Every settings save writes `rowhether-settings-v2` at once (as `saveSettings()` does today) and adds the changed keys to `rowhether-sync-v1.outbox`, keeping only the latest entry per scope and key. At most 500 entries; beyond that the oldest are dropped (their values still live in `rowhether-settings-v2` and go up at the next full merge).
- The outbox is sent on the `online` event, when the page becomes visible, after each save, and with the 10-minute refresh.
- A 401 or `{ "user": null }` keeps the outbox. After the next sign-in it goes through 9.5.
- Reading settings never waits for the network. All of this is wrapped in try/catch like every storage access today.

### 9.7 Signing out and switching accounts

- Sign out clears `rowhether-sync-v1` (the outbox belongs to the account) and keeps local settings unless the person ticks the box (4.8).
- Another account signing in on the same device runs 9.5.
- Deleting the account clears every account key on that device (4.10).

## 10. Site roles

| Role | Who | Can |
| --- | --- | --- |
| `user` | Everyone with an account | Their own data; community actions per 01, 04, 05, 06 rules. |
| `moderator` | Appointed by an admin | 04's moderation queue (flags, hide or restore reports and hazards), 01's location actions (verify, archive, merge, approve suggestions), reset display names, issue suspensions up to 30 days. Cannot see email addresses, settings, outings, emergency contacts or anything private. |
| `admin` | The owner (and anyone the owner adds) | Everything a moderator can, plus: appoint and remove moderators and admins, suspend for any length or ban, delete accounts (for example a user found to be under 13), correct `junior_until`, view a user's email (logged), read the audit log, answer data requests. |

Rules:

- Moderator and admin powers work only in sessions with `auth_method = 'passkey'` (403 `passkey_session` "Moderator tools need a passkey sign-in."). A stolen email inbox can never reach them.
- Role changes, suspensions over 30 days, bans and account deletions by an admin also need a recent sign-in (10 minutes).
- Changing a role deletes every session of the changed user (5.4) and sends "Your RoWhether role changed".
- The first admin is set by the owner after signing up, with a one-off command run from their machine, so the owner's email never goes in the repo: `npx wrangler d1 execute DB --remote --command "UPDATE users SET site_role = 'admin' WHERE email = '<owner email>'"` plus an `audit_log` insert with `actor_role = 'system'` and `action = 'user.role_changed'`.
- Every moderator and admin action writes `audit_log` (14.2).

Club roles hook: club roles (06 5.1: admin, coach, safety officer, equipment manager, member, junior athlete, guardian) live on `memberships` and belong to 06-clubs.md. This doc provides the session (`getSession`) and the guard pattern; 06 adds `requireClubRole(session, clubId, roles)` in `worker/auth/guard.js` and the club-scoped `audit_log` entries (`kind = 'club'`). A site admin is not a club admin by default; site admins act on clubs only through moderation (04, 06).

## 11. Minors and safeguarding

### 11.1 Rules that apply

| Rule | What it says | What it means here | Status |
| --- | --- | --- | --- |
| COPPA (US) | Covers services directed to children under 13 or with actual knowledge of collecting from them. Amended rule effective June 23, 2025, compliance by April 22, 2026. Adds a written data retention policy (no indefinite retention, published in the notice), a written information security program, and separate consent for disclosures to third parties. | RoWhether is a general audience service. It refuses accounts under 13 and keeps no data about them. If it learns a user is under 13, it deletes the account. Even so, it keeps a written retention policy (12.1) and security program (14) because they are good practice. | Dates from law firm summaries via search (Alston, Jones Day, Toy Association), consistent with each other; FTC primary text not checked. Unverified as to exact wording. |
| FTC COPPA FAQ, neutral age screens | Ask age so a child can enter it accurately ("a system that allows a user freely to enter month and year of birth"); do not encourage falsifying it (no dropdown that starts at 13, no "I am over 12" box); a cookie can stop back-button retries. When a general audience operator learns a user is under 13 it must get parental consent or delete the information. | The age screen in 11.2. | verified live 2026-10-17 (https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions, FAQ H.3, A.12, H.6) |
| GDPR Art. 8 | When relying on consent for online services, 16 by default; member states may go as low as 13. | RoWhether does not rely on consent for core features (contract and legitimate interests, 12.6). Matters in phase 7 if any feature relies on consent. | verified live 2026-10-17 (https://gdpr-info.eu/art-8-gdpr/) |
| UK GDPR Art. 8 | 13. | As above. | verified live 2026-10-17 (https://www.legislation.gov.uk/eur/2016/679/article/8) |
| UK Children's code (ICO) | 15 standards for services likely to be accessed by children, including high privacy by default, data minimisation, geolocation off by default, parental controls, no nudge techniques. | Junior defaults in 11.3. Phase 7 for UK users; adopt the defaults from phase 2 anyway. | verified live 2026-10-17 (ico.org.uk code page) |
| Vermont Age-Appropriate Design Code (Act 63, S.69) | Takes effect January 1, 2027. Highest privacy defaults for minors (under 18), no collecting or sharing a minor's data beyond what the service needs, and no letting anyone, "including a parent or guardian", monitor a minor's activity or track their location "without providing a conspicuous signal" to the minor. Covers a business that, among other tests, "generates a majority of its annual revenue from online services" and whose service is reasonably likely to be accessed by minors. | RoWhether earns no revenue, so it is probably not a covered business (legal reading, unverified). The owner and the first users are in Vermont, so follow its rules anyway: junior defaults (11.3) and the guardian signal (11.5). | verified live 2026-10-17 (Act 63 as enacted and the Act summary, legislature.vermont.gov) |
| U.S. Center for SafeSport MAAPP (2025) | Applies to national governing bodies and their member clubs (USRowing and its clubs). Electronic communications between an Adult Participant and a Minor Athlete must be open and transparent: the adult "copies or includes the Minor Athlete's parent/guardian, another adult family member of the Minor Athlete, or another Adult Participant on every communication." Team messages must include parents or another Adult Participant too. "Only platforms that allow for Open and Transparent communication may be used to communicate with Minor Athletes." Parents may ask in writing that a minor not be contacted electronically, and clubs must honor it except in an emergency. No private social media connections with minors (except dual relationships or the close-in-age exception: no authority over the minor and not more than 4 years older). Effective January 1, 2025. | Product rules in 11.4. Clubs using RoWhether must be able to say the app is such a platform. | Quoted from the 2025 MAAPP text as published by USA Fencing, which carries the Center's model (https://maapp.uscenterforsafesport.org/wp-content/uploads/2022/01/Fencing_2025MAAPP_09.01.24.pdf), verified live 2026-10-17. The Center's own article (https://uscenterforsafesport.org/?p=8667) matches on copying another adult. USRowing's own text not checked (unverified). |

### 11.2 Age screen

Asked once, at account creation (4.1 step 6), of everyone: month and year of birth, free entry (a month select with no preset, a 4-digit year field). Nothing about the screen suggests an answer.

Computed on the server, conservatively (assuming the latest possible birthday in the month):

- `isUnder13`: `now < Date.UTC(birthYear + 13, birthMonth, 1)`, with `birthMonth` 1 to 12. JavaScript months count from 0, so passing the 1-based month gives the first day of the following month. Example: born October 2013, on October 17, 2026 the threshold is November 1, 2026, so the account is refused; on November 1 it would be allowed.
- `junior_until`: `Date.UTC(birthYear + 18, birthMonth, 1)` when that is after now, else null. Example: born April 2009, junior until May 1, 2027.
- Year must be between the current year minus 120 and the current year; month 1 to 12; else 400 `invalid`.
- The birth month and year are then discarded. Only `junior_until` is stored.

Under 13: refused (4.1 step 7). The server keeps nothing: the code row and ticket are deleted at once (the address was held for at most the code's few minutes, to answer the person's own request; legal review should confirm this reading). The browser keeps `rowhether-agegate-v1` for 24 hours, the local equivalent of the FTC's cookie suggestion.

Actual knowledge after sign-up: when a flag, a club admin or anyone tells moderators a user is under 13, an admin checks and deletes the account within 7 days (audit `user.deleted`, reason `under_13`). Flag reason "This person is under 13" exists in 04's flag reasons.

Decision: Ask month and year of birth from everyone at sign-up, store only `junior_until`.
- Alternative: ask only when someone joins a club as a junior (phase 5). Fewer questions, but COPPA actual-knowledge risk for any child who signs up before that, and no junior defaults for unaffiliated teens.
- Alternative: never ask; treat everyone as adult. Not compatible with the junior rules.

Decision: No accounts under 13 and no verifiable parental consent process.
- Alternative: build parental consent through a guardian account (cost, legal review, a new class of data). Revisit only if clubs ask.

### 11.3 Junior accounts (13 to 17)

Defaults while `now < junior_until`. A junior cannot change these; they lift automatically on the date.

| Setting | Junior | Adult |
| --- | --- | --- |
| Name shown to the public with reports, hazards, location edits | No: "A rower" | Yes |
| Name shown to members of their clubs | Yes | Yes |
| Public free text (report notes, hazard text, launch notes) | Held for review by a moderator before it shows. Choice-only reports and hazards show at once, without a name. | 04's rules |
| Photos (if 04 adds them) | Not allowed | Allowed, location data removed (12.2) |
| Add a location | No; "Suggest a location" saves a draft a moderator reviews (01 12.1) | 01's rules |
| Club messages | Only group broadcasts that meet 11.4 | n/a |
| Non-safety notifications from 10 PM to 6 AM in the club's time zone | Held until 6 AM | The person's choice (05) |
| Safety notifications (water closed, overdue boat, Stay off level weather alert) | Always | Always |
| Visible to linked guardians | Yes, with the signal in 11.5 | n/a |
| Export and delete own account | Yes; linked guardians are told | Yes |

On the day `junior_until` passes, the daily cleanup sets it to null, guardian links end (11.5), and the person sees once: "Your account is now an adult account. Your name now shows with your reports. Change this in Account."

Decision: Hold juniors' public free text for moderator review; choice-only contributions show at once without a name.
- Alternative: juniors post only choice-only content publicly (no free text).
- Alternative: juniors post like adults (least friction; most moderation risk).

Decision: Junior quiet hours 10 PM to 6 AM for non-safety notifications.
- Alternative: 9 PM to 7 AM. MAAPP does not set hours; some Canadian sport policies use 6 AM to 11 PM (from search, Freestyle Canada policy, 2026-10-17).

### 11.4 Communication rules (from MAAPP, for every phase)

These are requirements on 04, 05 and 06. They make RoWhether a platform where club communication with minors is open and transparent.

1. No private messages between users. No direct messages, no one-to-one chat, no comment threads that work as one. This holds for adults too, so there is no back door.
2. Club messages are broadcasts to a group: the whole club or one of its groups (06's announcements, section 15 there, and practice, lineup and water status notes). No replies anywhere (06 5.2).
3. Anything staff send that reaches a junior is visible to all of the club's staff and to that junior's guardians (06 5.2 rule 2). That meets MAAPP's "copy or include another Adult Participant, or all the Minor Athletes' parents/guardians" on two counts.
4. Edge case: a club whose only staff member is the sender, writing to a junior with no linked guardian, meets neither count. 06's send endpoint calls `audienceGuard()` (in `worker/auth/minors.js`), which refuses with 409 `needs_adult`: "Add a second coach or a safety officer to the club before messaging juniors. Messages to juniors must reach another adult." Roster-only juniors count through their `club_guardians` rows (06 4.5). `audienceGuard()` counts as another adult only a guardian whose `club_guardians.confirmed_at` is set (06 4.5), or a staff member of a verified club who is not the sender, has held the role for at least 7 days, and whose account is at least 30 days old; a second account made by the sender does not meet the rule.
5. The composer says who will see it: "Juniors' guardians and the club's staff see this message."
6. Juniors send no free text to adults in club features (06 5.2 rule 3).
7. Messages are kept for the club's safeguarding record. A sender can remove a message from view; it shows "Removed by the sender", and the original stays visible to the club's safety officers and the guardians who received it, for 1 year (06 may set longer with legal advice).
8. Junior quiet hours (11.3) for non-safety messages.
9. A guardian can turn off club notifications to their junior's devices, except overdue messages and a closed water status (`guardian_links.mute_nonsafety` here, 06 5.2 rule 5 there), and can ask that the club not message their junior directly (`guardian_links.discontinue`): club messages then reach the junior only through the guardian's copy. This is MAAPP's "request to discontinue" in product form.
10. No adult sees a junior's email or contact details. Club staff see the junior's name, the "Junior" label and the guardians' display names. Emergency contacts are 04's and no club staff member, safety officers included, ever sees them. During a club overdue escalation, staff reach a junior's family through the club's own guardian record (`club_guardians`, with the guardian's phone when the guardian chose to share it, 06 5.2 rule 8).
11. No following, friending or contact lists between users (MAAPP social media connections). The app has no social graph.
12. A junior's club outings are visible to the club's staff and, through the club, to their guardians. A junior's personal outings and float plans are seen by no one else unless the junior shares a row on purpose (11.5; 04 5.2). This is the one rule for who sees a junior's outings and contacts, and 04, 06 and 08 copy it: staff see club outings only, never personal outings or contacts; guardians see club outings through the club and shared rows; the guardian activity route and the board's guardian view return the same set of club outings, because both read `boardRow()` (06 8.4).

Where the rules live: `worker/auth/minors.js` exports `isJunior(user, now)`, `audienceGuard({ senderId, recipients, clubRoles, guardianLinks })` and `inQuietHours(tz, now)`. 06 calls them; tests in 20.

### 11.5 Guardian links (phase 5)

A guardian link joins an adult account (18 or older) to a junior account so the adult can see the junior's club activity. Up to 4 guardians per junior; up to 10 juniors per guardian.

How this fits 06:

- A junior account does not need a guardian link to exist. Without one, a junior can read, sync settings and post choice-only reports, under 11.3.
- Joining a club as a junior needs a linked guardian's approval: 06 keeps the membership `pending_guardian` until one approves (06 4.5). So every junior club member with an account has a guardian link.
- `guardian_links` (here) joins two accounts. 06's `club_guardians` joins a guardian to a junior membership, including roster-only juniors who have no account. When a linked junior joins a club, 06 creates `club_guardians` rows from the active `guardian_links`.
- 06 decides when a junior becomes an adult from `users.junior_until`. RoWhether stores no birth date (11.2).

Starting a link, from either side:

- Junior: Account, "Guardians", "Invite a parent or guardian", enter their email. The guardian gets an email: subject "Jamie asked you to link as their guardian", body "Jamie R. uses RoWhether with Putney Rowing Club and asked you to link as their parent or guardian. You will see Jamie's club messages, outings and attendance. Sign in or create an account at https://rowhether.com/account and enter this code: K7Q2-M9XD. It works for 7 days." The invite email is kept in `guardian_links.invite_email` until the link is accepted or expires.
- Guardian: Account, "Juniors", "Link to my rower" shows a code, valid 24 hours: "Give this code to Jamie. They enter it in Account, Guardians." The junior enters it.
- Club: a club admin sends the same invite from the roster (06), which records `initiated_by = 'club'` and `club_id`.

Codes: 8 characters from the Crockford base32 alphabet (no I, L, O or U), shown as two groups of 4, stored as an HMAC with `AUTH_PEPPER`, single use, 5 tries per account per hour.

Accepting needs a recent sign-in. Both people get an email and an in-app note. A guardian account must be at least 7 days old with a confirmed email (403 `not_allowed`). When one adult is linked to juniors in 3 or more different clubs, the Worker writes a `safeguarding` audit row and the owner digest flags it for a site admin to look at (08 10.7).

What a guardian sees, read-only, on Account, "Juniors", then the junior's name:

- Clubs and club roles.
- Copies of every club message the junior receives (11.4).
- Club outings, attendance and lineups, seen through the club (06). A junior's personal outings and float plans are not shown. The junior can share one row with a guardian on purpose, from the Start a row sheet or the row's menu ("Show this row to my guardians"), and a shared row shows on the guardian's page until 24 hours after it ends (04 5.2).
- Reports and hazards the junior posted.

A guardian can: turn off non-safety club notifications to the junior (`mute_nonsafety`), ask the club not to message the junior directly (`discontinue`, 11.4 rule 9), and end their own link. A guardian cannot read the junior's settings, sessions or security activity, and cannot delete the junior's account (they can write to help@rowhether.com).

The signal (Vermont Act 63, ICO parental controls standard): the junior always knows.

- Account page, top: "Alex P. (guardian) can see your club messages, club outings and attendance, and any row you share."
- On each screen whose content guardians can see (club messages, club outings, shared rows), a quiet line: "Your guardian can see this."
- An in-app note and email when a link starts or ends.

Ending a link:

- The junior, the guardian or a site admin (for example a wrong person or a court order) can end it. When a junior ends a link they give a reason (not my guardian, not comfortable, or other, with an optional note of up to 300 characters). The reason goes to site admins and, when the junior is in a club, to that club's safety officer; the guardian is told only that the link ended. Ending an account link does not end a parent's view of club communication: that comes through the club's own guardian record (`club_guardians`, 06 4.5), which a club admin confirms and the junior cannot end. A club admin cannot end a link but can flag it to site admins.
- It ends automatically at `junior_until` (`ended_reason = 'adult'`). 30 days before, both get: "On May 1, Jamie's account becomes an adult account and your guardian link ends."
- Account deletion on either side ends it (`deleted`).

Help for a junior who needs it: Account, "Guardians" has a "Get help" link to a page listing national reporting lines (U.S. Center for SafeSport, British Rowing safeguarding, Canada's Abuse-Free Sport helpline; the owner confirms the URLs before phase 5). RoWhether does not judge safeguarding cases.

Decision: Guardian links ship in phase 5 with clubs.
- Alternative: phase 3 with outings, so guardians can see a junior's float plans before clubs exist.

### 11.6 UK and Canada

- UK: British Rowing's 2026 Safeguarding Children and Young People Policy (a child is anyone under 18) says to "Avoid private one-to-one messaging with children wherever possible" and "Use approved communication platforms with appropriate oversight", and every affiliated club appoints a trained Club Welfare Officer (verified live 2026-10-17, britishrowing.org policy PDF). In phase 7, UK clubs get a "Club Welfare Officer" role alongside 06's safety officer (welfare and water safety are different jobs there), and it counts as staff for 11.4 rules 3 and 4.
- Canada: Rowing Canada Aviron and Row Ontario "strongly recommend the Rule of Two" for anyone in authority, in person or remotely (from search, Row Ontario Protection Policy, April 2026; RCA's own text unverified). Other Canadian sport policies apply it to messages: group messages or parents copied, set hours, and parents may refuse electronic contact (from search, 2026-10-17). 11.4 already meets these.
- Under 18 is a "child" or "minor" in all three countries for safeguarding purposes. The junior rules key on under 18 everywhere.

### 11.7 Under-13 rowers in clubs

Some clubs run learn-to-row for 11 and 12 year olds. They get no accounts. 06 can let a club admin add "roster-only" members (a name entered by an adult, no contact details, no login) for attendance and lineups, with a parent or guardian holding an adult account and linked through the club. That is information from the club's adults, not collected from a child online; legal review must confirm before phase 6.

## 12. Privacy

### 12.1 Data inventory

| Data | Why | Where | Kept | Who can see |
| --- | --- | --- | --- | --- |
| Settings, favorites, recent locations, Plan a row, forecast cache (signed out) | The app works without an account | The browser's `localStorage` | Until cleared | Only that browser |
| Email address | Sign in, account notices | `users.email` (D1) | Life of the account | The person; admins (logged) |
| Display name | Shown with contributions and in clubs | `users` | Life of the account | Adults: where it appears. Juniors: their clubs |
| Junior status (`junior_until`) | Junior rules | `users` | Until 18, then cleared | The person, guardians, club admins (label) |
| Month and year of birth | Age screen | Not stored | Discarded at once | No one |
| Home location, units | Defaults | `users` | Life of the account | The person |
| Passkey public keys, names, dates | Sign in | `passkeys` | Until removed | The person (names and dates) |
| Login codes and the address they went to | Sign in | `login_codes` (HMAC of the code) | 24 hours | No one |
| Session device label, country, times | Security, "Where you're signed in" | `auth_sessions` | Until sign out, or 180 days idle | The person |
| Synced settings, favorites | Sync | `user_settings`, `favorites` | Life of the account | The person |
| Security activity (sign-ins, passkey and email changes, exports) | Account security | `audit_log`, kind `security` | 1 year | The person, admins |
| Moderator and admin actions | Accountability | `audit_log`, kinds `admin`, `moderation` | 3 years | Admins |
| Guardian links | Safeguarding | `guardian_links` | While active; ended links 1 year | The junior, the guardian, admins |
| Banned address hashes | Keep banned people out | `email_blocks` | 1 year | Admins |
| Reports, hazards, votes (04) | Conditions for everyone | 04's tables | 04 decides | Public (reporter names are never shown, 04) |
| Daily-keyed hash of the IP for signed-out reports (`reports.ip_hash`, 04) | Daily report cap for signed-out reporters | `reports` | Set to null after 30 days (04) | No one; cannot be linked across days and holds no raw IP |
| Outings, float plans, row log, emergency contacts (04) | Safety, personal log | 04's tables | 04 decides | The person; guardians; club safety officers and emergency contacts on overdue |
| Push subscriptions, alert rules, notification log (05) | Alerts | 05's tables | 05 decides | The person |
| Club memberships, roles, attendance, bookings, lineups, messages, damage reports, incidents (06) | Club operations | 06's tables | 06 decides | The club, per 06 |
| Suggestions | Improve the app | Sent to Anthropic for a rewrite, then filed as an issue in the GitHub repository `NeverNathaniel/RoWhether`, which is public (verified live 2026-10-17) | Anthropic: 30 days (privacy center, via search); GitHub: until deleted | Public |
| Request logs: URL, IP, user agent, console output | Operations, abuse | Cloudflare Workers Logs (`observability.enabled` in `wrangler.jsonc`) | 3 days on Free, 7 days on Paid (from docs, https://developers.cloudflare.com/workers/observability/logs/workers-logs/); 7 days on both from December 1, 2026, when Workers Logs moves to Observability pricing (from docs, https://developers.cloudflare.com/observability/pricing/) | The owner |
| Turnstile signals | Spam check | Cloudflare | Cloudflare's terms (unverified) | Cloudflare |
| Data requests from the browser | Forecasts | Open-Meteo, NWS, USGS, NOAA and others (02) receive the viewer's IP and the location's coordinates (not the viewer's) | Their policies | Those services |

This table, with the retention column, is the written retention policy. The privacy notice publishes it (13.3).

Never logged by the Worker: session tokens, codes, tickets, link tokens, request bodies of `/api/auth/*` and `/api/me/*`, email addresses. `console.log` calls in `worker/auth/*` log error codes only.

### 12.2 Precise location

- The app never asks for the browser's location on its own. 07's "Near me" in the picker asks only when tapped, rounds to 2 decimals (about 1 km) in the browser before calling `GET /api/locations?near=...`, and stores nothing. Rounding before the request keeps precise coordinates out of request logs.
- Reports, hazards and outings attach to a location id, never to raw GPS. If 04 wants proof someone is at the dock, the browser computes it and sends only one word (`"geo": "near"`, `far` or `unknown`, by 04 3.4's rule: within 1,500 m plus the reading's accuracy, accuracy no worse than 1,000 m), not coordinates.
- No live tracking of boats in any phase.
- Photos (if 04 adds them): location metadata (EXIF GPS) is stripped before storage.
- Home location is a location id, not an address.

Decision: No live boat tracking in any phase.
- Alternative: opt-in tracking during an outing, deleted 24 hours after sign-in, with a conspicuous signal (needed for juniors under Vermont Act 63). Revisit with 04 and clubs.

### 12.3 Analytics

Decision: No analytics product and no tracking of people. 08 10.9 adopts the second alternative below, one aggregate open counter (07 14.3), once the owner confirms (08 K32).
- Alternative: Cloudflare Web Analytics. It is free, uses no cookies or `localStorage` and does not fingerprint by IP or user agent (from docs, https://developers.cloudflare.com/web-analytics/data-metrics/core-web-vitals/ and https://developers.cloudflare.com/web-analytics/about/), but it loads a beacon script from a Cloudflare host at runtime, which the "no runtime loads from third-party CDNs" hard constraint rules out without a second exception.
- Alternative: aggregate counters in the Worker (for example sign-ins per day) with no personal data.

Workers observability already gives request counts and errors for the API.

### 12.4 Cookies and local storage

- `__Host-rw_session`, strictly necessary for sign-in, and on a paired club boathouse screen only, `rw_kiosk` (06 8.5), strictly necessary for that screen. No consent banner, because it is essential (ePrivacy and UK PECR exempt strictly necessary storage; legal reading, unverified).
- `CF_Authorization`: set by Cloudflare Access on `/admin*` for the owner only (3.7).
- Turnstile: whether it sets cookies is unverified; it runs only on the forms that need it: suggestions, sign in, email change, guardian invites, signed-out reports and the status link.
- `localStorage` keys, all functional: 01's set (`rowhether-settings-v2`, `rowhether-cache-v2:<slug>`, `rowhether-loc-v1:<slug>`, `rowhether-last-v1`, `rowhether-recent-v1`, `rowhether-plan-v1`, `rowhether-install-v1`, `rowhether-nudge-v1`, `rowhether-migrated-v1`) plus this doc's:

| Key | Content |
| --- | --- |
| `rowhether-me-v1` | `{ "id", "displayName", "siteRole", "junior": false, "fetchedAt" }`. Lets the header show the name at once; revalidated with `GET /api/me` after the first render. No email. |
| `rowhether-sync-v1` | `{ "userId", "since", "outbox": [...] }` (9). |
| `rowhether-favorites-v1` | `{ "ids": [...], "t" }` (8). |
| `rowhether-passkey-offer-v1` | ms of the last passkey offer on this device (4.3). |
| `rowhether-agegate-v1` | ms of an under-13 refusal (11.2). |

01 8.6 step 7 deletes the old `putney-rowing-*` keys in phase 2.

### 12.5 Processors and third parties

| Party | Role | Data | Terms to check |
| --- | --- | --- | --- |
| Cloudflare | Processor: hosting, Workers, D1, Workers Logs, Turnstile, Email Service, Access | Everything stored server-side; request metadata | Cloudflare DPA and SCCs (unverified in this doc) |
| Resend (only if chosen in 3.5) | Processor: email | Email addresses, email content | DPA with SCCs, US processing (verified live 2026-10-17) |
| Anthropic | Processor: rewrites suggestion text (`worker/claude.js`) and screens public free text: hazard notes and launch notes (04 8.6), club descriptions (06 3.2) and public water status notes (06 7.4) | Suggestion text, app context for bugs, the text being screened with the location name | API inputs and outputs deleted within 30 days by default, longer if flagged (privacy.claude.com, via search 2026-10-17) |
| GitHub | Recipient: suggestions become public issues | The rewritten and original text, app context for bugs | Users are told before sending (17.4 copy) |
| Open-Meteo, NWS, USGS, NOAA, other agencies (02) | Independent services the browser calls | The viewer's IP; the location's coordinates | Listed in the privacy notice; no personal data sent on purpose |
| Open-Meteo geocoding and Photon (komoot) (02) | Independent services the browser calls for place search | What the person types in a search box, and their IP | Named in the privacy notice. Search text can name a home town or a club |
| OpenFreeMap (02, 07 10.4) | Independent service the browser calls for map tiles, on the picker map and `/add` only | The viewer's IP and the map area shown, which can reveal roughly where they are looking or standing | Named in the privacy notice. The add flow's map does not start at the device's exact position (01 12.3) |
| Apple, Google, Mozilla and Microsoft push services (05 2.1) | Recipients: they carry each Web Push message | Each device's push endpoint, and the timing and size of every notification. The text is encrypted (RFC 8291) | Named in the privacy notice when notifications arrive (phase 4) |
| Calendar services such as Google, Apple and Microsoft (06 14.1) | Recipients: they fetch the private calendar feed a person subscribes with | Practice times, places and the person's own seat, and for a guardian their junior's practice times | Named in the privacy notice (phase 6). The link says so |

The suggestion dialog gets one line: "Your suggestion becomes a public GitHub issue. Do not include personal details."

### 12.6 Laws and what they ask

| Law | Applies when | RoWhether today | Plan |
| --- | --- | --- | --- |
| GDPR and UK GDPR | Offering services to people in the EU or UK | Phase 7 targets them; some may use it sooner | Lawful bases: contract (account, sync, alerts the person sets up), legitimate interests (security logs, abuse prevention, safety escalation), legal obligation. Self-serve access, export, correction and deletion. Respond to other requests within one month, extendable by two months with notice (Art. 12(3), verified live 2026-10-17, gdpr-info.eu). Breach notice to the authority within 72 hours where there is risk (Art. 33(1), verified live 2026-10-17). Before phase 7: check whether an EU and UK representative (Art. 27) is needed (unverified). |
| CCPA (California) | A for-profit business with over $26,625,000 annual gross revenue (since January 1, 2025, verified live 2026-10-17, cppa.ca.gov), or buying, selling or sharing data of 100,000 or more consumers, or half its revenue from selling data | Not covered (no revenue, no selling or sharing) | Honor the same rights anyway. No selling or sharing, ever. |
| PIPEDA (Canada) | Commercial activity | Probably not covered while non-commercial (legal reading, unverified) | Follow it from phase 7: report breaches that create a "real risk of significant harm" and notify those affected as soon as feasible; keep a record of every breach for two years (verified live 2026-10-17, priv.gc.ca). |
| COPPA | 11.1 | General audience, no under-13 accounts | 11.2. |
| Vermont Act 63 | 11.1 | Probably not covered | Follow its design rules (11.3, 11.5). |
| US state breach laws (Vermont first) | Personal information as each state defines it | Email plus nothing sensitive | Notification timing per state; Vermont's timing unverified. Legal review lists them. |

### 12.7 Data requests

- Self-serve: export (4.11), delete (4.10), correct (Account page), stop processing (delete, or unsubscribe from alerts in 05).
- By email to help@rowhether.com for anything else (a question about what is held, a guardian asking about a junior, someone without access to their account). The owner answers within one month. Identity check: the request must come from the account's address, or be confirmed by a code sent to it.
- A request log kept by the owner outside D1 (date, type, outcome, no copies of data), 2 years.

### 12.8 Breach response

1. Contain. Set the Worker var `AUTH_ENABLED` to `"0"`: `/api/auth/*` answers 503 `accounts_off` and `/api/info` says `accounts: false`. End every session: `npx wrangler d1 execute DB --remote --command "DELETE FROM auth_sessions"`. Rotate affected secrets (14.3).
2. Assess within 24 hours: what data, whose, how many, which countries, whether it was encrypted or hashed.
3. Notify as the law requires: the UK ICO or the relevant EU authority within 72 hours where there is risk; Canada's Privacy Commissioner and affected people where there is real risk of significant harm; US states per their laws; affected clubs (06), because they may have their own duties. Notice to people in plain words: what happened, what data, what we did, what they should do.
4. Record every breach, notified or not, in the owner's breach register outside D1, kept at least 2 years (PIPEDA).
5. Review within 2 weeks and fix the cause.

### 12.9 Account deletion cascade

`deleteUser(env, userId, reason)` in `worker/auth/delete.js` runs every statement below in one `env.DB.batch()`. A batch is one SQL transaction: if a statement fails, the whole sequence rolls back (from docs, https://developers.cloudflare.com/d1/worker-api/d1-database/). Statements are explicit, even where a foreign key cascade would do the same, so the test (20) can check each table.

| Table | Doc | Action | Why |
| --- | --- | --- | --- |
| `users` | 03 | Delete | The account. |
| `passkeys` | 03 | Delete | Sign-in data. |
| `auth_challenges` | 03 | Delete | Transient. |
| `login_codes` | 03 | Delete rows with this `user_id` or this email | Transient. |
| `auth_sessions` | 03 | Delete | Signs out everywhere. |
| `user_settings` | 03 | Delete | Personal. |
| `favorites` | 03 | Delete | Personal. |
| `guardian_links` | 03 | Set `status = 'ended'`, `ended_reason = 'deleted'`, clear this user's id from the row | The other person sees the link ended; nothing about the deleted person remains. |
| `email_blocks` | 03 | Keep | Not linked to the account; only for bans. |
| `audit_log` | 03 | Delete `kind = 'security'` rows with this `subject_user_id`. Other rows: set `actor_user_id` and `subject_user_id` to null, keep `actor_label` ("Former moderator") | Security history is the person's; moderation history is accountability. |
| `locations` | 01 | Set `created_by`, `verified_by` to null | Shared record other rowers use. |
| `waterways` | 01 | Set `created_by` to null | Shared. |
| `location_sources` | 01 | Set `created_by` to null | Shared. |
| `location_revisions` | 01 | Set `user_id`, `decided_by` to null; keep `summary` and `changes` | History of a shared record. Shown as "By a former member". |
| `reports` | 04 | Set the user column to null; delete free-text notes and photos | Choice data still helps tune thresholds; text and photos are the person's own words and images. |
| `hazards` | 04 | Reassign `created_by` to the former member row (below); hide the note, as 04 specifies | A live safety warning others rely on. `created_by` is NOT NULL in 04's schema. |
| `hazard_votes` | 04 | Delete | Personal signal; counts recomputed. |
| `outings` | 04 | Delete the person's personal outings and row log. Club sign-out board rows: set the user to null, keep boat, times and crew count | Personal log is theirs; the club keeps a record of boat use. |
| `outing_crew` | 04 | Delete this person's crew rows | Others' outings stay, showing "Former member" in the crew. |
| `emergency_contacts` | 04 | Delete | Third parties' data held for this person. |
| `push_subscriptions` | 05 | Delete | Device endpoints. |
| `notify_prefs` | 05 | Delete | Personal. |
| `notify_log` | 05 | Delete | Personal history. |
| `clubs` | 06 | Set the creator to null. If the person was the last admin, run 06's succession (06 3.6) in the same batch | A club outlives its founder. |
| `memberships` | 06 | Keep the row: `user_id` null, `display_name` "Former member", status `left` (06 4.6) | Past attendance, lineups and board history stay readable. Personal fields on the row (phone sharing, notes) are cleared. |
| `invites` | 06 | Delete invites sent by or to this person that are still pending; set the inviter to null on accepted ones | |
| `club_rules` | 06 | Set the author to null | Club record. |
| `water_status` | 06 | Set the setter to null | Club safety history ("Closed by a former member"). |
| `boats` | 06 | Set the creator to null | Club property. |
| `bookings` | 06 | Delete future bookings; set the user to null on past ones | Frees boats; keeps usage history. |
| `practices` | 06 | Set the creator to null | Club schedule. |
| `attendance` | 06 | Keep past rows (they point at the "Former member" membership); delete future RSVPs | The club's record of who rowed; no name remains. |
| `lineups` | 06 | Remove the person from future seats; past seats show "Former member" | Others' history stays readable. |
| `announcements` and other club notes (06 section 15) | 06 | Remove the person's announcements from view; the safeguarding copy stays for its retention with the sender set to null | 11.4 rule 7. |
| `damage_reports` | 06 | Set the reporter to null; keep the report | Boat safety history. |
| `incidents` | 06 | Set the user columns to null; keep the record for its retention period | Safety and possible legal record. Decision below. |
| `flags` | 04 | Flags raised by the person: set the reporter to null. Flags about the person's deleted content: close as `content_deleted` | Moderation history. |

Free text the person wrote inside shared records (location launch notes, revision summaries) stays, without their name. Hazard notes are hidden (04). The deletion page says so (4.10).

The former member row. Some docs keep an author column NOT NULL (04's `hazards.created_by`). For those, the accounts migration seeds one placeholder user that can never sign in:

```sql
INSERT OR IGNORE INTO users (id, email, email_verified_at, display_name, junior_until, site_role,
  webauthn_handle, home_location_id, units, favorites_at, terms_version, terms_at,
  suspended_until, suspended_reason, created_at, updated_at)
VALUES ('00000000-0000-4000-8000-000000000000', 'former-member@rowhether.invalid', 0, 'Former member', NULL, 'user',
  'AAAAAAAAAAAAAAAAAAAAAA', NULL, 'auto', 0, '0000-00-00', 0,
  253402300799000, 'placeholder', 0, 0);
```

It has no passkeys, its address is on the reserved `.invalid` domain so no code can reach it, and it is suspended until year 9999. `FORMER_MEMBER_ID` in `worker/auth/delete.js` names it. Columns that allow null use `ON DELETE SET NULL` instead; the placeholder is only for NOT NULL author columns. Every list, export and count skips this id.

Foreign keys: D1 enforces foreign keys by default (from docs, https://developers.cloudflare.com/d1/sql-api/foreign-keys/), and `ON DELETE CASCADE` and `ON DELETE SET NULL` are supported (same page). A plain `REFERENCES users(id)` with no `ON DELETE` action means deleting the user fails while any row points to them. 01-locations.md 5 declares `created_by`, `verified_by`, `user_id` and `decided_by` that way. 08 must add `ON DELETE SET NULL` to every shared-record reference to `users(id)` and `ON DELETE CASCADE` to every personal one, so that a deletion that misses a table fails safe in tests rather than silently leaving data. Cascade behavior was checked with SQLite 3.50.4 in Node 22.22 (`PRAGMA foreign_keys = ON`, child row deleted), verified live 2026-10-17.

Backups: deleted data remains in D1 Time Travel history for up to 30 days on Workers Paid (7 on Free) (from docs, https://developers.cloudflare.com/d1/reference/time-travel/). The privacy notice and the deletion email say "within 30 days". A restore from Time Travel must re-run deletions made after the restore point; the owner keeps the list of `user.deleted` audit rows for that (no identities, just times, 14.5).

Decision: Keep `incidents` with names removed, for a retention period 06 sets with legal advice (suggest 7 years for incidents involving minors).
- Alternative: delete incident rows with the person (loses a safety record the club may be required to keep).

Decision: Delete free-text notes and photos from reports on account deletion, keep the choices without a name.
- Alternative: keep report text without a name, like hazards.

## 13. Terms, disclaimer and legal review

### 13.1 Terms of use outline

1. Who runs RoWhether and how to reach us (help@rowhether.com).
2. Who can have an account: 13 or older. Under 18 with a parent's or guardian's permission.
3. Information only: the safety disclaimer (13.2), in full.
4. Your account: one person per account, no shared logins (clubs use club roles), keep your email and devices secure, tell us about misuse.
5. What you post (reports, hazards, locations, edits, club content): it must be accurate as far as you know, and yours to share. You give RoWhether permission to show, adapt (for example convert units) and keep it, without your name after you leave (12.9). License for location data: Decision below.
6. Community rules (13.4), and that moderators may hide content and suspend accounts.
7. Clubs: club admins are responsible for their club's rules, members and the information they enter about members. Club rules are the club's, not RoWhether's.
8. Safety features (sign-out board, float plans, overdue alerts) are a backup. They can be late or fail. They do not replace a launch, a buddy, a coach, or calling 911 or your local emergency number.
9. Data from other services (02): credits, and that their terms apply.
10. No warranty. Limits on liability. The service may change or stop.
11. Ending: you can delete your account at any time; we may suspend or end accounts that break these terms.
12. Changes to the terms: notice in the app (4.13) at least 14 days before material changes take effect.
13. Governing law and where disputes are heard.
14. Contact.

Decision: Vermont law governs the terms.
- Alternative: no governing-law clause until a lawyer advises.

Decision: License community location data openly (for example ODbL or CC BY-SA, matching any OpenStreetMap-derived data 01 and 02 use), so the list can outlive the project.
- Alternative: RoWhether keeps a non-exclusive license only (simpler, less useful to clubs).

### 13.2 Safety disclaimer draft

Shown on `/terms`, on `/about`, linked from the sign-up screen, and in short form in the footer (which already says "Thresholds are starting points, not club rules.").

> RoWhether gathers weather, water and river data in one place and checks it against limits that you or your club set. Go, Caution and Stay off are what that data says against those limits. They are information, not permission.
>
> You, your coach and your club decide whether to go out. Forecasts and gauges can be wrong or late, and conditions on the water change fast. Look at the water before you launch. Follow your club's rules and local regulations, and wear what your program requires.
>
> Off the water at the first thunder, and back on 30 minutes after the last.
>
> Sign-out boards, float plans and overdue alerts are a backup. They can fail. In an emergency, call 911 or your local emergency number.

Short form for the footer: "Information only. You, your coach and your club decide. Look at the water before you launch."

### 13.3 Privacy notice outline

Layered: a short summary at the top, then the detail.

1. Summary: "No account needed for forecasts. If you make one, we keep your email, a display name and your settings. We do not sell data, show ads or track you. We count how often the app opens at each location, with nothing that identifies you."
2. What we collect and why: 12.1 as a table.
3. Where it is stored and who processes it: 12.5, every row, with what each receives and why.
4. How long we keep it: 12.1 retention column (this is the published retention policy).
5. Who can see what, including club admins and guardians (11.5).
6. Children and juniors: 11.2 and 11.3.
7. Location: 12.2.
8. Cookies and local storage: 12.4.
9. Your rights and how to use them: 12.7.
10. Security: 14 in brief.
11. Changes and contact.

### 13.4 Community rules (account level)

04 owns moderation. The rules every account agrees to:

- Report what you saw, honestly. No false reports or hazards.
- No personal details about other people. No photos of people (if 04 allows photos at all).
- No harassment, hate, threats or sexual content.
- No ads, links for promotion or spam.
- Do not try to contact juniors outside club broadcasts.
- One account per person.

### 13.5 Legal review

Decision: Have a lawyer review the terms, the privacy notice and the minors approach (11.2, 11.3, 11.5, 11.7) before phase 2 ships, and again before phase 5 (clubs with juniors) and phase 7 (EU, UK, Canada). Cost unverified.
- Alternative: use a reputable template for phase 2 and review only before phase 5 (faster; more risk with juniors signing up in phase 2).

## 14. Security

### 14.1 Account takeover defenses

| Threat | Defense |
| --- | --- |
| Phishing | Passkeys cannot be phished (bound to the RP ID). Code emails say no one will ask for the code. |
| Guessing codes | 6 digits, 10 minutes, 5 tries per code, 10 per address per hour, per-connection limits, Turnstile (6). |
| Stolen inbox | Email codes give user-level sessions only; moderator and admin powers need a passkey session (10). Passkey and email changes need a recent sign-in and send notices. |
| Email change by an attacker | Old address gets a 7-day undo link that also ends every session and removes new passkeys (4.7). |
| Stolen session cookie | `HttpOnly`, `Secure`, `__Host-`; hashed at rest; sessions list with revoke; sign out everywhere; 180-day idle expiry. |
| Cross-site request forgery | 5.6. |
| Cross-site scripting | Text is escaped with `esc()` from `src/format.js` as today; a Content Security Policy (14.4). |
| Clickjacking | `frame-ancestors 'none'` (14.4). |
| Session fixation | New token at every sign-in (5.4). |
| Database leak | Session tokens and codes stored only as hashes or HMACs; no passwords exist. |
| Lost device | Passkeys need the device's screen lock; sign out the device from another (4.6). |

### 14.2 Audit log

`audit_log` (15). One row per event, `action` in `area.verb` form:

| Kind | Actions (this doc) | Retention |
| --- | --- | --- |
| `security` | `auth.signin` (method, device label, country), `auth.passkey_added`, `auth.passkey_removed`, `auth.email_changed`, `auth.email_reverted`, `auth.signout_all`, `data.export` | 1 year; deleted with the account |
| `admin` | `user.role_changed`, `user.suspended`, `user.unsuspended`, `user.banned`, `user.deleted` (no identity kept), `user.age_corrected`, `user.email_viewed`, `guardian.ended_by_admin` | 3 years |
| `moderation` | `user.name_reset`, plus 01's and 04's actions (`location.verify`, `report.hide` and so on) | 3 years |
| `club` | 06's | 06 decides |
| `safeguarding` | `guardian.linked`, `guardian.ended`, 06's message removals | 06 and legal review decide; suggest 7 years |

The person sees their last 20 `security` rows on the Account page ("Oct 17, 7:42 PM. Passkey added on Safari on iPhone."). Admins see everything at `/admin/audit`.

Decision: Keep admin and moderation audit rows 3 years.
- Alternative: 1 year (less data; shorter memory for repeat abuse).

### 14.3 Secrets and config

Worker secrets (Cloudflare dashboard, never in the repo or `wrangler.jsonc`):

| Secret | Status | Use |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Existing | Suggestion rewrite. |
| `GITHUB_TOKEN` | Existing | Issue filing. |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Existing | Spam checks, now also action `auth`. |
| `AUTH_PEPPER` | New, phase 2 | 32 random bytes, base64. HMAC key for login codes, link tokens, guardian codes and `email_blocks`. Rotating it voids outstanding codes (minutes) and existing blocks (acceptable). |
| `RESEND_API_KEY` | Only if Resend is chosen (3.5) | |

Others own: `VAPID_PRIVATE_KEY` (05), `OPEN_METEO_KEY` (02).

New vars (not secret): `AUTH_HOSTS` (`rowhether.com`), `AUTH_ENABLED` (`"1"`; every flag is `"1"` or `"0"`, 08 6.3), `EMAIL_FROM` (`RoWhether <signin@rowhether.com>`), `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `TERMS_VERSION` (`2026-11-01`).

New bindings: `EMAIL` (`send_email`), `AUTH_LIMIT`, `CODE_LIMIT`, and a production `DB` (D1), which production does not have yet.

Rotation: every secret yearly, and at once after any suspected exposure. The owner's Cloudflare and GitHub accounts use passkeys or hardware keys.

### 14.4 Headers

`public/_headers` sets only caching today. Add, for every path (08 finalizes):

```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src 'self' https://api.open-meteo.com https://air-quality-api.open-meteo.com https://api.weather.gov https://api.waterdata.usgs.gov https://api.water.noaa.gov; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'
  Referrer-Policy: strict-origin-when-cross-origin
  X-Content-Type-Options: nosniff
  Permissions-Policy: geolocation=(self), camera=(), microphone=()
```

`connect-src` must list every data host 02 adds. 08 10.11 keeps the header hand-written and adds a test that fails when an adapter's host is missing (K64). Whether Vite's build needs `'unsafe-inline'` for styles is unverified; test with the built app.

### 14.5 Backups

- D1 Time Travel: restore to any minute in the last 30 days on Workers Paid, 7 days on Free; `wrangler d1 time-travel info` gives a bookmark and `wrangler d1 time-travel restore DB --timestamp=<unix>` restores in place (from docs, https://developers.cloudflare.com/d1/reference/time-travel/).
- Before every migration: `wrangler d1 time-travel info DB` and record the bookmark in the pull request.
- No extra exports holding personal data. If the owner wants one, an encrypted `wrangler d1 export` kept no longer than 30 days, so deletion promises hold.
- After a restore: re-apply account deletions made after the restore point, using `user.deleted` audit rows (times only) and the owner's request log.

Decision: Move the account to Workers Paid ($5 a month) when phase 2 starts: 30-day Time Travel, Email Service, more CPU per request (up to 5 minutes, default 30 seconds, against 10 ms on Free; from docs, https://developers.cloudflare.com/workers/platform/limits/).
- Alternative: stay on Workers Free (7-day Time Travel, Resend for email, 10 ms CPU per request; passkey verification CPU time on Free is unverified).

### 14.6 Dependencies

- Exact pins (CLAUDE.md). New runtime dependencies: `@simplewebauthn/server` 14.0.3, `@simplewebauthn/browser` 14.0.0, `jose` 6.2.12 (3.7).
- Watch SimpleWebAuthn security advisories on GitHub; upgrade within a week for anything that touches the paths used (registration and authentication with `none` attestation).

## 15. D1 schema

Proposed for 08, which assigns migration numbers. Conventions follow `migrations/0001_reports.sql`: TEXT ids from `crypto.randomUUID()`, INTEGER ms times. Phase 2 tables in `migrations/00NN_accounts.sql`, phase 5 in `migrations/00NN_guardians.sql`.

```sql
-- Accounts. Phase 2.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,                                   -- crypto.randomUUID()
  email TEXT NOT NULL UNIQUE
    CHECK (length(email) BETWEEN 6 AND 254 AND email = lower(email) AND email = trim(email)
           AND email GLOB '?*@?*.?*' AND email NOT GLOB '*[ ]*'),
  email_verified_at INTEGER NOT NULL,                    -- every account starts from a verified code
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 2 AND 40),
  junior_until INTEGER,                                  -- ms; null for adults (11.2)
  site_role TEXT NOT NULL DEFAULT 'user' CHECK (site_role IN ('user', 'moderator', 'admin')),
  webauthn_handle TEXT NOT NULL UNIQUE CHECK (length(webauthn_handle) = 22), -- 16 random bytes, base64url
  home_location_id TEXT,                                 -- locations.id; no FK while locations are static (8)
  units TEXT NOT NULL DEFAULT 'auto' CHECK (units IN ('auto', 'us', 'uk', 'metric')), -- 'uk': 08 K30
  favorites_at INTEGER NOT NULL DEFAULT 0,               -- last change to the favorites list (8)
  terms_version TEXT NOT NULL CHECK (length(terms_version) = 10), -- 'YYYY-MM-DD'
  terms_at INTEGER NOT NULL,
  suspended_until INTEGER,
  suspended_reason TEXT CHECK (suspended_reason IS NULL OR length(suspended_reason) <= 300),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS users_role ON users (site_role) WHERE site_role <> 'user';
CREATE INDEX IF NOT EXISTS users_junior ON users (junior_until) WHERE junior_until IS NOT NULL;

CREATE TABLE IF NOT EXISTS passkeys (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 1400), -- credential id, base64url
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,                              -- COSE public key, base64url
  counter INTEGER NOT NULL DEFAULT 0 CHECK (counter >= 0),
  transports TEXT CHECK (transports IS NULL OR json_valid(transports)),
  device_type TEXT NOT NULL CHECK (device_type IN ('singleDevice', 'multiDevice')),
  backed_up INTEGER NOT NULL CHECK (backed_up IN (0, 1)),
  aaguid TEXT CHECK (aaguid IS NULL OR length(aaguid) = 36),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);
CREATE INDEX IF NOT EXISTS passkeys_user ON passkeys (user_id);

-- One row per WebAuthn ceremony. Deleted when used or expired (5 minutes).
CREATE TABLE IF NOT EXISTS auth_challenges (
  id TEXT PRIMARY KEY,                                   -- challengeId sent to the client
  purpose TEXT NOT NULL CHECK (purpose IN ('register', 'authenticate', 'reauth')),
  challenge TEXT NOT NULL CHECK (length(challenge) BETWEEN 32 AND 128), -- base64url; 43 chars today
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  CHECK (purpose = 'authenticate' OR user_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS auth_challenges_expiry ON auth_challenges (expires_at);

CREATE TABLE IF NOT EXISTS login_codes (
  id TEXT PRIMARY KEY,                                   -- codeId
  purpose TEXT NOT NULL CHECK (purpose IN ('signin', 'reauth', 'change_email', 'revert_email')),
  email TEXT NOT NULL CHECK (length(email) BETWEEN 6 AND 254), -- where it was sent; old address for revert_email
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL CHECK (length(code_hash) = 64), -- HMAC-SHA256(AUTH_PEPPER, id:code), hex
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'verified', 'used', 'dead', 'replaced')),
  ticket_hash TEXT CHECK (ticket_hash IS NULL OR length(ticket_hash) = 64), -- signup ticket, SHA-256
  expires_at INTEGER NOT NULL,                           -- code: +10 min; ticket: +30 min; revert: +7 days
  created_at INTEGER NOT NULL,
  verified_at INTEGER,
  CHECK (purpose = 'signin' OR user_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS login_codes_email ON login_codes (email, created_at);
CREATE INDEX IF NOT EXISTS login_codes_created ON login_codes (created_at);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,                                   -- shown to the client for revoking
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64), -- SHA-256 of the cookie token, hex
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  auth_method TEXT NOT NULL CHECK (auth_method IN ('passkey', 'code')),
  auth_at INTEGER NOT NULL,                              -- last proof of identity (recent sign-in)
  device TEXT CHECK (device IS NULL OR length(device) <= 60),
  country TEXT CHECK (country IS NULL OR length(country) = 2),
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_sessions_user ON auth_sessions (user_id, last_seen_at);
CREATE INDEX IF NOT EXISTS auth_sessions_expiry ON auth_sessions (expires_at);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope = 'global' OR (scope GLOB 'loc:?*' AND length(scope) <= 68)),
  key TEXT NOT NULL CHECK (length(key) BETWEEN 1 AND 32 AND key NOT GLOB '*[^A-Za-z0-9]*'),
  value TEXT CHECK (value IS NULL OR (json_valid(value) AND length(value) <= 500)), -- null: cleared
  updated_at INTEGER NOT NULL,                           -- client edit time, clamped (9.3)
  server_at INTEGER NOT NULL,                            -- when stored; drives ?since pulls
  PRIMARY KEY (user_id, scope, key)
);
CREATE INDEX IF NOT EXISTS user_settings_pull ON user_settings (user_id, server_at);

CREATE TABLE IF NOT EXISTS favorites (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL,                             -- locations.id; FK once locations are in D1
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 49),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, location_id)
);
CREATE INDEX IF NOT EXISTS favorites_location ON favorites (location_id);

CREATE TABLE IF NOT EXISTS email_blocks (
  email_hmac TEXT PRIMARY KEY CHECK (length(email_hmac) = 64), -- HMAC-SHA256(AUTH_PEPPER, email)
  reason TEXT NOT NULL CHECK (reason IN ('banned')),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL                            -- +1 year
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('security', 'admin', 'moderation', 'club', 'safeguarding')),
  action TEXT NOT NULL CHECK (length(action) BETWEEN 3 AND 48 AND action GLOB '?*.?*'),
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('user', 'moderator', 'admin', 'club', 'system')),
  actor_label TEXT CHECK (actor_label IS NULL OR length(actor_label) <= 60), -- kept after the actor is deleted
  subject_user_id TEXT REFERENCES users(id) ON DELETE SET NULL, -- whose account it concerns
  target_type TEXT CHECK (target_type IS NULL OR length(target_type) <= 32),
  target_id TEXT CHECK (target_id IS NULL OR length(target_id) <= 64),
  club_id TEXT,                                          -- clubs.id for club entries (06)
  detail TEXT CHECK (detail IS NULL OR (json_valid(detail) AND length(detail) <= 4000)),
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_log_subject ON audit_log (subject_user_id, kind, at);
CREATE INDEX IF NOT EXISTS audit_log_at ON audit_log (kind, at);
CREATE INDEX IF NOT EXISTS audit_log_club ON audit_log (club_id, at) WHERE club_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS audit_log_expiry ON audit_log (expires_at);

-- Guardians. Phase 5 (needs clubs from 06).

CREATE TABLE IF NOT EXISTS guardian_links (
  id TEXT PRIMARY KEY,
  junior_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  guardian_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  invite_email TEXT CHECK (invite_email IS NULL OR length(invite_email) BETWEEN 6 AND 254), -- pending email invites only
  code_hash TEXT CHECK (code_hash IS NULL OR length(code_hash) = 64), -- pending link code, HMAC
  code_expires_at INTEGER,
  initiated_by TEXT NOT NULL CHECK (initiated_by IN ('junior', 'guardian', 'club')),
  club_id TEXT REFERENCES clubs(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'ended')),
  ended_reason TEXT CHECK (ended_reason IS NULL OR ended_reason IN ('guardian', 'junior', 'admin', 'adult', 'deleted', 'expired')),
  end_reason TEXT CHECK (end_reason IS NULL OR end_reason IN ('not_my_guardian', 'not_comfortable', 'other')), -- given by a junior who ends the link
  end_note TEXT CHECK (end_note IS NULL OR length(end_note) <= 300),
  mute_nonsafety INTEGER NOT NULL DEFAULT 0 CHECK (mute_nonsafety IN (0, 1)),
  discontinue INTEGER NOT NULL DEFAULT 0 CHECK (discontinue IN (0, 1)), -- 11.4 rule 9
  created_at INTEGER NOT NULL,
  accepted_at INTEGER,
  ended_at INTEGER,
  CHECK (status <> 'active' OR (junior_user_id IS NOT NULL AND guardian_user_id IS NOT NULL)),
  CHECK (status <> 'ended' OR ended_reason IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS guardian_links_pair ON guardian_links (junior_user_id, guardian_user_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS guardian_links_junior ON guardian_links (junior_user_id, status);
CREATE INDEX IF NOT EXISTS guardian_links_guardian ON guardian_links (guardian_user_id, status);
```

Notes:

- `passkeys.id` length: WebAuthn credential ids are up to 1,023 bytes (about 1,364 base64url characters) per the WebAuthn spec (from memory, unverified); 1,400 leaves room.
- Public keys are base64url TEXT, as in the workerd test (3.3), rather than BLOB, to avoid relying on D1's binary binding details.
- Single use of a challenge or code: read and update or delete in one `batch()` (a transaction). `DELETE ... RETURNING` works in SQLite 3.35 and later; D1 support for `RETURNING` is unverified, so the plan does not rely on it.
- If 08 moves `locations` into D1 before phase 2, add `REFERENCES locations(id)` to `users.home_location_id` (`ON DELETE SET NULL`) and `favorites.location_id` (`ON DELETE CASCADE`). SQLite cannot add a foreign key to an existing column without rebuilding the table, so decide before the first accounts migration.

## 16. API

Same origin, JSON. Errors are `{ "error": "code", "message": "Human sentence." }`, as `worker/reports.js` does. Every response from these routes has `Cache-Control: no-store`. Phase 2 unless noted.

### 16.1 Shared errors

| Status | `error` | `message` |
| --- | --- | --- |
| 400 | `invalid` (with `"field"`) | Depends on the field, for example "Use 2 to 40 characters for your name." |
| 401 | `sign_in` | "Sign in to do that." (the code 04 and 06 use; 08 K46) |
| 403 | `bad_origin` | "That request came from another site." |
| 403 | `recent_auth` | "Confirm it's you first." (client opens 4.12, then retries) |
| 403 | `passkey_session` | "Moderator tools need a passkey sign-in." |
| 403 | `suspended` | "Your account is paused until November 1, so you cannot post." |
| 403 | `not_allowed` | "You cannot do that." |
| 403 | `verification_failed` | "The spam check did not pass. Try again." (same text as the suggestion form) |
| 404 | `accounts_off` | "Accounts are not available here." |
| 415 | `bad_type` | "Send JSON." |
| 429 | `rate_limited` | "Too many tries. Wait a minute and try again." |
| 503 | `accounts_off` | "Sign-in is paused. Try again later." (`AUTH_ENABLED` is `"0"`) |

### 16.2 Sign in

`POST /api/auth/code`

```json
{ "email": "sam@example.com", "purpose": "signin", "turnstile": "<token>" }
```

200 for any well-formed address:

```json
{ "codeId": "4f1c...", "expiresAt": 1760741520000, "resendAfter": 30 }
```

`purpose` is `signin` or `reauth` (with a session; no `email`, no `turnstile`). Errors: 400 `bad_email` "Check the email address.", 403 `verification_failed`, 429 `rate_limited`, 429 `too_many_codes` "Too many codes for that address. Wait an hour, or use a passkey."

`POST /api/auth/code/verify`

```json
{ "codeId": "4f1c...", "code": "482913" }
```

- 200 existing account (sets the cookie): `{ "status": "signed_in", "user": { ... } }` (user shape in 16.4)
- 200 new address: `{ "status": "new_account", "ticket": "<43 chars>", "ticketExpiresAt": 1760743020000 }`
- 200 reauth: `{ "status": "confirmed" }` (rotates the cookie)
- 400 `wrong_code` `{ "error": "wrong_code", "message": "That code is not right. 3 tries left.", "attemptsLeft": 3 }`
- 410 `expired` "That code has expired. Send a new one."
- 429 `too_many_tries` "Too many wrong codes. Send a new code."

`POST /api/auth/signup`

```json
{ "ticket": "<43 chars>", "displayName": "Sam R.", "birthMonth": 4, "birthYear": 1990,
  "homeLocation": "19fe7acb-de20-48c9-b25d-20d5e99d113a", "terms": "2026-11-01" }
```

- 201 (sets the cookie): `{ "user": { ... } }`
- 403 `too_young` "You need to be 13 or older for an account."
- 403 `blocked` "This address cannot make an account." (banned, 6.5)
- 409 `terms_changed` with the current `TERMS_VERSION` (the client re-shows the fine print)
- 410 `ticket_expired` "That took too long. Start again."
- 400 `invalid` with `"field"`

`POST /api/auth/passkey/options`

```json
{ "purpose": "authenticate" }
```

200: `{ "challengeId": "...", "options": { "challenge": "...", "rpId": "rowhether.com", "timeout": 300000, "userVerification": "required", "allowCredentials": [] } }`. With `"purpose": "reauth"` (needs a session) the options list the user's passkeys in `allowCredentials`.

`POST /api/auth/passkey/verify`

```json
{ "challengeId": "...", "response": { "id": "...", "rawId": "...", "type": "public-key", "response": { "...": "..." } } }
```

- 200 (sets the cookie): `{ "user": { ... } }`, or `{ "status": "confirmed" }` for reauth
- 400 `passkey_failed` "That passkey did not work. Try again, or sign in with an email code."
- 404 `unknown_passkey` with `"credentialId"` "This passkey is no longer on your account."
- 410 `expired` "That took too long. Try again."
- 403 `suspended` (only after verification)

`POST /api/auth/signout` 200 `{ "ok": true }` (clears the cookie; fine without a session).

`POST /api/auth/signout-all` 200 `{ "ok": true, "ended": 3 }`.

`POST /api/auth/revert` `{ "token": "<43 chars>" }` 200 `{ "ok": true }`; 410 `expired` "That link has expired."

### 16.3 Info

`GET /api/info` adds `"accounts": true | false` (5.7).

### 16.4 Me

`GET /api/me`

```json
{
  "user": {
    "id": "8c0e...", "displayName": "Sam R.", "email": "sam@example.com",
    "siteRole": "user", "junior": false, "juniorUntil": null,
    "homeLocation": { "id": "19fe7acb-de20-48c9-b25d-20d5e99d113a", "slug": "putney-landing" },
    "units": "auto", "passkeys": 2, "termsVersion": "2026-11-01", "termsCurrent": true,
    "suspendedUntil": null, "createdAt": 1760700000000
  },
  "session": { "id": "a71b...", "authMethod": "passkey", "recentAuth": false }
}
```

Signed out: 200 `{ "user": null }`.

`PATCH /api/me` `{ "displayName"?, "homeLocation"?, "units"? }` 200 `{ "user": { ... } }`.

`POST /api/me/terms` `{ "version": "2026-11-01" }` 200.

### 16.5 Sign-in methods and sessions

| Route | Body | Answer | Notes |
| --- | --- | --- | --- |
| `GET /api/me/passkeys` | | `{ "passkeys": [{ "id", "name": "iPhone (synced)", "synced": true, "createdAt", "lastUsedAt" }] }` | |
| `POST /api/me/passkeys/options` | `{}` | `{ "challengeId", "options" }` | Recent sign-in, except within 10 minutes of sign-up |
| `POST /api/me/passkeys` | `{ "challengeId", "response", "name"? }` | 201 `{ "passkey": { ... } }` | 409 `too_many` |
| `PATCH /api/me/passkeys/:id` | `{ "name" }` | 200 | 1 to 40 characters |
| `DELETE /api/me/passkeys/:id` | | 200 `{ "ok": true, "left": 1 }` | Recent sign-in. Removing the last passkey is allowed; for moderators and admins the answer adds `"warning": "Moderator tools need a passkey."` |
| `GET /api/me/sessions` | | `{ "sessions": [{ "id", "device", "country", "authMethod", "createdAt", "lastSeenAt", "current": true }] }` | |
| `DELETE /api/me/sessions/:id` | | 200 | Ending the current one also clears the cookie |
| `POST /api/me/email` | `{ "email", "turnstile" }` | 200 `{ "codeId", "expiresAt" }` | Recent sign-in |
| `POST /api/me/email/verify` | `{ "codeId", "code" }` | 200 `{ "user" }` | 409 `email_taken` |
| `GET /api/me/activity` | | `{ "events": [{ "at", "action", "device" }] }` | Last 20 security events |

### 16.6 Settings, favorites, export, delete

`GET /api/me/settings?since=1760700000000`

```json
{ "now": 1760741000000,
  "settings": [
    { "scope": "loc:19fe7acb-de20-48c9-b25d-20d5e99d113a", "key": "windCaution", "value": 12, "updatedAt": 1760700000000 },
    { "scope": "loc:19fe7acb-de20-48c9-b25d-20d5e99d113a", "key": "rainOff", "value": "", "updatedAt": 1760600000000 },
    { "scope": "global", "key": "plan", "value": { "minutes": 90, "when": "morning" }, "updatedAt": 1760500000000 }
  ] }
```

`PUT /api/me/settings`

```json
{ "changes": [
  { "scope": "loc:19fe7acb-de20-48c9-b25d-20d5e99d113a", "key": "gustOff", "value": null, "updatedAt": 1760741000000 }
] }
```

200 `{ "now": 1760741000500, "applied": 1, "stale": [] }`. `stale` lists `{ scope, key, value, updatedAt }` where the server's value was newer.

`GET /api/me/favorites` 200 `{ "updatedAt": 1760700000000, "locations": [{ "id", "slug", "name" }] }`.

`PUT /api/me/favorites` `{ "ids": ["19fe7acb-..."], "updatedAt": 1760741000000 }` 200 `{ "updatedAt": ... }`; 409 `stale` with the server's list; 400 `invalid` for over 50 ids or an unknown id.

`GET /api/me/export` (recent sign-in, once per 10 minutes) 200, `Content-Type: application/json`, `Content-Disposition: attachment; filename="rowhether-data-2026-10-17.json"`:

```json
{
  "format": "rowhether-export-1",
  "exportedAt": 1760741000000,
  "account": { "id": "8c0e...", "email": "sam@example.com", "displayName": "Sam R.", "junior": false,
               "homeLocation": "putney-landing", "units": "auto", "siteRole": "user",
               "termsVersion": "2026-11-01", "createdAt": 1760700000000 },
  "passkeys": [{ "name": "iPhone (synced)", "createdAt": 1760700000000, "lastUsedAt": 1760740000000 }],
  "sessions": [{ "device": "Safari on iPhone", "country": "US", "createdAt": 1760700000000, "lastSeenAt": 1760740000000 }],
  "securityActivity": [{ "at": 1760700000000, "action": "auth.passkey_added", "device": "Safari on iPhone" }],
  "settings": [{ "location": "putney-landing", "key": "windCaution", "value": 12, "updatedAt": 1760700000000 }],
  "favorites": ["putney-landing"],
  "reports": [], "hazards": [], "outings": [], "emergencyContacts": [],
  "notifications": { "subscriptions": [], "rules": [] },
  "clubs": [], "attendance": [], "bookings": [], "guardianLinks": []
}
```

Each later doc adds its section through a registry: `worker/auth/export.js` imports `exportSections`, and each module (04, 05, 06) exports `exportFor(env, userId)` returning its key and rows. Public keys, hashes and other people's data are never included.

`GET /api/me/delete` 200 `{ "blockers": [{ "kind": "open_outing", "outingId": "..." }], "notes": [{ "kind": "sole_club_admin", "club": { "slug", "name" } }, { "kind": "guardian_link", "name": "Jamie R." }] }`. Read only; no recent sign-in needed.

`POST /api/me/delete` `{ "confirm": "delete" }` (recent sign-in) 200 `{ "deleted": true }` (clears the cookie). 409 `open_outing` `{ "outingId" }` "You have a boat signed out. Sign it in first."; 400 `confirm` "Type delete to confirm."

### 16.7 Guardians (phase 5)

| Route | Who | Body | Answer |
| --- | --- | --- | --- |
| `POST /api/me/guardians/invite` | Junior | `{ "email", "turnstile" }` | 201 `{ "linkId", "expiresAt" }` |
| `POST /api/me/guardian-code` | Adult | `{}` | 201 `{ "code": "K7Q2-M9XD", "expiresAt" }` |
| `POST /api/me/guardians/accept` | Either | `{ "code" }` | 200 `{ "link": { "id", "junior", "guardian" } }`; 400 `wrong_code`; 403 `not_allowed` "Guardians must be 18 or older." |
| `GET /api/me/guardians` | Either | | `{ "guardians": [{ "linkId", "name", "since" }], "juniors": [{ "linkId", "userId", "name", "juniorUntil", "muteNonSafety", "discontinue" }] }` |
| `PATCH /api/me/juniors/:linkId` | Guardian | `{ "muteNonSafety"?, "discontinue"? }` | 200 |
| `DELETE /api/me/juniors/:linkId` | Guardian | | 200 (ends the link) |
| `DELETE /api/me/guardians/:linkId` | Junior | `{ "reason", "note"? }`, `reason` being `not_my_guardian`, `not_comfortable` or `other` | 200 (ends the link, `ended_reason` `junior`; the guardian is told only that it ended) |
| `GET /api/me/juniors/:userId/activity?before=` | Guardian | | Club messages, club outings, attendance, shared rows, reports; composed from 04 and 06 |

Recent sign-in for accept, end and changes.

### 16.8 Admin

All need `site_role = 'admin'`, a passkey session, and Cloudflare Access (3.7). Starred routes also need a recent sign-in.

| Route | Body | Notes |
| --- | --- | --- |
| `GET /api/admin/users?q=` | | Search by display name, or an exact email. Each search with `q` writes `user.email_viewed` when emails appear in results. |
| `GET /api/admin/users/:id` | | Includes email; logs `user.email_viewed`. |
| `POST /api/admin/users/:id/role` * | `{ "role": "moderator" }` | Ends the user's sessions. |
| `POST /api/admin/users/:id/suspend` | `{ "until": 1762000000000, "reason": "..." }` | Over 30 days or a ban: * |
| `POST /api/admin/users/:id/unsuspend` | `{ "reason" }` | |
| `POST /api/admin/users/:id/delete` * | `{ "reason": "under_13" }` | `reason` is `under_13`, `abuse` or `request`. Runs 12.9. |
| `POST /api/admin/users/:id/age` * | `{ "juniorUntil": 1803000000000, "reason" }` | `juniorUntil` is ms or null (adult). Section 7. |
| `GET /api/admin/audit?kind=&before=&limit=` | | Max 100 per page. |

Moderators get `POST /api/mod/users/:id/name-reset` and `POST /api/mod/users/:id/suspend` (up to 30 days); 04 owns the rest of `/api/mod/*` (the queue and the report exports), and 06 the club review routes.

## 17. UI

### 17.1 Entry points

- Header: one text button, "Sign in" when signed out, the person's first name when signed in (from `rowhether-me-v1`, so it shows on the first frame). It opens the sign-in dialog or `/account`. 07 4.3 places it at the right of the title row, and Refresh stays a text button; the header buttons stay on one row at 360 px (CLAUDE.md test; 08 K61).
- Settings dialog, top line: signed out, "Saved in this browser. Sign in to keep these settings on all your devices." with a "Sign in" link; signed in, "Saved to your account, Sam R." Hidden when `/api/info` says `accounts: false`.
- Footer: links to Privacy, Terms and About.

### 17.2 Sign-in dialog

`<dialog id="signin" aria-labelledby="signinTitle">` in `index.html`, next to `#settings`, `#report`, `#suggest` and `#install`. One dialog with steps (start, code, create account, too young, add a passkey, merge), each a `<section>` shown one at a time; the heading changes with the step and takes focus (`tabindex="-1"`, as `#setTitle` does). Copy is in 4.1 to 4.3 and 9.5. A "Close" button on every step. Errors appear under the field they belong to, tied with `aria-describedby`, and are announced with `role="alert"`.

### 17.3 Confirm it's you

A small `<dialog id="reauth">` with the 4.12 copy. It opens on 403 `recent_auth`, and the original request is retried once after success.

### 17.4 Account page

Route `/account` (a path route like `/add`; 07 owns the shell). Opening line: "Signed in as Sam R., sam@example.com." Sections, each a surface panel (CLAUDE.md design system):

1. Profile: Name (Edit), Home location (Change), Units (Auto, US, Metric), Email (Change email).
2. Sign-in methods: one row per passkey, "iPhone (synced). Added Oct 17, last used today." with Rename and Remove. Button "Add a passkey". Line: "You can always sign in with a code sent to your email."
3. Where you're signed in: "Safari on iPhone, United States. This device." "Chrome on Windows, United States. Last used Oct 12." with Sign out. Button "Sign out everywhere". The lost phone line from 4.6.
4. Guardians or Juniors (phase 5, 11.5), with the signal line at the top of the page for juniors.
5. Recent security activity: the last 10 events, "Show more" for 20.
6. Your data: "Download my data", "Delete account". Links to the Privacy notice and Terms.
7. "Sign out" at the bottom.

Times on this page use the home location's time zone, or America/New_York when there is none, with the zone named once at the top ("Times in Eastern").

Suggestion dialog addition (12.5): "Your suggestion becomes a public GitHub issue. Do not include personal details."

### 17.5 Accessibility and performance

- Native `<dialog>`, labeled fields, visible focus, `autocomplete` tokens (`username webauthn`, `one-time-code`, `email`), `inputmode="numeric"` for codes. The code field accepts paste. No time limit forces a restart while typing; the code screen says how long it works.
- Respect reduced motion; no animation needed.
- Performance: `src/auth.js`, `src/account.js` and `@simplewebauthn/browser` load with dynamic `import()` on first use. The main bundle gains only a small stub: the header button, `rowhether-me-v1` read, and `GET /api/me` scheduled after the first render (with `requestIdleCallback` where available, else a zero-delay `setTimeout` after `render()`). Settings pulls (9.4) run after the forecast fetch completes, never before.

## 18. Code changes by phase

| Phase | File | Change |
| --- | --- | --- |
| 0 | `worker/turnstile.js` | `verifyTurnstile(env, token, ip, action)`; `worker/suggest.js` passes `'suggest'`. No visible change. |
| 1 | Cloudflare Access | Application for `/admin*` and `/api/admin/*` (3.7). |
| 1 | `worker/auth/access.js` (new) | `requireAccess(request, env)` validates `Cf-Access-Jwt-Assertion` with `jose`. |
| 2 | `package.json` | Add `@simplewebauthn/server` 14.0.3, `@simplewebauthn/browser` 14.0.0, `jose` 6.2.12; `engines.node` to `>=22`. |
| 2 | `wrangler.jsonc` | Production `d1_databases` (`DB`); `send_email` binding `EMAIL`; `AUTH_LIMIT`, `CODE_LIMIT` in both the top level and `previews`; vars `AUTH_HOSTS`, `AUTH_ENABLED`, `EMAIL_FROM`, `TERMS_VERSION`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`; Previews `AUTH_PEPPER` with its own dev value (08 6.5). |
| 2 | `migrations/00NN_accounts.sql` | 15, phase 2 tables. |
| 2 | `worker/index.js` | Origin and content type checks for non-GET `/api/*` (5.6); routes `/api/auth/*`, `/api/me*`, `/api/admin/*`, `/api/mod/*`; `getSession` once per request; `info()` adds `accounts`. |
| 2 | `worker/auth/session.js` | `getSession`, `startSession`, `endSession`, `cookie()`, `clearCookie()`, renewal, rotation. |
| 2 | `worker/auth/codes.js` | `makeCode`, `hashCode`, `startCode`, `verifyCode`, per-address limits. |
| 2 | `worker/auth/passkeys.js` | Options and verify for register, authenticate and reauth, using `@simplewebauthn/server`; RP settings from 3.4. |
| 2 | `worker/email.js` (08 K18: shared by 03, 04, 05 and 06) | `sendEmail(env, { to, subject, text, html })` over the `EMAIL` binding (or Resend); templates from 3.6; the local console fallback. 05 and 06 call the same function. |
| 2 | `worker/auth/guard.js` | 5.5 guards. |
| 2 | `worker/auth/signup.js` | Age computation (11.2), user creation. |
| 2 | `worker/auth/settings.js`, `src/settings-keys.js` | Sync endpoints and the shared allowed-key list. |
| 2 | `worker/auth/export.js`, `worker/auth/delete.js`, `worker/auth/audit.js` | 16.6, 12.9, 14.2. |
| 2 | `worker/admin.js` | 16.8. |
| 2 | `index.html` | `#signin` and `#reauth` dialogs; header account button; Settings top line; footer links. |
| 2 | `src/auth.js` (new, lazy) | Sign-in dialog steps, passkey calls, Turnstile loading, merge dialog. |
| 2 | `src/account.js` (new, lazy) | The `/account` page. |
| 2 | `src/sync.js` (new) | `me` cache, pull, push, outbox, first sign-in merge (9). |
| 2 | `src/storage.js` | New keys (12.4); `t` map in `rowhether-settings-v2`; favorites helpers; delete `putney-rowing-*` keys (01 8.6 step 7). All guarded with try/catch. |
| 2 | `src/settings.js` | After `saveSettings(next)`, call `sync.queue(changes)`; the account line. |
| 2 | `src/route.js` | `/account` path route; `/account/revert` page. |
| 2 | `src/suggest.js` | The public issue line (12.5). |
| 2 | `public/_headers` | 14.4. |
| 2 | Static pages | `/privacy`, `/terms`, `/about` (07 decides format). |
| 3 | `worker/auth/minors.js` | `isJunior`, junior rules for 04 content. Moderator role in use. |
| 3 | `worker/auth/delete.js`, `export.js` | 04's tables. |
| 4 | same | 05's tables; quiet hours helper used by 05. |
| 5 | `migrations/00NN_guardians.sql`, `worker/auth/guardians.js` | 11.5, 16.7; `audienceGuard` used by 06. |
| 5, 6 | `worker/auth/delete.js`, `export.js` | 06's tables. |
| 7 | Privacy and terms | GDPR, UK GDPR and PIPEDA details; UK "Club Welfare Officer" label; translations later. |

CLAUDE.md updates (owner approval, as for every CLAUDE.md edit): the Turnstile exception (6.3), the Worker routes list, the new secrets, the no private messages rule, and `localStorage` keys.

## 19. Costs

| Item | Cost | Status |
| --- | --- | --- |
| Workers Paid | $5 a month minimum per account | from docs (https://developers.cloudflare.com/workers/platform/pricing/, updated Oct 2, 2026) |
| Email (Cloudflare Email Service) | 3,000 a month included with Workers Paid, then $0.35 per 1,000 | from docs (3.5) |
| D1 | Paid includes 25 billion rows read and 50 million rows written a month, 5 GB storage. Free: 5 million reads, 100,000 writes a day, 5 GB | from docs (https://developers.cloudflare.com/d1/platform/pricing/, updated Apr 21, 2026) |
| Turnstile | Already in use for suggestions | |
| Cloudflare Access | Zero Trust Free; seat limit unverified | 3.7 |
| Apple Developer Program (only if Sign in with Apple) | $99 a year | verified live 2026-10-17 |
| Legal review | Unverified | 13.5 |

Rough load (estimate): 1,000 accounts opening the app twice a day is about 2,000 `GET /api/me` plus 2,000 settings pulls, around 10,000 rows read a day and under 1,500 writes a day (session renewals, settings saves). Far inside both plans' D1 allowances.

## 20. Tests

`npm test` (Vitest) must keep passing, and `npm run build` and `npx wrangler deploy --dry-run` too (CLAUDE.md).

### 20.1 Test database

The existing `fakeDB()` in `test/reports.test.js` records SQL but runs none. Accounts need real constraints and cascades. Add `test/helpers/d1.js`: a small D1-shaped wrapper (`prepare().bind().all()/first()/run()`, `batch()` in a transaction) over `node:sqlite` `DatabaseSync` with `PRAGMA foreign_keys = ON`, loading every file in `migrations/`. `node:sqlite` exists in Node 22.22 (SQLite 3.50.4), enforces `ON DELETE CASCADE` with the pragma, and supports `json_valid` (verified live 2026-10-17); it prints an ExperimentalWarning in Node 22. Alternative: `@cloudflare/vitest-pool-workers` (0.23.0 on npm, verified live 2026-10-17; compatibility with the repo's Vitest 5.0.2 unverified).

### 20.2 Unit and Worker tests (new files under `test/`)

`test/auth-codes.test.js`

- `makeCode` gives 6 digits; rejection sampling stays under 4,294,000,000; a large sample has no digit bias beyond tolerance.
- `hashCode` uses the code id; the same code under two ids gives different hashes.
- Verify: right code signs in; wrong code decrements `attemptsLeft`; sixth try is `too_many_tries`; after 10 minutes `expired`; an earlier code is `replaced` by a newer one.
- Per-address limits: second request within 30 s, sixth in an hour, eleventh in a day are refused, with the same message for known and unknown addresses.
- Response body and status are identical for a known and an unknown address.
- `ctx.waitUntil` receives the send; the handler does not await it.

`test/auth-session.test.js`

- The `Set-Cookie` string matches 5.1 exactly, including `__Host-`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/` and `Max-Age=15552000`.
- D1 holds the SHA-256 of the token, never the token.
- Renewal writes at most once per 24 hours; idle expiry at 180 days; absolute expiry at 400 days; `Max-Age` shrinks near the absolute limit.
- Sign-in deletes a pre-existing session row (fixation).
- Sign out deletes the row and clears the cookie; sign out everywhere deletes all rows for the user only.
- `GET /api/me` signed out answers 200 `{ "user": null }`.
- The 31st session deletes the least recently seen.
- Role change deletes all the user's sessions.

`test/auth-csrf.test.js`

- `POST` without `Origin`, or with another origin, answers 403 `bad_origin` on every `/api/*` write route, including the existing `/api/reports` and `/api/suggest`.
- `text/plain` body answers 415.
- No `/api/*` response carries `Access-Control-Allow-Origin`.

`test/auth-passkeys.test.js`

- Move the synthetic authenticator from the earlier experiment (CBOR attestation object, ES256 key, `packed` and `none` formats, built with `@levischuck/tiny-cbor` as a dev dependency pinned exactly) into `test/helpers/authenticator.js`.
- Register then authenticate end to end through the Worker handlers.
- Wrong challenge, reused challenge (deleted after first use), expired challenge, wrong origin, wrong RP ID, and a credential of another user for reauth are all rejected.
- Counter rule: 0 then 0 accepted; 5 then 3 rejected.
- `excludeCredentials` lists existing passkeys; the eleventh passkey answers 409.

`test/auth-signup.test.js`

- Under 13 by the conservative rule (born October 2013, on October 17, 2026) is refused, and afterwards no row in any table holds the email.
- Born November 2013 refused; born September 2013 allowed on October 17, 2026.
- `junior_until` for April 2009 is May 1, 2027 UTC; adults get null.
- Year out of range and month 0 or 13 answer 400.
- Display name rules and reserved words.
- An address in `email_blocks` answers 403 `blocked`.

`test/sync.test.js` (client, pure functions in `src/sync.js`)

- Per-key last writer wins; ties keep the stored value; future times clamp to now.
- Tombstones clear a value and win over an older value.
- Outbox keeps one entry per key; 501st entry drops the oldest.
- First sign-in merge: only local pushes, only server applies, equal does nothing, conflicts produce the dialog list; each button applies the right side; a different previous user adds the note.
- Favorites union order and the 50 cap; 409 `stale` adopts the server list.
- Every storage access survives a throwing `localStorage`.

`test/auth-settings.test.js` (Worker)

- Unknown keys and scopes answer 400; values over 500 characters answer 400.
- `since` returns only newer rows; `stale` lists newer server rows.

`test/auth-delete.test.js`

- Seed one user with rows in every table that exists at that phase (03 now; 01, 04, 05, 06 tables as they land), run `deleteUser`, and assert each table's outcome from the 12.9 table, row by row.
- Another user's rows are untouched.
- An open outing blocks with 409. Being the only admin of a club does not block; 06's succession runs in the same batch, and with no eligible member the club gets a moderator flag.
- With foreign keys on, a table that references `users(id)` without an `ON DELETE` action makes the test fail (guards 08's schema).

`test/auth-export.test.js`

- The export holds every section in 16.6, includes no hashes or public keys, and nothing of a second user seeded alongside.

`test/minors.test.js`

- `audienceGuard`: the only staff member of a club writing to a junior with no guardian is refused; a second staff member or a linked guardian (account or `club_guardians`) makes it pass; guardians are added to recipients; `discontinue` removes the junior from direct delivery but keeps the guardian copy; safety messages always pass.
- `inQuietHours` at 9:59 PM, 10:00 PM, 5:59 AM and 6:00 AM in America/New_York, including a DST change night.
- Guardian links end at `junior_until`; a junior can end a link, the guardian is told only that it ended, and the reason reaches site admins and the club's safety officer; an account under 7 days old cannot accept as guardian; the activity route returns club outings and shared rows but no personal row that is not shared, and the same club outings as the board's guardian view; codes expire and allow 5 tries an hour.

`test/admin.test.js`

- Admin routes need `site_role = 'admin'`, a passkey session and (for starred routes) a recent sign-in; a code session answers `passkey_session`.
- Each action writes the expected `audit_log` row; moderators never receive email fields.

### 20.3 Browser checks (Playwright, as in CLAUDE.md)

- At 360, 390 and 1280 px, in Chromium and WebKit: the header row stays one line with the account button; the sign-in dialog fits with no horizontal scroll.
- Signed out: the console is clean, and the first hero render does not wait for `/api/me` (the request starts after the hero is in the DOM).
- Code flow with stubbed `/api/auth/*` (Chromium and WebKit): start, wrong code message, new account screen, too young screen and the 24-hour gate, success.
- Passkey flow in Chromium with a CDP virtual authenticator (`WebAuthn.enable`, `WebAuthn.addVirtualAuthenticator` with `hasResidentKey` and `hasUserVerification` true) against `wrangler dev` and a local D1: sign up by code, add a passkey, sign out, sign in with the passkey, use autofill.
- Settings sync: change wind caution offline, go online, see the `PUT`; open a second browser context signed in to the same account and see the change after a visibility change.
- First sign-in merge dialog appears with a seeded conflicting `rowhether-settings-v2` and applies each choice.
- Account page: rename and remove a passkey, end another session, download data (file name and JSON shape), delete account (blocked with a stubbed open outing).
- `/api/info` with `accounts: false` hides every account control.

### 20.4 Manual device checks before phase 2 ships

- iPhone, Safari and the installed app separately: create a passkey, sign in with it, autofill on the email field, code autofill from Mail (`one-time-code`), cookie survives app restart, Safari and app sessions are separate (unverified behaviors in 3.3 and 3.1).
- Android Chrome, browser and installed app: same list.
- macOS Safari and Windows Chrome: cross-device sign-in with a phone QR code.
- `__Host-` cookie on `http://localhost` in Chrome, Firefox and Safari (5.1).
- A real code email from Email Service lands in Gmail, iCloud and Outlook inboxes, not spam, with SPF, DKIM and DMARC passing.

## 21. Open questions and decisions

Decisions, recommendation first:

- Decision: Passkeys plus emailed 6-digit codes, codes only (no magic links). Alternatives: codes plus a magic link; passwords plus codes. (3.1)
- Decision: No Sign in with Google or Apple at launch. Alternatives: both in phase 2 ($99 a year for Apple); Google only. (3.2)
- Decision: Cloudflare Email Service on Workers Paid. Alternatives: Resend Free on Workers Free; Postmark. (3.5)
- Decision: Keep Cloudflare Access in front of `/admin*` and `/api/admin/*` after phase 2. Alternative: site roles alone. (3.7)
- Decision: No account recovery without the email or a passkey. Alternative: manual recovery with a club admin vouching. (4.6)
- Decision: Delete accounts at once, no grace period. Alternative: 14-day grace period. (4.10)
- Decision: 180-day idle, 400-day absolute session lifetime. Alternatives: 90-day idle; 30-day idle with silent re-auth. (5.3)
- Decision: Accounts on for Previews behind Cloudflare Access, email only to verified addresses. Alternative: accounts off on Previews. (5.7)
- Decision: Extend the CLAUDE.md Turnstile exception to every form that needs it, as worded in 08 10.8 (changes a hard-constraint sentence). Alternative: no Turnstile on codes. (6.3)
- Decision: Favorites work signed out; an account only syncs them. Alternative: favorites need an account. (8)
- Decision: Per-key last writer wins, with a prompt only at first sign-in on a device. Alternatives: stricter value always wins; whole-document last writer wins. (9.3)
- Decision: Ask month and year of birth from everyone at sign-up, store only `junior_until`. Alternatives: ask only when joining a club as a junior; never ask. (11.2)
- Decision: No accounts under 13 and no parental consent process. Alternative: build verifiable parental consent through guardians. (11.2)
- Decision: Hold juniors' public free text for moderator review. Alternatives: juniors post choice-only content publicly; juniors post like adults. (11.3)
- Decision: Junior quiet hours 10 PM to 6 AM. Alternative: 9 PM to 7 AM. (11.3)
- Decision: Guardian links in phase 5. Alternative: phase 3 with outings. (11.5)
- Decision: A junior can end a guardian link, and guardians see club outings through the club and a junior's personal rows only when the junior shares them. Recommended: an adult a junior is talked into linking should not get lasting sight of where the junior rows, and parents keep club visibility through the club's confirmed guardian record. Alternatives: only guardians and admins can end a link (the earlier reading of MAAPP); guardians see all of a junior's outings. (11.5)
- Decision: No live boat tracking in any phase. Alternative: opt-in tracking during an outing with a 24-hour retention and a visible signal. (12.2)
- Decision: No analytics product and no tracking of people; 08 10.9 adopts an aggregate open counter, owner to confirm. Alternatives: Cloudflare Web Analytics (needs a second script exception); no counter at all. (12.3)
- Decision: Keep `incidents` with names removed, retention set by 06 with legal advice. Alternative: delete with the person. (12.9)
- Decision: Delete report text and photos on account deletion, keep choices without a name. Alternative: keep report text without a name. (12.9)
- Decision: Vermont law governs the terms. Alternative: no clause until a lawyer advises. (13.1)
- Decision: License community location data openly (ODbL or CC BY-SA). Alternative: RoWhether keeps a non-exclusive license only. (13.1)
- Decision: Legal review before phase 2, phase 5 and phase 7. Alternative: template for phase 2, review before phase 5. (13.5)
- Decision: Keep admin and moderation audit rows 3 years. Alternative: 1 year. (14.2)
- Decision: Move to Workers Paid when phase 2 starts. Alternative: stay on Workers Free. (14.5)

Open questions:

- Does WebAuthn (create and get, and conditional mediation) work inside an iOS home screen web app in standalone mode? Device test (20.4) before phase 2.
- What daily sending quota does a new Cloudflare Email Service account start with, and does the `previews` block accept a `send_email` binding?
- Zero Trust Free plan seat count for the owner's Access application.
- Does Turnstile set any cookie, and does the privacy notice need to name it?
- Does the built app need `'unsafe-inline'` for styles under the CSP in 14.4?
- Is the account currently on Workers Free or Paid (02 also lists this as unverified)?
- USRowing's own MAAPP text for electronic communications (the plan uses the Center's model as carried in another sport's 2025 MAAPP).
- Legal readings to confirm: holding an under-13's email for the life of a code, PECR and ePrivacy exemption for the session cookie, Vermont Act 63 coverage, PIPEDA coverage for a non-commercial service, Vermont breach notice timing, and whether an EU or UK representative is needed in phase 7.
- Which national reporting lines the "Get help" page lists for juniors (11.5), with URLs confirmed by the owner.
