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
  portal:  { da: 'Forhandler Portal', en: 'Dealer Portal', de: 'Händler Portal', it: 'Portale Rivenditori', hu: 'Kereskedői Portál' },
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

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function PortalHeader({ user, language, onLanguageChange, onLogout }: Props) {
  const displayName = user.display_name || user.email || '';
  const initials = getInitials(displayName);

  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-4 flex items-center justify-between gap-4">
        {/* Left: TIMAN wordmark + subtitle */}
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xl md:text-2xl font-bold tracking-tight text-emerald-700">
            TIMAN
          </span>
          <span className="hidden sm:inline-block w-px h-6 bg-gray-200" aria-hidden="true" />
          <span className="hidden sm:inline text-sm text-gray-400 truncate">
            {T.portal[language]}
          </span>
        </div>

        {/* Right: language flags, role, user chip, logout */}
        <div className="flex items-center gap-2 md:gap-3">
          <div className="hidden sm:flex items-center gap-1 p-1 rounded-lg bg-gray-50 border border-gray-200">
            {LANGS.map(l => (
              <button
                key={l.code}
                onClick={() => onLanguageChange(l.code)}
                className={`px-1.5 py-0.5 rounded transition ${language === l.code ? 'bg-white shadow-sm border border-emerald-300' : 'hover:bg-white'}`}
                aria-label={l.code}
              >
                <span className="text-base leading-none">{l.flag}</span>
              </button>
            ))}
          </div>

          <span className="hidden md:inline-flex px-2 py-1 rounded-md text-xs font-semibold bg-emerald-100 text-emerald-800">
            {ROLE[user.role]?.[language] || user.role}
          </span>

          {/* User chip */}
          <div className="flex items-center gap-2 pl-2 md:pl-3 md:border-l md:border-gray-200">
            <div className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold">
              {initials}
            </div>
            <span className="hidden md:inline text-sm font-medium text-gray-700 truncate max-w-[160px]">
              {displayName}
            </span>
          </div>

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
