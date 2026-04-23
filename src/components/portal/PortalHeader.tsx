import { Language } from '@/types/configurator';
import { SessionUser } from '@/context/AppUserContext';
import { LogOut } from 'lucide-react';

const LANGS: { code: Language; flag: string }[] = [
  { code: 'da', flag: '🇩🇰' },
  { code: 'en', flag: '🇬🇧' },
  { code: 'de', flag: '🇩🇪' },
  { code: 'it', flag: '🇮🇹' },
  { code: 'hu', flag: '🇭🇺' },
];

const T: Record<string, Record<Language, string>> = {
  portal:  { da: 'Forhandlerportal', en: 'Dealer portal', de: 'Händlerportal', it: 'Portale rivenditori', hu: 'Kereskedői portál' },
  welcome: { da: 'Velkommen', en: 'Welcome', de: 'Willkommen', it: 'Benvenuto', hu: 'Üdvözöljük' },
  logout:  { da: 'Log ud', en: 'Log out', de: 'Abmelden', it: 'Esci', hu: 'Kijelentkezés' },
};

const ROLE: Record<string, Record<Language, string>> = {
  slutkunde:     { da: 'Default bruger', en: 'Default user', de: 'Standardbenutzer', it: 'Utente predefinito', hu: 'Alapértelmezett' },
  partner:       { da: 'Partner', en: 'Partner', de: 'Partner', it: 'Partner', hu: 'Partner' },
  timan_saelger: { da: 'Timan Sælger', en: 'Timan Sales', de: 'Timan Verkauf', it: 'Timan Vendite', hu: 'Timan Értékesítő' },
};

interface Props {
  user: SessionUser;
  language: Language;
  onLanguageChange: (lang: Language) => void;
  onLogout: () => void;
}

export default function PortalHeader({ user, language, onLanguageChange, onLogout }: Props) {
  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold">
            T
          </div>
          <div className="min-w-0">
            <h1 className="text-base md:text-lg font-bold text-gray-900 truncate">
              Timan {T.portal[language]}
            </h1>
            <p className="text-xs text-gray-500 truncate">
              {T.welcome[language]}, {user.display_name || user.email}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1 p-1 rounded-lg bg-gray-50 border border-gray-200">
            {LANGS.map(l => (
              <button
                key={l.code}
                onClick={() => onLanguageChange(l.code)}
                className={`px-1.5 py-0.5 rounded transition ${language === l.code ? 'bg-white shadow-sm border border-emerald-300' : 'hover:bg-white'}`}
              >
                <span className="text-base leading-none">{l.flag}</span>
              </button>
            ))}
          </div>

          <span className="hidden md:inline-flex px-2 py-1 rounded-md text-xs font-semibold bg-emerald-100 text-emerald-800">
            {ROLE[user.role]?.[language] || user.role}
          </span>

          <button
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">{T.logout[language]}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
