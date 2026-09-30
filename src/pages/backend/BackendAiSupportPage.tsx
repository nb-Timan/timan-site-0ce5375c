import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
  Bot,
  CheckCircle2,
  Clock3,
  FileQuestion,
  Filter,
  Gauge,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ThumbsUp,
  Users,
  XCircle,
} from 'lucide-react';
import PortalFooter from '@/components/portal/PortalFooter';
import PortalHeader from '@/components/portal/PortalHeader';
import { KnowledgeSourcesPanel } from '@/components/support/KnowledgeSourcesPanel';
import { SupportEvaluationPanel } from '@/components/support/SupportEvaluationPanel';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { getSupportAdminCopy, supportAdminCodeLabel } from '@/lib/i18n/supportAdminTranslations';
import { FALLBACK_LANGUAGE, PORTAL_LANGUAGES, normalizePortalLanguageCode, portalLanguageDisplayCode } from '@/lib/portalLanguages';
import {
  createSupportKnowledgeItem,
  draftKnowledgeFromGap,
  fetchSupportAdminOverview,
  fetchSupportFeedback,
  fetchSupportKnowledgeGaps,
  fetchSupportKnowledgeItems,
  fetchSupportQuestions,
  updateSupportKnowledgeItem,
} from '@/lib/supportAdminService';
import {
  EMPTY_SUPPORT_ADMIN_OVERVIEW,
  SUPPORT_ACCESS_SCOPES,
  SUPPORT_CONFIDENCE_LEVELS,
  SUPPORT_GAP_REASONS,
  SUPPORT_GAP_STATUSES,
  SUPPORT_KNOWLEDGE_STATUSES,
  SUPPORT_KNOWLEDGE_TYPES,
  SUPPORT_RESULT_STATUSES,
  SUPPORT_OUTCOMES,
  canTransitionKnowledgeStatus,
  percentage,
  type SupportAdminOverview,
  type SupportFeedbackRow,
  type SupportGapFilters,
  type SupportKnowledgeDraft,
  type SupportKnowledgeFilters,
  type SupportKnowledgeGapRow,
  type SupportKnowledgeItem,
  type SupportQuestionFilters,
  type SupportQuestionRow,
} from '@/lib/supportAdminTypes';
import { canAccessSupport, verifySupportAccess } from '@/lib/supportAccess';
import { cn } from '@/lib/utils';
import { useEffectivePortalUserState } from '@/lib/viewAsUser';

type SupportAdminTab = 'overview' | 'questions' | 'unanswered' | 'feedback' | 'knowledge' | 'evaluation' | 'observability';

const TAB_IDS: SupportAdminTab[] = ['overview', 'questions', 'unanswered', 'feedback', 'knowledge', 'evaluation', 'observability'];

const EMPTY_KNOWLEDGE_DRAFT: SupportKnowledgeDraft = {
  title: '',
  knowledge_type: 'MANUAL_QA',
  content: '',
  summary: '',
  machine_id: '',
  product_id: '',
  category: '',
  keywords: [],
  source_reference: '',
  language: 'da',
  status: 'DRAFT',
  access_scope: 'BACKEND',
  required_area: '',
  required_module: '',
  effective_from: '',
  effective_until: '',
  next_review_at: '',
};

function formatDate(value: string | null | undefined, language: string): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatLatency(value: number | null | undefined): string {
  if (!value) return '0 ms';
  return value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${Math.round(value)} ms`;
}

function toDateTimeLocal(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function StatusPill({ value, language }: { value: string; language: Parameters<typeof supportAdminCodeLabel>[0] }) {
  const good = ['ANSWERED', 'APPROVED', 'RESOLVED', 'POSITIVE', 'SUCCESS', 'HIGH'].includes(value);
  const bad = ['NO_ANSWER', 'ERROR', 'NEGATIVE', 'FAILED', 'LOW', 'NO_GROUNDED_ANSWER'].includes(value);
  return (
    <span className={cn(
      'inline-flex max-w-full rounded px-2 py-1 text-[11px] font-semibold',
      good ? 'bg-emerald-50 text-emerald-800' : bad ? 'bg-rose-50 text-rose-800' : 'bg-slate-100 text-slate-700',
    )}>
      {supportAdminCodeLabel(language, value)}
    </span>
  );
}

function EmptyState({ icon: Icon, title, detail }: { icon: typeof Bot; title: string; detail?: string }) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center px-5 py-10 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-md bg-slate-100 text-slate-500">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="mt-3 text-sm font-semibold text-slate-800">{title}</p>
      {detail && <p className="mt-1 max-w-lg text-sm text-slate-500">{detail}</p>}
    </div>
  );
}

function LoadBoundary({ loading, error, retry, children }: { loading: boolean; error: string | null; retry: () => void; children: ReactNode }) {
  const { uiLanguage } = useLanguage();
  const copy = getSupportAdminCopy(uiLanguage);
  if (loading) return <EmptyState icon={RefreshCw} title={copy.loading} />;
  if (error) {
    return (
      <div role="alert" className="flex min-h-52 flex-col items-center justify-center gap-3 px-5 py-10 text-center">
        <XCircle className="h-7 w-7 text-rose-600" />
        <p className="text-sm text-rose-800">{error}</p>
        <Button variant="outline" onClick={retry}><RefreshCw className="mr-2 h-4 w-4" />{copy.retry}</Button>
      </div>
    );
  }
  return children;
}

function Metric({ label, value, icon: Icon, note }: { label: string; value: string | number; icon: typeof Bot; note?: string }) {
  return (
    <div className="min-w-0 border-b border-slate-200 px-4 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
        <Icon className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-slate-950">{value}</p>
      {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
    </div>
  );
}

export function OverviewPanel({ overview, reload, loading, error }: { overview: SupportAdminOverview; reload: () => void; loading: boolean; error: string | null }) {
  const { uiLanguage } = useLanguage();
  const copy = getSupportAdminCopy(uiLanguage);
  const answerRate = percentage(overview.answered_questions, overview.total_questions);
  const groundedRate = percentage(overview.grounded_answers, overview.answered_questions);
  const noAnswerRate = percentage(overview.no_answer_questions, overview.total_questions);
  const positiveRate = percentage(overview.positive_feedback, overview.total_feedback);
  return (
    <LoadBoundary loading={loading} error={error} retry={reload}>
      <div className="space-y-5">
        <div className="grid overflow-hidden rounded-md border border-slate-200 bg-white sm:grid-cols-2 xl:grid-cols-4">
          <Metric label={copy.totalQuestions} value={overview.total_questions} icon={MessageSquare} />
          <Metric label={copy.uniqueUsers} value={overview.unique_users} icon={Users} />
          <Metric label={copy.answerRate} value={`${answerRate}%`} icon={CheckCircle2} />
          <Metric label={copy.groundedRate} value={`${groundedRate}%`} icon={ShieldCheck} />
        </div>
        <div className="grid overflow-hidden rounded-md border border-slate-200 bg-white sm:grid-cols-2 xl:grid-cols-5">
          <Metric label={copy.assistantConfigurations} value={overview.configuration_started} icon={Bot} />
          <Metric label={copy.assistantCompleted} value={overview.configuration_completed} icon={CheckCircle2} />
          <Metric label={copy.assistantPreviews} value={overview.quote_previewed} icon={Gauge} />
          <Metric label={copy.assistantQuotes} value={overview.quote_created} icon={FileQuestion} />
          <Metric label={copy.assistantLeads} value={overview.lead_created_or_linked} icon={Users} />
        </div>
        <div className="grid overflow-hidden rounded-md border border-slate-200 bg-white sm:grid-cols-2 xl:grid-cols-5">
          <Metric label={copy.assistantPdfs} value={overview.pdf_generated} icon={BookOpen} />
          <Metric label={copy.assistantEmails} value={overview.email_sent} icon={MessageSquare} />
          <Metric label={copy.assistantHandoffs} value={overview.sales_handoffs + overview.service_handoffs} icon={Users} />
          <Metric label={copy.assistantFailures} value={overview.failed_actions} icon={XCircle} />
          <Metric label={copy.assistantOpenWorkflows} value={overview.open_workflows} icon={Clock3} />
        </div>
        <div className="grid overflow-hidden rounded-md border border-slate-200 bg-white sm:grid-cols-2 xl:grid-cols-4">
          <Metric label={copy.noAnswerRate} value={`${noAnswerRate}%`} icon={AlertTriangle} />
          <Metric label={copy.positiveFeedbackRate} value={`${positiveRate}%`} icon={ThumbsUp} />
          <Metric label={copy.averageResponseTime} value={formatLatency(overview.average_response_time_ms)} icon={Clock3} />
          <Metric label={copy.knowledgeGaps} value={overview.open_knowledge_gaps} icon={FileQuestion} />
        </div>
        <div className="grid overflow-hidden rounded-md border border-slate-200 bg-white sm:grid-cols-2 xl:grid-cols-4">
          <Metric label={copy.questionsToday} value={overview.questions_today} icon={Activity} />
          <Metric label={copy.questions7Days} value={overview.questions_7_days} icon={BarChart3} />
          <Metric label={copy.questions30Days} value={overview.questions_30_days} icon={BarChart3} />
          <Metric label={copy.approvedKnowledge} value={overview.approved_knowledge_items} icon={BookOpen} />
        </div>
        {overview.total_questions === 0 && (
          <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">
            {copy.zeroStateHint}
          </div>
        )}
      </div>
    </LoadBoundary>
  );
}

function FilterInput({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="min-w-0">
      <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">{label}</span>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="h-9" />
    </label>
  );
}

function FilterSelect({ label, value, onChange, options, allLabel, getOptionLabel }: { label: string; value: string; onChange: (value: string) => void; options: readonly string[]; allLabel: string; getOptionLabel?: (option: string) => string }) {
  const { uiLanguage } = useLanguage();
  return (
    <label className="min-w-0">
      <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800">
        <option value="">{allLabel}</option>
        {options.map((option) => <option key={option} value={option}>{getOptionLabel?.(option) || supportAdminCodeLabel(uiLanguage, option)}</option>)}
      </select>
    </label>
  );
}

function QuestionDetailDialog({ question, onClose }: { question: SupportQuestionRow | null; onClose: () => void }) {
  const { uiLanguage } = useLanguage();
  const copy = getSupportAdminCopy(uiLanguage);
  return (
    <Dialog open={!!question} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{copy.question}</DialogTitle>
          <DialogDescription>{question ? formatDate(question.created_at, uiLanguage) : ''}</DialogDescription>
        </DialogHeader>
        {question && (
          <div className="space-y-5 text-sm">
            <section>
              <p className="text-xs font-semibold uppercase text-slate-500">{copy.question}</p>
              <p className="mt-1 whitespace-pre-wrap text-slate-950">{question.question_text}</p>
            </section>
            <section>
              <p className="text-xs font-semibold uppercase text-slate-500">{copy.answer}</p>
              <p className="mt-1 whitespace-pre-wrap text-slate-800">{question.response?.response_text || '—'}</p>
            </section>
            <dl className="grid gap-3 rounded-md border border-slate-200 p-4 sm:grid-cols-2">
              {[
                [copy.userReference, question.asked_by_user_id],
                [copy.partnerReference, question.partner_id],
                [copy.role, question.role_snapshot],
                [copy.language, portalLanguageDisplayCode(question.portal_language)],
                [copy.route, question.current_route],
                [copy.machine, question.machine_id],
                [copy.category, question.category],
                [copy.result, supportAdminCodeLabel(uiLanguage, question.result_status)],
                [copy.confidence, question.confidence_level
                  ? `${supportAdminCodeLabel(uiLanguage, question.confidence_level)}${question.confidence_score !== null ? ` · ${Math.round(question.confidence_score * 100)}%` : ''}`
                  : copy.confidenceUnknown],
                [copy.outcome, question.outcome_type ? supportAdminCodeLabel(uiLanguage, question.outcome_type) : copy.confidenceUnknown],
                [copy.reason, question.confidence_reason ? supportAdminCodeLabel(uiLanguage, question.confidence_reason) : null],
                [copy.latency, formatLatency(question.response?.latency_ms ?? question.latency_ms)],
                [copy.retrievalStatus, question.response?.grounded ? 'GROUNDED' : '—'],
                [copy.technicalError, question.response?.error_category],
              ].map(([label, value]) => (
                <div key={label || ''} className="min-w-0">
                  <dt className="text-xs font-semibold text-slate-500">{label}</dt>
                  <dd className="mt-1 break-words text-slate-800">{value || '—'}</dd>
                </div>
              ))}
            </dl>
            <section>
              <p className="text-xs font-semibold uppercase text-slate-500">{copy.sourceReferences}</p>
              {question.response?.sources?.length ? (
                <ul className="mt-2 space-y-2">
                  {question.response.sources.map((source) => (
                    <li key={source.id} className="rounded border border-slate-200 px-3 py-2 text-xs text-slate-700">
                      {source.citation_label || source.knowledge_item_id} · v{source.knowledge_version}
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-1 text-slate-500">—</p>}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function QuestionsPanel() {
  const { uiLanguage } = useLanguage();
  const copy = getSupportAdminCopy(uiLanguage);
  const [filters, setFilters] = useState<SupportQuestionFilters>({});
  const [rows, setRows] = useState<SupportQuestionRow[]>([]);
  const [selected, setSelected] = useState<SupportQuestionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRows(await fetchSupportQuestions(filters)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setLoading(false); }
  }, [filters]);
  useEffect(() => { void load(); }, [load]);
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800"><Filter className="h-4 w-4" />{copy.filters}</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterInput label={copy.search} value={filters.search || ''} onChange={(search) => setFilters({ ...filters, search })} />
          <FilterInput label={copy.dateFrom} type="date" value={filters.dateFrom || ''} onChange={(dateFrom) => setFilters({ ...filters, dateFrom })} />
          <FilterInput label={copy.dateTo} type="date" value={filters.dateTo || ''} onChange={(dateTo) => setFilters({ ...filters, dateTo })} />
          <FilterSelect label={copy.language} value={filters.language || ''} onChange={(language) => setFilters({ ...filters, language })} options={PORTAL_LANGUAGES.map((language) => language.code)} allLabel={copy.all} getOptionLabel={portalLanguageDisplayCode} />
          <FilterSelect label={copy.result} value={filters.resultStatus || ''} onChange={(resultStatus) => setFilters({ ...filters, resultStatus: resultStatus as SupportQuestionFilters['resultStatus'] || undefined })} options={SUPPORT_RESULT_STATUSES} allLabel={copy.all} />
          <FilterSelect label={copy.confidence} value={filters.confidenceLevel || ''} onChange={(confidenceLevel) => setFilters({ ...filters, confidenceLevel: confidenceLevel as SupportQuestionFilters['confidenceLevel'] || undefined })} options={SUPPORT_CONFIDENCE_LEVELS} allLabel={copy.all} />
          <FilterSelect label={copy.outcome} value={filters.outcomeType || ''} onChange={(outcomeType) => setFilters({ ...filters, outcomeType: outcomeType as SupportQuestionFilters['outcomeType'] || undefined })} options={SUPPORT_OUTCOMES} allLabel={copy.all} />
          <FilterInput label={copy.userReference} value={filters.userId || ''} onChange={(userId) => setFilters({ ...filters, userId })} />
          <FilterInput label={copy.partnerReference} value={filters.partnerId || ''} onChange={(partnerId) => setFilters({ ...filters, partnerId })} />
          <FilterInput label={copy.role} value={filters.role || ''} onChange={(role) => setFilters({ ...filters, role })} />
          <FilterInput label={copy.category} value={filters.category || ''} onChange={(category) => setFilters({ ...filters, category })} />
          <FilterInput label={copy.machine} value={filters.machineId || ''} onChange={(machineId) => setFilters({ ...filters, machineId })} />
        </div>
        <Button variant="ghost" size="sm" className="mt-3" onClick={() => setFilters({})}>{copy.clearFilters}</Button>
      </div>
      <LoadBoundary loading={loading} error={error} retry={() => void load()}>
        {rows.length === 0 ? <EmptyState icon={MessageSquare} title={copy.noQuestions} /> : (
          <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
            {rows.map((row) => (
              <button key={row.id} type="button" onClick={() => setSelected(row)} className="grid w-full gap-2 border-b border-slate-100 px-4 py-3 text-left last:border-0 hover:bg-slate-50 sm:grid-cols-[minmax(0,1fr)_6rem_8rem_8rem_auto] sm:items-center">
                <span className="min-w-0 truncate text-sm font-medium text-slate-900">{row.question_text}</span>
                <span className="text-xs text-slate-500">{portalLanguageDisplayCode(row.portal_language)}</span>
                <StatusPill value={row.result_status} language={uiLanguage} />
                <StatusPill value={row.confidence_level || 'UNKNOWN'} language={uiLanguage} />
                <span className="text-xs text-slate-500">{formatDate(row.created_at, uiLanguage)}</span>
              </button>
            ))}
          </div>
        )}
      </LoadBoundary>
      <QuestionDetailDialog question={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function UnansweredPanel({ onCreateDraft }: { onCreateDraft: (draft: SupportKnowledgeDraft) => void }) {
  const { uiLanguage } = useLanguage();
  const copy = getSupportAdminCopy(uiLanguage);
  const [filters, setFilters] = useState<SupportGapFilters>({});
  const [rows, setRows] = useState<SupportKnowledgeGapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRows(await fetchSupportKnowledgeGaps(filters)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setLoading(false); }
  }, [filters]);
  useEffect(() => { void load(); }, [load]);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-md border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
        <FilterSelect label={copy.status} value={filters.status || ''} onChange={(status) => setFilters({ ...filters, status: status as SupportGapFilters['status'] || undefined })} options={SUPPORT_GAP_STATUSES} allLabel={copy.all} />
        <FilterSelect label={copy.reason} value={filters.reason || ''} onChange={(reason) => setFilters({ ...filters, reason: reason as SupportGapFilters['reason'] || undefined })} options={SUPPORT_GAP_REASONS} allLabel={copy.all} />
        <FilterInput label={copy.machine} value={filters.machineId || ''} onChange={(machineId) => setFilters({ ...filters, machineId })} />
        <FilterInput label={copy.category} value={filters.category || ''} onChange={(category) => setFilters({ ...filters, category })} />
        <FilterInput label={copy.occurrenceCount} type="number" value={String(filters.minimumOccurrences || '')} onChange={(value) => setFilters({ ...filters, minimumOccurrences: value ? Number(value) : undefined })} />
      </div>
      <LoadBoundary loading={loading} error={error} retry={() => void load()}>
        {rows.length === 0 ? <EmptyState icon={FileQuestion} title={copy.noGaps} /> : (
          <div className="grid gap-3 lg:grid-cols-2">
            {rows.map((row) => (
              <article key={row.id} className="rounded-md border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-950">{row.question?.question_text || row.question_id || '—'}</h3>
                  <StatusPill value={row.status} language={uiLanguage} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                  <span>{copy.reason}: {supportAdminCodeLabel(uiLanguage, row.reason_code)}</span>
                  <span>{copy.occurrenceCount}: {row.occurrence_count}</span>
                  <span>{copy.machine}: {row.machine_id || '—'}</span>
                  <span>{copy.language}: {row.languages.map(portalLanguageDisplayCode).join(', ') || '—'}</span>
                  <span>{copy.firstSeen}: {formatDate(row.first_seen_at, uiLanguage)}</span>
                  <span>{copy.lastSeen}: {formatDate(row.last_seen_at, uiLanguage)}</span>
                </div>
                <Button size="sm" variant="outline" className="mt-4" onClick={() => onCreateDraft(draftKnowledgeFromGap(row))}>
                  <Plus className="mr-2 h-4 w-4" />{copy.createKnowledgeDraft}
                </Button>
              </article>
            ))}
          </div>
        )}
      </LoadBoundary>
    </div>
  );
}

function FeedbackPanel() {
  const { uiLanguage } = useLanguage();
  const copy = getSupportAdminCopy(uiLanguage);
  const [rows, setRows] = useState<SupportFeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRows(await fetchSupportFeedback()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return (
    <LoadBoundary loading={loading} error={error} retry={() => void load()}>
      {rows.length === 0 ? <EmptyState icon={ThumbsUp} title={copy.noFeedback} /> : (
        <div className="space-y-3">
          {rows.map((row) => (
            <article key={row.id} className="rounded-md border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <StatusPill value={row.sentiment} language={uiLanguage} />
                <time className="text-xs text-slate-500">{formatDate(row.created_at, uiLanguage)}</time>
              </div>
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium text-slate-500">{copy.question}</dt>
                  <dd className="mt-1 text-slate-900">{row.question?.question_text || row.question_id || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-500">{copy.answer}</dt>
                  <dd className="mt-1 text-slate-900">{row.response?.response_text || row.response_id || '—'}</dd>
                </div>
              </dl>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
                <span>{copy.reason}: {row.reason_code ? supportAdminCodeLabel(uiLanguage, row.reason_code) : row.comment || '—'}</span>
                <span>{copy.language}: {row.question?.portal_language ? portalLanguageDisplayCode(row.question.portal_language) : '—'}</span>
                <span>{copy.userReference}: {row.submitted_by?.email || row.submitted_by_user_id || '—'}</span>
                <span>{copy.result}: {row.response?.answer_status || '—'}</span>
                <span>{copy.sourceReferences}: {row.response?.sources?.length || 0}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </LoadBoundary>
  );
}

function KnowledgeEditor({ item, initialDraft, onClose, onSaved }: { item: SupportKnowledgeItem | null; initialDraft: SupportKnowledgeDraft | null; onClose: () => void; onSaved: () => void }) {
  const { uiLanguage } = useLanguage();
  const copy = getSupportAdminCopy(uiLanguage);
  const { toast } = useToast();
  const [draft, setDraft] = useState<SupportKnowledgeDraft>(EMPTY_KNOWLEDGE_DRAFT);
  const [saving, setSaving] = useState(false);
  const open = !!item || !!initialDraft;
  useEffect(() => {
    if (item) {
      setDraft({
        title: item.title, knowledge_type: item.knowledge_type, content: item.content, summary: item.summary || '', machine_id: item.machine_id || '', product_id: item.product_id || '', category: item.category || '', keywords: item.keywords, source_reference: item.source_reference || '', language: normalizePortalLanguageCode(item.language) || FALLBACK_LANGUAGE, status: item.status, access_scope: item.access_scope, required_area: item.required_area || '', required_module: item.required_module || '', effective_from: toDateTimeLocal(item.effective_from), effective_until: toDateTimeLocal(item.effective_until), next_review_at: toDateTimeLocal(item.next_review_at),
      });
    } else if (initialDraft) setDraft(initialDraft);
  }, [item, initialDraft]);
  const allowedStatuses = item
    ? SUPPORT_KNOWLEDGE_STATUSES.filter((status) => canTransitionKnowledgeStatus(item.status, status))
    : ['DRAFT'] as const;
  const save = async () => {
    if (!draft.title.trim()) return;
    setSaving(true);
    try {
      if (item) await updateSupportKnowledgeItem(item, draft);
      else await createSupportKnowledgeItem(draft);
      toast({ title: copy.saveSuccess });
      onSaved();
    } catch (reason) {
      toast({ variant: 'destructive', title: reason instanceof Error ? reason.message : String(reason) });
    } finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-h-[92dvh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? copy.edit : copy.newKnowledge}</DialogTitle>
          <DialogDescription>{copy.backendOnly}{item ? ` · ${copy.version} ${item.version_number}` : ''}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={copy.titleField} className="sm:col-span-2"><Input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></Field>
          <Field label={copy.type}><SelectField value={draft.knowledge_type} onChange={(knowledge_type) => setDraft({ ...draft, knowledge_type: knowledge_type as SupportKnowledgeDraft['knowledge_type'] })} options={SUPPORT_KNOWLEDGE_TYPES} language={uiLanguage} /></Field>
          <Field label={copy.status}><SelectField value={draft.status} onChange={(status) => setDraft({ ...draft, status: status as SupportKnowledgeDraft['status'] })} options={allowedStatuses} language={uiLanguage} /></Field>
          <Field label={copy.language}><select value={draft.language} onChange={(event) => setDraft({ ...draft, language: normalizePortalLanguageCode(event.target.value) || FALLBACK_LANGUAGE })} className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm">{PORTAL_LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.flag}</option>)}</select></Field>
          <Field label={copy.access}><SelectField value={draft.access_scope} onChange={(access_scope) => setDraft({ ...draft, access_scope: access_scope as SupportKnowledgeDraft['access_scope'] })} options={SUPPORT_ACCESS_SCOPES} language={uiLanguage} /></Field>
          <Field label={copy.machine}><Input value={draft.machine_id} onChange={(event) => setDraft({ ...draft, machine_id: event.target.value })} /></Field>
          <Field label={copy.productReference}><Input value={draft.product_id} onChange={(event) => setDraft({ ...draft, product_id: event.target.value })} /></Field>
          <Field label={copy.category}><Input value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} /></Field>
          <Field label={copy.keywords}><Input value={draft.keywords.join(', ')} onChange={(event) => setDraft({ ...draft, keywords: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} /></Field>
          <Field label={copy.summary} className="sm:col-span-2"><Textarea value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} rows={2} /></Field>
          <Field label={copy.content} className="sm:col-span-2"><Textarea value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} rows={8} /></Field>
          <Field label={copy.source} className="sm:col-span-2"><Input value={draft.source_reference} onChange={(event) => setDraft({ ...draft, source_reference: event.target.value })} /></Field>
          <Field label={copy.requiredArea}><Input value={draft.required_area} onChange={(event) => setDraft({ ...draft, required_area: event.target.value })} /></Field>
          <Field label={copy.requiredModule}><Input value={draft.required_module} onChange={(event) => setDraft({ ...draft, required_module: event.target.value })} /></Field>
          <Field label={copy.effectiveFrom}><Input type="datetime-local" value={draft.effective_from} onChange={(event) => setDraft({ ...draft, effective_from: event.target.value })} /></Field>
          <Field label={copy.effectiveUntil}><Input type="datetime-local" value={draft.effective_until} onChange={(event) => setDraft({ ...draft, effective_until: event.target.value })} /></Field>
          <Field label={copy.nextReview}><Input type="datetime-local" value={draft.next_review_at} onChange={(event) => setDraft({ ...draft, next_review_at: event.target.value })} /></Field>
        </div>
        {item && <KnowledgeSourcesPanel item={item} />}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{copy.cancel}</Button>
          <Button onClick={() => void save()} disabled={saving || !draft.title.trim()}>{saving ? copy.loading : copy.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return <div className={className}><Label className="mb-1.5 block text-xs text-slate-600">{label}</Label>{children}</div>;
}

function SelectField({ value, onChange, options, language }: { value: string; onChange: (value: string) => void; options: readonly string[]; language: Parameters<typeof supportAdminCodeLabel>[0] }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm">{options.map((option) => <option key={option} value={option}>{supportAdminCodeLabel(language, option)}</option>)}</select>;
}

function KnowledgePanel({ externalDraft, clearExternalDraft }: { externalDraft: SupportKnowledgeDraft | null; clearExternalDraft: () => void }) {
  const { uiLanguage } = useLanguage();
  const copy = getSupportAdminCopy(uiLanguage);
  const [filters, setFilters] = useState<SupportKnowledgeFilters>({});
  const [rows, setRows] = useState<SupportKnowledgeItem[]>([]);
  const [editing, setEditing] = useState<SupportKnowledgeItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRows(await fetchSupportKnowledgeItems(filters)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setLoading(false); }
  }, [filters]);
  useEffect(() => { void load(); }, [load]);
  const closeEditor = () => { setEditing(null); setCreating(false); clearExternalDraft(); };
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-white p-4 lg:flex-row lg:items-end">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterInput label={copy.search} value={filters.search || ''} onChange={(search) => setFilters({ ...filters, search })} />
          <FilterSelect label={copy.status} value={filters.status || ''} onChange={(status) => setFilters({ ...filters, status: status as SupportKnowledgeFilters['status'] || undefined })} options={SUPPORT_KNOWLEDGE_STATUSES} allLabel={copy.all} />
          <FilterSelect label={copy.type} value={filters.type || ''} onChange={(type) => setFilters({ ...filters, type: type as SupportKnowledgeFilters['type'] || undefined })} options={SUPPORT_KNOWLEDGE_TYPES} allLabel={copy.all} />
          <FilterSelect label={copy.access} value={filters.accessScope || ''} onChange={(accessScope) => setFilters({ ...filters, accessScope: accessScope as SupportKnowledgeFilters['accessScope'] || undefined })} options={SUPPORT_ACCESS_SCOPES} allLabel={copy.all} />
          <FilterInput label={copy.machine} value={filters.machineId || ''} onChange={(machineId) => setFilters({ ...filters, machineId })} />
          <FilterInput label={copy.category} value={filters.category || ''} onChange={(category) => setFilters({ ...filters, category })} />
          <FilterSelect label={copy.language} value={filters.language || ''} onChange={(language) => setFilters({ ...filters, language })} options={PORTAL_LANGUAGES.map((language) => language.code)} allLabel={copy.all} getOptionLabel={portalLanguageDisplayCode} />
        </div>
        <Button onClick={() => setCreating(true)}><Plus className="mr-2 h-4 w-4" />{copy.newKnowledge}</Button>
      </div>
      <LoadBoundary loading={loading} error={error} retry={() => void load()}>
        {rows.length === 0 ? <EmptyState icon={BookOpen} title={copy.noKnowledge} /> : (
          <div className="grid gap-3 lg:grid-cols-2">
            {rows.map((item) => (
              <article key={item.id} className="rounded-md border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><h3 className="truncate font-semibold text-slate-950">{item.title}</h3><p className="mt-1 text-xs text-slate-500">{supportAdminCodeLabel(uiLanguage, item.knowledge_type)} · {portalLanguageDisplayCode(item.language)} · {copy.version} {item.version_number}</p>{item.next_review_at && <p className={cn('mt-1 text-xs', new Date(item.next_review_at) < new Date() ? 'font-medium text-amber-700' : 'text-slate-500')}>{copy.nextReview}: {formatDate(item.next_review_at, uiLanguage)}</p>}</div>
                  <StatusPill value={item.status} language={uiLanguage} />
                </div>
                <p className="mt-3 line-clamp-2 text-sm text-slate-600">{item.summary || item.content || '—'}</p>
                <div className="mt-4 flex items-center justify-between gap-3"><span className="text-xs text-slate-500">{supportAdminCodeLabel(uiLanguage, item.access_scope)} · {formatDate(item.updated_at, uiLanguage)}</span><Button variant="ghost" size="sm" onClick={() => setEditing(item)}><Pencil className="mr-2 h-4 w-4" />{copy.edit}</Button></div>
              </article>
            ))}
          </div>
        )}
      </LoadBoundary>
      <KnowledgeEditor item={editing} initialDraft={externalDraft || (creating ? EMPTY_KNOWLEDGE_DRAFT : null)} onClose={closeEditor} onSaved={() => { closeEditor(); void load(); }} />
    </div>
  );
}

export function ObservabilityPanel({ overview, reload, loading, error }: { overview: SupportAdminOverview; reload: () => void; loading: boolean; error: string | null }) {
  const { uiLanguage } = useLanguage();
  const copy = getSupportAdminCopy(uiLanguage);
  return (
    <LoadBoundary loading={loading} error={error} retry={reload}>
      <div className="space-y-5">
        <div className="grid overflow-hidden rounded-md border border-slate-200 bg-white sm:grid-cols-2 xl:grid-cols-4">
          <Metric label={copy.totalRequests} value={overview.total_requests} icon={Activity} />
          <Metric label={copy.successfulRequests} value={overview.successful_requests} icon={CheckCircle2} />
          <Metric label={copy.failedRequests} value={overview.failed_requests} icon={XCircle} />
          <Metric label={copy.p95Latency} value={formatLatency(overview.p95_latency_ms)} icon={Gauge} />
        </div>
        <div className="grid overflow-hidden rounded-md border border-slate-200 bg-white sm:grid-cols-2 xl:grid-cols-4">
          <Metric label={copy.inputTokens} value={overview.total_input_tokens} icon={BarChart3} />
          <Metric label={copy.outputTokens} value={overview.total_output_tokens} icon={BarChart3} />
          <Metric label={copy.cachedTokens} value={overview.total_cached_tokens} icon={BarChart3} />
          <Metric label={copy.estimatedCost} value={overview.estimated_cost ? String(overview.estimated_cost) : '0'} icon={Gauge} />
        </div>
        <div className="grid overflow-hidden rounded-md border border-slate-200 bg-white sm:grid-cols-2 xl:grid-cols-5">
          <Metric label={copy.confidenceHigh} value={overview.confidence_high} icon={ShieldCheck} />
          <Metric label={copy.confidenceMedium} value={overview.confidence_medium} icon={Gauge} />
          <Metric label={copy.confidenceLow} value={overview.confidence_low} icon={AlertTriangle} />
          <Metric label={copy.confidenceNone} value={overview.confidence_none} icon={XCircle} />
          <Metric label={copy.confidenceUnknown} value={overview.confidence_unknown} icon={Clock3} />
        </div>
        <div className="grid overflow-hidden rounded-md border border-slate-200 bg-white sm:grid-cols-2 xl:grid-cols-4">
          <Metric label={copy.clarificationRequests} value={overview.clarification_requests} icon={MessageSquare} />
          <Metric label={copy.sourceConflicts} value={overview.source_conflicts} icon={AlertTriangle} />
          <Metric label={copy.staleKnowledgeBlocks} value={overview.stale_knowledge_blocks} icon={Clock3} />
          <Metric label={copy.overdueReviews} value={overview.overdue_reviews} icon={BookOpen} />
        </div>
        {overview.total_requests === 0 && (
          <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">{copy.zeroStateHint}</div>
        )}
      </div>
    </LoadBoundary>
  );
}

export default function BackendAiSupportPage() {
  const { appUser, loading: userLoading, logout } = useAppUser();
  const { language, uiLanguage, setLanguage } = useLanguage();
  const { effectiveUser, resolving } = useEffectivePortalUserState(appUser);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get('tab') as SupportAdminTab | null;
  const activeTab = requestedTab && TAB_IDS.includes(requestedTab) ? requestedTab : 'overview';
  const [serverAllowed, setServerAllowed] = useState<boolean | null>(null);
  const [overview, setOverview] = useState(EMPTY_SUPPORT_ADMIN_OVERVIEW);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [knowledgeDraft, setKnowledgeDraft] = useState<SupportKnowledgeDraft | null>(null);
  const copy = getSupportAdminCopy(uiLanguage);
  const clientAllowed = canAccessSupport(effectiveUser);

  useEffect(() => {
    let cancelled = false;
    if (userLoading || resolving) return;
    if (!clientAllowed) { setServerAllowed(false); return; }
    setServerAllowed(null);
    verifySupportAccess(effectiveUser).then((allowed) => { if (!cancelled) setServerAllowed(allowed); });
    return () => { cancelled = true; };
  }, [clientAllowed, effectiveUser, resolving, userLoading]);

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true); setOverviewError(null);
    try { setOverview(await fetchSupportAdminOverview()); }
    catch (reason) { setOverviewError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setOverviewLoading(false); }
  }, []);

  useEffect(() => {
    if (serverAllowed && (activeTab === 'overview' || activeTab === 'observability')) void loadOverview();
  }, [activeTab, loadOverview, serverAllowed]);

  const tabs = useMemo(() => [
    { id: 'overview' as const, label: copy.overview, icon: BarChart3 },
    { id: 'questions' as const, label: copy.questions, icon: MessageSquare },
    { id: 'unanswered' as const, label: copy.unanswered, icon: FileQuestion },
    { id: 'feedback' as const, label: copy.feedback, icon: ThumbsUp },
    { id: 'knowledge' as const, label: copy.knowledgeBase, icon: BookOpen },
    { id: 'evaluation' as const, label: 'Evaluation', icon: ShieldCheck },
    { id: 'observability' as const, label: copy.observability, icon: Activity },
  ], [copy]);

  if (userLoading || resolving || serverAllowed === null) return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">{copy.loading}</div>;
  if (!appUser) return <Navigate to="/portal" replace />;
  if (!clientAllowed || !serverAllowed) return <Navigate to="/portal/backend" replace />;

  const switchTab = (tab: SupportAdminTab) => {
    const next = new URLSearchParams(params);
    next.set('tab', tab);
    setParams(next, { replace: true });
  };
  const openGapDraft = (draft: SupportKnowledgeDraft) => { setKnowledgeDraft(draft); switchTab('knowledge'); };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader user={appUser} language={language} onLanguageChange={setLanguage} onLogout={async () => { await logout(); navigate('/portal', { replace: true }); }} />
      <main className="mx-auto w-full max-w-[1700px] flex-grow px-4 py-8 sm:px-6 lg:px-8 xl:px-12">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-emerald-50 text-emerald-700"><Bot className="h-6 w-6" /></span>
            <div className="min-w-0"><h1 className="text-2xl font-bold text-slate-950 sm:text-3xl">{copy.title}</h1><p className="mt-1 text-sm text-slate-600">{copy.subtitle}</p></div>
          </div>
          <span className="inline-flex w-fit rounded bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">{copy.backendOnly}</span>
        </header>

        <nav className="mb-5 flex max-w-full gap-1 overflow-x-auto border-b border-slate-200" aria-label={copy.title}>
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => switchTab(id)} className={cn('inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-semibold', activeTab === id ? 'border-emerald-700 text-emerald-800' : 'border-transparent text-slate-500 hover:text-slate-900')}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </nav>

        {activeTab === 'overview' && <OverviewPanel overview={overview} reload={() => void loadOverview()} loading={overviewLoading} error={overviewError} />}
        {activeTab === 'questions' && <QuestionsPanel />}
        {activeTab === 'unanswered' && <UnansweredPanel onCreateDraft={openGapDraft} />}
        {activeTab === 'feedback' && <FeedbackPanel />}
        {activeTab === 'knowledge' && <KnowledgePanel externalDraft={knowledgeDraft} clearExternalDraft={() => setKnowledgeDraft(null)} />}
        {activeTab === 'evaluation' && <SupportEvaluationPanel />}
        {activeTab === 'observability' && <ObservabilityPanel overview={overview} reload={() => void loadOverview()} loading={overviewLoading} error={overviewError} />}
      </main>
      <PortalFooter language={language} />
    </div>
  );
}
