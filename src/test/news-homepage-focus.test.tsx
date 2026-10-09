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
  resolveNewsHomepageMedia,
} from '@/features/news-cms/lib/newsHomepageFocus';
import { getNewsTemplate } from '@/features/news-cms/templates/registry';

describe('Template 03 homepage focus', () => {
  it('stores the hero focus as shared image metadata for every portal language', () => {
    const focus = { x: 63, y: 42 };
    const transform = { x: 12, y: -8, scale: 1.3 };
    const content = updateSharedNewsField(
      updateSharedNewsField(emptyLocalizedContent(), 'heroImageTransform', transform),
      'heroHomepageFocus',
      focus,
    );
    const template = getNewsTemplate('template-03-hero-news');

    expect(content.da?.heroImageTransform).toEqual(transform);
    expect(content.da?.heroHomepageFocus).toEqual(focus);
    expect(content.de?.heroImageTransform).toEqual(transform);
    expect(content.de?.heroHomepageFocus).toEqual(focus);
    expect(content.cs?.heroImageTransform).toEqual(transform);
    expect(content.cs?.heroHomepageFocus).toEqual(focus);
    expect(resolveNewsRenderContent(content, 'de', template.fields).heroImageTransform).toEqual(transform);
    expect(resolveNewsRenderContent(content, 'de', template.fields).heroHomepageFocus).toEqual(focus);
  });

  it('applies the Step 2 transform to the Template 03 hero without changing homepage focus', () => {
    const template = getNewsTemplate('template-03-hero-news');
    const html = renderToStaticMarkup(
      createElement(template.Renderer, {
        lang: 'de',
        content: {
          headline: 'Hero',
          heroImage: 'https://cdn.example.test/template-03-hero.jpg',
          heroImageTransform: { x: 12, y: -8, scale: 1.3 },
          heroHomepageFocus: { x: 63, y: 42 },
        },
        mode: 'preview',
      }),
    );

    expect(html).toContain('translate(12%, -8%) scale(1.3)');
    expect(html).not.toContain('63% 42%');
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

  it('shows the persisted Step 2 transform as locked composition in Step 3', () => {
    const html = renderToStaticMarkup(
      createElement(NewsHomepageFocusFrame, {
        imageUrl: 'https://cdn.example.test/template-03-hero.jpg',
        headline: 'TEST FORSIDEFOKUS',
        focus: { x: 63, y: 42 },
        imageTransform: { x: 12, y: -8, scale: 1.3 },
        onFocusChange: () => undefined,
      }),
    );

    expect(html).toContain('Låst billedkomposition');
    expect(html).toContain('translate(12%, -8%) scale(1.3)');
    expect(html).toContain('object-contain');
  });

  it('resolves one canonical homepage image for every active template', () => {
    expect(resolveNewsHomepageMedia('template-01-product-announcement', { mainImage: 'one.jpg' }).imageUrl).toBe('one.jpg');
    expect(resolveNewsHomepageMedia('template-02-split-story', { mainImage: 'two.jpg' }).imageUrl).toBe('two.jpg');
    expect(resolveNewsHomepageMedia('template-03-hero-news', { heroImage: 'three.jpg' }).imageUrl).toBe('three.jpg');
    expect(resolveNewsHomepageMedia('template-04-technical-feature', { productImage: 'four.jpg' }).imageUrl).toBe('four.jpg');
    expect(resolveNewsHomepageMedia('template-05-story-layout', { mainImage: 'five.jpg' }).imageUrl).toBe('five.jpg');
    expect(resolveNewsHomepageMedia('template-06-flyer', { flyerPages: [{ image: 'six.jpg' }] }).imageUrl).toBe('six.jpg');
    expect(resolveNewsHomepageMedia('custom-timan-3330-seat', { mainImage: 'custom.jpg' }).imageUrl).toBe('custom.jpg');
  });
});
