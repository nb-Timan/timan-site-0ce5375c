import { useEffect, useRef, useState } from 'react';
import { CalendarPlus, History, Loader2, MessageSquarePlus, Pin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CrmLeadFollowupFields } from '@/components/crm/CrmLeadFollowupFields';
import {
  getCrmLeadFollowupState,
  listCrmLeadDemoHistory,
  listCrmLeadNotes,
  saveCrmLeadNoteFollowup,
  setCrmLeadNotePriority,
  sortCrmLeadNotes,
  type CrmLeadNote,
  type CrmLeadNotePriority,
  type CrmLeadFollowupState,
  type CrmLeadDemoHistoryEvent,
} from '@/lib/crmLeadNotesService';
import { NEXT_ACTIVITY_OPTIONS } from '@/lib/crmLeadsService';
import { nextActivityToProbability } from '@/lib/leadStatus';
import { toast } from 'sonner';
import { useLanguage } from '@/context/LanguageContext';
import { crmNextActivityLabel, crmDemoRegistrationText, crmDemoStageLabel, normalizeDemoActivity, NEXT_ACTIVITY_DEMO_AGREED } from '@/lib/crmDemoStageI18n';
import { resolveReferencedUserInitials, useSellerDirectory, type SellerDirectory } from '@/lib/sellerDirectory';
import { crmLeadActivityLabel, crmLeadLocale, crmLeadText, localizeLeadHistoryBlock, localizeLeadHistoryText } from '@/lib/crmLeadI18n';
import type { PortalUiLanguage } from '@/lib/portalLanguages';

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
  onFollowupChanged?: (state: CrmLeadFollowupState) => void;
}

const QUICK_NOTE_ACTIVITY_OPTIONS = NEXT_ACTIVITY_OPTIONS
  .filter((option) => option !== 'Closed with order' && option !== 'Closed without order' && option !== NEXT_ACTIVITY_DEMO_AGREED)
  .slice()
  .sort((left, right) => nextActivityToProbability(left) - nextActivityToProbability(right));

function formatNoteTimestamp(value: string | null | undefined, language: PortalUiLanguage): string {
  if (!value) return crmLeadText('unknownTime', language);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(crmLeadLocale(language), {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

function authorLabel(
  author: Pick<CrmLeadNote, 'created_by_user_id' | 'created_by_name'>,
  directory: SellerDirectory,
  language: PortalUiLanguage,
): string {
  return resolveReferencedUserInitials({
    userId: author.created_by_user_id,
    legacyLabel: author.created_by_name,
  }, directory) || crmLeadText('unknownUser', language);
}

/** Canonical lead comments rendered from the existing append-only CRM activity stream. */
export function CrmLeadHistoryPanel({
  leadId,
  leadLabel,
  legacyNotes,
  initialLimit,
  showComposer = true,
  onCancel,
  onNotesChanged,
  onFollowupChanged,
}: CrmLeadHistoryPanelProps) {
  const { uiLanguage } = useLanguage();
  const userDirectory = useSellerDirectory();
  const [notes, setNotes] = useState<CrmLeadNote[]>([]);
  const [demoEvents, setDemoEvents] = useState<CrmLeadDemoHistoryEvent[]>([]);
  const [draft, setDraft] = useState('');
  const [nextFollowupDate, setNextFollowupDate] = useState('');
  const [nextActivity, setNextActivity] = useState('');
  const [addToCalendar, setAddToCalendar] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAll, setShowAll] = useState(!initialLimit);
  const pendingNoteIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      listCrmLeadNotes([leadId]),
      listCrmLeadDemoHistory(leadId),
      getCrmLeadFollowupState(leadId),
    ])
      .then(([nextNotes, nextDemoEvents, followup]) => {
        if (!cancelled) {
          setNotes(nextNotes);
          setDemoEvents(nextDemoEvents);
          setNextFollowupDate(followup.nextFollowupDate);
          setNextActivity(normalizeDemoActivity(followup.nextActivity));
        }
      })
      .catch(() => {
        if (!cancelled) toast.error(crmLeadText('historyLoadError', uiLanguage));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [leadId, uiLanguage]);

  async function saveNote() {
    if (!draft.trim() || saving) return;
    if (addToCalendar && !nextFollowupDate) {
      toast.error(crmLeadText('followupDateRequired', uiLanguage));
      return;
    }
    setSaving(true);
    try {
      const noteId = pendingNoteIdRef.current ?? crypto.randomUUID();
      pendingNoteIdRef.current = noteId;
      const result = await saveCrmLeadNoteFollowup({
        noteId,
        leadId,
        leadTitle: leadLabel,
        text: draft,
        nextFollowupDate,
        nextActivity,
        addToCalendar,
      });
      const next = sortCrmLeadNotes([result.note, ...notes.filter((note) => note.id !== result.note.id)]);
      setNotes(next);
      onNotesChanged?.(next);
      onFollowupChanged?.(result.lead);
      setNextFollowupDate(result.lead.nextFollowupDate);
      setNextActivity(result.lead.nextActivity);
      setDraft('');
      setAddToCalendar(false);
      pendingNoteIdRef.current = null;
      setShowAll(true);
      toast.success(crmLeadText(result.calendarActivityId ? 'noteCalendarSaved' : 'noteSaved', uiLanguage));
    } catch (error) {
      console.error('Could not save CRM lead note', error);
      toast.error(crmLeadText('noteSaveError', uiLanguage));
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
      toast.success(priority ? `${crmLeadText('priority', uiLanguage)} ${priority}` : crmLeadText('priorityRemoved', uiLanguage));
    } catch (error) {
      console.error('Could not update CRM lead note priority', error);
      toast.error(crmLeadText('prioritySaveError', uiLanguage));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {showComposer && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <label className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-800" htmlFor={`lead-note-${leadId}`}>
            <MessageSquarePlus className="h-4 w-4 text-emerald-700" /> {crmLeadText('addNote', uiLanguage)}
          </label>
          <textarea
            id={`lead-note-${leadId}`}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              pendingNoteIdRef.current = null;
            }}
            placeholder={crmLeadText('notePlaceholder', uiLanguage)}
            className="min-h-24 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <CrmLeadFollowupFields
              nextFollowup={nextFollowupDate}
              activity={nextActivity}
              onNextFollowupChange={setNextFollowupDate}
              onActivityChange={setNextActivity}
              activityOptions={[...new Set([...QUICK_NOTE_ACTIVITY_OPTIONS, nextActivity].filter(Boolean))]}
              activityLabel={(activity) => crmLeadActivityLabel(crmNextActivityLabel(activity, uiLanguage), uiLanguage)}
            />
          </div>
          <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={addToCalendar}
              onChange={(event) => setAddToCalendar(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-500"
            />
            <CalendarPlus className="h-4 w-4 text-emerald-700" />
            {crmLeadText('addFollowupToCalendar', uiLanguage)}
          </label>
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => { setDraft(''); setAddToCalendar(false); pendingNoteIdRef.current = null; onCancel?.(); }} disabled={saving}>{crmLeadText('cancel', uiLanguage)}</Button>
            <Button type="button" size="sm" onClick={() => void saveNote()} disabled={!draft.trim() || loading || saving}>
              {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} {crmLeadText('save', uiLanguage)}
            </Button>
          </div>
        </div>
      )}

      {legacyNotes?.trim() && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-950">
          <p className="mb-1 font-medium">{crmLeadText('previousNotes', uiLanguage)}</p>
          <p className="whitespace-pre-wrap text-amber-900">{localizeLeadHistoryBlock(legacyNotes.trim(), uiLanguage)}</p>
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><History className="h-4 w-4" /> {crmLeadText('leadHistory', uiLanguage)}</h3>
          <span className="text-xs text-slate-500">{notes.length} {crmLeadText('notesCount', uiLanguage)}</span>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 py-3 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> {crmLeadText('loadingNotes', uiLanguage)}</div>
        ) : visibleNotes.length === 0 ? (
          <p className="py-3 text-sm text-slate-500">{crmLeadText('noNotes', uiLanguage)}</p>
        ) : (
          <ol className="space-y-2">
            {visibleNotes.map((note) => (
              <li key={note.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-slate-500">{formatNoteTimestamp(note.created_at || note.activity_date, uiLanguage)} · {authorLabel(note, userDirectory, uiLanguage)}</p>
                  {note.priority_position && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800" title={`${crmLeadText('priority', uiLanguage)} ${note.priority_position}`}>
                      <Pin className="h-3 w-3" /> {note.priority_position}
                    </span>
                  )}
                </div>
                <p className="whitespace-pre-wrap text-sm text-slate-800">{note.description ? localizeLeadHistoryText(note.description, uiLanguage) : '—'}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
                  <span className="mr-1">{crmLeadText('pin', uiLanguage)}:</span>
                  {([1, 2, 3] as CrmLeadNotePriority[]).map((priority) => (
                    <button
                      key={priority}
                      type="button"
                      onClick={() => void changePriority(note.id, priority)}
                      disabled={saving || note.priority_position === priority}
                      className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-slate-200 px-1 font-medium text-slate-600 hover:border-amber-300 hover:bg-amber-50 disabled:cursor-default disabled:border-amber-200 disabled:bg-amber-50 disabled:text-amber-800"
                      aria-label={`${crmLeadText('pin', uiLanguage)} ${crmLeadText('priority', uiLanguage)} ${priority}`}
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
                      {crmLeadText('remove', uiLanguage)}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
        {!showAll && initialLimit && notes.length > initialLimit && (
          <button type="button" onClick={() => setShowAll(true)} className="mt-3 text-sm font-medium text-emerald-700 hover:underline">
            {crmLeadText('showFullHistory', uiLanguage)}
          </button>
        )}
      </div>

      {demoEvents.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900"><History className="h-4 w-4" /> {crmLeadText('demoEvents', uiLanguage)}</h3>
          <ol className="space-y-2">
            {demoEvents.map((event) => (
              <li key={event.id} className="rounded-lg border border-violet-100 bg-violet-50/40 px-3 py-2.5">
                <p className="text-xs font-medium text-slate-500">{formatNoteTimestamp(event.created_at, uiLanguage)} · {authorLabel(event, userDirectory, uiLanguage)}</p>
                <p className="mt-1 text-sm font-medium text-slate-800">{event.registration_event
                  ? event.activity_type === 'demo_registration_started' ? crmDemoRegistrationText('started', uiLanguage)
                    : event.activity_type === 'demo_date_changed' ? crmDemoRegistrationText('dateChanged', uiLanguage)
                      : crmDemoStageLabel(event.activity_type === 'demo_requested' ? 'requested' : 'agreed', uiLanguage)
                  : event.title || 'Demo'}</p>
                {event.description && <p className="mt-0.5 text-sm text-slate-700">{event.description}</p>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
