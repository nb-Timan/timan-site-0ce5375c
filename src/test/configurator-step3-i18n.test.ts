import { describe, expect, it } from 'vitest';
import { getLooseToolAccessories } from '@/data/machines';
import { t } from '@/data/translations';

const expected = {
  da: ['Hvilken maskine søger du redskab til?', 'Alle', 'Redskaber til RC-1000s', 'Redskaber til Timan 3330', 'Redskaber til Timan 2620'],
  en: ['Which machine are you looking for an attachment for?', 'All', 'Attachments for RC-1000s', 'Attachments for Timan 3330', 'Attachments for Timan 2620'],
  de: ['Für welche Maschine suchen Sie ein Anbaugerät?', 'Alle', 'Anbaugeräte für RC-1000s', 'Anbaugeräte für Timan 3330', 'Anbaugeräte für Timan 2620'],
  it: ['Per quale macchina cerca un’attrezzatura?', 'Tutte', 'Attrezzature per RC-1000s', 'Attrezzature per Timan 3330', 'Attrezzature per Timan 2620'],
  hu: ['Melyik géphez keres munkaeszközt?', 'Összes', 'Munkaeszközök az RC-1000s-hez', 'Munkaeszközök a Timan 3330-hoz', 'Munkaeszközök a Timan 2620-hoz'],
  sv: ['Vilken maskin söker du ett redskap till?', 'Alla', 'Redskap för RC-1000s', 'Redskap för Timan 3330', 'Redskap för Timan 2620'],
  fr: ['Pour quelle machine recherchez-vous un équipement ?', 'Toutes', 'Équipements pour RC-1000s', 'Équipements pour Timan 3330', 'Équipements pour Timan 2620'],
  pl: ['Do której maszyny szukasz osprzętu?', 'Wszystkie', 'Osprzęt do RC-1000s', 'Osprzęt do Timan 3330', 'Osprzęt do Timan 2620'],
  cs: ['Ke kterému stroji hledáte příslušenství?', 'Všechny', 'Příslušenství pro RC-1000s', 'Příslušenství pro Timan 3330', 'Příslušenství pro Timan 2620'],
} as const;

describe('Configurator Step 3 loose-tools translations', () => {
  it.each(Object.entries(expected))('uses native %s text for the machine filter and group headings', (language, labels) => {
    const [prompt, all, rc1000s, timan3330, timan2620] = labels;
    expect(t('looseToolsMachineFilterPrompt', language)).toBe(prompt);
    expect(t('allMachines', language)).toBe(all);
    expect(t('looseToolsGroupRc1000s', language)).toBe(rc1000s);
    expect(t('looseToolsGroupTiman3330', language)).toBe(timan3330);
    expect(t('looseToolsGroupTiman2620', language)).toBe(timan2620);
  });

  it('marks all loose-tools machine headings with their canonical translation key', () => {
    const keys = getLooseToolAccessories()
      .filter(item => item.id === 'REDSKABER_HEADER' || item.id === 'LOOSE_TIMAN3330_HEADER' || item.id === 'LOOSE_TIMAN2620_HEADER')
      .map(item => item.translationKey);

    expect(keys).toEqual([
      'looseToolsGroupRc1000s',
      'looseToolsGroupTiman3330',
      'looseToolsGroupTiman2620',
    ]);
  });
});
