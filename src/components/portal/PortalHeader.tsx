import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Language } from '@/types/configurator';
import { SessionUser } from '@/context/AppUserContext';
import { Bell, LogOut, ChevronDown, Check } from 'lucide-react';
import timanLogo from '@/assets/timan-logo.png';
import { fetchPendingUserCount } from '@/lib/dealerAccountsService';
import { derivePortalRole, getPortalPermissions } from '@/lib/portalAccess';
import {
  canSwitchMode,
  getActiveMode,
  setActiveMode,
  SELLER_VIEWS,
  ROLE_PREVIEWS,
  type ActiveMode,
} from '@/lib/activeMode';
import { enterExhibitionMode, leaveExhibitionMode } from '@/lib/exhibitionMode';
import { getCachedRealBackendUser } from '@/lib/cachedRealUser';
import { useSellerDirectory, resolveSellerDisplay } from '@/lib/sellerDirectory';
import { PORTAL_LANGUAGES, type PortalUiLanguage } from '@/lib/portalLanguages';
import { useLanguage } from '@/context/LanguageContext';

const LANGS = PORTAL_LANGUAGES;

const T: Record<string, Record<Language, string>> = {
  portal:        { da: 'Forhandler Portal', en: 'Dealer Portal', de: 'Händler Portal', it: 'Portale Rivenditori', hu: 'Kereskedői Portál' },
  logout:        { da: 'Log ud', en: 'Log out', de: 'Abmelden', it: 'Esci', hu: 'Kijelentkezés' },
  backendMode:   { da: 'Backend', en: 'Backend', de: 'Backend', it: 'Backend', hu: 'Backend' },
  switchMode:    { da: 'Vis som sælger', en: 'View as seller', de: 'Als Verkäufer ansehen', it: 'Visualizza come venditore', hu: 'Megtekintés értékesítőként' },
  rolePreview:   { da: 'Vis som rolle', en: 'View as role', de: 'Als Rolle ansehen', it: 'Visualizza come ruolo', hu: 'Megtekintés szerepként' },
  viewingAs:     { da: 'Vis som', en: 'Viewing as', de: 'Ansicht als', it: 'Visualizzazione come', hu: 'Megtekintés mint' },
  filteredNote:  { da: 'filtreret sælger-visning. Skift til Backend for global visning.', en: 'filtered seller view. Switch to Backend for the global view.', de: 'gefilterte Verkäuferansicht. Zurück zu Backend für die globale Ansicht.', it: 'vista venditore filtrata. Torna a Backend per la vista globale.', hu: 'szűrt értékesítői nézet. Váltson Backend-re a globális nézethez.' },
  rolePreviewNote: { da: 'rolle-forhåndsvisning. Destruktive backend-handlinger er deaktiveret.', en: 'role preview. Destructive backend actions are disabled.', de: 'Rollenvorschau. Destruktive Backend-Aktionen sind deaktiviert.', it: 'anteprima ruolo. Le azioni distruttive sono disattivate.', hu: 'szerep-előnézet. A destruktív műveletek le vannak tiltva.' },
};

interface Props {
  user: SessionUser;
  language: Language;
  onLanguageChange: (lang: PortalUiLanguage) => void;
  onLogout: () => void;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function PortalHeader({ user, language, onLanguageChange, onLogout }: Props) {
  const { uiLanguage } = useLanguage();
  const displayName = user.display_name || user.email || '';
  const initials = getInitials(displayName);
  const [pendingCount, setPendingCount] = useState<number>(0);

  // Backend users see a notification badge when new users are awaiting
  // approval. Polled lightly every 60s.
  const portalRole = derivePortalRole(user);
  const isBackend = portalRole ? !!getPortalPermissions(portalRole)?.isBackend : false;

  const showModeSwitch = canSwitchMode(user);
  const [activeMode, setActiveModeState] = useState<ActiveMode>(() => getActiveMode(user.email));
  const activeSellerView = activeMode === 'backend' || (typeof activeMode === 'string' && activeMode.startsWith('role:'))
    ? null
    : SELLER_VIEWS.find((v) => v.key === activeMode) || null;
  const activeRolePreview = typeof activeMode === 'string' && activeMode.startsWith('role:')
    ? ROLE_PREVIEWS.find((r) => `role:${r.key}` === activeMode) || null
    : null;
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const sellerDir = useSellerDirectory();
  // "Sælger" suffix per UI language for the active-mode chip.
  const sellerSuffix = T.viewingAs[language] === 'Vis som' ? 'Sælger'
    : language === 'de' ? 'Verkäufer'
    : language === 'it' ? 'Venditore'
    : language === 'hu' ? 'Értékesítő'
    : 'Seller';
  function viewDisplay(v: typeof SELLER_VIEWS[number]) {
    return resolveSellerDisplay(
      { email: v.email, initialsKey: v.initials, fallbackInitials: v.initials, fallbackName: '' },
      sellerDir,
    );
  }

  // Keep local state in sync with cross-tab/in-tab mode changes.
  useEffect(() => {
    if (!showModeSwitch) return;
    const handler = () => setActiveModeState(getActiveMode(user.email));
    window.addEventListener('timan:active-mode-changed', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('timan:active-mode-changed', handler);
      window.removeEventListener('storage', handler);
    };
  }, [showModeSwitch, user.email]);

  function chooseMode(mode: ActiveMode) {
    // Always run against the REAL backend user email — if PortalHeader is
    // rendered with the synthetic exhibition user (rare but possible), the
    // cached real user gives us the right key for activeMode storage.
    const real = getCachedRealBackendUser();
    const emailKey = real?.email || user.email;
    try { setActiveMode(emailKey, mode); } catch { /* ignore */ }
    setActiveModeState(mode);
    setModeMenuOpen(false);
    // Clear any per-user cached seller-id mapping so the next CRM page
    // re-resolves against the newly selected seller view.
    try {
      Object.keys(sessionStorage).forEach((k) => {
        if (k.startsWith('timan.crm.sellerId.')) sessionStorage.removeItem(k);
      });
    } catch { /* ignore */ }

    // Entering Timan Messe preview.
    if (mode === 'role:exhibition_user') {
      enterExhibitionMode();
      window.location.assign('/messe');
      return;
    }

    // Leaving exhibition (or switching seller/role from anywhere):
    // 1) Drop the exhibition flag.
    // 2) Restore the real backend user into the live appUser state so the
    //    target page does not boot with the synthetic exhibition_user
    //    (which would make ExhibitionRedirector bounce us back to /messe).
    leaveExhibitionMode();
    try { localStorage.removeItem('timan.exhibitionMode'); } catch { /* ignore */ }
    if (real) {
      try {
        sessionStorage.setItem('timan.appUser', JSON.stringify(real));
      } catch { /* ignore */ }
    }

    // Navigate to the right destination. Use a full assign so all
    // role-derived UI re-evaluates cleanly.
    if (mode === 'backend') {
      window.location.assign('/portal/backend');
      return;
    }
    const onMesse = typeof window !== 'undefined' && window.location.pathname.startsWith('/messe');
    if (onMesse) {
      window.location.assign('/portal');
    } else {
      window.location.reload();
    }
  }

  useEffect(() => {
    if (!isBackend) { setPendingCount(0); return; }
    let cancelled = false;
    const tick = async () => {
      const n = await fetchPendingUserCount();
      if (!cancelled) setPendingCount(n);
    };
    void tick();
    const id = window.setInterval(tick, 60_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [isBackend]);

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-20 items-center">
          {/* Left: TIMAN logo + subtitle */}
          <div className="flex items-center">
            <img
              src={timanLogo}
              alt="Timan"
              className="h-12 sm:h-14 w-auto object-contain"
            />
          </div>

          {/* Right: language flags + bell + user chip + logout */}
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-wrap items-center gap-0.5 p-1 rounded-lg bg-gray-50 border border-gray-200">
              {LANGS.map(l => (
                <button
                  key={l.code}
                  onClick={() => onLanguageChange(l.code)}
                  className={`px-1.5 py-0.5 rounded-md transition ${uiLanguage === l.code ? 'bg-white shadow-sm border border-[#2d5a27]/30' : 'border border-transparent hover:bg-white'}`}
                  aria-label={l.code}
                  title={l.label}
                >
                  <span className="text-base leading-none">{l.emoji}</span>
                </button>
              ))}
            </div>

            {isBackend ? (
              <Link
                to="/portal/backend/users"
                className="relative p-2 text-gray-400 hover:text-[#2d5a27]"
                aria-label={pendingCount > 0 ? `${pendingCount} brugere afventer godkendelse` : 'Notifikationer'}
                title={pendingCount > 0 ? `${pendingCount} bruger(e) afventer godkendelse` : 'Ingen nye brugere'}
              >
                <Bell className="h-6 w-6" />
                {pendingCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white shadow">
                    {pendingCount > 99 ? '99+' : pendingCount}
                  </span>
                )}
              </Link>
            ) : (
              <button className="p-2 text-gray-400 hover:text-[#2d5a27]" aria-label="Notifications">
                <Bell className="h-6 w-6" />
              </button>
            )}

            <div className="ml-4 flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-[#2d5a27] flex items-center justify-center text-white text-xs font-bold">
                {initials}
              </div>
              <span className="text-sm font-medium text-gray-700 hidden md:inline truncate max-w-[200px]">
                {displayName}
              </span>

              {showModeSwitch && (
                <div className="relative ml-1">
                  <button
                    type="button"
                    onClick={() => setModeMenuOpen(o => !o)}
                    onBlur={() => setTimeout(() => setModeMenuOpen(false), 120)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-xs font-bold uppercase tracking-wide transition ${
                      activeRolePreview
                        ? 'bg-purple-50 border-purple-300 text-purple-800 hover:bg-purple-100'
                        : activeSellerView
                        ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
                        : 'bg-[#2d5a27]/10 border-[#2d5a27]/30 text-[#2d5a27] hover:bg-[#2d5a27]/15'
                    }`}
                    title={T.switchMode[language]}
                    aria-haspopup="menu"
                    aria-expanded={modeMenuOpen}
                  >
                    <span>
                      {activeRolePreview
                        ? activeRolePreview.label
                        : activeSellerView
                        ? (() => {
                            const d = viewDisplay(activeSellerView);
                            return d.full_name
                              ? `${d.initials} ${d.full_name}`
                              : `${d.initials} ${sellerSuffix}`;
                          })()
                        : T.backendMode[language]}
                    </span>
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  {modeMenuOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 mt-1 w-60 max-h-[70vh] overflow-y-auto bg-white border border-gray-200 rounded-md shadow-lg z-50 py-1"
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={activeMode === 'backend'}
                        onClick={() => chooseMode('backend')}
                        className="w-full flex items-center justify-between px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <span className="font-medium">{T.backendMode[language]}</span>
                        {activeMode === 'backend' && <Check className="w-4 h-4 text-[#2d5a27]" />}
                      </button>
                      <div className="my-1 border-t border-gray-100" />
                      <div className="px-3 pb-1 pt-0.5 text-[10px] uppercase tracking-wide text-gray-400 font-semibold">
                        {T.switchMode[language]}
                      </div>
                      {SELLER_VIEWS.map(v => {
                        const d = viewDisplay(v);
                        const firstName = (d.full_name || '').trim().split(/\s+/)[0] || '';
                        const label = d.initials && firstName
                          ? `${d.initials} ${firstName}`
                          : d.initials
                            ? `${d.initials} ${sellerSuffix}`
                            : firstName || v.email;
                        return (
                          <button
                            key={v.key}
                            type="button"
                            role="menuitemradio"
                            aria-checked={activeMode === v.key}
                            onClick={() => chooseMode(v.key)}
                            className="w-full flex items-center justify-between px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            <span className="font-medium">{label}</span>
                            {activeMode === v.key && <Check className="w-4 h-4 text-amber-600" />}
                          </button>
                        );
                      })}
                      <div className="my-1 border-t border-gray-100" />
                      <div className="px-3 pb-1 pt-0.5 text-[10px] uppercase tracking-wide text-gray-400 font-semibold">
                        {T.rolePreview[language]}
                      </div>
                      {ROLE_PREVIEWS.map(r => {
                        const modeKey = `role:${r.key}` as ActiveMode;
                        return (
                          <button
                            key={r.key}
                            type="button"
                            role="menuitemradio"
                            aria-checked={activeMode === modeKey}
                            onClick={() => chooseMode(modeKey)}
                            className="w-full flex items-center justify-between px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            <span className="font-medium">{r.label}</span>
                            {activeMode === modeKey && <Check className="w-4 h-4 text-purple-600" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
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
      </div>
      {showModeSwitch && activeSellerView && (
        <div className="bg-amber-50 border-t border-amber-200 text-amber-800 text-xs">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-1.5 flex items-center justify-center gap-2">
            <span className="font-bold uppercase tracking-wide">
              {T.viewingAs[language]} {activeSellerView.label}
            </span>
            <span className="opacity-80">— {T.filteredNote[language]}</span>
          </div>
        </div>
      )}
      {showModeSwitch && activeRolePreview && (
        <div className="bg-purple-50 border-t border-purple-200 text-purple-800 text-xs">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-1.5 flex items-center justify-center gap-2">
            <span className="font-bold uppercase tracking-wide">
              {T.viewingAs[language]} {activeRolePreview.label}
            </span>
            <span className="opacity-80">— {T.rolePreviewNote[language]}</span>
          </div>
        </div>
      )}
    </nav>
  );
}
