import { useEffect, useState } from 'react';
import { History, Loader2, MessageSquarePlus, Pin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  createCrmLeadNote,
  listCrmLeadNotes,
  setCrmLeadNotePriority,
  sortCrmLeadNotes,
  type CrmLeadNote,
  type CrmLeadNotePriority,
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
  showComposer?: boolean;
  onCancel?: () => void;
  onNotesChanged?: (notes: CrmLeadNote[]) => void;
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
  showComposer = true,
  onCancel,
  onNotesChanged,
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
      const next = sortCrmLeadNotes([note, ...notes]);
      setNotes(next);
      onNotesChanged?.(next);
      setDraft('');
      setShowAll(true);
      toast.success('Noten er gemt');
    } catch (error) {
      console.error('Could not save CRM lead note', error);
      toast.error('Kunne ikke gemme noten');
    } finally {
      setSaving(false);
    }
  }

  const visibleNotes = showAll || !initialLimit ? notes : notes.slice(0, initialLimit);

  async function changePriority(noteId: string, priority: CrmLeadNotePriority | null) {
    setSaving(true);
    try {
      await setCrmLeadNotePriority(noteId, priority);
      const next = await listCrmLeadNotes([leadId]);
      setNotes(next);
      onNotesChanged?.(next);
      toast.success(priority ? `Note fastgjort som ${priority}` : 'Prioritet fjernet');
    } catch (error) {
      console.error('Could not update CRM lead note priority', error);
      toast.error('Kunne ikke ændre noteprioritet');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {showComposer && (
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
      )}

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
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-slate-500">{formatNoteTimestamp(note.created_at || note.activity_date)} · {authorLabel(note)}</p>
                  {note.priority_position && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800" title={`Prioritet ${note.priority_position}`}>
                      <Pin className="h-3 w-3" /> {note.priority_position}
                    </span>
                  )}
                </div>
                <p className="whitespace-pre-wrap text-sm text-slate-800">{note.description || '—'}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
                  <span className="mr-1">Fastgør:</span>
                  {([1, 2, 3] as CrmLeadNotePriority[]).map((priority) => (
                    <button
                      key={priority}
                      type="button"
                      onClick={() => void changePriority(note.id, priority)}
                      disabled={saving || note.priority_position === priority}
                      className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-slate-200 px-1 font-medium text-slate-600 hover:border-amber-300 hover:bg-amber-50 disabled:cursor-default disabled:border-amber-200 disabled:bg-amber-50 disabled:text-amber-800"
                      aria-label={`Fastgør som prioritet ${priority}`}
                    >
                      {priority}
                    </button>
                  ))}
                  {note.priority_position && (
                    <button
                      type="button"
                      onClick={() => void changePriority(note.id, null)}
                      disabled={saving}
                      className="ml-1 text-slate-500 hover:text-slate-900 hover:underline disabled:cursor-not-allowed"
                    >
                      Fjern
                    </button>
                  )}
                </div>
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
