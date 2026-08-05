import { useState } from 'react';
import FlyerViewerModal from '@/components/messe/FlyerViewerModal';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
export default function FlyerQa() {
  const l = (new URLSearchParams(location.search).get('l') || 'da') as PortalUiLanguage;
  const [open] = useState(true);
  return <FlyerViewerModal open={open} onClose={() => {}} lang={l} />;
}
