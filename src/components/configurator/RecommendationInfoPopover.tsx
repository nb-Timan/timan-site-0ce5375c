/**
 * RecommendationInfoPopover — Step 7
 *
 * Compact, optional "Produktinfo" popover shown next to a recommended bullet.
 * Pure presentational: reads metadata + source links via the helpers in
 * src/data/productRecommendationMeta.ts. No external calls. No PDF impact.
 * No effect on scoring or selection state — purely informational.
 */
import { Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { Language } from '@/types/configurator';
import {
  getRecommendationMeta,
  getProductSourceLinks,
  getQuoteText,
  pickLocalized,
} from '@/data/productRecommendationMeta';

interface Props {
  productId: string | undefined;
  lang: Language;
  className?: string;
}

const L = {
  productInfo: { da: 'Produktinfo', en: 'Product info', de: 'Produktinfo', it: 'Info prodotto', hu: 'Termékinfó' },
  noLinks: {
    da: 'Der er ikke tilføjet produktlinks endnu.',
    en: 'No product links have been added yet.',
    de: 'Es wurden noch keine Produktlinks hinzugefügt.',
    it: 'Non sono ancora stati aggiunti link al prodotto.',
    hu: 'Még nem adtak hozzá terméklinkeket.',
  },
  itemNo: { da: 'Varenr.', en: 'Item no.', de: 'Art.-Nr.', it: 'Cod. art.', hu: 'Cikkszám' },
  source: { da: 'Produktside', en: 'Product page', de: 'Produktseite', it: 'Pagina prodotto', hu: 'Termékoldal' },
  brochure: { da: 'Brochure', en: 'Brochure', de: 'Broschüre', it: 'Brochure', hu: 'Brosúra' },
  image: { da: 'Billede', en: 'Image', de: 'Bild', it: 'Immagine', hu: 'Kép' },
  video: { da: 'Video', en: 'Video', de: 'Video', it: 'Video', hu: 'Videó' },
  docs: { da: 'Dokumentation', en: 'Documentation', de: 'Dokumentation', it: 'Documentazione', hu: 'Dokumentáció' },
} as const;

export function RecommendationInfoPopover({ productId, lang, className }: Props) {
  // No productId mapping (e.g. legacy fallback recommendation) → render nothing.
  if (!productId) return null;

  const meta = getRecommendationMeta(productId);
  const links = getProductSourceLinks(productId);
  const quote = getQuoteText(productId, lang);
  const pitch = meta ? pickLocalized(meta.shortPitch, lang) : '';

  const hasAny = links.hasAny || Boolean(quote) || Boolean(pitch);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground',
            'hover:text-foreground hover:bg-muted/60 transition shrink-0',
            className,
          )}
          aria-label={L.productInfo[lang]}
        >
          <Info className="h-3 w-3" />
          <span>{L.productInfo[lang]}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-72 p-3 text-xs space-y-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-0.5">
          <div className="font-semibold text-sm text-foreground">
            {meta?.name ?? productId}
          </div>
          {meta?.varenr && (
            <div className="text-[11px] text-muted-foreground">
              {L.itemNo[lang]} {meta.varenr}
            </div>
          )}
        </div>

        {(quote || pitch) && (
          <p className="text-foreground/80 leading-relaxed">
            {quote ?? pitch}
          </p>
        )}

        {hasAny ? (
          <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
            {links.sourceUrl && (
              <a href={links.sourceUrl} target="_blank" rel="noreferrer noopener"
                className="text-primary hover:underline">{L.source[lang]}</a>
            )}
            {links.brochureUrl && (
              <a href={links.brochureUrl} target="_blank" rel="noreferrer noopener"
                className="text-primary hover:underline">{L.brochure[lang]}</a>
            )}
            {links.imageUrl && (
              <a href={links.imageUrl} target="_blank" rel="noreferrer noopener"
                className="text-primary hover:underline">{L.image[lang]}</a>
            )}
            {links.videoUrl && (
              <a href={links.videoUrl} target="_blank" rel="noreferrer noopener"
                className="text-primary hover:underline">{L.video[lang]}</a>
            )}
            {links.documentationUrls.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noreferrer noopener"
                className="text-primary hover:underline">
                {L.docs[lang]}{links.documentationUrls.length > 1 ? ` ${i + 1}` : ''}
              </a>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground italic pt-1">{L.noLinks[lang]}</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
