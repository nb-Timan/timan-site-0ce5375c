import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import NewsHomepageFocusFrame, { NewsHomepageFocusOverlay } from '@/features/news-cms/editor/NewsHomepageFocusFrame';
import {
  emptyLocalizedContent,
  resolveNewsRenderContent,
  updateSharedNewsField,
} from '@/features/news-cms/lib/newsContent';
import {
  HOMEPAGE_FOCUS_FRAME_SIZE,
  normalizeNewsHomepageFocus,
  readNewsHomepageFocus,
} from '@/features/news-cms/lib/newsHomepageFocus';
import { getNewsTemplate } from '@/features/news-cms/templates/registry';

describe('Template 03 homepage focus', () => {
  it('stores the hero focus as shared image metadata for every portal language', () => {
    const focus = { x: 63, y: 42 };
    const content = updateSharedNewsField(emptyLocalizedContent(), 'heroHomepageFocus', focus);
    const template = getNewsTemplate('template-03-hero-news');

    expect(content.da?.heroHomepageFocus).toEqual(focus);
    expect(content.de?.heroHomepageFocus).toEqual(focus);
    expect(content.cs?.heroHomepageFocus).toEqual(focus);
    expect(resolveNewsRenderContent(content, 'de', template.fields).heroHomepageFocus).toEqual(focus);
  });

  it('keeps the fixed square frame within the image bounds', () => {
    const edge = HOMEPAGE_FOCUS_FRAME_SIZE / 2;
    expect(normalizeNewsHomepageFocus({ x: 100, y: -100 })).toEqual({ x: 100 - edge, y: edge });
    expect(readNewsHomepageFocus(undefined)).toBeUndefined();
  });

  it('renders the draggable focus frame and matching homepage-card preview', () => {
    const html = renderToStaticMarkup(
      createElement(NewsHomepageFocusFrame, {
        imageUrl: 'https://cdn.example.test/template-03-hero.jpg',
        headline: 'TEST FORSIDEFOKUS',
        focus: { x: 63, y: 42 },
        onFocusChange: () => undefined,
      }),
    );

    expect(html).toContain('Forsidekort');
    expect(html).toContain('TEST FORSIDEFOKUS');
    expect(html).toContain('object-position:63% 42%');

    const overlayHtml = renderToStaticMarkup(
      createElement(NewsHomepageFocusOverlay, {
        focus: { x: 63, y: 42 },
        onFocusChange: () => undefined,
      }),
    );
    expect(overlayHtml).toContain('Flyt forsidefokus');
  });
});
