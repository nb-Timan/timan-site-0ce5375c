import { ArrowLeftCircle } from 'lucide-react';
import { useAppUser } from '@/context/AppUserContext';
import { useMesseMode, switchPreviewRole } from '@/lib/messeMode';

/**
 * Top-bar recovery button shown ONLY when a real Timan Backend / Timan
 * Service user is on a Messe page. Clicking it switches preview back to
 * Backend and navigates to /portal/backend via the central handler.
 */
export default function BackendExitButton({ className }: { className?: string }) {
  const { appUser } = useAppUser();
  const { realUser, isExhibitionPreview, isPublicMesseVisitor } = useMesseMode(
    appUser,
    typeof window !== 'undefined' ? window.location.pathname : '/messe',
  );

  if (!realUser) return null;
  // Show whenever the real user is rendering Messe (either previewing it or
  // landed via a stale flag — isPublicMesseVisitor stays false when realUser
  // exists, so we rely on isExhibitionPreview).
  if (!isExhibitionPreview && !isPublicMesseVisitor) return null;

  return (
    <button
      type="button"
      onClick={() => switchPreviewRole(realUser.email, 'backend')}
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
