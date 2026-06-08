import { useEffect, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import {
  getActiveMode,
  SELLER_VIEWS,
  ROLE_PREVIEWS,
  type ActiveMode,
} from '@/lib/activeMode';
import { switchPreviewRole } from '@/lib/messeMode';

/**
 * Recover the real Timan Backend / Timan Service user email that is
 * currently previewing Timan Messe (role:exhibition_user).
 */
function findBackendPreviewerEmail(): string | null {
  try {
    const prefix = 'timan.activeMode.';
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(prefix)) continue;
      if (localStorage.getItem(key) === 'role:exhibition_user') {
        return key.slice(prefix.length);
      }
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * Top-bar role/mode selector shown ONLY for real Backend/Service users who
 * are previewing Timan Messe via "Vis som rolle". Public QR visitors on
 * /messe never see this control.
 */
export default function BackendRolePreviewSwitcher({ className }: { className?: string }) {
  const [previewerEmail, setPreviewerEmail] = useState<string | null>(() => findBackendPreviewerEmail());
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const refresh = () => setPreviewerEmail(findBackendPreviewerEmail());
    window.addEventListener('storage', refresh);
    window.addEventListener('timan:active-mode-changed', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('timan:active-mode-changed', refresh);
    };
  }, []);

  if (!previewerEmail) return null;

  const activeMode: ActiveMode = getActiveMode(previewerEmail);

  function chooseMode(mode: ActiveMode) {
    if (!previewerEmail) return;
    setOpen(false);
    switchPreviewRole(previewerEmail, mode);
  }


  const activeRole = typeof activeMode === 'string' && activeMode.startsWith('role:')
    ? ROLE_PREVIEWS.find((r) => `role:${r.key}` === activeMode) || null
    : null;
  const activeSeller = activeMode === 'backend' || activeRole
    ? null
    : SELLER_VIEWS.find((v) => v.key === activeMode) || null;

  const label = activeRole
    ? activeRole.label
    : activeSeller
      ? `${activeSeller.initials} Sælger`
      : 'Backend';

  return (
    <div className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-xs font-bold uppercase tracking-wide transition ${
          activeRole
            ? 'bg-purple-50 border-purple-300 text-purple-800 hover:bg-purple-100'
            : activeSeller
              ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
              : 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200'
        }`}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Skift rolle / visning"
      >
        <span>{label}</span>
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
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
            <span className="font-medium">Backend</span>
            {activeMode === 'backend' && <Check className="w-4 h-4 text-[#2d5a27]" />}
          </button>
          <div className="my-1 border-t border-gray-100" />
          <div className="px-3 pb-1 pt-0.5 text-[10px] uppercase tracking-wide text-gray-400 font-semibold">
            Vis som sælger
          </div>
          {SELLER_VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              role="menuitemradio"
              aria-checked={activeMode === v.key}
              onClick={() => chooseMode(v.key)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              <span className="font-medium">{v.initials} Sælger</span>
              {activeMode === v.key && <Check className="w-4 h-4 text-amber-600" />}
            </button>
          ))}
          <div className="my-1 border-t border-gray-100" />
          <div className="px-3 pb-1 pt-0.5 text-[10px] uppercase tracking-wide text-gray-400 font-semibold">
            Vis som rolle
          </div>
          {ROLE_PREVIEWS.map((r) => {
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
  );
}
