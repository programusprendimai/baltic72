// Prerender each localized page into dist/client/{lang}/index.html, write the
// root index.html (English fallback), and emit sitemap.xml.
//
// Run after `vite build` (client → dist/client) and
// `vite build --ssr ... --outDir dist/server`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const clientDir = path.join(root, 'dist', 'client');
const serverEntry = path.join(root, 'dist', 'server', 'entry-server.js');

const ORIGIN = 'https://baltic72.com';
const OG_LOCALE = { en: 'en', lt: 'lt_LT', lv: 'lv_LV', et: 'et_EE', pl: 'pl_PL' };

const { render, meta, LANGS, legalSlugs } = await import(pathToFileURL(serverEntry).href);

const LEGAL_PAGES = ['privacy', 'terms'];

const template = fs.readFileSync(path.join(clientDir, 'index.html'), 'utf8');

function escapeAttr(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// URL path for a page: home → "{lang}", legal → "{lang}/{localized-slug}".
function pagePath(lang, page = 'home') {
  return page === 'home' ? lang : `${lang}/${legalSlugs[lang][page]}`;
}

function headTags(lang, page = 'home') {
  const m = meta(lang, page);
  const url = `${ORIGIN}/${pagePath(lang, page)}`;
  const desc = escapeAttr(m.description);
  const title = escapeAttr(m.title);
  const tags = [
    `    <meta name="description" content="${desc}" />`,
    `    <link rel="canonical" href="${url}" />`,
    `    <meta property="og:type" content="website" />`,
    `    <meta property="og:site_name" content="Baltic72" />`,
    `    <meta property="og:title" content="${title}" />`,
    `    <meta property="og:description" content="${desc}" />`,
    `    <meta property="og:url" content="${url}" />`,
    `    <meta property="og:locale" content="${OG_LOCALE[lang] ?? lang}" />`,
    `    <meta property="og:image" content="${ORIGIN}/app-icon.png" />`,
    `    <meta name="twitter:card" content="summary" />`,
    `    <meta name="twitter:title" content="${title}" />`,
    `    <meta name="twitter:description" content="${desc}" />`,
  ];
  // hreflang alternates link each localized variant of the same page.
  const alternates = LANGS.map(
    (l) => `    <link rel="alternate" hreflang="${l}" href="${ORIGIN}/${pagePath(l, page)}" />`,
  ).join('\n');
  tags.splice(2, 0, alternates, `    <link rel="alternate" hreflang="x-default" href="${ORIGIN}/${pagePath('en', page)}" />`);
  return tags.join('\n');
}

function pageHtml(lang, page = 'home') {
  const m = meta(lang, page);
  return template
    .replace('<html lang="en">', `<html lang="${lang}">`)
    .replace('<title>Baltic72</title>', `<title>${escapeAttr(m.title)}</title>`)
    .replace('    <!--app-head-->', headTags(lang, page))
    .replace('<!--app-html-->', render(lang, page));
}

for (const lang of LANGS) {
  const outDir = path.join(clientDir, lang);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), pageHtml(lang));
  console.log(`prerendered /${lang}`);

  // Localized legal pages: /{lang}/{slug}/index.html.
  for (const page of LEGAL_PAGES) {
    const slug = legalSlugs[lang][page];
    const legalDir = path.join(outDir, slug);
    fs.mkdirSync(legalDir, { recursive: true });
    fs.writeFileSync(path.join(legalDir, 'index.html'), pageHtml(lang, page));
    console.log(`prerendered /${lang}/${slug}`);
  }
}

// Root index.html as an English fallback (the Worker normally redirects "/").
fs.writeFileSync(path.join(clientDir, 'index.html'), pageHtml('en'));

// sitemap.xml — home + every localized legal page.
const sitemapUrls = [
  ...LANGS.map((l) => `${ORIGIN}/${l}`),
  ...LANGS.flatMap((l) =>
    LEGAL_PAGES.map((page) => `${ORIGIN}/${pagePath(l, page)}`),
  ),
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map((url) => `  <url><loc>${url}</loc></url>`).join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(clientDir, 'sitemap.xml'), sitemap);
console.log('wrote sitemap.xml');
