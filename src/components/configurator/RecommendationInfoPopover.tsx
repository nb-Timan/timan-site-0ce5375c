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

const L: Record<string, Record<string, string>> = {
  productInfo: { da: 'Produktinfo', en: 'Product info', de: 'Produktinfo', it: 'Info prodotto', hu: 'Termékinfó', sv: 'Produktinfo', fr: 'Infos produit', pl: 'Informacje o produkcie', cs: 'Informace o produktu' },
  noLinks: {
    da: 'Der er ikke tilføjet produktlinks endnu.',
    en: 'No product links have been added yet.',
    de: 'Es wurden noch keine Produktlinks hinzugefügt.',
    it: 'Non sono ancora stati aggiunti link al prodotto.',
    hu: 'Még nem adtak hozzá terméklinkeket.',
    sv: 'Inga produktlänkar har lagts till ännu.',
    fr: 'Aucun lien produit n’a encore été ajouté.',
    pl: 'Nie dodano jeszcze linków do produktu.',
    cs: 'Zatím nebyly přidány žádné odkazy na produkt.',
  },
  itemNo:   { da: 'Varenr.',       en: 'Item no.',      de: 'Art.-Nr.',     it: 'Cod. art.',    hu: 'Cikkszám',    sv: 'Art.nr',        fr: 'Réf.',          pl: 'Nr art.',       cs: 'Č. zboží' },
  source:   { da: 'Produktside',   en: 'Product page',  de: 'Produktseite', it: 'Pagina prodotto', hu: 'Termékoldal', sv: 'Produktsida', fr: 'Page produit', pl: 'Strona produktu', cs: 'Stránka produktu' },
  brochure: { da: 'Brochure',      en: 'Brochure',      de: 'Broschüre',    it: 'Brochure',     hu: 'Brosúra',     sv: 'Broschyr',      fr: 'Brochure',      pl: 'Broszura',      cs: 'Brožura' },
  image:    { da: 'Billede',       en: 'Image',         de: 'Bild',         it: 'Immagine',     hu: 'Kép',         sv: 'Bild',          fr: 'Image',         pl: 'Zdjęcie',       cs: 'Obrázek' },
  video:    { da: 'Video',         en: 'Video',         de: 'Video',        it: 'Video',        hu: 'Videó',       sv: 'Video',         fr: 'Vidéo',         pl: 'Wideo',         cs: 'Video' },
  docs:     { da: 'Dokumentation', en: 'Documentation', de: 'Dokumentation',it: 'Documentazione', hu: 'Dokumentáció', sv: 'Dokumentation', fr: 'Documentation', pl: 'Dokumentacja', cs: 'Dokumentace' },
};

const pickL = (key: string, lang: string): string =>
  L[key]?.[lang] || L[key]?.en || L[key]?.da || '';

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
          aria-label={pickL('productInfo', lang)}
        >
          <Info className="h-3 w-3" />
          <span>{pickL('productInfo', lang)}</span>
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
              {pickL('itemNo', lang)} {meta.varenr}
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
                className="text-primary hover:underline">{pickL('source', lang)}</a>
            )}
            {links.brochureUrl && (
              <a href={links.brochureUrl} target="_blank" rel="noreferrer noopener"
                className="text-primary hover:underline">{pickL('brochure', lang)}</a>
            )}
            {links.imageUrl && (
              <a href={links.imageUrl} target="_blank" rel="noreferrer noopener"
                className="text-primary hover:underline">{pickL('image', lang)}</a>
            )}
            {links.videoUrl && (
              <a href={links.videoUrl} target="_blank" rel="noreferrer noopener"
                className="text-primary hover:underline">{pickL('video', lang)}</a>
            )}
            {links.documentationUrls.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noreferrer noopener"
                className="text-primary hover:underline">
                {pickL('docs', lang)}{links.documentationUrls.length > 1 ? ` ${i + 1}` : ''}
              </a>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground italic pt-1">{pickL('noLinks', lang)}</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
