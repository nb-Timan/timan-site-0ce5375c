import { FlyerFrontPage } from '@/components/messe/TeaserFlyerPages';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
export default function ThumbQa() {
  const langs: PortalUiLanguage[] = ['da', 'de', 'en'];
  return (
    <div className="p-6 grid grid-cols-3 gap-5 bg-slate-50">
      {langs.map(l => (
        <div key={l} className="bg-white rounded-2xl overflow-hidden border">
          <div className="aspect-video bg-slate-100 overflow-hidden relative">
            <div className="absolute left-1/2 top-0 w-[72%] -translate-x-1/2 aspect-[1/1.414]">
              <FlyerFrontPage lang={l} />
            </div>
          </div>
          <div className="p-3 text-sm font-bold">{l}</div>
        </div>
      ))}
    </div>
  );
}
