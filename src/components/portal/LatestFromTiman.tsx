import { Language } from '@/types/configurator';
import { Newspaper, Calendar } from 'lucide-react';

const T: Record<string, Record<Language, string>> = {
  heading: { da: 'Seneste fra Timan', en: 'Latest from Timan', de: 'Neueste von Timan', it: 'Ultime da Timan', hu: 'Legújabb a Timantól' },
  empty: {
    da: 'Ingen nyheder endnu. Hold øje her for opdateringer fra Timan.',
    en: 'No news yet. Check back here for updates from Timan.',
    de: 'Noch keine Nachrichten. Schauen Sie später für Updates von Timan vorbei.',
    it: 'Nessuna novità. Torna qui per aggiornamenti da Timan.',
    hu: 'Még nincsenek hírek. Nézzen vissza a Timan frissítéseiért.',
  },
  placeholder1Title: {
    da: 'Velkommen til den nye forhandlerportal',
    en: 'Welcome to the new dealer portal',
    de: 'Willkommen im neuen Händlerportal',
    it: 'Benvenuto nel nuovo portale rivenditori',
    hu: 'Üdvözöljük az új kereskedői portálon',
  },
  placeholder1Body: {
    da: 'Vi samler alle dine værktøjer ét sted — start med at bygge en konfiguration.',
    en: 'We are gathering all your tools in one place — start by building a configuration.',
    de: 'Wir bündeln alle Ihre Werkzeuge an einem Ort — beginnen Sie mit einer Konfiguration.',
    it: 'Stiamo raccogliendo tutti i tuoi strumenti in un unico posto — inizia con una configurazione.',
    hu: 'Minden eszközét egy helyre gyűjtjük — kezdje egy konfiguráció felépítésével.',
  },
  placeholder2Title: {
    da: 'Nye videoer og ressourcer på vej',
    en: 'New videos and resources coming soon',
    de: 'Neue Videos und Ressourcen in Kürze',
    it: 'Nuovi video e risorse in arrivo',
    hu: 'Új videók és források hamarosan',
  },
  placeholder2Body: {
    da: 'Video Galleri og Ressourcer åbner snart med opdateret indhold.',
    en: 'Video gallery and Resources will open soon with updated content.',
    de: 'Videogalerie und Ressourcen öffnen bald mit aktualisierten Inhalten.',
    it: 'La Galleria video e le Risorse apriranno presto con nuovi contenuti.',
    hu: 'A Videógaléria és a Források hamarosan megnyílnak frissített tartalommal.',
  },
  badge: { da: 'Nyhed', en: 'News', de: 'Neuigkeit', it: 'Novità', hu: 'Hír' },
};

interface NewsItem {
  date: string;
  title: string;
  body: string;
}

interface Props {
  language: Language;
  items?: NewsItem[];
}

export default function LatestFromTiman({ language, items }: Props) {
  // Placeholder content until a news source is wired up.
  const data: NewsItem[] =
    items && items.length > 0
      ? items
      : [
          {
            date: new Date().toLocaleDateString(language === 'en' ? 'en-GB' : language),
            title: T.placeholder1Title[language],
            body: T.placeholder1Body[language],
          },
          {
            date: new Date(Date.now() - 86400000 * 3).toLocaleDateString(language === 'en' ? 'en-GB' : language),
            title: T.placeholder2Title[language],
            body: T.placeholder2Body[language],
          },
        ];

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Newspaper className="w-4 h-4 text-emerald-700" />
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          {T.heading[language]}
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.map((item, idx) => (
          <article
            key={idx}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition"
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700">
                {T.badge[language]}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                <Calendar className="w-3 h-3" />
                {item.date}
              </span>
            </div>
            <h3 className="text-base font-semibold text-gray-900">{item.title}</h3>
            <p className="mt-1 text-sm text-gray-500 leading-snug">{item.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
