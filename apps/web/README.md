# @framebits/web

The production Framebits frontend. It is a static React + Vite application
that reads the builder's validated registry JSON; it does not contain mock
components, invented statistics, or duplicated registry data.

## Pages

- `/`: the product overview, with links to the collection and setup guide.
- `/components`: the searchable collection with category filters and component navigation.
- `/components/<slug>`: a component's live preview, source, and install command.
- `/docs`: the setup guide and useful CLI options.

Each page lives in `src/pages/`; shared navigation and UI live in
`src/components/site-ui.tsx`. The header marks the current section. Direct
links and browser history use the same routes through the SPA fallback.

Component pages open a large live preview by default. The toolbar's Preview and
Code tabs switch the same workspace between the animation and its source. The
right-aligned Copy source action works in either view and copies the selected
file. Switching to Code unmounts the demo so hidden animations stop running.

The collection and detail pages share a left sidebar with registry components
grouped by category and the current page highlighted. Its search filters the
navigation and, on the collection, the cards. Desktop navigation stays below
the header and scrolls inside the panel for long lists. At 900 pixels and below,
the component list collapses while search stays visible; Escape closes the
list and returns focus to its toggle.

The homepage hero adapts the supplied ballpit animation with the site's
violet, orange, and cyan tokens. Three.js loads lazily for the hero, pauses
offscreen and when the tab is hidden, and is disposed when leaving Home.
Reduced motion and unavailable WebGL retain the ambient gradient fallback.
Pointer interaction is scoped to the hero and does not block touch scrolling.

Catalog cards show only the component preview and its title. The full card
links to its detail page. While idle they render the generated WebP
(`previews.image`); hover or keyboard focus lazy-loads the real reviewed
in-repo demo through `src/lib/live-demos.tsx`. Leaving, scrolling offscreen,
or hiding the tab unmounts the demo. Reduced motion keeps the still preview,
and touch opens the component on the first tap. The inert preview is outside
the stretched title link so demo controls never become nested links/buttons.
Detail pages render those same demos with interactive controls.
The heavy Three.js demo remains in a separate optional chunk. Live demos
currently share the page's origin; the sandboxed preview architecture in
`docs/SECURITY.md` is planned, not implemented here.

The navbar reads the public GitHub repository's star count with a short
cache and an unavailable state. The shared footer provides grouped links
and a spring-based wordmark interaction. Install commands appear only in
the documentation and on the relevant component's detail page.
Its decorative motion respects reduced motion, and the moving accent
pauses offscreen or while the tab is hidden.

## Commands

```sh
pnpm --filter @framebits/web dev
pnpm --filter @framebits/web build
pnpm --filter @framebits/web preview
pnpm --filter @framebits/web lint
pnpm --filter @framebits/web typecheck
pnpm --filter @framebits/web test
pnpm --filter @framebits/web test:responsive
pnpm --filter @framebits/web test:sidebar
pnpm --filter @framebits/web test:cards
```

The responsive browser check starts and stops its own local Vite server. Run
`pnpm --filter @framebits/web prepare-registry` and `pnpm preview:install` first.
It checks all public pages at 13 viewport sizes from 320 to 1920 pixels, mobile
navigation, keyboard file tabs, search states, and the scrollable docs table.
Screenshots are saved in the ignored `apps/web/test-results/responsive/` folder.
Set `RESPONSIVE_BROWSER_CHANNEL=chrome` to use installed Chrome, or
`RESPONSIVE_BASE_URL` to check an existing development or production preview.

The sidebar check connects to the existing Docker site at `http://localhost:8080`
and never starts a server. It checks registry navigation, search, active links,
mobile keyboard controls, sticky positioning, and long-list scrolling. Use
`SIDEBAR_BASE_URL` to override the site and `SIDEBAR_BROWSER_CHANNEL` to override
the default installed Chrome. Screenshots go to `apps/web/test-results/sidebar/`.

The card check also targets the existing Docker site. It verifies real hover
animation, keyboard focus, whole-card navigation, animation teardown, reduced
motion, first-tap touch navigation, and responsive preview sizing. Override
`CARD_BASE_URL` or `CARD_BROWSER_CHANNEL` when needed; screenshots go to
`apps/web/test-results/cards/`.

Shared layout rules in `src/responsive.css` load after the visual styles.
The navigation collapses at 900 pixels; catalog columns adapt to the available
content width; code and tables scroll inside their own panels. Page and header
containers use the available screen width with small fluid gutters. Component
pages start below the header, with the sidebar at the left edge and the
playground filling the remaining width. Headings and spacing scale between
phone and desktop sizes; reading copy retains its own width limit.

`predev` and `prebuild` generate the real registry into the ignored
`.registry/` directory. Vite uses that directory as `publicDir`, so the
production output contains `/r/index.json`, `/r/<slug>.json`, search data,
schemas, and the build manifest from the same source as the CLI.

Set `VITE_REGISTRY_URL` only when the registry is hosted separately. The
default is the same-origin `/r` path used in production.

## Security note

- `VITE_REGISTRY_URL` is a **build-time trust decision**: it is baked into the
  static bundle. Production must use the same-origin `/r` default or an
  explicit `https://` URL. `http://` is accepted only for
  `localhost`/`127.0.0.1`/`::1` development; `javascript:`/`data:` URLs,
  credentials in the URL, and cross-scheme redirects are rejected. Error UI
  never echoes credentials (see `redactUrl` in `src/lib/registry.ts`).
- Every `loadItem` response is hash-verified in the browser (WebCrypto
  SHA-256 over the same canonical form as shared `computeItemHash`, including
  the legacy pre-`schemaVersion` payload) before rendering. Mismatch aborts
  with an integrity error and renders nothing.
- Registry JSON payloads are capped at 2 MB (`MAX_JSON_BYTES`: `content-length`
  header plus streamed byte and decoded-text length checks before
  `JSON.parse`) with a 10 s per-request timeout (`AbortSignal.timeout`).
- Code previews render only as React text nodes (never `innerHTML`); files
  over 500 KB (`MAX_RENDER_CHARS`, mirroring shared `MAX_FILE_CONTENT_CHARS`)
  render truncated with a "use the CLI" notice and are never fully mounted in
  the DOM nor copied to the clipboard.
- The build manifest hash (`build-manifest.json`) is intentional: it binds
  the exact registry snapshot the site was built against. A manifest/content
  mismatch means the deployment — not the browser — must be re-built.
- Live preview execution uses reviewed in-repo `registry/` sources only (the same
  sources the builder validates and screenshots; no remote code is ever
  loaded), bundled at site-build time. Detail pages execute these bundled
  demos on the main site origin; downloaded registry JSON is displayed as
  data, not executed. Preview demos import the
  `@/lib|@/hooks|@/components/ui` aliases, which the Vite config derives
  from the registry tree itself, plus bare third-party deps rewritten to
  their ESM-resolved files. A demo whose dependency is missing fails the
  build with the exact `pnpm add` hint — that dependency must already be on
  the shared allowlist. `vite dev` serves the sibling `registry/` dir via
  `server.fs.allow`.

## Dependency justification

- `react` and `react-dom`: the approved UI runtime, pinned to the same versions
  as `packages/registry-env`.
- `motion`: purposeful route, reveal, hover, and ambient animations with
  reduced-motion support; already on the registry dependency allowlist.
- `lucide-react`: accessible SVG interface icons; already on the allowlist.
- `clsx` + `tailwind-merge`: runtime of the shared `cn` lib helper that live
  demos import via `@/lib/cn`; pinned to the `registry-env` versions.
- `three` + `@react-three/fiber`: runtime of the 3D component demos;
  Three.js also renders the homepage hero ballpit. They remain in optional
  chunks loaded by the hero or a demo; pinned to the `registry-env` versions.
- `@types/three`: type definitions for the hero scene, pinned to Three.js's
  matching release series.
- `zod`: validates every downloaded registry payload through schemas owned by
  `packages/shared`; already used across the workspace.
- `vite`: static application bundler and development server. It already exists
  in the lockfile through Vitest; declaring it directly makes the web build
  explicit and reproducible. No framework router or state library is added.
- `tailwindcss` + `@tailwindcss/vite`: compile the registry demos' utility classes
  and theme tokens without applying Tailwind's reset to the site. Versions match
  the registry builder. `src/demo-utilities.css` supplies the shimmer animation
  under a separate keyframe name so loading a demo preserves the site skeletons.
