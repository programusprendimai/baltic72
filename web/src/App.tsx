import { content, storeLinks, REPO_URL, LANGS, LANG_NAMES, type Lang } from './content';
import {
  GlobeIcon,
  CheckIcon,
  ChevronDownIcon,
  ShieldLockIcon,
  AppleIcon,
  GooglePlayIcon,
} from './components/icons';
import {
  legalContent,
  legalSlugs,
  legalUpdated,
  type LegalPageKey,
} from './legal';

const FEATURE_IMAGES = [
  'shelter-map',
  'guidance',
  'kit',
  'offline',
  'family-status',
  'local-data',
];

// Small uppercase section label with a short brand rule — sets a clear,
// consistent hierarchy at the top of each section. `dark` adapts it for use
// on the dark Family panel.
function Kicker({
  children,
  dark = false,
}: {
  children: React.ReactNode;
  dark?: boolean;
}) {
  return (
    <p
      className={`flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.16em] ${
        dark ? 'text-brand-soft' : 'text-brand'
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-px w-7 ${dark ? 'bg-brand-soft/40' : 'bg-brand/40'}`}
      />
      {children}
    </p>
  );
}

function StoreBadges({ lang }: { lang: Lang }) {
  const t = content[lang].store;
  const base =
    'inline-flex min-h-[56px] min-w-[170px] items-center gap-3 rounded-xl border border-ink bg-ink px-4 py-2.5 text-white shadow-sm transition-colors hover:bg-slate-800';

  function Badge({
    href,
    icon,
    line,
    name,
  }: {
    href: string | null;
    icon: React.ReactNode;
    line: string;
    name: string;
  }) {
    const inner = (
      <>
        <span className="shrink-0">{icon}</span>
        <span className="flex flex-col text-left leading-tight">
          <span className="text-[11px] font-medium opacity-75">{line}</span>
          <span className="text-base font-semibold">{name}</span>
        </span>
      </>
    );
    if (!href) {
      return (
        <span
          className={`${base} cursor-default opacity-95`}
          aria-disabled="true"
          aria-label={`${name}, ${t.comingSoon}`}
          title={t.comingSoon}
        >
          {inner}
        </span>
      );
    }
    return (
      <a href={href} className={base} target="_blank" rel="noopener noreferrer">
        {inner}
      </a>
    );
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Badge
        href={storeLinks.appStore}
        icon={<AppleIcon width={26} height={26} />}
        line={t.appStoreLine}
        name={t.appStore}
      />
      <Badge
        href={storeLinks.googlePlay}
        icon={<GooglePlayIcon width={24} height={24} />}
        line={t.googlePlayLine}
        name={t.googlePlay}
      />
    </div>
  );
}

// Build the href that switches to language `l`, staying on the same kind of
// page: a localized legal URL when on a legal page, otherwise the home page.
function langHref(l: Lang, page?: LegalPageKey) {
  return page ? `/${l}/${legalSlugs[l][page]}` : `/${l}`;
}

function LanguageMenu({ lang, page }: { lang: Lang; page?: LegalPageKey }) {
  const c = content[lang];
  return (
    <details className="group relative">
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100">
        <GlobeIcon width={18} height={18} />
        <span className="uppercase">{lang}</span>
        <ChevronDownIcon
          width={16}
          height={16}
          className="transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-lg">
        <span className="block px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {c.footer.languageLabel}
        </span>
        {LANGS.map((l) => (
          <a
            key={l}
            href={langHref(l, page)}
            className={`flex items-center justify-between px-4 py-2 text-sm transition-colors hover:bg-slate-50 ${
              l === lang ? 'font-semibold text-brand' : 'text-slate-700'
            }`}
          >
            {LANG_NAMES[l]}
            {l === lang && <CheckIcon width={16} height={16} />}
          </a>
        ))}
      </div>
    </details>
  );
}

function Header({ lang, page }: { lang: Lang; page?: LegalPageKey }) {
  const c = content[lang];
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
        <a href={`/${lang}`} className="flex items-center gap-2.5">
          <img
            src="/app-icon.png"
            alt=""
            className="h-9 w-9 rounded-xl"
            width="36"
            height="36"
          />
          <span className="text-lg font-extrabold tracking-tight text-ink">
            Baltic72
          </span>
        </a>
        <nav className="hidden items-center gap-1 md:flex">
          <a
            href={`/${lang}#features`}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-ink"
          >
            {c.nav.features}
          </a>
          <a
            href={`/${lang}#family`}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-ink"
          >
            {c.nav.family}
          </a>
          <a
            href={`/${lang}#faq`}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-ink"
          >
            {c.nav.faq}
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <LanguageMenu lang={lang} page={page} />
          <a
            href={`/${lang}#download`}
            className="inline-flex min-h-[44px] items-center rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-dark"
          >
            {c.nav.getApp}
          </a>
        </div>
      </div>
    </header>
  );
}

// Floating "live status" chip layered over the hero artwork. Uses the
// preview copy and a calm pulsing indicator to convey a working product.
function StatusCard({ lang }: { lang: Lang }) {
  const c = content[lang];
  return (
    <div className="absolute bottom-3 left-3 w-[min(15rem,calc(100%-1.5rem))] rounded-2xl border border-line bg-white/95 p-3.5 shadow-xl backdrop-blur sm:bottom-5 sm:left-5">
      <div className="flex items-center gap-2.5 text-sm font-semibold text-ink">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full rounded-full bg-safe opacity-60 motion-safe:animate-ping" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-safe" />
        </span>
        {c.preview.status}
      </div>
      <div className="mt-2 flex items-center gap-2.5 text-[13px] text-slate-600">
        <CheckIcon width={16} height={16} className="shrink-0 text-safe" />
        {c.preview.ready}
      </div>
    </div>
  );
}

function HeroArtwork({ lang }: { lang: Lang }) {
  const c = content[lang];
  return (
    <div className="relative mx-auto w-full max-w-[560px] lg:max-w-none">
      <div className="relative rounded-[1.75rem] border border-line bg-brand-tint p-5 sm:p-7">
        <picture>
          <source
            srcSet="/images/hero-preparedness-transparent.webp"
            type="image/webp"
          />
          <img
            src="/images/hero-preparedness-transparent.png"
            alt={c.hero.imageAlt}
            width="1448"
            height="1086"
            className="w-full object-contain"
            loading="eager"
            decoding="async"
          />
        </picture>
      </div>
      <StatusCard lang={lang} />
    </div>
  );
}

function Hero({ lang }: { lang: Lang }) {
  const c = content[lang];
  return (
    <section className="bg-white text-ink">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 lg:grid-cols-2 lg:py-24">
        <div>
          <Kicker>{c.hero.eyebrow}</Kicker>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.5rem]">
            {c.hero.title}
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
            {c.hero.subtitle}
          </p>
          <div className="mt-8">
            <StoreBadges lang={lang} />
          </div>
          <p className="mt-4 flex items-center gap-2 text-sm text-slate-500">
            <ShieldLockIcon width={16} height={16} className="shrink-0 text-brand" />
            {c.hero.note}
          </p>
        </div>
        <div className="flex justify-center lg:justify-end">
          <HeroArtwork lang={lang} />
        </div>
      </div>
    </section>
  );
}

function Stats({ lang }: { lang: Lang }) {
  const c = content[lang];
  return (
    <section className="bg-slate-50">
      <div className="mx-auto max-w-6xl px-5 py-12 lg:py-16">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
          {c.stats.map((s, i) => (
            <div key={i} className="bg-white px-4 py-8 text-center">
              <div className="text-2xl font-extrabold tracking-tight text-brand sm:text-3xl">
                {s.value}
              </div>
              <div className="mt-1.5 text-sm leading-snug text-slate-500">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features({ lang }: { lang: Lang }) {
  const c = content[lang];
  return (
    <section id="features" className="scroll-mt-20 bg-white py-16 lg:py-24">
      <div className="mx-auto max-w-6xl px-5">
        <div className="max-w-2xl">
          <Kicker>{c.nav.features}</Kicker>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            {c.features.title}
          </h2>
          <p className="mt-3 text-lg text-slate-600">{c.features.subtitle}</p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {c.features.items.map((f, i) => {
            const image = FEATURE_IMAGES[i] ?? FEATURE_IMAGES[0];
            return (
              <div
                key={i}
                className="group rounded-2xl border border-line bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-md"
              >
                <div className="flex items-center justify-center rounded-xl border border-line bg-brand-tint p-4">
                  <picture>
                    <source
                      srcSet={`/images/features/${image}.webp`}
                      type="image/webp"
                    />
                    <img
                      src={`/images/features/${image}.png`}
                      alt=""
                      width="640"
                      height="640"
                      className="h-32 w-full object-contain sm:h-36"
                      loading="lazy"
                      decoding="async"
                    />
                  </picture>
                </div>
                <h3 className="mt-5 text-lg font-bold text-ink">{f.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-slate-600">
                  {f.body}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Family({ lang }: { lang: Lang }) {
  const c = content[lang];
  return (
    <section id="family" className="scroll-mt-20 bg-ink py-16 text-white lg:py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 lg:grid-cols-2">
        <div>
          <Kicker dark>{c.family.eyebrow}</Kicker>
          <h2 className="mt-5 text-3xl font-extrabold tracking-tight sm:text-4xl">
            {c.family.title}
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-300">
            {c.family.body}
          </p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8">
          <div className="rounded-2xl bg-white p-4">
            <picture>
              <source srcSet="/images/family-privacy.webp" type="image/webp" />
              <img
                src="/images/family-privacy.png"
                alt=""
                width="960"
                height="720"
                className="w-full rounded-lg object-contain"
                loading="lazy"
                decoding="async"
              />
            </picture>
          </div>
          <div className="mt-6 flex items-center gap-2.5">
            <ShieldLockIcon width={20} height={20} className="text-brand-soft" />
            <h3 className="text-sm font-bold tracking-wide">
              E2EE · XChaCha20-Poly1305
            </h3>
          </div>
          <ol className="mt-5 space-y-4">
            {c.family.points.map((p, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/10 text-[11px] font-bold tabular-nums text-white/80">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="text-[15px] leading-relaxed text-slate-200">
                  {p}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function Download({ lang }: { lang: Lang }) {
  const c = content[lang];
  return (
    <section id="download" className="scroll-mt-20 bg-brand-soft py-16 lg:py-20">
      <div className="mx-auto max-w-3xl px-5">
        <div className="rounded-3xl border border-brand/10 bg-white p-8 text-center shadow-sm sm:p-12">
          <img
            src="/app-icon.png"
            alt=""
            className="mx-auto h-16 w-16 rounded-2xl shadow-sm"
            width="64"
            height="64"
          />
          <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            {c.download.title}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-lg text-slate-600">
            {c.download.body}
          </p>
          <div className="mt-8 flex justify-center">
            <StoreBadges lang={lang} />
          </div>
        </div>
      </div>
    </section>
  );
}

function Faq({ lang }: { lang: Lang }) {
  const c = content[lang];
  return (
    <section id="faq" className="scroll-mt-20 bg-white py-16 lg:py-24">
      <div className="mx-auto max-w-3xl px-5">
        <Kicker>{c.nav.faq}</Kicker>
        <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
          {c.faq.title}
        </h2>
        <div className="mt-10 space-y-3">
          {c.faq.items.map((f, i) => (
            <details
              key={i}
              className="group rounded-2xl border border-line bg-white px-5 transition-colors open:border-brand/20 open:shadow-sm"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left text-[17px] font-semibold text-ink">
                {f.q}
                <ChevronDownIcon
                  width={20}
                  height={20}
                  className="shrink-0 text-slate-400 transition-transform group-open:rotate-180"
                />
              </summary>
              <p className="pb-5 text-[15px] leading-relaxed text-slate-600">
                {f.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer({ lang }: { lang: Lang }) {
  const c = content[lang];
  const year = 2026;
  return (
    <footer className="border-t border-slate-800 bg-slate-950 py-12 text-slate-400">
      <div className="mx-auto max-w-6xl px-5">
        <div className="flex flex-col gap-8 md:flex-row md:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5 text-white">
              <img
                src="/app-icon.png"
                alt=""
                className="h-8 w-8 rounded-lg"
                width="32"
                height="32"
              />
              <span className="text-lg font-extrabold">Baltic72</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed">{c.footer.tagline}</p>
          </div>
          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {c.footer.privacy}
              </h3>
              <p className="mt-2 max-w-xs text-sm leading-relaxed">
                {c.footer.privacyBody}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                <a
                  href={`/${lang}/${legalSlugs[lang].privacy}`}
                  className="text-sm font-medium text-slate-300 transition-colors hover:text-white"
                >
                  {c.footer.privacyPolicy}
                </a>
                <a
                  href={`/${lang}/${legalSlugs[lang].terms}`}
                  className="text-sm font-medium text-slate-300 transition-colors hover:text-white"
                >
                  {c.footer.terms}
                </a>
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {c.footer.languageLabel}
              </h3>
              <ul className="mt-2 space-y-1">
                {LANGS.map((l) => (
                  <li key={l}>
                    <a
                      href={`/${l}`}
                      className={`text-sm transition-colors hover:text-white ${
                        l === lang ? 'font-semibold text-white' : ''
                      }`}
                    >
                      {LANG_NAMES[l]}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <div className="mt-10 border-t border-slate-800 pt-6 text-xs leading-relaxed">
          <p className="text-slate-500">
            <span className="font-semibold text-slate-400">
              {c.footer.sourcesLabel}:
            </span>{' '}
            {c.footer.sources}
          </p>
          <p className="mt-3 text-slate-500">
            © {year} {c.footer.rights}{' '}
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-slate-400 underline decoration-slate-600 underline-offset-2 hover:text-white"
            >
              {c.footer.sourceCode} ↗
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}

export function App({ lang }: { lang: Lang }) {
  return (
    <>
      <Header lang={lang} />
      <main>
        <Hero lang={lang} />
        <Stats lang={lang} />
        <Features lang={lang} />
        <Family lang={lang} />
        <Download lang={lang} />
        <Faq lang={lang} />
      </main>
      <Footer lang={lang} />
    </>
  );
}

export function LegalPage({ lang, page }: { lang: Lang; page: LegalPageKey }) {
  const c = legalContent[lang][page];
  const u = legalUpdated[lang];
  const title =
    page === 'privacy'
      ? content[lang].footer.privacyPolicy
      : content[lang].footer.terms;
  return (
    <>
      <Header lang={lang} page={page} />
      <main className="bg-slate-50">
        <article className="mx-auto max-w-3xl px-5 py-16 lg:py-20">
          <a
            href={`/${lang}`}
            className="text-sm font-semibold text-brand transition-colors hover:text-brand-dark"
          >
            Baltic72
          </a>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
            {title}
          </h1>
          <p className="mt-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            {u.label} {u.date}
          </p>
          <div className="mt-8 space-y-4 text-lg leading-relaxed text-slate-600">
            {c.intro.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
          <div className="mt-12 space-y-10">
            {c.sections.map((section) => (
              <section key={section.title}>
                <h2 className="text-2xl font-extrabold tracking-tight text-ink">
                  {section.title}
                </h2>
                {section.body && (
                  <div className="mt-4 space-y-3 text-base leading-relaxed text-slate-600">
                    {section.body.map((p) => (
                      <p key={p}>{p}</p>
                    ))}
                  </div>
                )}
                {section.bullets && (
                  <ul className="mt-4 list-disc space-y-2 pl-6 text-base leading-relaxed text-slate-600">
                    {section.bullets.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </article>
      </main>
      <Footer lang={lang} />
    </>
  );
}
