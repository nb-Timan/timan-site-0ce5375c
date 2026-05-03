/**
 * CalendarActivityModal — create / edit a planned dealer activity.
 *
 * Dealer picker is a searchable combobox sourced from dealer_accounts:
 *   - "Mine forhandlere" first (assigned to the current/active seller)
 *   - "Andre forhandlere" below (all other dealers, searchable)
 * Selecting a dealer NEVER reassigns ownership — only a snapshot of
 * account_number + assigned-seller is stored on the activity.
 *
 * Outlook sync is reserved (checkbox is disabled).
 */
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Trash2, ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ACTIVITY_TYPES,
  createActivity,
  updateActivity,
  deleteActivity,
  type CalendarActivity,
  type CalendarActivityType,
} from "@/lib/crmCalendarService";
import type { CrmAccount } from "@/lib/crmAccountsService";
import { BUDGET_SELLERS, type BudgetSellerRef } from "@/lib/crmBudgetService";
import { fetchDealerAccounts, type DealerAccount } from "@/lib/dealerAccountsService";
import type { Language } from "@/types/configurator";

const T: Record<string, Record<Language, string>> = {
  new_title:        { da: "Ny aktivitet",         en: "New activity",      de: "Neue Aktivität",   it: "Nuova attività",    hu: "Új tevékenység" },
  edit_title:       { da: "Rediger aktivitet",    en: "Edit activity",     de: "Aktivität bearbeiten", it: "Modifica attività", hu: "Tevékenység szerkesztése" },
  title_lbl:        { da: "Titel",                en: "Title",             de: "Titel",            it: "Titolo",            hu: "Cím" },
  account_lbl:      { da: "Forhandler",           en: "Dealer",            de: "Händler",          it: "Rivenditore",       hu: "Kereskedő" },
  account_none:     { da: "Ingen forhandler",     en: "No dealer",         de: "Kein Händler",     it: "Nessun rivenditore", hu: "Nincs kereskedő" },
  account_search:   { da: "Søg forhandler, nr., by, land…", en: "Search dealer, no., city, country…", de: "Händler suchen…", it: "Cerca rivenditore…", hu: "Kereskedő keresése…" },
  account_mine:     { da: "Mine forhandlere",     en: "My dealers",        de: "Meine Händler",    it: "I miei rivenditori",hu: "Saját kereskedők" },
  account_others:   { da: "Andre forhandlere",    en: "Other dealers",     de: "Andere Händler",   it: "Altri rivenditori", hu: "Más kereskedők" },
  account_loading:  { da: "Henter forhandlere…",  en: "Loading dealers…",  de: "Lade…",            it: "Caricamento…",      hu: "Betöltés…" },
  account_empty:    { da: "Ingen match",          en: "No match",          de: "Keine Treffer",    it: "Nessun risultato",  hu: "Nincs találat" },
  type_lbl:         { da: "Type",                 en: "Type",              de: "Typ",              it: "Tipo",              hu: "Típus" },
  start_lbl:        { da: "Start",                en: "Start",             de: "Start",            it: "Inizio",            hu: "Kezdés" },
  end_lbl:          { da: "Slut",                 en: "End",               de: "Ende",             it: "Fine",              hu: "Vége" },
  seller_lbl:       { da: "Sælger",               en: "Seller",            de: "Verkäufer",        it: "Venditore",         hu: "Értékesítő" },
  note_lbl:         { da: "Note",                 en: "Note",              de: "Notiz",            it: "Nota",              hu: "Jegyzet" },
  outlook_lbl:      { da: "Synkroniser til Outlook", en: "Sync to Outlook", de: "Mit Outlook synchronisieren", it: "Sincronizza con Outlook", hu: "Szinkron Outlookkal" },
  outlook_status:   { da: "Outlook status: Ikke aktiveret endnu", en: "Outlook status: Not enabled yet", de: "Outlook-Status: Noch nicht aktiviert", it: "Stato Outlook: Non ancora attivo", hu: "Outlook állapot: Még nincs aktiválva" },
  status_lbl:       { da: "Status",               en: "Status",            de: "Status",           it: "Stato",             hu: "Állapot" },
  status_planned:   { da: "Planlagt",             en: "Planned",           de: "Geplant",          it: "Pianificato",       hu: "Tervezett" },
  status_done:      { da: "Færdig",               en: "Done",              de: "Erledigt",         it: "Fatto",             hu: "Kész" },
  status_canceled:  { da: "Annulleret",           en: "Canceled",          de: "Abgesagt",         it: "Annullato",         hu: "Lemondva" },
  save:             { da: "Gem",                  en: "Save",              de: "Speichern",        it: "Salva",             hu: "Mentés" },
  cancel:           { da: "Annuller",             en: "Cancel",            de: "Abbrechen",        it: "Annulla",           hu: "Mégse" },
  delete:           { da: "Slet",                 en: "Delete",            de: "Löschen",          it: "Elimina",           hu: "Törlés" },
  required:         { da: "Titel og start kræves",en: "Title and start required", de: "Titel und Start erforderlich", it: "Titolo e inizio richiesti", hu: "Cím és kezdés kötelező" },
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lang: Language;
  isAdmin: boolean;
  currentSeller: BudgetSellerRef | null;
  accounts: CrmAccount[];
  initial: Partial<CalendarActivity> | null; // null = new; with id = edit
  defaultDateIso?: string | null;
  defaultAccountId?: string | null;
  onSaved: () => void;
}

interface DealerOption {
  /** Composite value: "dealer:<account_number>" or "crm:<crmAccount.id>" or "none" */
  value: string;
  label: string;          // "Axima AB · 10239 · BP"
  searchKey: string;      // lowercased company + nr + city + country
  isMine: boolean;
  // Snapshot fields stored on the activity
  account_number: string | null;
  company_name: string | null;
  assigned_seller_initials: string | null;
  assigned_seller_email: string | null;
  /** crm_accounts.id when the option came from the CRM accounts list (legacy). */
  account_id: string | null;
}

function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInputValue(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function dealerToOption(d: DealerAccount, mine: boolean): DealerOption {
  const initials = d.assigned_seller_initials || "—";
  const label = `${d.company_name} · ${d.account_number}${initials !== "—" ? ` · ${initials}` : ""}`;
  return {
    value: `dealer:${d.account_number}`,
    label,
    searchKey: [d.company_name, d.account_number, d.city, d.country].filter(Boolean).join(" ").toLowerCase(),
    isMine: mine,
    account_number: d.account_number,
    company_name: d.company_name,
    assigned_seller_initials: d.assigned_seller_initials,
    assigned_seller_email: d.assigned_seller_email,
    account_id: null,
  };
}

function crmAccountToOption(a: CrmAccount, mine: boolean): DealerOption {
  const company = a.company || a.full_name || a.email;
  const initials = a.account_owner_initials || "";
  const label = `${company}${a.dealer_number ? ` · ${a.dealer_number}` : ""}${initials ? ` · ${initials}` : ""}`;
  return {
    value: `crm:${a.id}`,
    label,
    searchKey: [company, a.dealer_number, a.country].filter(Boolean).join(" ").toLowerCase(),
    isMine: mine,
    account_number: a.dealer_number || null,
    company_name: company,
    assigned_seller_initials: a.account_owner_initials || null,
    assigned_seller_email: a.account_owner_email || null,
    account_id: a.id,
  };
}

export default function CalendarActivityModal(props: Props) {
  const { open, onOpenChange, lang, isAdmin, currentSeller, accounts, initial, defaultDateIso, defaultAccountId, onSaved } = props;
  const isEdit = !!initial?.id;

  const [title, setTitle] = useState("");
  const [selectedValue, setSelectedValue] = useState<string>("none");
  const [type, setType] = useState<CalendarActivityType>("demo");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [sellerInitials, setSellerInitials] = useState<string>(currentSeller?.initials || "");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<CalendarActivity["status"]>("planned");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [dealers, setDealers] = useState<DealerAccount[]>([]);
  const [dealersLoading, setDealersLoading] = useState(false);

  // Load all dealer_accounts when the modal opens (for cross-seller search).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setDealersLoading(true);
    fetchDealerAccounts({ includeDeleted: false })
      .then((res) => { if (!cancelled) setDealers(res.rows); })
      .catch(() => { /* keep empty; CRM accounts still available as fallback */ })
      .finally(() => { if (!cancelled) setDealersLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setTitle(initial?.title || "");
    // Resolve initial dealer selection: prefer dealer_account_number, then account_id.
    const initAcct = initial?.dealer_account_number;
    const initCrmId = initial?.account_id || defaultAccountId || null;
    if (initAcct) setSelectedValue(`dealer:${initAcct}`);
    else if (initCrmId) setSelectedValue(`crm:${initCrmId}`);
    else setSelectedValue("none");
    setType((initial?.activity_type as CalendarActivityType) || "demo");
    setStart(toLocalInputValue(initial?.start_datetime || defaultDateIso || new Date().toISOString()));
    setEnd(toLocalInputValue(initial?.end_datetime ?? null));
    // Seller field: in seller mode (non-admin), always force to activeSellerContext.
    // In backend/admin mode, prefer the existing activity seller, otherwise activeSellerContext.
    if (!isAdmin) {
      if (!currentSeller?.initials) {
        // eslint-disable-next-line no-console
        console.warn("Missing activeSellerContext for activity modal");
      }
      setSellerInitials(currentSeller?.initials || initial?.seller_initials || "");
    } else {
      setSellerInitials(initial?.seller_initials || currentSeller?.initials || "");
    }
    setNote(initial?.note || "");
    setStatus((initial?.status as CalendarActivity["status"]) || "planned");
  }, [open, initial, defaultAccountId, defaultDateIso, currentSeller, isAdmin]);

  // Build dealer options grouped by "mine" / "others", with a CRM-accounts fallback
  // when dealer_accounts isn't accessible (e.g. seller without backend RLS).
  const { mineOptions, otherOptions, allOptions } = useMemo(() => {
    const mineInitials = (currentSeller?.initials || "").toUpperCase();
    const mineEmail = (currentSeller?.email || "").toLowerCase();

    const fromDealers: DealerOption[] = dealers.map((d) => {
      const di = (d.assigned_seller_initials || "").toUpperCase();
      const de = (d.assigned_seller_email || "").toLowerCase();
      const mine = (mineInitials !== "" && di === mineInitials)
                || (mineEmail !== "" && de === mineEmail);
      return dealerToOption(d, mine);
    });

    // Fallback: seed with CRM accounts that aren't already represented by an account_number match.
    const seenAcctNos = new Set(fromDealers.map((o) => o.account_number).filter(Boolean) as string[]);
    const fromCrm: DealerOption[] = accounts
      .filter((a) => !a.dealer_number || !seenAcctNos.has(a.dealer_number))
      .map((a) => {
        const owns = (a.account_owner_initials || "").toUpperCase() === mineInitials
                  || (a.account_owner_email || "").toLowerCase() === mineEmail;
        return crmAccountToOption(a, owns);
      });

    const all = [...fromDealers, ...fromCrm];
    const mine = all.filter((o) => o.isMine).sort((a, b) => a.label.localeCompare(b.label));
    const others = all.filter((o) => !o.isMine).sort((a, b) => a.label.localeCompare(b.label));
    return { mineOptions: mine, otherOptions: others, allOptions: all };
  }, [dealers, accounts, currentSeller]);

  const selectedOption = allOptions.find((o) => o.value === selectedValue) || null;
  const triggerLabel = selectedValue === "none" || !selectedOption
    ? T.account_none[lang]
    : selectedOption.label;

  async function handleSave() {
    const startIso = fromLocalInputValue(start);
    if (!title.trim() || !startIso) { setError(T.required[lang]); return; }
    setSaving(true);
    // In seller mode, ALWAYS use the active seller context (ignore form value).
    // In backend mode, use the manually selected seller.
    const effectiveInitials = isAdmin ? sellerInitials : (currentSeller?.initials || sellerInitials);
    const seller = BUDGET_SELLERS.find(s => s.initials === effectiveInitials)
      || (!isAdmin ? currentSeller : null)
      || currentSeller;
    const opt = selectedOption;
    const payload = {
      title: title.trim(),
      start_datetime: startIso,
      end_datetime: fromLocalInputValue(end),
      account_id: opt?.account_id ?? null,
      dealer_name: opt?.company_name ?? null,
      dealer_account_number: opt?.account_number ?? null,
      dealer_assigned_seller_initials: opt?.assigned_seller_initials ?? null,
      dealer_assigned_seller_email: opt?.assigned_seller_email ?? null,
      seller_user_id: null,
      seller_initials: seller?.initials ?? null,
      seller_name: seller?.full_name ?? null,
      activity_type: type,
      note: note.trim() || null,
      status,
      created_by_email: currentSeller?.email ?? null,
    };
    if (isEdit && initial?.id) {
      await updateActivity(initial.id, payload);
    } else {
      await createActivity(payload);
    }
    setSaving(false);
    onSaved();
    onOpenChange(false);
  }

  async function handleDelete() {
    if (!isEdit || !initial?.id) return;
    if (!confirm(T.delete[lang] + "?")) return;
    setSaving(true);
    await deleteActivity(initial.id);
    setSaving(false);
    onSaved();
    onOpenChange(false);
  }

  const canChooseSeller = isAdmin;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? T.edit_title[lang] : T.new_title[lang]}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-xs">{T.title_lbl[lang]}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="…" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{T.account_lbl[lang]}</Label>
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal h-10"
                  >
                    <span className="truncate text-left">{triggerLabel}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[320px]" align="start">
                  <Command
                    filter={(value, search) => {
                      const opt = allOptions.find((o) => o.value === value);
                      const hay = opt ? opt.searchKey : value.toLowerCase();
                      return hay.includes(search.toLowerCase()) ? 1 : 0;
                    }}
                  >
                    <CommandInput placeholder={T.account_search[lang]} />
                    <CommandList>
                      <CommandEmpty>{dealersLoading ? T.account_loading[lang] : T.account_empty[lang]}</CommandEmpty>

                      <CommandGroup>
                        <CommandItem
                          value="none"
                          onSelect={() => { setSelectedValue("none"); setPickerOpen(false); }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", selectedValue === "none" ? "opacity-100" : "opacity-0")} />
                          {T.account_none[lang]}
                        </CommandItem>
                      </CommandGroup>

                      {mineOptions.length > 0 && (
                        <CommandGroup heading={T.account_mine[lang]}>
                          {mineOptions.map((o) => (
                            <CommandItem
                              key={o.value}
                              value={o.value}
                              onSelect={() => { setSelectedValue(o.value); setPickerOpen(false); }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", selectedValue === o.value ? "opacity-100" : "opacity-0")} />
                              <span className="truncate">{o.label}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}

                      {otherOptions.length > 0 && (
                        <CommandGroup heading={T.account_others[lang]}>
                          {otherOptions.map((o) => (
                            <CommandItem
                              key={o.value}
                              value={o.value}
                              onSelect={() => { setSelectedValue(o.value); setPickerOpen(false); }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", selectedValue === o.value ? "opacity-100" : "opacity-0")} />
                              <span className="truncate">{o.label}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-xs">{T.type_lbl[lang]}</Label>
              <Select value={type} onValueChange={(v) => setType(v as CalendarActivityType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACTIVITY_TYPES.map(t => (
                    <SelectItem key={t.key} value={t.key}>
                      <span className="inline-flex items-center gap-2">
                        <span className={`inline-block h-2.5 w-2.5 rounded-full ${t.dotClass}`} />
                        {t.label[lang]}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{T.start_lbl[lang]}</Label>
              <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">{T.end_lbl[lang]}</Label>
              <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{T.seller_lbl[lang]}</Label>
              <Select value={sellerInitials} onValueChange={setSellerInitials} disabled={!canChooseSeller}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BUDGET_SELLERS.map(s => (
                    <SelectItem key={s.initials} value={s.initials}>{s.initials}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{T.status_lbl[lang]}</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as CalendarActivity["status"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="planned">{T.status_planned[lang]}</SelectItem>
                  <SelectItem value="done">{T.status_done[lang]}</SelectItem>
                  <SelectItem value="canceled">{T.status_canceled[lang]}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs">{T.note_lbl[lang]}</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-2">
            <Checkbox id="outlook" disabled />
            <Label htmlFor="outlook" className="text-xs text-gray-500 cursor-not-allowed">
              {T.outlook_lbl[lang]} <span className="ml-2 text-[10px] text-gray-400">({T.outlook_status[lang]})</span>
            </Label>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
          <div>
            {isEdit && (
              <Button type="button" variant="outline" onClick={handleDelete} disabled={saving} className="text-red-600 border-red-200 hover:bg-red-50">
                <Trash2 className="h-4 w-4 mr-1" /> {T.delete[lang]}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>{T.cancel[lang]}</Button>
            <Button type="button" onClick={handleSave} disabled={saving}>{T.save[lang]}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

