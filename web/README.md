# Baltic72 — marketing site

Public landing page at **baltic72.com**, localized at `baltic72.com/{lang}` for
`en` (default), `lt`, `lv`, `et`, `pl`.

Stack: **Vite + React + Tailwind v4**, prerendered to static HTML per language
(zero client JS — React is used only as a build-time templating engine), served
by a thin **Cloudflare Worker** (`baltic72-web`) that handles language routing
and domain redirects. Separate from the Family API Worker in `../server`.

## Develop

```bash
npm install
npm run dev          # Vite dev server (design preview, English)
```

## Build & verify

```bash
npm run build        # client → dist/client, SSR build, then prerender all langs
npm run test:routing # unit-tests the Worker redirect logic (worker/routing.mjs)
npm run typecheck    # tsc for src/ and worker/
npm run preview      # build, then serve via the real Worker (wrangler dev)
```

`npm run build` runs three steps: `build:client` (Vite → `dist/client`),
`build:server` (SSR bundle → `dist/server`), and `prerender`
(`scripts/prerender.mjs` writes `dist/client/{lang}/index.html`, the root
fallback, and `sitemap.xml`).

## Deploy

```bash
npm run deploy       # npm run build && wrangler deploy
```

`wrangler` is already authenticated on this machine (see the repo `CLAUDE.md`).
The `baltic72.com` zone is on the account; the Worker is bound to `baltic72.com`
and `www.baltic72.com` as custom domains in `wrangler.toml`.

## Routing (Worker)

`worker/index.ts` + `worker/routing.mjs`:

- `/` → 302 to `/{lang}` chosen from Cloudflare country (`LT`→`lt`, `LV`→`lv`, `EE`→`et`, `PL`→`pl`), then `Accept-Language`, then `en`.
- `/{lang}` (`/lt`, `/lv`, …) → serves the prerendered page (`html_handling = "drop-trailing-slash"`, so `/lt/` → `/lt`).
- Unknown page paths → 302 to a language home.
- `/join#v=1&g=…&t=…` is reserved for app family-invite universal links and is not rewritten to a language home.
- `www.baltic72.com` → `baltic72.com` (path kept; bare root resolves to a language).
- Alt TLDs `baltic72.lt` / `.lv` / `.eu` → 301 to `baltic72.com/{lang}` (`.lt`→`lt`, `.lv`→`lv`, `.eu`→`en`).

> Note: `wrangler dev` always reports the request host as the configured custom
> domain (`baltic72.com`), so the alt-domain branch can't be exercised locally —
> that is what `npm run test:routing` is for.

### Enabling the alt domains (baltic72.lt / .lv / .eu)

The redirect code is ready, but each alt domain must be a zone on this
Cloudflare account before the Worker can receive its traffic:

1. Add the site in the Cloudflare dashboard and point its registrar nameservers at Cloudflare.
2. Uncomment that domain's `[[routes]]` block in `wrangler.toml`.
3. `npm run deploy`.

## Editing content

All copy lives in **`src/content.ts`**, keyed by language (`en` defines the
shape). To add a language, extend `LANGS` and add a matching entry, then add it
to `TLD_LANG`/`OG_LOCALE` if relevant.

## App store links

In `src/content.ts`, `storeLinks` is `{ appStore: null, googlePlay: null }`,
which renders disabled **"Coming soon"** badges. Paste the real listing URLs
there and rebuild to make the badges live.
