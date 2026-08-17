import { useNavigate } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import MiscPageShell from './MiscPageShell';
import { Language } from '@/types/configurator';

const T: Record<string, Record<Language, string>> = {
  title: { da: 'Formularer', en: 'Forms', de: 'Formulare', it: 'Moduli', hu: 'Űrlapok' },
  intro: {
    da: 'Budgetfeedback, kontaktinfo og øvrige formularer samlet ét sted.',
    en: 'Budget feedback, contact info and other forms in one place.',
    de: 'Budget-Feedback, Kontaktdaten und weitere Formulare an einem Ort.',
    it: 'Feedback budget, contatti e altri moduli in un unico posto.',
    hu: 'Budget visszajelzés, kapcsolati adatok és egyéb űrlapok egy helyen.',
  },
  formsTitle: { da: 'Formularer', en: 'Forms', de: 'Formulare', it: 'Moduli', hu: 'Űrlapok' },
  formsDesc: {
    da: 'Indsend interne formularer til Timan — fx budget-tilbagemelding, faktura-accept og kontaktinformation.',
    en: 'Submit internal forms to Timan — e.g. budget feedback, invoice acceptance and contact information.',
    de: 'Interne Formulare an Timan senden — z. B. Budget-Feedback, Rechnungsannahme und Kontaktdaten.',
    it: 'Invia moduli interni a Timan — es. feedback budget, accettazione fattura e contatti.',
    hu: 'Belső űrlapok küldése a Timannak — pl. budget visszajelzés, számla elfogadás és kapcsolati adatok.',
  },
  formsCta: { da: 'Åbn formularer →', en: 'Open forms →', de: 'Formulare öffnen →', it: 'Apri moduli →', hu: 'Űrlapok megnyitása →' },
};

export default function MiscPage() {
  const { language: lang } = useLanguage();
  const navigate = useNavigate();

  return (
    <MiscPageShell title={T.title[lang]} intro={T.intro[lang]}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <button
          type="button"
          onClick={() => navigate('/portal/misc/forms')}
          className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm cursor-pointer group text-left transition-all duration-300 hover:-translate-y-1.5 hover:shadow-md"
        >
          <div className="w-12 h-12 bg-[#2d5a27] rounded-lg flex items-center justify-center text-white mb-6">
            <ClipboardList className="h-6 w-6" />
          </div>
          <h3 className="text-xl font-bold mb-2 text-gray-900">{T.formsTitle[lang]}</h3>
          <p className="text-gray-500 text-sm mb-4">{T.formsDesc[lang]}</p>
          <span className="text-[#2d5a27] font-bold text-sm uppercase">{T.formsCta[lang]}</span>
        </button>

      </div>
    </MiscPageShell>
  );
}
