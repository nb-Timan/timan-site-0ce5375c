import { useEffect, useState } from 'react';
import { Language } from '@/types/configurator';
import { fetchLatestNews, NewsPost } from '@/lib/newsService';

const T: Record<string, Record<Language, string>> = {
  heading: { da: 'Seneste fra Timan', en: 'Latest from Timan', de: 'Neueste von Timan', it: 'Ultime da Timan', hu: 'Legújabb a Timantól' },
  newsTag: { da: 'NYHED', en: 'NEWS', de: 'NEUIGKEIT', it: 'NOVITÀ', hu: 'HÍR' },
  serviceTag: { da: 'SERVICE', en: 'SERVICE', de: 'SERVICE', it: 'SERVIZIO', hu: 'SZERVIZ' },
  placeholder1Title: {
    da: 'Ny redskabsserie til Timan 3400 er nu tilgængelig',
    en: 'New attachment series for Timan 3400 now available',
    de: 'Neue Anbaugeräte-Serie für Timan 3400 jetzt verfügbar',
    it: 'Nuova serie di accessori per Timan 3400 ora disponibile',
    hu: 'Az új Timan 3400 tartozéksorozat már elérhető',
  },
  placeholder1Body: {
    da: 'Vi har netop lanceret en ny række klippeborde der øger effektiviteten med 15%...',
    en: 'We just launched a new range of cutting decks that increase efficiency by 15%...',
    de: 'Wir haben gerade eine neue Reihe von Mähdecks eingeführt, die die Effizienz um 15% steigern...',
    it: 'Abbiamo appena lanciato una nuova gamma di piatti di taglio che aumentano l\'efficienza del 15%...',
    hu: 'Most indítottuk útjára az új vágóasztal-sorozatot, amely 15%-kal növeli a hatékonyságot...',
  },
  placeholder2Title: {
    da: 'Opdatering af AI-assistenten i konfiguratoren',
    en: 'AI assistant update in the configurator',
    de: 'Update des KI-Assistenten im Konfigurator',
    it: 'Aggiornamento dell\'assistente AI nel configuratore',
    hu: 'AI-asszisztens frissítése a konfigurátorban',
  },
  placeholder2Body: {
    da: 'Det er nu endnu lettere at generere professionelle PDF-tilbud til dine kunder.',
    en: 'It is now even easier to generate professional PDF quotes for your customers.',
    de: 'Es ist jetzt noch einfacher, professionelle PDF-Angebote für Ihre Kunden zu erstellen.',
    it: 'Ora è ancora più facile generare preventivi PDF professionali per i tuoi clienti.',
    hu: 'Most még egyszerűbb professzionális PDF-árajánlatokat készíteni ügyfelei számára.',
  },
};

interface Props {
  language: Language;
}

// Clean inline SVG fallback used when a post has no image_url.
const FALLBACK_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240">
       <rect width="400" height="240" fill="#f3f4f6"/>
       <text x="50%" y="50%" font-family="Inter, sans-serif" font-size="22" font-weight="700"
             fill="#2d5a27" text-anchor="middle" dominant-baseline="middle">TIMAN</text>
     </svg>`,
  );

function categoryStyle(category: string) {
  const c = (category || '').toUpperCase();
  if (c === 'SERVICE') return { bg: 'bg-blue-100', text: 'text-blue-600' };
  // default = NYHED / news-like
  return { bg: 'bg-green-100', text: 'text-[#2d5a27]' };
}

function categoryLabel(category: string, language: Language) {
  const c = (category || '').toUpperCase();
  if (c === 'SERVICE') return T.serviceTag[language];
  if (c === 'NYHED' || c === 'NEWS') return T.newsTag[language];
  return c; // unknown category → show as-is
}

function buildPlaceholders(language: Language): NewsPost[] {
  const now = new Date();
  return [
    {
      id: 'placeholder-1',
      title: T.placeholder1Title[language],
      excerpt: T.placeholder1Body[language],
      image_url: null,
      link_url: null,
      category: 'NYHED',
      published_at: now.toISOString(),
      is_active: true,
      source: 'placeholder',
    },
    {
      id: 'placeholder-2',
      title: T.placeholder2Title[language],
      excerpt: T.placeholder2Body[language],
      image_url: null,
      link_url: null,
      category: 'SERVICE',
      published_at: now.toISOString(),
      is_active: true,
      source: 'placeholder',
    },
  ];
}

export default function LatestFromTiman({ language }: Props) {
  const [posts, setPosts] = useState<NewsPost[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchLatestNews(4).then((rows) => {
      if (cancelled) return;
      setPosts(rows.length > 0 ? rows : buildPlaceholders(language));
    });
    return () => {
      cancelled = true;
    };
  }, [language]);

  const data = posts ?? buildPlaceholders(language);

  return (
    <div className="mt-16 bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">{T.heading[language]}</h2>
      <div className="space-y-6">
        {data.map((item, idx) => {
          const styles = categoryStyle(item.category);
          const isLast = idx === data.length - 1;
          const clickable = !!item.link_url;

          const inner = (
            <div className={`flex items-start pb-6 ${isLast ? 'border-0' : 'border-b border-gray-50'}`}>
              <div className={`${styles.bg} ${styles.text} text-xs font-bold px-2 py-1 rounded mr-4 mt-1 shrink-0`}>
                {categoryLabel(item.category, language)}
              </div>

              <img
                src={item.image_url || FALLBACK_IMAGE}
                alt=""
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = FALLBACK_IMAGE;
                }}
                className="hidden sm:block w-24 h-16 object-cover rounded mr-4 shrink-0 bg-gray-100"
              />

              <div className="min-w-0">
                <h4 className="font-semibold text-gray-900">{item.title}</h4>
                {item.excerpt && (
                  <p className="text-sm text-gray-500 mt-1 line-clamp-2">{item.excerpt}</p>
                )}
              </div>
            </div>
          );

          return clickable ? (
            <a
              key={item.id}
              href={item.link_url!}
              target="_blank"
              rel="noopener noreferrer"
              className="block hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors"
            >
              {inner}
            </a>
          ) : (
            <div key={item.id}>{inner}</div>
          );
        })}
      </div>
    </div>
  );
}
