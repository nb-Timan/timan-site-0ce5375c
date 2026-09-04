import { useEffect, useRef } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAppUser } from '@/context/AppUserContext';
import { derivePortalRole, getUserModuleAccessOverride, hasModuleAccess, isMesseVariantUser } from '@/lib/portalAccess';
import { useLanguage } from '@/context/LanguageContext';
import LoginStep from '@/components/configurator/LoginStep';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import AreaCard from '@/components/portal/AreaCard';
import LatestFromTiman from '@/components/portal/LatestFromTiman';
import LatestChanges from '@/components/portal/LatestChanges';
import QuickActions from '@/components/portal/QuickActions';
import DealerUserHome from '@/components/portal/DealerUserHome';
import { PORTAL_AREAS, isAreaVisible } from '@/lib/portalAreas';
import { sortPortalHomeCards } from '@/lib/portalHomeOrder';
import { useEffectivePortalUser } from '@/lib/viewAsUser';
import { formatDealerProfileBadgeLabel, useDealerPortfolioProfileBadge, useDealerProfileBadge } from '@/lib/dealerProfileBadge';
import { useChangelog, formatChangedAt } from '@/lib/portalChangelog';
import { Language } from '@/types/configurator';
import { CalendarDays, Wrench, ShoppingBag, Settings, Users, Building2, Sparkles, Newspaper } from 'lucide-react';
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

export default function PortalPage() {
  const { appUser, loading, setAppUser, logout, dealerStatus } = useAppUser();
  const { language: lang, uiLanguage, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectParam = searchParams.get('redirect');

  // Phase 59 — Messe-variant users are locked to /messe. If we land on
  // /portal with a Messe user already in session, immediately bounce.
  if (appUser && isMesseVariantUser(appUser)) {
    return <Navigate to="/messe" replace />;
  }

  const prefLangApplied = useRef(false);
  useEffect(() => {
    if (prefLangApplied.current) return;
    const pref = appUser?.preferred_language;
    if (pref && ['da','en','de','it','hu'].includes(pref)) {
      prefLangApplied.current = true;
      if (pref !== lang) setLanguage(pref as typeof lang);
    }
  }, [appUser, lang, setLanguage]);

  const effectiveUser = useEffectivePortalUser(appUser);
  const portalRoleForBadge = derivePortalRole(effectiveUser);
  const dealerProfileBadge = useDealerProfileBadge(effectiveUser?.dealer_number ?? null);
  const dealerPortfolioBadge = useDealerPortfolioProfileBadge(effectiveUser);
  const dealerBadge = (
    portalRoleForBadge === 'timan_backend' ||
    portalRoleForBadge === 'timan_seller' ||
    portalRoleForBadge === 'timan_service'
  ) ? dealerPortfolioBadge : dealerProfileBadge;
  const changelog = useChangelog(appUser, uiLanguage);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-500">…</div>
      </div>
    );
  }

  if (!appUser) {
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
    const portalRole = (appUser as { portal_role?: string | null }).portal_role ?? null;
    const dealerSideRoles = new Set([
      'timan_dealer', 'timan_importer', 'timan_service_partner', 'dealer_customer', 'dealer_user',
      'timan_backend', 'timan_seller', 'timan_service',
    ]);
    const hasPortalAccess = portalRole ? dealerSideRoles.has(portalRole) : false;
    if (appUser.role === 'slutkunde' && !hasPortalAccess) {
      return <Navigate to="/configurator" replace />;
    }
  }

  // Dealer block / soft-delete gate. Timan staff (no dealer link) are unaffected.
  if (dealerStatus?.isDeleted || dealerStatus?.isBlocked) {
    const isDeleted = dealerStatus.isDeleted;
    return (
      <div className="min-h-screen flex flex-col bg-gray-50" style={{ fontFamily: "'Inter', sans-serif" }}>
        <PortalHeader user={appUser} language={lang} onLanguageChange={setLanguage}
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
  const realPortalRole = derivePortalRole(appUser);
  const moduleOverride = getUserModuleAccessOverride(effectiveUser);
  const showMesseCard = (
    realPortalRole === 'timan_backend' ||
    realPortalRole === 'timan_seller' ||
    hasModuleAccess(portalRole, 'messe_portal', moduleOverride)
  );
  const visibleHomeCards = sortPortalHomeCards([
    ...PORTAL_AREAS
      .filter(area => isAreaVisible(area, effectiveUser))
      .map((area) => ({ kind: 'area' as const, id: area.id, area })),
    ...(showMesseCard ? [{ kind: 'messe' as const, id: 'messe' as const }] : []),
  ]);

  if (portalRole === 'dealer_user') {
    return (
      <DealerUserHome
        user={appUser}
        language={lang}
        onLanguageChange={setLanguage}
        onLogout={logout}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader
        user={appUser}
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
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
            const internalDealerData =
              portalRole === 'timan_backend'
              || portalRole === 'timan_seller'
              || portalRole === 'timan_service';
            const externalDealerData =
              portalRole === 'timan_dealer'
              || portalRole === 'timan_importer'
              || portalRole === 'timan_service_partner'
              || portalRole === 'dealer_customer'
              || (portalRole as string) === 'dealer_user';
            const ownDealerPath = effectiveUser?.dealer_number
              ? `/portal/crm/my-dealers/${encodeURIComponent(effectiveUser.dealer_number)}`
              : meta.to;
            const cardTo = area.id === 'dealer_data' && internalDealerData
              ? '/portal/crm/my-dealers'
              : area.id === 'dealer_data' && externalDealerData
                ? ownDealerPath
                : meta.to;
            return (
              <AreaCard
                key={area.id}
                title={titleKey ? t(titleKey, uiLanguage) : (area.title[lang] || area.title.en)}
                description={descKey ? t(descKey, uiLanguage) : (area.description[lang] || area.description.en)}
                cta={t('openArea', uiLanguage)}
                to={cardTo}
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

        <QuickActions language={uiLanguage} />

        <LatestChanges language={uiLanguage} />

        <LatestFromTiman language={uiLanguage} />
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}
