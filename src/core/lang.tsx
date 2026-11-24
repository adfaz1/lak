import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Lang = 'ar' | 'en';
/** A string in both languages. Fixtures and labels use this so every screen works in Arabic and English. */
export type L = Record<Lang, string>;

interface LangState { lang: Lang; dir: 'rtl' | 'ltr'; setLang: (l: Lang) => void }
const Ctx = createContext<LangState>({ lang: 'ar', dir: 'rtl', setLang: () => {} });

function read(): Lang {
  try { return localStorage.getItem('lak.lang') === 'en' ? 'en' : 'ar'; } catch { return 'ar'; }
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(read);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    try { localStorage.setItem('lak.lang', lang); } catch { /* preference only */ }
  }, [lang, dir]);
  return <Ctx.Provider value={{ lang, dir, setLang }}>{children}</Ctx.Provider>;
}

export const useLang = () => useContext(Ctx);

/** Pick the current language's branch of a `{ ar, en }` dictionary. */
export function useT<T>(dict: Record<Lang, T>): T {
  return dict[useLang().lang];
}
