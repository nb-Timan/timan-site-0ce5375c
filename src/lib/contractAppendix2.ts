import { getContractPartnerTerms, type ContractPartnerType } from '@/lib/contractPartnerTerms';

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
  'Opnår {{partnerDefinite}} et salg uden Timan har været involveret i en demonstration, til skønnes dette.',
  'Demorabatten ydes på grundmaskinen eksklusivt udstyr.',
  'Demonstrationsrabatten gives som en kreditnota, der modregnes ved fremtidige køb hos Timan.',
  '6. Udregning af rabat.',
  'Rabatten udregnes ud fra kombinerede rabatter eller efterfølgende rabatter. Og udregnes altid som kæderabat: Grundrabatten + Rabat 1 + Rabat 2 + Rabat 3 (Grund rabatten + Flere stk. + Leveringstid + Demonstrations rabat)',
] as const;

export const APPENDIX_2_EXAMPLE_LINES = [
  'Den maximale rabat, som kan opnåes på en maskine og redskaber er: 25% + 4% + 2% = 29,44 %',
  'Når garantiregistreringen er gennemført, vil beløbet på 3.100 kr. blive udstedt som en kreditnota, der kan anvendes ved fremtidige køb hos Timan.',
] as const;

export function renderAppendix2Paragraphs(partnerType: ContractPartnerType | '' | null | undefined): string[] {
  const terms = getContractPartnerTerms(partnerType);
  return APPENDIX_2_PARAGRAPHS.map((paragraph: string) => (
    paragraph
      .replaceAll('{{partnerDefinite}}', terms?.definite ?? '')
      .replaceAll('{{partnerPlural}}', terms?.plural ?? '')
  ));
}
