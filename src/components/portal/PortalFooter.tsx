import { Language } from '@/types/configurator';

const T: Record<string, Record<Language, string>> = {
  copyright: {
    da: '© 2024 Timan A/S - Forhandler Portal',
    en: '© 2024 Timan A/S - Dealer Portal',
    de: '© 2024 Timan A/S - Händler Portal',
    it: '© 2024 Timan A/S - Portale Rivenditori',
    hu: '© 2024 Timan A/S - Kereskedői Portál',
  },
  privacy: { da: 'Privatlivspolitik', en: 'Privacy policy', de: 'Datenschutz', it: 'Privacy', hu: 'Adatvédelem' },
  terms:   { da: 'Brugervilkår', en: 'Terms of use', de: 'Nutzungsbedingungen', it: 'Termini d\'uso', hu: 'Felhasználási feltételek' },
  support: { da: 'Support', en: 'Support', de: 'Support', it: 'Supporto', hu: 'Támogatás' },
};

interface Props {
  language: Language;
}

export default function PortalFooter({ language }: Props) {
  return (
    <footer className="bg-white border-t border-gray-200 mt-16">
      <div className="max-w-7xl mx-auto px-6 md:px-10 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-500">
        <div>{T.copyright[language]}</div>
        <div className="flex items-center gap-6">
          <a href="#" className="hover:text-gray-900 transition">{T.privacy[language]}</a>
          <a href="#" className="hover:text-gray-900 transition">{T.terms[language]}</a>
          <a href="#" className="hover:text-gray-900 transition">{T.support[language]}</a>
        </div>
      </div>
    </footer>
  );
}
