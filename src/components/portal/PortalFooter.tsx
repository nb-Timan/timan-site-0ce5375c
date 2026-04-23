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
    <footer className="bg-white border-t border-gray-200 py-8 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center text-gray-400 text-sm">
        <div className="mb-4 md:mb-0">
          {T.copyright[language]}
        </div>
        <div className="flex space-x-6">
          <a href="#" className="hover:text-[#2d5a27]">{T.privacy[language]}</a>
          <a href="#" className="hover:text-[#2d5a27]">{T.terms[language]}</a>
          <a href="#" className="hover:text-[#2d5a27]">{T.support[language]}</a>
        </div>
      </div>
    </footer>
  );
}
