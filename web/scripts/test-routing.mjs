// Unit test for the Worker redirect logic. Run: npm run test:routing
import assert from 'node:assert/strict';
import { planRedirect, pickLang } from '../worker/routing.mjs';

let n = 0;
function check(desc, actual, expected) {
  n++;
  assert.deepEqual(actual, expected, `${desc}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  console.log(`  ok  ${desc}`);
}

// Alt TLDs → canonical .com language home.
check('baltic72.lt → /lt', planRedirect('https://baltic72.lt/', 'en'), { status: 301, location: 'https://baltic72.com/lt' });
check('baltic72.lv/anything → /lv', planRedirect('https://baltic72.lv/foo?x=1', 'en'), { status: 301, location: 'https://baltic72.com/lv' });
check('baltic72.eu → /en', planRedirect('https://baltic72.eu/', null), { status: 301, location: 'https://baltic72.com/en' });
check('www alt: www.baltic72.lt → /lt', planRedirect('https://www.baltic72.lt/', null), { status: 301, location: 'https://baltic72.com/lt' });

// www on the primary domain keeps the path.
check('www.baltic72.com/lt → /lt (keep path)', planRedirect('https://www.baltic72.com/lt', null), { status: 301, location: 'https://baltic72.com/lt' });
check('www.baltic72.com root → /en (one hop)', planRedirect('https://www.baltic72.com/', null), { status: 301, location: 'https://baltic72.com/en' });
check('www.baltic72.com root (Accept lv) → /lv', planRedirect('https://www.baltic72.com/', 'lv'), { status: 301, location: 'https://baltic72.com/lv' });
check('www.baltic72.com root (country EE) → /et', planRedirect('https://www.baltic72.com/', 'en', 'EE'), { status: 301, location: 'https://baltic72.com/et' });

// Primary domain root → language home; deep paths served as-is.
check('baltic72.com/ → /en', planRedirect('https://baltic72.com/', null), { status: 302, location: 'https://baltic72.com/en' });
check('baltic72.com/ (country LT) → /lt', planRedirect('https://baltic72.com/', 'en-US,en;q=0.9', 'LT'), { status: 302, location: 'https://baltic72.com/lt' });
check('baltic72.com/ (country LV) → /lv', planRedirect('https://baltic72.com/', null, 'LV'), { status: 302, location: 'https://baltic72.com/lv' });
check('baltic72.com/ (country EE) → /et', planRedirect('https://baltic72.com/', null, 'EE'), { status: 302, location: 'https://baltic72.com/et' });
check('baltic72.com/ (country PL) → /pl', planRedirect('https://baltic72.com/', null, 'PL'), { status: 302, location: 'https://baltic72.com/pl' });
check('baltic72.com/ (unsupported country + Accept lt) → /lt', planRedirect('https://baltic72.com/', 'lt-LT,lt;q=0.9', 'DE'), { status: 302, location: 'https://baltic72.com/lt' });
check('baltic72.com/ (Accept pl) → /pl', planRedirect('https://baltic72.com/', 'pl-PL,pl;q=0.9'), { status: 302, location: 'https://baltic72.com/pl' });
check('baltic72.com/lt → serve', planRedirect('https://baltic72.com/lt', null), null);
check('baltic72.com/assets/x.css → serve', planRedirect('https://baltic72.com/assets/x.css', null), null);

// Localized legal URLs are served as-is.
check('baltic72.com/lt/privatumo-politika → serve', planRedirect('https://baltic72.com/lt/privatumo-politika', null), null);
check('baltic72.com/en/terms-and-conditions → serve', planRedirect('https://baltic72.com/en/terms-and-conditions', null), null);

// Legacy legal URLs → canonical English localized slugs (301).
check('baltic72.com/privacy → /en/privacy-policy', planRedirect('https://baltic72.com/privacy', null), { status: 301, location: 'https://baltic72.com/en/privacy-policy' });
check('baltic72.com/terms → /en/terms-and-conditions', planRedirect('https://baltic72.com/terms', null), { status: 301, location: 'https://baltic72.com/en/terms-and-conditions' });
// Alt domain to a legacy legal path still canonicalizes host first (to its language home).
check('baltic72.lt/privacy → /lt (host first)', planRedirect('https://baltic72.lt/privacy', null), { status: 301, location: 'https://baltic72.com/lt' });

// Local/dev hosts are never host-redirected; root still picks a language.
check('localhost root → /en', planRedirect('http://localhost:8788/', null), { status: 302, location: 'http://localhost:8788/en' });
check('localhost/lv → serve', planRedirect('http://localhost:8788/lv', null), null);

// pickLang.
check('pickLang pl', pickLang('pl-PL,pl;q=0.9'), 'pl');
check('pickLang et', pickLang('et;q=1.0'), 'et');
check('pickLang unknown → en', pickLang('fr-FR,fr'), 'en');
check('pickLang empty → en', pickLang(null), 'en');

console.log(`\n${n} routing checks passed.`);
