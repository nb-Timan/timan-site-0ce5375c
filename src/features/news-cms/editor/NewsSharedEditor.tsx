import { useMemo, useState } from 'react';
import { Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n/translations';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import { PORTAL_LANGUAGES } from '@/lib/portalLanguages';
import { NEWS_TEMPLATE_REGISTRY, getNewsTemplate } from '@/features/news-cms/templates/registry';
import type { LocalizedNewsContent, NewsTemplateId } from '@/features/news-cms/templates/types';
import { emptyLocalizedContent, getLocalizedNewsContent, updateLocalizedNewsField } from '@/features/news-cms/lib/newsContent';
import NewsTemplatePicker from './NewsTemplatePicker';
import NewsFieldEditor from './NewsFieldEditor';
import NewsPreviewPane from './NewsPreviewPane';

interface Props {
  uiLanguage: PortalUiLanguage;
  onSaveDraft: (payload: { templateId: NewsTemplateId; localizedContent: LocalizedNewsContent }) => Promise<void>;
  onPublish: (payload: { templateId: NewsTemplateId; localizedContent: LocalizedNewsContent }) => Promise<void>;
  saving?: boolean;
}

export default function NewsSharedEditor({ uiLanguage, onSaveDraft, onPublish, saving = false }: Props) {
  const [templateId, setTemplateId] = useState<NewsTemplateId>(NEWS_TEMPLATE_REGISTRY[0].id);
  const [editLanguage, setEditLanguage] = useState<PortalUiLanguage>(uiLanguage);
  const [localizedContent, setLocalizedContent] = useState<LocalizedNewsContent>(() => emptyLocalizedContent());
  const template = getNewsTemplate(templateId);
  const activeContent = useMemo(() => getLocalizedNewsContent(localizedContent, editLanguage), [localizedContent, editLanguage]);
  const validation = template.validate(activeContent);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-base font-bold text-slate-900">{t('newsCmsChooseTemplate', uiLanguage)}</h2>
          <p className="text-sm text-slate-500">{t('newsCmsChooseTemplateHelp', uiLanguage)}</p>
        </div>
        <NewsTemplatePicker lang={uiLanguage} selectedId={templateId} onSelect={setTemplateId} />
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(520px,1.1fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">{t('newsCmsFillFields', uiLanguage)}</h2>
              <p className="text-sm text-slate-500">{t('newsCmsTranslatedContentHelp', uiLanguage)}</p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Languages className="h-4 w-4 text-slate-400" />
              <select
                value={editLanguage}
                onChange={(event) => setEditLanguage(event.target.value as PortalUiLanguage)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                {PORTAL_LANGUAGES.map((language) => (
                  <option key={language.code} value={language.code}>{language.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="space-y-4">
            {template.fields.map((field) => (
              <NewsFieldEditor
                key={field.key}
                lang={uiLanguage}
                field={field}
                value={activeContent[field.key]}
                onChange={(value) => setLocalizedContent((current) => updateLocalizedNewsField(current, editLanguage, field.key, value))}
              />
            ))}
          </div>

          {!validation.valid && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {validation.issues.map((issue) => (
                <div key={`${issue.fieldKey}-${issue.messageKey}`}>{t(issue.messageKey, uiLanguage)}: {issue.fieldKey}</div>
              ))}
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={() => onSaveDraft({ templateId, localizedContent })}>
              {t('newsCmsSaveDraft', uiLanguage)}
            </Button>
            <Button type="button" disabled={saving || !validation.valid} onClick={() => onPublish({ templateId, localizedContent })}>
              {t('newsCmsPublish', uiLanguage)}
            </Button>
          </div>
        </section>

        <NewsPreviewPane lang={editLanguage} template={template} content={activeContent} />
      </div>
    </div>
  );
}
