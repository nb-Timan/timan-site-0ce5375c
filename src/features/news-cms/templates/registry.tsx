import { FileText } from 'lucide-react';
import type { NewsTemplateDefinition, NewsTemplateId } from './types';

function placeholderValidate(content: Record<string, unknown>) {
  const issues = ['headline'].flatMap((fieldKey) => {
    const value = content[fieldKey];
    return typeof value === 'string' && value.trim() ? [] : [{ fieldKey, messageKey: 'newsCmsValidationRequired' }];
  });
  return { valid: issues.length === 0, issues };
}

function PlaceholderTemplateRenderer({ content }: { content: Record<string, unknown> }) {
  const headline = String(content.headline || '');
  const subtitle = String(content.subtitle || '');
  const body = String(content.body || '');

  return (
    <div className="aspect-[1.414/1] w-full rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex h-full flex-col justify-between rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6">
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-700">
            <FileText className="h-3.5 w-3.5" />
            Fixed template preview
          </div>
          <h3 className="text-3xl font-bold text-slate-900">{headline || 'Headline'}</h3>
          <p className="mt-2 text-lg text-slate-600">{subtitle || 'Subtitle'}</p>
        </div>
        <p className="max-w-2xl text-sm leading-6 text-slate-600">{body || 'Template design is intentionally not implemented yet.'}</p>
      </div>
    </div>
  );
}

const baseFields = [
  { key: 'headline', labelKey: 'newsCmsFieldHeadline', type: 'text', required: true, maxLength: 120 },
  { key: 'subtitle', labelKey: 'newsCmsFieldSubtitle', type: 'text', maxLength: 180 },
  { key: 'body', labelKey: 'newsCmsFieldBody', type: 'textarea' },
] as const;

export const NEWS_TEMPLATE_REGISTRY: NewsTemplateDefinition[] = [
  {
    id: 'template-01-product-announcement',
    number: '01',
    nameKey: 'newsCmsTemplate01Name',
    purposeKey: 'newsCmsTemplate01Purpose',
    pageMode: 'single',
    orientation: 'a4-landscape',
    fields: [...baseFields, { key: 'mainImage', labelKey: 'newsCmsFieldMainImage', type: 'image', required: true }],
    validate: placeholderValidate,
    Renderer: PlaceholderTemplateRenderer,
  },
  {
    id: 'template-02-split-story',
    number: '02',
    nameKey: 'newsCmsTemplate02Name',
    purposeKey: 'newsCmsTemplate02Purpose',
    pageMode: 'single',
    orientation: 'a4-landscape',
    fields: [...baseFields, { key: 'quote', labelKey: 'newsCmsFieldQuote', type: 'textarea' }],
    validate: placeholderValidate,
    Renderer: PlaceholderTemplateRenderer,
  },
  {
    id: 'template-03-hero-news',
    number: '03',
    nameKey: 'newsCmsTemplate03Name',
    purposeKey: 'newsCmsTemplate03Purpose',
    pageMode: 'single',
    orientation: 'a4-landscape',
    fields: [...baseFields, { key: 'heroImage', labelKey: 'newsCmsFieldHeroImage', type: 'image', required: true }],
    validate: placeholderValidate,
    Renderer: PlaceholderTemplateRenderer,
  },
  {
    id: 'template-04-technical-feature',
    number: '04',
    nameKey: 'newsCmsTemplate04Name',
    purposeKey: 'newsCmsTemplate04Purpose',
    pageMode: 'single',
    orientation: 'a4-landscape',
    fields: [...baseFields, { key: 'specifications', labelKey: 'newsCmsFieldSpecifications', type: 'textarea' }],
    validate: placeholderValidate,
    Renderer: PlaceholderTemplateRenderer,
  },
  {
    id: 'template-05-story-layout',
    number: '05',
    nameKey: 'newsCmsTemplate05Name',
    purposeKey: 'newsCmsTemplate05Purpose',
    pageMode: 'single',
    orientation: 'a4-landscape',
    fields: [...baseFields, { key: 'secondaryImage', labelKey: 'newsCmsFieldSecondaryImage', type: 'image' }],
    validate: placeholderValidate,
    Renderer: PlaceholderTemplateRenderer,
  },
  {
    id: 'template-06-flyer',
    number: '06',
    nameKey: 'newsCmsTemplate06Name',
    purposeKey: 'newsCmsTemplate06Purpose',
    pageMode: 'multiple',
    orientation: 'a4-landscape',
    fields: [...baseFields, { key: 'pages', labelKey: 'newsCmsFieldPages', type: 'pages', required: true }],
    validate: placeholderValidate,
    Renderer: PlaceholderTemplateRenderer,
  },
];

export function getNewsTemplate(id: string | null | undefined): NewsTemplateDefinition {
  return NEWS_TEMPLATE_REGISTRY.find((template) => template.id === id) || NEWS_TEMPLATE_REGISTRY[0];
}

export function isNewsTemplateId(id: string | null | undefined): id is NewsTemplateId {
  return NEWS_TEMPLATE_REGISTRY.some((template) => template.id === id);
}
