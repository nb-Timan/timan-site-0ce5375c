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

const AREA_LABEL: Record<string, string> = {
  sales: "Salg",
  workshop: "Værksted",
  parts: "Reservedele",
  marketing: "Marketing",
  finance: "Økonomi",
};

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("da-DK"); } catch { return "—"; }
}

function userStatus(u: PortalUserLike): { label: string; tone: Row["statusTone"] } {
  const s = (u.status || "").toLowerCase();
  if (s === "active" || (u.approved !== false && u.is_active !== false && !s))
    return { label: "Aktiv", tone: "ok" };
  if (s === "pending" || u.approved === false) return { label: "Afventer", tone: "warn" };
  if (s === "blocked" || u.is_active === false) return { label: "Spærret", tone: "no" };
  return { label: s || "—", tone: "muted" };
}

export default function RegisteredUsersTable({ portalUsers, contacts }: Props) {
  const rows: Row[] = [];
  const emailIndex = new Map<string, number>();

  for (const u of portalUsers) {
    const email = (u.email || "").trim();
    const lower = email.toLowerCase();
    const st = userStatus(u);
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
      lastLogin: fmtDate(u.last_login ?? u.last_login_at ?? null),
      language: (u.preferred_language || u.language || "").toUpperCase() || "—",
    };
    rows.push(r);
    if (lower) emailIndex.set(lower, rows.length - 1);
  }

  for (const c of contacts) {
    const email = (c.email || "").trim();
    const lower = email.toLowerCase();
    if (lower && emailIndex.has(lower)) {
      // Merge into existing portal-user row
      const idx = emailIndex.get(lower)!;
      const r = rows[idx];
      if (r.phone === "—" && c.phone) r.phone = c.phone;
      if (!r.area && c.contact_area) r.area = AREA_LABEL[c.contact_area] ?? c.contact_area;
      if (c.is_primary) r.isPrimary = true;
      if (r.name === "—" && c.name) r.name = c.name;
      continue;
    }
    const r: Row = {
      key: `c:${c.id}`,
      name: c.name || "—",
      email: email || "—",
      role: c.role_title || "—",
      area: AREA_LABEL[c.contact_area] ?? c.contact_area,
      phone: c.phone || "—",
      statusLabel: c.is_primary ? "Primær kontakt" : "Kontaktperson",
      statusTone: c.is_primary ? "warn" : "muted",
      isPrimary: c.is_primary,
      lastLogin: "—",
      language: "—",
    };
    rows.push(r);
    if (lower) emailIndex.set(lower, rows.length - 1);
  }

  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">Ingen brugere eller kontaktpersoner registreret.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-slate-500 border-b">
          <tr>
            <th className="py-2 pr-4">Kontaktperson</th>
            <th className="py-2 pr-4">E-mail</th>
            <th className="py-2 pr-4">Rolle / område</th>
            <th className="py-2 pr-4">Telefon</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4 whitespace-nowrap">Sidste login</th>
            <th className="py-2 pr-4">Sprog</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b last:border-0 align-top">
              <td className="py-2 pr-4 font-medium text-slate-900">
                {r.name}
                {r.isPrimary && (
                  <Badge className="ml-2 bg-amber-100 text-amber-800 hover:bg-amber-100">Primær</Badge>
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
