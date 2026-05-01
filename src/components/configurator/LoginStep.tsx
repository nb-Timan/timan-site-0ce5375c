import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { AppUser, SLUTKUNDE_DEFAULTS, lookupAppUser } from '@/data/appUsers';
import { linkAuthUserIdIfNeeded } from '@/lib/linkAuthUser';
import GuestVisitorPopup from '@/components/configurator/GuestVisitorPopup';
import { startAuthenticatedSession } from '@/lib/visitorTracking';
import { PORTAL_LANGUAGES } from '@/lib/portalLanguages';
import type { Language } from '@/types/configurator';

async function trackLogin(email: string, loginType: 'login' | 'guest') {
  try {
    const { data: existing } = await supabase
      .from('login_tracking')
      .select('id, login_count')
      .eq('email', email)
      .eq('login_type', loginType)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('login_tracking')
        .update({ login_count: (existing.login_count || 0) + 1, last_login: new Date().toISOString() })
        .eq('id', existing.id);
      if (error) console.error('[login_tracking] update failed:', error);
      else console.log('[login_tracking] incremented:', email, loginType, existing.login_count + 1);
    } else {
      const { error } = await supabase
        .from('login_tracking')
        .insert({ email, login_type: loginType, login_count: 1, last_login: new Date().toISOString() });
      if (error) console.error('[login_tracking] insert failed:', error);
      else console.log('[login_tracking] created:', email, loginType);
    }
  } catch (err) {
    console.error('[login_tracking] error:', err);
  }
}

interface LoginStepProps {
  language: string;
  onResolved: (user: AppUser & {
    email: string;
    portal_role?: string | null;
    preferred_language?: string | null;
    preferred_currency?: string | null;
    company_dealer?: string | null;
    module_access?: string[] | null;
    status?: string | null;
  }) => void;
}

const T: Record<string, Record<string, string>> = {
  title: { da: 'Velkommen', en: 'Welcome', de: 'Willkommen', it: 'Benvenuto', hu: 'Üdvözöljük' },
  subtitle: { da: 'Din adgang og dine rettigheder bestemmes af din konto', en: 'Your access and permissions are determined by your account', de: 'Ihr Zugang wird durch Ihr Konto bestimmt', it: 'Il tuo accesso è determinato dal tuo account', hu: 'A hozzáférését a fiókja határozza meg' },
  email: { da: 'Email', en: 'Email', de: 'E-Mail', it: 'Email', hu: 'E-mail' },
  password: { da: 'Adgangskode', en: 'Password', de: 'Passwort', it: 'Password', hu: 'Jelszó' },
  login: { da: 'Log ind', en: 'Log in', de: 'Anmelden', it: 'Accedi', hu: 'Bejelentkezés' },
  guestContinue: { da: 'Fortsæt uden login', en: 'Continue without login', de: 'Ohne Login fortfahren', it: 'Continua senza login', hu: 'Folytatás bejelentkezés nélkül' },
  createAccount: { da: 'Opret bruger', en: 'Create account', de: 'Konto erstellen', it: 'Crea account', hu: 'Fiók létrehozása' },
  orDivider: { da: 'eller', en: 'or', de: 'oder', it: 'oppure', hu: 'vagy' },
  guestEmailRequired: { da: 'Indtast din email', en: 'Please enter your email', de: 'Bitte geben Sie Ihre E-Mail ein', it: 'Inserisci la tua email', hu: 'Kérjük, adja meg az e-mail címét' },
  loginError: { da: 'Forkert email eller adgangskode', en: 'Incorrect email or password', de: 'Falsche E-Mail oder Passwort', it: 'Email o password errati', hu: 'Hibás e-mail vagy jelszó' },
  notApproved: { da: 'Din konto er ikke godkendt endnu. Kontakt Timan.', en: 'Your account is not approved yet. Contact Timan.', de: 'Ihr Konto ist noch nicht genehmigt. Kontaktieren Sie Timan.', it: 'Il tuo account non è ancora approvato. Contatta Timan.', hu: 'Fiókja még nincs jóváhagyva. Lépjen kapcsolatba a Timan-nal.' },
  notActive: { da: 'Din konto er deaktiveret. Kontakt Timan.', en: 'Your account is deactivated. Contact Timan.', de: 'Ihr Konto ist deaktiviert. Kontaktieren Sie Timan.', it: 'Il tuo account è disattivato. Contatta Timan.', hu: 'Fiókja inaktív. Lépjen kapcsolatba a Timan-nal.' },
  loading: { da: 'Vent venligst...', en: 'Please wait...', de: 'Bitte warten...', it: 'Attendere...', hu: 'Kérem, várjon...' },
  signupSuccess: { da: 'Din konto er oprettet og afventer godkendelse.', en: 'Your account has been created and is awaiting approval.', de: 'Ihr Konto wurde erstellt und wartet auf Genehmigung.', it: 'Il tuo account è stato creato ed è in attesa di approvazione.', hu: 'Fiókja létrejött és jóváhagyásra vár.' },
  signupError: { da: 'Kunne ikke oprette konto. Prøv igen.', en: 'Could not create account. Please try again.', de: 'Konto konnte nicht erstellt werden.', it: 'Impossibile creare l\'account.', hu: 'Nem sikerült létrehozni a fiókot.' },
  signupEmailExists: { da: 'Denne email er allerede registreret. Prøv at logge ind.', en: 'This email is already registered. Try logging in.', de: 'Diese E-Mail ist bereits registriert.', it: 'Questa email è già registrata.', hu: 'Ez az e-mail már regisztrálva van.' },
  passwordTooShort: { da: 'Adgangskoden skal være mindst 6 tegn', en: 'Password must be at least 6 characters', de: 'Passwort muss mindestens 6 Zeichen lang sein', it: 'La password deve avere almeno 6 caratteri', hu: 'A jelszónak legalább 6 karakter hosszúnak kell lennie' },
  backToLogin: { da: 'Tilbage til log ind', en: 'Back to log in', de: 'Zurück zur Anmeldung', it: 'Torna al login', hu: 'Vissza a bejelentkezéshez' },
  continueAsGuest: { da: 'Fortsæt med begrænset adgang', en: 'Continue with limited access', de: 'Mit eingeschränktem Zugang fortfahren', it: 'Continua con accesso limitato', hu: 'Folytatás korlátozott hozzáféréssel' },
  firstName:    { da: 'Fornavn', en: 'First name', de: 'Vorname', it: 'Nome', hu: 'Keresztnév' },
  lastName:     { da: 'Efternavn', en: 'Last name', de: 'Nachname', it: 'Cognome', hu: 'Vezetéknév' },
  company:      { da: 'Firma', en: 'Company', de: 'Firma', it: 'Azienda', hu: 'Cég' },
  address:      { da: 'Adresse', en: 'Address', de: 'Adresse', it: 'Indirizzo', hu: 'Cím' },
  city:         { da: 'By', en: 'City', de: 'Stadt', it: 'Città', hu: 'Város' },
  postalCode:   { da: 'Postnr.', en: 'Postal code', de: 'PLZ', it: 'CAP', hu: 'Irányítószám' },
  country:      { da: 'Land', en: 'Country', de: 'Land', it: 'Paese', hu: 'Ország' },
  preferredLang:{ da: 'Foretrukket sprog', en: 'Preferred language', de: 'Bevorzugte Sprache', it: 'Lingua preferita', hu: 'Preferált nyelv' },
  required:     { da: 'Udfyld alle felter', en: 'Please fill in all fields', de: 'Bitte alle Felder ausfüllen', it: 'Compila tutti i campi', hu: 'Töltse ki az összes mezőt' },
};

function tx(key: string, lang: string): string {
  return T[key]?.[lang] || T[key]?.en || key;
}

type View = 'main' | 'signup' | 'signup-done';

export default function LoginStep({ language, onResolved }: LoginStepProps) {
  const [view, setView] = useState<View>('main');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestError, setGuestError] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [signupEmail, setSignupEmail] = useState('');
  const [showGuestPopup, setShowGuestPopup] = useState(false);
  const [pendingGuestEmail, setPendingGuestEmail] = useState<string | null>(null);

  // Full signup form state
  const [suFirstName, setSuFirstName] = useState('');
  const [suLastName, setSuLastName] = useState('');
  const [suCompany, setSuCompany] = useState('');
  const [suAddress, setSuAddress] = useState('');
  const [suCity, setSuCity] = useState('');
  const [suPostal, setSuPostal] = useState('');
  const [suCountry, setSuCountry] = useState('DK');
  const [suLanguage, setSuLanguage] = useState<Language>((language as Language) || 'da');
  const [suEmail, setSuEmail] = useState('');
  const [suPassword, setSuPassword] = useState('');

  const handleLogin = async () => {
    setError('');
    if (!email.trim()) return;
    setLoading(true);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError || !data.user) {
        setError(tx('loginError', language));
        setLoading(false);
        return;
      }

      const { data: appUserRow, error: dbError } = await supabase
        .from('app_users')
        .select('*')
        .eq('email', data.user.email!.toLowerCase())
        .single();

      if (dbError || !appUserRow) {
        const userEmail = data.user.email!.toLowerCase();
        // Sync new user to app_users
        supabase.from('app_users').upsert({
          email: userEmail,
          full_name: data.user.user_metadata?.full_name || userEmail,
          role: 'slutkunde',
          is_active: true,
          approved: false,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'email' }).then(({ error: syncErr }) => {
          if (syncErr) console.error('[app_users sync] insert failed:', syncErr);
          else console.log('[app_users sync] inserted new:', userEmail);
        });

        trackLogin(userEmail, 'login');

        onResolved({
          ...SLUTKUNDE_DEFAULTS,
          email: userEmail,
          display_name: undefined,
        });
        return;
      }

      if (!appUserRow.approved) {
        setError(tx('notApproved', language));
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      if (!appUserRow.is_active) {
        setError(tx('notActive', language));
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      // Use fresh authenticated session email for all sync
      const authEmail = data.user.email!.toLowerCase();
      console.log('[app_users sync] Using authenticated email:', authEmail);
      
      // Sync user to app_users (update last activity)
      supabase.from('app_users').upsert({
        email: authEmail,
        full_name: appUserRow.full_name || data.user.email,
        role: appUserRow.role,
        is_active: appUserRow.is_active,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'email' }).then(({ error: syncErr }) => {
        if (syncErr) console.error('[app_users sync] update failed:', syncErr);
        else console.log('[app_users sync] updated:', authEmail);
      });

      console.log('[login_tracking sync] Using authenticated email:', authEmail);
      trackLogin(authEmail, 'login');
      // Visitor tracking: register authenticated session
      startAuthenticatedSession(authEmail, language);

      // Link Supabase Auth uid to app_users.auth_user_id so RLS policies
      // (e.g. Timan Backend update) can identify this user.
      linkAuthUserIdIfNeeded();

      // CRM: best-effort login event (never blocks login).
      import('@/lib/crmLoginsService').then(({ logLogin }) => {
        logLogin({
          user_id: appUserRow.id ?? null,
          user_name: appUserRow.full_name ?? null,
          user_email: appUserRow.email ?? authEmail,
          account_id: appUserRow.id ?? null,
          account_name: appUserRow.company || appUserRow.full_name || appUserRow.email,
        });
      }).catch(() => { /* ignore */ });

      onResolved({
        email: appUserRow.email,
        role: appUserRow.role,
        partner_type: appUserRow.partner_type ?? null,
        approved: appUserRow.approved,
        is_active: appUserRow.is_active,
        start_step: appUserRow.start_step ?? 1,
        max_step: appUserRow.max_step ?? 4,
        can_view_prices: appUserRow.can_view_prices ?? false,
        can_submit_order: appUserRow.can_submit_order ?? false,
        can_edit_discount: appUserRow.can_edit_discount ?? false,
        can_switch_customer_mode: appUserRow.can_switch_customer_mode ?? false,
        working_for: appUserRow.working_for ?? null,
        display_name: appUserRow.display_name || appUserRow.full_name,
        portal_role: appUserRow.portal_role ?? null,
        preferred_language: appUserRow.preferred_language ?? null,
        preferred_currency: appUserRow.preferred_currency ?? null,
        company_dealer: appUserRow.company_dealer ?? null,
        module_access: appUserRow.module_access ?? null,
        status: appUserRow.status ?? null,
      });
    } catch (err) {
      setError(tx('loginError', language));
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async () => {
    setError('');
    const emailTrim = suEmail.trim().toLowerCase();
    const firstName = suFirstName.trim();
    const lastName = suLastName.trim();
    const company = suCompany.trim();
    const address = suAddress.trim();
    const city = suCity.trim();
    const postal = suPostal.trim();
    const country = (suCountry || '').trim().toUpperCase();

    if (!firstName || !lastName || !company || !address || !city || !postal || !country || !emailTrim) {
      setError(tx('required', language));
      return;
    }
    if (suPassword.length < 6) {
      setError(tx('passwordTooShort', language));
      return;
    }
    setLoading(true);

    try {
      // 1) Create the Supabase Auth user — they choose their own password.
      const { data, error: authError } = await supabase.auth.signUp({
        email: emailTrim,
        password: suPassword,
        options: {
          emailRedirectTo: `${window.location.origin}/portal`,
          data: {
            full_name: `${firstName} ${lastName}`.trim(),
            first_name: firstName,
            last_name: lastName,
            company,
            country,
            preferred_language: suLanguage,
          },
        },
      });

      if (authError) {
        if (authError.message?.toLowerCase().includes('already registered') || authError.message?.toLowerCase().includes('already been registered')) {
          setError(tx('signupEmailExists', language));
        } else {
          setError(tx('signupError', language));
          console.error('[signup] auth error:', authError);
        }
        setLoading(false);
        return;
      }

      // 2) Insert/update the user in public.app_users — pending approval.
      const { error: upsertErr } = await supabase.from('app_users').upsert({
        email: emailTrim,
        full_name: `${firstName} ${lastName}`.trim(),
        first_name: firstName,
        last_name: lastName,
        company,
        address,
        city,
        postal_code: postal,
        country,
        preferred_language: suLanguage,
        role: 'slutkunde',
        portal_role: 'pending',
        partner_type: null,
        approved: false,
        is_active: false,
        status: 'pending',
        start_step: 1,
        max_step: 1,
        can_view_prices: false,
        can_submit_order: false,
        can_edit_discount: false,
        can_switch_customer_mode: false,
        working_for: null,
        display_name: `${firstName} ${lastName}`.trim(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'email' });

      if (upsertErr) {
        console.error('[signup] app_users upsert failed:', upsertErr);
      }

      setSignupEmail(emailTrim);
      setView('signup-done');
    } catch (err) {
      console.error('[signup] error:', err);
      setError(tx('signupError', language));
    } finally {
      setLoading(false);
    }
  };

  const handleGuestContinue = () => {
    const trimmed = guestEmail.trim();
    // Email is now optional for the guest flow — popup collects country/postal.
    if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setGuestError(tx('guestEmailRequired', language));
      return;
    }
    setPendingGuestEmail(trimmed ? trimmed.toLowerCase() : null);
    setShowGuestPopup(true);
  };

  const finalizeGuestEntry = () => {
    const guestEmailLc = pendingGuestEmail;
    setShowGuestPopup(false);

    if (guestEmailLc) {
      // Sync guest email to app_users (best-effort)
      supabase.from('app_users').upsert({
        email: guestEmailLc,
        full_name: guestEmailLc,
        role: 'slutkunde',
        is_active: true,
        approved: false,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'email' }).then(({ error: syncErr }) => {
        if (syncErr) console.error('[app_users sync] guest insert failed:', syncErr);
      });
      trackLogin(guestEmailLc, 'guest');
    }

    onResolved({
      ...SLUTKUNDE_DEFAULTS,
      email: guestEmailLc || `guest-${Date.now()}@anonymous.local`,
      display_name: undefined,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === 'Enter') action();
  };

  // --- Signup success view ---
  if (view === 'signup-done') {
    return (
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow p-6 md:p-8 text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-emerald-100 flex items-center justify-center">
            <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-gray-700 text-base mb-6 leading-relaxed">
            {tx('signupSuccess', language)}
          </p>
          <div className="space-y-3">
            <button
              onClick={() => {
                onResolved({
                  ...SLUTKUNDE_DEFAULTS,
                  email: signupEmail.toLowerCase(),
                  display_name: undefined,
                });
              }}
              className="w-full py-3 rounded-xl text-base font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg transition"
            >
              {tx('continueAsGuest', language)}
            </button>
            <button
              onClick={() => { setView('main'); setEmail(''); setPassword(''); setError(''); }}
              className="w-full py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:text-gray-700 transition"
            >
              {tx('backToLogin', language)}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Signup form view ---
  if (view === 'signup') {
    return (
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow p-6 md:p-8">
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-6">{tx('createAccount', language)}</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 text-center">{tx('email', language)}</label>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(''); }}
                onKeyDown={e => handleKeyDown(e, handleSignup)}
                className="w-full p-3 border-2 border-gray-200 rounded-xl text-sm text-center focus:border-emerald-500 focus:outline-none transition"
                placeholder="din@email.dk"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 text-center">{tx('password', language)}</label>
              <input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                onKeyDown={e => handleKeyDown(e, handleSignup)}
                className="w-full p-3 border-2 border-gray-200 rounded-xl text-sm text-center focus:border-emerald-500 focus:outline-none transition"
              />
            </div>

            {error && <p className="text-red-500 text-xs text-center">{error}</p>}

            <button
              onClick={handleSignup}
              disabled={loading}
              className="w-full py-3 rounded-xl text-base font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg transition disabled:opacity-50"
            >
              {loading ? tx('loading', language) : tx('createAccount', language)}
            </button>

            <button
              onClick={() => { setView('main'); setError(''); }}
              className="w-full py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:text-gray-700 transition"
            >
              {tx('backToLogin', language)}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Main view: Log ind / Fortsæt uden login / Opret bruger ---
  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white rounded-2xl shadow p-6 md:p-8">
        <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">{tx('title', language)}</h2>
        <p className="text-gray-500 text-center mb-6 text-sm">{tx('subtitle', language)}</p>

        <div className="space-y-4">
          {/* Login fields */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 text-center">{tx('email', language)}</label>
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(''); }}
              onKeyDown={e => handleKeyDown(e, handleLogin)}
              className="w-full p-3 border-2 border-gray-200 rounded-xl text-sm text-center focus:border-emerald-500 focus:outline-none transition"
              placeholder="din@email.dk"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 text-center">{tx('password', language)}</label>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              onKeyDown={e => handleKeyDown(e, handleLogin)}
              className="w-full p-3 border-2 border-gray-200 rounded-xl text-sm text-center focus:border-emerald-500 focus:outline-none transition"
            />
          </div>

          {error && <p className="text-red-500 text-xs text-center">{error}</p>}

          {/* Log ind */}
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full py-3 rounded-xl text-base font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg transition disabled:opacity-50"
          >
            {loading ? tx('loading', language) : tx('login', language)}
          </button>

          {/* Divider */}
          <div className="relative my-2">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
            <div className="relative flex justify-center text-xs"><span className="bg-white px-3 text-gray-400">{tx('orDivider', language)}</span></div>
          </div>

          {/* Guest continue */}
          <div>
            <input
              type="email"
              value={guestEmail}
              onChange={e => { setGuestEmail(e.target.value); setGuestError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') handleGuestContinue(); }}
              className="w-full p-3 border-2 border-gray-200 rounded-xl text-sm text-center focus:border-gray-400 focus:outline-none transition"
              placeholder={language === 'da' ? 'din@email.dk' : 'your@email.com'}
            />
            {guestError && <p className="text-red-500 text-xs mt-1 text-center">{guestError}</p>}
          </div>
          <button
            onClick={handleGuestContinue}
            className="w-full py-3 rounded-xl text-sm font-medium text-gray-600 border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition"
          >
            {tx('guestContinue', language)}
          </button>

          {/* Opret bruger */}
          <button
            onClick={() => { setView('signup'); setEmail(''); setPassword(''); setError(''); }}
            className="w-full py-3 rounded-xl text-sm font-medium text-emerald-700 border-2 border-emerald-200 hover:border-emerald-300 hover:bg-emerald-50 transition"
          >
            {tx('createAccount', language)}
          </button>
        </div>
      </div>

      <GuestVisitorPopup
        open={showGuestPopup}
        language={language as never}
        email={pendingGuestEmail}
        onCancel={() => setShowGuestPopup(false)}
        onConfirm={finalizeGuestEntry}
      />
    </div>
  );
}
