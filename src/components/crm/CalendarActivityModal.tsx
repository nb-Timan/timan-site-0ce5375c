/**
 * CalendarActivityModal — create / edit a planned dealer activity.
 * Outlook sync is reserved (checkbox is disabled, status shown as "Ikke aktiveret endnu").
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2 } from "lucide-react";
import {
  ACTIVITY_TYPES,
  activityTypeMeta,
  createActivity,
  updateActivity,
  deleteActivity,
  type CalendarActivity,
  type CalendarActivityType,
} from "@/lib/crmCalendarService";
import type { CrmAccount } from "@/lib/crmAccountsService";
import { BUDGET_SELLERS, type BudgetSellerRef } from "@/lib/crmBudgetService";
import type { Language } from "@/types/configurator";

const T: Record<string, Record<Language, string>> = {
  new_title:        { da: "Ny aktivitet",         en: "New activity",      de: "Neue Aktivität",   it: "Nuova attività",    hu: "Új tevékenység" },
  edit_title:       { da: "Rediger aktivitet",    en: "Edit activity",     de: "Aktivität bearbeiten", it: "Modifica attività", hu: "Tevékenység szerkesztése" },
  title_lbl:        { da: "Titel",                en: "Title",             de: "Titel",            it: "Titolo",            hu: "Cím" },
  account_lbl:      { da: "Forhandler",           en: "Dealer",            de: "Händler",          it: "Rivenditore",       hu: "Kereskedő" },
  account_none:     { da: "Ingen forhandler",     en: "No dealer",         de: "Kein Händler",     it: "Nessun rivenditore", hu: "Nincs kereskedő" },
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

export default function CalendarActivityModal(props: Props) {
  const { open, onOpenChange, lang, isAdmin, currentSeller, accounts, initial, defaultDateIso, defaultAccountId, onSaved } = props;
  const isEdit = !!initial?.id;

  const [title, setTitle] = useState("");
  const [accountId, setAccountId] = useState<string>("none");
  const [type, setType] = useState<CalendarActivityType>("demo");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [sellerInitials, setSellerInitials] = useState<string>(currentSeller?.initials || "BP");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<CalendarActivity["status"]>("planned");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setTitle(initial?.title || "");
    setAccountId(initial?.account_id || defaultAccountId || "none");
    setType((initial?.activity_type as CalendarActivityType) || "demo");
    setStart(toLocalInputValue(initial?.start_datetime || defaultDateIso || new Date().toISOString()));
    setEnd(toLocalInputValue(initial?.end_datetime ?? null));
    setSellerInitials(initial?.seller_initials || currentSeller?.initials || "BP");
    setNote(initial?.note || "");
    setStatus((initial?.status as CalendarActivity["status"]) || "planned");
  }, [open, initial, defaultAccountId, defaultDateIso, currentSeller]);

  async function handleSave() {
    const startIso = fromLocalInputValue(start);
    if (!title.trim() || !startIso) { setError(T.required[lang]); return; }
    setSaving(true);
    const account = accountId !== "none" ? accounts.find(a => a.id === accountId) : null;
    const seller = BUDGET_SELLERS.find(s => s.initials === sellerInitials) || currentSeller;
    const payload = {
      title: title.trim(),
      start_datetime: startIso,
      end_datetime: fromLocalInputValue(end),
      account_id: account?.id ?? null,
      dealer_name: account?.company || account?.full_name || null,
      seller_user_id: null,
      seller_initials: seller?.initials ?? null,
      seller_name: seller?.full_name ?? null,
      activity_type: type,
      note: note.trim() || null,
      status,
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
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="none">{T.account_none[lang]}</SelectItem>
                  {accounts.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.company || a.full_name || a.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
