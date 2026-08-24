import { describe, expect, it } from 'vitest';
import { resolvePublicNewsFields, type NewsCmsPost } from '@/lib/newsService';
import { mergeSharedNewsFields, resolveNewsRenderContent } from '@/features/news-cms/lib/newsContent';
import { translateMissingNewsContent } from '@/features/news-cms/lib/newsAutoTranslate';
import { getNewsTemplate } from '@/features/news-cms/templates/registry';

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

  it('resolves every portal CMS language from localized_content', () => {
    const localized_content = Object.fromEntries(
      (['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs'] as const).map((lang) => [
        lang,
        {
          headline: `title-${lang}`,
          subtitle: `subtitle-${lang}`,
          mainImage: `image-${lang}.png`,
        },
      ]),
    );

    const post = {
      title: 'Legacy DK',
      excerpt: 'Legacy DK excerpt',
      image_url: null,
      localized_content,
    } satisfies Partial<NewsCmsPost>;

    for (const lang of ['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs'] as const) {
      expect(resolvePublicNewsFields(post, lang)).toMatchObject({
        title: `title-${lang}`,
        excerpt: `subtitle-${lang}`,
        image_url: `image-${lang}.png`,
      });
    }
  });

  it('keeps Template 01 feature box text language-specific while sharing icon styling', () => {
    const content = {
      da: {
        features: [
          {
            icon: 'settings',
            iconColor: 'green',
            heading: 'Kompakt og fleksibel',
            description: 'Designet til arbejde, hvor pladsen er trang.',
          },
        ],
      },
      hu: {
        features: [
          {
            icon: 'settings',
            iconColor: 'green',
            heading: 'Kompakt és rugalmas',
            description: 'Szűk helyeken végzett munkára tervezve.',
          },
        ],
      },
    };

    const merged = mergeSharedNewsFields(content, 'hu', [{ key: 'features', type: 'featureBlocks' }]);

    expect((merged.features as Array<Record<string, unknown>>)[0]).toMatchObject({
      icon: 'settings',
      iconColor: 'green',
      heading: 'Kompakt és rugalmas',
      description: 'Szűk helyeken végzett munkára tervezve.',
    });
  });

  it('keeps Template 04 technical feature text language-specific while sharing structure', () => {
    const content = {
      da: {
        headline: 'Dansk teknisk feature',
        subtitle: 'Dansk underoverskrift',
        body: 'Dansk hovedbrødtekst',
        secondaryHeading: 'Dansk sekundær overskrift',
        secondaryText: 'Dansk sekundær brødtekst',
        productImage: 'shared-machine.png',
        techBlocks: [
          {
            icon: 'gauge',
            iconColor: 'green',
            customIconUrl: null,
            heading: 'Dansk feature',
            description: 'Dansk featurebeskrivelse',
          },
        ],
        specRows: [{ label: 'Dansk label', value: 'Dansk værdi' }],
      },
      de: {
        headline: 'Deutsches technisches Feature',
        subtitle: 'Deutsche Unterüberschrift',
        body: 'Deutscher Haupttext',
        secondaryHeading: 'Deutsche sekundäre Überschrift',
        secondaryText: 'Deutscher sekundärer Text',
        techBlocks: [
          {
            heading: 'Deutsches Feature',
            description: 'Deutsche Featurebeschreibung',
          },
        ],
        specRows: [{ label: 'Deutsches Label', value: 'Deutscher Wert' }],
      },
    };

    const fields = [
      { key: 'headline', type: 'text' },
      { key: 'subtitle', type: 'text' },
      { key: 'body', type: 'textarea' },
      { key: 'productImage', type: 'image' },
      { key: 'secondaryHeading', type: 'text' },
      { key: 'secondaryText', type: 'textarea' },
      { key: 'techBlocks', type: 'techBlocks' },
      { key: 'specRows', type: 'specRows' },
    ];

    const de = mergeSharedNewsFields(content, 'de', fields);
    const dk = mergeSharedNewsFields(content, 'da', fields);

    expect(de).toMatchObject({
      headline: 'Deutsches technisches Feature',
      subtitle: 'Deutsche Unterüberschrift',
      body: 'Deutscher Haupttext',
      secondaryHeading: 'Deutsche sekundäre Überschrift',
      secondaryText: 'Deutscher sekundärer Text',
      productImage: 'shared-machine.png',
    });
    expect((de.techBlocks as Array<Record<string, unknown>>)[0]).toMatchObject({
      icon: 'gauge',
      iconColor: 'green',
      customIconUrl: null,
      heading: 'Deutsches Feature',
      description: 'Deutsche Featurebeschreibung',
    });
    expect((de.specRows as Array<Record<string, unknown>>)[0]).toMatchObject({
      label: 'Deutsches Label',
      value: 'Deutscher Wert',
    });

    expect(dk).toMatchObject({
      headline: 'Dansk teknisk feature',
      subtitle: 'Dansk underoverskrift',
      body: 'Dansk hovedbrødtekst',
      secondaryHeading: 'Dansk sekundær overskrift',
      secondaryText: 'Dansk sekundær brødtekst',
    });
  });

  it('renders Template 04 secondary block from the active locale in preview/public content', () => {
    const template = getNewsTemplate('template-04-technical-feature');
    const content = {
      da: {
        headline: 'Skivehøster til Timan RC-1000s',
        body: 'Effektiv høst med et rent og jævnt skær.',
        secondaryHeading: 'Skånsom høst',
        secondaryText: 'Skivehøsteren er udviklet til effektiv slåning og opsamling i én arbejdsgang.',
        productImage: 'shared-skivehoester.png',
      },
      de: {
        headline: 'Scheibenmähwerk für Timan RC-1000s',
        body: 'Effiziente Ernte mit sauberem und gleichmäßigem Schnitt.',
        secondaryHeading: 'Schonende Ernte',
        secondaryText: 'Das Scheibenmähwerk wurde für effizientes Mähen und Sammeln in einem Arbeitsgang entwickelt.',
      },
      fr: {
        headline: 'Faucheuse à disques pour Timan RC-1000s',
        body: 'Récolte efficace avec une coupe propre et régulière.',
        secondaryHeading: 'Récolte en douceur',
        secondaryText: 'La faucheuse à disques est conçue pour faucher et collecter efficacement en un seul passage.',
      },
    };

    const dk = resolveNewsRenderContent(content, 'da', template.fields);
    const de = resolveNewsRenderContent(content, 'de', template.fields);
    const fr = resolveNewsRenderContent(content, 'fr', template.fields);

    expect(dk.secondaryHeading).toBe('Skånsom høst');
    expect(dk.secondaryText).toBe('Skivehøsteren er udviklet til effektiv slåning og opsamling i én arbejdsgang.');
    expect(de.secondaryHeading).toBe('Schonende Ernte');
    expect(de.secondaryText).toBe('Das Scheibenmähwerk wurde für effizientes Mähen und Sammeln in einem Arbeitsgang entwickelt.');
    expect(fr.secondaryHeading).toBe('Récolte en douceur');
    expect(fr.secondaryText).toBe('La faucheuse à disques est conçue pour faucher et collecter efficacement en un seul passage.');
    expect(de.productImage).toBe('shared-skivehoester.png');
    expect(fr.productImage).toBe('shared-skivehoester.png');
  });

  it('translates missing nested feature box text without overwriting shared styling', () => {
    const result = translateMissingNewsContent(
      {
        da: {
          headline: 'Mød Timan 2620',
          features: [
            {
              icon: 'settings',
              iconColor: 'green',
              heading: 'Kompakt og fleksibel',
              description: 'Designet til arbejde, hvor pladsen er trang.',
            },
          ],
        },
        hu: {
          headline: 'Ismerje meg az új Timan 2620-at',
          features: [{ icon: 'settings', iconColor: 'green', heading: '', description: '' }],
        },
      },
      [
        { key: 'headline', type: 'text', labelKey: 'newsCmsFieldHeadline', required: true },
        { key: 'features', type: 'featureBlocks', labelKey: 'newsCmsFieldFeatures', required: false },
      ],
    );

    expect(result.localizedContent.hu.features?.[0]).toMatchObject({
      icon: 'settings',
      iconColor: 'green',
      heading: 'Kompakt és rugalmas',
      description: 'Szűk helyeken végzett munkára tervezve.',
    });
  });

  it('uses the selected source language for missing translations and keeps existing language content', () => {
    const result = translateMissingNewsContent(
      {
        da: {
          headline: '',
          subtitle: '',
          mainImage: 'shared-image.png',
        },
        en: {
          headline: 'Meet the Timan 2620',
          subtitle: 'The small machine with big possibilities',
          mainImage: 'shared-image.png',
        },
        de: {
          headline: 'Bestehender deutscher Titel',
          subtitle: 'Bestehender deutscher Untertitel',
          mainImage: 'shared-image.png',
        },
      },
      [
        { key: 'headline', type: 'text', labelKey: 'newsCmsFieldHeadline', required: true },
        { key: 'subtitle', type: 'text', labelKey: 'newsCmsFieldSubtitle', required: false },
        { key: 'mainImage', type: 'image', labelKey: 'newsCmsFieldMainImage', required: true },
      ],
      'en',
    );

    expect(result.localizedContent.da).toMatchObject({
      headline: 'Meet the Timan 2620',
      subtitle: 'The small machine with big possibilities',
      mainImage: 'shared-image.png',
    });
    expect(result.localizedContent.de).toMatchObject({
      headline: 'Bestehender deutscher Titel',
      subtitle: 'Bestehender deutscher Untertitel',
      mainImage: 'shared-image.png',
    });
    expect(result.translatedLanguages).toContain('da');
    expect(result.translatedLanguages).not.toContain('de');
  });
});
