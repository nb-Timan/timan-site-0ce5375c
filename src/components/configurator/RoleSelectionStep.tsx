import { useState } from 'react';
import { UserRole, PartnerType, TimanWorkingFor, AuthState } from '@/types/configurator';

interface RoleSelectionStepProps {
  onRoleSelected: (auth: AuthState) => void;
  language: string;
}

const ROLE_LABELS: Record<string, Record<UserRole, { title: string; desc: string }>> = {
  da: {
    slutkunde: { title: 'Slutkunde', desc: 'Konfigurer maskine, opret tilbud og ordreudkast, download PDF. Ingen priser vises.' },
    partner: { title: 'Partner', desc: 'Se bruttopriser, brug fast rabatstruktur ved ordrer, vælg rabat manuelt ved tilbud.' },
    timan_saelger: { title: 'Timan Sælger', desc: 'Fuld adgang. Vælg om du arbejder for slutkunde eller partner. Styr rabatlogik i trin 4.' },
  },
  en: {
    slutkunde: { title: 'End Customer', desc: 'Configure machine, create quote and order draft, download PDF. No prices shown.' },
    partner: { title: 'Partner', desc: 'See gross prices, use fixed discount structure for orders, choose discount manually for quotes.' },
    timan_saelger: { title: 'Timan Sales', desc: 'Full access. Choose whether working for end customer or partner. Control discount logic in step 4.' },
  },
  de: {
    slutkunde: { title: 'Endkunde', desc: 'Maschine konfigurieren, Angebot und Bestellentwurf erstellen, PDF herunterladen. Keine Preise angezeigt.' },
    partner: { title: 'Partner', desc: 'Bruttopreise sehen, feste Rabattstruktur für Bestellungen, manuellen Rabatt für Angebote wählen.' },
    timan_saelger: { title: 'Timan Verkäufer', desc: 'Voller Zugang. Wählen Sie, ob Sie für Endkunden oder Partner arbeiten. Rabattlogik in Schritt 4 steuern.' },
  },
  it: {
    slutkunde: { title: 'Cliente Finale', desc: 'Configura macchina, crea preventivo e bozza ordine, scarica PDF. Nessun prezzo mostrato.' },
    partner: { title: 'Partner', desc: 'Vedi prezzi lordi, usa struttura sconto fissa per ordini, scegli sconto manualmente per preventivi.' },
    timan_saelger: { title: 'Venditore Timan', desc: 'Accesso completo. Scegli se lavori per cliente finale o partner. Controlla logica sconto nello step 4.' },
  },
  hu: {
    slutkunde: { title: 'Végfelhasználó', desc: 'Gép konfigurálása, árajánlat és rendelés tervezet létrehozása, PDF letöltése. Árak nem jelennek meg.' },
    partner: { title: 'Partner', desc: 'Bruttó árak megtekintése, fix kedvezménystruktúra rendeléseknél, manuális kedvezmény ajánlatoknál.' },
    timan_saelger: { title: 'Timan Értékesítő', desc: 'Teljes hozzáférés. Válassza ki, hogy végfelhasználónak vagy partnernek dolgozik. Kedvezmény logika a 4. lépésben.' },
  },
};

const PARTNER_SUB_LABELS: Record<string, Record<PartnerType, string>> = {
  da: { service_partner: 'Servicepartner', forhandler: 'Forhandler', importoer: 'Importør' },
  en: { service_partner: 'Service Partner', forhandler: 'Dealer', importoer: 'Importer' },
  de: { service_partner: 'Servicepartner', forhandler: 'Händler', importoer: 'Importeur' },
  it: { service_partner: 'Partner di Servizio', forhandler: 'Rivenditore', importoer: 'Importatore' },
  hu: { service_partner: 'Szervizpartner', forhandler: 'Kereskedő', importoer: 'Importőr' },
};

export default function RoleSelectionStep({ onRoleSelected, language }: RoleSelectionStepProps) {
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [partnerSubRole, setPartnerType] = useState<PartnerType | null>(null);
  const [workingFor, setWorkingFor] = useState<TimanWorkingFor | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const lang = language as keyof typeof ROLE_LABELS;
  const labels = ROLE_LABELS[lang] || ROLE_LABELS.en;
  const subLabels = PARTNER_SUB_LABELS[lang] || PARTNER_SUB_LABELS.en;

  const needsLogin = selectedRole === 'partner' || selectedRole === 'timan_saelger';
  const needsSubRole = selectedRole === 'partner';
  const needsWorkingFor = selectedRole === 'timan_saelger';

  const T = (key: string): string => {
    const texts: Record<string, Record<string, string>> = {
      roleTitle: { da: 'Vælg din rolle', en: 'Select your role', de: 'Wählen Sie Ihre Rolle', it: 'Seleziona il tuo ruolo', hu: 'Válassza ki szerepét' },
      loginTitle: { da: 'Log ind', en: 'Log in', de: 'Anmelden', it: 'Accedi', hu: 'Bejelentkezés' },
      email: { da: 'Email', en: 'Email', de: 'E-Mail', it: 'Email', hu: 'Email' },
      password: { da: 'Adgangskode', en: 'Password', de: 'Passwort', it: 'Password', hu: 'Jelszó' },
      continue: { da: 'Fortsæt', en: 'Continue', de: 'Weiter', it: 'Continua', hu: 'Folytatás' },
      login: { da: 'Log ind & Fortsæt', en: 'Login & Continue', de: 'Anmelden & Weiter', it: 'Accedi & Continua', hu: 'Bejelentkezés & Folytatás' },
      loginError: { da: 'Indtast venligst email og adgangskode', en: 'Please enter email and password', de: 'Bitte E-Mail und Passwort eingeben', it: 'Inserisci email e password', hu: 'Kérjük, adja meg az e-mail címét és jelszavát' },
      workingForTitle: { da: 'Hvem arbejder du for?', en: 'Who are you working for?', de: 'Für wen arbeiten Sie?', it: 'Per chi lavori?', hu: 'Kinek dolgozik?' },
      workingForSlut: { da: 'Slutkunde', en: 'End Customer', de: 'Endkunde', it: 'Cliente Finale', hu: 'Végfelhasználó' },
      workingForPartner: { da: 'Partner', en: 'Partner', de: 'Partner', it: 'Partner', hu: 'Partner' },
      selectWorkingFor: { da: 'Vælg venligst hvem du arbejder for', en: 'Please select who you are working for', de: 'Bitte wählen Sie, für wen Sie arbeiten', it: 'Seleziona per chi lavori', hu: 'Kérjük, válassza ki, kinek dolgozik' },
      selectSubRole: { da: 'Vælg venligst din partnertype', en: 'Please select your partner type', de: 'Bitte wählen Sie Ihren Partnertyp', it: 'Seleziona il tipo di partner', hu: 'Kérjük, válassza ki a partner típusát' },
      subRoleTitle: { da: 'Vælg partnertype', en: 'Select partner type', de: 'Partnertyp wählen', it: 'Seleziona tipo partner', hu: 'Partner típus kiválasztása' },
      back: { da: '← Tilbage', en: '← Back', de: '← Zurück', it: '← Indietro', hu: '← Vissza' },
      roleSubtitle: { da: 'Vælg din rolle for at starte konfiguratoren', en: 'Select your role to start the configurator', de: 'Wählen Sie Ihre Rolle, um den Konfigurator zu starten', it: 'Seleziona il tuo ruolo per avviare il configuratore', hu: 'Válassza ki szerepét a konfigurátor indításához' },
      futureAuth: { da: 'Login vil blive forbundet til Supabase i fremtiden', en: 'Login will be connected to Supabase in the future', de: 'Login wird in Zukunft mit Supabase verbunden', it: 'Il login sarà collegato a Supabase in futuro', hu: 'A bejelentkezés a jövőben Supabase-hoz lesz csatlakoztatva' },
    };
    return texts[key]?.[language] || texts[key]?.en || key;
  };

  const handleContinue = () => {
    if (!selectedRole) return;

    if (needsLogin && (!loginEmail || !loginPassword)) {
      setLoginError(T('loginError'));
      return;
    }

    if (needsSubRole && !partnerSubRole) {
      setLoginError(T('selectSubRole'));
      return;
    }

    if (needsWorkingFor && !workingFor) {
      setLoginError(T('selectWorkingFor'));
      return;
    }

    onRoleSelected({
      role: selectedRole,
      partnerSubRole: needsSubRole ? partnerSubRole : null,
      workingFor: needsWorkingFor ? workingFor : null,
      isAuthenticated: needsLogin,
      email: needsLogin ? loginEmail : undefined,
    });
  };

  const roles: UserRole[] = ['slutkunde', 'partner', 'timan_saelger'];
  const subRoles: PartnerType[] = ['service_partner', 'forhandler', 'importoer'];

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl shadow p-6 md:p-8">
        <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">{T('roleTitle')}</h2>
        <p className="text-gray-500 text-center mb-8 text-sm">{T('roleSubtitle')}</p>

        <div className="space-y-3">
          {roles.map(role => {
            const info = labels[role];
            const isActive = selectedRole === role;
            return (
              <div
                key={role}
                onClick={() => { setSelectedRole(role); setLoginError(''); setWorkingFor(null); setPartnerType(null); }}
                className={`p-4 border-2 rounded-xl cursor-pointer transition ${isActive ? 'border-emerald-500 bg-emerald-50 shadow-sm' : 'border-gray-200 hover:border-gray-300 bg-white'}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${isActive ? 'border-emerald-500' : 'border-gray-400'}`}>
                    {isActive && <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />}
                  </div>
                  <div>
                    <div className="font-bold text-gray-900">{info.title}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{info.desc}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Partner sub-role selector */}
        {needsSubRole && (
          <div className="mt-4 p-4 border border-gray-200 rounded-xl bg-gray-50">
            <h3 className="font-bold text-gray-800 mb-3 text-sm">{T('subRoleTitle')}</h3>
            <div className="flex gap-3">
              {subRoles.map(sr => (
                <label key={sr}
                  className={`flex-1 p-3 rounded-lg border-2 cursor-pointer text-center text-sm transition ${partnerSubRole === sr ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <input type="radio" name="partner-sub-role" className="sr-only"
                    checked={partnerSubRole === sr}
                    onChange={() => { setPartnerType(sr); setLoginError(''); }} />
                  {subLabels[sr]}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Login form for partner and timan */}
        {needsLogin && (
          <div className="mt-6 p-4 border border-gray-200 rounded-xl bg-gray-50">
            <h3 className="font-bold text-gray-800 mb-3 text-sm">{T('loginTitle')}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{T('email')}</label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={e => { setLoginEmail(e.target.value); setLoginError(''); }}
                  className="w-full p-2 border rounded-lg text-sm"
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{T('password')}</label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={e => { setLoginPassword(e.target.value); setLoginError(''); }}
                  className="w-full p-2 border rounded-lg text-sm"
                  placeholder="••••••••"
                />
              </div>
              <p className="text-[10px] text-gray-400 italic">{T('futureAuth')}</p>
            </div>
          </div>
        )}

        {/* Working-for selector for Timan Sælger */}
        {needsWorkingFor && (
          <div className="mt-4 p-4 border border-gray-200 rounded-xl bg-gray-50">
            <h3 className="font-bold text-gray-800 mb-3 text-sm">{T('workingForTitle')}</h3>
            <div className="flex gap-3">
              {([
                { value: 'slutkunde' as TimanWorkingFor, label: T('workingForSlut') },
                { value: 'partner' as TimanWorkingFor, label: T('workingForPartner') },
              ]).map(opt => (
                <label key={opt.value}
                  className={`flex-1 p-3 rounded-lg border-2 cursor-pointer text-center text-sm transition ${workingFor === opt.value ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <input type="radio" name="working-for" className="sr-only"
                    checked={workingFor === opt.value}
                    onChange={() => { setWorkingFor(opt.value); setLoginError(''); }} />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
        )}

        {loginError && (
          <p className="text-red-500 text-sm text-center mt-3 font-medium">{loginError}</p>
        )}

        <div className="mt-8 flex justify-center">
          <button
            onClick={handleContinue}
            disabled={!selectedRole}
            className={`px-8 py-3 rounded-lg text-base font-semibold transition ${selectedRole ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg' : 'bg-gray-400 text-white cursor-not-allowed'}`}
          >
            {needsLogin ? T('login') : T('continue')}
          </button>
        </div>
      </div>
    </div>
  );
}
