import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getNewsTemplate } from '@/features/news-cms/templates/registry';

describe('Template 03 preview', () => {
  it('renders the selected hero image and localized body text', () => {
    const template = getNewsTemplate('template-03-hero-news');
    const html = renderToStaticMarkup(
      createElement(template.Renderer, {
        lang: 'da',
        mode: 'preview',
        templateData: {},
        content: {
          heroImage: 'https://cdn.example.test/template-03-hero.jpg',
          headline: 'TEST OVERSKRIFT TEMPLATE 03',
          subtitle: 'TEST UNDEROVERSKRIFT TEMPLATE 03',
          body: 'TEST BRØDTEKST TEMPLATE 03',
        },
      }),
    );

    expect(html).toContain('https://cdn.example.test/template-03-hero.jpg');
    expect(html).toContain('TEST OVERSKRIFT TEMPLATE 03');
    expect(html).toContain('TEST UNDEROVERSKRIFT TEMPLATE 03');
    expect(html).toContain('TEST BRØDTEKST TEMPLATE 03');
    expect(html).not.toContain('Hero-billede i fuld bredde');
  });
});
