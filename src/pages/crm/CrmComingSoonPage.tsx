import CrmLayout from '@/components/crm/CrmLayout';
import { useLanguage } from '@/context/LanguageContext';
import { Language } from '@/types/configurator';

interface Props { titleKey: string }

const T: Record<string, Record<Language, string>> = {
  leads:    { da: 'Leads', en: 'Leads', de: 'Leads', it: 'Lead', hu: 'Leadek' },
  quotes:   { da: 'Tilbud', en: 'Quotes', de: 'Angebote', it: 'Preventivi', hu: 'Árajánlatok' },
  orders:   { da: 'Ordrer', en: 'Orders', de: 'Aufträge', it: 'Ordini', hu: 'Rendelések' },
  reports:  { da: 'Rapporter', en: 'Reports', de: 'Berichte', it: 'Report', hu: 'Riportok' },
  body:     { da: 'Kommer i næste fase. Aktivitet logges allerede automatisk i Aktiviteter.', en: 'Coming next. Activity is already auto-logged in Activities.', de: 'Folgt.', it: 'In arrivo.', hu: 'Hamarosan.' },
};

export default function CrmComingSoonPage({ titleKey }: Props) {
  const { language: lang } = useLanguage();
  const title = T[titleKey]?.[lang] || titleKey;
  return (
    <CrmLayout pageTitle={title}>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">{title}</h2>
        <p className="text-sm text-gray-500">{T.body[lang]}</p>
      </div>
    </CrmLayout>
  );
}
