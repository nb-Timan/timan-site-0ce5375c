// Phase 50 — "Forhandlerdata" external module.
// Reuses dealer_accounts, app_users, configurations and portal_form_submissions.
// External roles see ONLY their own dealer record (RLS enforced server-side).
// V1: own-account only — importer/service-partner → sub-dealer relations deferred.

import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, Hash, User, FileText, Package, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import {
  fetchDealerAccountByNumber,
  type DealerAccount,
} from '@/lib/dealerAccountsService';
import {
  listCrmConfigurations,
  type CrmConfigurationRow,
} from '@/lib/crmConfigurationsService';
import {
  listPortalFormSubmissions,
  type PortalFormSubmission,
} from '@/lib/portalFormsService';
import { derivePortalRole } from '@/lib/portalAccess';
import { supabase } from '@/lib/supabase';
import DealerProfileEditor from '@/components/portal/DealerProfileEditor';

interface DealerUserRow {
  id: string;
  email: string;
  full_name: string | null;
  role: string | null;
  portal_role: string | null;
  status: string | null;
  approved: boolean | null;
  is_active: boolean | null;
  last_login: string | null;
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('da-DK'); } catch { return '—'; }
}
function fmtDateTime(s: string | null | undefined): string {
  if (!s) return '—';
  try { return new Date(s).toLocaleString('da-DK'); } catch { return '—'; }
}
function fmtMoney(n: number | null | undefined): string {
  if (n == null) return '—';
  try { return new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK', maximumFractionDigits: 0 }).format(n); }
  catch { return String(n); }
}

// Phase 52 — full profile editing has moved to DealerProfileEditor.

export default function DealerDataPage() {
  const { appUser, loading, setAppUser, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();

  const [dealer, setDealer] = useState<DealerAccount | null>(null);
  const [users, setUsers] = useState<DealerUserRow[]>([]);
  const [submissions, setSubmissions] = useState<PortalFormSubmission[]>([]);
  const [quotes, setQuotes] = useState<CrmConfigurationRow[]>([]);
  const [orders, setOrders] = useState<CrmConfigurationRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditableState>(toEditable(null));
  const [saving, setSaving] = useState(false);

  const portalRole = useMemo(() => derivePortalRole(appUser), [appUser]);
  const dealerNumber = appUser?.dealer_number ?? null;

  useEffect(() => {
    let cancelled = false;
    if (!dealerNumber) { setLoadingData(false); return; }

    (async () => {
      setLoadingData(true);
      setError(null);
      try {
        const [dealerRes, configsQuoteRes, configsOrderRes, subsRes, usersRes] = await Promise.all([
          fetchDealerAccountByNumber(dealerNumber),
          listCrmConfigurations({
            role: portalRole,
            sellerId: null,
            dealerNumber,
            documentType: 'quote',
          }),
          listCrmConfigurations({
            role: portalRole,
            sellerId: null,
            dealerNumber,
            documentType: 'order',
          }),
          listPortalFormSubmissions({ formType: 'dealer_invoice_accept', limit: 100 }),
          supabase
            .from('app_users')
            .select('id, email, full_name, role, portal_role, status, approved, is_active, last_login')
            .eq('dealer_number', dealerNumber)
            .order('email', { ascending: true }),
        ]);
        if (cancelled) return;

        if (dealerRes.error) setError(dealerRes.error);
        setDealer(dealerRes.row);
        setEdit(toEditable(dealerRes.row));

        setQuotes(configsQuoteRes.rows);
        setOrders(configsOrderRes.rows);

        // listPortalFormSubmissions returns globally readable rows by RLS;
        // narrow to this dealer in the client.
        setSubmissions(
          (subsRes ?? []).filter((s) => s.dealer_account_number === dealerNumber),
        );

        const u = (usersRes.data ?? []) as DealerUserRow[];
        setUsers(u);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    })();

    return () => { cancelled = true; };
  }, [dealerNumber, portalRole]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-sm text-gray-500">…</div></div>;
  }
  if (!appUser) return <Navigate to="/portal" replace />;
  // Only true end-customers (no portal role) get bounced to the configurator.
  // Dealer-side users may still have legacy role='slutkunde' but a real portal_role.
  if (appUser.role === 'slutkunde' && !portalRole) return <Navigate to="/configurator" replace />;

  const onSave = async () => {
    if (!dealer) return;
    setSaving(true);
    try {
      const patch: Record<string, string | null> = {};
      for (const k of EDITABLE_FIELDS) {
        const v = edit[k].trim();
        patch[k] = v === '' ? null : v;
      }
      const res = await updateDealerAccount(dealer.id, patch);
      if (!res.ok) {
        toast({ title: 'Kunne ikke gemme', description: res.error || 'Ukendt fejl', variant: 'destructive' });
      } else {
        toast({ title: 'Gemt', description: 'Kontaktinformation opdateret.' });
        if (res.row) {
          setDealer(res.row);
          setEdit(toEditable(res.row));
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const dealerName = dealer?.company_name || appUser.company_dealer || '—';

  // Status label for dealer_invoice_accept submissions
  const acceptLabel = (payload: Record<string, unknown>): { label: string; tone: 'ok' | 'warn' | 'no' } => {
    const decision = String(payload?.decision ?? payload?.beslutning ?? '').toLowerCase();
    if (decision.includes('accept') || decision === 'accepteret' || decision === 'ja') return { label: 'Accepteret', tone: 'ok' };
    if (decision.includes('afvis') || decision === 'nej')                                 return { label: 'Afvist', tone: 'no' };
    if (decision.includes('ikke') || decision.includes('samarbejd'))                      return { label: 'Ønsker ikke samarbejde', tone: 'warn' };
    return { label: decision || 'Ukendt', tone: 'warn' };
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader
        user={appUser}
        language={lang}
        onLanguageChange={setLanguage}
        onLogout={async () => { await logout(); navigate('/portal', { replace: true }); }}
      />

      <main className="max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-grow space-y-6">
        <div>
          <Link to="/portal" className="inline-flex items-center text-sm text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4 mr-1" /> Tilbage til portal
          </Link>
        </div>

        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
            <Building2 className="h-7 w-7 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Forhandlerdata</h1>
            <p className="text-sm text-slate-600">Din virksomheds stamdata, kontakter, brugere og handelshistorik hos Timan.</p>
          </div>
        </div>

        {!dealerNumber && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-slate-600">
              Din bruger er ikke knyttet til en forhandlerkonto endnu. Kontakt Timan for at få adgang til Forhandlerdata.
            </CardContent>
          </Card>
        )}

        {dealerNumber && loadingData && (
          <Card><CardContent className="py-8 text-center text-sm text-slate-500">Indlæser…</CardContent></Card>
        )}

        {dealerNumber && !loadingData && error && !dealer && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-rose-600 flex items-center justify-center gap-2">
              <AlertCircle className="h-4 w-4" /> {error}
            </CardContent>
          </Card>
        )}

        {dealer && (
          <>
            {/* 1) Stamdata (read-only) */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Hash className="h-5 w-5 text-slate-500" /> Stamdata
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <Field label="Firmanavn" value={dealerName} />
                <Field label="Kontonummer" value={dealer.account_number || '—'} />
                <Field label="Forhandlertype" value={dealer.customer_type_label || dealer.customer_type || '—'} />
                <Field label="Land" value={dealer.country || '—'} />
                <Field label="Tilknyttet Timan-sælger" value={dealer.assigned_seller_name || dealer.assigned_seller_initials || '—'} />
                <Field label="Status" value={dealer.is_blocked ? 'Spærret' : dealer.is_deleted ? 'Slettet' : 'Aktiv'} />
              </CardContent>
            </Card>

            {/* 2) Kontaktinformation (editable) */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-slate-500" /> Kontaktinformation
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-slate-500">Du kan rette adresse, e-mail, telefon, CVR/VAT og primær kontaktperson. Andre felter administreres af Timan.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <EditField id="address"  label="Adresse"      value={edit.address}     onChange={(v) => setEdit({ ...edit, address: v })} icon={<MapPin className="h-4 w-4" />} />
                  <div className="grid grid-cols-2 gap-3">
                    <EditField id="postal_code" label="Postnr."   value={edit.postal_code} onChange={(v) => setEdit({ ...edit, postal_code: v })} />
                    <EditField id="city"        label="By"        value={edit.city}        onChange={(v) => setEdit({ ...edit, city: v })} />
                  </div>
                  <EditField id="email"    label="E-mail"       value={edit.email}       onChange={(v) => setEdit({ ...edit, email: v })} type="email" icon={<Mail className="h-4 w-4" />} />
                  <EditField id="phone"    label="Telefon"      value={edit.phone}       onChange={(v) => setEdit({ ...edit, phone: v })} icon={<Phone className="h-4 w-4" />} />
                  <EditField id="vat_number" label="CVR / VAT"  value={edit.vat_number}  onChange={(v) => setEdit({ ...edit, vat_number: v })} />
                </div>

                <div className="pt-2">
                  <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2"><User className="h-4 w-4" /> Primær kontaktperson</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <EditField id="primary_contact_name"  label="Navn"    value={edit.primary_contact_name}  onChange={(v) => setEdit({ ...edit, primary_contact_name: v })} />
                    <EditField id="primary_contact_email" label="E-mail"  value={edit.primary_contact_email} onChange={(v) => setEdit({ ...edit, primary_contact_email: v })} type="email" />
                    <EditField id="primary_contact_phone" label="Telefon" value={edit.primary_contact_phone} onChange={(v) => setEdit({ ...edit, primary_contact_phone: v })} />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button onClick={onSave} disabled={saving}>
                    <Save className="h-4 w-4 mr-2" /> {saving ? 'Gemmer…' : 'Gem ændringer'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* 3) Tilknyttede brugere */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="h-5 w-5 text-slate-500" /> Tilknyttede brugere
                  <Badge variant="secondary" className="ml-1">{users.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {users.length === 0 ? (
                  <p className="text-sm text-slate-500">Ingen brugere fundet på denne konto.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs uppercase text-slate-500 border-b">
                        <tr>
                          <th className="py-2 pr-4">Navn</th>
                          <th className="py-2 pr-4">E-mail</th>
                          <th className="py-2 pr-4">Rolle</th>
                          <th className="py-2 pr-4">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((u) => {
                          const status = u.status || (u.approved === false ? 'pending' : u.is_active === false ? 'blocked' : 'active');
                          return (
                            <tr key={u.id} className="border-b last:border-0">
                              <td className="py-2 pr-4">{u.full_name || '—'}</td>
                              <td className="py-2 pr-4">{u.email}</td>
                              <td className="py-2 pr-4">{u.portal_role || u.role || '—'}</td>
                              <td className="py-2 pr-4">
                                <Badge
                                  variant={status === 'active' ? 'default' : status === 'pending' ? 'secondary' : 'destructive'}
                                >
                                  {status}
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 4) Forhandler accept / Fakturering */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5 text-slate-500" /> Forhandler accept / Fakturering
                  <Badge variant="secondary" className="ml-1">{submissions.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {submissions.length === 0 ? (
                  <p className="text-sm text-slate-500">Ingen indsendelser fundet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs uppercase text-slate-500 border-b">
                        <tr>
                          <th className="py-2 pr-4">Dato</th>
                          <th className="py-2 pr-4">Firma/kunde</th>
                          <th className="py-2 pr-4">CVR</th>
                          <th className="py-2 pr-4">Beslutning</th>
                          <th className="py-2 pr-4">Kommentar</th>
                          <th className="py-2 pr-4">Indsendt af</th>
                        </tr>
                      </thead>
                      <tbody>
                        {submissions.map((s) => {
                          const p = (s.payload || {}) as Record<string, unknown>;
                          const company = (p.company_name ?? p.firma ?? p.customer_name ?? p.customer ?? '—') as string;
                          const cvr = (p.cvr ?? p.vat ?? p.vat_number ?? '—') as string;
                          const comment = (p.comment ?? p.note ?? p.kommentar ?? '') as string;
                          const a = acceptLabel(p);
                          return (
                            <tr key={s.id} className="border-b last:border-0 align-top">
                              <td className="py-2 pr-4 whitespace-nowrap">{fmtDateTime(s.created_at)}</td>
                              <td className="py-2 pr-4">{String(company)}</td>
                              <td className="py-2 pr-4">{String(cvr)}</td>
                              <td className="py-2 pr-4">
                                {a.tone === 'ok' && <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100"><CheckCircle2 className="h-3 w-3 mr-1" />{a.label}</Badge>}
                                {a.tone === 'no' && <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />{a.label}</Badge>}
                                {a.tone === 'warn' && <Badge variant="secondary">{a.label}</Badge>}
                              </td>
                              <td className="py-2 pr-4 max-w-[260px]">{String(comment) || '—'}</td>
                              <td className="py-2 pr-4">{s.submitted_by_email || '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 5) Åbne tilbud */}
            <DocsTable
              title="Åbne tilbud"
              icon={<FileText className="h-5 w-5 text-slate-500" />}
              rows={quotes}
              numberKey="quote_number"
              showStatus
            />

            {/* 6) Lukkede / vundne ordrer */}
            <DocsTable
              title="Ordrer"
              icon={<Package className="h-5 w-5 text-slate-500" />}
              rows={orders}
              numberKey="order_number"
              showStatus
            />
          </>
        )}
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}

// ---------- helpers ----------

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-sm text-slate-900 font-medium">{value}</div>
    </div>
  );
}

function EditField({
  id, label, value, onChange, type = 'text', icon,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-xs uppercase tracking-wide text-slate-500 mb-1 flex items-center gap-1">
        {icon}{label}
      </Label>
      <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function DocsTable({
  title, icon, rows, numberKey, showStatus,
}: {
  title: string;
  icon: React.ReactNode;
  rows: CrmConfigurationRow[];
  numberKey: 'quote_number' | 'order_number';
  showStatus?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          {icon} {title}
          <Badge variant="secondary" className="ml-1">{rows.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">Ingen poster.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500 border-b">
                <tr>
                  <th className="py-2 pr-4">Nr.</th>
                  <th className="py-2 pr-4">Titel</th>
                  <th className="py-2 pr-4">Oprettet</th>
                  {showStatus && <th className="py-2 pr-4">Status</th>}
                  <th className="py-2 pr-4 text-right">Beløb</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 whitespace-nowrap">{r[numberKey] || '—'}</td>
                    <td className="py-2 pr-4">{r.title || '—'}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                    {showStatus && <td className="py-2 pr-4">{r.case_status || r.status || '—'}</td>}
                    <td className="py-2 pr-4 text-right">{fmtMoney(r.total_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
