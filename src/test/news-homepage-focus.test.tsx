import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import NewsHomepageFocusFrame, { NewsHomepageFocusOverlay } from '@/features/news-cms/editor/NewsHomepageFocusFrame';
import {
  emptyLocalizedContent,
  resolveNewsRenderContent,
  updateSharedNewsField,
} from '@/features/news-cms/lib/newsContent';
import { normalizeNewsImageTransform, readNewsImageTransform } from '@/features/news-cms/lib/newsImageTransform';
import { getNewsTemplate } from '@/features/news-cms/templates/registry';

describe('Template 03 homepage focus', () => {
  it('stores the hero focus as shared image metadata for every portal language', () => {
    const focus = { x: 18, y: -12, scale: 1.35 };
    const content = updateSharedNewsField(emptyLocalizedContent(), 'heroImageTransform', focus);
    const template = getNewsTemplate('template-03-hero-news');

    expect(content.da?.heroImageTransform).toEqual(focus);
    expect(content.de?.heroImageTransform).toEqual(focus);
    expect(content.cs?.heroImageTransform).toEqual(focus);
    expect(resolveNewsRenderContent(content, 'de', template.fields).heroImageTransform).toEqual(focus);
  });

  it('uses the existing image-transform bounds and defaults to the centered crop', () => {
    expect(normalizeNewsImageTransform({ x: 100, y: -100, scale: 9 })).toEqual({ x: 45, y: -45, scale: 2.5 });
    expect(readNewsImageTransform(undefined)).toBeUndefined();
  });

  it('renders the draggable focus frame and matching homepage-card preview', () => {
    const html = renderToStaticMarkup(
      createElement(NewsHomepageFocusFrame, {
        imageUrl: 'https://cdn.example.test/template-03-hero.jpg',
        headline: 'TEST FORSIDEFOKUS',
        transform: { x: 10, y: -4, scale: 1.2 },
        onTransformChange: () => undefined,
      }),
    );

    expect(html).toContain('Forsidekort');
    expect(html).toContain('TEST FORSIDEFOKUS');
    expect(html).toContain('translate(10%, -4%) scale(1.2)');

    const overlayHtml = renderToStaticMarkup(
      createElement(NewsHomepageFocusOverlay, {
        transform: { x: 10, y: -4, scale: 1.2 },
        onTransformChange: () => undefined,
      }),
    );
    expect(overlayHtml).toContain('Flyt forsidefokus');
  });
});
