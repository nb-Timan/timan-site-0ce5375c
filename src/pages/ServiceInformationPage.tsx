/**
 * Serviceinformation page — migrated from the old Timan Service Portal
 * (`src/routes/service-info.tsx`). Shows two cards:
 *   - Teknisk support (phone + email)
 *   - Kontakt os (Timan A/S address + email)
 * Phone & email are click-to-call / mailto links.
 */
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Building2, Mail, MapPin, Phone } from "lucide-react";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import { getPortalBackTarget } from "@/lib/portalBackNav";

export default function ServiceInformationPage() {
  const { appUser, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  if (!appUser) {
    navigate("/portal", { replace: true });
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 flex flex-col">
      <PortalHeader
        user={appUser}
        language={lang}
        onLanguageChange={setLanguage}
        onLogout={async () => {
          await logout();
          navigate("/portal", { replace: true });
        }}
      />

      <div className="bg-white border-b border-slate-200 py-3">
        <div className="mx-auto max-w-[1700px] px-4 sm:px-6 lg:px-8">
          <button
            onClick={() => navigate(getPortalBackTarget(location.pathname))}
            className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Tilbage til Teknik &amp; Service
          </button>
        </div>
      </div>

      <main className="mx-auto max-w-[1700px] px-4 sm:px-6 lg:px-8 py-10 flex-1 w-full">
        <div className="mb-8">
          <h1 className="text-3xl font-black tracking-tight">Serviceinformation</h1>
          <p className="mt-1 text-sm text-slate-500">
            Generel information og kontaktoplysninger.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Technical support */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <Phone className="h-5 w-5" />
              </div>
              <h2 className="text-lg font-bold text-slate-950">Teknisk support</h2>
            </div>
            <dl className="space-y-4">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Telefon
                </dt>
                <dd className="mt-1">
                  <a
                    href="tel:+4596744466"
                    className="text-base font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
                  >
                    96 74 44 66
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Email
                </dt>
                <dd className="mt-1">
                  <a
                    href="mailto:service@timan.dk"
                    className="text-base font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
                  >
                    service@timan.dk
                  </a>
                </dd>
              </div>
            </dl>
          </section>

          {/* Contact us */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                <Building2 className="h-5 w-5" />
              </div>
              <h2 className="text-lg font-bold text-slate-950">Kontakt os</h2>
            </div>
            <dl className="space-y-4">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Virksomhed
                </dt>
                <dd className="mt-1 text-base font-semibold text-slate-950">
                  Timan A/S
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Adresse
                </dt>
                <dd className="mt-1 flex items-start gap-2 text-base text-slate-800">
                  <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
                  <span>Osvald Pedersens Vej 2A-D, 6980 Tim</span>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Email
                </dt>
                <dd className="mt-1 flex items-center gap-2">
                  <Mail className="h-4 w-4 text-slate-400" />
                  <a
                    href="mailto:service@timan.dk"
                    className="text-base font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
                  >
                    service@timan.dk
                  </a>
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}
