import { Language } from '@/types/configurator';

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

type Category = 'news' | 'service';

export interface NewsItem {
  category: Category;
  title: string;
  body: string;
}

interface Props {
  language: Language;
  items?: NewsItem[];
}

const CATEGORY_STYLES: Record<Category, { bg: string; text: string }> = {
  news:    { bg: 'bg-green-100', text: 'text-[#2d5a27]' },
  service: { bg: 'bg-blue-100',  text: 'text-blue-600' },
};

export default function LatestFromTiman({ language, items }: Props) {
  const data: NewsItem[] =
    items && items.length > 0
      ? items
      : [
          { category: 'news',    title: T.placeholder1Title[language], body: T.placeholder1Body[language] },
          { category: 'service', title: T.placeholder2Title[language], body: T.placeholder2Body[language] },
        ];

  const tagLabel = (cat: Category) => (cat === 'service' ? T.serviceTag[language] : T.newsTag[language]);

  // Mockup structure: outer card with vertical stack, each row = colored tag pill on the left, title + body to the right.
  return (
    <div className="mt-16 bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">{T.heading[language]}</h2>
      <div className="space-y-6">
        {data.map((item, idx) => {
          const styles = CATEGORY_STYLES[item.category];
          const isLast = idx === data.length - 1;
          return (
            <div
              key={idx}
              className={`flex items-start pb-6 ${isLast ? 'border-0' : 'border-b border-gray-50'}`}
            >
              <div className={`${styles.bg} ${styles.text} text-xs font-bold px-2 py-1 rounded mr-4 mt-1 shrink-0`}>
                {tagLabel(item.category)}
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">{item.title}</h4>
                <p className="text-sm text-gray-500 mt-1">{item.body}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
