import { useNavigate } from 'react-router-dom';
import { TrendingUp, FileCheck2, Building2 } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import MiscPageShell from './MiscPageShell';
import { Language } from '@/types/configurator';

const T: Record<string, Record<Language, string>> = {
  title: { da: 'Formularer', en: 'Forms', de: 'Formulare', it: 'Moduli', hu: 'Űrlapok' },
  intro: {
    da: 'Vælg en formular for at indsende den direkte i portalen.',
    en: 'Choose a form to submit it directly inside the portal.',
    de: 'Wählen Sie ein Formular, um es direkt im Portal einzureichen.',
    it: 'Seleziona un modulo per inviarlo direttamente nel portale.',
    hu: 'Válasszon űrlapot a portálon belüli beküldéshez.',
  },

  budgetTitle: { da: 'Budget-tilbagemelding', en: 'Budget feedback', de: 'Budget-Feedback', it: 'Feedback budget', hu: 'Budget visszajelzés' },
  budgetDesc: {
    da: 'Send tilbagemelding på dit budget — ændringer, kommentarer eller godkendelse til Timan.',
    en: 'Submit feedback on your budget — adjustments, comments or approval to Timan.',
    de: 'Geben Sie Feedback zu Ihrem Budget — Anpassungen, Kommentare oder Freigabe an Timan.',
    it: 'Invia feedback sul tuo budget — modifiche, commenti o approvazione a Timan.',
    hu: 'Küldjön visszajelzést a budgetjéről — módosítások, megjegyzések vagy jóváhagyás a Timannak.',
  },

  invoiceTitle: { da: 'Forhandler faktura-accept', en: 'Dealer invoice acceptance', de: 'Händler-Rechnungsannahme', it: 'Accettazione fattura rivenditore', hu: 'Kereskedői számla elfogadás' },
  invoiceDesc: {
    da: 'Bekræft modtagelse og accept af en faktura fra Timan som forhandler.',
    en: 'Confirm receipt and acceptance of an invoice from Timan as a dealer.',
    de: 'Bestätigen Sie als Händler den Erhalt und die Annahme einer Rechnung von Timan.',
    it: 'Conferma la ricezione e accettazione di una fattura Timan come rivenditore.',
    hu: 'Erősítse meg kereskedőként a Timan számla átvételét és elfogadását.',
  },

  contactTitle: { da: 'Firma- og kontaktinformation', en: 'Company and contact info', de: 'Firmen- und Kontaktdaten', it: 'Informazioni aziendali e contatti', hu: 'Cég- és kapcsolati adatok' },
  contactDesc: {
    da: 'Opdatér firmaoplysninger, adresse og primære kontaktpersoner hos Timan.',
    en: 'Update company details, address and primary contacts with Timan.',
    de: 'Aktualisieren Sie Firmenangaben, Adresse und Hauptkontakte bei Timan.',
    it: 'Aggiorna dati aziendali, indirizzo e contatti principali con Timan.',
    hu: 'Frissítse a cég adatait, címét és fő kapcsolattartóit a Timannál.',
  },

  open: { da: 'Åbn formular →', en: 'Open form →', de: 'Formular öffnen →', it: 'Apri modulo →', hu: 'Űrlap megnyitása →' },
};

interface Card {
  href: string;
  title: string;
  desc: string;
  Icon: typeof TrendingUp;
}

export default function MiscFormsPage() {
  const { language: lang } = useLanguage();
  const navigate = useNavigate();

  const cards: Card[] = [
    { href: '/portal/misc/forms/budget-feedback',      title: T.budgetTitle[lang],  desc: T.budgetDesc[lang],  Icon: TrendingUp },
    { href: '/portal/misc/forms/dealer-invoice-accept', title: T.invoiceTitle[lang], desc: T.invoiceDesc[lang], Icon: FileCheck2 },
    { href: '/portal/misc/forms/company-contact-info',  title: T.contactTitle[lang], desc: T.contactDesc[lang], Icon: Building2 },
  ];

  return (
    <MiscPageShell title={T.title[lang]} intro={T.intro[lang]} backTo="/portal/salg-marketing">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cards.map(c => (
          <button
            key={c.href}
            type="button"
            onClick={() => navigate(c.href)}
            className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm cursor-pointer group text-left transition-all duration-300 hover:-translate-y-1.5 hover:shadow-md"
          >
            <div className="w-12 h-12 bg-[#2d5a27] rounded-lg flex items-center justify-center text-white mb-6">
              <c.Icon className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-bold mb-2 text-gray-900">{c.title}</h3>
            <p className="text-gray-500 text-sm mb-4">{c.desc}</p>
            <span className="text-[#2d5a27] font-bold text-sm uppercase">{T.open[lang]}</span>
          </button>
        ))}
      </div>
    </MiscPageShell>
  );
}
