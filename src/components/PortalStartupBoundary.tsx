import { Component, type ErrorInfo, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import {
  attemptAutomaticChunkRecovery,
  classifyPortalStartupFailure,
  markPortalStartup,
  PORTAL_BUILD_ID,
} from '@/lib/portalStartupDiagnostics';

type Props = { children: ReactNode };
type State = { error: Error | null; reference: string | null; recovering: boolean };

export function PortalStartupFailure({ reference }: { reference?: string | null }) {
  const retry = () => window.location.reload();
  const loginAgain = async () => {
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } finally {
      try { window.sessionStorage.removeItem('timan.appUser'); } catch { /* optional */ }
      window.location.assign('/portal');
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-16 text-slate-900">
      <section className="mx-auto max-w-md border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 inline-flex bg-[#2d5a27] px-3 py-1 text-lg font-bold text-white">TIMAN</div>
        <h1 className="text-xl font-semibold">Portalen kunne ikke indlæses</h1>
        <p className="mt-2 text-sm text-slate-600">
          Prøv at indlæse portalen igen. Hvis problemet fortsætter, kan du logge ind på ny.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={retry} className="rounded-md bg-[#2d5a27] px-4 py-2 text-sm font-medium text-white">
            Prøv igen
          </button>
          <button type="button" onClick={() => void loginAgain()} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800">
            Log ind igen
          </button>
        </div>
        <p className="mt-5 text-xs text-slate-400">Reference: {reference || 'startup'} · build {PORTAL_BUILD_ID}</p>
      </section>
    </main>
  );
}

export default class PortalStartupBoundary extends Component<Props, State> {
  state: State = { error: null, reference: null, recovering: false };

  static getDerivedStateFromError(error: Error): State {
    return {
      error,
      reference: `BOOT-${Date.now().toString(36).toUpperCase()}`,
      recovering: false,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const category = classifyPortalStartupFailure(error, 'route_error');
    markPortalStartup(category, { once: false, errorCategory: category });
    console.error('[portal-startup] Unrecoverable render error', { category, componentStack: errorInfo.componentStack });
    if (attemptAutomaticChunkRecovery(error)) this.setState({ recovering: true });
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (this.state.recovering) {
      return <div role="status" className="min-h-screen bg-slate-50 p-6 text-sm text-slate-600">Henter nyeste Portal-version...</div>;
    }
    return <PortalStartupFailure reference={this.state.reference} />;
  }
}
