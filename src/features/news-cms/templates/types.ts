import type { ComponentType, ReactNode } from 'react';
import type { PortalUiLanguage } from '@/lib/portalLanguages';

export type NewsTemplateId =
  | 'template-01-product-announcement'
  | 'template-02-split-story'
  | 'template-03-hero-news'
  | 'template-04-technical-feature'
  | 'template-05-story-layout'
  | 'template-06-flyer'
  | 'custom-timan-3330-seat';

export type NewsFieldType = 'text' | 'textarea' | 'image' | 'file' | 'url' | 'richtext' | 'iconBlocks' | 'pages' | 'featureBlocks' | 'ctaLinks' | 'techBlocks' | 'specRows' | 'pageCount' | 'flyerPages';

/** Template 06 flyer CTA link. `label` is per language, `url` is shared. */
export interface NewsFlyerLink {
  label: string;
  url: string;
}

/**
 * Template 06 flyer page. Text is per language; images, icons and URLs are
 * shared. Each page index maps to its own layout, so page 2 uses
 * `highlights` + `secondaryImage` and page 3 uses `specs` + `links`.
 */
export interface NewsFlyerPage {
  headline: string;
  subtitle: string;
  body: string;
  image: string;
  secondaryImage: string;
  highlights: NewsFeatureBlock[];
  specs: NewsSpecRow[];
  links: NewsFlyerLink[];
}


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

export interface NewsSpecRow {
  label: string;
  value: string;
}

export interface NewsImageTransform {
  x: number;
  y: number;
  scale: number;
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
  templateData?: Record<string, unknown> | null;
  mode: 'editor' | 'preview' | 'public';
  /** 1-based page index for multi-page templates (Template 06). */
  page?: number;
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
  availableInPicker?: boolean;
}
