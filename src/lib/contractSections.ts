import {
  PURPOSE_PRICES_ORDERS_PORTAL_SECTION_SOURCE,
  PURPOSE_PRICES_ORDERS_PORTAL_SECTION_TITLE,
  type ContractStepId,
} from '@/lib/contractFlow';
import { getContractPartnerTerms, type ContractPartnerType } from '@/lib/contractPartnerTerms';
import {
  describeContractSecondaryTerritoryArea,
  describeContractTerritoryArea,
  getContractTerritoryDisplayItems,
  type ContractSecondaryTerritoryArea,
  type ContractTerritoryArea,
} from '@/lib/contractTerritory';
import { formatContractServiceHourlyRateDkk } from '@/lib/contractServiceTerms';
import { renderContractPaymentTermLegalText } from '@/lib/contractPaymentTerms';
import { getContractDiscountStructure } from '@/lib/contractCommercialTerms';
import type { PortalUiLanguage } from '@/lib/portalLanguages';

export type ContractTextBlock = {
  heading?: string;
  paragraphs?: readonly string[];
  bullets?: readonly string[];
};

export type GuidedContractSection = {
  stepId: Exclude<ContractStepId, 'parties' | 'full_contract' | 'signature'>;
  title: string;
  guidedTitle?: string;
  source: string;
  hideGuidedSource?: boolean;
  blocks: readonly ContractTextBlock[];
};

export type ContractTextRenderContext = {
  companyName: string;
  partnerType: ContractPartnerType | '' | null | undefined;
  primaryTerritory?: ContractTerritoryArea;
  secondaryTerritory?: ContractSecondaryTerritoryArea;
  serviceHourlyRateDkk?: number;
  paymentTerm?: string;
  machineDiscountPct?: number;
  equipmentDiscountPct?: number;
  sparePartsDiscountPct?: number;
  preserveDiscountSnapshot?: boolean;
};

type ContractTextLanguage = PortalUiLanguage;
type ApprovedContractLegalLanguage = 'da' | 'en' | 'de';

export const APPROVED_CONTRACT_LEGAL_LANGUAGES: readonly ApprovedContractLegalLanguage[] = ['da', 'en', 'de'];

export function resolveApprovedContractLegalLanguage(
  language: ContractTextLanguage | string | null | undefined,
): ApprovedContractLegalLanguage {
  return APPROVED_CONTRACT_LEGAL_LANGUAGES.includes(language as ApprovedContractLegalLanguage)
    ? language as ApprovedContractLegalLanguage
    : 'en';
}

const SECTION_TITLES: Record<Exclude<GuidedContractSection['stepId'], never>, Record<ContractTextLanguage, string>> = {
  purpose_prices_orders_portal: {
    da: 'Samarbejde, handel og forhandlermøde', en: 'Cooperation, trade and dealer meeting', de: 'Zusammenarbeit, Handel und Händlertreffen', it: 'Collaborazione, commercio e riunione dei rivenditori', hu: 'Együttműködés, kereskedelem és kereskedői találkozó', sv: 'Samarbete, handel och återförsäljarmöte', fr: 'Coopération, commerce et réunion des revendeurs', pl: 'Współpraca, handel i spotkanie dealerów', cs: 'Spolupráce, obchod a setkání prodejců',
  },
  territory: {
    da: 'Område og Bilag 3', en: 'Territory and Appendix 3', de: 'Gebiet und Anhang 3', it: 'Territorio e allegato 3', hu: 'Terület és 3. melléklet', sv: 'Område och bilaga 3', fr: 'Territoire et annexe 3', pl: 'Terytorium i załącznik 3', cs: 'Území a příloha 3',
  },
  discount_structure: {
    da: 'Rabatstruktur og Bilag 2', en: 'Discount structure and Appendix 2', de: 'Rabattstruktur und Anhang 2', it: 'Struttura degli sconti e allegato 2', hu: 'Kedvezménystruktúra és 2. melléklet', sv: 'Rabattsstruktur och bilaga 2', fr: 'Structure des remises et annexe 2', pl: 'Struktura rabatów i załącznik 2', cs: 'Struktura slev a příloha 2',
  },
  demo_machines: {
    da: 'Demo-maskiner', en: 'Demonstration machines', de: 'Demomaschinen', it: 'Macchine dimostrative', hu: 'Bemutatógépek', sv: 'Demomaskiner', fr: 'Machines de démonstration', pl: 'Maszyny demonstracyjne', cs: 'Předváděcí stroje',
  },
  spare_parts_service: {
    da: 'Reservedele og service', en: 'Spare parts and service', de: 'Ersatzteile und Service', it: 'Ricambi e assistenza', hu: 'Alkatrészek és szerviz', sv: 'Reservdelar och service', fr: 'Pièces détachées et service', pl: 'Części zamienne i serwis', cs: 'Náhradní díly a servis',
  },
  marketing: {
    da: 'Marketing', en: 'Marketing', de: 'Marketing', it: 'Marketing', hu: 'Marketing', sv: 'Marknadsföring', fr: 'Marketing', pl: 'Marketing', cs: 'Marketing',
  },
  payment_delivery: {
    da: 'Betaling og levering', en: 'Payment and delivery', de: 'Zahlung und Lieferung', it: 'Pagamento e consegna', hu: 'Fizetés és szállítás', sv: 'Betalning och leverans', fr: 'Paiement et livraison', pl: 'Płatność i dostawa', cs: 'Platba a dodání',
  },
  termination: {
    da: 'Opsigelse og afsluttende vilkår', en: 'Termination and final terms', de: 'Kündigung und Schlussbestimmungen', it: 'Recesso e condizioni finali', hu: 'Felmondás és záró feltételek', sv: 'Uppsägning och slutvillkor', fr: 'Résiliation et conditions finales', pl: 'Wypowiedzenie i warunki końcowe', cs: 'Ukončení a závěrečná ustanovení',
  },
};

// Contract prose is rendered from one canonical template. Keep placeholders intact
// so localized sentences still receive the same contract-specific values.
const ENGLISH_CONTRACT_TEXT: Record<string, string> = {
  'Kontrakt, punkt 1, 2 og 10': 'Contract, sections 1, 2 and 10',
  'Kontrakt, punkt 3 + Bilag 3': 'Contract, section 3 + Appendix 3',
  'Kontrakt, punkt 4 + Bilag 2': 'Contract, section 4 + Appendix 2',
  'Kontrakt, punkt 5': 'Contract, section 5',
  'Kontrakt, punkt 6 og 8 + Bilag 1': 'Contract, sections 6 and 8 + Appendix 1',
  'Kontrakt, punkt 7 og 7.1': 'Contract, sections 7 and 7.1',
  'Kontrakt, punkt 9 + Bilag 4': 'Contract, section 9 + Appendix 4',
  'Kontrakt, punkt 11': 'Contract, section 11',
  '1. Formål': '1. Purpose',
  'Formålet med denne kontrakt er at fastlægge vilkårene for samarbejdet mellem Timan A/S og {{companyName}}, herefter nævnt som {{partnerSingular}}, vedrørende salg af Timan-maskiner og tilhørende produkter.': 'The purpose of this agreement is to set out the terms of cooperation between Timan A/S and {{companyName}}, hereinafter referred to as {{partnerSingular}}, concerning the sale of Timan machines and related products.',
  '2. Priser, ordre og {{partnerSingular}}portal': '2. Prices, orders and the {{partnerSingular}} portal',
  'Der arbejdes altid efter til enhver tid gældende prisliste.': 'The price list in force at the relevant time shall always apply.',
  'Ved prisreguleringer reguleres priserne på afgivende ordre, til levering med 3 måneders horisont eller derover.': 'In the event of price adjustments, prices for orders with a delivery horizon of three months or more shall be adjusted.',
  'Ved ordre udfyldes prislisteformularen og sendes til Timan’s sælger som bekræftet ordre.': 'When placing an order, the price-list form shall be completed and sent to Timan’s sales representative as a confirmed order.',
  'Prislisten findes på {{partnerPortal}}, som kun {{partnerPlural}} har adgang til.': 'The price list is available on the {{partnerPortal}}, which only {{partnerPlural}} can access.',
  'På {{partnerPortal}} findes også salgsmateriale og service oplysninger': 'The {{partnerPortal}} also contains sales material and service information.',
  '10. Årligt {{partnerAnnualMeeting}}': '10. Annual {{partnerAnnualMeeting}}',
  'Et årligt {{partnerAnnualMeeting}} afholdes i perioden oktober - februar enten fysisk eller via Teams.': 'An annual {{partnerAnnualMeeting}} is held between October and February, either in person or through Teams.',
  '{{partnerDefiniteCapitalized}} forpligter sig til at levere firma- og kontaktoplysninger via QR-kode nederst på siden.': '{{partnerDefiniteCapitalized}} undertakes to provide company and contact information through the QR code at the bottom of the page.',
  'Vi forventer, at de involverede personer tilmelder sig vores nyhedsbrev, hvor der kommer relevante {{partnerSingular}}informationer.': 'We expect the relevant persons to subscribe to our newsletter, where relevant {{partnerSingular}} information is published.',
  '(Vi deler ikke personoplysninger med tredje part, QR-kode også nederst på siden)': '(We do not share personal data with third parties; the QR code is also shown at the bottom of the page.)',
  'Gennemgang af årets resultater.': 'Review of the year’s results.',
  'Budgetgennemgang': 'Budget review.',
  'Gennemgang af planlagte aktiviteter.': 'Review of planned activities.',
  '{{partnerDefiniteCapitalized}} forpligter sig til at udfylde et kort spørgeskema vedrørende samarbejdet, aktivitetsplan for det kommende år.': '{{partnerDefiniteCapitalized}} undertakes to complete a short questionnaire about the cooperation and activity plan for the coming year.',
  'Bilag 3: Området': 'Appendix 3: Territory',
  '1. Aftalen (salg og reservedele)': '1. The agreement (sales and spare parts)',
  'Inden for det primære område vil Timan ikke indgå aftaler med nye {{partnerPlural}}.': 'Within the primary territory, Timan will not enter into agreements with new {{partnerPlural}}.',
  'Slutkunden bestemmer selv, hvilken Timan-samarbejdspartner de ønsker at handle med.': 'The end customer decides which Timan partner they wish to trade with.',
  'Hvis Timan kontaktes gives dette lead til nærmeste {{partnerSingular}} ud fra kundens oplysninger.': 'If Timan is contacted, this lead is assigned to the nearest {{partnerSingular}} based on the customer’s information.',
  'Hvis en slutkunde inden for dette område ønsker at bestille reservedele via Timan’s webshop, skal dette aftales på forhånd med {{partnerDefinite}}, og {{partnerDefinite}} retter efterfølgende henvendelse til Timan - faktureringen vil ske gennem {{partnerDefinite}}.': 'If an end customer in this territory wishes to order spare parts through Timan’s webshop, this must be agreed in advance with {{partnerDefinite}}, who will then contact Timan. Invoicing will take place through {{partnerDefinite}}.',
  'Brutto prisen vil være synlig for alle, prisen til slutkunden aftales mellem {{partnerSingular}} og slutkunde.': 'The gross price will be visible to everyone; the price to the end customer is agreed between {{partnerSingular}} and the end customer.',
  '2. Området omfatter som kortet også viser:': '2. The territory includes, as the map also shows:',
  'Primære område:': 'Primary territory:',
  'Sekundær område': 'Secondary territory',
  'I dette område må {{partnerDefinite}} udføre opsøgende salg.': 'In this territory, {{partnerDefinite}} may carry out proactive sales.',
  '4. Rabatstruktur': '4. Discount structure',
  'Reservedelsrabat: {{sparePartsDiscountPct}}%.': 'Spare parts discount: {{sparePartsDiscountPct}}%.',
  'Maskiner købes gennem den autoriserede Timan-forhandler, som servicepartneren samarbejder med.': 'Machines are purchased through the authorised Timan dealer with whom the service partner cooperates.',
  'Rabat opnås baseret som følgende:': 'Discounts are granted on the following basis:',
  'Flere maskiner: Køb af flere maskiner giver yderligere rabat.': 'Multiple machines: Purchasing multiple machines gives an additional discount.',
  'Længere leveringstid: Ved leveringstid over 3 mdr. tilbydes øget rabat.': 'Longer delivery time: A greater discount is offered for delivery times exceeding three months.',
  'Salg uden demonstration: Hvis {{partnerDefinite}} opnår et salg uden, at Timan har været involveret i en demonstration, til skønnes dette med rabat.': 'Sales without demonstration: If {{partnerDefinite}} completes a sale without Timan having participated in a demonstration, this is rewarded with a discount.',
  'Se bilag 2.': 'See Appendix 2.',
  '5. Demo-maskiner': '5. Demonstration machines',
  'Det forventes at {{partnerDefinite}} investere i demo-maskiner.': '{{partnerDefiniteCapitalized}} is expected to invest in demonstration machines.',
  '{{partnerDefiniteCapitalized}} kan erhverve 1 stk. af hver maskine pr. år til demonstrations-brug.': '{{partnerDefiniteCapitalized}} may acquire one unit of each machine per year for demonstration use.',
  'Demo-maskiner må ikke videresælges før 9 måneder efter levering fra Timan A/S.': 'Demonstration machines may not be resold until nine months after delivery from Timan A/S.',
  'Overholdes dette ikke vil Timan opkræve differencen til den almindelige maskinrabat.': 'If this is not observed, Timan will charge the difference up to the ordinary machine discount.',
  'Demonstrationsmaskinerabat: 25 %–10 %.': 'Demonstration machine discount: 25%–10%.',
  '6. Reservedele og Service': '6. Spare parts and service',
  '{{partnerDefiniteCapitalized}} forpligter sig til at varetage alt support omkring service og reservedele f.eks. :': '{{partnerDefiniteCapitalized}} undertakes to provide all support relating to service and spare parts, for example:',
  'Reservedele bestilles via Timan A/S\' webshop.': 'Spare parts are ordered through Timan A/S’ webshop.',
  'Rabat på reservedele følger grundrabatten, der er gældende for maskiner.': 'The discount on spare parts follows the base discount applicable to machines.',
  'Levering af reservedele er frit leveret med den transportør, der vælges af Timan. Timan betaler fragt tur/retur for reklamationsdele i forbindelse med godkendt reklamation.': 'Spare parts are delivered free of charge by the carrier selected by Timan. Timan pays return freight for claim parts in connection with an approved claim.',
  '8. Salgs- og servicedage': '8. Sales and service days',
  '{{partnerDefiniteCapitalized}} forpligter sig til at have mindst én sælger/demonstratør samt servicetekniker til at være:': '{{partnerDefiniteCapitalized}} undertakes to ensure that at least one salesperson/demonstrator and one service technician are:',
  'Opdateret på Timan’s produkter + To salgsdage ved Timan A/S i Tim det første år.': 'Up to date with Timan’s products, plus two sales days at Timan A/S in Tim in the first year.',
  'Opdateret med teknisk viden på Timan’s produkter + En service dag ved Timan A/S i Tim det første år.': 'Up to date with technical knowledge of Timan’s products, plus one service day at Timan A/S in Tim in the first year.',
  'Efterfølgende forpligtes der hermed til at deltage i salgs- og servicedage, hvis Timan A/S indkalder til dette.': 'Thereafter, participation in sales and service days is required when Timan A/S convenes them.',
  'Bilag 1: Service og garanti betingelser': 'Appendix 1: Service and warranty terms',
  '1. Reklamation': '1. Claims',
  'Før start af reklamation kontaktes Timan, og forløbet aftales mellem parterne.': 'Before claim work begins, Timan must be contacted and the process agreed between the parties.',
  '2. Garanti registreringer': '2. Warranty registrations',
  '3. Godtgørelse': '3. Compensation',
  '4. Timeløn og Transport': '4. Hourly pay and transport',
  'Redskaber fra tredjepartsproducenter': 'Equipment from third-party manufacturers',
  '8. Kontakt': '8. Contact',
  'En reklamation må ikke påbegyndes inden Timan har udstedt en reklamations nummer.': 'A claim may not be commenced before Timan has issued a claim number.',
  'Ved akut udkald kontaktes Timan ved først kommende lejlighed for at aftale det videre forløb.': 'In the event of an urgent call-out, Timan shall be contacted at the earliest opportunity to agree the further process.',
  'Reklamationer må kun udføres af autoriseret Timan forhandler.': 'Claims may only be carried out by an authorised Timan dealer.',
  'Reklamationssager behandles i samarbejde med {{partnerDefinite}} for at sikre en hurtig og effektiv løsning.': 'Claim cases are handled in cooperation with {{partnerDefinite}} to ensure a fast and efficient solution.',
  'Alle garantiregistreringer skal udføres af {{partnerDefinite}} med fakturadato fra {{partnerSingular}} til slutkunden.  Registreringen foretages via Forms-formularen, som kan tilgås via linket på {{partnerPortal}}, eller ved hjælp af QR -koden, der findes i alle manualer, der følger med maskinen.': 'All warranty registrations must be completed by {{partnerDefinite}} with the invoice date from {{partnerSingular}} to the end customer. Registration is completed through the Forms form, available from the link on {{partnerPortal}} or by the QR code in every manual supplied with the machine.',
  '2.1 Garantibetingelser for demomaskiner:': '2.1 Warranty terms for demonstration machines:',
  'Der ydes maksimalt 24 måneders garanti på demomaskiner regnet fra fakturadato til {{partnerDefinite}}.': 'A maximum 24-month warranty is provided for demonstration machines, calculated from the invoice date to {{partnerDefinite}}.',
  'Ved salg af demomaskiner efter 9-12 måneder gives 12 måneders garanti fra Timan.': 'When demonstration machines are sold after 9-12 months, Timan provides a 12-month warranty.',
  'Ved salg efter 12 måneder reduceres garantiperioden tilsvarende med 1 måneder for hver efterfølgende måned, maskinen er i brug før salget.': 'When sold after 12 months, the warranty period is reduced by one month for each additional month the machine has been in use before the sale.',
  'Udlejes demomaskinen yders der 12 måneders garanti fra fakturadato til {{partnerDefinite}}.': 'If the demonstration machine is rented out, a 12-month warranty is provided from the invoice date to {{partnerDefinite}}.',
  'Godtgørelse dækkes via kreditnota.': 'Compensation is covered by credit note.',
  'Reklamationsdelen skal opbevares i minimum 6 måneder eller sendes til Timan på foranledning af serviceafdelingen hos Timan.': 'The claim part must be retained for at least six months or sent to Timan at the request of Timan’s service department.',
  'Timan betaler {{serviceHourlyRateDkk}} pr. forbrugt time i forbindelse med udbedring af reklamationer.': 'Timan pays {{serviceHourlyRateDkk}} per hour worked in connection with the remedy of claims.',
  'Timesatsen er baseret på dækning af de interne udgifter': 'The hourly rate is based on covering internal costs.',
  'Maksimalt 6 timers kørsel pr. reklamation dækkes af Timan. {{serviceHourlyRateDkk}} pr. køretime.': 'Timan covers a maximum of six driving hours per claim. {{serviceHourlyRateDkk}} per driving hour.',
  'Timan dækker ikke transportomkostninger for maskinen eller andre følgeomkostninger i forbindelse med reklamationer.': 'Timan does not cover transportation costs for the machine or other consequential costs in connection with claims.',
  'Timan tilbyder udvalgte redskaber og tilbehør, som produceres af eksterne tredjepartsproducenter og indkøbes af Timan til videresalg.': 'Timan offers selected equipment and accessories manufactured by external third-party manufacturers and purchased by Timan for resale.',
  'For disse produkter gælder, at reservedele som udgangspunkt skal bestilles og købes direkte hos den pågældende producent eller dennes anviste reservedelskanal.': 'For these products, spare parts must generally be ordered and purchased directly from the relevant manufacturer or its designated spare-parts channel.',
  'Timan kan for udvalgte tredjepartsprodukter stille reservedelskataloger, reservedelsnumre, teknisk dokumentation eller anden relevant information til rådighed via Timans reservedelsportal. Denne information stilles til rådighed som hjælp til identifikation af korrekte reservedele og som vejledning i forbindelse med service og vedligeholdelse.': 'For selected third-party products, Timan may provide spare-parts catalogues, part numbers, technical documentation or other relevant information through Timan’s spare-parts portal. This information is provided to help identify the correct spare parts and to guide service and maintenance.',
  'At reservedelsinformation er tilgængelig via Timans reservedelsportal betyder ikke, at de pågældende reservedele lagerføres eller sælges af Timan. Bestilling og køb af reservedele til disse tredjepartsprodukter skal ske direkte hos producenten eller via den kanal, producenten har anvist.': 'The availability of spare-parts information through Timan’s spare-parts portal does not mean that the relevant spare parts are stocked or sold by Timan. Spare parts for these third-party products must be ordered and purchased directly from the manufacturer or through the channel designated by the manufacturer.',
  'Serviceafdelingen kontaktes pr telefon eller på mail Service@timan.dk': 'Contact the service department by telephone or email at Service@timan.dk.',
  '7. Marketingforpligtelser {{partnerLabel}}': '7. Marketing obligations of {{partnerLabel}}',
  '7.1 Marketingforpligtelser Timan': '7.1 Marketing obligations of Timan',
  '{{partnerDefiniteCapitalized}} skal promovere Timan A/S\' brand med tekst og billeder på {{partnerPossessive}} hjemmeside.': '{{partnerDefiniteCapitalized}} shall promote the Timan A/S brand with text and images on {{partnerPossessive}} website.',
  'De nyeste billeder af Timan-maskiner og redskaber skal løbende opdateres ved ændringer.': 'The latest images of Timan machines and equipment must be updated continuously when changes occur.',
  'Brugen af Timan-logo, farver og design skal være på hjemmesiden og altid i den nyeste version.': 'The Timan logo, colours and design must be used on the website and always in the latest version.',
  '{{partnerPossessiveCapitalized}} oplysninger (navn og adresse) vil blive fremhævet på Timans officielle hjemmeside.': '{{partnerPossessiveCapitalized}} details (name and address) will be highlighted on Timan’s official website.',
  'Adgang til Timans digitale platforme for markedsføringsmateriale.': 'Access to Timan’s digital platforms for marketing material.',
  'Timan stiller brochurer og andet digitalt salgsmateriale til rådighed.': 'Timan provides brochures and other digital sales material.',
  '9. Betaling og Levering': '9. Payment and delivery',
  'Bilag 4: Salgs- og leveringsbetingelser': 'Appendix 4: Terms of sale and delivery',
  '11. Varighed og opsigelse': '11. Duration and termination',
};

const GERMAN_CONTRACT_TEXT: Record<string, string> = {
  'Kontrakt, punkt 1, 2 og 10': 'Vertrag, Punkte 1, 2 und 10',
  'Kontrakt, punkt 3 + Bilag 3': 'Vertrag, Punkt 3 + Anhang 3',
  'Kontrakt, punkt 4 + Bilag 2': 'Vertrag, Punkt 4 + Anhang 2',
  'Kontrakt, punkt 5': 'Vertrag, Punkt 5',
  'Kontrakt, punkt 6 og 8 + Bilag 1': 'Vertrag, Punkte 6 und 8 + Anhang 1',
  'Kontrakt, punkt 7 og 7.1': 'Vertrag, Punkte 7 und 7.1',
  'Kontrakt, punkt 9 + Bilag 4': 'Vertrag, Punkt 9 + Anhang 4',
  'Kontrakt, punkt 11': 'Vertrag, Punkt 11',
  '1. Formål': '1. Zweck',
  'Formålet med denne kontrakt er at fastlægge vilkårene for samarbejdet mellem Timan A/S og {{companyName}}, herefter nævnt som {{partnerSingular}}, vedrørende salg af Timan-maskiner og tilhørende produkter.': 'Zweck dieses Vertrags ist es, die Bedingungen der Zusammenarbeit zwischen Timan A/S und {{companyName}}, nachfolgend {{partnerSingular}} genannt, über den Verkauf von Timan-Maschinen und zugehörigen Produkten festzulegen.',
  '2. Priser, ordre og {{partnerSingular}}portal': '2. Preise, Bestellungen und {{partnerSingular}}portal',
  'Der arbejdes altid efter til enhver tid gældende prisliste.': 'Es gilt stets die jeweils gültige Preisliste.',
  'Ved prisreguleringer reguleres priserne på afgivende ordre, til levering med 3 måneders horisont eller derover.': 'Bei Preisänderungen werden die Preise für Bestellungen mit einem Lieferhorizont von drei Monaten oder mehr angepasst.',
  'Ved ordre udfyldes prislisteformularen og sendes til Timan’s sælger som bekræftet ordre.': 'Bei einer Bestellung wird das Preislistenformular ausgefüllt und als bestätigte Bestellung an den Timan-Verkäufer gesendet.',
  'Prislisten findes på {{partnerPortal}}, som kun {{partnerPlural}} har adgang til.': 'Die Preisliste befindet sich im {{partnerPortal}}, zu dem nur {{partnerPlural}} Zugang haben.',
  'På {{partnerPortal}} findes også salgsmateriale og service oplysninger': 'Im {{partnerPortal}} finden sich auch Verkaufsunterlagen und Serviceinformationen.',
  '10. Årligt {{partnerAnnualMeeting}}': '10. Jährliches {{partnerAnnualMeeting}}',
  'Et årligt {{partnerAnnualMeeting}} afholdes i perioden oktober - februar enten fysisk eller via Teams.': 'Ein jährliches {{partnerAnnualMeeting}} findet im Zeitraum Oktober bis Februar entweder vor Ort oder über Teams statt.',
  'Gennemgang af årets resultater.': 'Überprüfung der Jahresergebnisse.',
  'Budgetgennemgang': 'Budgetüberprüfung.',
  'Gennemgang af planlagte aktiviteter.': 'Überprüfung der geplanten Aktivitäten.',
  'Bilag 3: Området': 'Anhang 3: Das Gebiet',
  '1. Aftalen (salg og reservedele)': '1. Die Vereinbarung (Verkauf und Ersatzteile)',
  'Inden for det primære område vil Timan ikke indgå aftaler med nye {{partnerPlural}}.': 'Innerhalb des primären Gebiets wird Timan keine Vereinbarungen mit neuen {{partnerPlural}} schließen.',
  'Slutkunden bestemmer selv, hvilken Timan-samarbejdspartner de ønsker at handle med.': 'Der Endkunde entscheidet selbst, mit welchem Timan-Partner er handeln möchte.',
  'Hvis Timan kontaktes gives dette lead til nærmeste {{partnerSingular}} ud fra kundens oplysninger.': 'Wird Timan kontaktiert, wird dieser Lead anhand der Kundendaten dem nächstgelegenen {{partnerSingular}} zugeteilt.',
  '2. Området omfatter som kortet også viser:': '2. Das Gebiet umfasst, wie die Karte ebenfalls zeigt:',
  'Primære område:': 'Primäres Gebiet:',
  'Sekundær område': 'Sekundäres Gebiet',
  'I dette område må {{partnerDefinite}} udføre opsøgende salg.': 'In diesem Gebiet darf {{partnerDefinite}} aktive Verkaufsarbeit leisten.',
  '4. Rabatstruktur': '4. Rabattstruktur',
  'Reservedelsrabat: {{sparePartsDiscountPct}}%.': 'Ersatzteilrabatt: {{sparePartsDiscountPct}}%.',
  'Maskiner købes gennem den autoriserede Timan-forhandler, som servicepartneren samarbejder med.': 'Maschinen werden über den autorisierten Timan-Händler gekauft, mit dem der Servicepartner zusammenarbeitet.',
  'Rabat opnås baseret som følgende:': 'Rabatte werden auf folgender Grundlage gewährt:',
  'Flere maskiner: Køb af flere maskiner giver yderligere rabat.': 'Mehrere Maschinen: Der Kauf mehrerer Maschinen gewährt einen zusätzlichen Rabatt.',
  'Længere leveringstid: Ved leveringstid over 3 mdr. tilbydes øget rabat.': 'Längere Lieferzeit: Bei einer Lieferzeit von mehr als drei Monaten wird ein höherer Rabatt angeboten.',
  'Salg uden demonstration: Hvis {{partnerDefinite}} opnår et salg uden, at Timan har været involveret i en demonstration, til skønnes dette med rabat.': 'Verkauf ohne Demonstration: Erzielt {{partnerDefinite}} einen Verkauf, ohne dass Timan an einer Demonstration beteiligt war, wird dies mit einem Rabatt honoriert.',
  'Se bilag 2.': 'Siehe Anhang 2.',
  '5. Demo-maskiner': '5. Demomaschinen',
  'Det forventes at {{partnerDefinite}} investere i demo-maskiner.': 'Von {{partnerDefinite}} wird erwartet, in Demomaschinen zu investieren.',
  '{{partnerDefiniteCapitalized}} kan erhverve 1 stk. af hver maskine pr. år til demonstrations-brug.': '{{partnerDefiniteCapitalized}} kann jährlich ein Stück jeder Maschine für Demonstrationszwecke erwerben.',
  'Demo-maskiner må ikke videresælges før 9 måneder efter levering fra Timan A/S.': 'Demomaschinen dürfen erst neun Monate nach Lieferung durch Timan A/S weiterverkauft werden.',
  'Overholdes dette ikke vil Timan opkræve differencen til den almindelige maskinrabat.': 'Bei Nichteinhaltung wird Timan die Differenz zum regulären Maschinenrabatt berechnen.',
  'Demonstrationsmaskinerabat: 25 %–10 %.': 'Demomaschinenrabatt: 25 %–10 %.',
  '6. Reservedele og Service': '6. Ersatzteile und Service',
  'Reservedele bestilles via Timan A/S\' webshop.': 'Ersatzteile werden über den Webshop von Timan A/S bestellt.',
  'Rabat på reservedele følger grundrabatten, der er gældende for maskiner.': 'Der Rabatt auf Ersatzteile folgt dem für Maschinen geltenden Grundrabatt.',
  '8. Salgs- og servicedage': '8. Verkaufs- und Servicetage',
  'Bilag 1: Service og garanti betingelser': 'Anhang 1: Service- und Garantiebedingungen',
  '1. Reklamation': '1. Reklamationen',
  'Før start af reklamation kontaktes Timan, og forløbet aftales mellem parterne.': 'Vor Beginn der Reklamationsarbeiten wird Timan kontaktiert und der Ablauf zwischen den Parteien vereinbart.',
  '2. Garanti registreringer': '2. Garantieregistrierungen',
  '3. Godtgørelse': '3. Vergütung',
  '4. Timeløn og Transport': '4. Stundenlohn und Transport',
  'Redskaber fra tredjepartsproducenter': 'Geräte von Drittanbietern',
  '8. Kontakt': '8. Kontakt',
  '{{partnerDefiniteCapitalized}} forpligter sig til at varetage alt support omkring service og reservedele f.eks. :': '{{partnerDefiniteCapitalized}} verpflichtet sich, sämtliche Unterstützung rund um Service und Ersatzteile zu übernehmen, zum Beispiel:',
  'Levering af reservedele er frit leveret med den transportør, der vælges af Timan. Timan betaler fragt tur/retur for reklamationsdele i forbindelse med godkendt reklamation.': 'Ersatzteile werden mit dem von Timan gewählten Transportdienstleister frei Haus geliefert. Timan übernimmt bei anerkannten Reklamationen die Hin- und Rückfracht für Reklamationsteile.',
  '{{partnerDefiniteCapitalized}} forpligter sig til at have mindst én sælger/demonstratør samt servicetekniker til at være:': '{{partnerDefiniteCapitalized}} verpflichtet sich, mindestens einen Verkäufer/Demonstrator sowie einen Servicetechniker zu haben, die:',
  'Opdateret på Timan’s produkter + To salgsdage ved Timan A/S i Tim det første år.': 'über die Produkte von Timan auf dem neuesten Stand sind, sowie im ersten Jahr zwei Verkaufstage bei Timan A/S in Tim absolvieren.',
  'Opdateret med teknisk viden på Timan’s produkter + En service dag ved Timan A/S i Tim det første år.': 'über aktuelles technisches Wissen zu den Produkten von Timan verfügen sowie im ersten Jahr einen Servicetag bei Timan A/S in Tim absolvieren.',
  'Efterfølgende forpligtes der hermed til at deltage i salgs- og servicedage, hvis Timan A/S indkalder til dette.': 'Danach besteht die Verpflichtung zur Teilnahme an Verkaufs- und Servicetagen, wenn Timan A/S dazu einlädt.',
  'En reklamation må ikke påbegyndes inden Timan har udstedt en reklamations nummer.': 'Reklamationsarbeiten dürfen erst beginnen, nachdem Timan eine Reklamationsnummer vergeben hat.',
  'Ved akut udkald kontaktes Timan ved først kommende lejlighed for at aftale det videre forløb.': 'Bei einem dringenden Einsatz ist Timan bei nächster Gelegenheit zu kontaktieren, um das weitere Vorgehen abzustimmen.',
  'Reklamationer må kun udføres af autoriseret Timan forhandler.': 'Reklamationen dürfen nur von einem autorisierten Timan-Händler durchgeführt werden.',
  'Reklamationssager behandles i samarbejde med {{partnerDefinite}} for at sikre en hurtig og effektiv løsning.': 'Reklamationsfälle werden in Zusammenarbeit mit {{partnerDefinite}} bearbeitet, um eine schnelle und effiziente Lösung sicherzustellen.',
  'Alle garantiregistreringer skal udføres af {{partnerDefinite}} med fakturadato fra {{partnerSingular}} til slutkunden.  Registreringen foretages via Forms-formularen, som kan tilgås via linket på {{partnerPortal}}, eller ved hjælp af QR -koden, der findes i alle manualer, der følger med maskinen.': 'Alle Garantieregistrierungen müssen von {{partnerDefinite}} mit dem Rechnungsdatum von {{partnerSingular}} an den Endkunden durchgeführt werden. Die Registrierung erfolgt über das Forms-Formular, das über den Link auf {{partnerPortal}} oder den QR-Code in jeder mit der Maschine gelieferten Anleitung verfügbar ist.',
  '2.1 Garantibetingelser for demomaskiner:': '2.1 Garantiebedingungen für Demomaschinen:',
  'Der ydes maksimalt 24 måneders garanti på demomaskiner regnet fra fakturadato til {{partnerDefinite}}.': 'Für Demomaschinen wird ab Rechnungsdatum an {{partnerDefinite}} eine Garantie von maximal 24 Monaten gewährt.',
  'Ved salg af demomaskiner efter 9-12 måneder gives 12 måneders garanti fra Timan.': 'Beim Verkauf von Demomaschinen nach 9-12 Monaten gewährt Timan eine Garantie von 12 Monaten.',
  'Ved salg efter 12 måneder reduceres garantiperioden tilsvarende med 1 måneder for hver efterfølgende måned, maskinen er i brug før salget.': 'Bei einem Verkauf nach 12 Monaten verkürzt sich die Garantiezeit für jeden weiteren Monat, in dem die Maschine vor dem Verkauf genutzt wurde, um einen Monat.',
  'Udlejes demomaskinen yders der 12 måneders garanti fra fakturadato til {{partnerDefinite}}.': 'Wird die Demomaschine vermietet, wird ab Rechnungsdatum an {{partnerDefinite}} eine Garantie von 12 Monaten gewährt.',
  'Godtgørelse dækkes via kreditnota.': 'Die Vergütung erfolgt über eine Gutschrift.',
  'Reklamationsdelen skal opbevares i minimum 6 måneder eller sendes til Timan på foranledning af serviceafdelingen hos Timan.': 'Das Reklamationsteil ist mindestens sechs Monate aufzubewahren oder auf Anforderung der Serviceabteilung von Timan an Timan zu senden.',
  'Timan betaler {{serviceHourlyRateDkk}} pr. forbrugt time i forbindelse med udbedring af reklamationer.': 'Timan zahlt {{serviceHourlyRateDkk}} pro geleisteter Stunde für die Behebung von Reklamationen.',
  'Timesatsen er baseret på dækning af de interne udgifter': 'Der Stundensatz basiert auf der Deckung der internen Kosten.',
  'Maksimalt 6 timers kørsel pr. reklamation dækkes af Timan. {{serviceHourlyRateDkk}} pr. køretime.': 'Timan übernimmt maximal sechs Fahrstunden pro Reklamation. {{serviceHourlyRateDkk}} pro Fahrstunde.',
  'Timan dækker ikke transportomkostninger for maskinen eller andre følgeomkostninger i forbindelse med reklamationer.': 'Timan übernimmt keine Transportkosten für die Maschine oder sonstige Folgekosten im Zusammenhang mit Reklamationen.',
  'Timan tilbyder udvalgte redskaber og tilbehør, som produceres af eksterne tredjepartsproducenter og indkøbes af Timan til videresalg.': 'Timan bietet ausgewählte Geräte und Zubehör an, die von externen Drittanbietern hergestellt und von Timan zum Wiederverkauf eingekauft werden.',
  'For disse produkter gælder, at reservedele som udgangspunkt skal bestilles og købes direkte hos den pågældende producent eller dennes anviste reservedelskanal.': 'Für diese Produkte gilt, dass Ersatzteile grundsätzlich direkt beim jeweiligen Hersteller oder über dessen vorgesehenen Ersatzteilkanal bestellt und gekauft werden müssen.',
  'Timan kan for udvalgte tredjepartsprodukter stille reservedelskataloger, reservedelsnumre, teknisk dokumentation eller anden relevant information til rådighed via Timans reservedelsportal. Denne information stilles til rådighed som hjælp til identifikation af korrekte reservedele og som vejledning i forbindelse med service og vedligeholdelse.': 'Für ausgewählte Drittanbieterprodukte kann Timan über das Ersatzteilportal Ersatzteilkataloge, Teilenummern, technische Dokumentation oder andere relevante Informationen bereitstellen. Diese Informationen dienen der Identifikation der richtigen Ersatzteile und als Anleitung für Service und Wartung.',
  'At reservedelsinformation er tilgængelig via Timans reservedelsportal betyder ikke, at de pågældende reservedele lagerføres eller sælges af Timan. Bestilling og køb af reservedele til disse tredjepartsprodukter skal ske direkte hos producenten eller via den kanal, producenten har anvist.': 'Die Verfügbarkeit von Ersatzteilinformationen über das Ersatzteilportal von Timan bedeutet nicht, dass die betreffenden Ersatzteile von Timan gelagert oder verkauft werden. Ersatzteile für diese Drittanbieterprodukte müssen direkt beim Hersteller oder über den vom Hersteller vorgesehenen Kanal bestellt und gekauft werden.',
  'Serviceafdelingen kontaktes pr telefon eller på mail Service@timan.dk': 'Die Serviceabteilung erreichen Sie telefonisch oder per E-Mail unter Service@timan.dk.',
  '7. Marketingforpligtelser {{partnerLabel}}': '7. Marketingpflichten von {{partnerLabel}}',
  '7.1 Marketingforpligtelser Timan': '7.1 Marketingpflichten von Timan',
  '{{partnerDefiniteCapitalized}} skal promovere Timan A/S\' brand med tekst og billeder på {{partnerPossessive}} hjemmeside.': '{{partnerDefiniteCapitalized}} verpflichtet sich, die Marke Timan A/S mit Texten und Bildern auf der Website {{partnerPossessive}} zu präsentieren.',
  'De nyeste billeder af Timan-maskiner og redskaber skal løbende opdateres ved ændringer.': 'Die neuesten Bilder von Timan-Maschinen und -Geräten sind bei Änderungen laufend zu aktualisieren.',
  'Brugen af Timan-logo, farver og design skal være på hjemmesiden og altid i den nyeste version.': 'Das Timan-Logo, die Farben und das Design sind auf der Website stets in der aktuellen Version zu verwenden.',
  '{{partnerPossessiveCapitalized}} oplysninger (navn og adresse) vil blive fremhævet på Timans officielle hjemmeside.': 'Die Angaben von {{partnerPossessive}} (Name und Adresse) werden auf der offiziellen Website von Timan hervorgehoben.',
  'Adgang til Timans digitale platforme for markedsføringsmateriale.': 'Zugang zu den digitalen Plattformen von Timan für Marketingmaterial.',
  'Timan stiller brochurer og andet digitalt salgsmateriale til rådighed.': 'Timan stellt Broschüren und weiteres digitales Verkaufsmaterial zur Verfügung.',
  '9. Betaling og Levering': '9. Zahlung und Lieferung',
  'Bilag 4: Salgs- og leveringsbetingelser': 'Anhang 4: Verkaufs- und Lieferbedingungen',
  '11. Varighed og opsigelse': '11. Laufzeit und Kündigung',
};

// Step 8 contains the complete sales and delivery appendix. It intentionally
// lives beside the shared contract template so every renderer (wizard, review
// and PDF preview) resolves the same canonical legal copy.
const PAYMENT_DELIVERY_CONTRACT_TEXT: Partial<Record<ContractTextLanguage, Record<string, string>>> = {
  en: {
    '9. Betaling og Levering': '9. Payment and delivery',
    'Maskiner og udstyr leveres i henhold til FCA Tim (Free Carrier) – Incoterms® 2020. Reservedele leveres i henhold til CPT': 'Machines and equipment are delivered FCA Tim (Free Carrier) – Incoterms® 2020. Spare parts are delivered CPT',
    'Tim (Carriage Paid To) – Incoterms® 2020.': 'Tim (Carriage Paid To) – Incoterms® 2020.',
    'Se mere om leveringsbetingelser: bilag 4.': 'See Appendix 4 for further delivery terms.',
    'Opstart af maskine pålægges et gebyr i henhold til gældende prisliste.': 'Machine commissioning is charged in accordance with the applicable price list.',
    'Ved manglende betaling vil der blive pålagt lovbestemte renter.': 'Statutory interest will be charged in the event of late payment.',
    'Bilag 4: Salgs- og leveringsbetingelser': 'Appendix 4: Terms of sale and delivery',
    'Disse almindelige Salgs- og Leveringsbetingelser (”Leveringsbetingelserne”) gælder for alle leverancer af produkter og/eller serviceydelser (”Produkter”) fra Timan A/S (betegnet Timan) til enhver kunde (”Køber”). Leveringsbetingelserne skal være gensidigt bindende for Timan og Køber, medmindre andet er udtrykkeligt aftalt. Timan er ikke bundet af vilkår fremsat af Køber, som afviger fra Leveringsbetingelserne, medmindre sådanne vilkår er aftalt skriftligt mellem Timan og Køber. Timan er heller ikke bundet af vilkår fremsat af Køber, selv om Timan ikke har gjort indsigelse mod sådanne vilkår.': 'These general Terms of Sale and Delivery (the “Terms”) apply to all deliveries of products and/or services (the “Products”) from Timan A/S (“Timan”) to any customer (the “Buyer”). The Terms are mutually binding on Timan and the Buyer unless expressly agreed otherwise. Timan is not bound by terms proposed by the Buyer that deviate from the Terms unless such terms have been agreed in writing between Timan and the Buyer. Timan is likewise not bound by terms proposed by the Buyer merely because Timan has not objected to them.',
    '1. For enhver leverance fra Timan skal nedennævnte salgs - og leveringsbetingelser være gældende, medmindre andet skriftligt er aftalt mellem parterne.': '1. The following terms of sale and delivery apply to every delivery from Timan unless otherwise agreed in writing by the parties.',
    '2. Tilbud: Tilbud fra Timan bortfalder efter 8 dage, hvis intet andet er angivet. Timan tager forbehold for mellemsalg.': '2. Offers: Offers from Timan lapse after 8 days unless otherwise stated. Timan reserves the right to prior sale.',
    '3. Materiale: Timan påtager sig intet ansvar for eventuelle fejl eller oplysninger i udleveret skriftligt materiale om produkter/elementer i produkter, udarbejdet af Timans leverandører.': '3. Material: Timan accepts no responsibility for errors or information in written material concerning products or product components prepared by Timan’s suppliers.',
    '4. Priser: Al salg sker til priser, som er gældende på leveringsdagen. Det vil sige, mellemkommende afgiftsforhø jelser, prisændringer fra Timans leverandører, kursændringer over 3%, devalueringer m.v. på den aftalte vare berettiger Timan til at forhøje prisen tilsvarende. Er priserne skriftligt bekræftet, finder ovenstående kun anvendelse efter nærmere aftale.': '4. Prices: All sales are made at the prices applicable on the delivery date. Interim tax increases, price changes from Timan’s suppliers, exchange-rate changes exceeding 3%, devaluations and similar changes affecting the agreed goods entitle Timan to increase the price accordingly. Where prices have been confirmed in writing, the above applies only by further agreement.',
    '5. Betalingsvilkår: Købesummen inklusiv alle afgifter og omkostninger betales kontant ved levering til Timan, med mindre andet aftales.': '5. Payment terms: The purchase price, including all duties and costs, is payable in cash upon delivery to Timan unless otherwise agreed.',
    '6. Levering: Levering sker i henhold til den mellem parterne aftalte leveringsbetingelse i overensstemmelse med Incoterms® 2020, medmindre andet er skriftligt aftalt.': '6. Delivery: Delivery is made in accordance with the delivery term agreed between the parties and Incoterms® 2020 unless otherwise agreed in writing.',
    'Såfremt der ikke er aftalt en specifik leveringsbetingelse, sker levering af maskiner i henhold til FCA (Free Carrier), Incoterms® 2020 , mens levering af reservedele og øvrige pakkeforsendelser sker i henhold til CPT (Carriage Paid To), Incoterms® 2020.': 'If no specific delivery term has been agreed, machines are delivered FCA (Free Carrier), Incoterms® 2020, while spare parts and other parcel deliveries are made CPT (Carriage Paid To), Incoterms® 2020.',
    'Køber kan vælge en anden leveringsbetingelse, herunder EXW (Ex Works), Incoterms® 2020 , forudsat at dette aftales skriftligt mellem parterne.': 'The Buyer may choose another delivery term, including EXW (Ex Works), Incoterms® 2020, provided that it is agreed in writing by the parties.',
    'Levering anses for sket, og risikoen for varerne overgår til køber i overensstemmelse med den aftalte leveringsbetingelse.': 'Delivery is deemed completed and risk in the goods passes to the Buyer in accordance with the agreed delivery term.',
    '7. Leveringstid, forsinkelser:  De af Timan opgivne leveringstider er alene vejledende, medmindre andet er skriftligt bekræftet. Endelig leveringstid er først bindende, når den er skriftligt bekræftet af Timan.': '7. Delivery time and delays: Delivery times stated by Timan are indicative only unless otherwise confirmed in writing. A final delivery time is binding only when confirmed in writing by Timan.',
    'Såfremt levering forsinkes som følge af forhold, der udgør ansvarsfrihed i henhold til punkt 8, eller som skyldes købers forhold, forlænges leveringstiden i det omfang, det efter omstændighederne findes rimeligt.': 'If delivery is delayed due to circumstances exempting Timan from liability under clause 8 or due to circumstances attributable to the Buyer, the delivery time is extended to the extent reasonably required by the circumstances.',
    'Forsinkelse giver ikke køber ret til at hæve købet eller kræve erstatning, medmindre andet følger af ufravigelig lovgivning.': 'Delay does not entitle the Buyer to cancel the purchase or claim damages unless mandatory law provides otherwise.',
    '8. Ansvarsfrihed (force majeure): Timan er ikke ansvarlig for manglende opfyldelse af sine forpligtelser, såfremt dette skyldes forhold uden for Timans kontrol, som Timan ikke med rimelighed kunne have forudset eller undgået ved aftalens indgåelse.': '8. Force majeure: Timan is not liable for failure to perform its obligations where this is caused by circumstances outside Timan’s control that Timan could not reasonably have foreseen or avoided when entering into the agreement.',
    'Som ansvarsfrihedsgrunde anses blandt andet, men ikke begrænset til: driftsforstyrrelser, IT -nedbrud, arbejdskonflikter, brand, krig, mobilisering, naturkatastrofer, pandemier, myndighedsindgreb, valutarestriktioner, transportvanskeligheder, mangel på arbejdskraft eller materialer, samt forsinkelser eller mangler fra underleverandører.': 'Events of force majeure include, without limitation, operational disruptions, IT failures, labour disputes, fire, war, mobilisation, natural disasters, pandemics, government intervention, currency restrictions, transport difficulties, shortages of labour or materials, and delays or defects by subcontractors.',
    'I sådanne tilfælde suspenderes Timans forpligtelser, så længe hindringen består.': 'In such cases, Timan’s obligations are suspended for as long as the impediment continues.',
    'Køber er ikke berettiget til at hæve købet, kræve erstatning eller gøre andre misligholdelsesbeføjelser gældende som følge af sådanne forhold.': 'The Buyer is not entitled to cancel the purchase, claim damages or invoke other remedies as a result of such circumstances.',
    '9. Produktansvar: Sælger påtager sig intet ansvar for skader på person eller gods ud over, hvad der følger af ufravigelig lovgivning, som sælger er underlagt i Danmark, og da kun i det omfang, det følger af sådanne regler.': '9. Product liability: The Seller accepts no liability for personal injury or property damage beyond that required by mandatory legislation applicable to the Seller in Denmark, and only to the extent required by such legislation.',
    'Sælger er ikke ansvarlig for indirekte tab, herunder følgeskader, driftstab, tabt avance eller andre økonomiske konsekvenstab.': 'The Seller is not liable for indirect loss, including consequential loss, loss of operation, loss of profit or other financial consequential loss.',
    'Sælger påtager sig ikke ansvar for skade på købers gods, der opstår i forbindelse med købers erhvervsmæssige anvendelse af det købte.': 'The Seller accepts no liability for damage to the Buyer’s property arising in connection with the Buyer’s commercial use of the purchased goods.',
    'I det omfang sælger måtte blive pålagt ansvar over for tredjemand i forbindelse med købers brug eller videresalg af det købte, er køber forpligtet til at skadesløs holde sælger  i det omfang, et sådant ansvar går ud over de ovenfor fastsatte begrænsninger.': 'To the extent that the Seller is held liable to a third party in connection with the Buyer’s use or resale of the purchased goods, the Buyer shall indemnify the Seller to the extent that such liability exceeds the limitations above.',
    'Ansvarsperioden er begrænset til 1 år fra leveringstidspunktet.': 'The period of liability is limited to one year from delivery.',
    'Sælgers samlede ansvar for produktskader kan i intet tilfælde overstige dækningssummen i sælgers produktansvarsforsikring.': 'The Seller’s total liability for product damage may in no circumstances exceed the insured amount under the Seller’s product liability insurance.',
    'Køber er forpligtet til at lade sig sagsøge ved samme domstol, som behandler erstatningskrav mod sælger i anledning af de solgte produkter. Det indbyrdes forhold mellem sælger og køber afgøres dog i henhold til punkt 16, såfremt enighed ikke kan opnås.': 'The Buyer is obliged to submit to proceedings before the same court that hears claims for damages against the Seller in relation to the goods sold. The relationship between the Seller and the Buyer is, however, determined under clause 16 if agreement cannot be reached.',
    '10. Ejendomsforbehold: Ejendomsretten over de solgte genstande forbliver hos Timan eller den, til hvem han har overdraget sine rettigheder, indtil hele købesummen med renter og omkostninger m.v. er fuldt betalt. Under ejendomsforbeholdet indgår også de ting, som måtte blive indføjet i eller senere leveret til komplettering, istandsættelse eller ændring i udstyr af de solgte genstande . Indtil hele købesummen inkl. renter og omkostninger er betalt, er køberen uberettiget til at sælge, pantsætte, udleje eller på anden måde disponere retligt over det solgte.': '10. Retention of title: Title to the goods sold remains with Timan, or the party to whom Timan has assigned its rights, until the full purchase price, interest and costs have been paid. The retention of title also covers items incorporated in or subsequently delivered to complete, repair or modify the sold equipment. Until the entire purchase price, including interest and costs, has been paid, the Buyer is not entitled to sell, pledge, rent out or otherwise legally dispose of the goods.',
    'Ved salg til Tyskland tages desuden ejendomsforbehold i den nye ting, som den solgte genstand måtte være om forarbejdet til eller blevet en bestanddel af eller til fordring på betaling af købesummen ved videresalg - dvs. Timan tager såvel simpelt ejendomsforbehold (Eigentumsvorbehalt) samt udvidet ejendomsforbehold ( erweiteter Eigentumsvorbehalt). Ejendomsforbeholdet i leverancer dækker også tidligere udækkede leverancer fra Timan til køber.': 'For sales to Germany, retention of title also applies to the new item into which the sold goods may have been processed or become a component, and to the claim for payment of the purchase price on resale. Timan therefore retains both simple retention of title (Eigentumsvorbehalt) and extended retention of title (erweiterter Eigentumsvorbehalt). The retention of title also covers earlier unpaid deliveries from Timan to the Buyer.',
    '11. Renter: Såfremt nogen ydelse eller omkostning til forfaldstid, erlægges en morarente, som udgør 2% pr. påbegyndt måned af det forfaldne beløb.': '11. Interest: If any payment or cost is not paid when due, default interest of 2% of the overdue amount is charged for each commenced month.',
    '12. Forsikring: Så længe den fulde købesum med tillæg af renter og omkostninger ikke er betalt, er køberen pligtig til at tegne sædvanlig brand- og tyveriforsikring for det købte.': '12. Insurance: Until the full purchase price, including interest and costs, has been paid, the Buyer must maintain customary fire and theft insurance for the purchased goods.',
    'Køber bærer risikoen for det købte i overensstemmelse med den aftalte leveringsbetingelse.': 'The Buyer bears the risk for the purchased goods in accordance with the agreed delivery term.',
    '13. Service og reklamationsbestemmelser: For nye maskiner ombytter Timan  i 12 måneder fra ibrugtagningsdagen  eller indtil det timetal der er anført i produktets brugermanual, det der kommer først , dele der er defekte på grund af materiale, monterings- eller fabrikationsfejl.': '13. Service and claims provisions: For new machines, Timan replaces parts defective due to material, assembly or manufacturing defects for 12 months from commissioning or until the operating hours stated in the product user manual, whichever occurs first.',
    'Ibrugtagningsdagen er iht. garantiregistrering foretaget til Timan. Er garantiregistrering ikke foretaget til Timan beregnes ibrugtagningsdagen fra leveringsdatoen.': 'The commissioning date is the date registered with Timan in the warranty registration. If no warranty registration has been made with Timan, the commissioning date is calculated from the delivery date.',
    'Ombytning finder ikke sted på grund af normalt slid, - hvis fejlen skyldes vanrøgt, - at købe ren ikke har fulgt instruktioner eller produktets serviceplan iht. produktets brugermanual  fra Timan  eller der er anvendt uoriginale reservedele.': 'Replacement is not provided for normal wear, defects caused by neglect, failure by the Buyer to follow the instructions or the product service plan in Timan’s user manual, or use of non-original spare parts.',
    'For vurdering af en reklamation stiller Køber ved påkrav fra Timan, dokumentation for gennemførte servicearbejder til rådighed i form af udstedte fakturaer på servicearbejder samt udfyldte servicehæfte.  Kan ovennævnte dokumentation ikke fremskaffes er Timan berettiget til uden yderligere begrundelse at afvise en given reklamation.': 'For assessment of a claim, the Buyer must, at Timan’s request, provide documentation of completed service work in the form of issued service invoices and completed service records. If this documentation cannot be provided, Timan may reject the claim without further justification.',
    'Udgifter til arbejdsløn samt udgifter i forbindelse med udskiftning af en reklamationsberettiget  vare dækkes kun efter anden aftale.': 'Labour costs and costs related to replacement of a claim-eligible item are covered only by separate agreement.',
    'For driftstab og andre indirekte tab i forbindelse med mangler ved det solgte ydes ingen erstatning. For elektriske  og hydrauliske anlæg, dæk og slanger gælder de respektive fabrikkers service- og reklamationsbestemmelser.': 'No compensation is provided for loss of operation or other indirect loss arising from defects in the goods sold. The respective manufacturers’ service and claims provisions apply to electrical and hydraulic systems, tyres and hoses.',
    'Reklamationsarbejder skal udføres iht. Timans reklamationsprocedure.': 'Claim work must be performed in accordance with Timan’s claims procedure.',
    '14. Reklamationsprocedure: Før reklamationsarbejdet påbegyndes, kontaktes Timan enten pr. telefon eller ved tilsendelse af delvist udfyldt reklamationsrapport.': '14. Claims procedure: Before claim work begins, Timan must be contacted by telephone or by sending a partially completed claim report.',
    'Efter henvendelse eller modtagelse af rapport udsteder Timan et reklamationsnummer.': 'Following contact or receipt of the report, Timan issues a claim number.',
    'Timan skal ved enhver reklamation have mulighed for at give anvisninger på reklamationsarbejdets udførelse.': 'For every claim, Timan must have the opportunity to give instructions for carrying out the claim work.',
    'Efter udstedelse af reklamationsnummer, tilsendes Timan endelig reklamationsrapport inden 8 dage.': 'After a claim number has been issued, the final claim report must be sent to Timan within 8 days.',
    '15. Ansvar: Timan har, ud over hvad der følger af punkt 9, intet ansvar for indirekte tab, herunder driftstab, tabt arbejdsfortjeneste og andre økonomiske konsekvenstab.': '15. Liability: In addition to clause 9, Timan accepts no liability for indirect loss, including loss of operation, lost earnings and other financial consequential loss.',
    '16. Lovvalg og værneting:  Nærværende almindelige salgs- og leveringsbetingelser skal være gældende for enhver tvist parterne imellem, men er et forhold ikke omtalt i leveringsbetingelserne, finder Den Danske Købelov, lov nr. 120 af 06.04.1906, med efterfølgende supplerende ændringer, og i øvrigt dansk ret, anvendelse.  Tvistigheder i anledning af købsaftalen eller nærværende salgs - og leveringsbetingelser kan efter Sælgers valg underkastes domstolsprøvelse eller afgøres endeligt ved voldgift i overensstemmelse med reglerne i Lov nr. 181 at 24.05.1972 om voldgift.': '16. Governing law and venue: These general terms of sale and delivery apply to all disputes between the parties. Where a matter is not addressed in the Terms, the Danish Sale of Goods Act, Act No. 120 of 6 April 1906, as subsequently amended, and otherwise Danish law apply. Disputes arising from the purchase agreement or these Terms may, at the Seller’s option, be submitted to the courts or finally settled by arbitration under Act No. 181 of 24 May 1972 on arbitration.',
  },
  de: {
    '9. Betaling og Levering': '9. Zahlung und Lieferung',
    'Maskiner og udstyr leveres i henhold til FCA Tim (Free Carrier) – Incoterms® 2020. Reservedele leveres i henhold til CPT': 'Maschinen und Ausrüstung werden FCA Tim (Free Carrier) – Incoterms® 2020 geliefert. Ersatzteile werden CPT',
    'Tim (Carriage Paid To) – Incoterms® 2020.': 'Tim (Carriage Paid To) – Incoterms® 2020 geliefert.',
    'Se mere om leveringsbetingelser: bilag 4.': 'Weitere Lieferbedingungen finden Sie in Anhang 4.',
    'Opstart af maskine pålægges et gebyr i henhold til gældende prisliste.': 'Für die Inbetriebnahme der Maschine wird gemäß der geltenden Preisliste eine Gebühr erhoben.',
    'Ved manglende betaling vil der blive pålagt lovbestemte renter.': 'Bei Zahlungsverzug werden gesetzliche Verzugszinsen berechnet.',
    'Bilag 4: Salgs- og leveringsbetingelser': 'Anhang 4: Verkaufs- und Lieferbedingungen',
    'Disse almindelige Salgs- og Leveringsbetingelser (”Leveringsbetingelserne”) gælder for alle leverancer af produkter og/eller serviceydelser (”Produkter”) fra Timan A/S (betegnet Timan) til enhver kunde (”Køber”). Leveringsbetingelserne skal være gensidigt bindende for Timan og Køber, medmindre andet er udtrykkeligt aftalt. Timan er ikke bundet af vilkår fremsat af Køber, som afviger fra Leveringsbetingelserne, medmindre sådanne vilkår er aftalt skriftligt mellem Timan og Køber. Timan er heller ikke bundet af vilkår fremsat af Køber, selv om Timan ikke har gjort indsigelse mod sådanne vilkår.': 'Diese allgemeinen Verkaufs- und Lieferbedingungen (die „Bedingungen“) gelten für alle Lieferungen von Produkten und/oder Dienstleistungen (die „Produkte“) von Timan A/S („Timan“) an jeden Kunden (den „Käufer“). Die Bedingungen sind für Timan und den Käufer verbindlich, sofern nicht ausdrücklich etwas anderes vereinbart wurde. Timan ist nicht an Bedingungen des Käufers gebunden, die von diesen Bedingungen abweichen, es sei denn, sie wurden schriftlich zwischen Timan und dem Käufer vereinbart. Timan ist auch nicht allein deshalb an Bedingungen des Käufers gebunden, weil Timan ihnen nicht widersprochen hat.',
    '1. For enhver leverance fra Timan skal nedennævnte salgs - og leveringsbetingelser være gældende, medmindre andet skriftligt er aftalt mellem parterne.': '1. Für jede Lieferung von Timan gelten die nachstehenden Verkaufs- und Lieferbedingungen, sofern die Parteien nicht schriftlich etwas anderes vereinbart haben.',
    '2. Tilbud: Tilbud fra Timan bortfalder efter 8 dage, hvis intet andet er angivet. Timan tager forbehold for mellemsalg.': '2. Angebote: Angebote von Timan erlöschen nach 8 Tagen, sofern nichts anderes angegeben ist. Timan behält sich den Zwischenverkauf vor.',
    '3. Materiale: Timan påtager sig intet ansvar for eventuelle fejl eller oplysninger i udleveret skriftligt materiale om produkter/elementer i produkter, udarbejdet af Timans leverandører.': '3. Unterlagen: Timan übernimmt keine Verantwortung für Fehler oder Angaben in schriftlichen Unterlagen über Produkte oder Produktbestandteile, die von Lieferanten von Timan erstellt wurden.',
    '4. Priser: Al salg sker til priser, som er gældende på leveringsdagen. Det vil sige, mellemkommende afgiftsforhø jelser, prisændringer fra Timans leverandører, kursændringer over 3%, devalueringer m.v. på den aftalte vare berettiger Timan til at forhøje prisen tilsvarende. Er priserne skriftligt bekræftet, finder ovenstående kun anvendelse efter nærmere aftale.': '4. Preise: Alle Verkäufe erfolgen zu den am Liefertag geltenden Preisen. Zwischenzeitliche Steuererhöhungen, Preisänderungen der Lieferanten von Timan, Wechselkursänderungen von mehr als 3 %, Abwertungen und ähnliche Änderungen bei der vereinbarten Ware berechtigen Timan zu einer entsprechenden Preiserhöhung. Wurden Preise schriftlich bestätigt, gilt das Vorstehende nur nach weiterer Vereinbarung.',
    '5. Betalingsvilkår: Købesummen inklusiv alle afgifter og omkostninger betales kontant ved levering til Timan, med mindre andet aftales.': '5. Zahlungsbedingungen: Der Kaufpreis einschließlich aller Abgaben und Kosten ist bei Lieferung an Timan bar zu zahlen, sofern nichts anderes vereinbart ist.',
    '6. Levering: Levering sker i henhold til den mellem parterne aftalte leveringsbetingelse i overensstemmelse med Incoterms® 2020, medmindre andet er skriftligt aftalt.': '6. Lieferung: Die Lieferung erfolgt gemäß der zwischen den Parteien vereinbarten Lieferbedingung nach Incoterms® 2020, sofern nicht schriftlich etwas anderes vereinbart wurde.',
    'Såfremt der ikke er aftalt en specifik leveringsbetingelse, sker levering af maskiner i henhold til FCA (Free Carrier), Incoterms® 2020 , mens levering af reservedele og øvrige pakkeforsendelser sker i henhold til CPT (Carriage Paid To), Incoterms® 2020.': 'Ist keine besondere Lieferbedingung vereinbart, werden Maschinen FCA (Free Carrier), Incoterms® 2020 geliefert; Ersatzteile und sonstige Paketsendungen werden CPT (Carriage Paid To), Incoterms® 2020 geliefert.',
    'Køber kan vælge en anden leveringsbetingelse, herunder EXW (Ex Works), Incoterms® 2020 , forudsat at dette aftales skriftligt mellem parterne.': 'Der Käufer kann eine andere Lieferbedingung, einschließlich EXW (Ex Works), Incoterms® 2020, wählen, sofern dies schriftlich zwischen den Parteien vereinbart wird.',
    'Levering anses for sket, og risikoen for varerne overgår til køber i overensstemmelse med den aftalte leveringsbetingelse.': 'Die Lieferung gilt als erfolgt und die Gefahr für die Waren geht gemäß der vereinbarten Lieferbedingung auf den Käufer über.',
    '7. Leveringstid, forsinkelser:  De af Timan opgivne leveringstider er alene vejledende, medmindre andet er skriftligt bekræftet. Endelig leveringstid er først bindende, når den er skriftligt bekræftet af Timan.': '7. Lieferzeit und Verzögerungen: Von Timan angegebene Lieferzeiten sind unverbindlich, sofern nicht schriftlich etwas anderes bestätigt wurde. Eine endgültige Lieferzeit ist erst verbindlich, wenn sie von Timan schriftlich bestätigt wurde.',
    'Såfremt levering forsinkes som følge af forhold, der udgør ansvarsfrihed i henhold til punkt 8, eller som skyldes købers forhold, forlænges leveringstiden i det omfang, det efter omstændighederne findes rimeligt.': 'Verzögert sich die Lieferung infolge von Umständen, die Timan nach Ziffer 8 von der Haftung befreien, oder aufgrund von Umständen beim Käufer, verlängert sich die Lieferzeit in dem nach den Umständen angemessenen Umfang.',
    'Forsinkelse giver ikke køber ret til at hæve købet eller kræve erstatning, medmindre andet følger af ufravigelig lovgivning.': 'Eine Verzögerung berechtigt den Käufer nicht zum Rücktritt oder Schadensersatz, sofern zwingendes Recht nichts anderes bestimmt.',
    '8. Ansvarsfrihed (force majeure): Timan er ikke ansvarlig for manglende opfyldelse af sine forpligtelser, såfremt dette skyldes forhold uden for Timans kontrol, som Timan ikke med rimelighed kunne have forudset eller undgået ved aftalens indgåelse.': '8. Höhere Gewalt: Timan haftet nicht für die Nichterfüllung seiner Verpflichtungen, wenn diese auf Umstände außerhalb der Kontrolle von Timan zurückzuführen ist, die Timan bei Vertragsschluss nicht vernünftigerweise vorhersehen oder vermeiden konnte.',
    'Som ansvarsfrihedsgrunde anses blandt andet, men ikke begrænset til: driftsforstyrrelser, IT -nedbrud, arbejdskonflikter, brand, krig, mobilisering, naturkatastrofer, pandemier, myndighedsindgreb, valutarestriktioner, transportvanskeligheder, mangel på arbejdskraft eller materialer, samt forsinkelser eller mangler fra underleverandører.': 'Als Fälle höherer Gewalt gelten insbesondere, aber nicht abschließend: Betriebsstörungen, IT-Ausfälle, Arbeitskonflikte, Brand, Krieg, Mobilmachung, Naturkatastrophen, Pandemien, behördliche Maßnahmen, Währungsbeschränkungen, Transportschwierigkeiten, Mangel an Arbeitskräften oder Materialien sowie Verzögerungen oder Mängel von Unterlieferanten.',
    'I sådanne tilfælde suspenderes Timans forpligtelser, så længe hindringen består.': 'In solchen Fällen sind die Verpflichtungen von Timan ausgesetzt, solange das Hindernis besteht.',
    'Køber er ikke berettiget til at hæve købet, kræve erstatning eller gøre andre misligholdelsesbeføjelser gældende som følge af sådanne forhold.': 'Der Käufer ist wegen solcher Umstände nicht berechtigt, vom Kauf zurückzutreten, Schadensersatz zu verlangen oder andere Rechtsbehelfe geltend zu machen.',
    '9. Produktansvar: Sælger påtager sig intet ansvar for skader på person eller gods ud over, hvad der følger af ufravigelig lovgivning, som sælger er underlagt i Danmark, og da kun i det omfang, det følger af sådanne regler.': '9. Produkthaftung: Der Verkäufer übernimmt keine Haftung für Personen- oder Sachschäden über das hinaus, was sich aus zwingenden, für den Verkäufer in Dänemark geltenden Rechtsvorschriften ergibt, und nur in dem danach erforderlichen Umfang.',
    'Sælger er ikke ansvarlig for indirekte tab, herunder følgeskader, driftstab, tabt avance eller andre økonomiske konsekvenstab.': 'Der Verkäufer haftet nicht für mittelbare Schäden, einschließlich Folgeschäden, Betriebsunterbrechungen, entgangenen Gewinns oder sonstiger wirtschaftlicher Folgeschäden.',
    'Sælger påtager sig ikke ansvar for skade på købers gods, der opstår i forbindelse med købers erhvervsmæssige anvendelse af det købte.': 'Der Verkäufer übernimmt keine Haftung für Schäden am Eigentum des Käufers, die im Zusammenhang mit der gewerblichen Nutzung der gekauften Waren entstehen.',
    'I det omfang sælger måtte blive pålagt ansvar over for tredjemand i forbindelse med købers brug eller videresalg af det købte, er køber forpligtet til at skadesløs holde sælger  i det omfang, et sådant ansvar går ud over de ovenfor fastsatte begrænsninger.': 'Soweit der Verkäufer gegenüber Dritten im Zusammenhang mit der Nutzung oder dem Weiterverkauf der gekauften Waren durch den Käufer haftbar gemacht wird, hat der Käufer den Verkäufer freizustellen, soweit diese Haftung über die vorstehenden Beschränkungen hinausgeht.',
    'Ansvarsperioden er begrænset til 1 år fra leveringstidspunktet.': 'Die Haftungsfrist ist auf ein Jahr ab Lieferung begrenzt.',
    'Sælgers samlede ansvar for produktskader kan i intet tilfælde overstige dækningssummen i sælgers produktansvarsforsikring.': 'Die Gesamthaftung des Verkäufers für Produktschäden darf in keinem Fall die Versicherungssumme der Produkthaftpflichtversicherung des Verkäufers übersteigen.',
    'Køber er forpligtet til at lade sig sagsøge ved samme domstol, som behandler erstatningskrav mod sælger i anledning af de solgte produkter. Det indbyrdes forhold mellem sælger og køber afgøres dog i henhold til punkt 16, såfremt enighed ikke kan opnås.': 'Der Käufer ist verpflichtet, sich vor demselben Gericht verklagen zu lassen, das Schadensersatzansprüche gegen den Verkäufer wegen der verkauften Produkte behandelt. Das Verhältnis zwischen Verkäufer und Käufer richtet sich jedoch nach Ziffer 16, wenn keine Einigung erzielt werden kann.',
    '10. Ejendomsforbehold: Ejendomsretten over de solgte genstande forbliver hos Timan eller den, til hvem han har overdraget sine rettigheder, indtil hele købesummen med renter og omkostninger m.v. er fuldt betalt. Under ejendomsforbeholdet indgår også de ting, som måtte blive indføjet i eller senere leveret til komplettering, istandsættelse eller ændring i udstyr af de solgte genstande . Indtil hele købesummen inkl. renter og omkostninger er betalt, er køberen uberettiget til at sælge, pantsætte, udleje eller på anden måde disponere retligt over det solgte.': '10. Eigentumsvorbehalt: Das Eigentum an den verkauften Gegenständen verbleibt bei Timan oder demjenigen, dem Timan seine Rechte übertragen hat, bis der gesamte Kaufpreis einschließlich Zinsen und Kosten vollständig bezahlt ist. Der Eigentumsvorbehalt umfasst auch Gegenstände, die in die verkaufte Ausrüstung eingebaut oder später zur Ergänzung, Instandsetzung oder Änderung geliefert werden. Bis zur vollständigen Zahlung des Kaufpreises einschließlich Zinsen und Kosten ist der Käufer nicht berechtigt, die Waren zu verkaufen, zu verpfänden, zu vermieten oder anderweitig rechtlich darüber zu verfügen.',
    'Ved salg til Tyskland tages desuden ejendomsforbehold i den nye ting, som den solgte genstand måtte være om forarbejdet til eller blevet en bestanddel af eller til fordring på betaling af købesummen ved videresalg - dvs. Timan tager såvel simpelt ejendomsforbehold (Eigentumsvorbehalt) samt udvidet ejendomsforbehold ( erweiteter Eigentumsvorbehalt). Ejendomsforbeholdet i leverancer dækker også tidligere udækkede leverancer fra Timan til køber.': 'Bei Verkäufen nach Deutschland erstreckt sich der Eigentumsvorbehalt auch auf die neue Sache, zu der die verkaufte Sache verarbeitet wurde oder deren Bestandteil sie geworden ist, sowie auf die Kaufpreisforderung aus Weiterverkauf. Timan behält sich damit sowohl den einfachen Eigentumsvorbehalt als auch den erweiterten Eigentumsvorbehalt vor. Der Eigentumsvorbehalt erfasst auch frühere unbezahlte Lieferungen von Timan an den Käufer.',
    '11. Renter: Såfremt nogen ydelse eller omkostning til forfaldstid, erlægges en morarente, som udgør 2% pr. påbegyndt måned af det forfaldne beløb.': '11. Zinsen: Wird eine Leistung oder Kostenposition bei Fälligkeit nicht bezahlt, werden Verzugszinsen in Höhe von 2 % des überfälligen Betrags je angefangenem Monat berechnet.',
    '12. Forsikring: Så længe den fulde købesum med tillæg af renter og omkostninger ikke er betalt, er køberen pligtig til at tegne sædvanlig brand- og tyveriforsikring for det købte.': '12. Versicherung: Solange der vollständige Kaufpreis einschließlich Zinsen und Kosten nicht bezahlt ist, muss der Käufer die gekauften Waren üblich gegen Feuer und Diebstahl versichern.',
    'Køber bærer risikoen for det købte i overensstemmelse med den aftalte leveringsbetingelse.': 'Der Käufer trägt die Gefahr für die gekauften Waren gemäß der vereinbarten Lieferbedingung.',
    '13. Service og reklamationsbestemmelser: For nye maskiner ombytter Timan  i 12 måneder fra ibrugtagningsdagen  eller indtil det timetal der er anført i produktets brugermanual, det der kommer først , dele der er defekte på grund af materiale, monterings- eller fabrikationsfejl.': '13. Service- und Reklamationsbestimmungen: Bei neuen Maschinen ersetzt Timan Teile, die aufgrund von Material-, Montage- oder Herstellungsfehlern defekt sind, für 12 Monate ab Inbetriebnahme oder bis zu der in der Bedienungsanleitung angegebenen Betriebsstundenzahl, je nachdem, was zuerst eintritt.',
    'Ibrugtagningsdagen er iht. garantiregistrering foretaget til Timan. Er garantiregistrering ikke foretaget til Timan beregnes ibrugtagningsdagen fra leveringsdatoen.': 'Als Inbetriebnahmedatum gilt das in der Garantieregistrierung bei Timan angegebene Datum. Wurde keine Garantieregistrierung bei Timan vorgenommen, wird das Inbetriebnahmedatum ab dem Lieferdatum berechnet.',
    'Ombytning finder ikke sted på grund af normalt slid, - hvis fejlen skyldes vanrøgt, - at købe ren ikke har fulgt instruktioner eller produktets serviceplan iht. produktets brugermanual  fra Timan  eller der er anvendt uoriginale reservedele.': 'Ein Ersatz erfolgt nicht bei normalem Verschleiß, bei durch Vernachlässigung verursachten Fehlern, wenn der Käufer die Anweisungen oder den Serviceplan des Produkts gemäß der Timan-Bedienungsanleitung nicht befolgt hat, oder wenn nicht originale Ersatzteile verwendet wurden.',
    'For vurdering af en reklamation stiller Køber ved påkrav fra Timan, dokumentation for gennemførte servicearbejder til rådighed i form af udstedte fakturaer på servicearbejder samt udfyldte servicehæfte.  Kan ovennævnte dokumentation ikke fremskaffes er Timan berettiget til uden yderligere begrundelse at afvise en given reklamation.': 'Zur Beurteilung einer Reklamation hat der Käufer Timan auf Verlangen Nachweise über ausgeführte Servicearbeiten in Form ausgestellter Service-Rechnungen und ausgefüllter Servicehefte vorzulegen. Können diese Nachweise nicht beigebracht werden, ist Timan berechtigt, die betreffende Reklamation ohne weitere Begründung abzulehnen.',
    'Udgifter til arbejdsløn samt udgifter i forbindelse med udskiftning af en reklamationsberettiget  vare dækkes kun efter anden aftale.': 'Arbeitskosten sowie Kosten im Zusammenhang mit dem Austausch eines reklamationsberechtigten Artikels werden nur nach gesonderter Vereinbarung übernommen.',
    'For driftstab og andre indirekte tab i forbindelse med mangler ved det solgte ydes ingen erstatning. For elektriske  og hydrauliske anlæg, dæk og slanger gælder de respektive fabrikkers service- og reklamationsbestemmelser.': 'Für Betriebsverluste und andere indirekte Schäden im Zusammenhang mit Mängeln der verkauften Waren wird kein Ersatz geleistet. Für elektrische und hydraulische Anlagen, Reifen und Schläuche gelten die Service- und Reklamationsbestimmungen der jeweiligen Hersteller.',
    'Reklamationsarbejder skal udføres iht. Timans reklamationsprocedure.': 'Reklamationsarbeiten sind gemäß dem Reklamationsverfahren von Timan auszuführen.',
    '14. Reklamationsprocedure: Før reklamationsarbejdet påbegyndes, kontaktes Timan enten pr. telefon eller ved tilsendelse af delvist udfyldt reklamationsrapport.': '14. Reklamationsverfahren: Vor Beginn der Reklamationsarbeiten ist Timan telefonisch oder durch Übersendung eines teilweise ausgefüllten Reklamationsberichts zu kontaktieren.',
    'Efter henvendelse eller modtagelse af rapport udsteder Timan et reklamationsnummer.': 'Nach der Kontaktaufnahme oder dem Eingang des Berichts stellt Timan eine Reklamationsnummer aus.',
    'Timan skal ved enhver reklamation have mulighed for at give anvisninger på reklamationsarbejdets udførelse.': 'Bei jeder Reklamation muss Timan die Möglichkeit haben, Anweisungen zur Durchführung der Reklamationsarbeiten zu geben.',
    'Efter udstedelse af reklamationsnummer, tilsendes Timan endelig reklamationsrapport inden 8 dage.': 'Nach Ausstellung der Reklamationsnummer ist Timan innerhalb von 8 Tagen der endgültige Reklamationsbericht zuzusenden.',
    '15. Ansvar: Timan har, ud over hvad der følger af punkt 9, intet ansvar for indirekte tab, herunder driftstab, tabt arbejdsfortjeneste og andre økonomiske konsekvenstab.': '15. Haftung: Über Ziffer 9 hinaus übernimmt Timan keine Haftung für mittelbare Schäden, einschließlich Betriebsverlusten, entgangenem Arbeitsverdienst und sonstigen wirtschaftlichen Folgeschäden.',
    '16. Lovvalg og værneting:  Nærværende almindelige salgs- og leveringsbetingelser skal være gældende for enhver tvist parterne imellem, men er et forhold ikke omtalt i leveringsbetingelserne, finder Den Danske Købelov, lov nr. 120 af 06.04.1906, med efterfølgende supplerende ændringer, og i øvrigt dansk ret, anvendelse.  Tvistigheder i anledning af købsaftalen eller nærværende salgs - og leveringsbetingelser kan efter Sælgers valg underkastes domstolsprøvelse eller afgøres endeligt ved voldgift i overensstemmelse med reglerne i Lov nr. 181 at 24.05.1972 om voldgift.': '16. Anwendbares Recht und Gerichtsstand: Diese allgemeinen Verkaufs- und Lieferbedingungen gelten für alle Streitigkeiten zwischen den Parteien. Soweit ein Sachverhalt nicht in den Bedingungen geregelt ist, gilt das dänische Kaufgesetz, Gesetz Nr. 120 vom 6. April 1906 in der jeweils ergänzten Fassung, im Übrigen dänisches Recht. Streitigkeiten aus dem Kaufvertrag oder diesen Bedingungen können nach Wahl des Verkäufers vor Gericht gebracht oder nach dem Schiedsgerichtsgesetz Nr. 181 vom 24. Mai 1972 endgültig durch Schiedsverfahren entschieden werden.',
  },
};

function buildPaymentDeliveryTranslations(values: readonly string[]): Record<string, string> {
  const source = Object.keys(PAYMENT_DELIVERY_CONTRACT_TEXT.en ?? {});
  return Object.fromEntries(source.map((value, index) => [value, values[index] ?? value]));
}

Object.assign(PAYMENT_DELIVERY_CONTRACT_TEXT, {
  it: buildPaymentDeliveryTranslations([
    '9. Pagamento e consegna',
    'Le macchine e le attrezzature sono consegnate FCA Tim (Free Carrier) – Incoterms® 2020. I ricambi sono consegnati CPT',
    'Tim (Carriage Paid To) – Incoterms® 2020.',
    'Per ulteriori condizioni di consegna, vedere l’Allegato 4.',
    'La messa in servizio della macchina è soggetta a un costo secondo il listino prezzi vigente.',
    'In caso di mancato pagamento saranno applicati gli interessi di mora previsti dalla legge.',
    'Allegato 4: Condizioni di vendita e consegna',
    'Le presenti Condizioni generali di vendita e consegna (le “Condizioni”) si applicano a tutte le forniture di prodotti e/o servizi (i “Prodotti”) da Timan A/S (“Timan”) a qualsiasi cliente (l’“Acquirente”). Le Condizioni sono vincolanti per Timan e per l’Acquirente, salvo diverso accordo espresso. Timan non è vincolata da condizioni proposte dall’Acquirente che differiscano dalle presenti Condizioni, salvo che tali condizioni siano state concordate per iscritto tra Timan e l’Acquirente. Timan non è vincolata dalle condizioni dell’Acquirente neppure per il solo fatto di non avervi formulato obiezioni.',
    '1. Per ogni fornitura di Timan si applicano le seguenti condizioni di vendita e consegna, salvo diverso accordo scritto tra le parti.',
    '2. Offerte: le offerte di Timan decadono dopo 8 giorni, salvo diversa indicazione. Timan si riserva il diritto di vendita nel frattempo.',
    '3. Materiale: Timan non si assume alcuna responsabilità per eventuali errori o informazioni contenuti nel materiale scritto relativo a prodotti o componenti di prodotti, predisposto dai fornitori di Timan.',
    '4. Prezzi: tutte le vendite avvengono ai prezzi vigenti alla data di consegna. Aumenti di imposte intervenuti, variazioni di prezzo dei fornitori di Timan, variazioni di cambio superiori al 3%, svalutazioni e simili variazioni relative alla merce concordata autorizzano Timan ad aumentare il prezzo di conseguenza. Qualora i prezzi siano stati confermati per iscritto, quanto sopra si applica solo previo ulteriore accordo.',
    '5. Condizioni di pagamento: il prezzo di acquisto, comprese tutte le imposte e i costi, è pagabile in contanti alla consegna a Timan, salvo diverso accordo.',
    '6. Consegna: la consegna avviene secondo la condizione di consegna concordata tra le parti, in conformità agli Incoterms® 2020, salvo diverso accordo scritto.',
    'In assenza di una specifica condizione di consegna, le macchine sono consegnate FCA (Free Carrier), Incoterms® 2020, mentre i ricambi e le altre spedizioni di colli sono consegnati CPT (Carriage Paid To), Incoterms® 2020.',
    'L’Acquirente può scegliere un’altra condizione di consegna, compresa EXW (Ex Works), Incoterms® 2020, purché ciò sia concordato per iscritto tra le parti.',
    'La consegna si considera effettuata e il rischio relativo alla merce passa all’Acquirente in conformità alla condizione di consegna concordata.',
    '7. Termine di consegna e ritardi: i termini di consegna indicati da Timan sono puramente indicativi, salvo diversa conferma scritta. Un termine di consegna definitivo è vincolante solo quando confermato per iscritto da Timan.',
    'Se la consegna è ritardata per circostanze che esonerano Timan da responsabilità ai sensi del punto 8 o per circostanze imputabili all’Acquirente, il termine di consegna è prorogato nella misura ragionevolmente richiesta dalle circostanze.',
    'Il ritardo non conferisce all’Acquirente il diritto di risolvere l’acquisto o di chiedere un risarcimento, salvo quanto previsto da norme inderogabili.',
    '8. Forza maggiore: Timan non è responsabile dell’inadempimento delle proprie obbligazioni qualora ciò sia dovuto a circostanze al di fuori del controllo di Timan che non potevano ragionevolmente essere previste o evitate al momento della conclusione del contratto.',
    'Sono considerate cause di forza maggiore, a titolo esemplificativo e non esaustivo: interruzioni operative, guasti informatici, conflitti di lavoro, incendio, guerra, mobilitazione, calamità naturali, pandemie, interventi delle autorità, restrizioni valutarie, difficoltà di trasporto, carenza di manodopera o materiali, nonché ritardi o difetti di subfornitori.',
    'In tali casi le obbligazioni di Timan sono sospese per tutta la durata dell’impedimento.',
    'L’Acquirente non ha diritto di risolvere l’acquisto, chiedere un risarcimento o invocare altri rimedi per tali circostanze.',
    '9. Responsabilità per prodotto: il Venditore non assume alcuna responsabilità per danni a persone o cose oltre quanto previsto da norme inderogabili applicabili al Venditore in Danimarca e solo nella misura richiesta da tali norme.',
    'Il Venditore non è responsabile per danni indiretti, inclusi danni consequenziali, perdite di esercizio, mancato guadagno o altre perdite economiche conseguenti.',
    'Il Venditore non assume responsabilità per danni ai beni dell’Acquirente derivanti dall’uso commerciale dei beni acquistati da parte dell’Acquirente.',
    'Nella misura in cui il Venditore sia ritenuto responsabile nei confronti di terzi in relazione all’uso o alla rivendita dei beni acquistati da parte dell’Acquirente, l’Acquirente dovrà tenere indenne il Venditore nella misura in cui tale responsabilità ecceda le limitazioni sopra indicate.',
    'Il periodo di responsabilità è limitato a un anno dalla consegna.',
    'La responsabilità complessiva del Venditore per danni da prodotto non può in alcun caso superare il massimale della sua assicurazione per responsabilità da prodotto.',
    'L’Acquirente è tenuto a farsi citare davanti allo stesso tribunale che esamina le richieste di risarcimento contro il Venditore in relazione ai prodotti venduti. Il rapporto tra Venditore e Acquirente è tuttavia disciplinato dal punto 16 qualora non sia possibile raggiungere un accordo.',
    '10. Riserva di proprietà: la proprietà dei beni venduti rimane a Timan o al soggetto al quale Timan abbia trasferito i propri diritti fino al pagamento integrale del prezzo di acquisto, degli interessi e dei costi. La riserva di proprietà comprende anche gli elementi incorporati o successivamente forniti per completare, riparare o modificare l’attrezzatura venduta. Fino al pagamento integrale del prezzo di acquisto, inclusi interessi e costi, l’Acquirente non è autorizzato a vendere, costituire in pegno, noleggiare o altrimenti disporre giuridicamente dei beni.',
    'Per le vendite in Germania, la riserva di proprietà si estende inoltre al nuovo bene nel quale il bene venduto sia stato trasformato o del quale sia divenuto parte integrante, nonché al credito per il prezzo di acquisto in caso di rivendita. Timan conserva pertanto sia la riserva di proprietà semplice (Eigentumsvorbehalt) sia quella estesa (erweiterter Eigentumsvorbehalt). La riserva di proprietà comprende anche le precedenti forniture non pagate di Timan all’Acquirente.',
    '11. Interessi: se una prestazione o un costo non viene pagato alla scadenza, è applicato un interesse di mora pari al 2% dell’importo scaduto per ogni mese iniziato.',
    '12. Assicurazione: finché l’intero prezzo di acquisto, compresi interessi e costi, non è stato pagato, l’Acquirente deve mantenere un’assicurazione ordinaria contro incendio e furto per i beni acquistati.',
    'L’Acquirente sopporta il rischio relativo ai beni acquistati in conformità alla condizione di consegna concordata.',
    '13. Disposizioni su assistenza e reclami: per le macchine nuove Timan sostituisce le parti difettose per difetti di materiale, montaggio o fabbricazione per 12 mesi dalla messa in servizio o fino al numero di ore indicato nel manuale d’uso del prodotto, a seconda di quale evento si verifichi per primo.',
    'La data di messa in servizio è quella registrata presso Timan nella registrazione della garanzia. Se non è stata effettuata una registrazione della garanzia presso Timan, la data di messa in servizio è calcolata dalla data di consegna.',
    'La sostituzione non è prevista per normale usura, difetti causati da negligenza, mancato rispetto da parte dell’Acquirente delle istruzioni o del piano di assistenza del prodotto secondo il manuale d’uso Timan, oppure impiego di ricambi non originali.',
    'Per la valutazione di un reclamo, l’Acquirente deve fornire a Timan, su richiesta, la documentazione dei lavori di assistenza eseguiti sotto forma di fatture emesse per tali lavori e libretti di assistenza compilati. Se tale documentazione non può essere fornita, Timan può respingere il reclamo senza ulteriore motivazione.',
    'I costi di manodopera e i costi relativi alla sostituzione di un articolo coperto da reclamo sono coperti solo in base a un accordo separato.',
    'Non è previsto alcun risarcimento per perdite di esercizio o altre perdite indirette connesse a difetti dei beni venduti. Per impianti elettrici e idraulici, pneumatici e tubi flessibili si applicano le disposizioni di assistenza e reclamo dei rispettivi produttori.',
    'I lavori di reclamo devono essere eseguiti secondo la procedura di reclamo di Timan.',
    '14. Procedura di reclamo: prima di iniziare i lavori di reclamo, Timan deve essere contattata telefonicamente o mediante l’invio di un rapporto di reclamo parzialmente compilato.',
    'Dopo il contatto o la ricezione del rapporto, Timan emette un numero di reclamo.',
    'Per ogni reclamo Timan deve avere la possibilità di fornire istruzioni sull’esecuzione dei lavori di reclamo.',
    'Dopo l’emissione del numero di reclamo, il rapporto di reclamo definitivo deve essere inviato a Timan entro 8 giorni.',
    '15. Responsabilità: oltre a quanto previsto dal punto 9, Timan non assume alcuna responsabilità per perdite indirette, comprese perdite di esercizio, mancato guadagno e altre perdite economiche conseguenti.',
    '16. Legge applicabile e foro competente: le presenti condizioni generali di vendita e consegna si applicano a tutte le controversie tra le parti. Per le questioni non disciplinate dalle Condizioni si applicano la legge danese sulla vendita di beni, legge n. 120 del 6 aprile 1906, con le successive modifiche, e il diritto danese. Le controversie derivanti dal contratto di acquisto o dalle presenti Condizioni possono, a scelta del Venditore, essere sottoposte ai tribunali o risolte definitivamente mediante arbitrato ai sensi della legge n. 181 del 24 maggio 1972 sull’arbitrato.',
  ]),
  fr: buildPaymentDeliveryTranslations([
    '9. Paiement et livraison',
    'Les machines et équipements sont livrés FCA Tim (Free Carrier) – Incoterms® 2020. Les pièces détachées sont livrées CPT',
    'Tim (Carriage Paid To) – Incoterms® 2020.',
    'Pour plus de conditions de livraison, voir l’Annexe 4.',
    'La mise en service de la machine est facturée conformément à la liste de prix en vigueur.',
    'Des intérêts légaux seront appliqués en cas de retard de paiement.',
    'Annexe 4 : Conditions de vente et de livraison',
    'Les présentes Conditions générales de vente et de livraison (les « Conditions ») s’appliquent à toutes les livraisons de produits et/ou de services (les « Produits ») par Timan A/S (« Timan ») à tout client (l’« Acheteur »). Les Conditions lient réciproquement Timan et l’Acheteur, sauf accord exprès contraire. Timan n’est pas liée par des conditions proposées par l’Acheteur qui dérogent aux présentes Conditions, à moins que ces conditions aient été convenues par écrit entre Timan et l’Acheteur. Timan n’est pas davantage liée par les conditions de l’Acheteur du seul fait qu’elle ne s’y est pas opposée.',
    '1. Les conditions de vente et de livraison ci-dessous s’appliquent à chaque livraison de Timan, sauf accord écrit contraire entre les parties.',
    '2. Offres : les offres de Timan expirent après 8 jours, sauf indication contraire. Timan se réserve le droit de vente entre-temps.',
    '3. Documentation : Timan décline toute responsabilité quant aux erreurs ou informations figurant dans la documentation écrite relative aux produits ou éléments de produits, préparée par les fournisseurs de Timan.',
    '4. Prix : toutes les ventes sont effectuées aux prix applicables à la date de livraison. Les augmentations de taxes intervenues, les modifications de prix des fournisseurs de Timan, les variations de change supérieures à 3 %, les dévaluations et autres changements similaires concernant la marchandise convenue autorisent Timan à augmenter le prix en conséquence. Lorsque les prix ont été confirmés par écrit, ce qui précède ne s’applique que sur accord complémentaire.',
    '5. Conditions de paiement : le prix d’achat, y compris tous les droits et frais, est payable comptant à la livraison à Timan, sauf accord contraire.',
    '6. Livraison : la livraison est effectuée conformément à la condition de livraison convenue entre les parties et aux Incoterms® 2020, sauf accord écrit contraire.',
    'Si aucune condition de livraison spécifique n’a été convenue, les machines sont livrées FCA (Free Carrier), Incoterms® 2020, tandis que les pièces détachées et autres envois de colis sont livrés CPT (Carriage Paid To), Incoterms® 2020.',
    'L’Acheteur peut choisir une autre condition de livraison, y compris EXW (Ex Works), Incoterms® 2020, à condition qu’elle soit convenue par écrit entre les parties.',
    'La livraison est réputée effectuée et le risque lié aux marchandises est transféré à l’Acheteur conformément à la condition de livraison convenue.',
    '7. Délais de livraison et retards : les délais de livraison indiqués par Timan sont donnés à titre indicatif, sauf confirmation écrite contraire. Un délai de livraison définitif ne devient contraignant que lorsqu’il est confirmé par écrit par Timan.',
    'Si la livraison est retardée en raison de circonstances exonérant Timan de responsabilité au titre du point 8 ou de circonstances imputables à l’Acheteur, le délai de livraison est prolongé dans la mesure raisonnablement requise par les circonstances.',
    'Un retard ne donne pas à l’Acheteur le droit de résoudre l’achat ou de réclamer des dommages-intérêts, sauf disposition impérative contraire.',
    '8. Force majeure : Timan n’est pas responsable de l’inexécution de ses obligations lorsqu’elle résulte de circonstances indépendantes de sa volonté que Timan ne pouvait raisonnablement prévoir ou éviter lors de la conclusion du contrat.',
    'Sont notamment considérés comme cas de force majeure, sans que cette liste soit limitative : perturbations d’exploitation, pannes informatiques, conflits sociaux, incendie, guerre, mobilisation, catastrophes naturelles, pandémies, interventions des autorités, restrictions monétaires, difficultés de transport, pénuries de main-d’œuvre ou de matériaux, ainsi que retards ou défauts de sous-traitants.',
    'Dans de tels cas, les obligations de Timan sont suspendues tant que l’empêchement subsiste.',
    'L’Acheteur n’est pas autorisé à résoudre l’achat, réclamer des dommages-intérêts ou invoquer d’autres recours du fait de telles circonstances.',
    '9. Responsabilité du fait des produits : le Vendeur n’assume aucune responsabilité pour les dommages corporels ou matériels au-delà de ce qui découle des dispositions impératives applicables au Vendeur au Danemark, et uniquement dans la mesure exigée par ces dispositions.',
    'Le Vendeur n’est pas responsable des pertes indirectes, y compris les dommages consécutifs, pertes d’exploitation, pertes de bénéfices ou autres préjudices économiques consécutifs.',
    'Le Vendeur n’assume aucune responsabilité pour les dommages aux biens de l’Acheteur résultant de l’utilisation commerciale des biens achetés par l’Acheteur.',
    'Dans la mesure où le Vendeur serait tenu responsable envers un tiers en lien avec l’utilisation ou la revente des biens achetés par l’Acheteur, l’Acheteur doit indemniser le Vendeur dans la mesure où cette responsabilité dépasse les limitations ci-dessus.',
    'La période de responsabilité est limitée à un an à compter de la livraison.',
    'La responsabilité totale du Vendeur pour les dommages causés par les produits ne peut en aucun cas dépasser le montant couvert par l’assurance responsabilité produits du Vendeur.',
    'L’Acheteur est tenu de se laisser assigner devant le même tribunal que celui qui traite les demandes de dommages-intérêts contre le Vendeur relatives aux produits vendus. Le rapport entre le Vendeur et l’Acheteur est toutefois régi par le point 16 si aucun accord ne peut être atteint.',
    '10. Réserve de propriété : la propriété des biens vendus demeure à Timan ou à la personne à laquelle Timan a cédé ses droits jusqu’au paiement intégral du prix d’achat, des intérêts et des frais. La réserve de propriété couvre également les éléments incorporés dans l’équipement vendu ou livrés ultérieurement pour compléter, réparer ou modifier cet équipement. Jusqu’au paiement intégral du prix d’achat, intérêts et frais compris, l’Acheteur n’est pas autorisé à vendre, nantir, louer ou disposer juridiquement d’une autre manière des biens.',
    'Pour les ventes en Allemagne, la réserve de propriété s’étend également au nouvel objet dans lequel le bien vendu a été transformé ou dont il est devenu partie intégrante, ainsi qu’à la créance du prix d’achat lors de la revente. Timan conserve donc tant la réserve de propriété simple (Eigentumsvorbehalt) que la réserve de propriété étendue (erweiterter Eigentumsvorbehalt). La réserve de propriété couvre aussi les livraisons antérieures impayées de Timan à l’Acheteur.',
    '11. Intérêts : si une prestation ou un coût n’est pas payé à l’échéance, un intérêt de retard de 2 % du montant échu est appliqué pour chaque mois entamé.',
    '12. Assurance : tant que le prix d’achat total, intérêts et frais compris, n’est pas payé, l’Acheteur doit souscrire une assurance usuelle contre l’incendie et le vol pour les biens achetés.',
    'L’Acheteur supporte le risque relatif aux biens achetés conformément à la condition de livraison convenue.',
    '13. Dispositions relatives au service et aux réclamations : pour les machines neuves, Timan remplace les pièces défectueuses en raison de défauts de matériau, de montage ou de fabrication pendant 12 mois à compter de la mise en service ou jusqu’au nombre d’heures indiqué dans le manuel d’utilisation du produit, selon la première éventualité.',
    'La date de mise en service est celle enregistrée auprès de Timan dans l’enregistrement de garantie. Si aucun enregistrement de garantie n’a été effectué auprès de Timan, la date de mise en service est calculée à partir de la date de livraison.',
    'Aucun remplacement n’est effectué en cas d’usure normale, de défaut causé par négligence, de non-respect par l’Acheteur des instructions ou du plan de service du produit conformément au manuel d’utilisation Timan, ou d’utilisation de pièces détachées non originales.',
    'Pour l’évaluation d’une réclamation, l’Acheteur doit, à la demande de Timan, fournir des documents relatifs aux travaux de service réalisés sous forme de factures de service émises et de carnets de service remplis. Si ces documents ne peuvent être fournis, Timan peut rejeter la réclamation sans autre justification.',
    'Les frais de main-d’œuvre et les frais liés au remplacement d’un article admissible à une réclamation ne sont couverts que sur accord séparé.',
    'Aucune indemnisation n’est accordée pour les pertes d’exploitation ou autres pertes indirectes liées à des défauts des biens vendus. Les dispositions de service et de réclamation des fabricants respectifs s’appliquent aux installations électriques et hydrauliques, pneus et flexibles.',
    'Les travaux de réclamation doivent être effectués conformément à la procédure de réclamation de Timan.',
    '14. Procédure de réclamation : avant le début des travaux de réclamation, Timan doit être contactée par téléphone ou par l’envoi d’un rapport de réclamation partiellement rempli.',
    'Après la prise de contact ou la réception du rapport, Timan attribue un numéro de réclamation.',
    'Pour chaque réclamation, Timan doit avoir la possibilité de donner des instructions pour l’exécution des travaux de réclamation.',
    'Après l’attribution du numéro de réclamation, le rapport de réclamation final doit être envoyé à Timan dans les 8 jours.',
    '15. Responsabilité : outre ce qui résulte du point 9, Timan n’assume aucune responsabilité pour les pertes indirectes, y compris les pertes d’exploitation, pertes de revenus et autres préjudices économiques consécutifs.',
    '16. Droit applicable et juridiction compétente : les présentes conditions générales de vente et de livraison s’appliquent à tout litige entre les parties. Lorsqu’une question n’est pas traitée dans les Conditions, la loi danoise sur la vente de biens, loi n° 120 du 6 avril 1906, telle que modifiée ultérieurement, et le droit danois s’appliquent. Les litiges découlant du contrat d’achat ou des présentes Conditions peuvent, au choix du Vendeur, être soumis aux tribunaux ou définitivement tranchés par arbitrage conformément à la loi n° 181 du 24 mai 1972 relative à l’arbitrage.',
  ]),
  sv: buildPaymentDeliveryTranslations([
    '9. Betalning och leverans',
    'Maskiner och utrustning levereras FCA Tim (Free Carrier) – Incoterms® 2020. Reservdelar levereras CPT',
    'Tim (Carriage Paid To) – Incoterms® 2020.',
    'Se bilaga 4 för ytterligare leveransvillkor.',
    'Driftsättning av maskinen debiteras enligt gällande prislista.',
    'Lagstadgad dröjsmålsränta tas ut vid utebliven betalning.',
    'Bilaga 4: Försäljnings- och leveransvillkor',
    'Dessa allmänna försäljnings- och leveransvillkor (”Villkoren”) gäller för alla leveranser av produkter och/eller tjänster (”Produkterna”) från Timan A/S (”Timan”) till varje kund (”Köparen”). Villkoren är ömsesidigt bindande för Timan och Köparen, om inte annat uttryckligen avtalats. Timan är inte bunden av villkor som Köparen föreslår och som avviker från Villkoren, om sådana villkor inte har avtalats skriftligen mellan Timan och Köparen. Timan är inte heller bunden av Köparens villkor enbart därför att Timan inte har invänt mot dem.',
    '1. Följande försäljnings- och leveransvillkor gäller för varje leverans från Timan om inte parterna skriftligen avtalat annat.',
    '2. Offerter: Offerter från Timan förfaller efter 8 dagar om inget annat anges. Timan förbehåller sig rätten till mellanliggande försäljning.',
    '3. Material: Timan ansvarar inte för fel eller uppgifter i skriftligt material om produkter eller produktdelar som har utarbetats av Timans leverantörer.',
    '4. Priser: All försäljning sker till de priser som gäller på leveransdagen. Mellankommande skattehöjningar, prisändringar från Timans leverantörer, valutakursförändringar över 3 %, devalveringar och liknande ändringar av den avtalade varan berättigar Timan att höja priset i motsvarande mån. Om priserna har bekräftats skriftligen gäller detta endast efter ytterligare överenskommelse.',
    '5. Betalningsvillkor: Köpesumman inklusive alla avgifter och kostnader betalas kontant vid leverans till Timan, om inte annat avtalats.',
    '6. Leverans: Leverans sker enligt den leveransbestämmelse som parterna har avtalat i enlighet med Incoterms® 2020, om inte annat skriftligen avtalats.',
    'Om ingen särskild leveransbestämmelse har avtalats levereras maskiner FCA (Free Carrier), Incoterms® 2020, medan reservdelar och andra paketleveranser levereras CPT (Carriage Paid To), Incoterms® 2020.',
    'Köparen kan välja en annan leveransbestämmelse, inklusive EXW (Ex Works), Incoterms® 2020, under förutsättning att detta avtalas skriftligen mellan parterna.',
    'Leverans anses ha skett och risken för varorna övergår till Köparen enligt den avtalade leveransbestämmelsen.',
    '7. Leveranstid och förseningar: Leveranstider som Timan anger är endast vägledande, om inte annat skriftligen bekräftats. En slutlig leveranstid blir bindande först när Timan skriftligen har bekräftat den.',
    'Om leveransen försenas på grund av omständigheter som befriar Timan från ansvar enligt punkt 8 eller på grund av omständigheter som beror på Köparen, förlängs leveranstiden i den utsträckning som är skälig med hänsyn till omständigheterna.',
    'Försening ger inte Köparen rätt att häva köpet eller kräva skadestånd, om inte tvingande lag föreskriver annat.',
    '8. Force majeure: Timan ansvarar inte för underlåtenhet att fullgöra sina skyldigheter om detta beror på omständigheter utanför Timans kontroll som Timan inte rimligen kunde ha förutsett eller undvikit när avtalet ingicks.',
    'Som force majeure räknas bland annat, utan begränsning: driftstörningar, IT-avbrott, arbetskonflikter, brand, krig, mobilisering, naturkatastrofer, pandemier, myndighetsingripanden, valutarestriktioner, transportsvårigheter, brist på arbetskraft eller material samt förseningar eller fel hos underleverantörer.',
    'I sådana fall är Timans skyldigheter suspenderade så länge hindret består.',
    'Köparen har inte rätt att häva köpet, kräva skadestånd eller göra andra påföljder gällande på grund av sådana omständigheter.',
    '9. Produktansvar: Säljaren tar inget ansvar för person- eller sakskador utöver vad som följer av tvingande lagstiftning som gäller för Säljaren i Danmark, och endast i den omfattning som följer av sådan lagstiftning.',
    'Säljaren ansvarar inte för indirekta förluster, inklusive följdskador, driftsförlust, utebliven vinst eller andra ekonomiska följdskador.',
    'Säljaren tar inget ansvar för skada på Köparens egendom som uppkommer i samband med Köparens yrkesmässiga användning av de inköpta varorna.',
    'I den mån Säljaren blir ansvarig gentemot tredje man i samband med Köparens användning eller vidareförsäljning av de inköpta varorna ska Köparen hålla Säljaren skadeslös i den mån ansvaret överstiger begränsningarna ovan.',
    'Ansvarsperioden är begränsad till ett år från leveransen.',
    'Säljarens sammanlagda ansvar för produktskador får under inga omständigheter överstiga försäkringsbeloppet i Säljarens produktansvarsförsäkring.',
    'Köparen är skyldig att låta sig stämmas vid samma domstol som handlägger skadeståndskrav mot Säljaren med anledning av de sålda produkterna. Förhållandet mellan Säljaren och Köparen avgörs dock enligt punkt 16 om en överenskommelse inte kan nås.',
    '10. Äganderättsförbehåll: Äganderätten till de sålda föremålen stannar hos Timan eller den till vilken Timan har överlåtit sina rättigheter tills hela köpesumman inklusive räntor och kostnader har betalats. Äganderättsförbehållet omfattar även föremål som byggs in i eller senare levereras för att komplettera, reparera eller ändra den sålda utrustningen. Fram till dess att hela köpesumman inklusive räntor och kostnader har betalats får Köparen inte sälja, pantsätta, hyra ut eller på annat sätt rättsligt förfoga över varorna.',
    'Vid försäljning till Tyskland gäller äganderättsförbehållet även den nya sak som den sålda varan kan ha bearbetats till eller blivit en beståndsdel av, samt fordran på köpeskillingen vid vidareförsäljning. Timan förbehåller sig därför både enkelt äganderättsförbehåll (Eigentumsvorbehalt) och utvidgat äganderättsförbehåll (erweiterter Eigentumsvorbehalt). Äganderättsförbehållet omfattar även tidigare obetalda leveranser från Timan till Köparen.',
    '11. Ränta: Om en prestation eller kostnad inte betalas på förfallodagen tas dröjsmålsränta ut med 2 % av det förfallna beloppet för varje påbörjad månad.',
    '12. Försäkring: Så länge hela köpesumman inklusive räntor och kostnader inte har betalats ska Köparen ha sedvanlig brand- och stöldförsäkring för de inköpta varorna.',
    'Köparen bär risken för de inköpta varorna enligt den avtalade leveransbestämmelsen.',
    '13. Service- och reklamationsbestämmelser: För nya maskiner ersätter Timan delar som är felaktiga på grund av material-, monterings- eller tillverkningsfel under 12 månader från idrifttagandet eller till det timantal som anges i produktens bruksanvisning, beroende på vilket som inträffar först.',
    'Datumet för idrifttagande är det datum som registrerats hos Timan i garantiregistreringen. Om ingen garantiregistrering har gjorts hos Timan beräknas idrifttagandedatumet från leveransdagen.',
    'Ersättning sker inte vid normalt slitage, fel som beror på försummelse, att Köparen inte har följt instruktionerna eller produktens serviceplan enligt Timans bruksanvisning eller om icke-originalreservdelar har använts.',
    'För bedömning av en reklamation ska Köparen på Timans begäran tillhandahålla dokumentation över utförda servicearbeten i form av utfärdade servicefakturor och ifyllda servicehäften. Om sådan dokumentation inte kan tillhandahållas får Timan avslå reklamationen utan ytterligare motivering.',
    'Arbetskostnader och kostnader för byte av en reklamationsberättigad vara täcks endast genom separat överenskommelse.',
    'Ingen ersättning lämnas för driftsförlust eller andra indirekta förluster i samband med fel i de sålda varorna. För elektriska och hydrauliska system, däck och slangar gäller respektive tillverkares service- och reklamationsbestämmelser.',
    'Reklamationsarbeten ska utföras enligt Timans reklamationsförfarande.',
    '14. Reklamationsförfarande: Innan reklamationsarbetet påbörjas ska Timan kontaktas per telefon eller genom att en delvis ifylld reklamationsrapport skickas in.',
    'Efter kontakt eller mottagande av rapporten utfärdar Timan ett reklamationsnummer.',
    'Vid varje reklamation ska Timan ha möjlighet att ge anvisningar om hur reklamationsarbetet ska utföras.',
    'Efter att reklamationsnumret har utfärdats ska den slutliga reklamationsrapporten skickas till Timan inom 8 dagar.',
    '15. Ansvar: Utöver vad som följer av punkt 9 tar Timan inget ansvar för indirekta förluster, inklusive driftsförlust, förlorad arbetsförtjänst och andra ekonomiska följdskador.',
    '16. Tillämplig lag och forum: Dessa allmänna försäljnings- och leveransvillkor gäller för varje tvist mellan parterna. I frågor som inte behandlas i Villkoren gäller den danska köplagen, lag nr 120 av den 6 april 1906, med senare ändringar, och i övrigt dansk rätt. Tvister som uppkommer av köpeavtalet eller dessa Villkor kan efter Säljarens val hänskjutas till domstol eller slutligt avgöras genom skiljeförfarande enligt lag nr 181 av den 24 maj 1972 om skiljeförfarande.',
  ]),
  cs: buildPaymentDeliveryTranslations([
    '9. Platba a dodání',
    'Stroje a vybavení jsou dodávány FCA Tim (Free Carrier) – Incoterms® 2020. Náhradní díly jsou dodávány CPT',
    'Tim (Carriage Paid To) – Incoterms® 2020.',
    'Další dodací podmínky naleznete v příloze 4.',
    'Uvedení stroje do provozu je zpoplatněno podle platného ceníku.',
    'V případě prodlení s platbou bude účtován zákonný úrok z prodlení.',
    'Příloha 4: Obchodní a dodací podmínky',
    'Tyto všeobecné obchodní a dodací podmínky (dále jen „Podmínky“) se vztahují na všechny dodávky výrobků a/nebo služeb (dále jen „Výrobky“) od společnosti Timan A/S („Timan“) kterémukoli zákazníkovi („Kupující“). Podmínky jsou pro Timan a Kupujícího vzájemně závazné, pokud není výslovně dohodnuto jinak. Timan není vázán podmínkami navrženými Kupujícím, které se od těchto Podmínek liší, pokud nebyly písemně dohodnuty mezi Timan a Kupujícím. Timan není podmínkami Kupujícího vázán ani jen proto, že proti nim nevznesl námitky.',
    '1. Pro každou dodávku od Timan platí níže uvedené obchodní a dodací podmínky, pokud se strany písemně nedohodnou jinak.',
    '2. Nabídky: Nabídky společnosti Timan pozbývají platnosti po 8 dnech, není-li uvedeno jinak. Timan si vyhrazuje právo mezitímního prodeje.',
    '3. Materiály: Timan nenese odpovědnost za chyby nebo údaje v písemných materiálech o výrobcích nebo jejich součástech, které vypracovali dodavatelé Timan.',
    '4. Ceny: Veškerý prodej se uskutečňuje za ceny platné v den dodání. Průběžné zvýšení daní, změny cen dodavatelů Timan, změny směnných kurzů nad 3 %, devalvace a podobné změny týkající se dohodnutého zboží opravňují Timan odpovídajícím způsobem zvýšit cenu. Byly-li ceny písemně potvrzeny, platí výše uvedené pouze po další dohodě.',
    '5. Platební podmínky: Kupní cena včetně všech poplatků a nákladů je splatná v hotovosti při dodání společnosti Timan, pokud není dohodnuto jinak.',
    '6. Dodání: Dodání se uskutečňuje podle dodací podmínky dohodnuté mezi stranami v souladu s Incoterms® 2020, pokud není písemně dohodnuto jinak.',
    'Není-li dohodnuta zvláštní dodací podmínka, stroje jsou dodávány FCA (Free Carrier), Incoterms® 2020, zatímco náhradní díly a ostatní balíkové zásilky jsou dodávány CPT (Carriage Paid To), Incoterms® 2020.',
    'Kupující může zvolit jinou dodací podmínku, včetně EXW (Ex Works), Incoterms® 2020, pokud je to mezi stranami písemně dohodnuto.',
    'Dodání se považuje za uskutečněné a riziko za zboží přechází na Kupujícího v souladu s dohodnutou dodací podmínkou.',
    '7. Dodací lhůta a prodlení: Dodací lhůty uvedené společností Timan jsou pouze orientační, pokud není písemně potvrzeno jinak. Konečná dodací lhůta je závazná teprve po písemném potvrzení společností Timan.',
    'Je-li dodání zpožděno v důsledku okolností, které Timan zprošťují odpovědnosti podle bodu 8, nebo z důvodů na straně Kupujícího, prodlužuje se dodací lhůta v rozsahu, který je vzhledem k okolnostem přiměřený.',
    'Prodlení neopravňuje Kupujícího k odstoupení od koupě ani k náhradě škody, pokud kogentní právní předpisy nestanoví jinak.',
    '8. Vyšší moc: Timan neodpovídá za nesplnění svých povinností, pokud je způsobeno okolnostmi mimo jeho kontrolu, které Timan nemohl při uzavření smlouvy rozumně předvídat ani jim zabránit.',
    'Za vyšší moc se považují zejména, nikoli však výlučně: provozní poruchy, výpadky IT, pracovní konflikty, požár, válka, mobilizace, přírodní katastrofy, pandemie, zásahy úřadů, měnová omezení, dopravní obtíže, nedostatek pracovní síly nebo materiálů a zpoždění či vady subdodavatelů.',
    'V takových případech jsou povinnosti společnosti Timan pozastaveny po dobu trvání překážky.',
    'Kupující není oprávněn z těchto okolností odstoupit od koupě, požadovat náhradu škody ani uplatňovat jiné prostředky nápravy.',
    '9. Odpovědnost za výrobek: Prodávající nepřebírá odpovědnost za újmu na zdraví nebo škodu na majetku nad rámec kogentních právních předpisů platných pro Prodávajícího v Dánsku a pouze v rozsahu, v jakém z nich taková odpovědnost vyplývá.',
    'Prodávající neodpovídá za nepřímé ztráty, včetně následných škod, ztráty provozu, ušlého zisku nebo jiných ekonomických následných ztrát.',
    'Prodávající nepřebírá odpovědnost za škodu na majetku Kupujícího vzniklou v souvislosti s obchodním užíváním zakoupeného zboží Kupujícím.',
    'V rozsahu, v němž bude Prodávající odpovědný třetí osobě v souvislosti s užíváním nebo dalším prodejem zakoupeného zboží Kupujícím, je Kupující povinen Prodávajícího odškodnit v rozsahu přesahujícím výše uvedená omezení.',
    'Doba odpovědnosti je omezena na jeden rok od dodání.',
    'Celková odpovědnost Prodávajícího za škodu způsobenou výrobkem nesmí za žádných okolností přesáhnout pojistnou částku pojištění odpovědnosti za výrobek Prodávajícího.',
    'Kupující je povinen nechat se žalovat před stejným soudem, který projednává nároky na náhradu škody proti Prodávajícímu v souvislosti s prodanými výrobky. Vztah mezi Prodávajícím a Kupujícím se však řídí bodem 16, nelze-li dosáhnout dohody.',
    '10. Výhrada vlastnictví: Vlastnické právo k prodaným věcem zůstává Timan nebo osobě, na kterou Timan převedl svá práva, až do úplného zaplacení kupní ceny včetně úroků a nákladů. Výhrada vlastnictví zahrnuje i věci zabudované do prodaného zařízení nebo později dodané k jeho doplnění, opravě či změně. Do úplného zaplacení kupní ceny včetně úroků a nákladů není Kupující oprávněn zboží prodat, zastavit, pronajmout ani s ním jinak právně nakládat.',
    'Při prodeji do Německa se výhrada vlastnictví vztahuje také na novou věc, na kterou bylo prodané zboží zpracováno nebo jejíž se stalo součástí, a na pohledávku kupní ceny při dalším prodeji. Timan si proto vyhrazuje jednoduchou i rozšířenou výhradu vlastnictví (Eigentumsvorbehalt a erweiterter Eigentumsvorbehalt). Výhrada vlastnictví pokrývá také dřívější nezaplacené dodávky Timan Kupujícímu.',
    '11. Úroky: Není-li plnění nebo náklad zaplacen ve splatnosti, účtuje se úrok z prodlení ve výši 2 % z dlužné částky za každý započatý měsíc.',
    '12. Pojištění: Dokud není zaplacena celá kupní cena včetně úroků a nákladů, musí Kupující udržovat obvyklé pojištění zakoupeného zboží proti požáru a krádeži.',
    'Kupující nese riziko za zakoupené zboží v souladu s dohodnutou dodací podmínkou.',
    '13. Ustanovení o servisu a reklamacích: U nových strojů Timan vymění díly vadné v důsledku materiálových, montážních nebo výrobních vad po dobu 12 měsíců od uvedení do provozu nebo do počtu provozních hodin uvedeného v uživatelské příručce výrobku, podle toho, co nastane dříve.',
    'Datum uvedení do provozu je datum uvedené v záruční registraci u Timan. Nebyla-li záruční registrace u Timan provedena, vypočítá se datum uvedení do provozu od data dodání.',
    'Výměna se neposkytuje při běžném opotřebení, vadách způsobených zanedbáním, nedodržením pokynů nebo servisního plánu výrobku podle uživatelské příručky Timan Kupujícím nebo při použití neoriginálních náhradních dílů.',
    'Pro posouzení reklamace musí Kupující na žádost Timan předložit dokumentaci provedených servisních prací ve formě vystavených servisních faktur a vyplněných servisních záznamů. Nelze-li tuto dokumentaci předložit, je Timan oprávněn reklamaci bez dalšího odůvodnění odmítnout.',
    'Náklady na práci a náklady na výměnu položky způsobilé k reklamaci jsou hrazeny pouze na základě samostatné dohody.',
    'Za ztrátu provozu nebo jiné nepřímé ztráty související s vadami prodaného zboží se náhrada neposkytuje. Pro elektrické a hydraulické systémy, pneumatiky a hadice platí servisní a reklamační ustanovení příslušných výrobců.',
    'Reklamační práce musí být prováděny v souladu s reklamačním postupem Timan.',
    '14. Reklamační postup: Před zahájením reklamačních prací musí být Timan kontaktován telefonicky nebo zasláním částečně vyplněného reklamačního protokolu.',
    'Po kontaktu nebo obdržení protokolu Timan vydá reklamační číslo.',
    'Při každé reklamaci musí mít Timan možnost poskytnout pokyny k provedení reklamačních prací.',
    'Po vydání reklamačního čísla musí být konečný reklamační protokol zaslán Timan do 8 dnů.',
    '15. Odpovědnost: Kromě toho, co vyplývá z bodu 9, Timan nepřebírá odpovědnost za nepřímé ztráty, včetně ztráty provozu, ušlého výdělku a jiných ekonomických následných ztrát.',
    '16. Rozhodné právo a příslušnost soudu: Tyto všeobecné obchodní a dodací podmínky platí pro každý spor mezi stranami. Není-li určitá otázka v Podmínkách upravena, použije se dánský zákon o koupi zboží, zákon č. 120 ze dne 6. dubna 1906, v pozdějším znění, a jinak dánské právo. Spory vyplývající z kupní smlouvy nebo těchto Podmínek mohou být podle volby Prodávajícího předloženy soudu nebo s konečnou platností rozhodnuty rozhodčím řízením podle zákona č. 181 ze dne 24. května 1972 o rozhodčím řízení.',
  ]),
  pl: buildPaymentDeliveryTranslations([
    '9. Płatność i dostawa',
    'Maszyny i wyposażenie są dostarczane FCA Tim (Free Carrier) – Incoterms® 2020. Części zamienne są dostarczane CPT',
    'Tim (Carriage Paid To) – Incoterms® 2020.',
    'Dalsze warunki dostawy znajdują się w Załączniku 4.',
    'Uruchomienie maszyny podlega opłacie zgodnie z obowiązującym cennikiem.',
    'W przypadku braku płatności zostaną naliczone ustawowe odsetki za opóźnienie.',
    'Załącznik 4: Warunki sprzedaży i dostawy',
    'Niniejsze ogólne warunki sprzedaży i dostawy („Warunki”) mają zastosowanie do wszystkich dostaw produktów i/lub usług („Produkty”) od Timan A/S („Timan”) do każdego klienta („Kupujący”). Warunki są wzajemnie wiążące dla Timan i Kupującego, o ile wyraźnie nie uzgodniono inaczej. Timan nie jest związany warunkami proponowanymi przez Kupującego, które odbiegają od niniejszych Warunków, chyba że takie warunki zostały pisemnie uzgodnione między Timan a Kupującym. Timan nie jest również związany warunkami Kupującego tylko dlatego, że Timan nie zgłosił wobec nich sprzeciwu.',
    '1. Dla każdej dostawy od Timan obowiązują poniższe warunki sprzedaży i dostawy, chyba że strony pisemnie uzgodnią inaczej.',
    '2. Oferty: Oferty Timan wygasają po 8 dniach, o ile nie wskazano inaczej. Timan zastrzega sobie prawo sprzedaży pośredniej.',
    '3. Materiały: Timan nie ponosi odpowiedzialności za błędy lub informacje w materiałach pisemnych dotyczących produktów lub elementów produktów, przygotowanych przez dostawców Timan.',
    '4. Ceny: Wszystkie sprzedaże odbywają się po cenach obowiązujących w dniu dostawy. Podwyżki podatków, zmiany cen dostawców Timan, zmiany kursów walut powyżej 3%, dewaluacje i podobne zmiany dotyczące uzgodnionego towaru uprawniają Timan do odpowiedniego podwyższenia ceny. Jeżeli ceny zostały potwierdzone na piśmie, powyższe ma zastosowanie wyłącznie po dodatkowym uzgodnieniu.',
    '5. Warunki płatności: Cena zakupu wraz ze wszystkimi opłatami i kosztami jest płatna gotówką przy dostawie do Timan, chyba że uzgodniono inaczej.',
    '6. Dostawa: Dostawa odbywa się zgodnie z warunkiem dostawy uzgodnionym przez strony i Incoterms® 2020, chyba że pisemnie uzgodniono inaczej.',
    'Jeżeli nie uzgodniono szczególnego warunku dostawy, maszyny są dostarczane FCA (Free Carrier), Incoterms® 2020, natomiast części zamienne i inne przesyłki paczkowe są dostarczane CPT (Carriage Paid To), Incoterms® 2020.',
    'Kupujący może wybrać inny warunek dostawy, w tym EXW (Ex Works), Incoterms® 2020, pod warunkiem pisemnego uzgodnienia między stronami.',
    'Dostawę uznaje się za dokonaną, a ryzyko dotyczące towarów przechodzi na Kupującego zgodnie z uzgodnionym warunkiem dostawy.',
    '7. Termin dostawy i opóźnienia: Terminy dostawy podawane przez Timan mają charakter orientacyjny, chyba że pisemnie potwierdzono inaczej. Ostateczny termin dostawy jest wiążący dopiero po pisemnym potwierdzeniu przez Timan.',
    'Jeżeli dostawa jest opóźniona z powodu okoliczności zwalniających Timan z odpowiedzialności zgodnie z punktem 8 lub z przyczyn leżących po stronie Kupującego, termin dostawy ulega przedłużeniu w zakresie rozsądnie wymaganym przez okoliczności.',
    'Opóźnienie nie uprawnia Kupującego do odstąpienia od zakupu ani żądania odszkodowania, chyba że bezwzględnie obowiązujące przepisy stanowią inaczej.',
    '8. Siła wyższa: Timan nie ponosi odpowiedzialności za niewykonanie swoich obowiązków, jeżeli wynika ono z okoliczności pozostających poza kontrolą Timan, których Timan nie mógł rozsądnie przewidzieć ani uniknąć przy zawieraniu umowy.',
    'Za przypadki siły wyższej uznaje się w szczególności, bez ograniczeń: zakłócenia działalności, awarie IT, konflikty pracownicze, pożar, wojnę, mobilizację, klęski żywiołowe, pandemie, ingerencje władz, ograniczenia walutowe, trudności transportowe, niedobór siły roboczej lub materiałów oraz opóźnienia lub wady po stronie podwykonawców.',
    'W takich przypadkach obowiązki Timan ulegają zawieszeniu na czas trwania przeszkody.',
    'Kupujący nie jest uprawniony do odstąpienia od zakupu, żądania odszkodowania ani korzystania z innych środków ochrony z powodu takich okoliczności.',
    '9. Odpowiedzialność za produkt: Sprzedawca nie ponosi odpowiedzialności za szkody na osobie lub mieniu ponad zakres wynikający z bezwzględnie obowiązujących przepisów mających zastosowanie do Sprzedawcy w Danii i tylko w zakresie wymaganym przez takie przepisy.',
    'Sprzedawca nie odpowiada za straty pośrednie, w tym szkody następcze, utratę działalności, utracony zysk ani inne ekonomiczne straty następcze.',
    'Sprzedawca nie ponosi odpowiedzialności za szkody w mieniu Kupującego powstałe w związku z gospodarczym używaniem zakupionych towarów przez Kupującego.',
    'W zakresie, w jakim Sprzedawca zostanie pociągnięty do odpowiedzialności wobec osoby trzeciej w związku z używaniem lub odsprzedażą zakupionych towarów przez Kupującego, Kupujący zobowiązuje się zwolnić Sprzedawcę z odpowiedzialności w zakresie przekraczającym powyższe ograniczenia.',
    'Okres odpowiedzialności jest ograniczony do jednego roku od dostawy.',
    'Łączna odpowiedzialność Sprzedawcy za szkody produktowe nie może w żadnym wypadku przekroczyć sumy ubezpieczenia odpowiedzialności za produkt Sprzedawcy.',
    'Kupujący jest zobowiązany poddać się postępowaniu przed tym samym sądem, który rozpoznaje roszczenia odszkodowawcze wobec Sprzedawcy w związku ze sprzedanymi produktami. Stosunek między Sprzedawcą a Kupującym podlega jednak punktowi 16, jeżeli nie można osiągnąć porozumienia.',
    '10. Zastrzeżenie własności: Własność sprzedanych rzeczy pozostaje przy Timan lub podmiocie, któremu Timan przeniósł swoje prawa, do czasu pełnej zapłaty ceny zakupu wraz z odsetkami i kosztami. Zastrzeżenie własności obejmuje również rzeczy wbudowane w sprzedany sprzęt lub dostarczone później w celu jego uzupełnienia, naprawy lub modyfikacji. Do czasu pełnej zapłaty ceny zakupu wraz z odsetkami i kosztami Kupujący nie jest uprawniony do sprzedaży, zastawienia, wynajmu ani innego prawnego rozporządzania towarami.',
    'W przypadku sprzedaży do Niemiec zastrzeżenie własności obejmuje także nową rzecz, w którą sprzedany towar został przetworzony lub której stał się częścią, oraz wierzytelność z tytułu ceny zakupu przy odsprzedaży. Timan zastrzega zatem proste i rozszerzone zastrzeżenie własności (Eigentumsvorbehalt i erweiterter Eigentumsvorbehalt). Zastrzeżenie własności obejmuje również wcześniejsze nieopłacone dostawy Timan do Kupującego.',
    '11. Odsetki: Jeżeli świadczenie lub koszt nie zostanie zapłacony w terminie, naliczane są odsetki za opóźnienie w wysokości 2% zaległej kwoty za każdy rozpoczęty miesiąc.',
    '12. Ubezpieczenie: Dopóki pełna cena zakupu wraz z odsetkami i kosztami nie zostanie zapłacona, Kupujący musi utrzymywać zwyczajowe ubezpieczenie zakupionych towarów od ognia i kradzieży.',
    'Kupujący ponosi ryzyko dotyczące zakupionych towarów zgodnie z uzgodnionym warunkiem dostawy.',
    '13. Postanowienia dotyczące serwisu i reklamacji: W przypadku nowych maszyn Timan wymienia części wadliwe z powodu wad materiałowych, montażowych lub produkcyjnych przez 12 miesięcy od uruchomienia albo do liczby godzin pracy wskazanej w instrukcji obsługi produktu, w zależności od tego, co nastąpi wcześniej.',
    'Datą uruchomienia jest data zarejestrowana w Timan w zgłoszeniu gwarancyjnym. Jeżeli zgłoszenie gwarancyjne nie zostało dokonane w Timan, data uruchomienia jest liczona od daty dostawy.',
    'Wymiana nie przysługuje w przypadku normalnego zużycia, wad spowodowanych zaniedbaniem, nieprzestrzegania przez Kupującego instrukcji lub planu serwisowego produktu zgodnie z instrukcją obsługi Timan albo użycia nieoryginalnych części zamiennych.',
    'W celu oceny reklamacji Kupujący musi na żądanie Timan przedstawić dokumentację wykonanych prac serwisowych w postaci wystawionych faktur serwisowych i wypełnionych książek serwisowych. Jeżeli taka dokumentacja nie może zostać przedstawiona, Timan może odrzucić reklamację bez dalszego uzasadnienia.',
    'Koszty robocizny oraz koszty związane z wymianą elementu objętego reklamacją są pokrywane wyłącznie na podstawie odrębnego porozumienia.',
    'Nie przysługuje odszkodowanie za utratę działalności ani inne straty pośrednie związane z wadami sprzedanych towarów. W odniesieniu do instalacji elektrycznych i hydraulicznych, opon oraz węży stosuje się postanowienia serwisowe i reklamacyjne odpowiednich producentów.',
    'Prace reklamacyjne muszą być wykonywane zgodnie z procedurą reklamacyjną Timan.',
    '14. Procedura reklamacyjna: Przed rozpoczęciem prac reklamacyjnych należy skontaktować się z Timan telefonicznie albo przesłać częściowo wypełniony raport reklamacyjny.',
    'Po kontakcie lub otrzymaniu raportu Timan wydaje numer reklamacji.',
    'Przy każdej reklamacji Timan musi mieć możliwość wydania instrukcji dotyczących wykonania prac reklamacyjnych.',
    'Po wydaniu numeru reklamacji ostateczny raport reklamacyjny należy przesłać do Timan w ciągu 8 dni.',
    '15. Odpowiedzialność: Oprócz tego, co wynika z punktu 9, Timan nie ponosi odpowiedzialności za straty pośrednie, w tym utratę działalności, utracone zarobki i inne ekonomiczne straty następcze.',
    '16. Prawo właściwe i właściwość sądu: Niniejsze ogólne warunki sprzedaży i dostawy mają zastosowanie do każdego sporu między stronami. W sprawach nieuregulowanych w Warunkach stosuje się duńską ustawę o sprzedaży towarów, ustawę nr 120 z dnia 6 kwietnia 1906 r. z późniejszymi zmianami, a w pozostałym zakresie prawo duńskie. Spory wynikające z umowy zakupu lub niniejszych Warunków mogą, według wyboru Sprzedawcy, zostać skierowane do sądu albo ostatecznie rozstrzygnięte w arbitrażu zgodnie z ustawą nr 181 z dnia 24 maja 1972 r. o arbitrażu.',
  ]),
  hu: buildPaymentDeliveryTranslations([
    '9. Fizetés és szállítás',
    'A gépek és berendezések FCA Tim (Free Carrier) – Incoterms® 2020 feltételekkel kerülnek szállításra. A pótalkatrészek CPT',
    'Tim (Carriage Paid To) – Incoterms® 2020 feltételekkel kerülnek szállításra.',
    'A további szállítási feltételeket a 4. melléklet tartalmazza.',
    'A gép üzembe helyezéséért az érvényes árlista szerinti díjat számítunk fel.',
    'Fizetési késedelem esetén törvényes késedelmi kamat kerül felszámításra.',
    '4. melléklet: Értékesítési és szállítási feltételek',
    'Jelen általános értékesítési és szállítási feltételek („Feltételek”) a Timan A/S („Timan”) által bármely ügyfélnek („Vevő”) teljesített valamennyi termék- és/vagy szolgáltatásszállításra („Termékek”) vonatkoznak. A Feltételek a Timanra és a Vevőre kölcsönösen kötelezőek, kivéve, ha kifejezetten másként állapodnak meg. A Timant nem kötik a Vevő által javasolt, a Feltételektől eltérő feltételek, kivéve, ha azokat a Timan és a Vevő írásban elfogadta. A Timant nem kötik a Vevő feltételei pusztán azért sem, mert azok ellen nem emelt kifogást.',
    '1. A Timan minden szállítására az alábbi értékesítési és szállítási feltételek vonatkoznak, kivéve, ha a felek írásban másként állapodnak meg.',
    '2. Ajánlatok: A Timan ajánlatai 8 nap után érvényüket vesztik, ha másként nincs feltüntetve. A Timan fenntartja a közbenső értékesítés jogát.',
    '3. Anyagok: A Timan nem vállal felelősséget a Timan beszállítói által készített, termékekre vagy termékalkatrészekre vonatkozó írásos anyagok hibáiért vagy adataiért.',
    '4. Árak: Minden értékesítés a szállítás napján érvényes árakon történik. Az időközben bekövetkező adóemelések, a Timan beszállítóinak árváltozásai, a 3%-ot meghaladó árfolyamváltozások, leértékelések és a megállapodott árut érintő hasonló változások feljogosítják a Timant az ár megfelelő emelésére. Írásban visszaigazolt árak esetén a fentiek csak további megállapodás alapján alkalmazhatók.',
    '5. Fizetési feltételek: A vételár, beleértve minden adót és költséget, a Timan részére történő szállításkor készpénzben fizetendő, kivéve, ha másként állapodnak meg.',
    '6. Szállítás: A szállítás a felek között megállapodott szállítási feltétel szerint, az Incoterms® 2020 szabályaival összhangban történik, kivéve, ha írásban másként állapodnak meg.',
    'Ha nem állapodtak meg külön szállítási feltételben, a gépek FCA (Free Carrier), Incoterms® 2020 feltételekkel, míg a pótalkatrészek és egyéb csomagküldemények CPT (Carriage Paid To), Incoterms® 2020 feltételekkel kerülnek szállításra.',
    'A Vevő más szállítási feltételt is választhat, beleértve az EXW (Ex Works), Incoterms® 2020 feltételt, amennyiben erről a felek írásban megállapodnak.',
    'A szállítás teljesítettnek minősül, és az áru kockázata a Vevőre száll az elfogadott szállítási feltételnek megfelelően.',
    '7. Szállítási határidő és késedelem: A Timan által megadott szállítási határidők csak tájékoztató jellegűek, kivéve, ha írásban másként igazolták vissza. A végleges szállítási határidő csak akkor kötelező, ha azt a Timan írásban visszaigazolta.',
    'Ha a szállítás a Timant a 8. pont alapján felelősség alól mentesítő körülmények vagy a Vevőnek felróható körülmények miatt késik, a szállítási határidő a körülmények által indokolt ésszerű mértékben meghosszabbodik.',
    'A késedelem nem jogosítja fel a Vevőt a vásárlástól való elállásra vagy kártérítés követelésére, kivéve, ha kötelező jogszabály másként rendelkezik.',
    '8. Vis maior: A Timan nem felel kötelezettségeinek nemteljesítéséért, ha az olyan, a Timan ellenőrzésén kívül eső körülményekből ered, amelyeket a Timan a szerződéskötéskor ésszerűen nem láthatott előre vagy nem kerülhetett el.',
    'Vis maior eseménynek minősül többek között, de nem kizárólagosan: üzemzavar, informatikai leállás, munkaügyi konfliktus, tűz, háború, mozgósítás, természeti katasztrófa, világjárvány, hatósági beavatkozás, devizakorlátozás, szállítási nehézség, munkaerő- vagy anyaghiány, valamint az alvállalkozók késedelme vagy hibája.',
    'Ilyen esetekben a Timan kötelezettségei az akadály fennállásának idejére felfüggesztésre kerülnek.',
    'A Vevő ilyen körülmények miatt nem jogosult a vásárlástól elállni, kártérítést követelni vagy más jogorvoslatot érvényesíteni.',
    '9. Termékfelelősség: Az Eladó nem vállal felelősséget személyi sérülésért vagy vagyoni kárért azon túl, amit a Dániában az Eladóra alkalmazandó kötelező jogszabályok előírnak, és csak az általuk megkövetelt mértékben.',
    'Az Eladó nem felel közvetett veszteségekért, beleértve a következménykárokat, üzemkiesést, elmaradt hasznot vagy más gazdasági következménykárokat.',
    'Az Eladó nem vállal felelősséget a Vevő vagyonában keletkezett olyan károkért, amelyek a megvásárolt áruk Vevő általi üzleti használatával kapcsolatban merülnek fel.',
    'Amennyiben az Eladót harmadik személlyel szemben felelősség terheli a Vevő által megvásárolt áruk használatával vagy továbbértékesítésével kapcsolatban, a Vevő köteles az Eladót mentesíteni olyan mértékben, amely meghaladja a fenti korlátozásokat.',
    'A felelősségi időszak a szállítástól számított egy évre korlátozódik.',
    'Az Eladó termékkárokért fennálló teljes felelőssége semmilyen esetben sem haladhatja meg az Eladó termékfelelősség-biztosításának fedezeti összegét.',
    'A Vevő köteles ugyanazon bíróság előtt perelhetővé válni, amely az Eladóval szemben az eladott termékekkel kapcsolatban benyújtott kártérítési igényeket tárgyalja. Az Eladó és a Vevő közötti jogviszonyra azonban megállapodás hiányában a 16. pont irányadó.',
    '10. Tulajdonjog-fenntartás: Az eladott tárgyak tulajdonjoga a Timant vagy azt a személyt illeti, akire a Timan jogait átruházta, mindaddig, amíg a teljes vételárat kamatokkal és költségekkel együtt ki nem fizették. A tulajdonjog-fenntartás kiterjed az eladott berendezésbe beépített, illetve később annak kiegészítésére, javítására vagy módosítására szállított tárgyakra is. A teljes vételár kamatokkal és költségekkel együtt történő megfizetéséig a Vevő nem jogosult az árut eladni, elzálogosítani, bérbe adni vagy azzal más módon jogilag rendelkezni.',
    'Németországba történő értékesítés esetén a tulajdonjog-fenntartás arra az új dologra is kiterjed, amelybe az eladott áru feldolgozásra került vagy amelynek alkotórészévé vált, valamint a továbbértékesítéskor fennálló vételár-követelésre. A Timan ezért egyszerű és kiterjesztett tulajdonjog-fenntartást (Eigentumsvorbehalt és erweiterter Eigentumsvorbehalt) is fenntart. A tulajdonjog-fenntartás a Timan Vevő részére korábban teljesített, ki nem fizetett szállításaira is vonatkozik.',
    '11. Kamat: Ha valamely szolgáltatást vagy költséget esedékességkor nem fizetnek meg, minden megkezdett hónapra a lejárt összeg 2%-ának megfelelő késedelmi kamatot kell fizetni.',
    '12. Biztosítás: Amíg a teljes vételárat kamatokkal és költségekkel együtt meg nem fizetik, a Vevő köteles a megvásárolt árura szokásos tűz- és lopásbiztosítást fenntartani.',
    'A Vevő viseli a megvásárolt áru kockázatát a megállapodott szállítási feltétel szerint.',
    '13. Szerviz- és reklamációs rendelkezések: Új gépek esetén a Timan az anyag-, összeszerelési vagy gyártási hiba miatt hibás alkatrészeket az üzembe helyezéstől számított 12 hónapig vagy a termék használati útmutatójában megadott üzemóraszám eléréséig cseréli, attól függően, melyik következik be előbb.',
    'Az üzembe helyezés napja a Timannál rögzített garanciaregisztrációban szereplő nap. Ha a Timannál nem történt garanciaregisztráció, az üzembe helyezés napját a szállítás napjától kell számítani.',
    'Csere nem jár normál elhasználódás, gondatlanság okozta hiba, a Vevő által a Timan használati útmutatója szerinti utasítások vagy a termék szervizterve be nem tartása, illetve nem eredeti pótalkatrészek használata esetén.',
    'Reklamáció elbírálásához a Vevőnek a Timan kérésére a végrehajtott szervizmunkákról kiállított szervizszámlákkal és kitöltött szervizfüzetekkel kell igazolást benyújtania. Ha ez a dokumentáció nem áll rendelkezésre, a Timan további indokolás nélkül elutasíthatja a reklamációt.',
    'A munkadíj és a reklamációra jogosult tétel cseréjével kapcsolatos költségek csak külön megállapodás alapján téríthetők.',
    'Az eladott áruk hibáival kapcsolatos üzemkiesésért vagy más közvetett veszteségért kártérítés nem jár. Az elektromos és hidraulikus rendszerekre, gumiabroncsokra és tömlőkre az adott gyártók szerviz- és reklamációs rendelkezései vonatkoznak.',
    'A reklamációs munkákat a Timan reklamációs eljárása szerint kell elvégezni.',
    '14. Reklamációs eljárás: A reklamációs munka megkezdése előtt a Timant telefonon vagy részben kitöltött reklamációs jelentés megküldésével kell megkeresni.',
    'A kapcsolatfelvételt vagy a jelentés kézhezvételét követően a Timan reklamációs számot ad ki.',
    'Minden reklamáció esetén a Timannak lehetőséget kell kapnia arra, hogy utasításokat adjon a reklamációs munka elvégzésére.',
    'A reklamációs szám kiadását követően a végleges reklamációs jelentést 8 napon belül el kell küldeni a Timannak.',
    '15. Felelősség: A 9. pontban foglaltakon túl a Timan nem vállal felelősséget közvetett veszteségekért, beleértve az üzemkiesést, az elmaradt munkajövedelmet és más gazdasági következménykárokat.',
    '16. Irányadó jog és illetékesség: Jelen általános értékesítési és szállítási feltételek a felek közötti minden vitára irányadók. Ha valamely kérdésről a Feltételek nem rendelkeznek, a dán adásvételi törvény, a későbbi módosításokkal kiegészített 1906. április 6-i 120. számú törvény, egyébként pedig a dán jog alkalmazandó. Az adásvételi szerződésből vagy a jelen Feltételekből eredő jogvitákat az Eladó választása szerint bíróság elé lehet vinni, vagy az 1972. május 24-i, választottbíráskodásról szóló 181. számú törvény alapján választottbírósági úton véglegesen lehet rendezni.',
  ]),
});

const ALL_PAYMENT_DELIVERY_CONTRACT_TEXT = PAYMENT_DELIVERY_CONTRACT_TEXT;

const TERMINATION_CONTRACT_TEXT: Partial<Record<ContractTextLanguage, Record<string, string>>> = {
  en: {
    'Kontrakt, punkt 11': 'Contract, section 11',
    '11. Varighed og opsigelse': '11. Duration and termination',
    'Denne kontrakt træder i kraft ved underskrift og løber indtil opsigelse af en af parterne med  et opsigelsesvarsel første ganag på 24 måneder herefter 6 måneder.': 'This agreement enters into force upon signature and continues until terminated by either party. The initial notice period is 24 months and thereafter 6 months.',
    'Fornyelse af kontrakten sker automatisk med ét år ad gangen senest 1. september, med mindre en af parterne skriftligt ønsker genforhandling senest 1. august samme år.': 'The agreement is automatically renewed for one year at a time on 1 September unless either party requests renegotiation in writing no later than 1 August of the same year.',
    'Hvis betalinger ikke finder sted senest 8 dage efter, det på fakturaen anvist betalingsdato. Samt modtagelse af rykker fra Timan kan aftalen opsiges med 1 månedes varsel.': 'If payment is not made within 8 days after the payment date stated on the invoice and a reminder from Timan has been received, the agreement may be terminated with one month’s notice.',
    'Ved opsigelse af kontrakten er det {{partnerPossessive}} pligt at fjerne Timan -navnet og produktsider fra {{partnerPossessive}} markedsføringsmateriale og bygning.': 'Upon termination of the agreement, {{partnerPossessive}} must remove the Timan name and product pages from {{partnerPossessive}} marketing material and premises.',
    'Ved retslige tvister afgøres dette ved Sø og Handelsretten i Danmark.': 'Legal disputes are decided by the Danish Maritime and Commercial Court.',
  },
  de: {
    'Kontrakt, punkt 11': 'Vertrag, Punkt 11',
    '11. Varighed og opsigelse': '11. Laufzeit und Kündigung',
    'Denne kontrakt træder i kraft ved underskrift og løber indtil opsigelse af en af parterne med  et opsigelsesvarsel første ganag på 24 måneder herefter 6 måneder.': 'Dieser Vertrag tritt mit Unterzeichnung in Kraft und läuft bis zur Kündigung durch eine der Parteien. Die anfängliche Kündigungsfrist beträgt 24 Monate, danach 6 Monate.',
    'Fornyelse af kontrakten sker automatisk med ét år ad gangen senest 1. september, med mindre en af parterne skriftligt ønsker genforhandling senest 1. august samme år.': 'Der Vertrag verlängert sich jeweils am 1. September automatisch um ein Jahr, sofern nicht eine Partei spätestens am 1. August desselben Jahres schriftlich eine Neuverhandlung verlangt.',
    'Hvis betalinger ikke finder sted senest 8 dage efter, det på fakturaen anvist betalingsdato. Samt modtagelse af rykker fra Timan kan aftalen opsiges med 1 månedes varsel.': 'Er eine Zahlung nicht spätestens 8 Tage nach dem auf der Rechnung angegebenen Zahlungstermin und nach Zugang einer Mahnung von Timan erfolgt, kann der Vertrag mit einer Frist von einem Monat gekündigt werden.',
    'Ved opsigelse af kontrakten er det {{partnerPossessive}} pligt at fjerne Timan -navnet og produktsider fra {{partnerPossessive}} markedsføringsmateriale og bygning.': 'Bei Beendigung des Vertrags ist {{partnerPossessive}} verpflichtet, den Namen Timan und die Produktseiten aus {{partnerPossessive}} Marketingmaterial und Geschäftsräumen zu entfernen.',
    'Ved retslige tvister afgøres dette ved Sø og Handelsretten i Danmark.': 'Rechtsstreitigkeiten werden vom See- und Handelsgericht in Dänemark entschieden.',
  },
  it: {
    'Kontrakt, punkt 11': 'Contratto, sezione 11',
    '11. Varighed og opsigelse': '11. Durata e risoluzione',
    'Denne kontrakt træder i kraft ved underskrift og løber indtil opsigelse af en af parterne med  et opsigelsesvarsel første ganag på 24 måneder herefter 6 måneder.': 'Il presente contratto entra in vigore alla firma e rimane valido fino alla risoluzione da parte di una delle parti. Il primo periodo di preavviso è di 24 mesi, successivamente di 6 mesi.',
    'Fornyelse af kontrakten sker automatisk med ét år ad gangen senest 1. september, med mindre en af parterne skriftligt ønsker genforhandling senest 1. august samme år.': 'Il contratto si rinnova automaticamente di anno in anno il 1° settembre, salvo che una delle parti richieda per iscritto una rinegoziazione entro il 1° agosto dello stesso anno.',
    'Hvis betalinger ikke finder sted senest 8 dage efter, det på fakturaen anvist betalingsdato. Samt modtagelse af rykker fra Timan kan aftalen opsiges med 1 månedes varsel.': 'Se il pagamento non avviene entro 8 giorni dalla data indicata in fattura e dal ricevimento di un sollecito da Timan, il contratto può essere risolto con un preavviso di un mese.',
    'Ved opsigelse af kontrakten er det {{partnerPossessive}} pligt at fjerne Timan -navnet og produktsider fra {{partnerPossessive}} markedsføringsmateriale og bygning.': 'Alla cessazione del contratto, {{partnerPossessive}} deve rimuovere il nome Timan e le pagine dei prodotti dal materiale di marketing e dalle sedi di {{partnerPossessive}}.',
    'Ved retslige tvister afgøres dette ved Sø og Handelsretten i Danmark.': 'Le controversie giudiziarie sono decise dal Tribunale marittimo e commerciale danese.',
  },
  hu: {
    'Kontrakt, punkt 11': 'Szerződés, 11. pont',
    '11. Varighed og opsigelse': '11. Időtartam és felmondás',
    'Denne kontrakt træder i kraft ved underskrift og løber indtil opsigelse af en af parterne med  et opsigelsesvarsel første ganag på 24 måneder herefter 6 måneder.': 'A jelen szerződés az aláírással lép hatályba, és valamelyik fél felmondásáig marad hatályban. A kezdeti felmondási idő 24 hónap, ezt követően 6 hónap.',
    'Fornyelse af kontrakten sker automatisk med ét år ad gangen senest 1. september, med mindre en af parterne skriftligt ønsker genforhandling senest 1. august samme år.': 'A szerződés minden év szeptember 1-jén automatikusan egy évvel meghosszabbodik, kivéve, ha valamelyik fél ugyanazon év augusztus 1-jéig írásban újratárgyalást kér.',
    'Hvis betalinger ikke finder sted senest 8 dage efter, det på fakturaen anvist betalingsdato. Samt modtagelse af rykker fra Timan kan aftalen opsiges med 1 månedes varsel.': 'Ha a fizetés nem történik meg a számlán feltüntetett fizetési határidőt követő 8 napon belül és a Timan fizetési felszólításának kézhezvételét követően, a szerződés egy hónapos felmondási idővel megszüntethető.',
    'Ved opsigelse af kontrakten er det {{partnerPossessive}} pligt at fjerne Timan -navnet og produktsider fra {{partnerPossessive}} markedsføringsmateriale og bygning.': 'A szerződés megszűnésekor {{partnerPossessive}} köteles eltávolítani a Timan nevet és a termékoldalakat {{partnerPossessive}} marketinganyagaiból és telephelyeiről.',
    'Ved retslige tvister afgøres dette ved Sø og Handelsretten i Danmark.': 'A jogvitákat a dán Tengerészeti és Kereskedelmi Bíróság dönti el.',
  },
  sv: {
    'Kontrakt, punkt 11': 'Avtal, punkt 11',
    '11. Varighed og opsigelse': '11. Löptid och uppsägning',
    'Denne kontrakt træder i kraft ved underskrift og løber indtil opsigelse af en af parterne med  et opsigelsesvarsel første ganag på 24 måneder herefter 6 måneder.': 'Detta avtal träder i kraft vid undertecknandet och gäller tills det sägs upp av någon av parterna. Den första uppsägningstiden är 24 månader och därefter 6 månader.',
    'Fornyelse af kontrakten sker automatisk med ét år ad gangen senest 1. september, med mindre en af parterne skriftligt ønsker genforhandling senest 1. august samme år.': 'Avtalet förnyas automatiskt med ett år i taget den 1 september, om inte någon av parterna skriftligen begär omförhandling senast den 1 augusti samma år.',
    'Hvis betalinger ikke finder sted senest 8 dage efter, det på fakturaen anvist betalingsdato. Samt modtagelse af rykker fra Timan kan aftalen opsiges med 1 månedes varsel.': 'Om betalning inte sker inom 8 dagar efter det betalningsdatum som anges på fakturan och efter mottagande av en påminnelse från Timan, får avtalet sägas upp med en månads varsel.',
    'Ved opsigelse af kontrakten er det {{partnerPossessive}} pligt at fjerne Timan -navnet og produktsider fra {{partnerPossessive}} markedsføringsmateriale og bygning.': 'Vid uppsägning av avtalet ska {{partnerPossessive}} ta bort namnet Timan och produktsidorna från {{partnerPossessive}} marknadsföringsmaterial och lokaler.',
    'Ved retslige tvister afgøres dette ved Sø og Handelsretten i Danmark.': 'Rättsliga tvister avgörs av Danmarks sjö- och handelsdomstol.',
  },
  fr: {
    'Kontrakt, punkt 11': 'Contrat, section 11',
    '11. Varighed og opsigelse': '11. Durée et résiliation',
    'Denne kontrakt træder i kraft ved underskrift og løber indtil opsigelse af en af parterne med  et opsigelsesvarsel første ganag på 24 måneder herefter 6 måneder.': 'Le présent contrat entre en vigueur à sa signature et reste valable jusqu’à sa résiliation par l’une des parties. Le premier délai de préavis est de 24 mois, puis de 6 mois.',
    'Fornyelse af kontrakten sker automatisk med ét år ad gangen senest 1. september, med mindre en af parterne skriftligt ønsker genforhandling senest 1. august samme år.': 'Le contrat est renouvelé automatiquement d’un an à la fois le 1er septembre, sauf si l’une des parties demande par écrit une renégociation au plus tard le 1er août de la même année.',
    'Hvis betalinger ikke finder sted senest 8 dage efter, det på fakturaen anvist betalingsdato. Samt modtagelse af rykker fra Timan kan aftalen opsiges med 1 månedes varsel.': 'Si le paiement n’est pas effectué dans les 8 jours suivant la date indiquée sur la facture et après réception d’un rappel de Timan, le contrat peut être résilié avec un préavis d’un mois.',
    'Ved opsigelse af kontrakten er det {{partnerPossessive}} pligt at fjerne Timan -navnet og produktsider fra {{partnerPossessive}} markedsføringsmateriale og bygning.': 'À la résiliation du contrat, {{partnerPossessive}} doit retirer le nom Timan et les pages produits des supports marketing et des locaux de {{partnerPossessive}}.',
    'Ved retslige tvister afgøres dette ved Sø og Handelsretten i Danmark.': 'Les litiges judiciaires sont tranchés par le tribunal maritime et commercial du Danemark.',
  },
  pl: {
    'Kontrakt, punkt 11': 'Umowa, punkt 11',
    '11. Varighed og opsigelse': '11. Okres obowiązywania i wypowiedzenie',
    'Denne kontrakt træder i kraft ved underskrift og løber indtil opsigelse af en af parterne med  et opsigelsesvarsel første ganag på 24 måneder herefter 6 måneder.': 'Niniejsza umowa wchodzi w życie z chwilą podpisania i obowiązuje do czasu jej wypowiedzenia przez jedną ze stron. Pierwszy okres wypowiedzenia wynosi 24 miesiące, a następnie 6 miesięcy.',
    'Fornyelse af kontrakten sker automatisk med ét år ad gangen senest 1. september, med mindre en af parterne skriftligt ønsker genforhandling senest 1. august samme år.': 'Umowa jest automatycznie odnawiana o jeden rok w dniu 1 września, chyba że jedna ze stron zażąda pisemnie renegocjacji najpóźniej do 1 sierpnia tego samego roku.',
    'Hvis betalinger ikke finder sted senest 8 dage efter, det på fakturaen anvist betalingsdato. Samt modtagelse af rykker fra Timan kan aftalen opsiges med 1 månedes varsel.': 'Jeżeli płatność nie nastąpi w ciągu 8 dni od terminu wskazanego na fakturze oraz po otrzymaniu wezwania od Timan, umowa może zostać wypowiedziana z miesięcznym okresem wypowiedzenia.',
    'Ved opsigelse af kontrakten er det {{partnerPossessive}} pligt at fjerne Timan -navnet og produktsider fra {{partnerPossessive}} markedsføringsmateriale og bygning.': 'Po wypowiedzeniu umowy {{partnerPossessive}} ma obowiązek usunąć nazwę Timan i strony produktów z materiałów marketingowych oraz siedzib {{partnerPossessive}}.',
    'Ved retslige tvister afgøres dette ved Sø og Handelsretten i Danmark.': 'Spory sądowe rozstrzyga duński Sąd Morski i Handlowy.',
  },
  cs: {
    'Kontrakt, punkt 11': 'Smlouva, bod 11',
    '11. Varighed og opsigelse': '11. Doba trvání a ukončení',
    'Denne kontrakt træder i kraft ved underskrift og løber indtil opsigelse af en af parterne med  et opsigelsesvarsel første ganag på 24 måneder herefter 6 måneder.': 'Tato smlouva nabývá účinnosti podpisem a trvá do jejího ukončení některou ze stran. Počáteční výpovědní doba je 24 měsíců a poté 6 měsíců.',
    'Fornyelse af kontrakten sker automatisk med ét år ad gangen senest 1. september, med mindre en af parterne skriftligt ønsker genforhandling senest 1. august samme år.': 'Smlouva se automaticky prodlužuje vždy o jeden rok k 1. září, pokud některá ze stran nejpozději do 1. srpna téhož roku písemně nepožádá o nové projednání.',
    'Hvis betalinger ikke finder sted senest 8 dage efter, det på fakturaen anvist betalingsdato. Samt modtagelse af rykker fra Timan kan aftalen opsiges med 1 månedes varsel.': 'Není-li platba provedena do 8 dnů po datu splatnosti uvedeném na faktuře a po doručení upomínky od Timan, může být smlouva ukončena s jednoměsíční výpovědní lhůtou.',
    'Ved opsigelse af kontrakten er det {{partnerPossessive}} pligt at fjerne Timan -navnet og produktsider fra {{partnerPossessive}} markedsføringsmateriale og bygning.': 'Při ukončení smlouvy je {{partnerPossessive}} povinen odstranit název Timan a produktové stránky z marketingových materiálů a prostor {{partnerPossessive}}.',
    'Ved retslige tvister afgøres dette ved Sø og Handelsretten i Danmark.': 'Soudní spory rozhoduje dánský námořní a obchodní soud.',
  },
};

function localizeContractTemplate(value: string, language: ContractTextLanguage): string {
  const legalLanguage = resolveApprovedContractLegalLanguage(language);
  if (legalLanguage === 'da') return value;
  const paymentDeliveryTranslation = ALL_PAYMENT_DELIVERY_CONTRACT_TEXT[legalLanguage]?.[value];
  if (paymentDeliveryTranslation) return paymentDeliveryTranslation;
  const terminationTranslation = TERMINATION_CONTRACT_TEXT[legalLanguage]?.[value];
  if (terminationTranslation) return terminationTranslation;
  const translations = legalLanguage === 'de' ? GERMAN_CONTRACT_TEXT : ENGLISH_CONTRACT_TEXT;
  return translations[value] ?? value;
}

export const GUIDED_CONTRACT_SECTIONS: readonly GuidedContractSection[] = [
  {
    stepId: 'purpose_prices_orders_portal',
    title: PURPOSE_PRICES_ORDERS_PORTAL_SECTION_TITLE,
    source: PURPOSE_PRICES_ORDERS_PORTAL_SECTION_SOURCE,
    blocks: [
      {
        heading: '1. Formål',
        paragraphs: [
          'Formålet med denne kontrakt er at fastlægge vilkårene for samarbejdet mellem Timan A/S og {{companyName}}, herefter nævnt som {{partnerSingular}}, vedrørende salg af Timan-maskiner og tilhørende produkter.',
        ],
      },
      {
        heading: '2. Priser, ordre og {{partnerSingular}}portal',
        paragraphs: [
          'Der arbejdes altid efter til enhver tid gældende prisliste.',
          'Ved prisreguleringer reguleres priserne på afgivende ordre, til levering med 3 måneders horisont eller derover.',
          'Ved ordre udfyldes prislisteformularen og sendes til Timan’s sælger som bekræftet ordre.',
          'Prislisten findes på {{partnerPortal}}, som kun {{partnerPlural}} har adgang til.',
          'På {{partnerPortal}} findes også salgsmateriale og service oplysninger',
        ],
      },
      {
        heading: '10. Årligt {{partnerAnnualMeeting}}',
        paragraphs: [
          'Et årligt {{partnerAnnualMeeting}} afholdes i perioden oktober - februar enten fysisk eller via Teams.',
          '{{partnerDefiniteCapitalized}} forpligter sig til at levere firma- og kontaktoplysninger via QR-kode nederst på siden.',
          'Vi forventer, at de involverede personer tilmelder sig vores nyhedsbrev, hvor der kommer relevante {{partnerSingular}}informationer.',
          '(Vi deler ikke personoplysninger med tredje part, QR-kode også nederst på siden)',
        ],
        bullets: [
          'Gennemgang af årets resultater.',
          'Budgetgennemgang',
          'Gennemgang af planlagte aktiviteter.',
          '{{partnerDefiniteCapitalized}} forpligter sig til at udfylde et kort spørgeskema vedrørende samarbejdet, aktivitetsplan for det kommende år.',
        ],
      },
    ],
  },
  {
    stepId: 'territory',
    title: 'Område og Bilag 3',
    guidedTitle: 'Område',
    source: 'Kontrakt, punkt 3 + Bilag 3',
    hideGuidedSource: true,
    blocks: [
      {
        heading: 'Bilag 3: Området',
        paragraphs: [
          '1. Aftalen (salg og reservedele)',
          'Inden for det primære område vil Timan ikke indgå aftaler med nye {{partnerPlural}}.',
          'Slutkunden bestemmer selv, hvilken Timan-samarbejdspartner de ønsker at handle med.',
          'Hvis Timan kontaktes gives dette lead til nærmeste {{partnerSingular}} ud fra kundens oplysninger.',
          'Hvis en slutkunde inden for dette område ønsker at bestille reservedele via Timan’s webshop, skal dette aftales på forhånd med {{partnerDefinite}}, og {{partnerDefinite}} retter efterfølgende henvendelse til Timan - faktureringen vil ske gennem {{partnerDefinite}}.',
          'Brutto prisen vil være synlig for alle, prisen til slutkunden aftales mellem {{partnerSingular}} og slutkunde.',
          '2. Området omfatter som kortet også viser:',
          'Primære område:',
        ],
        bullets: [
          '{{primaryTerritoryDescription}}',
        ],
      },
      {
        heading: 'Sekundær område',
        bullets: [
          '{{secondaryTerritoryDescription}}',
          'I dette område må {{partnerDefinite}} udføre opsøgende salg.',
        ],
      },
    ],
  },
  {
    stepId: 'discount_structure',
    title: 'Rabatstruktur og Bilag 2',
    guidedTitle: 'Rabatstruktur',
    source: 'Kontrakt, punkt 4 + Bilag 2',
    hideGuidedSource: true,
    blocks: [
      {
        heading: '4. Rabatstruktur',
        paragraphs: ['Rabat opnås baseret som følgende:'],
        bullets: [
          'Flere maskiner: Køb af flere maskiner giver yderligere rabat.',
          'Længere leveringstid: Ved leveringstid over 3 mdr. tilbydes øget rabat.',
          'Salg uden demonstration: Hvis {{partnerDefinite}} opnår et salg uden, at Timan har været involveret i en demonstration, til skønnes dette med rabat.',
          'Se bilag 2.',
        ],
      },
    ],
  },
  {
    stepId: 'demo_machines',
    title: 'Demo-maskiner',
    source: 'Kontrakt, punkt 5',
    blocks: [
      {
        heading: '5. Demo-maskiner',
        bullets: [
          'Det forventes at {{partnerDefinite}} investere i demo-maskiner.',
          '{{partnerDefiniteCapitalized}} kan erhverve 1 stk. af hver maskine pr. år til demonstrations-brug.',
          'Demo-maskiner må ikke videresælges før 9 måneder efter levering fra Timan A/S.',
          'Overholdes dette ikke vil Timan opkræve differencen til den almindelige maskinrabat.',
          'Demonstrationsmaskinerabat: 25 %–10 %.',
        ],
      },
    ],
  },
  {
    stepId: 'spare_parts_service',
    title: 'Reservedele og service',
    source: 'Kontrakt, punkt 6 og 8 + Bilag 1',
    hideGuidedSource: true,
    blocks: [
      {
        heading: '6. Reservedele og Service',
        paragraphs: ['{{partnerDefiniteCapitalized}} forpligter sig til at varetage alt support omkring service og reservedele f.eks. :'],
        bullets: [
          'Reservedele bestilles via Timan A/S\' webshop.',
          'Rabat på reservedele følger grundrabatten, der er gældende for maskiner.',
          'Levering af reservedele er frit leveret med den transportør, der vælges af Timan. Timan betaler fragt tur/retur for reklamationsdele i forbindelse med godkendt reklamation.',
        ],
      },
      {
        heading: '8. Salgs- og servicedage',
        paragraphs: ['{{partnerDefiniteCapitalized}} forpligter sig til at have mindst én sælger/demonstratør samt servicetekniker til at være:'],
        bullets: [
          'Opdateret på Timan’s produkter + To salgsdage ved Timan A/S i Tim det første år.',
          'Opdateret med teknisk viden på Timan’s produkter + En service dag ved Timan A/S i Tim det første år.',
          'Efterfølgende forpligtes der hermed til at deltage i salgs- og servicedage, hvis Timan A/S indkalder til dette.',
        ],
      },
      {
        heading: 'Bilag 1: Service og garanti betingelser',
        paragraphs: [
          '1. Reklamation',
          'Før start af reklamation kontaktes Timan, og forløbet aftales mellem parterne.',
        ],
        bullets: [
          'En reklamation må ikke påbegyndes inden Timan har udstedt en reklamations nummer.',
          'Ved akut udkald kontaktes Timan ved først kommende lejlighed for at aftale det videre forløb.',
          'Reklamationer må kun udføres af autoriseret Timan forhandler.',
          'Reklamationssager behandles i samarbejde med {{partnerDefinite}} for at sikre en hurtig og effektiv løsning.',
        ],
      },
      {
        heading: '2. Garanti registreringer',
        paragraphs: [
          'Alle garantiregistreringer skal udføres af {{partnerDefinite}} med fakturadato fra {{partnerSingular}} til slutkunden.  Registreringen foretages via Forms-formularen, som kan tilgås via linket på {{partnerPortal}}, eller ved hjælp af QR -koden, der findes i alle manualer, der følger med maskinen.',
          '2.1 Garantibetingelser for demomaskiner:',
        ],
        bullets: [
          'Der ydes maksimalt 24 måneders garanti på demomaskiner regnet fra fakturadato til {{partnerDefinite}}.',
          'Ved salg af demomaskiner efter 9-12 måneder gives 12 måneders garanti fra Timan.',
          'Ved salg efter 12 måneder reduceres garantiperioden tilsvarende med 1 måneder for hver efterfølgende måned, maskinen er i brug før salget.',
          'Udlejes demomaskinen yders der 12 måneders garanti fra fakturadato til {{partnerDefinite}}.',
        ],
      },
      {
        heading: '3. Godtgørelse',
        bullets: [
          'Godtgørelse dækkes via kreditnota.',
          'Reklamationsdelen skal opbevares i minimum 6 måneder eller sendes til Timan på foranledning af serviceafdelingen hos Timan.',
        ],
      },
      {
        heading: '4. Timeløn og Transport',
        bullets: [
          'Timan betaler {{serviceHourlyRateDkk}} pr. forbrugt time i forbindelse med udbedring af reklamationer.',
          'Timesatsen er baseret på dækning af de interne udgifter',
          'Maksimalt 6 timers kørsel pr. reklamation dækkes af Timan. {{serviceHourlyRateDkk}} pr. køretime.',
          'Timan dækker ikke transportomkostninger for maskinen eller andre følgeomkostninger i forbindelse med reklamationer.',
        ],
      },
      {
        heading: 'Redskaber fra tredjepartsproducenter',
        paragraphs: [
          'Timan tilbyder udvalgte redskaber og tilbehør, som produceres af eksterne tredjepartsproducenter og indkøbes af Timan til videresalg.',
          'For disse produkter gælder, at reservedele som udgangspunkt skal bestilles og købes direkte hos den pågældende producent eller dennes anviste reservedelskanal.',
          'Timan kan for udvalgte tredjepartsprodukter stille reservedelskataloger, reservedelsnumre, teknisk dokumentation eller anden relevant information til rådighed via Timans reservedelsportal. Denne information stilles til rådighed som hjælp til identifikation af korrekte reservedele og som vejledning i forbindelse med service og vedligeholdelse.',
          'At reservedelsinformation er tilgængelig via Timans reservedelsportal betyder ikke, at de pågældende reservedele lagerføres eller sælges af Timan. Bestilling og køb af reservedele til disse tredjepartsprodukter skal ske direkte hos producenten eller via den kanal, producenten har anvist.',
        ],
      },
      {
        heading: '8. Kontakt',
        paragraphs: ['Serviceafdelingen kontaktes pr telefon eller på mail Service@timan.dk'],
      },
    ],
  },
  {
    stepId: 'marketing',
    title: 'Marketing',
    source: 'Kontrakt, punkt 7 og 7.1',
    blocks: [
      {
        heading: '7. Marketingforpligtelser {{partnerLabel}}',
        bullets: [
          '{{partnerDefiniteCapitalized}} skal promovere Timan A/S\' brand med tekst og billeder på {{partnerPossessive}} hjemmeside.',
          'De nyeste billeder af Timan-maskiner og redskaber skal løbende opdateres ved ændringer.',
          'Brugen af Timan-logo, farver og design skal være på hjemmesiden og altid i den nyeste version.',
        ],
      },
      {
        heading: '7.1 Marketingforpligtelser Timan',
        bullets: [
          '{{partnerPossessiveCapitalized}} oplysninger (navn og adresse) vil blive fremhævet på Timans officielle hjemmeside.',
          'Adgang til Timans digitale platforme for markedsføringsmateriale.',
          'Timan stiller brochurer og andet digitalt salgsmateriale til rådighed.',
        ],
      },
    ],
  },
  {
    stepId: 'payment_delivery',
    title: 'Betaling og levering',
    source: 'Kontrakt, punkt 9 + Bilag 4',
    blocks: [
      {
        heading: '9. Betaling og Levering',
        bullets: [
          'Maskiner og udstyr leveres i henhold til FCA Tim (Free Carrier) – Incoterms® 2020. Reservedele leveres i henhold til CPT',
          'Tim (Carriage Paid To) – Incoterms® 2020.',
          'Se mere om leveringsbetingelser: bilag 4.',
          'Opstart af maskine pålægges et gebyr i henhold til gældende prisliste.',
          '{{paymentTermsLegalText}}',
          'Ved manglende betaling vil der blive pålagt lovbestemte renter.',
        ],
      },
      {
        heading: 'Bilag 4: Salgs- og leveringsbetingelser',
        paragraphs: [
          'Disse almindelige Salgs- og Leveringsbetingelser (”Leveringsbetingelserne”) gælder for alle leverancer af produkter og/eller serviceydelser (”Produkter”) fra Timan A/S (betegnet Timan) til enhver kunde (”Køber”). Leveringsbetingelserne skal være gensidigt bindende for Timan og Køber, medmindre andet er udtrykkeligt aftalt. Timan er ikke bundet af vilkår fremsat af Køber, som afviger fra Leveringsbetingelserne, medmindre sådanne vilkår er aftalt skriftligt mellem Timan og Køber. Timan er heller ikke bundet af vilkår fremsat af Køber, selv om Timan ikke har gjort indsigelse mod sådanne vilkår.',
          '1. For enhver leverance fra Timan skal nedennævnte salgs - og leveringsbetingelser være gældende, medmindre andet skriftligt er aftalt mellem parterne.',
          '2. Tilbud: Tilbud fra Timan bortfalder efter 8 dage, hvis intet andet er angivet. Timan tager forbehold for mellemsalg.',
          '3. Materiale: Timan påtager sig intet ansvar for eventuelle fejl eller oplysninger i udleveret skriftligt materiale om produkter/elementer i produkter, udarbejdet af Timans leverandører.',
          '4. Priser: Al salg sker til priser, som er gældende på leveringsdagen. Det vil sige, mellemkommende afgiftsforhø jelser, prisændringer fra Timans leverandører, kursændringer over 3%, devalueringer m.v. på den aftalte vare berettiger Timan til at forhøje prisen tilsvarende. Er priserne skriftligt bekræftet, finder ovenstående kun anvendelse efter nærmere aftale.',
          '5. Betalingsvilkår: Købesummen inklusiv alle afgifter og omkostninger betales kontant ved levering til Timan, med mindre andet aftales.',
          '6. Levering: Levering sker i henhold til den mellem parterne aftalte leveringsbetingelse i overensstemmelse med Incoterms® 2020, medmindre andet er skriftligt aftalt.',
          'Såfremt der ikke er aftalt en specifik leveringsbetingelse, sker levering af maskiner i henhold til FCA (Free Carrier), Incoterms® 2020 , mens levering af reservedele og øvrige pakkeforsendelser sker i henhold til CPT (Carriage Paid To), Incoterms® 2020.',
          'Køber kan vælge en anden leveringsbetingelse, herunder EXW (Ex Works), Incoterms® 2020 , forudsat at dette aftales skriftligt mellem parterne.',
          'Levering anses for sket, og risikoen for varerne overgår til køber i overensstemmelse med den aftalte leveringsbetingelse.',
          '7. Leveringstid, forsinkelser:  De af Timan opgivne leveringstider er alene vejledende, medmindre andet er skriftligt bekræftet. Endelig leveringstid er først bindende, når den er skriftligt bekræftet af Timan.',
          'Såfremt levering forsinkes som følge af forhold, der udgør ansvarsfrihed i henhold til punkt 8, eller som skyldes købers forhold, forlænges leveringstiden i det omfang, det efter omstændighederne findes rimeligt.',
          'Forsinkelse giver ikke køber ret til at hæve købet eller kræve erstatning, medmindre andet følger af ufravigelig lovgivning.',
          '8. Ansvarsfrihed (force majeure): Timan er ikke ansvarlig for manglende opfyldelse af sine forpligtelser, såfremt dette skyldes forhold uden for Timans kontrol, som Timan ikke med rimelighed kunne have forudset eller undgået ved aftalens indgåelse.',
          'Som ansvarsfrihedsgrunde anses blandt andet, men ikke begrænset til: driftsforstyrrelser, IT -nedbrud, arbejdskonflikter, brand, krig, mobilisering, naturkatastrofer, pandemier, myndighedsindgreb, valutarestriktioner, transportvanskeligheder, mangel på arbejdskraft eller materialer, samt forsinkelser eller mangler fra underleverandører.',
          'I sådanne tilfælde suspenderes Timans forpligtelser, så længe hindringen består.',
          'Køber er ikke berettiget til at hæve købet, kræve erstatning eller gøre andre misligholdelsesbeføjelser gældende som følge af sådanne forhold.',
          '9. Produktansvar: Sælger påtager sig intet ansvar for skader på person eller gods ud over, hvad der følger af ufravigelig lovgivning, som sælger er underlagt i Danmark, og da kun i det omfang, det følger af sådanne regler.',
          'Sælger er ikke ansvarlig for indirekte tab, herunder følgeskader, driftstab, tabt avance eller andre økonomiske konsekvenstab.',
          'Sælger påtager sig ikke ansvar for skade på købers gods, der opstår i forbindelse med købers erhvervsmæssige anvendelse af det købte.',
          'I det omfang sælger måtte blive pålagt ansvar over for tredjemand i forbindelse med købers brug eller videresalg af det købte, er køber forpligtet til at skadesløs holde sælger  i det omfang, et sådant ansvar går ud over de ovenfor fastsatte begrænsninger.',
          'Ansvarsperioden er begrænset til 1 år fra leveringstidspunktet.',
          'Sælgers samlede ansvar for produktskader kan i intet tilfælde overstige dækningssummen i sælgers produktansvarsforsikring.',
          'Køber er forpligtet til at lade sig sagsøge ved samme domstol, som behandler erstatningskrav mod sælger i anledning af de solgte produkter. Det indbyrdes forhold mellem sælger og køber afgøres dog i henhold til punkt 16, såfremt enighed ikke kan opnås.',
          '10. Ejendomsforbehold: Ejendomsretten over de solgte genstande forbliver hos Timan eller den, til hvem han har overdraget sine rettigheder, indtil hele købesummen med renter og omkostninger m.v. er fuldt betalt. Under ejendomsforbeholdet indgår også de ting, som måtte blive indføjet i eller senere leveret til komplettering, istandsættelse eller ændring i udstyr af de solgte genstande . Indtil hele købesummen inkl. renter og omkostninger er betalt, er køberen uberettiget til at sælge, pantsætte, udleje eller på anden måde disponere retligt over det solgte.',
          'Ved salg til Tyskland tages desuden ejendomsforbehold i den nye ting, som den solgte genstand måtte være om forarbejdet til eller blevet en bestanddel af eller til fordring på betaling af købesummen ved videresalg - dvs. Timan tager såvel simpelt ejendomsforbehold (Eigentumsvorbehalt) samt udvidet ejendomsforbehold ( erweiteter Eigentumsvorbehalt). Ejendomsforbeholdet i leverancer dækker også tidligere udækkede leverancer fra Timan til køber.',
          '11. Renter: Såfremt nogen ydelse eller omkostning til forfaldstid, erlægges en morarente, som udgør 2% pr. påbegyndt måned af det forfaldne beløb.',
          '12. Forsikring: Så længe den fulde købesum med tillæg af renter og omkostninger ikke er betalt, er køberen pligtig til at tegne sædvanlig brand- og tyveriforsikring for det købte.',
          'Køber bærer risikoen for det købte i overensstemmelse med den aftalte leveringsbetingelse.',
          '13. Service og reklamationsbestemmelser: For nye maskiner ombytter Timan  i 12 måneder fra ibrugtagningsdagen  eller indtil det timetal der er anført i produktets brugermanual, det der kommer først , dele der er defekte på grund af materiale, monterings- eller fabrikationsfejl.',
          'Ibrugtagningsdagen er iht. garantiregistrering foretaget til Timan. Er garantiregistrering ikke foretaget til Timan beregnes ibrugtagningsdagen fra leveringsdatoen.',
          'Ombytning finder ikke sted på grund af normalt slid, - hvis fejlen skyldes vanrøgt, - at købe ren ikke har fulgt instruktioner eller produktets serviceplan iht. produktets brugermanual  fra Timan  eller der er anvendt uoriginale reservedele.',
          'For vurdering af en reklamation stiller Køber ved påkrav fra Timan, dokumentation for gennemførte servicearbejder til rådighed i form af udstedte fakturaer på servicearbejder samt udfyldte servicehæfte.  Kan ovennævnte dokumentation ikke fremskaffes er Timan berettiget til uden yderligere begrundelse at afvise en given reklamation.',
          'Udgifter til arbejdsløn samt udgifter i forbindelse med udskiftning af en reklamationsberettiget  vare dækkes kun efter anden aftale.',
          'For driftstab og andre indirekte tab i forbindelse med mangler ved det solgte ydes ingen erstatning. For elektriske  og hydrauliske anlæg, dæk og slanger gælder de respektive fabrikkers service- og reklamationsbestemmelser.',
          'Reklamationsarbejder skal udføres iht. Timans reklamationsprocedure.',
          '14. Reklamationsprocedure: Før reklamationsarbejdet påbegyndes, kontaktes Timan enten pr. telefon eller ved tilsendelse af delvist udfyldt reklamationsrapport.',
          'Efter henvendelse eller modtagelse af rapport udsteder Timan et reklamationsnummer.',
          'Timan skal ved enhver reklamation have mulighed for at give anvisninger på reklamationsarbejdets udførelse.',
          'Efter udstedelse af reklamationsnummer, tilsendes Timan endelig reklamationsrapport inden 8 dage.',
          '15. Ansvar: Timan har, ud over hvad der følger af punkt 9, intet ansvar for indirekte tab, herunder driftstab, tabt arbejdsfortjeneste og andre økonomiske konsekvenstab.',
          '16. Lovvalg og værneting:  Nærværende almindelige salgs- og leveringsbetingelser skal være gældende for enhver tvist parterne imellem, men er et forhold ikke omtalt i leveringsbetingelserne, finder Den Danske Købelov, lov nr. 120 af 06.04.1906, med efterfølgende supplerende ændringer, og i øvrigt dansk ret, anvendelse.  Tvistigheder i anledning af købsaftalen eller nærværende salgs - og leveringsbetingelser kan efter Sælgers valg underkastes domstolsprøvelse eller afgøres endeligt ved voldgift i overensstemmelse med reglerne i Lov nr. 181 at 24.05.1972 om voldgift.',
        ],
      },
    ],
  },
  {
    stepId: 'termination',
    title: 'Opsigelse og afsluttende vilkår',
    source: 'Kontrakt, punkt 11',
    blocks: [
      {
        heading: '11. Varighed og opsigelse',
        paragraphs: [
          'Denne kontrakt træder i kraft ved underskrift og løber indtil opsigelse af en af parterne med  et opsigelsesvarsel første ganag på 24 måneder herefter 6 måneder.',
          'Fornyelse af kontrakten sker automatisk med ét år ad gangen senest 1. september, med mindre en af parterne skriftligt ønsker genforhandling senest 1. august samme år.',
          'Hvis betalinger ikke finder sted senest 8 dage efter, det på fakturaen anvist betalingsdato. Samt modtagelse af rykker fra Timan kan aftalen opsiges med 1 månedes varsel.',
          'Ved opsigelse af kontrakten er det {{partnerPossessive}} pligt at fjerne Timan -navnet og produktsider fra {{partnerPossessive}} markedsføringsmateriale og bygning.',
          'Ved retslige tvister afgøres dette ved Sø og Handelsretten i Danmark.',
        ],
      },
    ],
  },
];

function capitalize(value: string) {
  return value ? `${value.slice(0, 1).toUpperCase()}${value.slice(1)}` : value;
}

function renderContractText(value: string, context: ContractTextRenderContext, language: ContractTextLanguage): string {
  const legalLanguage = resolveApprovedContractLegalLanguage(language);
  const terms = getContractPartnerTerms(context.partnerType, legalLanguage);
  const companyName = context.companyName.trim();
  const localizedValue = localizeContractTemplate(value, language);
  const resolvedDiscounts = localizedValue.includes('{{sparePartsDiscountPct}}')
    ? getContractDiscountStructure(context.partnerType, context, {
      preserveStoredDiscounts: context.preserveDiscountSnapshot,
    })
    : null;

  return localizedValue
    .replaceAll('{{companyName}}', companyName)
    .replaceAll('{{partnerLabel}}', terms?.label ?? '')
    .replaceAll('{{partnerSingular}}', terms?.singular ?? '')
    .replaceAll('{{partnerDefinite}}', terms?.definite ?? '')
    .replaceAll('{{partnerDefiniteCapitalized}}', terms ? capitalize(terms.definite) : '')
    .replaceAll('{{partnerPlural}}', terms?.plural ?? '')
    .replaceAll('{{partnerPossessive}}', terms?.possessive ?? '')
    .replaceAll('{{partnerPossessiveCapitalized}}', terms ? capitalize(terms.possessive) : '')
    .replaceAll('{{partnerPortal}}', terms?.portal ?? '')
    .replaceAll('{{partnerAnnualMeeting}}', terms?.annualMeeting ?? '')
    .replaceAll('{{primaryTerritoryDescription}}', describeContractTerritoryArea(context.primaryTerritory, legalLanguage))
    .replaceAll('{{secondaryTerritoryDescription}}', describeContractSecondaryTerritoryArea(context.secondaryTerritory, legalLanguage))
    .replaceAll('{{sparePartsDiscountPct}}', String(context.sparePartsDiscountPct ?? resolvedDiscounts?.sparePartsDiscountPct ?? ''))
    .replaceAll('{{serviceHourlyRateDkk}}', formatContractServiceHourlyRateDkk(context.serviceHourlyRateDkk))
    .replaceAll('{{paymentTermsLegalText}}', renderContractPaymentTermLegalText(context.paymentTerm, legalLanguage));
}

function renderContractBulletText(value: string, context: ContractTextRenderContext, language: ContractTextLanguage) {
  const legalLanguage = resolveApprovedContractLegalLanguage(language);
  if (value === '{{primaryTerritoryDescription}}') {
    return getContractTerritoryDisplayItems(context.primaryTerritory, legalLanguage);
  }
  if (value === '{{secondaryTerritoryDescription}}') {
    return getContractTerritoryDisplayItems(context.secondaryTerritory, legalLanguage);
  }
  return [renderContractText(value, context, language)];
}

function getDiscountStructureBlocks(context: ContractTextRenderContext): ContractTextBlock[] {
  const discounts = getContractDiscountStructure(context.partnerType, context, {
    preserveStoredDiscounts: context.preserveDiscountSnapshot,
  });
  const historicalBlock = GUIDED_CONTRACT_SECTIONS
    .find((section) => section.stepId === 'discount_structure')?.blocks[0];
  const historicalParagraphs = historicalBlock?.paragraphs ?? [];
  const historicalBullets = historicalBlock?.bullets ?? [];

  if (context.partnerType === 'importer') {
    return [{
      heading: '4. Rabatstruktur',
      paragraphs: historicalParagraphs,
      bullets: historicalBullets,
    }];
  }

  if (context.partnerType === 'service_partner') {
    return [{
      heading: '4. Rabatstruktur',
      paragraphs: [
        'Reservedelsrabat: {{sparePartsDiscountPct}}%.',
        'Maskiner købes gennem den autoriserede Timan-forhandler, som servicepartneren samarbejder med.',
        ...historicalParagraphs,
      ],
      bullets: historicalBullets,
    }];
  }

  return [{
    heading: '4. Rabatstruktur',
    paragraphs: historicalParagraphs,
    bullets: historicalBullets,
  }];
}

export function renderGuidedContractSections(
  context: ContractTextRenderContext,
  language: ContractTextLanguage = 'da',
): GuidedContractSection[] {
  return GUIDED_CONTRACT_SECTIONS.map((section) => {
    const sourceBlocks = section.stepId === 'discount_structure'
      ? getDiscountStructureBlocks(context)
      : section.blocks;

    return ({
    ...section,
    title: SECTION_TITLES[section.stepId][language] ?? SECTION_TITLES[section.stepId].en,
    source: localizeContractTemplate(section.source, language),
    blocks: sourceBlocks
      .map((block) => ({
        heading: block.heading ? renderContractText(block.heading, context, language) : undefined,
        paragraphs: block.paragraphs?.map((paragraph) => renderContractText(paragraph, context, language)).filter(Boolean),
        bullets: block.bullets?.flatMap((bullet) => renderContractBulletText(bullet, context, language)).filter(Boolean),
      }))
      .filter((block) => (
        section.stepId !== 'territory'
        || block.heading !== 'Sekundær område'
        || describeContractSecondaryTerritoryArea(context.secondaryTerritory, language)
      )),
    });
  });
}

export function getGuidedContractSection(stepId: ContractStepId) {
  return GUIDED_CONTRACT_SECTIONS.find((section) => section.stepId === stepId) ?? null;
}

export function getRenderedGuidedContractSection(
  stepId: ContractStepId,
  context: ContractTextRenderContext,
  language: ContractTextLanguage = 'da',
) {
  return renderGuidedContractSections(context, language).find((section) => section.stepId === stepId) ?? null;
}

export function getGuidedContractDisplayHeading(heading: string) {
  return heading.replace(/^\d+(?:\.\d+)*\.?\s+/, '');
}

export function shouldHideGuidedContractUiText(value: string, sectionTitle: string) {
  const normalized = value.trim().replace(/\s+/g, ' ');
  const sectionAppendixMatch = sectionTitle.match(/Bilag\s+(\d+)/i);
  const sectionAppendixNo = sectionAppendixMatch?.[1];
  if (!sectionAppendixNo) return false;

  const appendixHeading = new RegExp(`^Bilag\\s+${sectionAppendixNo}\\s*:`, 'i');
  if (appendixHeading.test(normalized)) return true;

  const seeAppendix = new RegExp(`^(?:Service betingelser:\\s*)?se\\s+bilag\\s+${sectionAppendixNo}\\.?$`, 'i');
  const seeMoreAppendix = new RegExp(`^se\\s+mere\\s+om\\s+.+:\\s*bilag\\s+${sectionAppendixNo}\\.?$`, 'i');
  return seeAppendix.test(normalized) || seeMoreAppendix.test(normalized);
}
