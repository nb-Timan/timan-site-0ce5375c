import { ArrowLeftCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { setActiveMode } from '@/lib/activeMode';
import { leaveExhibitionMode } from '@/lib/exhibitionMode';
import { useAppUser } from '@/context/AppUserContext';

/**
 * Find the real backend/service user email that is currently previewing
 * Timan Messe via "Vis som rolle" → exhibition_user. The exhibition session
 * itself overwrites appUser with the synthetic Messe user, so the only way
 * to recover the original email is to scan the activeMode storage entries.
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
 * Top-bar exit button shown ONLY when a Timan Backend / Timan Service user
 * is previewing exhibition_user via "Vis som rolle". Public QR visitors on
 * /messe never see this button.
 */
export default function BackendExitButton({ className }: { className?: string }) {
  const { setAppUser } = useAppUser();
  const [previewerEmail, setPreviewerEmail] = useState<string | null>(() => findBackendPreviewerEmail());

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

  return (
    <button
      type="button"
      onClick={() => {
        try { setActiveMode(previewerEmail, 'backend'); } catch { /* ignore */ }
        leaveExhibitionMode();
        setAppUser(null);
        window.location.href = '/portal/backend';
      }}
      className={
        className ??
        'inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-200 hover:border-slate-300 rounded-lg px-2.5 py-1.5 shadow-sm'
      }
      title="Forlad Messe demo og vend tilbage til Backend"
    >
      <ArrowLeftCircle className="h-4 w-4" />
      <span>Tilbage til Backend</span>
    </button>
  );
}
