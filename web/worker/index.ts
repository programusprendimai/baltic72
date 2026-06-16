/**
 * Baltic72 marketing site Worker.
 *
 * - Serves the prerendered static pages from dist/client (the ASSETS binding).
 * - Redirects "/" to a language under baltic72.com/{lang} (country, then Accept-Language).
 * - Redirects the alt domains baltic72.lv / .lt / .eu (and any www.*) to the
 *   canonical baltic72.com, sending alt-TLDs to their matching language home.
 *
 * The redirect decision lives in ./routing.mjs so it can be unit-tested
 * (npm run test:routing) — local `wrangler dev` always reports the request
 * host as the configured custom domain, so the alt-domain branch can't be
 * exercised there.
 */
import { planRedirect, pickRootLang } from './routing.mjs';

interface Env {
  ASSETS: {
    fetch(request: Request): Response | Promise<Response>;
  };
}

const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "base-uri 'none'",
    "connect-src 'self'",
    "font-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data:",
    "manifest-src 'self'",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
  ].join('; '),
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
} as const;

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function withAppAssociationHeaders(response: Response): Response {
  const secured = withSecurityHeaders(response);
  const headers = new Headers(secured.headers);
  headers.set('content-type', 'application/json');
  headers.set('cache-control', 'public, max-age=300');
  return new Response(secured.body, {
    status: secured.status,
    statusText: secured.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const accept = request.headers.get('accept-language');
    const cfCountry = (request as Request & { cf?: { country?: string } }).cf?.country;
    const country =
      cfCountry ?? request.headers.get('cf-ipcountry') ?? null;

    const plan = planRedirect(request.url, accept, country);
    if (plan) return withSecurityHeaders(Response.redirect(plan.location, plan.status));

    // Serve prerendered pages / static assets.
    const res = await env.ASSETS.fetch(request);
    const url = new URL(request.url);
    if (url.pathname === '/.well-known/apple-app-site-association') {
      return withAppAssociationHeaders(res);
    }

    // Unknown page route (no file extension) → fall back to a language home.
    if (res.status === 404 && !url.pathname.includes('.') && url.pathname !== '/join') {
      return withSecurityHeaders(
        Response.redirect(new URL(`/${pickRootLang(accept, country)}`, url).toString(), 302),
      );
    }
    return withSecurityHeaders(res);
  },
};
