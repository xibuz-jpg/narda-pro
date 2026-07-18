import { create } from 'zustand';
import { translations, LANGUAGES, type Lang } from './translations';
import { getTelegramLanguage } from '../lib/telegram';

const STORAGE_KEY = 'narda.lang';

/** Pick the initial language: saved choice → Telegram language → Uzbek. */
function detectLanguage(): Lang {
  const stored = localStorage.getItem(STORAGE_KEY) as Lang | null;
  if (stored && (LANGUAGES as readonly string[]).includes(stored)) return stored;
  const tg = (getTelegramLanguage() ?? '').toLowerCase();
  if (tg.startsWith('ru')) return 'ru';
  if (tg.startsWith('uz')) return 'uz';
  return 'uz';
}

interface I18nState {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

export const useI18n = create<I18nState>((set) => ({
  lang: detectLanguage(),
  setLang: (lang) => {
    localStorage.setItem(STORAGE_KEY, lang);
    set({ lang });
  },
}));

export type Translate = (key: string, params?: Record<string, string | number>) => string;

/** Returns the translator bound to the current language. */
export function useT(): Translate {
  const lang = useI18n((s) => s.lang);
  return (key, params) => {
    let text = translations[lang][key] ?? translations.en[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) text = text.replace(`{${k}}`, String(v));
    }
    return text;
  };
}
