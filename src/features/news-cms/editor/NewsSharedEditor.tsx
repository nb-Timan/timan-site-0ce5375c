import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Eye, FileCheck2, Languages, Save, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n/translations';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import { PORTAL_LANGUAGES } from '@/lib/portalLanguages';
import { NEWS_TEMPLATE_REGISTRY, getNewsTemplate, isNewsTemplateId } from '@/features/news-cms/templates/registry';
import type { LocalizedNewsContent, NewsTemplateId } from '@/features/news-cms/templates/types';
import {
  emptyLocalizedContent,
  mergeSharedNewsFields,
  missingNewsLanguages,
  missingTranslationFields,
  updateCtaLinksField,
  updateFeatureBlocksField,
  updateTechBlocksField,
  updateSpecRowsField,
  updateLocalizedNewsField,
  updateSharedNewsField,
  updateFlyerPagesField,
} from '@/features/news-cms/lib/newsContent';
import { translateMissingNewsContent } from '@/features/news-cms/lib/newsAutoTranslate';
import type { NewsCmsPost } from '@/lib/newsService';
import NewsTemplatePicker from './NewsTemplatePicker';
import NewsFieldEditor from './NewsFieldEditor';
import NewsPreviewPane from './NewsPreviewPane';
import NewsRenderSurface from './NewsRenderSurface';
import {
  getAttachmentOptionsForMachine,
  getNewsAttachmentLabel,
  getNewsMachineLabel,
  NEWS_MACHINE_FILTER_TARGETS,
  NEWS_TOPIC_UI_TEXT,
  normalizeNewsTopicData,
} from '@/features/news-cms/lib/newsTaxonomy';

type StepId = 1 | 2 | 3 | 4 | 5;

interface Props {
  uiLanguage: PortalUiLanguage;
  initialPost?: NewsCmsPost | null;
  onCancel?: () => void;
  onSaveDraft: (payload: { id?: string; templateId: NewsTemplateId; localizedContent: LocalizedNewsContent; templateData: Record<string, unknown> }) => Promise<void>;
  onPublish: (payload: { id?: string; templateId: NewsTemplateId; localizedContent: LocalizedNewsContent; templateData: Record<string, unknown> }) => Promise<void>;
  saving?: boolean;
}

const STEPS: Array<{ id: StepId; key: string }> = [
  { id: 1, key: 'newsCmsStepTemplate' },
  { id: 2, key: 'newsCmsStepContent' },
  { id: 3, key: 'newsCmsStepPreview' },
  { id: 4, key: 'newsCmsStepSave' },
  { id: 5, key: 'newsCmsStepPublish' },
];

function stepTitle(step: StepId, lang: PortalUiLanguage) {
  return t(STEPS.find((item) => item.id === step)?.key || 'newsCmsStepTemplate', lang);
}

function Stepper({ step, lang }: { step: StepId; lang: PortalUiLanguage }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {STEPS.map((item, index) => {
        const done = item.id < step;
        const active = item.id === step;
        return (
          <div key={item.id} className="flex items-center gap-2">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${
                done || active ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {done ? <Check className="h-4 w-4" /> : item.id}
            </span>
            <span className={`text-xs font-bold ${active ? 'text-emerald-700' : 'text-slate-500'}`}>{t(item.key, lang)}</span>
            {index < STEPS.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-slate-300" />}
          </div>
        );
      })}
    </div>
  );
}

export default function NewsSharedEditor({ uiLanguage, initialPost, onCancel, onSaveDraft, onPublish, saving = false }: Props) {
  const [step, setStep] = useState<StepId>(1);
  const [savedOnce, setSavedOnce] = useState(false);
  const [templateId, setTemplateId] = useState<NewsTemplateId>(
    isNewsTemplateId(initialPost?.template_id) ? initialPost.template_id : NEWS_TEMPLATE_REGISTRY[0].id,
  );
  // The global portal language (top navigation) is the single source of truth
  // for both the CMS interface and the content language being edited.
  const editLanguage: PortalUiLanguage = uiLanguage;
  const [localizedContent, setLocalizedContent] = useState<LocalizedNewsContent>(() => initialPost?.localized_content || emptyLocalizedContent());
  const [templateData, setTemplateData] = useState<Record<string, unknown>>(() => initialPost?.template_data || {});
  const [translateStatus, setTranslateStatus] = useState<string | null>(null);

  useEffect(() => {
    setStep(1);
    setSavedOnce(false);
    setTemplateId(isNewsTemplateId(initialPost?.template_id) ? initialPost.template_id : NEWS_TEMPLATE_REGISTRY[0].id);
    setLocalizedContent(initialPost?.localized_content || emptyLocalizedContent());
    setTemplateData(initialPost?.template_data || {});
    setTranslateStatus(null);
  }, [initialPost?.id]);

  const template = getNewsTemplate(templateId);
  const activeContent = useMemo(
    () => mergeSharedNewsFields(localizedContent, editLanguage, template.fields),
    [localizedContent, editLanguage, template.fields],
  );
  const missingFields = useMemo(
    () => missingTranslationFields(localizedContent, editLanguage, template.fields),
    [localizedContent, editLanguage, template.fields],
  );
  const missingLanguages = useMemo(
    () => missingNewsLanguages(localizedContent, template.fields),
    [localizedContent, template.fields],
  );
  const [publishWarning, setPublishWarning] = useState<string | null>(null);
  const contentLanguageLabel =
    PORTAL_LANGUAGES.find((option) => option.code === editLanguage)?.label || editLanguage.toUpperCase();
  const missingLanguageLabels = missingLanguages
    .map((code) => PORTAL_LANGUAGES.find((option) => option.code === code)?.flag || code.toUpperCase())
    .join(', ');
  const validation = template.validate(activeContent);
  const canPublish = validation.valid;
  const newsTopic = normalizeNewsTopicData(templateData.news_topic);
  const attachmentOptions = getAttachmentOptionsForMachine(newsTopic.target);

  const updateNewsTopic = (patch: Partial<typeof newsTopic>) => {
    setTemplateData((current) => {
      const nextTarget = patch.target || newsTopic.target;
      if (nextTarget === 'diverse') {
        return {
          ...current,
          news_topic: normalizeNewsTopicData({ type: 'misc', target: 'diverse' }),
        };
      }

      const allowedAttachments = getAttachmentOptionsForMachine(nextTarget);
      const requestedAttachment = Object.prototype.hasOwnProperty.call(patch, 'attachment')
        ? patch.attachment
        : newsTopic.attachment;
      const nextAttachment = requestedAttachment && allowedAttachments.some((option) => option.value === requestedAttachment)
        ? requestedAttachment
        : undefined;
      return {
        ...current,
        news_topic: normalizeNewsTopicData({
          ...newsTopic,
          ...patch,
          type: 'machine',
          target: nextTarget,
          attachment: nextAttachment,
        }),
      };
    });
  };

  const saveDraft = async () => {
    const translationResult = translateMissingNewsContent(localizedContent, template.fields, editLanguage, initialPost?.localized_content);
    const contentToSave = translationResult.localizedContent;
    if (translationResult.translatedLanguages.length > 0) {
      setLocalizedContent(contentToSave);
      const labels = translationResult.translatedLanguages
        .map((code) => PORTAL_LANGUAGES.find((option) => option.code === code)?.flag || code.toUpperCase())
        .join(', ');
      setTranslateStatus(`${t('newsCmsTranslateMissingDone', uiLanguage)} ${labels}`);
    }
    setPublishWarning(null);
    await onSaveDraft({ id: initialPost?.id, templateId, localizedContent: contentToSave, templateData });
    setSavedOnce(true);
  };

  const publish = async () => {
    if (!validation.valid) {
      setPublishWarning(validation.issues.map((issue) => t(issue.messageKey, uiLanguage)).join(', '));
      return;
    }

    const translationResult = translateMissingNewsContent(localizedContent, template.fields, editLanguage, initialPost?.localized_content);
    const contentToPublish = translationResult.localizedContent;
    const remainingMissingLanguages = missingNewsLanguages(contentToPublish, template.fields);

    if (remainingMissingLanguages.length > 0) {
      const labels = remainingMissingLanguages
        .map((code) => PORTAL_LANGUAGES.find((option) => option.code === code)?.flag || code.toUpperCase())
        .join(', ');
      setPublishWarning(`${t('newsCmsPublishBlockedTranslations', uiLanguage)} ${labels}`);
      return;
    }

    if (translationResult.translatedLanguages.length) {
      setLocalizedContent(contentToPublish);
      const labels = translationResult.translatedLanguages
        .map((code) => PORTAL_LANGUAGES.find((option) => option.code === code)?.flag || code.toUpperCase())
        .join(', ');
      setTranslateStatus(`${t('newsCmsTranslateMissingDone', uiLanguage)} ${labels}`);
    }

    setPublishWarning(null);
    await onPublish({ id: initialPost?.id, templateId, localizedContent: contentToPublish, templateData });
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{initialPost ? t('newsCmsEditNews', uiLanguage) : t('newsCmsCreateCardTitle', uiLanguage)}</h2>
            <p className="mt-1 text-sm text-slate-500">{t('newsCmsWorkflowHelp', uiLanguage)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                {t('cancel', uiLanguage)}
              </Button>
            )}
            <Button type="button" variant="outline" disabled={saving} onClick={saveDraft}>
              <Save className="mr-2 h-4 w-4" />
              {t('newsCmsSaveDraft', uiLanguage)}
            </Button>
            <Button type="button" disabled={saving || (step > 1 && !validation.valid)} onClick={() => (step < 5 ? setStep((step + 1) as StepId) : publish())}>
              {step < 5 ? `${t('next', uiLanguage)}: ${stepTitle((step + 1) as StepId, uiLanguage)}` : t('newsCmsPublish', uiLanguage)}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
        <Stepper step={step} lang={uiLanguage} />
      </section>

      {step === 1 && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-bold text-slate-900">{t('newsCmsChooseTemplate', uiLanguage)}</h3>
            <p className="mb-4 text-sm text-slate-500">{t('newsCmsChooseTemplateHelp', uiLanguage)}</p>
            <NewsTemplatePicker lang={uiLanguage} selectedId={templateId} onSelect={setTemplateId} compact />
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Template {template.number} - {t(template.nameKey, uiLanguage)}</h3>
                <p className="text-sm text-slate-500">{t('newsCmsTemplateFixedHelp', uiLanguage)}</p>
              </div>
              <div className="flex flex-wrap gap-3 text-xs font-semibold">
                <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">{t('newsCmsFixedElement', uiLanguage)}</span>
                <span className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1 text-rose-700">{t('newsCmsEditableContent', uiLanguage)}</span>
              </div>
            </div>
            <NewsRenderSurface lang={uiLanguage} template={template} content={activeContent} mode="editor" />
          </section>
        </div>
      )}

      {step === 2 && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">{t('newsCmsFillFields', uiLanguage)}</h3>
                <p className="text-sm text-slate-500">Template {template.number} - {t(template.nameKey, uiLanguage)}</p>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <Languages className="h-4 w-4 text-slate-400" />
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('newsCmsContentLanguage', uiLanguage)}:</span>
                <span className="font-semibold text-slate-900">{contentLanguageLabel}</span>
              </div>
            </div>

            <p className="mb-3 text-xs text-slate-500">{t('newsCmsContentLanguageHelp', uiLanguage)}</p>

            {missingFields.length > 0 ? (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p className="flex items-center gap-2 font-bold">
                  <AlertTriangle className="h-4 w-4" />
                  {t('newsCmsTranslationMissing', uiLanguage)} {contentLanguageLabel}
                </p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-amber-800">{t('newsCmsTranslationMissingFields', uiLanguage)}</p>
                <p className="mt-1 text-xs">{missingFields.map((field) => t(field.labelKey, uiLanguage)).join(', ')}</p>
              </div>
            ) : (
              <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800">
                {t('newsCmsTranslationComplete', uiLanguage)}
              </div>
            )}
            <p className="mb-4 text-xs text-slate-400">{t('newsCmsSharedAcrossLanguages', uiLanguage)}</p>
            {translateStatus && (
              <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 text-xs font-semibold text-emerald-900">
                {translateStatus}
              </div>
            )}
            {missingLanguages.length > 0 && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                <span className="font-bold">{t('newsCmsPublishAutoTranslate', uiLanguage)}</span> {missingLanguageLabels}
              </div>
            )}

            <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{NEWS_TOPIC_UI_TEXT.panelTitle[uiLanguage]}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {NEWS_TOPIC_UI_TEXT.panelDescription[uiLanguage]}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase text-slate-500">{NEWS_TOPIC_UI_TEXT.machineLabel[uiLanguage]}</span>
                  <select
                    value={newsTopic.target}
                    onChange={(event) => updateNewsTopic({ target: event.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    {NEWS_MACHINE_FILTER_TARGETS.map((option) => (
                      <option key={option.value} value={option.value}>{option.labels[uiLanguage]}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase text-slate-500">{NEWS_TOPIC_UI_TEXT.attachmentLabel[uiLanguage]}</span>
                  <select
                    value={newsTopic.attachment || ''}
                    onChange={(event) => updateNewsTopic({ attachment: event.target.value || undefined })}
                    disabled={attachmentOptions.length === 0}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">{NEWS_TOPIC_UI_TEXT.noAttachmentLabel[uiLanguage]}</option>
                    {attachmentOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.labels[uiLanguage]}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-3 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                {NEWS_TOPIC_UI_TEXT.machineLabel[uiLanguage]}: {getNewsMachineLabel(newsTopic, uiLanguage)}
                {getNewsAttachmentLabel(newsTopic, uiLanguage) ? ` - ${NEWS_TOPIC_UI_TEXT.attachmentLabel[uiLanguage]}: ${getNewsAttachmentLabel(newsTopic, uiLanguage)}` : ''}
              </div>
            </div>

            <div className="space-y-4">
              {template.fields.map((field) => (
                <NewsFieldEditor
                  key={field.key}
                  lang={uiLanguage}
                  field={field}
                  value={activeContent[field.key]}
                  content={activeContent}
                  onMetaChange={(fieldKey, value) =>
                    setLocalizedContent((current) => updateSharedNewsField(current, fieldKey, value))
                  }
                  onChange={(value) =>
                    setLocalizedContent((current) => {
                      if (field.type === 'featureBlocks') {
                        return updateFeatureBlocksField(current, editLanguage, field.key, (value as Array<Record<string, unknown>>) || []);
                      }
                      if (field.type === 'techBlocks') {
                        return updateTechBlocksField(current, editLanguage, field.key, (value as Array<Record<string, unknown>>) || []);
                      }
                      if (field.type === 'specRows') {
                        return updateSpecRowsField(current, editLanguage, field.key, (value as Array<Record<string, unknown>>) || []);
                      }
                      if (field.type === 'flyerPages') {
                        return updateFlyerPagesField(current, editLanguage, field.key, (value as Array<Record<string, unknown>>) || []);
                      }
                      if (field.type === 'ctaLinks') {
                        return updateCtaLinksField(current, editLanguage, field.key, (value as Array<Record<string, unknown>>) || []);
                      }
                      return ['text', 'textarea', 'richtext'].includes(field.type)
                        ? updateLocalizedNewsField(current, editLanguage, field.key, value)
                        : updateSharedNewsField(current, field.key, value);
                    })
                  }
                />
              ))}
            </div>

            {!validation.valid && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {validation.issues.map((issue) => (
                  <div key={`${issue.fieldKey}-${issue.messageKey}`}>
                    {t(issue.messageKey, uiLanguage)}: {t(template.fields.find((field) => field.key === issue.fieldKey)?.labelKey || issue.fieldKey, uiLanguage)}
                  </div>
                ))}
              </div>
            )}
          </section>
          <NewsPreviewPane lang={editLanguage} template={template} content={activeContent} />
        </div>
      )}

      {step === 3 && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-bold text-slate-900">{t('newsCmsPreviewNews', uiLanguage)}</h3>
            <p className="mt-1 text-sm text-slate-500">{t('newsCmsPreviewHelp', uiLanguage)}</p>
            <div className="mt-5 space-y-4 rounded-xl border border-slate-200 p-4 text-sm">
              <div><span className="block text-xs font-bold uppercase text-slate-400">{t('newsCmsColumnTemplate', uiLanguage)}</span>{t(template.nameKey, uiLanguage)}</div>
              <div><span className="block text-xs font-bold uppercase text-slate-400">{t('newsCmsContentLanguage', uiLanguage)}</span>{contentLanguageLabel}</div>
              <div><span className="block text-xs font-bold uppercase text-slate-400">{t('newsCmsColumnStatus', uiLanguage)}</span>{t('newsCmsStatusDraft', uiLanguage)}</div>
            </div>
          </aside>
          <NewsPreviewPane lang={editLanguage} template={template} content={activeContent} />
        </div>
      )}

      {step === 4 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="max-w-2xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50">
              <FileCheck2 className="h-6 w-6 text-emerald-700" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">{t('newsCmsStepSaveTitle', uiLanguage)}</h3>
            <p className="mt-2 text-sm text-slate-600">{t('newsCmsStepSaveHelp', uiLanguage)}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button type="button" variant="outline" disabled={saving} onClick={saveDraft}>
                <Save className="mr-2 h-4 w-4" />
                {savedOnce ? t('newsCmsDraftSaved', uiLanguage) : t('newsCmsSaveDraft', uiLanguage)}
              </Button>
              <Button type="button" disabled={saving || !validation.valid} onClick={() => setStep(5)}>
                {t('next', uiLanguage)}: {t('newsCmsStepPublish', uiLanguage)}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>
      )}

      {step === 5 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="max-w-2xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50">
              <Send className="h-6 w-6 text-emerald-700" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">{t('newsCmsStepPublishTitle', uiLanguage)}</h3>
            <p className="mt-2 text-sm text-slate-600">{t('newsCmsStepPublishHelp', uiLanguage)}</p>
            {missingLanguages.length > 0 && (
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p className="font-bold">{t('newsCmsPublishAutoTranslate', uiLanguage)}</p>
                <p className="mt-1">{missingLanguageLabels}</p>
              </div>
            )}
            {publishWarning && (
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {publishWarning}
              </div>
            )}
            <div className="mt-5 flex flex-wrap gap-3">
              <Button type="button" variant="outline" onClick={() => setStep(3)}>
                <Eye className="mr-2 h-4 w-4" />
                {t('newsCmsPreview', uiLanguage)}
              </Button>
              <Button type="button" disabled={saving || !canPublish} onClick={publish}>
                <Send className="mr-2 h-4 w-4" />
                {t('newsCmsPublish', uiLanguage)}
              </Button>
            </div>
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <Button type="button" variant="outline" disabled={step === 1} onClick={() => setStep((step - 1) as StepId)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('previous', uiLanguage)}
        </Button>
        <Button type="button" disabled={saving || (step > 1 && !validation.valid) || (step === 5 && !canPublish)} onClick={() => (step < 5 ? setStep((step + 1) as StepId) : publish())}>
          {step < 5 ? `${t('next', uiLanguage)}: ${stepTitle((step + 1) as StepId, uiLanguage)}` : t('newsCmsPublish', uiLanguage)}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
