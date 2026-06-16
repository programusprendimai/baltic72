// Pure routing logic, shared by the Worker (worker/index.ts) and the unit
// test (scripts/test-routing.mjs). No Worker-only APIs — just the global URL.

export const LANGS = ['en', 'lt', 'lv', 'et', 'pl'];
const DEFAULT_LANG = 'en';
const PRIMARY_HOST = 'baltic72.com';

// Which language an alt TLD's visitors are sent to.
const TLD_LANG = { lt: 'lt', lv: 'lv', eu: 'en' };
const COUNTRY_LANG = { LT: 'lt', LV: 'lv', EE: 'et', PL: 'pl' };

// Legacy legal URLs (pre-localization) → canonical English localized slugs.
const LEGACY_LEGAL = {
  '/privacy': '/en/privacy-policy',
  '/terms': '/en/terms-and-conditions',
};

/** Best language for the visitor from an Accept-Language header value. */
export function pickLang(accept) {
  if (accept) {
    for (const part of accept.split(',')) {
      const code = part.split(';')[0].trim().slice(0, 2).toLowerCase();
      if (LANGS.includes(code)) return code;
    }
  }
  return DEFAULT_LANG;
}

/** Best language for the visitor from Cloudflare's country code. */
export function pickCountryLang(country) {
  if (!country) return null;
  return COUNTRY_LANG[country.trim().toUpperCase()] ?? null;
}

export function pickRootLang(accept, country) {
  return pickCountryLang(country) ?? pickLang(accept);
}

/** Hosts we never redirect: localhost, *.workers.dev, raw IPv4. */
function isInternalHost(host) {
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.workers.dev') ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host)
  );
}

/**
 * Decide whether a request should be redirected before serving assets.
 * @param {string} urlString  the request URL
 * @param {string|null} acceptLang  the Accept-Language header
 * @param {string|null} country  Cloudflare CF-IPCountry / request.cf.country
 * @returns {{ status: number, location: string } | null}  null = serve as-is
 */
export function planRedirect(urlString, acceptLang, country = null) {
  const url = new URL(urlString);
  const host = url.hostname.toLowerCase();

  // 1. Canonicalize host: alt domains and www.* → baltic72.com.
  if (!isInternalHost(host) && host !== PRIMARY_HOST) {
    const bare = host.replace(/^www\./, '');
    url.protocol = 'https:';
    url.hostname = PRIMARY_HOST;
    url.port = '';

    if (bare === PRIMARY_HOST) {
      // www.baltic72.com → keep the requested path, but resolve a bare root
      // straight to a language home so visitors aren't redirected twice.
      if (url.pathname === '/' || url.pathname === '') {
        url.pathname = `/${pickRootLang(acceptLang, country)}`;
        url.search = '';
      }
      return { status: 301, location: url.toString() };
    }
    // Alt TLD (baltic72.lt/.lv/.eu) → language home.
    const tld = bare.split('.').pop() ?? '';
    const lang = TLD_LANG[tld] ?? pickLang(acceptLang);
    url.pathname = `/${lang}`;
    url.search = '';
    return { status: 301, location: url.toString() };
  }

  // 2. Legacy legal URLs → canonical localized slugs (permanent).
  const legacy = LEGACY_LEGAL[url.pathname];
  if (legacy) {
    url.pathname = legacy;
    url.search = '';
    return { status: 301, location: url.toString() };
  }

  // 3. Root → language home (same host).
  if (url.pathname === '/' || url.pathname === '') {
    url.pathname = `/${pickRootLang(acceptLang, country)}`;
    return { status: 302, location: url.toString() };
  }

  return null;
}
