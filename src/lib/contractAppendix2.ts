import { getContractPartnerTerms, type ContractPartnerType } from '@/lib/contractPartnerTerms';
import type { ContractDiscountStructure } from '@/lib/contractCommercialTerms';
import type { PortalUiLanguage } from '@/lib/portalLanguages';

export const APPENDIX_2_PARAGRAPHS = [
  'Bilag 2: Rabat.',
  '1. Målet med rabattstrukturen.',
  'Vores mål med rabattstrukturen er at sikre en ensartet og fair behandling af alle {{partnerPlural}} med gensidig respekt, men samtidig belønne de {{partnerPlural}} der yder en ekstra instans.',
  '2. Grund rabatten.',
  'Grund rabat: 25%.',
  'Demonstrationsmaskine rabat: 25%-10%',
  '3. Rabat 1. køb flere få flere procenter.',
  'Timan giver mulighed for at få ekstra rabat som skemaet herunder viser, hvis man køber flere maskiner pr. ordre.',
  'Hvis flere af samme slags redskab ønskes på samme ordre, giver redskabsrabaten standartrabat 25%.',
  '4. Rabat 2. Leveringstid flere procenter.',
  'Er leveringstiden over 3mdr. fra ordren bliver afgivet, vil man kunne opnå ekstra rabat.',
  'Der ydes ikke bestillingsrabat på demomaskiner.',
  '5. Rabat 3. Egen demonstration - egen salg.',
  'Opnår {{partnerDefinite}} et salg uden Timan har været involveret i en demonstration, tilskønnes dette.',
  'Demorabatten ydes på grundmaskinen eksklusivt udstyr.',
  'Demonstrationsrabatten gives som en kreditnota, der modregnes ved fremtidige køb hos Timan.',
  '6. Udregning af rabat.',
  'Rabatten udregnes ud fra kombinerede rabatter eller efterfølgende rabatter. Og udregnes altid som kæderabat: Grundrabatten + Rabat 1 + Rabat 2 + Rabat 3 (Grund rabatten + Flere stk. + Leveringstid + Demonstrations rabat)',
] as const;

export const APPENDIX_2_EXAMPLE_LINES = [
  'Den maximale rabat, som kan opnåes på en maskine og redskaber er: 25% + 4% + 2% = 29,44 %',
  'Når garantiregistreringen er gennemført, vil beløbet på 3.100 kr. blive udstedt som en kreditnota, der kan anvendes ved fremtidige køb hos Timan.',
] as const;

const APPENDIX_2_TEXT: Record<'en' | 'de', Record<string, string>> = {
  en: {
    'Bilag 2: Rabat.': 'Appendix 2: Discount.',
    '1. Målet med rabattstrukturen.': '1. Purpose of the discount structure.',
    'Vores mål med rabattstrukturen er at sikre en ensartet og fair behandling af alle {{partnerPlural}} med gensidig respekt, men samtidig belønne de {{partnerPlural}} der yder en ekstra instans.': 'Our objective with the discount structure is to ensure consistent and fair treatment of all {{partnerPlural}} with mutual respect, while rewarding {{partnerPlural}} who make an extra effort.',
    '2. Grund rabatten.': '2. Base discount.',
    'Grund rabat: 25%.': 'Base discount: 25%.',
    'Demonstrationsmaskine rabat: 25%-10%': 'Demonstration machine discount: 25%-10%.',
    '3. Rabat 1. køb flere få flere procenter.': '3. Discount 1. Buy more, receive more percentage points.',
    'Timan giver mulighed for at få ekstra rabat som skemaet herunder viser, hvis man køber flere maskiner pr. ordre.': 'Timan offers additional discount as shown in the schedule below when more machines are purchased per order.',
    'Hvis flere af samme slags redskab ønskes på samme ordre, giver redskabsrabaten standartrabat 25%.': 'If several of the same attachment are ordered together, the attachment discount is the standard 25%.',
    '4. Rabat 2. Leveringstid flere procenter.': '4. Discount 2. Delivery time, more percentage points.',
    'Er leveringstiden over 3mdr. fra ordren bliver afgivet, vil man kunne opnå ekstra rabat.': 'If the delivery time is more than three months from the order date, an additional discount may be obtained.',
    'Der ydes ikke bestillingsrabat på demomaskiner.': 'No order discount is granted on demonstration machines.',
    '5. Rabat 3. Egen demonstration - egen salg.': '5. Discount 3. Own demonstration, own sale.',
    'Opnår {{partnerDefinite}} et salg uden Timan har været involveret i en demonstration, tilskønnes dette.': 'If {{partnerDefinite}} achieves a sale without Timan having been involved in a demonstration, this is rewarded.',
    'Demorabatten ydes på grundmaskinen eksklusivt udstyr.': 'The demonstration discount is granted on the base machine excluding equipment.',
    'Demonstrationsrabatten gives som en kreditnota, der modregnes ved fremtidige køb hos Timan.': 'The demonstration discount is granted as a credit note to be offset against future purchases from Timan.',
    '6. Udregning af rabat.': '6. Discount calculation.',
    'Rabatten udregnes ud fra kombinerede rabatter eller efterfølgende rabatter. Og udregnes altid som kæderabat: Grundrabatten + Rabat 1 + Rabat 2 + Rabat 3 (Grund rabatten + Flere stk. + Leveringstid + Demonstrations rabat)': 'The discount is calculated from combined or successive discounts. It is always calculated as a chained discount: Base discount + Discount 1 + Discount 2 + Discount 3 (Base discount + Multiple units + Delivery time + Demonstration discount).',
  },
  de: {
    'Bilag 2: Rabat.': 'Anhang 2: Rabatt.',
    '1. Målet med rabattstrukturen.': '1. Ziel der Rabattstruktur.',
    'Vores mål med rabattstrukturen er at sikre en ensartet og fair behandling af alle {{partnerPlural}} med gensidig respekt, men samtidig belønne de {{partnerPlural}} der yder en ekstra instans.': 'Unser Ziel mit der Rabattstruktur ist eine einheitliche und faire Behandlung aller {{partnerPlural}} mit gegenseitigem Respekt sowie die Belohnung von {{partnerPlural}}, die einen besonderen Einsatz leisten.',
    '2. Grund rabatten.': '2. Grundrabatt.',
    'Grund rabat: 25%.': 'Grundrabatt: 25%.',
    'Demonstrationsmaskine rabat: 25%-10%': 'Demomaschinenrabatt: 25%-10%.',
    '3. Rabat 1. køb flere få flere procenter.': '3. Rabatt 1. Mehr kaufen, mehr Prozent erhalten.',
    'Timan giver mulighed for at få ekstra rabat som skemaet herunder viser, hvis man køber flere maskiner pr. ordre.': 'Timan bietet zusätzlichen Rabatt, wie in der folgenden Übersicht dargestellt, wenn mehrere Maschinen pro Bestellung gekauft werden.',
    'Hvis flere af samme slags redskab ønskes på samme ordre, giver redskabsrabaten standartrabat 25%.': 'Wenn mehrere gleiche Anbaugeräte in derselben Bestellung gewünscht werden, beträgt der Anbaugeräterabatt standardmäßig 25%.',
    '4. Rabat 2. Leveringstid flere procenter.': '4. Rabatt 2. Lieferzeit, mehr Prozent.',
    'Er leveringstiden over 3mdr. fra ordren bliver afgivet, vil man kunne opnå ekstra rabat.': 'Bei einer Lieferzeit von mehr als drei Monaten ab Bestellung kann ein zusätzlicher Rabatt gewährt werden.',
    'Der ydes ikke bestillingsrabat på demomaskiner.': 'Für Demomaschinen wird kein Bestellrabatt gewährt.',
    '5. Rabat 3. Egen demonstration - egen salg.': '5. Rabatt 3. Eigene Demonstration, eigener Verkauf.',
    'Opnår {{partnerDefinite}} et salg uden Timan har været involveret i en demonstration, tilskønnes dette.': 'Erzielt {{partnerDefinite}} einen Verkauf, ohne dass Timan an einer Demonstration beteiligt war, wird dies honoriert.',
    'Demorabatten ydes på grundmaskinen eksklusivt udstyr.': 'Der Demorabatt wird auf die Basismaschine ohne Ausrüstung gewährt.',
    'Demonstrationsrabatten gives som en kreditnota, der modregnes ved fremtidige køb hos Timan.': 'Der Demonstrationsrabatt wird als Gutschrift gewährt und bei künftigen Käufen bei Timan verrechnet.',
    '6. Udregning af rabat.': '6. Rabattberechnung.',
    'Rabatten udregnes ud fra kombinerede rabatter eller efterfølgende rabatter. Og udregnes altid som kæderabat: Grundrabatten + Rabat 1 + Rabat 2 + Rabat 3 (Grund rabatten + Flere stk. + Leveringstid + Demonstrations rabat)': 'Der Rabatt wird aus kombinierten oder aufeinanderfolgenden Rabatten berechnet. Er wird immer als Kettenrabatt berechnet: Grundrabatt + Rabatt 1 + Rabatt 2 + Rabatt 3 (Grundrabatt + mehrere Stück + Lieferzeit + Demonstrationsrabatt).',
  },
};

const APPENDIX_2_EXAMPLE_TEXT: Record<'en' | 'de', readonly [string, string]> = {
  en: [
    'The maximum discount obtainable on a machine and attachments is: 25% + 4% + 2% = 29.44%.',
    'Once the warranty registration is complete, the amount of DKK 3,100 will be issued as a credit note that can be used for future purchases from Timan.',
  ],
  de: [
    'Der maximal erreichbare Rabatt auf eine Maschine und Anbaugeräte beträgt: 25% + 4% + 2% = 29,44%.',
    'Nach Abschluss der Garantieregistrierung wird der Betrag von 3.100 DKK als Gutschrift ausgestellt, die bei künftigen Käufen bei Timan verwendet werden kann.',
  ],
};

function resolveAppendixLanguage(language: PortalUiLanguage | string | null | undefined): 'da' | 'en' | 'de' {
  return language === 'da' || language === 'de' ? language : 'en';
}

export function renderAppendix2ExampleLines(language: PortalUiLanguage | string | null | undefined = 'da'): readonly string[] {
  const resolvedLanguage = resolveAppendixLanguage(language);
  return resolvedLanguage === 'da' ? APPENDIX_2_EXAMPLE_LINES : APPENDIX_2_EXAMPLE_TEXT[resolvedLanguage];
}

export function renderAppendix2Paragraphs(
  partnerType: ContractPartnerType | '' | null | undefined,
  discounts?: ContractDiscountStructure,
  language: PortalUiLanguage | string | null | undefined = 'da',
): string[] {
  const resolvedLanguage = resolveAppendixLanguage(language);
  const terms = getContractPartnerTerms(partnerType, resolvedLanguage);
  const translations = resolvedLanguage === 'da' ? null : APPENDIX_2_TEXT[resolvedLanguage];
  const historicalParagraphs = APPENDIX_2_PARAGRAPHS.map((paragraph: string) => {
    const rendered = (translations?.[paragraph] ?? paragraph)
      .replaceAll('{{partnerDefinite}}', terms?.definite ?? '')
      .replaceAll('{{partnerPlural}}', terms?.plural ?? '');
    const baseDiscount = translations?.['Grund rabat: 25%.'] ?? 'Grund rabat: 25%.';
    return rendered === baseDiscount && discounts?.machineDiscountPct !== undefined
      ? baseDiscount.replace('25', String(discounts.machineDiscountPct))
      : rendered;
  });
  if (!discounts) return historicalParagraphs;

  return historicalParagraphs;
}
