/**
 * Ensartet sektionsramme til sync-paneler i Backend → Data & Integrationer.
 *
 * Tilføjer en overskrift, kort beskrivelse, statusbadge (grøn/gul/rød/grå)
 * og "Senest kørt"-tidspunkt — uden at ændre det underliggende panel.
 * Pakker det eksisterende panel som `children` så ALL eksisterende
 * funktionalitet (Verificér / Dry-run / Kør sync / Historik) er bevaret.
 */
import { ReactNode } from "react";
import { Clock } from "lucide-react";
import { SyncBadge, SYNC_BADGE_CLASSES, fmtSyncDateTime } from "@/lib/syncStatusBadge";

interface Props {
  title: string;
  description?: string;
  badge?: SyncBadge;
  children: ReactNode;
}

export default function SyncSection({ title, description, badge, children }: Props) {
  return (
    <section className="mb-8 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <header className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          {description && (
            <p className="mt-1 text-sm text-slate-600">{description}</p>
          )}
        </div>
        {badge && (
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
              <Clock className="h-3.5 w-3.5" />
              Senest kørt: <strong className="font-semibold text-slate-800">{fmtSyncDateTime(badge.lastRunAt)}</strong>
            </span>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${SYNC_BADGE_CLASSES[badge.tone]}`}>
              {badge.label}
            </span>
          </div>
        )}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}
