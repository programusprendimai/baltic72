// Build-time entry: renders each localized page to static HTML.
// The site ships zero client JS — React is used only as a templating engine.
import { renderToStaticMarkup } from 'react-dom/server';
import { App, LegalPage } from './App';
import { content, LANGS, type Lang } from './content';
import { legalContent, legalSlugs, type LegalPageKey } from './legal';

export { LANGS, legalSlugs };

function legalTitle(lang: Lang, page: LegalPageKey): string {
  return page === 'privacy'
    ? content[lang].footer.privacyPolicy
    : content[lang].footer.terms;
}

export function render(lang: Lang, page: 'home' | LegalPageKey = 'home'): string {
  if (page === 'privacy' || page === 'terms') {
    return renderToStaticMarkup(<LegalPage lang={lang} page={page} />);
  }
  return renderToStaticMarkup(<App lang={lang} />);
}

export function meta(lang: Lang, page: 'home' | LegalPageKey = 'home') {
  if (page === 'privacy' || page === 'terms') {
    return {
      title: `${legalTitle(lang, page)} | Baltic72`,
      description: legalContent[lang][page].description,
    };
  }
  return content[lang].meta;
}
