import { ArrowLeftCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { setActiveMode, getActiveMode } from '@/lib/activeMode';
import { isExhibitionActive, leaveExhibitionMode } from '@/lib/exhibitionMode';
import { useAppUser } from '@/context/AppUserContext';
import { useCachedRealBackendUser } from '@/lib/cachedRealUser';

/**
 * Top-bar recovery button shown ONLY when a real Timan Backend / Timan
 * Service user is on a Messe page (either via "Vis som rolle" preview or
 * because a stale exhibition flag dropped them here). Public QR visitors
 * never see this button.
 *
 * Clicking it clears the exhibition flag + role preview and navigates the
 * user back to /portal/backend.
 */
export default function BackendExitButton({ className }: { className?: string }) {
  const { setAppUser } = useAppUser();
  const realUser = useCachedRealBackendUser();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const refresh = () => setTick((n) => n + 1);
    window.addEventListener('storage', refresh);
    window.addEventListener('timan:active-mode-changed', refresh);
    window.addEventListener('timan:exhibition-mode-changed', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('timan:active-mode-changed', refresh);
      window.removeEventListener('timan:exhibition-mode-changed', refresh);
    };
  }, []);

  if (!realUser) return null;
  const previewingExhibition = getActiveMode(realUser.email) === 'role:exhibition_user';
  const exhibitionActive = isExhibitionActive();
  // Render whenever the real backend user is in Messe context.
  void tick;
  if (!previewingExhibition && !exhibitionActive) return null;

  return (
    <button
      type="button"
      onClick={() => {
        try { setActiveMode(realUser.email, 'backend'); } catch { /* ignore */ }
        leaveExhibitionMode();
        // Keep the real user — do NOT clear appUser, otherwise we lose the session.
        setAppUser(realUser);
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
