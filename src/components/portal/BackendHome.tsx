/**
 * Timan Backend dashboard.
 *
 * Dashboardet er nu en kort forside med genveje til de faste Backend-
 * hovedområder. De konkrete administrationskort ligger på hver
 * hovedområdes egen oversigtsside.
 */
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { backendSections } from "@/lib/backendNavigation";

export default function BackendHome() {
  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Backend Dashboard</p>
        <h2 className="mt-2 text-2xl font-black text-slate-950">Vælg et hovedområde i venstremenuen</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
          Backend er nu delt op i få faste områder. Det gør brugeradministration,
          partnerdata, integrationer, analyse og systemværktøjer nemmere at finde.
        </p>
      </section>

      <section>
        <div className="mb-5">
          <h2 className="text-xl font-black text-slate-950">Hovedområder</h2>
          <p className="mt-1 text-sm text-slate-600">Åbn et område for at se de relevante eksisterende funktioner.</p>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {backendSections.map((section) => {
            const Icon = section.icon;
            return (
              <Link
                key={section.id}
                to={section.to}
                className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-emerald-200 hover:shadow-md"
              >
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-black text-slate-950">{section.title}</h3>
                <p className="mt-2 min-h-[44px] text-sm leading-6 text-slate-600">{section.description}</p>
                <div className="mt-5 inline-flex items-center gap-2 text-sm font-black text-emerald-700">
                  Åbn område <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
