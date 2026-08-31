/**
 * RegisteredUsersTable — unified list of portal users + dealer_contacts.
 * Used by both DealerDataPage and CrmDealerDetailPage (Brugere-fanen).
 *
 * Contact rows are aggregated to unique people. The current contact schema has
 * no shared person id across departments, so normalized email is the canonical
 * cross-record key; contacts without email stay keyed by their own contact id.
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
  language?: Language | string | null;
}

export interface RegisteredUserRow {
  key: string;
  name: string;
  email: string;
  roles: string[];
  areas: string[];
  phone: string;
  statusLabel: string;
  statusTone: "ok" | "warn" | "no" | "muted";
  isPrimary: boolean;
  lastLogin: string;
  language: string;
  conflicts: string[];
}

const LOCALE_MAP: Record<Language, string> = {
  da: "da-DK", en: "en-GB", de: "de-DE", it: "it-IT", hu: "hu-HU",
};
const TABLE_LANGUAGES = ["da", "en", "de", "it", "hu"] as const;

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

function userStatus(u: PortalUserLike, lang: Language): { label: string; tone: RegisteredUserRow["statusTone"] } {
  const s = (u.status || "").toLowerCase();
  if (s === "active" || (u.approved !== false && u.is_active !== false && !s))
    return { label: I18N.active[lang], tone: "ok" };
  if (s === "pending" || u.approved === false) return { label: I18N.pending[lang], tone: "warn" };
  if (s === "blocked" || u.is_active === false) return { label: I18N.blocked[lang], tone: "no" };
  return { label: s || "—", tone: "muted" };
}

function tableLanguage(language: Language | string | null | undefined): Language {
  return TABLE_LANGUAGES.includes(language as Language) ? language as Language : "da";
}

function normalizeEmail(email: string | null | undefined): string {
  return (email || "").trim().toLowerCase();
}

function uniquePush(values: string[], value: string | null | undefined): void {
  const clean = (value || "").trim();
  if (!clean || clean === "—") return;
  if (!values.some((existing) => existing.toLowerCase() === clean.toLowerCase())) {
    values.push(clean);
  }
}

function areaLabelFor(contact: DealerContact, lang: Language): string | null {
  if (!contact.contact_area) return null;
  return (I18N.area as Record<string, Record<Language, string>>)[contact.contact_area]?.[lang]
    ?? contact.contact_area;
}

function contactKey(contact: DealerContact): string {
  const email = normalizeEmail(contact.email);
  return email ? `email:${email}` : `contact:${contact.id}`;
}

function userKey(user: PortalUserLike): string {
  const email = normalizeEmail(user.email);
  return email ? `email:${email}` : `user:${user.id}`;
}

function mergeDisplayValue(
  row: RegisteredUserRow,
  field: "name" | "email" | "phone",
  nextValue: string | null | undefined,
  conflictLabel: string,
): void {
  const next = (nextValue || "").trim();
  if (!next) return;
  if (row[field] === "—") {
    row[field] = next;
    return;
  }
  if (row[field].toLowerCase() !== next.toLowerCase()) {
    uniquePush(row.conflicts, conflictLabel);
  }
}

export function buildRegisteredUserRows(
  portalUsers: PortalUserLike[],
  contacts: DealerContact[],
  language: Language | string | null | undefined = "da",
): RegisteredUserRow[] {
  const lang = tableLanguage(language);
  const rows: RegisteredUserRow[] = [];
  const rowIndex = new Map<string, number>();

  const upsertRow = (key: string, rowFactory: () => RegisteredUserRow): RegisteredUserRow => {
    const existingIndex = rowIndex.get(key);
    if (existingIndex !== undefined) return rows[existingIndex];
    const row = rowFactory();
    rows.push(row);
    rowIndex.set(key, rows.length - 1);
    return row;
  };

  for (const u of portalUsers) {
    const email = (u.email || "").trim();
    const st = userStatus(u, lang);
    const row = upsertRow(userKey(u), () => ({
      key: userKey(u),
      name: u.full_name || u.name || "—",
      email: email || "—",
      roles: [],
      areas: [],
      phone: u.phone || "—",
      statusLabel: st.label,
      statusTone: st.tone,
      isPrimary: false,
      lastLogin: fmtDate(u.last_login ?? u.last_login_at ?? null, lang),
      language: (u.preferred_language || u.language || "").toUpperCase() || "—",
      conflicts: [],
    }));

    uniquePush(row.roles, u.portal_role || u.role);
    mergeDisplayValue(row, "name", u.full_name || u.name, "Navn");
    mergeDisplayValue(row, "email", email, "E-mail");
    mergeDisplayValue(row, "phone", u.phone, "Telefon");
  }

  for (const c of contacts) {
    const email = (c.email || "").trim();
    const areaLabel = areaLabelFor(c, lang);
    const row = upsertRow(contactKey(c), () => ({
      key: contactKey(c),
      name: c.name || "—",
      email: email || "—",
      roles: [],
      areas: [],
      phone: c.phone || "—",
      statusLabel: c.is_primary ? I18N.primary[lang] : I18N.contact[lang],
      statusTone: c.is_primary ? "warn" : "muted",
      isPrimary: c.is_primary,
      lastLogin: "—",
      language: "—",
      conflicts: [],
    }));

    uniquePush(row.roles, c.role_title);
    uniquePush(row.areas, areaLabel);
    mergeDisplayValue(row, "name", c.name, "Navn");
    mergeDisplayValue(row, "email", email, "E-mail");
    mergeDisplayValue(row, "phone", c.phone, "Telefon");
    if (c.is_primary) row.isPrimary = true;
  }

  return rows;
}

export default function RegisteredUsersTable({ portalUsers, contacts, language = "da" }: Props) {
  const lang = tableLanguage(language);
  const rows = buildRegisteredUserRows(portalUsers, contacts, lang);

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
                <div className="space-y-0.5 text-slate-700">
                  {r.roles.length > 0 ? r.roles.map((role) => <div key={role}>{role}</div>) : "—"}
                </div>
                {r.areas.length > 0 && (
                  <div className="mt-1 space-y-0.5 text-xs text-slate-400">
                    {r.areas.map((area) => <div key={area}>{area}</div>)}
                  </div>
                )}
                {r.conflicts.length > 0 && (
                  <div className="mt-1 text-xs text-amber-700">
                    Datakonflikt: {r.conflicts.join(", ")}
                  </div>
                )}
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
