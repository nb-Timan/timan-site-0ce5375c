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

function localizeContractTemplate(value: string, language: ContractTextLanguage): string {
  if (language === 'da') return value;
  const translations = language === 'de' ? GERMAN_CONTRACT_TEXT : ENGLISH_CONTRACT_TEXT;
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
  const terms = getContractPartnerTerms(context.partnerType, language);
  const companyName = context.companyName.trim();
  const localizedValue = localizeContractTemplate(value, language);

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
    .replaceAll('{{primaryTerritoryDescription}}', describeContractTerritoryArea(context.primaryTerritory, language))
    .replaceAll('{{secondaryTerritoryDescription}}', describeContractSecondaryTerritoryArea(context.secondaryTerritory, language))
    .replaceAll('{{serviceHourlyRateDkk}}', formatContractServiceHourlyRateDkk(context.serviceHourlyRateDkk))
    .replaceAll('{{paymentTermsLegalText}}', renderContractPaymentTermLegalText(context.paymentTerm, language));
}

function renderContractBulletText(value: string, context: ContractTextRenderContext, language: ContractTextLanguage) {
  if (value === '{{primaryTerritoryDescription}}') {
    return getContractTerritoryDisplayItems(context.primaryTerritory, language);
  }
  if (value === '{{secondaryTerritoryDescription}}') {
    return getContractTerritoryDisplayItems(context.secondaryTerritory, language);
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
        `Reservedelsrabat: ${discounts.sparePartsDiscountPct}%.`,
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
