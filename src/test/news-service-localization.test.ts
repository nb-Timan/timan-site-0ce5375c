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

  it('replaces copied Danish text inside completed Template 04 translations', () => {
    const result = translateMissingNewsContent(
      {
        da: {
          headline: 'Skivehøster til Timan RC-1000s',
          body: 'Den hydrauliske skivehøster til Timan RC-1000s er udviklet til professionel slåning af længere og kraftigere græs. To roterende skiver med otte knive giver et rent, jævnt skær og effektiv høst med fokus på god foderkvalitet.',
          secondaryHeading: 'Skånsom høst',
          secondaryText: 'Den roterende skivekonstruktion giver et rent og jævnt skær og hjælper med at bevare kvaliteten af det høstede materiale',
          specRows: [
            { label: 'Højde – midte', value: '550 mm' },
            { label: 'Højde – sider', value: '420 mm' },
          ],
        },
        de: {
          headline: 'Scheibenmähwerk für Timan RC-1000s',
          body: 'Den hydrauliske skivehøster til Timan RC-1000s er udviklet til professionel slåning af længere og kraftigere græs. To roterende skiver med otte knive giver et rent, jævnt skær og effektiv høst med fokus på god foderkvalitet.',
          secondaryHeading: 'Skånsom høst',
          secondaryText: 'Den roterende skivekonstruktion giver et rent og jævnt skær og hjælper med at bevare kvaliteten af det høstede materiale',
          specRows: [
            { label: 'Højde – midte', value: '550 mm' },
            { label: 'Højde – sider', value: '420 mm' },
          ],
        },
      },
      [
        { key: 'headline', type: 'text', labelKey: 'newsCmsFieldHeadline', required: true },
        { key: 'body', type: 'textarea', labelKey: 'newsCmsFieldBody', required: false },
        { key: 'secondaryHeading', type: 'text', labelKey: 'newsCmsFieldSecondaryHeading', required: false },
        { key: 'secondaryText', type: 'textarea', labelKey: 'newsCmsFieldSecondaryText', required: false },
        { key: 'specRows', type: 'specRows', labelKey: 'newsCmsFieldSpecRows', required: false },
      ],
    );

    expect(result.localizedContent.de.body).toContain('Das hydraulische Scheibenmähwerk');
    expect(result.localizedContent.de.secondaryHeading).toBe('Schonende Ernte');
    expect(result.localizedContent.de.secondaryText).toContain('Die rotierende Scheibenkonstruktion');
    expect(result.localizedContent.de.specRows?.[0]).toMatchObject({ label: 'Höhe - Mitte', value: '550 mm' });
    expect(result.localizedContent.de.specRows?.[1]).toMatchObject({ label: 'Höhe - Seiten', value: '420 mm' });
    expect(result.translatedLanguages).toContain('de');
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

  it('updates stale auto-translated news fields when the source language changes', () => {
    const fields = [
      { key: 'headline', type: 'text', labelKey: 'newsCmsFieldHeadline', required: true },
      { key: 'subtitle', type: 'text', labelKey: 'newsCmsFieldSubtitle', required: false },
    ] as Parameters<typeof translateMissingNewsContent>[1];
    const previous = {
      da: {
        headline: 'Skivehøster til Timan RC-1000s',
        subtitle: 'Effektiv høst med et rent og jævnt skær',
      },
      de: {
        headline: 'Scheibenmähwerk für Timan RC-1000s',
        subtitle: 'Effiziente Ernte mit sauberem und gleichmäßigem Schnitt',
      },
      en: {
        headline: 'Manually tuned English headline',
        subtitle: 'Manually tuned English subtitle',
      },
    };
    const current = {
      ...previous,
      da: {
        headline: 'CS-200 – én spreder, flere muligheder',
        subtitle: 'Effektiv vintertjeneste – på Timan 3330 eller traktor',
      },
    };

    const result = translateMissingNewsContent(current, fields, 'da', previous);

    expect(result.localizedContent.de).toMatchObject({
      headline: 'CS-200 - ein Streuer, viele Möglichkeiten',
      subtitle: 'Effizienter Winterdienst - mit Timan 3330 oder Traktor',
    });
    expect(result.localizedContent.en).toMatchObject({
      headline: 'Manually tuned English headline',
      subtitle: 'Manually tuned English subtitle',
    });
    expect(result.translatedLanguages).toContain('de');
    expect(result.translatedLanguages).not.toContain('en');
  });

  it('auto-translates Template 05 CS-200 body text and quote to German', () => {
    const template = getNewsTemplate('template-05-story-layout');
    const body = [
      'CS-200 kombinerer tallerkenspreder og valseudlægger i én fleksibel løsning. Skift mellem præcis udlægning og bred spredning direkte fra kabinen, og tilpas arbejdet til alt fra smalle stier til større arealer. CS-200 findes både til Timan 3330 og i en version til traktor.',
      '',
      'Den elektriske betjening gør det nemt at justere spredningen under arbejdet, mens den hurtige til- og frakobling gør det enkelt at skifte mellem forskellige opgaver og redskaber.',
      '',
      'Derfor CS-200',
      '',
      '✓ 2-i-1 – tallerkenspreder og valseudlægger',
      '✓ 1-6 m spredebredde',
      '✓ Elektrisk betjening direkte fra kabinen',
      '✓ Hurtig og enkel til- og frakobling',
      '✓ Præcis dosering til forskellige opgaver',
      '✓ Fås til både Timan 3330 og traktor',
    ].join('\n');
    const quote = 'Vi er meget tilfredse med, hvor hurtigt CS-200 kan kobles på og af. Med den elektriske betjening kan vi styre det hele fra kabinen, og det er virkelig luksus i en travl vinterhverdag';

    const result = translateMissingNewsContent(
      {
        da: {
          headline: 'CS-200 – én spreder, flere muligheder',
          subtitle: 'Effektiv vintertjeneste – på Timan 3330 eller traktor',
          body,
          quote,
        },
        de: {
          headline: 'CS-200 - ein Streuer, viele Möglichkeiten',
          subtitle: 'Effizienter Winterdienst - mit Timan 3330 oder Traktor',
          body,
          quote,
        },
      },
      template.fields,
      'da',
    );

    expect(result.localizedContent.de.body).toContain('CS-200 kombiniert Tellerstreuer');
    expect(result.localizedContent.de.body).toContain('✓ 2-in-1 - Tellerstreuer und Walzenstreuer');
    expect(result.localizedContent.de.body).not.toContain('tallerkenspreder');
    expect(result.localizedContent.de.quote).toContain('Wir sind sehr zufrieden');
    expect(result.translatedLanguages).toContain('de');
  });
});
