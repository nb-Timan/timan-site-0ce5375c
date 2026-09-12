import type { ReactNode } from 'react';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import { MarketingConfiguratorBadge } from '@/components/configurator/MarketingConfiguratorBadge';

export type MarketingCardSpec = { label: string; value: string };

type Props = {
  title: string;
  itemNumber: string;
  itemNumberLabel: string;
  price?: string;
  description?: string;
  specs?: MarketingCardSpec[];
  badge?: string | null;
  language: PortalUiLanguage;
  status?: ReactNode;
  editControl?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  className?: string;
};

/** Shared visual shell for the sales card and its Marketing editor preview. */
export function MarketingConfiguratorProductCard({
  title,
  itemNumber,
  itemNumberLabel,
  price,
  description,
  specs = [],
  badge,
  language,
  status,
  editControl,
  actions,
  footer,
  className = '',
}: Props) {
  return (
    <div className={`relative overflow-visible rounded-xl border-2 border-gray-100 bg-white p-5 shadow-sm ${className}`}>
      {badge && (
        <div className="pointer-events-none absolute -right-1 -top-1 z-10 sm:-right-2 sm:-top-2">
          <MarketingConfiguratorBadge badge={badge} language={language} />
        </div>
      )}
      <div className="flex min-h-9 w-full items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="font-bold text-lg text-gray-900">{title}</h3>
            {status}
          </div>
        </div>
        {editControl && <div className="mt-4 shrink-0">{editControl}</div>}
      </div>
      {price && <div className="mt-4 text-3xl font-extrabold text-emerald-600">{price}</div>}
      <p className="mt-2 text-sm text-gray-500">{itemNumberLabel}: {itemNumber}</p>
      {description && <p className="mt-4 line-clamp-2 text-sm text-gray-600">{description}</p>}
      {specs.length > 0 && (
        <div className="mt-4 space-y-1 border-y border-gray-200 py-3">
          {specs.map((spec, index) => (
            <div key={`${spec.label}-${index}`} className="flex justify-between gap-3 text-sm">
              <span className="text-gray-600">{spec.label}:</span>
              <span className="text-right font-semibold text-gray-900">{spec.value}</span>
            </div>
          ))}
        </div>
      )}
      {actions && <div className="mb-1 mt-4 flex flex-wrap items-center justify-center gap-3">{actions}</div>}
      {footer && <div className="mt-4">{footer}</div>}
    </div>
  );
}
