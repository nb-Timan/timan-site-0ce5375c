import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Language } from '@/types/configurator';
import { SessionUser } from '@/context/AppUserContext';
import { Bell, LogOut, ChevronDown, Check, ArrowLeft, Maximize2, Minimize2 } from 'lucide-react';
import timanLogo from '@/assets/timan-logo.png';
import { fetchPendingUserCount } from '@/lib/dealerAccountsService';
import { derivePortalRole, getPortalPermissions, isMesseVariantUser } from '@/lib/portalAccess';
import {
  canSwitchMode,
  getActiveMode,
  setActiveMode,
  SELLER_VIEWS,
  ROLE_PREVIEWS,
  type ActiveMode,
} from '@/lib/activeMode';
import { useSellerDirectory, resolveSellerDisplay } from '@/lib/sellerDirectory';
import { PORTAL_LANGUAGES, type PortalUiLanguage } from '@/lib/portalLanguages';
import { useLanguage } from '@/context/LanguageContext';
import { t } from '@/lib/i18n/translations';
import { getPortalBackInfo } from '@/lib/portalBackNav';

const LANGS = PORTAL_LANGUAGES;

interface Props {
  user: SessionUser;
  language: Language;
  onLanguageChange: (lang: PortalUiLanguage) => void;
  onLogout: () => void;
  /** Hide the small "Til forsiden" shortcut under the logo (used on Messe resource pages that already have a back link). */
  hideMesseHomeShortcut?: boolean;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function PortalHeader({ user, language, onLanguageChange, onLogout, hideMesseHomeShortcut = false }: Props) {
  const { uiLanguage } = useLanguage();
  const displayName = user.display_name || user.email || '';
  const initials = getInitials(displayName);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const location = useLocation();

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
  const sellerSuffix = t('quickActionsContextSeller', uiLanguage);
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

  const navigate = useNavigate();
  const showMesseHomeShortcut = !hideMesseHomeShortcut && location.pathname.startsWith('/messe/') && location.pathname !== '/messe';
  const backInfo = getPortalBackInfo(location.pathname, language, location.search);
  const isDealerUser = derivePortalRole(user) === 'dealer_user';
  const showPortalBackButton = location.pathname.startsWith('/portal/') || location.pathname === '/configurator';
  const portalBackTarget = isDealerUser && location.pathname.startsWith('/portal/') ? '/portal' : backInfo.to;
  const portalBackLabel = isDealerUser && location.pathname.startsWith('/portal/')
    ? t('portalHeaderToFrontPage', uiLanguage)
    : backInfo.label;
  const activeLanguage = LANGS.find((l) => l.code === uiLanguage) || LANGS[0];

  function homeTarget(): string {
    if (isMesseVariantUser(user)) return '/messe';
    if (activeMode === 'role:exhibition_user') return '/messe';
    return '/portal';
  }

  function chooseMode(mode: ActiveMode) {
    setActiveModeState(mode);
    setModeMenuOpen(false);
    setActiveMode(user.email, mode);
    // Clear CRM seller-scope caches whenever the active view changes.
    try {
      Object.keys(sessionStorage).forEach((k) => {
        if (k.startsWith('timan.crm.sellerId.')) sessionStorage.removeItem(k);
      });
    } catch { /* ignore */ }
    // Route to the page that matches the new mode.
    let target = '/portal';
    if (mode === 'role:exhibition_user') {
      target = '/messe';
    } else if (mode === 'backend' && (user.portal_role || '').toLowerCase() === 'timan_backend') {
      target = '/portal/backend';
    }
    navigate(target);
  }

  // Close the role menu when clicking anywhere outside it. Using a
  // capturing pointerdown listener avoids the classic onBlur-before-onClick
  // race that was swallowing menu-item clicks.
  useEffect(() => {
    if (!modeMenuOpen) return;
    function onDown(e: PointerEvent) {
      const root = document.getElementById('timan-mode-menu-root');
      if (root && e.target instanceof Node && root.contains(e.target)) return;
      setModeMenuOpen(false);
    }
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [modeMenuOpen]);

  useEffect(() => {
    if (!languageMenuOpen) return;
    function onDown(e: PointerEvent) {
      const root = document.getElementById('timan-language-menu-root');
      if (root && e.target instanceof Node && root.contains(e.target)) return;
      setLanguageMenuOpen(false);
    }
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [languageMenuOpen]);


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

  useEffect(() => {
    const syncFullscreen = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element | null };
      setIsFullscreen(!!(document.fullscreenElement || doc.webkitFullscreenElement));
    };
    syncFullscreen();
    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('webkitfullscreenchange', syncFullscreen);
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      document.removeEventListener('webkitfullscreenchange', syncFullscreen);
    };
  }, []);

  const toggleFullscreen = () => {
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    const root = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };

    if (document.fullscreenElement || doc.webkitFullscreenElement) {
      void (document.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
      return;
    }
    void (root.requestFullscreen?.() ?? root.webkitRequestFullscreen?.());
  };

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-20 items-center">
          {/* Left: TIMAN logo + subtitle */}
          <div className="flex flex-col items-start justify-center gap-1.5">
            <button
              type="button"
              onClick={() => navigate(homeTarget())}
              className="inline-flex items-center rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2d5a27] focus-visible:ring-offset-2"
              aria-label={t('portalHeaderHome', uiLanguage)}
              title={t('portalHeaderHome', uiLanguage)}
            >
              <img
                src={timanLogo}
                alt="Timan"
                className={`${showMesseHomeShortcut ? 'h-8 sm:h-9' : 'h-12 sm:h-14'} w-auto object-contain`}
              />
            </button>
            {showMesseHomeShortcut && (
              <button
                type="button"
                onClick={() => navigate('/messe')}
                className="inline-flex h-6 items-center gap-1 rounded-md bg-emerald-700 px-2.5 text-[11px] font-semibold leading-none text-white shadow-sm transition hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
                aria-label={t('portalHeaderToFrontPage', uiLanguage)}
                title={t('portalHeaderToFrontPage', uiLanguage)}
              >
                <ArrowLeft className="h-3 w-3" />
                {t('portalHeaderToFrontPage', uiLanguage)}
              </button>
            )}
          </div>

          {/* Right: language flags + bell + user chip + logout */}
          <div className="flex items-center gap-2 sm:gap-3">
            {showPortalBackButton && (
              <button
                type="button"
                onClick={() => navigate(portalBackTarget)}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800 shadow-sm transition hover:bg-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 sm:px-4"
                title={portalBackLabel}
                aria-label={portalBackLabel}
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">{portalBackLabel.replace(/^Tilbage til\s+/i, 'Tilbage')}</span>
              </button>
            )}

            <div className="relative" id="timan-language-menu-root">
              <button
                type="button"
                onClick={() => setLanguageMenuOpen((open) => !open)}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-gray-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2d5a27] focus-visible:ring-offset-2"
                aria-haspopup="menu"
                aria-expanded={languageMenuOpen}
                aria-label={activeLanguage.label}
                title={activeLanguage.label}
              >
                <span>{activeLanguage.flag}</span>
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </button>
              {languageMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-28 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg z-50"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  {LANGS.map((l) => (
                    <button
                      key={l.code}
                      type="button"
                      role="menuitemradio"
                      aria-checked={uiLanguage === l.code}
                      onClick={() => {
                        onLanguageChange(l.code);
                        setLanguageMenuOpen(false);
                      }}
                      className={`flex w-full items-center justify-between px-3 py-2 text-sm font-semibold transition ${
                        uiLanguage === l.code ? 'bg-emerald-50 text-emerald-800' : 'text-slate-700 hover:bg-gray-50'
                      }`}
                      title={l.label}
                    >
                      <span>{l.flag}</span>
                      {uiLanguage === l.code && <Check className="h-4 w-4 text-emerald-700" />}
                    </button>
                  ))}
                </div>
              )}
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
                <div className="relative ml-1" id="timan-mode-menu-root">
                  <button
                    type="button"
                    onClick={() => setModeMenuOpen(o => !o)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-xs font-bold uppercase tracking-wide transition ${
                      activeRolePreview
                        ? 'bg-purple-50 border-purple-300 text-purple-800 hover:bg-purple-100'
                        : activeSellerView
                        ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
                        : 'bg-[#2d5a27]/10 border-[#2d5a27]/30 text-[#2d5a27] hover:bg-[#2d5a27]/15'
                    }`}
                    title={t('portalHeaderSwitchMode', uiLanguage)}
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
                        : t('portalHeaderBackendMode', uiLanguage)}
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
                        <span className="font-medium">{t('portalHeaderBackendMode', uiLanguage)}</span>
                        {activeMode === 'backend' && <Check className="w-4 h-4 text-[#2d5a27]" />}
                      </button>
                      <div className="my-1 border-t border-gray-100" />
                      <div className="px-3 pb-1 pt-0.5 text-[10px] uppercase tracking-wide text-gray-400 font-semibold">
                        {t('portalHeaderSwitchMode', uiLanguage)}
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
                        {t('portalHeaderRolePreview', uiLanguage)}
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
              aria-label={t('portalHeaderLogout', uiLanguage)}
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden lg:inline">{t('portalHeaderLogout', uiLanguage)}</span>
            </button>

            <button
              type="button"
              onClick={toggleFullscreen}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2d5a27] focus-visible:ring-offset-2"
              aria-label={isFullscreen ? t('portalHeaderExitFullscreen', uiLanguage) : t('portalHeaderFullscreen', uiLanguage)}
              title={isFullscreen ? t('portalHeaderExitFullscreen', uiLanguage) : t('portalHeaderFullscreen', uiLanguage)}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
      {showModeSwitch && activeSellerView && (
        <div className="bg-amber-50 border-t border-amber-200 text-amber-800 text-xs">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-1.5 flex items-center justify-center gap-2">
            <span className="font-bold uppercase tracking-wide">
              {t('portalHeaderViewingAs', uiLanguage)} {activeSellerView.label}
            </span>
            <span className="opacity-80">— {t('portalHeaderFilteredNote', uiLanguage)}</span>
          </div>
        </div>
      )}
      {showModeSwitch && activeRolePreview && (
        <div className="bg-purple-50 border-t border-purple-200 text-purple-800 text-xs">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-1.5 flex items-center justify-center gap-2">
            <span className="font-bold uppercase tracking-wide">
              {t('portalHeaderViewingAs', uiLanguage)} {activeRolePreview.label}
            </span>
            <span className="opacity-80">— {t('portalHeaderRolePreviewNote', uiLanguage)}</span>
          </div>
        </div>
      )}
    </nav>
  );
}
