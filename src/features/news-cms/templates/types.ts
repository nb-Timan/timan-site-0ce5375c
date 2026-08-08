import type { ComponentType, ReactNode } from 'react';
import type { PortalUiLanguage } from '@/lib/portalLanguages';

export type NewsTemplateId =
  | 'template-01-product-announcement'
  | 'template-02-split-story'
  | 'template-03-hero-news'
  | 'template-04-technical-feature'
  | 'template-05-story-layout'
  | 'template-06-flyer';

export type NewsFieldType = 'text' | 'textarea' | 'image' | 'file' | 'url' | 'richtext' | 'iconBlocks' | 'pages' | 'featureBlocks' | 'ctaLinks';

export type NewsCtaLinkType = 'website' | 'youtube' | 'pdf' | 'dealer' | 'external';

export interface NewsCtaLink {
  enabled: boolean;
  type: NewsCtaLinkType;
  /** Stored per language. */
  label: string;
  /** Shared across languages. */
  url: string;
}

export type NewsFeatureIconColor = 'green' | 'black' | 'grey' | 'red' | 'blue' | 'orange';

export interface NewsFeatureBlock {
  icon: string;
  iconColor: NewsFeatureIconColor;
  customIconUrl: string | null;
  heading: string;
  description: string;
}

export interface NewsFieldDefinition {
  key: string;
  labelKey: string;
  type: NewsFieldType;
  required?: boolean;
  helpKey?: string;
  maxLength?: number;
}

export type LocalizedNewsContent = Partial<Record<PortalUiLanguage, Record<string, unknown>>>;

export interface NewsValidationIssue {
  fieldKey: string;
  messageKey: string;
}

export interface NewsValidationResult {
  valid: boolean;
  issues: NewsValidationIssue[];
}

export interface NewsRendererProps {
  lang: PortalUiLanguage;
  content: Record<string, unknown>;
  mode: 'editor' | 'preview' | 'public';
}

export interface NewsTemplateDefinition {
  id: NewsTemplateId;
  number: string;
  nameKey: string;
  purposeKey: string;
  pageMode: 'single' | 'multiple';
  orientation: 'a4-landscape';
  fields: NewsFieldDefinition[];
  validate: (content: Record<string, unknown>) => NewsValidationResult;
  Renderer: ComponentType<NewsRendererProps>;
  previewLabel?: ReactNode;
}
