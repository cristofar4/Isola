# ISOLA

**Keep the subject. Lose the background.**

ISOLA is a background-removal and image-editing web app. It removes backgrounds
with a real segmentation model running **in the visitor's browser**, then gives
them tools to refine the result and export it at full resolution.

Built with Next.js 16 (App Router, Turbopack), TypeScript, Tailwind CSS 4,
ONNX Runtime Web and Better Auth.

---

## Quick start

```bash
npm install              # also copies ONNX Runtime Web into public/ort
npm run dev              # http://localhost:3000
```

That's all you need locally:

- **Accounts** use a SQLite database created at `.data/isola.db` on first use.
- **Removing a background requires a free account.** Create one at `/sign-up`:
  without an email service configured you're signed in straight away and land
  in your studio (the confirmation link is still printed in the terminal if
  you want to confirm the address).
- **No secret to set up locally.** Without `BETTER_AUTH_SECRET`, a random one is
  created once in `.data/auth-secret` (readable only by you), so `npm run dev`
  and `npm run build && npm start` both work with no settings.
- **The model** (~179 MB) is downloaded by the server the first time someone
  signs in and removes a background, checked against its SHA-256 checksum and
  cached in `./models`. To download it ahead of time (recommended for
  production) run `npm run models:fetch`, or `npm run models:fetch -- --all`
  to include the optional High detail model (WebGPU only).

For production settings see [Accounts](#accounts).

Production:

```bash
npm run build
npm start
```

Requirements: Node.js 20.9+ (tested on 22). The model download pulls from
GitHub Releases (`ISOLA_MODEL_MIRROR` overrides the mirror).

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js development, production build, production server |
| `npm run models:fetch` | Download model weights into `./models` ahead of time and check SHA-256 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (Next.js core-web-vitals + TypeScript rules) |
| `npm test` | Unit tests (Vitest): file sniffing, validation, brushes, refinement, history, resampling, consistency, export sets, presets, image analysis, project review |
| `npm run test:e2e` | End-to-end checks in Chromium against a running server (`BASE_URL`, default `http://localhost:3000`; start it with `SMTP_URL=smtp://127.0.0.1:2525`) |
| `npm run test:auth` | Account journey including email confirmation (start the app with `SMTP_URL=smtp://127.0.0.1:2525`) |
| `npm run test:account` | Account page: overview, section links, devices and signing them out, phones, key cleanup on deletion |
| `npm run test:quickstart` | Accounts with no setup: create account, sign out, sign in, generated secret (start the app with no auth or email settings) |
| `npm run test:studio` | Studio: dashboard, brand presets, ⌘K, consistency check with the Amazon fix, export sets, recent exports, phones (needs the fake Paystack settings, as for billing) |
| `npm run test:library` | Asset library and projects with real processing: uploads, smart tags, duplicates, tags, collections, downloads, cutouts, brand colours, linked versions, quality review, history with undo/redo, linked-set export, the editor round-trip, folders, trash, downloads, phones (start the app with `SMTP_URL=smtp://127.0.0.1:2525`) |
| `npm run test:api` | Public API with real server-side processing; start the app with `ISOLA_API_RATE_LIMIT_PER_HOUR=15` plus the `test:batch` settings |
| `npm run test:docs` | Developer docs: pages, anchors, search, copy, browser check, feedback, mobile menu |
| `npm run test:nav` | Tools menu, its destinations and the mobile menu (start the app with `SMTP_URL=smtp://127.0.0.1:2525`) |
| `npm run test:batch` | Batch Studio end to end with real processing; opens every download (start the app with `SMTP_URL=smtp://127.0.0.1:2525 PAYSTACK_SECRET_KEY=sk_test_isola_e2e PAYSTACK_API_BASE=http://127.0.0.1:4010`) |
| `npm run test:billing` | Plans and payments against a local Paystack stand-in (start the app as for `test:batch`, plus `PAYSTACK_PLAN_CODE=PLN_isola_monthly_e2e PAYSTACK_YEARLY_PLAN_CODE=PLN_isola_yearly_e2e`) |
| `npm run test:reset` | Password reset through a real SMTP hop (start the app with `SMTP_URL=smtp://127.0.0.1:2525`) |

`node e2e/a11y.mjs` runs an axe-core audit (install with `npm i --no-save axe-core`).

## Environment variables

All optional. `NEXT_PUBLIC_*` values are inlined at **build** time. See `.env.example`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_ISOLA_MAX_FILE_MB` | `30` | Largest upload |
| `NEXT_PUBLIC_ISOLA_MAX_DIMENSION` | `8000` | Longest side, px |
| `NEXT_PUBLIC_ISOLA_MIN_DIMENSION` | `32` | Shortest side, px |
| `NEXT_PUBLIC_ISOLA_MAX_MEGAPIXELS` | `36` | Pixel-count limit |
| `NEXT_PUBLIC_ISOLA_MAX_BATCH_FILES` | `50` | Batch queue size |
| `NEXT_PUBLIC_ISOLA_BATCH_CONCURRENCY` | `1` | Batch items processed at once (1–4) |
| `NEXT_PUBLIC_ISOLA_MAX_EXPORT_MEGAPIXELS` | `64` | Largest export |
| `NEXT_PUBLIC_ISOLA_MAX_EXPORT_DIMENSION` | `12000` | Longest export side |
| `NEXT_PUBLIC_ISOLA_MODEL_BASE_URL` | `/api/models/` | Where the browser fetches models. The default route serves them only to signed-in users |
| `ISOLA_MODEL_DIR` | `./models` | Where the server keeps model files (outside `public/` on purpose) |
| `ISOLA_MODEL_AUTO_DOWNLOAD` | `true` | Download a missing model from the mirror on first use |
| `ISOLA_MODEL_MIRROR` | rembg GitHub release | Where models are downloaded from |
| `NEXT_PUBLIC_ISOLA_ORT_BASE_URL` | `/ort/` | Where ONNX Runtime `.mjs`/`.wasm` files are served |
| `NEXT_PUBLIC_ISOLA_DEFAULT_MODEL` | `isnet-general-use` | Or `birefnet-lite` |
| `NEXT_PUBLIC_ISOLA_DISABLE_WEBGPU` | `false` | Force WebAssembly |
| `ISOLA_REMOTE_PROVIDER` | — | `removebg` enables the optional server engine |
| `REMOVE_BG_API_KEY` | — | remove.bg key (**server only**) |
| `REMOVE_BG_SIZE` | `auto` | remove.bg output size |
| `ISOLA_REMOTE_MAX_UPLOAD_MB` | `12` | Server engine upload limit |
| `ISOLA_REMOTE_RATE_LIMIT_PER_HOUR` | `30` | Per-client limit (in memory, per instance) |
| `ISOLA_API_RATE_LIMIT_PER_HOUR` | `60` | Public API requests per key per hour (in memory, per instance) |
| `ISOLA_API_MAX_QUEUE` | `8` | Public API images that may wait for the server engine before `503 server_busy` |
| `ISOLA_API_THREADS` | all cores | Inference threads for the public API |
| `ISOLA_REMOTE_ALLOW_CROSS_ORIGIN` | `false` | Allow cross-origin browser calls to the route |
| `BETTER_AUTH_SECRET` | generated | Signs sessions and encrypts tokens. **Set it for real deployments** (required with `DATABASE_URL`); without it a single server on SQLite generates one in `.data/auth-secret` |
| `BETTER_AUTH_URL` | request origin | Public site URL, used for OAuth callbacks |
| `DATABASE_URL` | — | `postgres://…` to store accounts in Postgres; otherwise SQLite. `POSTGRES_URL` is used if this isn't set |
| `ISOLA_SQLITE_PATH` | `.data/isola.db` | SQLite file location |
| `ISOLA_AUTH_AUTO_MIGRATE` | `true` | Create/upgrade auth tables on first use |
| `ISOLA_TRUSTED_ORIGINS` | — | Extra origins allowed to call `/api/auth` |
| `ISOLA_CLIENT_IP_HEADERS` | `x-forwarded-for` | Header(s) your proxy sets with the client IP, for auth rate limits (e.g. `cf-connecting-ip`) |
| `ISOLA_TRUSTED_PROXIES` | — | Proxy IPs/CIDRs to skip when reading a multi-hop forwarded chain |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | — | Enables "Continue with Google" |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | — | Enables "Continue with GitHub" |
| `EMAIL_FROM` | `ISOLA <no-reply@localhost>` | Sender for account emails |
| `SMTP_URL` *or* `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASSWORD`/`SMTP_SECURE` | — | Send email over SMTP |
| `RESEND_API_KEY` | — | Send email with Resend's API (used if SMTP isn't set) |
| `NEXT_PUBLIC_ISOLA_PRO_PRICE_NGN` | `14000` | Pro price in naira per month |
| `NEXT_PUBLIC_ISOLA_PRO_YEARLY_PRICE_NGN` | `140000` | Pro price in naira per year |
| `NEXT_PUBLIC_ISOLA_FREE_MAX_EXPORT_SIDE` | `1000` | Longest side of free-plan exports, px |
| `PAYSTACK_SECRET_KEY` | — | Enables upgrading to Pro (**server only**) |
| `PAYSTACK_PLAN_CODE` | — | Monthly Paystack plan for auto-renewal; without it each payment buys a month |
| `PAYSTACK_YEARLY_PLAN_CODE` | — | Yearly Paystack plan for auto-renewal; without it each yearly payment buys a year |
| `PAYSTACK_API_BASE` | `https://api.paystack.co` | Only changed for tests |
| `NEXT_PUBLIC_ISOLA_SOCIAL_GITHUB` / `_X` / `_INSTAGRAM` / `_LINKEDIN` / `_YOUTUBE` | GitHub: this repo | Footer social links; unset ones aren't shown |
| `NEXT_PUBLIC_ISOLA_SUPPORT_EMAIL` | — | Shows a contact link in the footer and help pages |
| `NEXT_PUBLIC_ISOLA_LEGAL_ENTITY` | `ISOLA` | Copyright line |

No variable is required for the core workflow; only the model files are.
Real deployments should set `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`; with a
shared Postgres database (`DATABASE_URL`) the secret is required, because every
server must use the same one.

## Putting it online

Accounts need somewhere to keep data, and the model files (~179 MB) need to be
served. What to set depends on the kind of host:

**A host that keeps files** (a VPS, Docker, Render or Railway with a disk,
Fly.io with a volume): it works as on your computer. Set `BETTER_AUTH_SECRET`
(any long random value) and `BETTER_AUTH_URL` (your site's address); accounts
use the SQLite file in `.data/` and models are downloaded to `./models` on
first use. Keep `.data/` and `models/` on the persistent disk.

**A serverless host that can't keep files** (Vercel, Netlify): the sign-in page
says "This server can't save files" until these are set, then the site must be
redeployed:

1. A Postgres database: on Vercel, the project's **Storage** tab → add Neon (or
   Supabase); it sets `DATABASE_URL` (or `POSTGRES_URL`). Tables are created on
   first use.
2. `BETTER_AUTH_SECRET` under **Settings → Environment Variables**: a long random
   value, for example the output of
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
3. `BETTER_AUTH_URL`: the site's address, e.g. `https://isola.example.com`.
4. Model files: serverless functions can't stream files this large, so upload
   the `.onnx` files (`npm run models:fetch` puts them in `./models`) to a CDN
   or object storage that sends CORS and `Cross-Origin-Resource-Policy:
   cross-origin`, and set `NEXT_PUBLIC_ISOLA_MODEL_BASE_URL` to that folder's
   address.

Optional for both: `SMTP_URL` (or `RESEND_API_KEY`) so new accounts confirm
their email and password reset works, `PAYSTACK_SECRET_KEY` for Pro, and the
Google/GitHub keys for social sign-in.

## How background removal works

- **Engine choice.** Two permissively licensed models, both run with ONNX Runtime Web
  in a module Web Worker:
  - **Standard** — IS-Net general-use (Apache-2.0), 1024×1024 input, ~179 MB.
    Runs on WebGPU or multi-threaded WebAssembly. Default.
  - **High detail** — BiRefNet Swin-T (MIT), better on hair, ~224 MB. Needs more
    than WebAssembly's 4 GB ceiling (verified: it fails with `bad_alloc` on WASM),
    so it's offered only when the browser exposes WebGPU.
- **Why these.** `@imgly/background-removal` is AGPL (commercial licence needed for
  closed products) and fetches models from IMG.LY's CDN by default; BRIA RMBG 1.4/2.0
  weights are non-commercial. IS-Net and BiRefNet are usable commercially and can be
  self-hosted, so images never leave the device.
- **Pipeline.** The file is validated by content (magic bytes) and header
  dimensions before decoding. The worker resizes to 1024², normalises, runs the
  model and upscales the mask bilinearly to the original resolution. Model
  downloads report real byte progress, are SHA-256 verified and cached in Cache
  Storage. Inference has no progress percentage, so the UI shows an activity bar.
- **Honest failure states.** If a model is missing (404), the browser lacks WebGPU
  for High detail, memory runs out, or the server provider isn't configured, the UI
  says so and keeps the original for retry. Nothing is faked.
- **Optional server engine.** `POST /api/remove-background` forwards to remove.bg
  using a server-side key, with content sniffing, a size cap, a same-origin check
  and a per-client rate limit. Disabled unless configured.
- **Cross-origin isolation.** `next.config.ts` sends COOP/COEP so WebAssembly can
  use threads. Host models on another origin only if it sends CORS and
  `Cross-Origin-Resource-Policy: cross-origin`.

Measured in this repo's sandbox (headless Chromium, 4 vCPU, WebAssembly, 3
threads): Standard processes a 1600×1280 photo in ~6–7 s after a one-time model
load; a 6000×4000 image completes in ~10 s including the full-resolution mask.

## Accounts

Sign-in uses [Better Auth](https://www.better-auth.com) (MIT), mounted at
`/api/auth/*`, with pages at `/sign-in`, `/sign-up` and `/account`.

- **Sign-in and sign-up screens** (`src/app/(auth)`) are focused pages with only
  the logo and "Back to home" above the form, a badge, and a picture: a
  draggable before/after of the sneaker on sign-in, and two cutouts on a
  transparent canvas on sign-up (the green handbag is a recoloured copy of the
  Batch Studio sample cutout: only the leather's hue was changed, keeping its
  shading and the gold chain). On wide screens the picture sits beside the
  form; on phones it sits between the badge and the heading. Forgot/reset
  password and email confirmation use the same layout without a picture.
- **Remember me** (unticked by default): ticked, the session cookie lasts 30
  days; unticked, it ends when the browser closes (and the session within a
  day). The password field warns when Caps Lock is on.
- **Email and password** is always available (12–128 characters, hashed with
  scrypt). The rule lives in `src/lib/password.ts` and is enforced by the
  server; the forms count down the characters left. Existing accounts with
  shorter passwords can still sign in; the rule applies when a password is set.
- **Google** and **GitHub** buttons ("or" → "Continue with Google") appear
  under the form only when both their client ID and secret are set. Register these callback URLs with each provider:
  `{BETTER_AUTH_URL}/api/auth/callback/google` and
  `{BETTER_AUTH_URL}/api/auth/callback/github`.
- **Email confirmation:** with an email service configured (SMTP or Resend),
  new accounts must confirm their address before they can sign in. Without one,
  accounts are signed in as soon as they're created (in development the
  confirmation link is still printed in the terminal). Sign-up shows "Check your
  email"; the link (valid 24 hours) confirms the address and signs you in. The
  tab you signed up in carries on to where you were going (with any images you
  had open) once you return to it. Signing in before confirming sends a fresh
  link. Signing up with an email that already has an account gives the same
  answer as a new sign-up, so the form can't reveal who has an account, and the
  real owner gets a "you already have an account" email instead.
- An OAuth sign-in is only attached to an existing account whose email has been
  confirmed; otherwise it's refused with a clear message. This stops someone
  pre-registering another person's email.
- **Background removal requires an account.** This is enforced on the server:
  the model is only served to signed-in users (`/api/models/:file` returns 401
  otherwise), and the optional server engine requires a session too. Signed-out
  visitors can still upload; their images wait with a sign-in prompt and start
  processing as soon as they sign in (after an email/password sign-in in the
  same tab; a Google/GitHub redirect reloads the page). Once a browser has the
  model cached, the requirement there is enforced by the app. If you point
  `NEXT_PUBLIC_ISOLA_MODEL_BASE_URL` at a public CDN, it's enforced by the app only.
- **Account page** (`/account`): a header with your name, avatar initials,
  plan badge and confirmed email, plus links to the editor and Batch Studio;
  an overview (plan and renewal, API keys and requests, devices signed in)
  from live data; section links that stay beside the content on wide screens
  and pin under the header as chips on phones, highlighting the section you're
  reading. Sections: **Plan & billing** (Free vs Pro with monthly/yearly
  upgrade, or billing period, renewal date and Manage subscription on Pro),
  **API keys**, **Profile**, **Password & sign-in** (connected sign-in methods,
  change password), **Devices** and **Delete account**.
- **Devices:** every browser signed in to the account, named from its user
  agent ("Safari on iPhone"), with when it signed in, when it was last active
  and its IP address, and a Sign out button for each other device, plus Sign
  out other devices. It's served by `/api/account/devices` (and
  `DELETE /api/account/devices/:id`), which never send session tokens to the
  browser, refuse other sites and only act on your own sessions. Better
  Auth's own session list needs a sign-in from the last day, so the page
  doesn't use it.
- **Deleting an account** also deletes its API keys explicitly, rather than
  relying on the database to cascade (SQLite only does with foreign keys on).
- **Password reset by email:** "Forgot password?" on the sign-in page sends a
  single-use link that expires after 60 minutes; using it signs the account out
  everywhere and also confirms the email address (it proves the mailbox). The response is identical whether or not the email has an
  account, and the email is sent after the response so timing doesn't reveal it
  either. Email goes out over SMTP (`SMTP_URL` or `SMTP_HOST`…) or Resend
  (`RESEND_API_KEY`). In development with neither set, links are printed in the
  server terminal; in production without email, reset is shown as unavailable
  and email confirmation is switched off.
- **Storage:** Postgres when `DATABASE_URL` is set; otherwise a local SQLite
  file using Node's built-in `node:sqlite` (development and single-server use;
  Node prints an "experimental" warning for it). Better Auth's tables (`user`,
  `session`, `account`, `verification`) are created or extended on first use;
  this only adds what's missing. Set `ISOLA_AUTH_AUTO_MIGRATE=false` if you'd
  rather create them with your own migration tooling.
- **Rate limits:** in production Better Auth allows 3 sign-in, sign-up or
  password-change attempts per 10 seconds and 3 reset emails per minute per
  client IP (in memory, per instance). Session reads aren't throttled. Limits
  are keyed by the IP header your proxy sets (`ISOLA_CLIENT_IP_HEADERS`); with
  no such header every visitor shares one bucket, so set it for your host.
- **Server engine rate limits** follow the signed-in account rather than the IP address.
- Pages read the session behind `<Suspense>` (Cache Components), so the rest
  of each page still prerenders.

Not built yet: changing the email address and saving projects to an account.

## Plans and payments

| | Free | Pro — ₦14,000/month or ₦140,000/year |
| --- | --- | --- |
| Background removal (account required) | ✓ | ✓ |
| Single-image editor | ✓ | ✓ |
| Export size | Up to 1,000px on the longest side | Full resolution (HD and beyond) |
| Watermark | "ISOLA" tiled across exports | None |
| Batch Studio | — | ✓ |

Monthly and yearly Pro are the same plan with the same features; the pricing
page has a Monthly/Yearly toggle (yearly saves about 17%).

- **Payments** go through [Paystack](https://paystack.com) in naira. "Upgrade
  to Pro" opens Paystack's hosted checkout; when the payer returns,
  `/billing/callback` verifies the transaction with Paystack's API (status,
  the full price in kobo for the chosen period, NGN, and that it belongs to the
  signed-in account) before granting 30 days (monthly) or 365 days (yearly) of
  Pro. Payments are recorded by reference, so a callback and a webhook for the
  same charge only count once. Checkout started from Batch Studio returns the
  payer to Batch Studio, where waiting images then start.
- **Renewal:** set `PAYSTACK_PLAN_CODE` (₦14,000 monthly) and
  `PAYSTACK_YEARLY_PLAN_CODE` (₦140,000 annually) to plans created in the
  Paystack dashboard and checkout starts a subscription. Renewal charges reach
  `/api/billing/webhook` (signature-checked with your secret key) without
  ISOLA's checkout metadata, so they're matched by plan code and Paystack
  customer, re-verified with the API, and add one more period. Charges for other
  plans or below the plan price are ignored. Subscribers get "Manage
  subscription" on the Account page, which opens Paystack's page to change card
  or cancel; Pro then lasts until the end of the paid period. Without plan
  codes, each payment buys one period and doesn't renew.
- **Set up:** add `PAYSTACK_SECRET_KEY` (and optionally the two plan codes),
  and set the webhook URL in the Paystack dashboard to
  `{BETTER_AUTH_URL}/api/billing/webhook`. Without a key, the Upgrade button
  says payments aren't set up yet and everyone stays on Free.
- **How limits are enforced:** Pro status is stored on the server and only the
  server can change it. The watermark and size rules live in one place,
  `src/lib/plan-policy.ts`, used by the editor's export and by every Batch
  Studio download and ZIP. Because background removal and export run in the
  browser (images are never uploaded), those rules are applied in the browser;
  a technically skilled user could get around them. Server-side rendering of
  exports would be needed for strict enforcement.

## Batch Studio

Batch Studio is part of Pro. Images processed there never leave the browser.

- **Signed out, `/batch` is an introduction** (from the reference design): the
  pitch, a four-step walkthrough (Upload → Remove backgrounds → Match your
  style → Export ZIP) that plays on its own unless paused, hovered, focused or
  the device asks for reduced motion, and a sample project. The sample project
  uses three real cutouts from ISOLA's model and the real Batch Studio
  compositor: pick a background and padding, apply, and download a ZIP of the
  actual files. "Product images" in the Tools menu shows the catalogue look on
  the samples and keeps the preset through sign-in. Signed in, `/batch` is the
  workspace described below.

- **Adding images:** choose files, drag and drop, or add more at any time (up
  to 50). Each file is checked by content, size and dimensions; a rejected file
  is listed with its reason and the rest are added. The app keeps its own copy
  of each original, so moving or overwriting the file on disk doesn't break the
  batch.
- **Kept in this browser:** the batch (originals, masks, settings, uploaded
  backgrounds and the batch name) is stored in IndexedDB. It survives a reload,
  signing in (including Google/GitHub and email links), and paying through
  Paystack, and stays until you remove the images or choose **Clear batch**.
  If the browser refuses storage (some private modes) or is full, the page says
  so and the batch then lasts only until the tab closes.
- **Processing:** one shared on-device engine; the model loads once and is
  reused. Images are processed one at a time by default
  (`NEXT_PUBLIC_ISOLA_BATCH_CONCURRENCY`, up to 4). Each image moves through
  queued → processing → ready, or failed / cancelled, with the engine's real
  phases (downloading the model with measured progress, starting the engine,
  removing the background, building the full-resolution mask). An image is
  only marked ready once its mask and preview exist. One failure doesn't stop
  the rest; cancelling a running image stops only that image (the worker is
  restarted and the model reloads from Cache Storage) and the queue carries on.
  Images added while signed out or on Free wait with "Sign in required" /
  "Pro required" and start on their own after signing in or upgrading.
- **Selection** is separate from status. Select all respects the search filter
  and shows an indeterminate state. The toolbar's Remove background, Retry
  failed and More (cancel processing, clear selection, remove selected) act on
  the selection, and explain why they're disabled.
- **Settings** (Background, Layout and Export tabs) are a draft until applied.
  With images selected, **Apply** changes only those; with none selected it
  changes every image, and the button says which. Unapplied edits are flagged
  in the panel and the export bar, and downloads always use each image's
  applied settings. Applying never reprocesses: the stored mask is reused.
  - Background: transparent, white, soft grey, custom colour, or an uploaded image.
  - Layout: original framing, original size re-centred, square 1:1, portrait 4:5,
    landscape 3:2, or custom dimensions (16–8,000px, validated); contain or
    cover; padding as a percentage of the canvas's shorter side; 3×3 alignment;
    soft shadow.
  - Export: transparent PNG, PNG with background, or JPEG with an explicit fill
    colour for transparent areas; original file names or a pattern using
    `{name}`, `{n}` and `{project}`. Names are made safe for every OS and
    duplicates get `-2`, `-3`…
- **Downloads:** every ready image has its own Refine and Download buttons. The
  export bar at the bottom (always on screen, also on phones) has **Download
  selected** (a single file for one image, a ZIP for several; only selected,
  finished images) and **Export all ready** (every finished image, whatever is
  selected). Unfinished and failed images are left out and listed by name and
  reason; an image that fails to render is reported and the rest are still
  delivered. Exports are rendered at full resolution one image at a time, with
  progress, and only one export runs at a time. Card previews are drawn by the
  same function as the exported files, from a smaller cutout.
- **Refine:** opens that exact image (original plus mask) in the editor, reusing
  the same editor image on later clicks. Brush work, edge refinement and the
  background flow back to the batch item automatically (marked "Edited");
  "Back to Batch Studio" returns you with everything as you left it. Canvas,
  layout and format stay Batch Studio settings.
- **Review flags:** "Check edges" is a real check of the mask: no clear subject,
  almost everything kept, or large partly transparent areas.

## Studio

`/studio` is the signed-in home, built from the reference design ("Your studio,
in sync."). It has its own frame: a dark sidebar (Workspace: Home, Projects,
Asset library; Create: Image editor, Batch Studio; Organise: Brand presets,
Export sets, Quality review, Downloads, Trash; then Developers, Help, Settings
and your account), a top bar with search (⌘K, Ctrl+K or "/") and a Create menu
(new project, upload assets, editor, batch, export set, brand preset), and a
phone menu. Signing in without a `next` page lands here;
"Get started" on the site goes to Create account, and signed in, the header
offers "Your studio".

Everything on it is real data; empty states say so instead of showing made-up
work (the one illustration, in the consistency card before you have finished
images, is labelled "Example").

- **Production queue:** the batch saved in this browser, image by image: ready
  to export, edges to refine (opens that image in the editor), waiting, or
  failed, with the next step for each. Free accounts see that Batch Studio is
  part of Pro.
- **Continue creating:** your most recently edited projects (their first
  version as it exports, version count, status), the current collection
  (thumbnails, image count, "Updated today at 10:24", recorded when the batch
  actually changes) and recent exports, as a grid or a list.
- **Brand preset:** your default preset's colours with Canvas, Padding and
  Shadow you can change in place; "Apply preset" opens Batch Studio with it.
- **Keep the collection consistent:** the consistency check (below) run on the
  saved batch, with the flagged images drawn by the export renderer.
- **One collection. Every destination.:** your first finished image rendered as
  Square, Portrait and Wide, with how many images are ready.
- **Recent exports:** the latest download, kept in this browser so it can be
  downloaded again byte for byte.
- **Private by design:** how much this browser stores for ISOLA (from the
  browser's own estimate) and a button that asks the browser to keep those
  files when space runs low.

### Features built for product photos

- **Consistency check** (Batch Studio → Check consistency, or the studio card).
  Measured from each finished cutout's mask and settings (`src/lib/consistency.ts`)
  and compared with the rest of the collection, so a style the whole set shares
  isn't reported as a fault. It finds images whose settings differ from the
  rest (with a "Match the others" fix that keeps each file's naming), subjects
  cut off by the photo's edge, stray specks left from the background (small
  separate pieces; a second shoe of a pair isn't one), edges to review,
  subjects enlarged more than 2× to fill the canvas (they look soft), and, for
  images that keep their own framing, subjects much smaller, larger or further
  off-centre than the rest (fix: re-centre all with equal padding). Fixes are
  applied only when you choose them, one image at a time or all at once.
- **Marketplace readiness.** The same check can measure against a destination's
  published rules, on the real output geometry after the plan's size limit:
  **Amazon main image** (pure white RGB 255,255,255 background, product filling
  at least 85% of the frame, 1,000px or more on the longest side, no
  watermark, so Free exports are flagged) with "Make Amazon-ready" (square,
  white, JPEG, padding 5%; 1,000px canvas for small photos), and **Instagram
  post** (4:5 to 1.91:1, 1080px wide, no transparency). The catalogue preset's
  10% padding leaves products filling 80%, which this catches. Rules are based
  on published guidelines; the panel says to check the destination's current
  rules too.
- **Export sets** (Batch Studio → Export set, `/batch?export=set`). Every
  finished image rendered once per destination and packed into one ZIP with a
  folder per destination: Square 1:1 (1080), Portrait 4:5 (1080×1350), Story
  9:16 (1080×1920), Wide 16:9 (1920×1080) and Marketplace 1:1 (2000, pure white
  JPEG, 5% padding). Each keeps the image's own look and changes only the
  canvas. The dialog shows real previews of the first image at every size.
- **Brand presets** (`/studio/presets`, `GET/POST /api/presets`,
  `PUT/DELETE /api/presets/:id`). Up to 20 per account, saved on the server so
  they're the same on every device: name, up to six colours, background
  (transparent, white or a brand colour), canvas, padding, position, soft
  shadow and format, with one default. The editor shows a live preview drawn by
  the export renderer. Every field is validated on the server; other sites and
  other accounts are refused; presets are deleted with the account. Batch
  Studio loads one from `?preset=<id>` (or `default`).
- **Recent exports.** Downloads from the editor and Batch Studio (single
  files, ZIPs and export sets) are recorded in this browser's IndexedDB: the
  newest keep their files up to 150 MB in total (eight at most), older ones
  keep only their details. Nothing is uploaded.
- **Command palette (⌘K).** Search tools, pages, projects, library assets,
  brand presets (apply one), images in your batch (opens one straight in the
  editor through `/batch?open=<id>`) and the developer docs; arrow keys and
  Enter.

### Asset library and projects

Both live in this browser (IndexedDB database `isola-library`), like the batch:
nothing is uploaded, they work on any host, and they don't follow you to
another device. Brand presets stay in the account.

**Asset library** (`/studio/assets`, from the reference design). Originals,
cutouts, backgrounds and logos, with tabs and counts, search, type and tag
filters, sorting, grid or list, select all and a bulk toolbar.

- **Analysed on upload** (`src/lib/studio/asset-analysis.ts`): real
  dimensions, format, size and transparency; the main colours (median-cut
  palette, named with the nearest of a fixed colour list); and **smart tags**
  from the pixels: orientation, "Transparent", up to two main colour names,
  "High resolution" (2,000px or more) or "Low resolution" (under 800px).
  Search matches names, your tags, smart tags and colour names. Photos are
  filed as originals and transparent images as cutouts; you can change it.
- **Duplicate detection:** each image gets a 64-bit difference hash, so a
  resized or recompressed copy is recognised ("product-copy.jpg looks like
  product.jpg") and can go to the trash in one click.
- **Tags and collections:** add or remove tags, apply tags to a selection, and
  put assets in collections (an asset can be in several).
- **Make a cutout:** removes the background on this device with the same
  engine as the editor and saves it as a new cutout linked to its source.
- **Save as brand colours:** an asset's main colours become a brand preset
  (white background, so new projects don't take the photo's colour unasked).
- **Download** one asset or a selection (ZIP). Uploads download exactly as they
  were; cutouts made here follow the plan (Free: 1,000px with the watermark).
- Details show where an asset is used, and **Use in project** / **Open in
  editor** take it further. Assets used by a project can't be deleted for
  good until the project is.

**Projects** (`/studio/projects`, `/studio/projects/<id>`). A project is one
**master** cutout and its **linked versions**, one per destination (Square,
Portrait, Wide by default; Story and Marketplace can be added). Change the
master's background (transparent, white, a brand colour or any colour),
padding, shadow or position, and every linked version follows. A version can
have its own padding, shadow or position; it's then marked "Custom
adjustments" and keeps following everything else. New projects start from the
default brand preset.

- **Board, grid and list views**, with real previews drawn by the export
  renderer, zoom, a before/after slider on the master, and Undo/Redo
  (Ctrl+Z, Ctrl+Shift+Z).
- **Quality review** (`reviewProject` in `src/lib/studio/project-model.ts`),
  measured from the mask and each version's real geometry: versions whose
  subject is scaled differently from the master (with the difference, e.g.
  "−6%", and "Match to master"), edges worth refining, a marketplace version
  that doesn't reach the 85% fill rule (fix: padding 5%), shadows that differ
  from the master, off-centre versions, and subjects enlarged more than 2×.
  Suggestions change nothing until you choose a fix.
- **Version history:** every change is a named step ("Background updated",
  "Portrait 4:5: padding 14%", "Mask refined"…), up to 40 per project.
  Restore any of them; restoring is itself a step you can undo. Slider changes
  are saved when you let go, so a drag or a run of arrow-key presses is one
  step.
- **Refine edges** opens the master in the editor; the refined mask comes back
  to the project as a "Mask refined" step.
- **Export** one version (PNG or JPEG) or the **linked set**: one file per
  version in a folder per destination, in one ZIP, under the plan's rules.
- Folders, starring, renaming, duplicating, Recent and Starred tabs.

**Trash** (`/studio/trash`): trashed assets and projects stay 30 days, then
are deleted when the library next opens. Restore or delete for good.
**Downloads** (`/studio/downloads`): every export recorded in this browser,
from the editor, Batch Studio, the library and projects, with the newest kept
to download again.

## Public API

Signed-in users create API keys on the Account page (up to 10, shown once,
stored as SHA-256 hashes) and call the API from their own code:

```bash
curl -X POST https://your-deployment/api/v1/remove-background \
  -H "Authorization: Bearer $ISOLA_API_KEY" -F "image=@photo.jpg" -o cutout.png
```

- **Processing runs on the server** with `onnxruntime-node` and the Standard
  model (IS-Net), using the same normalisation, output conversion and mask
  upscaling as the browser engine (`src/lib/processing/segmentation.ts`); the
  e2e test measures a mean alpha difference of 0.03/255 between the two.
  Images are decoded with sharp (EXIF orientation applied), processed in
  memory and discarded.
- **Endpoints:** `POST /api/v1/remove-background` (multipart `image` field or
  raw body; `output=cutout|mask`, `format=png|jpeg`, `background=#RRGGBB`) and
  `GET /api/v1/me` (key, plan, limits, remaining requests). JSON errors with
  stable codes, CORS for any origin, rate-limit headers on every response.
- **Plans apply on the server:** Free keys get cutouts scaled to 1,000px with a
  watermark (drawn as vector shapes, so no fonts are needed on the server);
  Pro keys get full resolution, no watermark, and masks. Unlike in-browser
  exports, these rules can't be bypassed.
- **Limits:** 60 requests per key per hour by default, one inference at a time
  with a short queue, and the same upload limits as the app.
- **Docs:** `/developers/api` (quickstart with curl, Node.js and Python, plus a
  live playground) and `/developers/api-reference`.
- **Deployment:** needs a Node server that can load native modules. The
  `onnxruntime-node` package is large (about 560 MB installed, all platforms),
  and the model needs about 180 MB of disk. Measured here, the server process
  uses about 1.1 GB of memory once the model is loaded.

## Editing model

Every image keeps separate, non-destructive layers:

| Layer | Stored as | Changed by |
| --- | --- | --- |
| Original | Decoded RGBA, never modified | — |
| Automatic mask | Engine output | Reprocessing |
| Editable mask | 8-bit alpha at full resolution | Restore / erase brushes, reset |
| Settings | `feather`, `shift`, background, shadow, crop, output size | Panels |

The restore brush pulls the mask towards 255 (so original pixels return exactly);
the erase brush pulls it towards 0. Brush strokes update only the touched region
(including the feather/shift reach), and undo/redo stores only the changed
rectangle. Preview and export share `drawComposite`, so downloads match the
canvas; the checkerboard is drawn by the preview only.

## Project structure

```
src/
  app/                    routes: / (landing), /editor, /batch, /developers, /pricing, /studio,
                          (auth)/ sign-in, sign-up, forgot/reset password, verify-email,
                          /account, /privacy, /terms, /support,
                          /api/auth/*, /api/engines, /api/remove-background
  components/
    landing/              hero, comparison slider, upload panel, sections
    editor/               shell, canvas (pan/zoom/brush/crop/compare), panels, export
    batch/                batch studio
    ui/                   buttons, sliders, switches, sheets (Radix), progress
    upload/               shared upload + drag-and-drop hooks
    auth/                 auth shell + pictures, sign-in/up forms, social buttons, form fields
    studio/               studio shell, dashboard, production queue, brand presets, ⌘K,
                          asset library, projects, project board, trash, downloads
    account/              account page: header, section nav, overview, plan, API keys,
                          profile, password & sign-in, devices, delete
  lib/
    config.ts             limits and engine configuration (env-driven)
    image/                content sniffing, validation, decoding, mask PNG codec
    processing/           engine adapter types, model registry, ONNX worker + client,
                          remote engine, registry/hooks
    editor/               mask ops, history, layers, compositing, export
    project/              project store, heavy-asset store, actions
    batch/                batch queue, ZIP export
    studio/               library + projects storage (IndexedDB), image analysis,
                          project model and review, export history, snapshot
  server/                 Better Auth setup + session helpers, remote provider,
                          usage limiter, billing boundary
scripts/                  copy-ort.mjs (postinstall), fetch-models.mjs
tests/                    Vitest unit tests
e2e/                      Playwright end-to-end + a11y scripts
```

## Verification

Run against a production build in this repository's sandbox, starting from an
empty model folder (so the automatic download is exercised) and with
`SMTP_URL=smtp://127.0.0.1:2525` so emails land in the tests' local mailbox:

- **Unit tests:** 60/60 passing, including the consistency rules on synthetic
  masks (crops, specks vs a pair of shoes, Amazon fill and its fix,
  Instagram's aspect range, scale outliers, enlargement after the plan limit),
  export-set sizes and brand preset validation.
- **End-to-end (`npm run test:e2e`): 31/31 checks passing**, including: the
  model is refused to signed-out requests; a signed-out upload waits with a
  sign-in prompt and is processed after signing in; real on-device removal;
  exported PNGs are RGBA with fully transparent background pixels and original
  dimensions; erase clears the mask; restore returns the exact original RGB;
  undo/redo; comparison divider keyboard control; colour backgrounds in PNG and
  JPEG; shadows; crop and resize dimensions; invalid and oversized files rejected
  before decoding; transparent input; a 24 MP image; retry after a missing-model
  failure; mobile toolbar and bottom sheet.
- **Public API (`npm run test:api`): 30/30**: keys created in the Account page
  are shown once and never again; missing, unknown and deleted keys get 401;
  Free keys return watermarked 1000px PNGs and can't request masks; Pro keys
  return full-resolution cutouts with real alpha (raw body and multipart),
  greyscale masks, JPEG on white and PNG on a colour; transparent inputs stay
  transparent; the API's cutout matches the browser engine's export (mean alpha
  difference 0.03/255); invalid files, tiny images, bad options, wrong content
  types and 31 MB bodies are refused with the right codes; concurrent requests
  queue; usage is counted exactly; CORS preflight; the 16th request with a limit
  of 15 gets 429 with Retry-After; key management refuses other origins and
  anonymous calls; the docs playground runs a real request.
- **Developer docs (`npm run test:docs`): 35/35** (including the Help centre's
  search and deep links): the introduction as
  designed, the copy button putting the real code on the clipboard, "On this
  page" following the scroll, every page active in the sidebar with every
  section anchor present and previous/next in order, search ("/" to focus,
  Enter opens the section), the live browser check, troubleshooting entries,
  all 20 error codes listed, feedback stored (and refused for unknown pages or
  other origins), footer links, and the mobile guide menu.
- **Navigation (`npm run test:nav`): 33/33**: every Tools menu link points
  where it says, hover/click/Escape/keyboard behaviour, no axe violations with
  the menu open, the editor hints and preselected tools (restore brush after
  processing, crop tool when an image is already open), the catalogue preset
  in Batch Studio, the All tools page, and the grouped mobile menu.
- **Batch Studio (`npm run test:batch`): 47/47**: the signed-out
  introduction (four-step walkthrough that can be stepped, wraps, autoplays and
  pauses; the sample ZIP holds three square PNGs with the applied background
  and padding measured in the file; signing in from it opens the workspace),
  then real processing of a
  product photo, a bottle, a portrait with fine hair, a PNG with transparency,
  a corrupt PNG and a non-image, opening every downloaded file: the batch
  survives signing in and a reload after upgrading; the invalid file is
  rejected alone; images finish independently while the corrupt one fails with
  a message; at most one image processes at a time; every ready image has a
  visible Download button; single downloads have the original name, full size
  and real alpha (transparent source areas stay transparent); the selected ZIP
  holds only selected finished images and lists the failed one as left out;
  Export all ready includes every finished image regardless of selection;
  editor brush work comes back to the batch and re-opening reuses the same
  editor image; unapplied settings don't affect downloads; applied settings
  change only the selection (square canvas, soft grey JPEG, padding and bottom
  alignment measured in the file); the card preview matches the export within
  0.3%; the shadow appears in both export and preview; cancelling one image
  doesn't stop the queue and it can be retried; results and edits survive a
  reload; on a phone the export bar stays on screen without covering the last
  image, Export all ready works and settings open in a drawer.
- **Accounts (`npm run test:auth`): 34/34**, including the redesigned screens
  (badge, heading, Back to home with no site menu, the before/after divider,
  picture beside the form on desktop and above the heading on phones with no
  sideways scrolling, footer links), the 12-character rule counting down and
  enforced by the server, Remember me (30-day cookie when ticked, a
  browser-session cookie when not), confirmation email, no session before
  confirming, blocked sign-in with a fresh link, bad links, the original tab
  carrying on, duplicate sign-up revealing nothing while emailing the owner,
  profile, sign out, password change and account deletion.
- **Account page (`npm run test:account`): 22/22**, including the header,
  the overview counts matching the server, section links scrolling and
  highlighting, devices named from their browser with this device first,
  no session tokens in the device list, signing one device out (its session
  really ends) and all others, refusing this device, other sites, signed-out
  requests and other people's devices, the password fields lining up, no
  sideways scrolling on phones with the section chips pinned under the
  header, and account deletion leaving no API keys in the database.
- **Studio (`npm run test:studio`): 36/36**, with real processing: signed-out
  visitors are sent to sign in and "Get started" goes to Create account; an
  empty studio shows honest empty states; a brand preset is created and edited
  in place and saved to the account; invalid presets, other sites and other
  accounts are refused; the presets page creates a new default with a live
  preview; ⌘K finds and applies a preset; an editor export appears in Recent
  exports and downloads again byte for byte. On Pro, three photos with the
  catalogue preset are flagged for Amazon (each product fills 80%), "Make all
  3 Amazon-ready" fixes every one while the small serum bottle is still noted
  as enlarged 2.7×; an export set of Square, Wide and Marketplace gives a ZIP
  of nine files in three folders, each the exact size, marketplace files JPEG
  on pure white; the dashboard shows the real queue, collection, consistency
  result, destination previews and the export set, which downloads again
  unchanged; ⌘K opens a batch image in the editor; phones have no sideways
  scrolling and a working menu.
- **Asset library and projects (`npm run test:library`): 34/34**, with real
  processing on a Free account: five uploads are analysed and a resized copy
  is recognised as a duplicate and trashed in one click; photos are filed as
  originals and transparent images as cutouts; smart tags and colours come
  from the pixels; tags filter, search finds assets by colour, a selection
  goes into a new collection with a tag; a selection downloads as a ZIP of the
  untouched originals; "Make a cutout" removes the background and links the
  cutout to its source, which downloads at 667×1000 with the watermark on
  Free; an asset's colours become a brand preset. A project prepares the
  master and draws Square, Portrait and Wide; a version given its own padding
  is reported with the real difference ("−16%") and "Match to master" links it
  again; changes are named in version history; Undo and Ctrl+Shift+Z redo
  work; restoring "Original imported" is a new step; a Marketplace version
  meets the fill rule; the linked set is a ZIP of four files in folders at the
  Free plan's sizes (1000×1000, 800×1000, 1000×563, 1000×1000); edges refined
  in the editor come back as "Mask refined"; projects can be starred,
  duplicated and filed in a new folder; trash restores and deletes for good;
  Downloads lists library and project exports; the dashboard's Continue
  creating shows the project; no sideways scrolling on phones; no page errors.
- **Password reset (`npm run test:reset`): 13/13**, through a real SMTP hop.
- **PostgreSQL:** with `DATABASE_URL` pointing at PostgreSQL 16 and the local
  SQLite folder made unwritable (as on a serverless host), the account (34/34),
  password reset (13/13), account page (22/22), API (30/30), billing (32/32)
  and studio (36/36) suites all pass; tables are created on first use.
- **No-setup accounts (`npm run test:quickstart`): 7/7** against `npm start`
  with no secret and no email service: Create account signs you straight into
  the studio, sign out and sign in work, a wrong password is refused, and the
  generated secret is saved with owner-only permissions. Also checked by hand
  under `npm run dev`.
- **Plans and payments (`npm run test:billing`): 32/32**, including the price
  and amount sent to checkout, the yearly toggle, free exports capped at
  1,000px with a watermark, Batch Studio blocked on Free, upgrade through
  checkout, Pro exports at full resolution without a watermark, refusing
  replayed, underpaid and other-account payments, rejecting forged webhooks,
  automatic renewals (no checkout metadata) extending Pro once, ignoring
  renewals for other plans or below the price, yearly checkout (₦140,000 on the
  yearly plan, a year of Pro, a monthly amount refused, return to Batch Studio)
  and subscription management.
- **Google/GitHub (`node e2e/oauth.mjs`):** both buttons start a real OAuth
  redirect with the right callback URL (completing it needs real credentials).
- **Accessibility:** axe-core reports 0 violations on 40 pages and states
  (including all seven developer docs pages, /tools, the studio dashboard, its
  ⌘K palette and phone menu, the brand preset editor, the asset library empty
  and with details and a selection, a project board with its Review and
  History tabs, the new-project sheet, Trash and Downloads),
  including the editor with an image, the export dialog, the account page, the
  auth screens, and Batch Studio with images, the Export tab and the mobile
  settings drawer.

Not verified here: WebGPU (unavailable in the headless sandbox, so the High detail
model has only been validated with native ONNX Runtime), Safari and Firefox,
real touch devices, completing Google/GitHub sign-in, delivery through a real
email provider, live Paystack payments, and live calls to remove.bg (its API is unreachable from the
sandbox; the route's validation, rate limiting and error paths were tested).

## Feature status

**Working**

- Developer docs from the reference design (`/developers`). The docs are the
  same reference for everyone; an account panel on the introduction and API
  quickstart changes with the reader: signed out, it invites them to create an
  account for an API key; signed in, it shows their plan and how many API keys
  they have, with links to manage keys and try the playground. a three-column
  guide with a sidebar (search with "/" or Ctrl/⌘ K, seven pages), the content,
  and "On this page" that follows your scroll. Pages: Introduction, How
  processing works, Browser requirements (with a live check of the visitor's
  browser), Engine adapter (the full interface and an example custom engine),
  Server endpoints, Errors & limits (every upload and engine error code, plus
  troubleshooting) and Privacy & storage. Code blocks are highlighted, with
  line numbers and a copy button; headings have shareable anchors; every page
  has previous/next links and "Was this page helpful?", whose answers are
  stored by `POST /api/docs/feedback` (page, yes/no, time; nothing about the
  person). Everything documented exists in this codebase.
- Tools menu from the reference design: Edit an image (background remover,
  restore & erase, change background, resize & crop), Work with more (Batch
  Studio, product images), Learn & build (help centre, developer docs), a
  before/after card made from ISOLA's own output, and "Explore all tools"
  (`/tools`). Opens on hover or click, works with the keyboard, and is grouped
  the same way in the mobile menu. Editor links (`/editor?tool=restore`,
  `?tool=crop`, `?panel=background`) show a hint and select that tool once the
  image is ready; "Product images" (`/batch?preset=catalogue`) loads a white
  square catalogue preset into Batch settings as a draft with one-click apply.
- Landing page from the reference design, with ISOLA branding, draggable
  before/after, upload panel, samples, feature sections and footer.
- One upload path for every entry point (landing, CTA, editor, filmstrip, drag
  and drop, paste, samples) that validates type, size and dimensions. On the
  landing and pricing pages, a signed-out visitor who taps Upload (or drops a
  file, or picks an example) is sent to sign in first, with a note saying why;
  "Create an account" on that page keeps the way back to the editor. Signed in,
  Upload opens the file picker as before.
- Section names next to the logo: ISOLA DEVELOPERS on the docs and ISOLA BATCH
  on Batch Studio.
- Editor: top bar (project name, undo, redo, compare, zoom, engine status,
  export), tool rail, image list, canvas, properties panel, filmstrip.
- Real on-device background removal with download progress, cancellation,
  retries and honest unavailable states.
- Pan, zoom (wheel, pinch, menu, shortcuts), fit; before/after comparison.
- Restore and erase brushes with size and softness; edge feather and shift.
- Transparent, solid colour and uploaded image backgrounds; drop shadow.
- Crop with aspect presets and fit-to-subject; resize on export.
- Export to transparent PNG, PNG with background, or JPEG at the chosen
  resolution, with dimensions shown before download.
- Batch Studio (Pro): see [Batch Studio](#batch-studio) below.
- Responsive layouts (bottom toolbar and sheets on phones), keyboard shortcuts,
  focus management, reduced-motion support.

**Not yet built / needs integration**

- **Billing:** Pro at ₦14,000/month or ₦140,000/year through Paystack is built
  and tested against a local stand-in for Paystack's API; it hasn't been run
  against live Paystack from here. Studio (team workspace, centralised billing) is planned
  and marked as such.
- **Account email flows:** confirmation and password reset are done; changing
  the email address isn't built yet.
- **Public API:** built (see below). Rate limits and usage counters are kept per
  server instance; with several instances, use a shared store.
- **Server rate limiting** is in memory per instance; use a shared store for
  multi-instance deployments.
- **Project persistence:** editor sessions live in the tab and are lost on
  reload. The asset library, studio projects and the current Batch Studio
  batch are kept in the browser (IndexedDB), not in the account, so they don't
  follow you to another device.
- **Model hosting:** the ~179–224 MB model files must be served by your host or a
  CDN. The built-in `/api/models/` route streams them from the Node server
  (downloading them once on first use), which needs a long-running Node host
  (a VPS, Docker, Render, Railway, Fly.io…) with ~450 MB of disk. Serverless
  functions with response-size or time limits (Vercel functions, for example)
  can't stream a file that size, and every batch item then fails with "The
  model couldn't be downloaded". On such platforms, put the `.onnx` files on a
  CDN or object storage that sends CORS and
  `Cross-Origin-Resource-Policy: cross-origin`, and set
  `NEXT_PUBLIC_ISOLA_MODEL_BASE_URL` to it (the sign-in requirement is then
  enforced by the app UI only).
- **Large images on phones:** iOS Safari limits canvas size (~16.7 MP), so big
  exports may need a smaller output size there.
- Terms of use are a starting template that should be reviewed.

## Credits

Sample photography from Unsplash (see `public/samples/CREDITS.md`); the test
fixture in `e2e/fixtures` is also from Unsplash. Models:
IS-Net (DIS, Apache-2.0) and BiRefNet (MIT), mirrored by the rembg project.
