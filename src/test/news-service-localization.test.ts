import { describe, expect, it } from 'vitest';
import { resolvePublicNewsFields, type NewsCmsPost } from '@/lib/newsService';

const basePost = {
  title: 'Mød Timan 2620',
  excerpt: 'Den lille maskine med de store muligheder',
  image_url: null,
  localized_content: {
    da: {
      headline: 'Mød Timan 2620',
      subtitle: 'Den lille maskine med de store muligheder',
      mainImage: 'da-image.png',
    },
    cs: {
      headline: 'Seznamte se s Timan 2620',
      subtitle: 'Malý stroj s velkými možnostmi',
      mainImage: 'cs-image.png',
    },
    pl: {
      headline: 'Poznaj Timan 2620',
      subtitle: 'Mała maszyna z dużymi możliwościami',
      mainImage: 'pl-image.png',
    },
  },
} satisfies Partial<NewsCmsPost>;

describe('news service localization', () => {
  it('uses the selected CMS language instead of Danish legacy fields', () => {
    expect(resolvePublicNewsFields(basePost, 'cs')).toMatchObject({
      title: 'Seznamte se s Timan 2620',
      excerpt: 'Malý stroj s velkými možnostmi',
      image_url: 'cs-image.png',
    });

    expect(resolvePublicNewsFields(basePost, 'pl')).toMatchObject({
      title: 'Poznaj Timan 2620',
      excerpt: 'Mała maszyna z dużymi możliwościami',
      image_url: 'pl-image.png',
    });
  });

  it('falls back when the selected language has no translated text', () => {
    const fields = resolvePublicNewsFields(
      {
        ...basePost,
        localized_content: {
          da: basePost.localized_content.da,
          cs: { mainImage: 'shared-image.png' },
        },
      },
      'cs',
    );

    expect(fields.title).toBe('Mød Timan 2620');
    expect(fields.excerpt).toBe('Den lille maskine med de store muligheder');
    expect(fields.image_url).toBe('shared-image.png');
  });
});
