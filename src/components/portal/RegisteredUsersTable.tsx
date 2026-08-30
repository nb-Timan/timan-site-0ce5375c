/**
 * RegisteredUsersTable — unified list of portal users + dealer_contacts.
 * Used by both DealerDataPage and CrmDealerDetailPage (Brugere-fanen).
 *
 * Duplicates (same email) are collapsed to a single row, where portal-user
 * data takes precedence and contact data fills in missing fields (phone,
 * area, primary flag).
 */
import { Badge } from "@/components/ui/badge";
import type { DealerContact } from "@/lib/dealerContactsService";
import type { Language } from "@/types/configurator";

/** Generic portal user shape — accepts either BackendUser or the lightweight
 *  shape used by DealerDataPage. Pass what you have; missing fields → "—".
 */
export interface PortalUserLike {
  id: string;
  email: string | null;
  full_name?: string | null;
  name?: string | null;
  role?: string | null;
  portal_role?: string | null;
  phone?: string | null;
  status?: string | null;
  approved?: boolean | null;
  is_active?: boolean | null;
  last_login?: string | null;
  last_login_at?: string | null;
  preferred_language?: string | null;
  language?: string | null;
}

interface Props {
  portalUsers: PortalUserLike[];
  contacts: DealerContact[];
  language?: Language;
}

interface Row {
  key: string;
  name: string;
  email: string;
  role: string;
  area: string | null;
  phone: string;
  statusLabel: string;
  statusTone: "ok" | "warn" | "no" | "muted";
  isPrimary: boolean;
  lastLogin: string;
  language: string;
}

const LOCALE_MAP: Record<Language, string> = {
  da: "da-DK", en: "en-GB", de: "de-DE", it: "it-IT", hu: "hu-HU",
};

const I18N = {
  area: {
    director:  { da: "Direktør",    en: "Director",   de: "Geschäftsführer", it: "Amministratore", hu: "Ügyvezető" },
    sales:     { da: "Salg",       en: "Sales",      de: "Vertrieb",   it: "Vendite",   hu: "Értékesítés" },
    workshop:  { da: "Værksted & service", en: "Workshop & service", de: "Werkstatt & Service", it: "Officina e assistenza", hu: "Műhely és szerviz" },
    parts:     { da: "Indkøb & logistik", en: "Purchasing & logistics", de: "Einkauf & Logistik", it: "Acquisti e logistica", hu: "Beszerzés és logisztika" },
    marketing: { da: "Marketing",  en: "Marketing",  de: "Marketing",  it: "Marketing", hu: "Marketing" },
    finance:   { da: "Økonomi",    en: "Finance",    de: "Buchhaltung",it: "Amministrazione", hu: "Pénzügy" },
  },
  active:   { da: "Aktiv",  en: "Active",  de: "Aktiv",     it: "Attivo",   hu: "Aktív" },
  pending:  { da: "Afventer", en: "Pending", de: "Ausstehend", it: "In attesa", hu: "Függőben" },
  blocked:  { da: "Spærret", en: "Blocked", de: "Gesperrt",  it: "Bloccato", hu: "Zárolva" },
  primary:  { da: "Primær kontakt", en: "Primary contact", de: "Hauptkontakt", it: "Contatto principale", hu: "Elsődleges kapcsolat" },
  contact:  { da: "Kontaktperson",  en: "Contact",         de: "Kontaktperson", it: "Contatto",          hu: "Kapcsolattartó" },
  primaryBadge: { da: "Primær", en: "Primary", de: "Haupt", it: "Principale", hu: "Elsődleges" },
  empty:    { da: "Ingen brugere eller kontaktpersoner registreret.", en: "No users or contacts registered.", de: "Keine Benutzer oder Kontakte registriert.", it: "Nessun utente o contatto registrato.", hu: "Nincs regisztrált felhasználó vagy kapcsolattartó." },
  hContact: { da: "Kontaktperson", en: "Contact",        de: "Kontaktperson", it: "Contatto",        hu: "Kapcsolattartó" },
  hEmail:   { da: "E-mail",        en: "E-mail",         de: "E-Mail",        it: "E-mail",          hu: "E-mail" },
  hRole:    { da: "Rolle / område", en: "Role / area",   de: "Rolle / Bereich", it: "Ruolo / area",  hu: "Szerep / terület" },
  hPhone:   { da: "Telefon",       en: "Phone",          de: "Telefon",       it: "Telefono",        hu: "Telefon" },
  hStatus:  { da: "Status",        en: "Status",         de: "Status",        it: "Stato",           hu: "Állapot" },
  hLogin:   { da: "Sidste login",  en: "Last login",     de: "Letzter Login", it: "Ultimo accesso",  hu: "Utolsó belépés" },
  hLang:    { da: "Sprog",         en: "Language",       de: "Sprache",       it: "Lingua",          hu: "Nyelv" },
} as const;

function fmtDate(s: string | null | undefined, lang: Language): string {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString(LOCALE_MAP[lang]); } catch { return "—"; }
}

function userStatus(u: PortalUserLike, lang: Language): { label: string; tone: Row["statusTone"] } {
  const s = (u.status || "").toLowerCase();
  if (s === "active" || (u.approved !== false && u.is_active !== false && !s))
    return { label: I18N.active[lang], tone: "ok" };
  if (s === "pending" || u.approved === false) return { label: I18N.pending[lang], tone: "warn" };
  if (s === "blocked" || u.is_active === false) return { label: I18N.blocked[lang], tone: "no" };
  return { label: s || "—", tone: "muted" };
}

export default function RegisteredUsersTable({ portalUsers, contacts, language = "da" }: Props) {
  const lang: Language = language;
  const rows: Row[] = [];
  const emailIndex = new Map<string, number>();

  for (const u of portalUsers) {
    const email = (u.email || "").trim();
    const lower = email.toLowerCase();
    const st = userStatus(u, lang);
    const r: Row = {
      key: `u:${u.id}`,
      name: u.full_name || u.name || "—",
      email: email || "—",
      role: u.portal_role || u.role || "—",
      area: null,
      phone: u.phone || "—",
      statusLabel: st.label,
      statusTone: st.tone,
      isPrimary: false,
      lastLogin: fmtDate(u.last_login ?? u.last_login_at ?? null, lang),
      language: (u.preferred_language || u.language || "").toUpperCase() || "—",
    };
    rows.push(r);
    if (lower) emailIndex.set(lower, rows.length - 1);
  }

  for (const c of contacts) {
    const email = (c.email || "").trim();
    const lower = email.toLowerCase();
    const areaLabel = c.contact_area
      ? (I18N.area as Record<string, Record<Language, string>>)[c.contact_area]?.[lang] ?? c.contact_area
      : null;
    if (lower && emailIndex.has(lower)) {
      const idx = emailIndex.get(lower)!;
      const r = rows[idx];
      if (r.phone === "—" && c.phone) r.phone = c.phone;
      if (!r.area && areaLabel) r.area = areaLabel;
      if (c.is_primary) r.isPrimary = true;
      if (r.name === "—" && c.name) r.name = c.name;
      continue;
    }
    const r: Row = {
      key: `c:${c.id}`,
      name: c.name || "—",
      email: email || "—",
      role: c.role_title || "—",
      area: areaLabel,
      phone: c.phone || "—",
      statusLabel: c.is_primary ? I18N.primary[lang] : I18N.contact[lang],
      statusTone: c.is_primary ? "warn" : "muted",
      isPrimary: c.is_primary,
      lastLogin: "—",
      language: "—",
    };
    rows.push(r);
    if (lower) emailIndex.set(lower, rows.length - 1);
  }

  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">{I18N.empty[lang]}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-slate-500 border-b">
          <tr>
            <th className="py-2 pr-4">{I18N.hContact[lang]}</th>
            <th className="py-2 pr-4">{I18N.hEmail[lang]}</th>
            <th className="py-2 pr-4">{I18N.hRole[lang]}</th>
            <th className="py-2 pr-4">{I18N.hPhone[lang]}</th>
            <th className="py-2 pr-4">{I18N.hStatus[lang]}</th>
            <th className="py-2 pr-4 whitespace-nowrap">{I18N.hLogin[lang]}</th>
            <th className="py-2 pr-4">{I18N.hLang[lang]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b last:border-0 align-top">
              <td className="py-2 pr-4 font-medium text-slate-900">
                {r.name}
                {r.isPrimary && (
                  <Badge className="ml-2 bg-amber-100 text-amber-800 hover:bg-amber-100">{I18N.primaryBadge[lang]}</Badge>
                )}
              </td>
              <td className="py-2 pr-4">
                {r.email !== "—" ? <a href={`mailto:${r.email}`} className="hover:underline">{r.email}</a> : "—"}
              </td>
              <td className="py-2 pr-4">
                <div className="text-slate-700">{r.role}</div>
                {r.area && <div className="text-xs text-slate-400">{r.area}</div>}
              </td>
              <td className="py-2 pr-4">
                {r.phone !== "—" ? <a href={`tel:${r.phone}`} className="hover:underline">{r.phone}</a> : "—"}
              </td>
              <td className="py-2 pr-4">
                {r.statusTone === "ok" && <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">{r.statusLabel}</Badge>}
                {r.statusTone === "warn" && <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">{r.statusLabel}</Badge>}
                {r.statusTone === "no" && <Badge variant="destructive">{r.statusLabel}</Badge>}
                {r.statusTone === "muted" && <Badge variant="secondary">{r.statusLabel}</Badge>}
              </td>
              <td className="py-2 pr-4 text-slate-500 text-xs whitespace-nowrap">{r.lastLogin}</td>
              <td className="py-2 pr-4 uppercase text-xs text-slate-500">{r.language}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
