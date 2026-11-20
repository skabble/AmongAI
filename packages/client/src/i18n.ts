import type { Lang } from '@desalinhados/shared';
import { en, pt, type Dict } from './messages';
import { LANG_KEY, getState, send, setState, useStore } from './store';

const DICTS: Record<Lang, Dict> = { pt, en };

export type Params = Record<string, string | number>;
export type T = (key: string, params?: Params) => string;

export function translate(lang: Lang, key: string, params?: Params): string {
  const text = DICTS[lang][key] ?? DICTS.pt[key] ?? key;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

/** Função de tradução na língua atual; os componentes voltam a desenhar quando a língua muda. */
export function useT(): T {
  const lang = useStore((s) => s.lang);
  return (key, params) => translate(lang, key, params);
}

/** Tradução fora do React (por exemplo na cena do jogo). */
export function t(key: string, params?: Params): string {
  return translate(getState().lang, key, params);
}

export function setLang(lang: Lang): void {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // a escolha vale só para esta sessão
  }
  document.documentElement.lang = lang === 'pt' ? 'pt-PT' : 'en';
  document.title = translate(lang, 'app.title');
  setState({ lang });
  send('lang', { lang });
}
