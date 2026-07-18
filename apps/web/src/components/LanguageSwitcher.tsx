import { useI18n } from '../i18n/i18n';
import { SELECTABLE_LANGUAGES, LANGUAGE_NAMES } from '../i18n/translations';

/** Compact segmented control for choosing the interface language. */
export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const lang = useI18n((s) => s.lang);
  const setLang = useI18n((s) => s.setLang);

  return (
    <div className={`inline-flex rounded-xl border border-white/10 bg-white/5 p-0.5 ${className}`}>
      {SELECTABLE_LANGUAGES.map((code) => (
        <button
          key={code}
          onClick={() => setLang(code)}
          className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
            lang === code ? 'bg-accent text-night-900' : 'text-slate-300 hover:text-white'
          }`}
        >
          {LANGUAGE_NAMES[code]}
        </button>
      ))}
    </div>
  );
}
