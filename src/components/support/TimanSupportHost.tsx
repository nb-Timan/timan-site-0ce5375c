import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowLeft, BookOpen, Bot, ExternalLink, FileText, Loader2, MessageCircle, RotateCcw, Send, Wrench, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { useSupportSession } from '@/hooks/useSupportSession';
import { cn } from '@/lib/utils';
import { t } from '@/lib/i18n/translations';
import { canAccessSupport } from '@/lib/supportAccess';
import { deriveSupportPageContext } from '@/lib/supportContext';
import type { SupportQuickIntent } from '@/lib/supportTypes';
import { useEffectivePortalUserState } from '@/lib/viewAsUser';
import { getActiveMode } from '@/lib/activeMode';
import { AssistantSupportService } from '@/lib/assistantSupportService';
import { supportService } from '@/lib/supportService';
import type { AssistantActionCommand } from '@/lib/supportTypes';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const QUICK_ACTIONS: Array<{
  intent: SupportQuickIntent;
  labelKey: string;
  label?: string;
  prompt: string;
  icon: typeof Wrench;
}> = [
  { intent: 'machine-info', labelKey: 'supportQuickMachineInfo', prompt: 'Timan 3330', icon: Wrench },
  { intent: 'portal-help', labelKey: 'supportQuickPortalHelp', prompt: 'Portal', icon: MessageCircle },
  { intent: 'timan-website', labelKey: 'supportQuickTimanWebsite', prompt: 'Timan.dk', icon: ExternalLink },
  { intent: 'create-quote', labelKey: '', label: 'Opret tilbud', prompt: 'Opret et tilbud', icon: FileText },
];

export default function TimanSupportHost() {
  const { appUser } = useAppUser();
  const { uiLanguage } = useLanguage();
  const { effectiveUser, resolving } = useEffectivePortalUserState(appUser);
  const location = useLocation();
  const context = useMemo(
    () => deriveSupportPageContext(location.pathname, location.search),
    [location.pathname, location.search],
  );
  const isPortalSurface = location.pathname === '/academy'
    || location.pathname.startsWith('/academy/')
    || location.pathname === '/configurator'
    || location.pathname === '/portal'
    || location.pathname.startsWith('/portal/');
  const allowed = isPortalSurface && !resolving && canAccessSupport(effectiveUser);
  const identity = effectiveUser?.email || appUser?.email || 'anonymous';
  const viewAsActive = Boolean(appUser?.email && getActiveMode(appUser.email) !== 'backend');
  const actionService = useMemo(
    () => appUser ? new AssistantSupportService(appUser, supportService) : supportService,
    [appUser],
  );
  const { state, sendMessage, retry } = useSupportSession({
    identity,
    enabled: allowed,
    language: uiLanguage,
    context,
    viewAsActive,
    service: actionService,
  });
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!allowed) setOpen(false);
  }, [allowed]);

  useEffect(() => {
    if (!open) return;
    composerRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (open) messageEndRef.current?.scrollIntoView?.({ block: 'end' });
  }, [open, state.conversation.messages.length, state.status]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') closePanel();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  });

  const closePanel = () => {
    setResetOpen(false);
    setOpen(false);
    window.setTimeout(() => launcherRef.current?.focus(), 0);
  };

  const submit = async (content = draft, intent?: SupportQuickIntent, command?: AssistantActionCommand) => {
    if (!content.trim() || state.status === 'sending') return;
    setDraft('');
    await sendMessage(content, intent, command);
  };

  const workflow = state.conversation.workflowState;
  const activeWorkflow = Boolean(
    workflow.workflowId
      && ['DRAFT', 'READY', 'QUOTE_CREATED', 'PDF_GENERATED', 'EMAIL_PREPARED'].includes(String(workflow.status)),
  );

  const requestReset = () => {
    if (workflow.hasMeaningfulChoices) setResetOpen(true);
    else void submit(t('supportWorkflowReset', uiLanguage), undefined, { type: 'reset_workflow' });
  };

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    if (window.matchMedia('(min-width: 640px)').matches) {
      event.preventDefault();
      void submit();
    }
  };

  if (!allowed) return null;

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        aria-label={t('supportLauncherLabel', uiLanguage)}
        aria-expanded={open}
        aria-controls="timan-support-panel"
        onClick={() => setOpen(true)}
        className={cn(
          'fixed z-40 grid h-12 w-12 place-items-center rounded-full bg-emerald-700 text-white shadow-lg transition hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2',
          'bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-4 sm:bottom-5 sm:right-5',
          open && 'pointer-events-none opacity-0',
        )}
      >
        <MessageCircle className="h-5 w-5" aria-hidden="true" />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label={t('supportCloseLabel', uiLanguage)}
            className="fixed inset-0 z-40 bg-black/25 sm:hidden"
            onClick={closePanel}
          />
          <section
            id="timan-support-panel"
            role="dialog"
            aria-label={t('supportTitle', uiLanguage)}
            className={cn(
              'fixed z-50 flex min-h-0 flex-col overflow-hidden border border-slate-200 bg-white shadow-2xl',
              'inset-x-0 bottom-0 h-[min(88dvh,46rem)] rounded-t-2xl pb-[env(safe-area-inset-bottom)]',
              'sm:inset-auto sm:bottom-20 sm:right-5 sm:h-[min(42rem,calc(100dvh-7rem))] sm:w-[420px] sm:rounded-lg sm:pb-0',
            )}
          >
            <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-emerald-50 text-emerald-700">
                  <Bot className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-slate-950">{t('supportTitle', uiLanguage)}</h2>
                  <span className="inline-flex rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                    {t('supportBackendOnly', uiLanguage)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                aria-label={t('supportCloseLabel', uiLanguage)}
                onClick={closePanel}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </header>

            {activeWorkflow && (
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
                <button
                  type="button"
                  disabled={!workflow.canGoBack || state.status === 'sending'}
                  onClick={() => void submit(t('supportWorkflowBack', uiLanguage), undefined, { type: 'workflow_back' })}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-slate-700 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  {t('supportWorkflowBack', uiLanguage)}
                </button>
                <button
                  type="button"
                  disabled={state.status === 'sending'}
                  onClick={requestReset}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  {t('supportWorkflowReset', uiLanguage)}
                </button>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
              {state.conversation.messages.length === 0 && (
                <div className="space-y-4">
                  <p className="text-sm leading-6 text-slate-700">{t('supportWelcome', uiLanguage)}</p>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_ACTIONS.map(({ intent, labelKey, label, prompt, icon: Icon }) => (
                      <button
                        key={intent}
                        type="button"
                        onClick={() => void submit(prompt, intent)}
                        className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                      >
                        <Icon className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                        {label || t(labelKey, uiLanguage)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {state.conversation.messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}
                  >
                    <div
                      className={cn(
                        'max-w-[88%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm leading-5',
                        message.role === 'user'
                          ? 'bg-emerald-700 text-white'
                          : 'border border-slate-200 bg-slate-50 text-slate-800',
                        message.status === 'error' && 'ring-2 ring-red-200',
                      )}
                    >
                      {message.content}
                      {message.role === 'assistant' && message.actionCard && (
                        <div className="mt-3 border-t border-slate-200 pt-3">
                          <div className="text-xs font-semibold text-slate-900">{message.actionCard.title}</div>
                          {message.actionCard.warning && (
                            <p className="mt-1 text-xs leading-4 text-red-700">{message.actionCard.warning}</p>
                          )}
                          {message.actionCard.lines && message.actionCard.lines.length > 0 && (
                            <dl className="mt-2 space-y-1.5">
                              {message.actionCard.lines.map((line) => (
                                <div key={`${line.label}-${line.value}`} className="flex items-start justify-between gap-3 text-xs">
                                  <dt className="text-slate-500">{line.label}</dt>
                                  <dd className="text-right font-medium text-slate-900">{line.value}</dd>
                                </div>
                              ))}
                            </dl>
                          )}
                          {message.actionCard.choices && message.actionCard.choices.length > 0 && (
                            <div className="mt-3 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                              {message.actionCard.choices.map((choice) => (
                                <button
                                  key={choice.id}
                                  type="button"
                                  disabled={state.status === 'sending'}
                                  onClick={() => void submit(choice.label, undefined, choice.command)}
                                  className={cn(
                                    'min-h-9 w-full rounded-md border px-2.5 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-50 sm:w-auto',
                                    choice.emphasis === 'danger'
                                      ? 'border-red-600 bg-red-600 text-white hover:bg-red-700'
                                      : choice.emphasis === 'primary'
                                        ? 'border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800'
                                        : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100',
                                  )}
                                >
                                  {choice.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {message.role === 'assistant' && message.citations && message.citations.length > 0 && (
                        <div className="mt-3 border-t border-slate-200 pt-2">
                          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                            {t('supportSourcesLabel', uiLanguage)}
                          </div>
                          <ul className="space-y-1.5">
                            {message.citations.map((citation) => (
                              <li key={citation.id} className="break-words text-xs leading-4 text-slate-600">
                                {citation.label} <span className="uppercase text-slate-400">({citation.language})</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {state.status === 'sending' && (
                <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  {t('supportSending', uiLanguage)}
                </div>
              )}

              {state.status === 'error' && (
                <div role="alert" className="mt-3 flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  <span>{t(state.error || 'supportError', uiLanguage)}</span>
                  <button
                    type="button"
                    onClick={() => void retry()}
                    className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md px-2 font-medium hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    {t('supportRetry', uiLanguage)}
                  </button>
                </div>
              )}
              <div ref={messageEndRef} />
            </div>

            <form
              className="flex shrink-0 items-end gap-2 border-t border-slate-200 bg-white p-3"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <textarea
                ref={composerRef}
                value={draft}
                rows={1}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onComposerKeyDown}
                placeholder={t('supportPlaceholder', uiLanguage)}
                className="max-h-28 min-h-11 min-w-0 flex-1 resize-none rounded-md border border-slate-300 px-3 py-2.5 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 sm:text-sm"
              />
              <button
                type="submit"
                disabled={!draft.trim() || state.status === 'sending'}
                aria-label={t('supportSendLabel', uiLanguage)}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-emerald-700 text-white hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
              </button>
            </form>
          </section>
          <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
            <AlertDialogContent className="w-[calc(100%-2rem)] max-w-md rounded-lg">
              <AlertDialogHeader>
                <AlertDialogTitle>{t('supportWorkflowResetTitle', uiLanguage)}</AlertDialogTitle>
                <AlertDialogDescription>{t('supportWorkflowResetDescription', uiLanguage)}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('supportWorkflowCancel', uiLanguage)}</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-red-600 text-white hover:bg-red-700"
                  onClick={() => void submit(t('supportWorkflowReset', uiLanguage), undefined, { type: 'reset_workflow' })}
                >
                  {t('supportWorkflowReset', uiLanguage)}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </>
  );
}
