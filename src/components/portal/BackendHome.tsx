/**
 * Grupperet forside for Timan Backend.
 *
 * Erstatter det flade placeholder-grid med fem tydelige sektioner:
 *   1. Brugerstyring
 *   2. Partnerstyring
 *   3. Data & Integrationer
 *   4. Analyse & Budget
 *   5. System
 *
 * Alle eksisterende routes bevares — kort der ikke har en endelig side
 * vises som "Kommer snart" (PlaceholderCard uden `to`).
 *
 * Ingen permission-ændringer: hele siden vises kun til brugere som
 * `isAreaVisible` allerede har godkendt for `timan_backend`.
 */
import {
  Users, ShieldCheck, KeyRound, ScrollText,
  Building2, Link2, Map, MapPin,
  Database, BarChart3, Upload, LineChart,
  Mail, ListChecks, Activity, FileSearch, Sparkles, QrCode, Newspaper, LucideIcon,
  ClipboardList,
} from "lucide-react";

import PlaceholderCard from "@/components/portal/PlaceholderCard";
import { Language } from "@/types/configurator";

interface Item {
  title: string;
  description: string;
  icon: LucideIcon;
  to?: string;
}

interface Group {
  title: string;
  description: string;
  items: Item[];
}

function buildGroups(): Group[] {
  return [
    {
      title: "Brugerstyring",
      description: "Brugere, roller, modul-adgang og audit log.",
      items: [
        { title: "Brugere", icon: Users, to: "/portal/backend/users", description: "Administrér alle portal-brugere, godkend nye signups og tildel roller." },
        { title: "Roller", icon: ShieldCheck, to: "/portal/backend/roles", description: "Definér portal-roller og standard-rettigheder." },
        { title: "Modul-adgang", icon: KeyRound, to: "/portal/backend/module-access", description: "Styr hvilke moduler hver rolle har adgang til." },
        { title: "Audit Log", icon: ScrollText, to: "/portal/backend/audit-log", description: "Se ændringer på brugere, roller og adgang." },
      ],
    },
    {
      title: "Partnerstyring",
      description: "Forhandlere, matching og geografisk dækning.",
      items: [
        { title: "Forhandlere", icon: Building2, to: "/portal/backend/dealer-accounts", description: "Master-overblik over alle forhandlere, service partnere og importører." },
        { title: "Dealer Matching", icon: Link2, to: "/portal/backend/data?tab=garanti", description: "Manuel matching af garantiregistreringer mod forhandlere." },
        { title: "Partnerkort administration", icon: Map, description: "Administrér det offentlige partnerkort." },
        { title: "Partner relationer", icon: Link2, to: "/portal/backend/partner-relations", description: "Importør→forhandler-hierarki og service-partner→forhandler-relationer for Min Maskine adgang." },
        { title: "Geografisk dækning", icon: MapPin, to: "/portal/backend/data?tab=forhandlere", description: "Geocoding af forhandleradresser og dækningsoverblik." },
      ],
    },
    {
      title: "Data & Integrationer",
      description: "Import, eksport, SharePoint sync, warranty sync, ERP og geocoding.",
      items: [
        { title: "Data & Integrationer", icon: Database, to: "/portal/backend/data", description: "Samlet kontrolcenter for alle imports, eksports og syncs — med status og historik." },
        { title: "Afprøvning af 2620", icon: ClipboardList, to: "/portal/backend/timan-2620-afproevning", description: "Se indsendelser fra det selvstændige 2620-afprøvningsflow." },
      ],
    },
    {
      title: "Analyse & Budget",
      description: "Portal-brug, budgetimport og dashboards.",
      items: [
        { title: "Portal Analytics", icon: BarChart3, to: "/portal/backend/portal-analytics", description: "Brug af portalen — besøg, sessioner og moduler." },
        { title: "Budget Import", icon: Upload, to: "/portal/backend/budget-import", description: "Importér sælgerbudgetter fra Excel-oversigt til CRM Budget." },
        { title: "Budget Dashboard", icon: LineChart, to: "/portal/crm/budget", description: "Følg op på sælgerbudgetter og forhandlerlinjer." },
      ],
    },
    {
      title: "System",
      description: "Systemstatus, mail-log, job queue, change log og persistence audit.",
      items: [
        { title: "Nyheder", icon: Newspaper, to: "/portal/backend/news", description: "Administrér nyheder, kladder, skabeloner og publicering til Seneste nyt." },
        { title: "Seneste ændringer", icon: Sparkles, to: "/portal/backend/changelog", description: "Administrér portalens change log — opret, redigér og slet ændringer som vises på forsiden og modulkort." },
        { title: "Persistence Audit", icon: FileSearch, to: "/portal/backend/persistence-audit", description: "Tjek dataintegritet og overvåg gemte ressourcer." },
        { title: "Mail Log", icon: Mail, description: "Log over udsendte mails fra portalen." },
        { title: "Job Queue", icon: ListChecks, description: "Baggrundsjobs og kørselshistorik." },
        { title: "Systemstatus", icon: Activity, description: "Edge functions, database og integrationer." },
        { title: "Timan Messe", icon: QrCode, to: "/portal/backend/messe", description: "Aktivér offentlig QR-adgang til /messe og download QR-kode til messer." },
      ],
    },

  ];
}

interface Props { language: Language }

export default function BackendHome({ language }: Props) {
  const groups = buildGroups();
  return (
    <div className="space-y-12">
      {groups.map((g) => (
        <section key={g.title}>
          <div className="mb-5">
            <h2 className="text-xl font-bold text-slate-900">{g.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{g.description}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {g.items.map((it) => (
              <PlaceholderCard
                key={it.title}
                title={it.title}
                language={language}
                to={it.to}
                icon={it.icon}
                description={it.description}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
