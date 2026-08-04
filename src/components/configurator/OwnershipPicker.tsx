/**
 * Configurator ownership picker — Sælger + Forhandler.
 *
 * Used in two places (same controlled value, kept in sync):
 *   1. Step 4 customer info section ("Intern tildeling" block).
 *   2. The right summary/basket panel ("Tildeling" card).
 *
 * Behavior (Phase 23 round 2):
 *   • Internal users (Timan Backend, real Timan Sælger, or backend in
 *     "view as" seller mode) can pick BOTH seller and dealer.
 *   • External roles (timan_dealer / service_partner / importer / dealer_user)
 *     see their own dealer auto-filled and locked. Seller picker is hidden.
 *   • Dealer source = public.dealer_accounts (uses fetchDealerAccounts).
 *   • Selection is local UI state in ConfiguratorPage and is fed into
 *     buildConfiguratorOwnership() at every save / order send.
 *
 * Does NOT touch pricing, calc, PDF, n8n, RLS or auth.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Check, Lock, X } from 'lucide-react';
import { useAppUser } from '@/context/AppUserContext';
import { derivePortalRole } from '@/lib/portalAccess';
import {
  SELLER_VIEWS,
  getActiveSellerView,
} from '@/lib/activeMode';
import { isExternalDealerRole } from '@/lib/configuratorOwnership';
import { useDealerScope } from '@/lib/dealerScope';
import { fetchDealerAccounts, DealerAccount } from '@/lib/dealerAccountsService';
import { Language } from '@/types/configurator';
import { pickT } from '@/lib/i18n/translations';

export interface OwnershipSelection {
  /** BP/JTN/EM/AKR/NB or null. */
  sellerInitials: string | null;
  sellerEmail: string | null;
  sellerName: string | null;
  /** dealer_accounts.id (UUID). */
  dealerAccountId: string | null;
  dealerNumber: string | null;
  dealerCompanyName: string | null;
  /** True when the picker is locked because the user is an external dealer role. */
  locked: boolean;
}

export const EMPTY_OWNERSHIP: OwnershipSelection = {
  sellerInitials: null,
  sellerEmail: null,
  sellerName: null,
  dealerAccountId: null,
  dealerNumber: null,
  dealerCompanyName: null,
  locked: false,
};

interface Props {
  value: OwnershipSelection;
  onChange: (next: OwnershipSelection) => void;
  /**
   * Any portal UI language (da/en/de/it/hu/sv/fr/pl/cs). Falls back to English
   * for keys/languages that are not translated below.
   */
  language: Language | string;
  /** 'compact' for the sticky basket panel, 'full' for step 4 form. */
  variant?: 'compact' | 'full';
  /** Messe lead flow only needs Timan seller selection, not dealer assignment. */
  hideDealer?: boolean;
}

const T = {
  block_title: { da: 'Intern tildeling', en: 'Internal assignment', de: 'Interne Zuweisung', it: 'Assegnazione interna', hu: 'Belső hozzárendelés', sv: 'Intern tilldelning', fr: 'Affectation interne', pl: 'Przypisanie wewnętrzne', cs: 'Interní přiřazení' },
  block_compact: { da: 'Tildeling', en: 'Assignment', de: 'Zuweisung', it: 'Assegnazione', hu: 'Hozzárendelés', sv: 'Tilldelning', fr: 'Affectation', pl: 'Przypisanie', cs: 'Přiřazení' },
  seller: { da: 'Timan Sælger', en: 'Timan Seller', de: 'Timan Verkäufer', it: 'Venditore Timan', hu: 'Timan Értékesítő', sv: 'Timan-säljare', fr: 'Vendeur Timan', pl: 'Sprzedawca Timan', cs: 'Prodejce Timan' },
  dealer: { da: 'Forhandler', en: 'Dealer', de: 'Händler', it: 'Rivenditore', hu: 'Kereskedő', sv: 'Återförsäljare', fr: 'Revendeur', pl: 'Dealer', cs: 'Prodejce' },
  none: { da: '— Ingen valgt —', en: '— None selected —', de: '— Keine Auswahl —', it: '— Nessuno —', hu: '— Nincs kiválasztva —', sv: '— Inget valt —', fr: '— Aucun sélectionné —', pl: '— Nie wybrano —', cs: '— Nic nevybráno —' },
  search_dealer: { da: 'Søg forhandler (nr. eller navn)…', en: 'Search dealer (no. or name)…', de: 'Händler suchen…', it: 'Cerca rivenditore…', hu: 'Kereskedő keresése…', sv: 'Sök återförsäljare…', fr: 'Rechercher un revendeur…', pl: 'Szukaj dealera…', cs: 'Hledat prodejce…' },
  no_results: { da: 'Ingen resultater', en: 'No results', de: 'Keine Ergebnisse', it: 'Nessun risultato', hu: 'Nincs találat', sv: 'Inga resultat', fr: 'Aucun résultat', pl: 'Brak wyników', cs: 'Žádné výsledky' },
  loading: { da: 'Henter…', en: 'Loading…', de: 'Lädt…', it: 'Caricamento…', hu: 'Betöltés…', sv: 'Laddar…', fr: 'Chargement…', pl: 'Ładowanie…', cs: 'Načítání…' },
  locked_hint: {
    da: 'Forhandler er låst til din bruger-profil.',
    en: 'Dealer is locked to your user profile.',
    de: 'Händler ist an Ihr Profil gebunden.',
    it: 'Rivenditore bloccato al tuo profilo.',
    hu: 'A kereskedő a profilodhoz van rögzítve.',
    sv: 'Återförsäljaren är låst till din profil.',
    fr: 'Le revendeur est verrouillé à votre profil.',
    pl: 'Dealer jest przypisany do Twojego profilu.',
    cs: 'Prodejce je vázán na váš profil.',
  },
  no_dealer_warning: {
    da: 'Din bruger har ingen forhandler tilknyttet — kontakt admin før du sender en ordre.',
    en: 'Your user has no dealer linked — please contact an admin before sending an order.',
    de: 'Ihrem Benutzer ist kein Händler zugeordnet.',
    it: 'Il tuo utente non ha un rivenditore collegato.',
    hu: 'A felhasználódhoz nincs kereskedő rendelve.',
    sv: 'Din användare har ingen återförsäljare kopplad.',
    fr: 'Aucun revendeur n’est lié à votre utilisateur.',
    pl: 'Twoje konto nie ma przypisanego dealera.',
    cs: 'Váš účet nemá přiřazeného prodejce.',
  },
  clear: { da: 'Ryd', en: 'Clear', de: 'Löschen', it: 'Cancella', hu: 'Törlés', sv: 'Rensa', fr: 'Effacer', pl: 'Wyczyść', cs: 'Vymazat' },
} as const;

function tx(key: keyof typeof T, lang: Language | string): string {
  return pickT(T[key] as Partial<Record<string, string>>, lang) || (key as string);
}

/**
 * Compute the initial ownership selection for the current user.
 * Internal users: pre-fill seller from active mode / own seller identity.
 * External users: pre-fill + lock dealer from app_users.dealer_number.
 */
export function deriveInitialOwnership(
  appUser: ReturnType<typeof useAppUser>['appUser'],
): OwnershipSelection {
  if (!appUser) return EMPTY_OWNERSHIP;
  const portalRole = derivePortalRole(appUser);
  const isExternal = isExternalDealerRole(portalRole);

  const sellerView = getActiveSellerView(appUser.email);
  let sellerInitials: string | null = null;
  let sellerEmail: string | null = null;
  let sellerName: string | null = null;
  if (sellerView) {
    sellerInitials = sellerView.initials;
    sellerEmail = sellerView.email;
    sellerName = sellerView.label;
  } else if (portalRole === 'timan_seller') {
    const m = (appUser.display_name || '').match(/^([A-ZÆØÅ]{2,4})/);
    sellerInitials = m?.[1] ?? null;
    sellerEmail = appUser.email?.toLowerCase() ?? null;
    sellerName = appUser.display_name ?? null;
  }

  return {
    sellerInitials,
    sellerEmail,
    sellerName,
    dealerAccountId: null,
    dealerNumber: isExternal ? appUser.dealer_number ?? null : null,
    dealerCompanyName: isExternal ? appUser.company_dealer ?? null : null,
    locked: isExternal,
  };
}

export default function OwnershipPicker({ value, onChange, language, variant = 'full', hideDealer = false }: Props) {
  const { appUser } = useAppUser();
  const portalRole = derivePortalRole(appUser);
  // Phase 51 — fælles dealer-scope helper.
  // Eksterne forhandler-roller låses til egen dealer; interne kan vælge.
  const dealerScope = useDealerScope();
  const isExternal = dealerScope.isExternalDealerUser || isExternalDealerRole(portalRole);
  const isCompact = variant === 'compact';

  // Lazy-load dealer list (only for internal users; external users don't pick).
  const [dealers, setDealers] = useState<DealerAccount[] | null>(null);
  const [dealerError, setDealerError] = useState<string | null>(null);
  const [dealerSearch, setDealerSearch] = useState('');
  const [dealerOpen, setDealerOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isExternal || dealers !== null) return;
    let cancelled = false;
    (async () => {
      const res = await fetchDealerAccounts({ includeDeleted: false });
      if (cancelled) return;
      if (res.error) setDealerError(res.error);
      setDealers(res.rows.filter((d) => !d.is_blocked));
    })();
    return () => { cancelled = true; };
  }, [isExternal, dealers]);

  // Resolve dealerAccountId when only a number is set (e.g. external user
  // pre-fill) so saves attach the canonical UUID too.
  useEffect(() => {
    if (!dealers || value.dealerAccountId || !value.dealerNumber) return;
    const match = dealers.find((d) => d.account_number === value.dealerNumber);
    if (match) {
      onChange({
        ...value,
        dealerAccountId: match.id,
        dealerCompanyName: value.dealerCompanyName || match.company_name,
      });
    }
  }, [dealers, value, onChange]);

  // Click-outside to close popover
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!dealerOpen) return;
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setDealerOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dealerOpen]);

  const filteredDealers = useMemo(() => {
    if (!dealers) return [];
    const q = dealerSearch.trim().toLowerCase();
    const base = q
      ? dealers.filter((d) =>
          (d.account_number || '').toLowerCase().includes(q) ||
          (d.company_name || '').toLowerCase().includes(q))
      : dealers;

    // KRAV 1: dealers assigned to the active/effective seller float to the top,
    // then alphabetical by company_name. Match by email (preferred) or initials.
    const sellerEmail = (value.sellerEmail || '').toLowerCase();
    const sellerInits = (value.sellerInitials || '').toUpperCase();
    const isMine = (d: DealerAccount) => {
      const e = (d.assigned_seller_email || '').toLowerCase();
      const i = (d.assigned_seller_initials || '').toUpperCase();
      return (!!sellerEmail && e === sellerEmail) || (!!sellerInits && i === sellerInits);
    };
    const alpha = (a: DealerAccount, b: DealerAccount) =>
      (a.company_name || '').localeCompare(b.company_name || '', 'da', { sensitivity: 'base' });
    const mine = base.filter(isMine).sort(alpha);
    const others = base.filter((d) => !isMine(d)).sort(alpha);
    return [...mine, ...others].slice(0, 200);
  }, [dealers, dealerSearch, value.sellerEmail, value.sellerInitials]);


  function pickSeller(initials: string | null) {
    if (initials === null) {
      onChange({ ...value, sellerInitials: null, sellerEmail: null, sellerName: null });
      return;
    }
    const view = SELLER_VIEWS.find((v) => v.initials === initials);
    if (!view) return;
    onChange({
      ...value,
      sellerInitials: view.initials,
      sellerEmail: view.email,
      sellerName: view.label,
    });
  }

  function pickDealer(dealer: DealerAccount | null) {
    if (!dealer) {
      onChange({
        ...value,
        dealerAccountId: null,
        dealerNumber: null,
        dealerCompanyName: null,
      });
    } else {
      onChange({
        ...value,
        dealerAccountId: dealer.id,
        dealerNumber: dealer.account_number,
        dealerCompanyName: dealer.company_name,
      });
    }
    setDealerOpen(false);
    setDealerSearch('');
  }

  const wrapClass = isCompact
    ? 'rounded-lg border border-emerald-200 bg-white p-3 mb-3'
    : 'rounded-xl border border-emerald-200 bg-emerald-50/40 p-4';
  const titleClass = isCompact
    ? 'text-[11px] uppercase tracking-wider font-semibold text-emerald-800 mb-2'
    : 'text-sm font-bold text-emerald-900 mb-3';
  const labelClass = 'block text-xs font-medium text-gray-700 mb-1';
  const inputClass = 'w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40';

  // Hide entirely for users that have nothing to control: external dealer
  // user with their dealer already locked AND no seller picker — show a
  // tiny read-only summary instead so they still see what will be saved.
  if (isExternal) {
    return (
      <div className={wrapClass}>
        <div className={titleClass}>{tx(isCompact ? 'block_compact' : 'block_title', language)}</div>
        <div className="text-xs space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-gray-500">{tx('dealer', language)}</span>
            <span className="font-semibold text-gray-900 flex items-center gap-1">
              <Lock className="h-3 w-3 text-gray-400" />
              {value.dealerCompanyName || (value.dealerNumber ? `#${value.dealerNumber}` : '—')}
            </span>
          </div>
          {value.dealerNumber && (
            <div className="text-[10px] text-gray-400 text-right tabular-nums">#{value.dealerNumber}</div>
          )}
          {!value.dealerNumber && (
            <div className="mt-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              {tx('no_dealer_warning', language)}
            </div>
          )}
          <div className="text-[10px] text-gray-400">{tx('locked_hint', language)}</div>
        </div>
      </div>
    );
  }

  // Internal users: show seller, and optionally dealer.
  return (
    <div className={wrapClass}>
      <div className={titleClass}>{tx(isCompact ? 'block_compact' : 'block_title', language)}</div>

      <div className={isCompact || hideDealer ? 'space-y-2' : 'grid grid-cols-1 sm:grid-cols-2 gap-3'}>
        {/* Seller */}
        <div>
          <label className={labelClass}>{tx('seller', language)}</label>
          <select
            className={inputClass}
            value={value.sellerInitials ?? ''}
            onChange={(e) => pickSeller(e.target.value || null)}
          >
            <option value="">{tx('none', language)}</option>
            {SELLER_VIEWS.map((v) => (
              <option key={v.key} value={v.initials}>{v.label}</option>
            ))}
          </select>
        </div>

        {/* Dealer */}
        {!hideDealer && (
        <div className="relative" ref={popoverRef}>
          <label className={labelClass}>{tx('dealer', language)}</label>
          <button
            type="button"
            onClick={() => setDealerOpen((o) => !o)}
            className={`${inputClass} text-left flex items-center justify-between gap-2`}
          >
            <span className="truncate">
              {value.dealerCompanyName
                ? `${value.dealerCompanyName}${value.dealerNumber ? ` · #${value.dealerNumber}` : ''}`
                : tx('none', language)}
            </span>
            {value.dealerAccountId && (
              <span
                role="button"
                aria-label={tx('clear', language)}
                onClick={(e) => { e.stopPropagation(); pickDealer(null); }}
                className="text-gray-400 hover:text-gray-700"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
          </button>

          {dealerOpen && (
            <div className="absolute z-30 mt-1 w-full max-h-72 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl">
              <div className="relative border-b border-gray-100">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  autoFocus
                  type="text"
                  value={dealerSearch}
                  onChange={(e) => setDealerSearch(e.target.value)}
                  placeholder={tx('search_dealer', language)}
                  className="w-full text-xs pl-7 pr-2 py-2 focus:outline-none"
                />
              </div>
              <div className="max-h-56 overflow-y-auto">
                {dealers === null ? (
                  <div className="px-3 py-3 text-xs text-gray-400">{tx('loading', language)}</div>
                ) : filteredDealers.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-gray-400">{tx('no_results', language)}</div>
                ) : (
                  filteredDealers.map((d) => {
                    const selected = value.dealerAccountId === d.id;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => pickDealer(d)}
                        className={`w-full text-left px-3 py-2 text-xs flex items-start gap-2 hover:bg-emerald-50 ${selected ? 'bg-emerald-50' : ''}`}
                      >
                        {selected
                          ? <Check className="h-3.5 w-3.5 mt-0.5 text-emerald-600 shrink-0" />
                          : <span className="h-3.5 w-3.5 shrink-0" />}
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-gray-900 truncate">{d.company_name}</span>
                          <span className="block text-[10px] text-gray-500 tabular-nums">#{d.account_number}{d.country ? ` · ${d.country}` : ''}</span>
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
          {dealerError && (
            <div className="mt-1 text-[10px] text-amber-600">{dealerError}</div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
