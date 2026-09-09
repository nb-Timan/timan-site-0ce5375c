import type { CrmDemoLead, CrmLead, CrmLeadPatch, CrmLeadsPageQueryResult, ListLeadsPageOpts, NewCrmDemoLead, NewCrmLead } from '@/lib/crmLeadsService';
import type { CrmLeadShare, LeadShareTarget } from '@/lib/crmLeadSharingService';

export type AcademyLeadId = string;
export type AcademyLead = { id: AcademyLeadId; title: string; nextFollowup: string; activity: string; incomplete: boolean; fromConfigurator: boolean; shared: boolean; convertedToDemo: boolean; saved: boolean };
type State = { leads: AcademyLead[]; part1Started: boolean; part2Started: boolean; dialogOpened: boolean; selectedPartnerId: string | null; demoCreated: boolean };
const KEY = 'timan.academy.crm-leads.v1';
const future = () => new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
const past = () => new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const initial = (): State => ({
  part1Started: false, part2Started: false, dialogOpened: false, selectedPartnerId: null, demoCreated: false,
  leads: [
    { id: 'academy-overdue-lead', title: 'Academy Kommune - opfølgning', nextFollowup: past(), activity: 'Kontakt kunden', incomplete: false, fromConfigurator: false, shared: false, convertedToDemo: false, saved: false },
    { id: 'academy-configurator-lead', title: 'Academy Parkdrift - tilbud fra Configurator', nextFollowup: future(), activity: '', incomplete: true, fromConfigurator: true, shared: false, convertedToDemo: false, saved: false },
    { id: 'academy-demo-lead', title: 'Academy Ejendomsservice - demonstration', nextFollowup: future(), activity: 'Kontakt kunden', incomplete: false, fromConfigurator: false, shared: false, convertedToDemo: false, saved: false },
  ],
});
const read = (): State => { try { const raw = localStorage.getItem(KEY); return raw ? { ...initial(), ...JSON.parse(raw) } : initial(); } catch { return initial(); } };
const write = (state: State) => { localStorage.setItem(KEY, JSON.stringify(state)); return state; };
const isFuture = (value: string) => new Date(`${value}T00:00:00`).getTime() > new Date(new Date().toDateString()).getTime();
export const academyCrmSandbox = {
  isActive: () => import.meta.env.DEV && new URLSearchParams(window.location.search).get('academy_mode') === 'true',
  getState: read,
  start(part: 1 | 2) { const current = read(); if (part === 2 && !this.getProgress().part1Completed) throw new Error('Lead Part 1 skal gennemføres først.'); return write({ ...current, part1Started: part === 1 || current.part1Started, part2Started: part === 2 || current.part2Started }); },
  saveLead(id: AcademyLeadId, patch: Partial<Pick<AcademyLead, 'nextFollowup' | 'activity' | 'incomplete'>>) {
    if (!this.isActive()) throw new Error('Academy CRM writes must never use production persistence.');
    const current = read(); const leads = current.leads.map((lead) => lead.id === id ? { ...lead, ...patch, saved: true } : lead);
    return write({ ...current, leads });
  },
  openShareDialog() { if (!this.isActive()) throw new Error('Academy CRM writes must never use production persistence.'); return write({ ...read(), dialogOpened: true }); },
  shareLead(id: AcademyLeadId, partnerId: string) { if (!this.isActive()) throw new Error('Academy CRM writes must never use production persistence.'); const current = read(); return write({ ...current, selectedPartnerId: partnerId, leads: current.leads.map((lead) => lead.id === id ? { ...lead, shared: true } : lead) }); },
  convertToDemo(id: AcademyLeadId) { if (!this.isActive()) throw new Error('Academy CRM writes must never use production persistence.'); const current = read(); return write({ ...current, demoCreated: true, leads: current.leads.map((lead) => lead.id === id ? { ...lead, convertedToDemo: true, saved: true } : lead) }); },
  getAcademyActor(): LeadShareTarget { return { id: 'academy-local-sales-user', name: 'Academy Sales', email: 'academy.sales@localhost', dealer_number: null, role: 'timan_seller' }; },
  getAcademyPartner(): LeadShareTarget { return { id: ACADEMY_CRM_PARTNER.id, name: ACADEMY_CRM_PARTNER.name, email: 'academy.partner@example.test', dealer_number: 'ACADEMY-01', role: 'dealer_user' }; },
  getCrmLead(id: string): CrmLead | null {
    const lead = read().leads.find((item) => item.id === id);
    if (!lead) return null;
    const now = new Date().toISOString();
    return { id: lead.id, lead_no: lead.id === 'academy-overdue-lead' ? 9101 : lead.id === 'academy-configurator-lead' ? 9102 : 9103, title: lead.title, owner_user_id: 'academy-local-sales-user', owner_name: 'Academy Sales', owner_email: 'academy.sales@localhost', linked_dealer_id: ACADEMY_CRM_PARTNER.id, first_contact_date: '2026-09-01', expected_close_date: '2026-11-01', next_followup_date: lead.nextFollowup, machine_types: ['RC-1000'], next_activity: lead.activity, demo_has_run: 'no', contact_type: 'Phone', customer_type: 'Municipality', contact_information: 'Firma/CVR: Academy Kunde\nKontaktperson: Academy Kontakt\nAdresse: Academyvej 1\nPostnr. og by: 9000 Aalborg\nTelefon: +45 70 00 00 00\nE-mail: academy@example.test\nLand: Danmark', trade_fair: null, country: 'Danmark', notes: 'Lokal Academy-træningsdata.', estimated_value: 100000, probability: 25, pipeline_stage: 'Lead', lost_competitor: null, lost_reason: null, lost_comment: null, attachments: [], status: 'open', move_to_working_qty: 0, incomplete_from_configurator: lead.incomplete, created_at: now, updated_at: now };
  },
  listLeadsPage(options: ListLeadsPageOpts): CrmLeadsPageQueryResult {
    const part = new URLSearchParams(window.location.search).get('academy_part') === '2' ? 2 : 1;
    const all = read().leads.filter((lead) => part === 2 ? lead.id === 'academy-demo-lead' : lead.id !== 'academy-demo-lead');
    const q = (options.search || '').trim().toLowerCase();
    const leads = q ? all.filter((lead) => lead.title.toLowerCase().includes(q)) : all;
    const rows = leads.map((lead) => ({ id: lead.id, display_no: `L-${lead.id === 'academy-overdue-lead' ? 9101 : lead.id === 'academy-configurator-lead' ? 9102 : 9103}`, type: 'open' as const, title: lead.title, customer: 'Academy Kunde', dealer: ACADEMY_CRM_PARTNER.name, owner_user_id: 'academy-local-sales-user', owner_name: 'Academy Sales', owner_email: 'academy.sales@localhost', responsible_name: 'Academy Sales', machine: 'RC-1000', equipment: null, date: '2026-09-01', next_followup: lead.nextFollowup, status: 'Åben', probability: 25, value: 100000, detail_href: `/academy/crm/leads/${lead.id}?academy_mode=true&academy_part=${part}`, attachments: [], incomplete: lead.incomplete, shared: lead.shared }));
    const today = new Date().toISOString().slice(0, 10);
    return { rows, counts: { all: rows.length, open: rows.length, won: 0, closed: 0 }, followup_counts: { overdue: rows.filter((row) => !!row.next_followup && row.next_followup < today).length, soon: 0, later: rows.filter((row) => !!row.next_followup && row.next_followup >= today).length }, unassigned_count: 0, total_count: rows.length, total_value: rows.reduce((sum, row) => sum + (row.value || 0), 0), page_limit: options.limit || 50, page_offset: 0, options: { types: ['open'], machines: ['RC-1000'], equipment: [], statuses: [{ value: 'Åben::25', status: 'Åben', probability: 25 }] } };
  },
  updateCrmLead(id: string, patch: CrmLeadPatch): CrmLead {
    const existing = read().leads.find((lead) => lead.id === id);
    if (!existing) throw new Error('Academy lead was not found.');
    this.saveLead(existing.id, { nextFollowup: patch.next_followup_date ?? existing.nextFollowup, activity: patch.next_activity ?? existing.activity, incomplete: patch.incomplete_from_configurator === undefined ? existing.incomplete : patch.incomplete_from_configurator });
    return this.getCrmLead(id)!;
  },
  createCrmLead(input: NewCrmLead): CrmLead {
    if (!this.isActive()) throw new Error('Academy CRM writes must never use production persistence.');
    const id = `academy-created-${Date.now()}`;
    const current = read();
    write({
      ...current,
      leads: [...current.leads, {
        id,
        title: input.title || 'Academy lead',
        nextFollowup: input.next_followup_date || future(),
        activity: input.next_activity || '',
        incomplete: Boolean(input.incomplete_from_configurator),
        fromConfigurator: false,
        shared: false,
        convertedToDemo: false,
        saved: true,
      }],
    });
    return this.getCrmLead(id)!;
  },
  createCrmDemoLead(input: NewCrmDemoLead): CrmDemoLead {
    const sourceId = input.source_lead_id as AcademyLeadId | undefined;
    if (sourceId) this.convertToDemo(sourceId);
    const now = new Date().toISOString();
    return { ...input, id: 'academy-demo-created', demo_no: 9901, created_at: now, source: 'user' };
  },
  listShares(leadId: string): CrmLeadShare[] {
    const state = read(); const lead = state.leads.find((item) => item.id === leadId);
    if (!lead?.shared) return [];
    const actor = this.getAcademyActor(); const partner = this.getAcademyPartner();
    return [{ id: `academy-share-${leadId}`, lead_id: leadId, shared_by_user_id: actor.id, shared_by_name: actor.name, shared_by_email: actor.email, shared_with_user_id: partner.id, shared_with_name: partner.name, shared_with_email: partner.email, shared_with_dealer_account_id: partner.id, direction: 'timan_to_dealer', channel: 'portal', note: 'Academy local share', created_at: new Date().toISOString(), revoked_at: null }];
  },
  shareCrmLead(input: { leadId: string }): CrmLeadShare {
    this.shareLead(input.leadId as AcademyLeadId, ACADEMY_CRM_PARTNER.id);
    return this.listShares(input.leadId)[0]!;
  },
  getProgress() { const state = read(); const overdue = state.leads.find((lead) => lead.id === 'academy-overdue-lead')!; const configurator = state.leads.find((lead) => lead.id === 'academy-configurator-lead')!; const demo = state.leads.find((lead) => lead.id === 'academy-demo-lead')!; const part1Completed = overdue.saved && isFuture(overdue.nextFollowup) && configurator.saved && !configurator.incomplete; const part2Completed = part1Completed && demo.saved && !!demo.activity.trim() && demo.shared && demo.convertedToDemo && state.demoCreated; return { overdueUpdated: overdue.saved && isFuture(overdue.nextFollowup), configuratorCompleted: configurator.saved && !configurator.incomplete, activityUpdated: demo.saved && !!demo.activity.trim(), dialogOpened: state.dialogOpened, shared: demo.shared && !!state.selectedPartnerId, demoConverted: demo.convertedToDemo && state.demoCreated, part1Completed, part2Completed }; },
  assertNoProductionWrite() { if (this.isActive()) throw new Error('Blocked: Academy CRM cannot write to Supabase.'); },
};
export const ACADEMY_CRM_PARTNER = { id: 'academy-service-partner', name: 'Academy Servicepartner ApS' };
