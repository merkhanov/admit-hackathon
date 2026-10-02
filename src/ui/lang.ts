import { lang, LANGS, t, type Key } from '../i18n.ts';

/**
 * Fills the page's fixed texts in the current language: the title, the description,
 * and every element marked data-i18n (its text) or data-i18n-aria (its aria-label).
 */
export function applyPageText(): void {
  document.documentElement.lang = lang();
  document.title = t('meta.title');
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('meta.description'));
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) el.textContent = t(el.dataset.i18n as Key);
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria as Key));
}

/** The language switcher: one button per language, the current one pressed. */
export function langSwitchHtml(): string {
  return `
    <div class="lang-switch" role="group" aria-label="${t('lang.label')}">
      ${LANGS.map((l) => `<button type="button" data-lang="${l.id}" lang="${l.id}" aria-pressed="${l.id === lang()}">${l.label}</button>`).join('')}
    </div>`;
}
