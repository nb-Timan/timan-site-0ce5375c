import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { PORTAL_MODULES } from '@/lib/portalModules';
import { useAppUser } from '@/context/AppUserContext';
import { derivePortalRole, deriveStoredPortalRole, getUserModuleAccessOverride, hasModuleAccess, isMesseVariantUser } from '@/lib/portalAccess';
import { useLanguage } from '@/context/LanguageContext';
import LoginStep from '@/components/configurator/LoginStep';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import AreaCard from '@/components/portal/AreaCard';
import LatestFromTiman from '@/components/portal/LatestFromTiman';
import LatestChanges from '@/components/portal/LatestChanges';
import QuickActions from '@/components/portal/QuickActions';
import AcademyGuidancePanel from '@/components/academy/AcademyGuidancePanel';
import DealerUserHome from '@/components/portal/DealerUserHome';
import { PORTAL_AREAS, isAreaVisible } from '@/lib/portalAreas';
import { sortPortalHomeCards } from '@/lib/portalHomeOrder';
import { useEffectivePortalUser } from '@/lib/viewAsUser';
import { formatDealerProfileBadgeLabel, useDealerPortfolioProfileBadge, useDealerProfileBadge } from '@/lib/dealerProfileBadge';
import { useChangelog, formatChangedAt } from '@/lib/portalChangelog';
import { academySandbox, type AcademyPortalBasicsState } from '@/lib/academySandbox';
import { canAccessAcademy, getAcademyCapabilityProgress, getAcademyProgress, getLocalAcademyUser, isAcademyCapabilityGated, isAcademyCapabilityUnlocked } from '@/lib/academyCurriculum';
import { Language } from '@/types/configurator';
import { CalendarDays, Wrench, ShoppingBag, Settings, Users, Building2, Sparkles, Newspaper, GraduationCap } from 'lucide-react';
import { t } from '@/lib/i18n/translations';

const AREA_TITLE_KEY: Record<string, string> = {
  teknik_service: 'area_teknik_service_title',
  salg_marketing: 'area_salg_marketing_title',
  calendar:       'area_calendar_title',
  marketing:      'area_marketing_title',
  timan_crm:      'area_timan_crm_title',
  timan_backend:  'area_timan_backend_title',
  dealer_data:    'area_dealer_data_title',
};
const AREA_DESC_KEY: Record<string, string> = {
  teknik_service: 'area_teknik_service_desc',
  salg_marketing: 'area_salg_marketing_desc',
  calendar:       'area_calendar_desc',
  marketing:      'area_marketing_desc',
  timan_crm:      'area_timan_crm_desc',
  timan_backend:  'area_timan_backend_desc',
  dealer_data:    'area_dealer_data_desc',
};

const AREA_META: Record<string, { to: string; icon: typeof Wrench; accent: 'primary' | 'sky' | 'violet' }> = {
  teknik_service: { to: '/portal/teknik-service', icon: Wrench,      accent: 'primary' },
  salg_marketing: { to: '/portal/salg-marketing', icon: ShoppingBag, accent: 'sky' },
  calendar:       { to: '/portal/crm/calendar',   icon: CalendarDays, accent: 'primary' },
  marketing:      { to: '/portal/marketing',      icon: Newspaper,   accent: 'primary' },
  timan_crm:      { to: '/portal/crm',            icon: Users,       accent: 'primary' },
  timan_backend:  { to: '/portal/backend',        icon: Settings,    accent: 'violet' },
  dealer_data:    { to: '/portal/dealer-data',    icon: Building2,   accent: 'sky' },
};

const MESSE_TITLE: Record<Language, string> = {
  da: 'Messe',
  en: 'Exhibition',
  de: 'Messe',
  it: 'Fiera',
  hu: 'Kiállítás',
};

const MESSE_DESC: Record<Language, string> = {
  da: 'Åbn messe-portalen med konfigurator, Timan 2620, forhandlerkort og videoakademi.',
  en: 'Open the exhibition portal with configurator, Timan 2620, dealer map and video academy.',
  de: 'Öffnen Sie das Messe-Portal mit Konfigurator, Timan 2620, Händlerkarte und Video-Akademie.',
  it: 'Apri il portale fiera con configuratore, Timan 2620, mappa rivenditori e video academy.',
  hu: 'Nyissa meg a kiállítási portált konfigurátorral, Timan 2620-al, kereskedőtérképpel és videó akadémiával.',
};

function getPortalBasicsNext(state: AcademyPortalBasicsState): string {
  if (!state.frenchSelected) return 'Skift portalsproget til fransk.';
  if (!state.languageRestored) return 'Skift tilbage til dit oprindelige portalsprog.';
  if (!state.partnerDataOpened) return 'Åbn Partnerdata og se dine forhandlere.';
  if (!state.returnedHomeFromPartnerData) return 'Klik på Timan-logoet øverst til venstre for at gå tilbage til forsiden.';
  if (!state.fullscreenUsed) return 'Aktivér fuldskærm via ikonet i headeren.';
  if (!state.mapAreaChanged) return 'Åbn Partnerkort og skift område.';
  if (!state.targetNewsOpened) return 'Åbn nyheden Skivehøster til Timan RC-1000s.';
  return 'Alle Portal Basics-opgaver er gennemført.';
}

function getPortalBasicsActiveTask(state: AcademyPortalBasicsState): string | undefined {
  if (!state.frenchSelected || !state.languageRestored) return 'Skift til fransk og tilbage';
  if (!state.partnerDataOpened || !state.returnedHomeFromPartnerData) return 'Partnerdata og Timan-logoet';
  if (!state.fullscreenUsed) return 'Aktivér fullscreen';
  if (!state.mapAreaChanged) return 'Skift område på Partnerkortet';
  if (!state.targetNewsOpened) return 'Åbn RC-1000s-nyheden';
  return undefined;
}

export default function PortalPage() {
  const { appUser, loading, setAppUser, logout, dealerStatus } = useAppUser();
  const { language: lang, uiLanguage, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const redirectParam = searchParams.get('redirect');
  // Academy runs only on localhost and only from its explicit sandbox mode.
  // The local persona is rendering context, never an authenticated portal user.
  const portalUser = appUser ?? (academySandbox.isActive() ? getLocalAcademyUser() : null);
  const [, refreshAcademy] = useState(0);
  const academyGuidanceRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const changed = () => refreshAcademy((n) => n + 1);
    window.addEventListener('timan:academy-progress-changed', changed);
    return () => window.removeEventListener('timan:academy-progress-changed', changed);
  }, []);

  useEffect(() => {
    if (location.hash !== '#academy-guidance' || academySandbox.getActiveCase() !== 'portal.basics_5') return;
    requestAnimationFrame(() => {
      academyGuidanceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      academyGuidanceRef.current?.focus({ preventScroll: true });
    });
  }, [location.hash]);

  // Phase 59 — Messe-variant users are locked to /messe. If we land on
  // /portal with a Messe user already in session, immediately bounce.
  if (portalUser && isMesseVariantUser(portalUser)) {
    return <Navigate to="/messe" replace />;
  }

  const prefLangApplied = useRef(false);
  useEffect(() => {
    if (prefLangApplied.current) return;
    const pref = portalUser?.preferred_language;
    if (pref && ['da','en','de','it','hu'].includes(pref)) {
      prefLangApplied.current = true;
      if (pref !== lang) setLanguage(pref as typeof lang);
    }
  }, [portalUser, lang, setLanguage]);

  const effectiveUser = useEffectivePortalUser(portalUser);
  const portalRoleForBadge = derivePortalRole(effectiveUser);
  const dealerProfileBadge = useDealerProfileBadge(effectiveUser?.dealer_number ?? null);
  const dealerPortfolioBadge = useDealerPortfolioProfileBadge(effectiveUser);
  const dealerBadge = (
    portalRoleForBadge === 'timan_backend' ||
    portalRoleForBadge === 'timan_seller' ||
    portalRoleForBadge === 'timan_service'
  ) ? dealerPortfolioBadge : dealerProfileBadge;
  const changelog = useChangelog(portalUser, uiLanguage);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-500">…</div>
      </div>
    );
  }

  if (!portalUser) {
    const LOGIN_LANGS: { code: Language; flag: string }[] = [
      { code: 'da', flag: '🇩🇰' },
      { code: 'en', flag: '🇬🇧' },
      { code: 'de', flag: '🇩🇪' },
      { code: 'it', flag: '🇮🇹' },
      { code: 'hu', flag: '🇭🇺' },
    ];
    return (
      <div className="min-h-screen p-4 md:p-8 bg-gray-50" style={{ fontFamily: "'Inter', sans-serif" }}>
        <div className="max-w-md mx-auto mb-8 text-center">
          <div className="inline-flex items-center gap-2 mb-3">
            <span className="bg-[#2d5a27] text-white font-bold px-3 py-1 rounded text-xl">TIMAN</span>
          </div>
          <div className="flex justify-center mb-4">
            <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-white border border-gray-200 shadow-sm">
              {LOGIN_LANGS.map(l => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => setLanguage(l.code)}
                  className={`px-2 py-1 rounded transition ${lang === l.code ? 'bg-gray-50 shadow-sm border border-[#2d5a27]/30' : 'hover:bg-gray-50'}`}
                  aria-label={l.code}
                >
                  <span className="text-base leading-none">{l.flag}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="text-sm text-gray-500">{t('loginNeeded', uiLanguage)}</p>
        </div>
        <LoginStep
          language={lang}
          onResolved={(user) => {
            setAppUser(user);
            // Phase 59 — Messe Portal users always land on /messe.
            if (isMesseVariantUser(user)) {
              navigate('/messe', { replace: true });
              return;
            }
            // Honor ?redirect=… (e.g. QR-code login flow) when safe.
            if (redirectParam && redirectParam.startsWith('/')) {
              navigate(redirectParam, { replace: true });
              return;
            }
            navigate('/portal', { replace: true });
          }}
        />
      </div>
    );
  }

  // Only true end-customers without any portal role go straight to the
  // configurator. Dealer-side users (timan_dealer, timan_importer,
  // timan_service_partner, dealer_customer, dealer_user) must land on /portal even if their
  // legacy `role` column still says 'slutkunde'.
  {
    const portalRole = (portalUser as { portal_role?: string | null }).portal_role ?? null;
    const dealerSideRoles = new Set([
      'timan_dealer', 'timan_importer', 'timan_service_partner', 'dealer_customer', 'dealer_user',
      'timan_backend', 'timan_seller', 'timan_service',
    ]);
    const hasPortalAccess = portalRole ? dealerSideRoles.has(portalRole) : false;
    if (portalUser.role === 'slutkunde' && !hasPortalAccess) {
      return <Navigate to="/configurator" replace />;
    }
  }

  // Dealer block / soft-delete gate. Timan staff (no dealer link) are unaffected.
  if (dealerStatus?.isDeleted || dealerStatus?.isBlocked) {
    const isDeleted = dealerStatus.isDeleted;
    return (
      <div className="min-h-screen flex flex-col bg-gray-50" style={{ fontFamily: "'Inter', sans-serif" }}>
        <PortalHeader user={portalUser} language={lang} onLanguageChange={setLanguage}
          onLogout={async () => { await logout(); navigate('/portal', { replace: true }); }} />
        <main className="max-w-xl mx-auto px-4 py-16 flex-grow w-full">
          <div className="bg-white border border-rose-200 rounded-2xl shadow-sm p-8 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-rose-100 flex items-center justify-center mb-4">
              <svg className="h-7 w-7 text-rose-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
            </div>
            <h1 className="text-xl font-bold text-slate-900">
              {isDeleted ? 'Forhandlerkonto er ikke længere aktiv' : 'Forhandlerkonto er spærret'}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              {isDeleted
                ? 'This dealer account is no longer active. Please contact Timan.'
                : 'This dealer account is blocked. Please contact Timan.'}
            </p>
            {dealerStatus.companyName && (
              <p className="mt-3 text-xs text-slate-500">{dealerStatus.companyName}</p>
            )}
            <button
              type="button"
              onClick={async () => { await logout(); navigate('/portal', { replace: true }); }}
              className="mt-6 inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
            >
              Log ud
            </button>
          </div>
        </main>
        <PortalFooter language={lang} />
      </div>
    );
  }

  const portalRole = derivePortalRole(effectiveUser);
  const academyEnabled = canAccessAcademy(effectiveUser);
  const academyCompletedCaseIds = academySandbox.getCompletedCaseIds();
  const academyProgress = getAcademyProgress(effectiveUser, academyCompletedCaseIds);
  const portalBasics = academySandbox.getPortalBasics();
  const isPortalBasicsAcademy = academySandbox.isActive()
    && academySandbox.getActiveCase() === 'portal.basics_5';
  const academyCapabilityGated = isAcademyCapabilityGated(effectiveUser);
  const configuratorUnlocked = isAcademyCapabilityUnlocked(effectiveUser, 'configurator', academyCompletedCaseIds);
  const configuratorProgress = getAcademyCapabilityProgress('configurator', academyCompletedCaseIds);
  const realPortalRole = deriveStoredPortalRole(portalUser);
  const isEffectiveBackend = portalRole === 'timan_backend';
  const moduleOverride = getUserModuleAccessOverride(effectiveUser);
  const showMesseCard = (
    realPortalRole === 'timan_backend' ||
    realPortalRole === 'timan_seller' ||
    hasModuleAccess(portalRole, 'messe_portal', moduleOverride)
  );
  const academyAllowedHomeCards = academySandbox.getAllowedPortalHomeCardIds();
  const visibleHomeCards = sortPortalHomeCards([
    ...PORTAL_AREAS
      .filter(area => isAreaVisible(area, effectiveUser))
      .map((area) => ({ kind: 'area' as const, id: area.id, area })),
    ...(showMesseCard ? [{ kind: 'messe' as const, id: 'messe' as const }] : []),
  ].filter((card) => !academyAllowedHomeCards || academyAllowedHomeCards.includes(card.id)));

  if (portalRole === 'dealer_user') {
    return (
      <DealerUserHome
        user={portalUser}
        language={lang}
        onLanguageChange={setLanguage}
        onLogout={logout}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader
        user={portalUser}
        language={lang}
        onLanguageChange={setLanguage}
        onLogout={async () => { await logout(); navigate('/portal', { replace: true }); }}
      />

      <header className="relative bg-gray-900 h-64 flex items-center overflow-hidden">
        <div className="absolute inset-0 opacity-40">
          <div className="absolute inset-0 bg-gradient-to-r from-black to-transparent z-10"></div>
          <img
            src="https://images.unsplash.com/photo-1581092160562-40aa08e78837?auto=format&fit=crop&q=80&w=2070"
            alt={t('heroAlt', uiLanguage)}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">{t('heroTitle', uiLanguage)}</h1>
          <p className="text-gray-300 text-lg max-w-2xl">{t('heroBody', uiLanguage)}</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex-grow w-full">
        {isPortalBasicsAcademy && (
          <>
          <div id="academy-guidance" ref={academyGuidanceRef} tabIndex={-1} className="scroll-mt-6 outline-none">
            <AcademyGuidancePanel
              title="Portal Basics - 5 hurtige"
              description="Gennemfør de fem handlinger i den almindelige portal. Din fremdrift gemmes kun lokalt i Academy."
              tasks={[
                { label: 'Skift til fransk og tilbage', complete: portalBasics.frenchSelected && portalBasics.languageRestored },
                { label: 'Partnerdata og Timan-logoet', complete: portalBasics.partnerDataOpened && portalBasics.returnedHomeFromPartnerData },
                { label: 'Aktivér fullscreen', complete: portalBasics.fullscreenUsed },
                { label: 'Skift område på Partnerkortet', complete: portalBasics.mapAreaChanged },
                { label: 'Åbn RC-1000s-nyheden', complete: portalBasics.targetNewsOpened },
              ]}
              activeTaskLabel={getPortalBasicsActiveTask(portalBasics)}
              next={getPortalBasicsNext(portalBasics)}
              completion
            />
          </div>
          <Link className="mb-4 inline-block text-sm font-semibold text-emerald-800 underline" to={PORTAL_MODULES.find((module) => module.id === 'partner_map')!.href}>Åbn Partnerkort</Link>
          </>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {academyEnabled && (
            <AreaCard
              title="Academy"
              description={`Lær Timan-portalen trin for trin. ${academyProgress.completedCount} / ${academyProgress.total} gennemført.`}
              cta={academyProgress.completedCount ? 'Fortsæt Academy' : 'Start Academy'}
              to="/academy"
              icon={GraduationCap}
              accent="violet"
              badge={{ tone: academyProgress.percentage === 100 ? 'green' : 'yellow', label: `${academyProgress.completedCount} / ${academyProgress.total}` }}
            />
          )}
          {visibleHomeCards.map(card => {
            if (card.kind === 'messe') {
              return (
                <AreaCard
                  key="messe"
                  title={t('portalMesseTitle', uiLanguage)}
                  description={t('portalMesseDesc', uiLanguage)}
                  cta={t('openArea', uiLanguage)}
                  to="/messe"
                  icon={Sparkles}
                  accent="violet"
                />
              );
            }
            const area = card.area;
            const meta = AREA_META[area.id];
            if (!meta) return null;
            const latest = changelog.latestForArea(area.id);
            const unreadCount = changelog.unreadCountForArea(area.id);
            const hasMajor = changelog.hasMajorUnreadForArea(area.id);
            let updateBadge: { label: string } | null = null;
            if (latest && unreadCount > 0) {
              const newLabel = t('portalNewTag', uiLanguage).toUpperCase();
              const impLabel = t('portalImportantTag', uiLanguage).toUpperCase();
              if (hasMajor) {
                updateBadge = {
                  label: unreadCount > 1 ? `${impLabel} · ${newLabel} ${unreadCount}` : impLabel,
                };
              } else {
                updateBadge = {
                  label: unreadCount > 1 ? `${newLabel} ${unreadCount}` : `${t('updated', uiLanguage)} ${formatChangedAt(latest.changed_at)}`,
                };
              }
            }
            const titleKey = AREA_TITLE_KEY[area.id];
            const descKey = AREA_DESC_KEY[area.id];
            const academyLockedCrm = academyCapabilityGated && (area.id === 'timan_crm' || area.id === 'calendar')
              && !isAcademyCapabilityUnlocked(effectiveUser, 'crm', academyCompletedCaseIds);
            return (
              <AreaCard
                key={area.id}
                title={titleKey ? t(titleKey, uiLanguage) : (area.title[lang] || area.title.en)}
                description={academyLockedCrm ? 'Kræver Academy. Gennemfør Academy-forløbet for at åbne CRM.' : (descKey ? t(descKey, uiLanguage) : (area.description[lang] || area.description.en))}
                cta={academyLockedCrm ? 'Kræver Academy' : t('openArea', uiLanguage)}
                to={academyLockedCrm ? '/academy?locked=crm' : meta.to}
                icon={meta.icon}
                accent={meta.accent}
                badge={area.id === 'dealer_data' && dealerBadge
                  ? { tone: dealerBadge.tone, label: formatDealerProfileBadgeLabel(dealerBadge, uiLanguage) }
                  : null}
                updateBadge={updateBadge}
              />
            );
          })}
        </div>

        {academyEnabled && academyCapabilityGated && !configuratorUnlocked && !isPortalBasicsAcademy && (
          <section className="mt-8 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-semibold">Næste oplåsning: Konfigurator</p>
            <p className="mt-1">Gennemfør Sales Case 1 og Case 2 for at få adgang til den rigtige konfigurator.</p>
            <div className="mt-3 h-2 overflow-hidden rounded bg-amber-100"><div className="h-full bg-amber-500" style={{ width: `${(configuratorProgress.completedCount / configuratorProgress.total) * 100}%` }} /></div>
            <p className="mt-2 text-xs font-semibold">{configuratorProgress.completedCount} / {configuratorProgress.total} gennemført</p>
          </section>
        )}

        <QuickActions
          language={uiLanguage}
          showAllActions={isEffectiveBackend}
          showRoleOverview={isEffectiveBackend}
        />

        <LatestChanges language={uiLanguage} />

        <LatestFromTiman language={uiLanguage} />
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}
