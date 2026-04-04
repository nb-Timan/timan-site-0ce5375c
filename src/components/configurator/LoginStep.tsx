import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { AppUser, SLUTKUNDE_DEFAULTS, lookupAppUser } from '@/data/appUsers';

interface LoginStepProps {
  language: string;
  onResolved: (user: AppUser & { email: string }) => void;
}

const T: Record<string, Record<string, string>> = {
  title: { da: 'Log ind for at starte', en: 'Log in to start', de: 'Anmelden um zu starten', it: 'Accedi per iniziare', hu: 'Jelentkezzen be a kezdéshez' },
  subtitle: { da: 'Din adgang og rettigheder bestemmes af din konto', en: 'Your access and permissions are determined by your account', de: 'Ihr Zugang wird durch Ihr Konto bestimmt', it: 'Il tuo accesso è determinato dal tuo account', hu: 'A hozzáférését a fiókja határozza meg' },
  email: { da: 'Email', en: 'Email', de: 'E-Mail', it: 'Email', hu: 'E-mail' },
  password: { da: 'Adgangskode', en: 'Password', de: 'Passwort', it: 'Password', hu: 'Jelszó' },
  login: { da: 'Log ind', en: 'Log in', de: 'Anmelden', it: 'Accedi', hu: 'Bejelentkezés' },
  noAccount: { da: 'Fortsæt uden login (slutkunde)', en: 'Continue without login (end customer)', de: 'Ohne Login fortfahren (Endkunde)', it: 'Continua senza login (cliente finale)', hu: 'Folytatás bejelentkezés nélkül (végfelhasználó)' },
  loginError: { da: 'Forkert email eller adgangskode', en: 'Incorrect email or password', de: 'Falsche E-Mail oder Passwort', it: 'Email o password errati', hu: 'Hibás e-mail vagy jelszó' },
  notApproved: { da: 'Din konto er ikke godkendt endnu. Kontakt Timan.', en: 'Your account is not approved yet. Contact Timan.', de: 'Ihr Konto ist noch nicht genehmigt. Kontaktieren Sie Timan.', it: 'Il tuo account non è ancora approvato. Contatta Timan.', hu: 'Fiókja még nincs jóváhagyva. Lépjen kapcsolatba a Timan-nal.' },
  notActive: { da: 'Din konto er deaktiveret. Kontakt Timan.', en: 'Your account is deactivated. Contact Timan.', de: 'Ihr Konto ist deaktiviert. Kontaktieren Sie Timan.', it: 'Il tuo account è disattivato. Contatta Timan.', hu: 'Fiókja inaktív. Lépjen kapcsolatba a Timan-nal.' },
  loading: { da: 'Logger ind...', en: 'Logging in...', de: 'Anmeldung...', it: 'Accesso...', hu: 'Bejelentkezés...' },
  supabaseNotConfigured: { da: 'Supabase er ikke konfigureret. Bruger lokal brugertabel.', en: 'Supabase not configured. Using local user table.', de: 'Supabase nicht konfiguriert. Lokale Benutzertabelle wird verwendet.', it: 'Supabase non configurato. Uso tabella utenti locale.', hu: 'Supabase nincs konfigurálva. Helyi felhasználói tábla használata.' },
};

function tx(key: string, lang: string): string {
  return T[key]?.[lang] || T[key]?.en || key;
}

export default function LoginStep({ language, onResolved }: LoginStepProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const supabaseConfigured = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

  const handleLogin = async () => {
    setError('');
    if (!email.trim()) return;

    setLoading(true);

    try {
      if (supabaseConfigured) {
        // Real Supabase Auth login
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (authError || !data.user) {
          setError(tx('loginError', language));
          setLoading(false);
          return;
        }

        // Fetch from app_users table
        const { data: appUserRow, error: dbError } = await supabase
          .from('app_users')
          .select('*')
          .eq('email', data.user.email!.toLowerCase())
          .single();

        if (dbError || !appUserRow) {
          // Authenticated but not in app_users → slutkunde
          onResolved({
            ...SLUTKUNDE_DEFAULTS,
            email: data.user.email!.toLowerCase(),
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

        onResolved({
          email: appUserRow.email,
          role: appUserRow.role,
          approved: appUserRow.approved,
          is_active: appUserRow.is_active,
          start_step: appUserRow.start_step ?? 1,
          max_step: appUserRow.max_step ?? 4,
          can_view_prices: appUserRow.can_view_prices ?? false,
          can_submit_order: appUserRow.can_submit_order ?? false,
          can_edit_discount: appUserRow.can_edit_discount ?? false,
          can_switch_customer_mode: appUserRow.can_switch_customer_mode ?? false,
          working_for: appUserRow.working_for ?? null,
          display_name: appUserRow.display_name,
        });
      } else {
        // Fallback: local lookup (no Supabase configured)
        if (!password) {
          // For local dev, allow login without password
        }
        const localUser = lookupAppUser(email.trim());
        if (localUser) {
          onResolved({ ...localUser, email: email.trim().toLowerCase() });
        } else {
          onResolved({
            ...SLUTKUNDE_DEFAULTS,
            email: email.trim().toLowerCase(),
            display_name: undefined,
          });
        }
      }
    } catch (err) {
      setError(tx('loginError', language));
    } finally {
      setLoading(false);
    }
  };

  const handleGuestContinue = () => {
    onResolved({
      ...SLUTKUNDE_DEFAULTS,
      email: '',
      display_name: undefined,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLogin();
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white rounded-2xl shadow p-6 md:p-8">
        <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">{tx('title', language)}</h2>
        <p className="text-gray-500 text-center mb-6 text-sm">{tx('subtitle', language)}</p>

        {!supabaseConfigured && (
          <div className="mb-4 p-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700 text-center">
            {tx('supabaseNotConfigured', language)}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{tx('email', language)}</label>
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(''); }}
              onKeyDown={handleKeyDown}
              className="w-full p-3 border-2 border-gray-200 rounded-xl text-sm focus:border-emerald-500 focus:outline-none transition"
              placeholder="din@email.dk"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{tx('password', language)}</label>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              onKeyDown={handleKeyDown}
              className="w-full p-3 border-2 border-gray-200 rounded-xl text-sm focus:border-emerald-500 focus:outline-none transition"
            />
          </div>

          {error && <p className="text-red-500 text-xs">{error}</p>}

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full py-3 rounded-xl text-base font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg transition disabled:opacity-50"
          >
            {loading ? tx('loading', language) : tx('login', language)}
          </button>

          <button
            onClick={handleGuestContinue}
            className="w-full py-2 rounded-xl text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition"
          >
            {tx('noAccount', language)}
          </button>
        </div>
      </div>
    </div>
  );
}
