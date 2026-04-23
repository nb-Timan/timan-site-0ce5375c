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
      <div className="max-w-7xl mx-auto px-6 md:px-10 h-16 flex items-center justify-between gap-4">
        {/* Left: TIMAN wordmark + pipe + subtitle (matches "TIMAN | Forhandler Portal") */}
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="text-2xl font-bold tracking-tight text-emerald-700">
            TIMAN
          </span>
          <span className="text-gray-300 text-lg leading-none" aria-hidden="true">|</span>
          <span className="hidden sm:inline text-sm text-gray-500">
            {T.portal[language]}
          </span>
        </div>

        {/* Right: language flags, user chip, logout */}
        <div className="flex items-center gap-3 md:gap-4">
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

          {/* User chip — circular avatar + name to the right */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center text-sm font-bold">
              {initials}
            </div>
            <span className="hidden md:inline text-sm font-semibold text-gray-800 truncate max-w-[180px]">
              {displayName}
            </span>
          </div>

          <button
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition"
            aria-label={T.logout[language]}
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden lg:inline">{T.logout[language]}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
