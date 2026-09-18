import { useEffect, useState } from 'react';
import { History, Loader2, MessageSquarePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  createCrmLeadNote,
  listCrmLeadNotes,
  type CrmLeadNote,
} from '@/lib/crmLeadNotesService';
import { toast } from 'sonner';

interface CrmLeadHistoryPanelProps {
  leadId: string;
  leadLabel: string;
  authorUserId?: string | null;
  authorName?: string | null;
  ownerUserId?: string | null;
  ownerName?: string | null;
  legacyNotes?: string | null;
  initialLimit?: number;
  onCancel?: () => void;
  onNoteSaved?: (note: CrmLeadNote) => void;
}

function formatNoteTimestamp(value: string | null | undefined): string {
  if (!value) return 'Ukendt tidspunkt';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('da-DK', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

function authorLabel(note: CrmLeadNote): string {
  const name = note.created_by_name?.trim();
  if (!name) return 'Ukendt bruger';
  const words = name.split(/\s+/).filter(Boolean);
  return words.length > 1 ? words.map((word) => word[0]).join('').toUpperCase() : name;
}

/** Canonical lead comments rendered from the existing append-only CRM activity stream. */
export function CrmLeadHistoryPanel({
  leadId,
  leadLabel,
  authorUserId,
  authorName,
  ownerUserId,
  ownerName,
  legacyNotes,
  initialLimit,
  onCancel,
  onNoteSaved,
}: CrmLeadHistoryPanelProps) {
  const [notes, setNotes] = useState<CrmLeadNote[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAll, setShowAll] = useState(!initialLimit);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listCrmLeadNotes([leadId])
      .then((result) => {
        if (!cancelled) setNotes(result);
      })
      .catch(() => {
        if (!cancelled) toast.error('Kunne ikke hente leadhistorik');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [leadId]);

  async function saveNote() {
    if (!draft.trim() || saving) return;
    setSaving(true);
    try {
      const note = await createCrmLeadNote({
        leadId,
        leadTitle: leadLabel,
        text: draft,
        authorUserId,
        authorName,
        ownerUserId,
        ownerName,
      });
      setNotes((current) => [note, ...current]);
      setDraft('');
      setShowAll(true);
      onNoteSaved?.(note);
      toast.success('Noten er gemt');
    } catch (error) {
      console.error('Could not save CRM lead note', error);
      toast.error('Kunne ikke gemme noten');
    } finally {
      setSaving(false);
    }
  }

  const visibleNotes = showAll || !initialLimit ? notes : notes.slice(0, initialLimit);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
        <label className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-800" htmlFor={`lead-note-${leadId}`}>
          <MessageSquarePlus className="h-4 w-4 text-emerald-700" /> Tilføj note
        </label>
        <textarea
          id={`lead-note-${leadId}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Skriv en kort opfølgning eller kommentar"
          className="min-h-24 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
        />
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => { setDraft(''); onCancel?.(); }} disabled={saving}>Annuller</Button>
          <Button type="button" size="sm" onClick={() => void saveNote()} disabled={!draft.trim() || saving}>
            {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Gem
          </Button>
        </div>
      </div>

      {legacyNotes?.trim() && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-950">
          <p className="mb-1 font-medium">Tidligere noter</p>
          <p className="whitespace-pre-wrap text-amber-900">{legacyNotes.trim()}</p>
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><History className="h-4 w-4" /> Leadhistorik</h3>
          <span className="text-xs text-slate-500">{notes.length} noter</span>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 py-3 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Indlæser noter</div>
        ) : visibleNotes.length === 0 ? (
          <p className="py-3 text-sm text-slate-500">Ingen noter endnu.</p>
        ) : (
          <ol className="space-y-2">
            {visibleNotes.map((note) => (
              <li key={note.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                <p className="mb-1 text-xs font-medium text-slate-500">{formatNoteTimestamp(note.created_at || note.activity_date)} · {authorLabel(note)}</p>
                <p className="whitespace-pre-wrap text-sm text-slate-800">{note.description || '—'}</p>
              </li>
            ))}
          </ol>
        )}
        {!showAll && initialLimit && notes.length > initialLimit && (
          <button type="button" onClick={() => setShowAll(true)} className="mt-3 text-sm font-medium text-emerald-700 hover:underline">
            Vis hele historikken
          </button>
        )}
      </div>
    </div>
  );
}
