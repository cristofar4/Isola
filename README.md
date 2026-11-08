# ISOLA

**Keep the subject. Lose the background.**

ISOLA is a background-removal and image-editing web app. It removes backgrounds
with a real segmentation model running **in the visitor's browser**, then gives
them tools to refine the result and export it at full resolution.

Built with Next.js 16 (App Router, Turbopack), TypeScript, Tailwind CSS 4 and
ONNX Runtime Web.

---

## Quick start

```bash
npm install              # also copies ONNX Runtime Web into public/ort
npm run models:fetch     # downloads + verifies the Standard model (~179 MB)
npm run dev              # http://localhost:3000
```

For the optional High detail model (WebGPU only) run `npm run models:fetch -- --all`.

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
| `npm run models:fetch` | Download model weights into `public/models` and check SHA-256 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (Next.js core-web-vitals + TypeScript rules) |
| `npm test` | Unit tests (Vitest): file sniffing, validation, brushes, refinement, history, resampling |
| `npm run test:e2e` | End-to-end checks in Chromium against a running server (`BASE_URL`, default `http://localhost:3000`) |

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
| `NEXT_PUBLIC_ISOLA_MODEL_BASE_URL` | `/models/` | Where `.onnx` files are served |
| `NEXT_PUBLIC_ISOLA_ORT_BASE_URL` | `/ort/` | Where ONNX Runtime `.mjs`/`.wasm` files are served |
| `NEXT_PUBLIC_ISOLA_DEFAULT_MODEL` | `isnet-general-use` | Or `birefnet-lite` |
| `NEXT_PUBLIC_ISOLA_DISABLE_WEBGPU` | `false` | Force WebAssembly |
| `ISOLA_REMOTE_PROVIDER` | — | `removebg` enables the optional server engine |
| `REMOVE_BG_API_KEY` | — | remove.bg key (**server only**) |
| `REMOVE_BG_SIZE` | `auto` | remove.bg output size |
| `ISOLA_REMOTE_MAX_UPLOAD_MB` | `12` | Server engine upload limit |
| `ISOLA_REMOTE_RATE_LIMIT_PER_HOUR` | `30` | Per-client limit (in memory, per instance) |
| `ISOLA_REMOTE_ALLOW_CROSS_ORIGIN` | `false` | Allow cross-origin browser calls to the route |
| `NEXT_PUBLIC_ISOLA_SOCIAL_GITHUB` / `_X` / `_INSTAGRAM` / `_LINKEDIN` / `_YOUTUBE` | GitHub: this repo | Footer social links; unset ones aren't shown |
| `NEXT_PUBLIC_ISOLA_SUPPORT_EMAIL` | — | Shows a contact link in the footer and help pages |
| `NEXT_PUBLIC_ISOLA_LEGAL_ENTITY` | `ISOLA` | Copyright line |

No variable is required for the core workflow; only the model files are.

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
  app/                    routes: / (landing), /editor, /batch, /developers, /pricing,
                          /sign-in, /privacy, /terms, /support, /api/engines,
                          /api/remove-background
  components/
    landing/              hero, comparison slider, upload panel, sections
    editor/               shell, canvas (pan/zoom/brush/crop/compare), panels, export
    batch/                batch studio
    ui/                   buttons, sliders, switches, sheets (Radix), progress
    upload/               shared upload + drag-and-drop hooks
  lib/
    config.ts             limits and engine configuration (env-driven)
    image/                content sniffing, validation, decoding, mask PNG codec
    processing/           engine adapter types, model registry, ONNX worker + client,
                          remote engine, registry/hooks
    editor/               mask ops, history, layers, compositing, export
    project/              project store, heavy-asset store, actions
    batch/                batch queue, ZIP export
  server/                 remote provider, usage limiter, auth + billing boundaries
scripts/                  copy-ort.mjs (postinstall), fetch-models.mjs
tests/                    Vitest unit tests
e2e/                      Playwright end-to-end + a11y scripts
```

## Verification

Run against a production build in this repository's sandbox:

- **Unit tests:** 15/15 passing.
- **End-to-end (`npm run test:e2e`): 32/32 checks passing**, including: landing
  upload opens the editor; real on-device removal; exported PNGs are RGBA with
  fully transparent background pixels and original dimensions; erase clears the
  mask; restore returns the exact original RGB; undo/redo; comparison divider
  keyboard control; colour backgrounds in PNG and JPEG; shadows; crop and resize
  dimensions; invalid and oversized files rejected before decoding; transparent
  input; a 24 MP image; retry after a missing-model failure; batch failure → retry,
  concurrency limit, ZIP contents, open-in-editor; mobile toolbar and bottom sheet.
- **Accessibility:** axe-core reports 0 violations on every page, the editor with
  an image, and the export dialog.

Not verified here: WebGPU (unavailable in the headless sandbox, so the High detail
model has only been validated with native ONNX Runtime), Safari and Firefox,
real touch devices, and live calls to remove.bg (its API is unreachable from the
sandbox; the route's validation, rate limiting and error paths were tested).

## Feature status

**Working**

- Landing page from the reference design, with ISOLA branding, draggable
  before/after, upload panel, samples, feature sections and footer.
- One upload path for every entry point (landing, CTA, editor, filmstrip, drag
  and drop, paste, samples) that validates type, size and dimensions.
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
- Batch studio with per-item states, retry, cancel, remove, controlled
  concurrency, open-in-editor and ZIP download.
- Responsive layouts (bottom toolbar and sheets on phones), keyboard shortcuts,
  focus management, reduced-motion support.

**Not yet built / needs integration**

- **Accounts and billing:** `src/server/auth.ts` and `src/server/billing.ts` are
  boundaries only; there is no sign-in and no pricing. The UI says so.
- **Public API:** no hosted API or API keys. The developer page documents only the
  two routes that exist.
- **Server rate limiting** is in memory per instance; use a shared store for
  multi-instance deployments.
- **Project persistence:** projects live in the tab and are lost on reload.
- **Model hosting:** the ~179–224 MB model files must be served by your host or a
  CDN; some platforms cap static file sizes.
- **Large images on phones:** iOS Safari limits canvas size (~16.7 MP), so big
  exports may need a smaller output size there.
- Terms of use are a starting template that should be reviewed.

## Credits

Sample photography from Unsplash (see `public/samples/CREDITS.md`). Models:
IS-Net (DIS, Apache-2.0) and BiRefNet (MIT), mirrored by the rembg project.
