// Public legal pages (Privacy Policy + Terms), served by the marketing site at
// /{lang}/{slug}. Slugs are localized and mirror web/src/legal.ts.
//
// The app ships six languages but the legal site currently has five (no `uk`),
// so Ukrainian — and any unmapped locale — falls back to the English page.
export type LegalPage = 'privacy' | 'terms';

const LEGAL_BASE = 'https://baltic72.com';

const LEGAL_SLUGS: Record<string, Record<LegalPage, string>> = {
  en: { privacy: 'privacy-policy', terms: 'terms-and-conditions' },
  lt: { privacy: 'privatumo-politika', terms: 'naudojimo-salygos' },
  lv: { privacy: 'privatuma-politika', terms: 'lietosanas-noteikumi' },
  et: { privacy: 'privaatsuspoliitika', terms: 'kasutustingimused' },
  pl: { privacy: 'polityka-prywatnosci', terms: 'regulamin' },
};

/** Build the public URL for a legal page in the user's language (en fallback). */
export function legalUrl(locale: string, page: LegalPage): string {
  const lang = LEGAL_SLUGS[locale] ? locale : 'en';
  return `${LEGAL_BASE}/${lang}/${LEGAL_SLUGS[lang][page]}`;
}
