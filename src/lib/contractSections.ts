import type { ContractStepId } from '@/lib/contractFlow';
import { getContractPartnerTerms, type ContractPartnerType } from '@/lib/contractPartnerTerms';
import {
  describeContractSecondaryTerritoryArea,
  describeContractTerritoryArea,
  type ContractSecondaryTerritoryArea,
  type ContractTerritoryArea,
} from '@/lib/contractTerritory';
import { formatContractServiceHourlyRateDkk } from '@/lib/contractServiceTerms';

export type ContractTextBlock = {
  heading?: string;
  paragraphs?: readonly string[];
  bullets?: readonly string[];
};

export type GuidedContractSection = {
  stepId: Exclude<ContractStepId, 'parties' | 'full_contract' | 'signature'>;
  title: string;
  source: string;
  blocks: readonly ContractTextBlock[];
};

export type ContractTextRenderContext = {
  companyName: string;
  partnerType: ContractPartnerType | '' | null | undefined;
  primaryTerritory?: ContractTerritoryArea;
  secondaryTerritory?: ContractSecondaryTerritoryArea;
  serviceHourlyRateDkk?: number;
};

export const GUIDED_CONTRACT_SECTIONS: readonly GuidedContractSection[] = [
  {
    stepId: 'purpose_prices_orders_portal',
    title: 'Formål, priser, ordre og forhandlerportal',
    source: 'Kontrakt, punkt 1, 2 og 10',
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
    source: 'Kontrakt, punkt 3 + Bilag 3',
    blocks: [
      {
        heading: 'Bilag 3: Området',
        paragraphs: [
          '1. Aftalen (salg og reservedele)',
          'Inden for det primære område vil Timan ikke indgå aftaler med nye {{partnerPlural}}.',
          'Slutkunderne vælger selv hvilken {{partnerSingular}} de ønsker at handle med .',
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
    source: 'Kontrakt, punkt 4 + Bilag 2',
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
        ],
      },
    ],
  },
  {
    stepId: 'spare_parts_service',
    title: 'Reservedele og service',
    source: 'Kontrakt, punkt 6 og 8 + Bilag 1',
    blocks: [
      {
        heading: '6. Reservedele og Service',
        paragraphs: ['{{partnerDefiniteCapitalized}} forpligter sig til at varetage alt support omkring service og reservedele f.eks. :'],
        bullets: [
          'Reservedele bestilles via Timan A/S\' webshop.',
          'Rabat på reservedele følger grundrabatten, der er gældende for maskiner.',
          'Levering af reservedele er – Frit leveret med transportøren der vælges af Timan.',
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
        heading: '7. Fragt af dele',
        paragraphs: ['Timan betaler fragten tur / retur for reklamationsdele i forbindelse med behandlingen af en godkendt reklamation.'],
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
          'Betalingsbetingelser: Betaling forfalder netto 21 dage fra fakturadato. Ved manglende betaling vil der blive pålagt',
          'lovbestemte renter.',
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

function renderContractText(value: string, context: ContractTextRenderContext): string {
  const terms = getContractPartnerTerms(context.partnerType);
  const companyName = context.companyName.trim();

  return value
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
    .replaceAll('{{primaryTerritoryDescription}}', describeContractTerritoryArea(context.primaryTerritory, 'da'))
    .replaceAll('{{secondaryTerritoryDescription}}', describeContractSecondaryTerritoryArea(context.secondaryTerritory, 'da'))
    .replaceAll('{{serviceHourlyRateDkk}}', formatContractServiceHourlyRateDkk(context.serviceHourlyRateDkk));
}

export function renderGuidedContractSections(context: ContractTextRenderContext): GuidedContractSection[] {
  return GUIDED_CONTRACT_SECTIONS.map((section) => ({
    ...section,
    blocks: section.blocks
      .map((block) => ({
        heading: block.heading ? renderContractText(block.heading, context) : undefined,
        paragraphs: block.paragraphs?.map((paragraph) => renderContractText(paragraph, context)).filter(Boolean),
        bullets: block.bullets?.map((bullet) => renderContractText(bullet, context)).filter(Boolean),
      }))
      .filter((block) => (
        section.stepId !== 'territory'
        || block.heading !== 'Sekundær område'
        || describeContractSecondaryTerritoryArea(context.secondaryTerritory, 'da')
      )),
  }));
}

export function getGuidedContractSection(stepId: ContractStepId) {
  return GUIDED_CONTRACT_SECTIONS.find((section) => section.stepId === stepId) ?? null;
}

export function getRenderedGuidedContractSection(stepId: ContractStepId, context: ContractTextRenderContext) {
  return renderGuidedContractSections(context).find((section) => section.stepId === stepId) ?? null;
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
