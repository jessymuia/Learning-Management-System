import en from './en.json';
import sw from './sw.json';

const catalogs: Record<string, Record<string, string>> = { en, sw };

// ICU-lite: interpolates {name} style tokens; falls back to key if missing.
export function createTranslator(locale: string) {
  const dict = catalogs[locale] ?? catalogs.en;
  return (key: string, vars?: Record<string, string | number>) => {
    let s = dict[key] ?? catalogs.en[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }
    return s;
  };
}

export const SUPPORTED_LOCALES = ['en', 'sw'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
