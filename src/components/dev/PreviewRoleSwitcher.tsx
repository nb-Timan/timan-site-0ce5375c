// Phase 1B — Preview role switcher (dev-only).
//
// Visible only in dev/preview builds (import.meta.env.DEV).
// In production this component renders nothing.
//
// Lets you instantly impersonate any portal role without logging out.
// The chosen preview role is persisted in localStorage so it survives reload.
// The original (real) session user is also saved so "Reset" restores it.

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Eye, RotateCcw, X } from 'lucide-react';
import { useAppUser, SessionUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import {
  PortalRole,
  PORTAL_ROLES,
  PORTAL_ROLE_LABELS,
} from '@/lib/portalAccess';
import { UserRole, PartnerType } from '@/types/configurator';

const PREVIEW_KEY = 'timan.previewRole';
const REAL_USER_KEY = 'timan.realUser';

// Map portal role → legacy (UserRole + PartnerType) so the rest of the app
// (configurator, pricing, areas) keeps working unchanged.
function legacyShape(role: PortalRole): { role: UserRole; partner_type: PartnerType | null } {
  switch (role) {
    case 'timan_backend':         return { role: 'timan_saelger', partner_type: null };
    case 'timan_seller':          return { role: 'timan_saelger', partner_type: null };
    case 'timan_service':         return { role: 'partner',       partner_type: 'service_partner' };
    case 'timan_importer':        return { role: 'partner',       partner_type: 'importoer' };
    case 'timan_dealer':          return { role: 'partner',       partner_type: 'forhandler' };
    case 'timan_service_partner': return { role: 'partner',       partner_type: 'service_partner' };
    case 'dealer_user':           return { role: 'partner',       partner_type: 'forhandler' };
  }
}

function buildPreviewUser(role: PortalRole, base: SessionUser | null): SessionUser {
  const legacy = legacyShape(role);
  const label = PORTAL_ROLE_LABELS[role].da;
  return {
    email: base?.email || `preview+${role}@timan.dk`,
    role: legacy.role,
    partner_type: legacy.partner_type,
    approved: true,
    is_active: true,
    start_step: 1,
    max_step: 4,
    can_view_prices: role !== 'dealer_user',
    can_submit_order: role !== 'dealer_user',
    can_edit_discount: role === 'timan_backend' || role === 'timan_seller',
    can_switch_customer_mode: role === 'timan_backend' || role === 'timan_seller',
    working_for: null,
    display_name: `[Preview] ${label}`,
  };
}

export default function PreviewRoleSwitcher() {
  const { appUser, setAppUser } = useAppUser();
  const { language: lang } = useLanguage();
  const [open, setOpen] = useState(false);
  const [activePreview, setActivePreview] = useState<PortalRole | null>(() => {
    try {
      const v = localStorage.getItem(PREVIEW_KEY);
      return (v && (PORTAL_ROLES as string[]).includes(v) ? (v as PortalRole) : null);
    } catch { return null; }
  });

  // Re-apply preview on mount if persisted.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (!activePreview) return;
    // Save real user once if we don't already have it.
    try {
      if (!localStorage.getItem(REAL_USER_KEY) && appUser && !appUser.display_name?.startsWith('[Preview]')) {
        localStorage.setItem(REAL_USER_KEY, JSON.stringify(appUser));
      }
    } catch { /* ignore */ }
    const real = (() => {
      try { return JSON.parse(localStorage.getItem(REAL_USER_KEY) || 'null') as SessionUser | null; }
      catch { return null; }
    })();
    setAppUser(buildPreviewUser(activePreview, real || appUser));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const apply = (role: PortalRole) => {
    try {
      // Capture the real user the first time we activate preview.
      if (!localStorage.getItem(REAL_USER_KEY) && appUser && !appUser.display_name?.startsWith('[Preview]')) {
        localStorage.setItem(REAL_USER_KEY, JSON.stringify(appUser));
      }
      localStorage.setItem(PREVIEW_KEY, role);
    } catch { /* ignore */ }
    const real = (() => {
      try { return JSON.parse(localStorage.getItem(REAL_USER_KEY) || 'null') as SessionUser | null; }
      catch { return null; }
    })();
    setActivePreview(role);
    setAppUser(buildPreviewUser(role, real || appUser));
    setOpen(false);
  };

  const reset = () => {
    let real: SessionUser | null = null;
    try {
      real = JSON.parse(localStorage.getItem(REAL_USER_KEY) || 'null') as SessionUser | null;
      localStorage.removeItem(PREVIEW_KEY);
      localStorage.removeItem(REAL_USER_KEY);
    } catch { /* ignore */ }
    setActivePreview(null);
    setAppUser(real ?? null);
    setOpen(false);
  };

  const label = useMemo(() => {
    if (!activePreview) return 'Preview rolle';
    return PORTAL_ROLE_LABELS[activePreview][lang] || PORTAL_ROLE_LABELS[activePreview].da;
  }, [activePreview, lang]);

  if (!import.meta.env.DEV) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] no-print">
      {open && (
        <div className="mb-2 w-64 rounded-lg border border-amber-300 bg-white shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-amber-50 border-b border-amber-200">
            <span className="text-xs font-semibold text-amber-900 uppercase tracking-wide">Preview tester</span>
            <button onClick={() => setOpen(false)} className="text-amber-900 hover:opacity-70" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
          <ul className="max-h-72 overflow-y-auto py-1">
            {PORTAL_ROLES.map(r => (
              <li key={r}>
                <button
                  onClick={() => apply(r)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between ${activePreview === r ? 'bg-amber-50 font-semibold' : ''}`}
                >
                  <span>{PORTAL_ROLE_LABELS[r][lang] || PORTAL_ROLE_LABELS[r].da}</span>
                  <span className="text-[10px] text-gray-400 font-mono">{r}</span>
                </button>
              </li>
            ))}
          </ul>
          <button
            onClick={reset}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 border-t border-gray-200"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Nulstil til min rolle
          </button>
        </div>
      )}

      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 px-3 py-2 rounded-full shadow-lg text-sm font-medium border transition ${activePreview ? 'bg-amber-400 border-amber-500 text-amber-950 hover:bg-amber-300' : 'bg-gray-900 border-gray-900 text-white hover:bg-gray-800'}`}
        aria-label="Preview role switcher"
      >
        <Eye className="w-4 h-4" />
        <span className="hidden sm:inline">{label}</span>
        <ChevronDown className="w-3.5 h-3.5 opacity-70" />
      </button>
    </div>
  );
}
