import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { derivePortalRole } from '@/lib/portalAccess';
import { getPortalBackInfo } from '@/lib/portalBackNav';
import { t } from '@/lib/i18n/translations';
import { cn } from '@/lib/utils';

interface BackButtonProps {
  /** Optional override for the parent route. Use only when the auto-resolver is wrong. */
  to?: string;
  /** Optional override for the label. */
  label?: string;
  className?: string;
}

/**
 * Shared portal back-button. Resolves the parent route from the current
 * pathname (see `getPortalBackInfo`) so navigation behaves as breadcrumbs:
 * each click moves one level up in the portal hierarchy and eventually
 * lands on `/portal`. Never falls back to `/configurator`.
 */
export default function BackButton({ to, label, className }: BackButtonProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { appUser } = useAppUser();
  const { language, uiLanguage } = useLanguage();
  const info = getPortalBackInfo(location.pathname, language, location.search);
  const isDealerUser = derivePortalRole(appUser) === 'dealer_user';
  const target = isDealerUser && location.pathname.startsWith('/portal/') ? '/portal' : (to ?? info.to);
  const text = isDealerUser && location.pathname.startsWith('/portal/')
    ? t('portalHeaderToFrontPage', uiLanguage)
    : (label ?? info.label);

  return (
    <button
      type="button"
      onClick={() => navigate(target)}
      className={cn(
        'inline-flex items-center text-[#2d5a27] font-semibold hover:underline',
        className,
      )}
    >
      <ArrowLeft className="h-5 w-5 mr-2" />
      {text}
    </button>
  );
}
