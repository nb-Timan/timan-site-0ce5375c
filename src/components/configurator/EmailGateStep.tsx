import { useState } from 'react';
import { lookupAppUser, AppUser, SLUTKUNDE_DEFAULTS } from '@/data/appUsers';

interface EmailGateStepProps {
  language: string;
  onResolved: (user: AppUser & { email: string }) => void;
}

const T_MAP: Record<string, Record<string, string>> = {
  title: { da: 'Indtast din email for at starte', en: 'Enter your email to start', de: 'Geben Sie Ihre E-Mail ein', it: 'Inserisci la tua email', hu: 'Adja meg az e-mail címét' },
  subtitle: { da: 'Din email afgør din adgang og rettigheder i konfiguratoren', en: 'Your email determines your access and permissions in the configurator', de: 'Ihre E-Mail bestimmt Ihren Zugang', it: 'La tua email determina il tuo accesso', hu: 'Az e-mail címe határozza meg a hozzáférését' },
  placeholder: { da: 'din@email.dk', en: 'your@email.com', de: 'ihre@email.de', it: 'tua@email.it', hu: 'az@email.hu' },
  continue: { da: 'Fortsæt', en: 'Continue', de: 'Weiter', it: 'Continua', hu: 'Folytatás' },
  error: { da: 'Indtast venligst en gyldig email', en: 'Please enter a valid email', de: 'Bitte geben Sie eine gültige E-Mail ein', it: 'Inserisci un\'email valida', hu: 'Kérjük, adjon meg egy érvényes e-mail címet' },
  slutkundeNotice: { da: 'Denne email har slutkunde-adgang. Du kan konfigurere maskiner og oprette tilbud, men kan ikke se priser.', en: 'This email has end-customer access. You can configure machines and create quotes, but cannot see prices.', de: 'Diese E-Mail hat Endkunden-Zugang.', it: 'Questa email ha accesso cliente finale.', hu: 'Ez az e-mail végfelhasználói hozzáféréssel rendelkezik.' },
  recognized: { da: 'Velkommen', en: 'Welcome', de: 'Willkommen', it: 'Benvenuto', hu: 'Üdvözöljük' },
};

function tx(key: string, lang: string): string {
  return T_MAP[key]?.[lang] || T_MAP[key]?.en || key;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export default function EmailGateStep({ language, onResolved }: EmailGateStepProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [lookedUp, setLookedUp] = useState<(AppUser & { email: string }) | null>(null);
  const [showResult, setShowResult] = useState(false);

  const handleLookup = () => {
    setError('');
    if (!isValidEmail(email)) {
      setError(tx('error', language));
      return;
    }

    const user = lookupAppUser(email.trim());
    if (user) {
      // Approved active user found
      setLookedUp({ ...user, email: email.trim().toLowerCase() });
    } else {
      // Unknown or unapproved → slutkunde
      setLookedUp({
        ...SLUTKUNDE_DEFAULTS,
        email: email.trim().toLowerCase(),
        display_name: undefined,
      });
    }
    setShowResult(true);
  };

  const handleContinue = () => {
    if (lookedUp) onResolved(lookedUp);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (showResult && lookedUp) handleContinue();
      else handleLookup();
    }
  };

  const isSlut = lookedUp?.role === 'slutkunde';
  const roleLabel: Record<string, Record<string, string>> = {
    slutkunde: { da: 'Slutkunde', en: 'End Customer', de: 'Endkunde', it: 'Cliente Finale', hu: 'Végfelhasználó' },
    partner: { da: 'Partner', en: 'Partner', de: 'Partner', it: 'Partner', hu: 'Partner' },
    timan_saelger: { da: 'Timan Sælger', en: 'Timan Sales', de: 'Timan Verkäufer', it: 'Venditore Timan', hu: 'Timan Értékesítő' },
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white rounded-2xl shadow p-6 md:p-8">
        <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">{tx('title', language)}</h2>
        <p className="text-gray-500 text-center mb-6 text-sm">{tx('subtitle', language)}</p>

        <div className="space-y-4">
          <div>
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(''); setShowResult(false); setLookedUp(null); }}
              onKeyDown={handleKeyDown}
              className="w-full p-3 border-2 border-gray-200 rounded-xl text-sm focus:border-emerald-500 focus:outline-none transition"
              placeholder={tx('placeholder', language)}
              autoFocus
            />
            {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
          </div>

          {!showResult && (
            <button
              onClick={handleLookup}
              className="w-full py-3 rounded-xl text-base font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg transition"
            >
              {tx('continue', language)}
            </button>
          )}

          {showResult && lookedUp && (
            <div className={`p-4 rounded-xl border-2 text-center ${isSlut ? 'border-amber-300 bg-amber-50' : 'border-emerald-400 bg-emerald-50'}`}>
              {!isSlut && lookedUp.display_name && (
                <p className="font-bold text-emerald-800 text-lg mb-1">
                  {tx('recognized', language)}, {lookedUp.display_name}!
                </p>
              )}
              <div className="flex items-center justify-center gap-2 mb-2 flex-wrap">
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${isSlut ? 'bg-amber-200 text-amber-800' : 'bg-emerald-200 text-emerald-800'}`}>
                  {roleLabel[lookedUp.role]?.[language] || roleLabel[lookedUp.role]?.en}
                </span>
                {lookedUp.partner_type && (
                  <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-teal-200 text-teal-800">
                    {(() => {
                      const subMap: Record<string, Record<string, string>> = {
                        service_partner: { da: 'Servicepartner', en: 'Service Partner' },
                        forhandler: { da: 'Forhandler', en: 'Dealer' },
                        importoer: { da: 'Importør', en: 'Importer' },
                      };
                      return subMap[lookedUp.partner_type]?.[language] || subMap[lookedUp.partner_type]?.en || lookedUp.partner_type;
                    })()}
                  </span>
                )}
                {!isSlut && (
                  <span className="text-xs text-gray-500">
                    {language === 'da' ? `Start trin ${lookedUp.start_step}` : `Start step ${lookedUp.start_step}`}
                  </span>
                )}
              </div>
              {isSlut && (
                <p className="text-xs text-amber-700">{tx('slutkundeNotice', language)}</p>
              )}
              {!isSlut && (
                <div className="text-xs text-emerald-700 space-y-0.5">
                  {lookedUp.can_view_prices && <span className="block">✓ {language === 'da' ? 'Kan se priser' : 'Can view prices'}</span>}
                  {lookedUp.can_submit_order && <span className="block">✓ {language === 'da' ? 'Kan afsende ordrer' : 'Can submit orders'}</span>}
                  {lookedUp.can_edit_discount && <span className="block">✓ {language === 'da' ? 'Kan redigere rabat' : 'Can edit discount'}</span>}
                  {lookedUp.can_switch_customer_mode && <span className="block">✓ {language === 'da' ? 'Kan skifte kundetilstand' : 'Can switch customer mode'}</span>}
                </div>
              )}

              <button
                onClick={handleContinue}
                className={`w-full mt-4 py-3 rounded-xl text-base font-semibold text-white shadow-lg transition ${isSlut ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-600 hover:bg-emerald-700'}`}
              >
                {tx('continue', language)}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
