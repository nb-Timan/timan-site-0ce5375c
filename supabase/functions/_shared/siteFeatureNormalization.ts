export const SITE_FEATURE_LANGUAGES = ['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs'] as const;

export type SiteFeatureLanguage = typeof SITE_FEATURE_LANGUAGES[number];

export type SiteFeatureSource = {
  title_internal?: string | null;
  description_internal?: string | null;
  technical_description?: string | null;
};

type UserFacingCopy = Record<SiteFeatureLanguage, { title: string; description: string }>;

type SiteFeatureRule = {
  id: string;
  pattern: RegExp;
  copy: UserFacingCopy;
};

const RULES: SiteFeatureRule[] = [
  {
    id: 'crm-machine-filter',
    pattern: /(?:crm|lead).*(?:machine|maskine).*(?:filter)|(?:machine|maskine).*(?:filter).*(?:crm|lead)/i,
    copy: {
      da: { title: 'Leads er blevet nemmere at filtrere', description: 'Maskinefilteret viser nu kun relevante maskintyper og redskaber.' },
      en: { title: 'Leads are easier to filter', description: 'The machine filter now shows only relevant machine types and implements.' },
      de: { title: 'Leads lassen sich leichter filtern', description: 'Der Maschinenfilter zeigt nur noch relevante Maschinentypen und Anbaugeräte.' },
      it: { title: 'I lead sono più facili da filtrare', description: 'Il filtro mostra ora solo i tipi di macchina e le attrezzature pertinenti.' },
      hu: { title: 'A leadek könnyebben szűrhetők', description: 'A gépszűrő már csak a releváns géptípusokat és munkaeszközöket mutatja.' },
      sv: { title: 'Leads har blivit enklare att filtrera', description: 'Maskinfiltret visar nu bara relevanta maskintyper och redskap.' },
      fr: { title: 'Les leads sont plus faciles à filtrer', description: 'Le filtre affiche désormais uniquement les machines et outils pertinents.' },
      pl: { title: 'Leady można łatwiej filtrować', description: 'Filtr pokazuje teraz tylko odpowiednie typy maszyn i osprzęt.' },
      cs: { title: 'Leady lze snadněji filtrovat', description: 'Filtr nyní zobrazuje jen relevantní typy strojů a nářadí.' },
    },
  },
  {
    id: 'crm-demo-contact',
    pattern: /demo.*(?:dealer|forhandler).*(?:representative|contact|kontakt|person)|(?:representative|contact|kontaktperson).*(?:demo)/i,
    copy: {
      da: { title: 'Kontaktpersoner kan vælges ved demo', description: 'Vælg direkte mellem kontaktpersonerne hos den valgte forhandler.' },
      en: { title: 'Contacts can be selected for demos', description: 'Choose directly from the contacts at the selected dealer.' },
      de: { title: 'Kontaktpersonen können für Demos gewählt werden', description: 'Wählen Sie direkt aus den Kontakten des ausgewählten Händlers.' },
      it: { title: 'I contatti si possono scegliere per le demo', description: 'Scegli direttamente tra i contatti del rivenditore selezionato.' },
      hu: { title: 'A demóhoz kapcsolattartó választható', description: 'Válasszon közvetlenül a kiválasztott kereskedő kapcsolattartói közül.' },
      sv: { title: 'Kontaktpersoner kan väljas för demo', description: 'Välj direkt bland kontaktpersonerna hos den valda återförsäljaren.' },
      fr: { title: 'Les contacts peuvent être choisis pour une démo', description: 'Choisissez directement parmi les contacts du revendeur sélectionné.' },
      pl: { title: 'Do demo można wybrać osobę kontaktową', description: 'Wybierz bezpośrednio kontakt u wybranego dealera.' },
      cs: { title: 'Pro demo lze vybrat kontaktní osobu', description: 'Vyberte přímo z kontaktů u zvoleného prodejce.' },
    },
  },
  {
    id: 'crm-legacy-lead-persistence',
    pattern: /(?:legacy|g[- ]?lead).*(?:persistence|precedence|contact|read)|canonical crm lead read precedence/i,
    copy: {
      da: { title: 'Gamle leads gemmer nu oplysninger korrekt', description: 'Ændringer på ældre G-leads bliver bevaret, når leadet åbnes igen.' },
      en: { title: 'Older leads now save information correctly', description: 'Changes to older G-leads are preserved when the lead is reopened.' },
      de: { title: 'Ältere Leads speichern Angaben jetzt korrekt', description: 'Änderungen an älteren G-Leads bleiben beim erneuten Öffnen erhalten.' },
      it: { title: 'I lead precedenti salvano correttamente i dati', description: 'Le modifiche ai vecchi G-lead restano disponibili dopo la riapertura.' },
      hu: { title: 'A régebbi leadek helyesen mentik az adatokat', description: 'A régi G-leadek módosításai újbóli megnyitáskor is megmaradnak.' },
      sv: { title: 'Äldre leads sparar nu uppgifter korrekt', description: 'Ändringar i äldre G-leads bevaras när leadet öppnas igen.' },
      fr: { title: 'Les anciens leads enregistrent correctement les données', description: 'Les modifications des anciens G-leads sont conservées à la réouverture.' },
      pl: { title: 'Starsze leady poprawnie zapisują dane', description: 'Zmiany w starszych G-leadach pozostają po ponownym otwarciu.' },
      cs: { title: 'Starší leady nyní správně ukládají údaje', description: 'Změny ve starších G-leadech zůstanou po opětovném otevření.' },
    },
  },
  {
    id: 'crm-lead-notes',
    pattern: /(?:lead).*(?:note|follow[- ]?up|opfølgning)|(?:note|follow[- ]?up|opfølgning).*(?:lead)/i,
    copy: {
      da: { title: 'Noter og opfølgning er samlet på leadet', description: 'Tilføj noter og næste opfølgning uden gentagne felter på leadet.' },
      en: { title: 'Notes and follow-up are combined on the lead', description: 'Add notes and the next follow-up without duplicate fields on the lead.' },
      de: { title: 'Notizen und Nachverfolgung sind im Lead gebündelt', description: 'Notizen und nächste Schritte lassen sich ohne doppelte Felder erfassen.' },
      it: { title: 'Note e follow-up sono riuniti nel lead', description: 'Aggiungi note e il prossimo follow-up senza campi duplicati.' },
      hu: { title: 'A jegyzetek és utánkövetések egy helyen vannak', description: 'Jegyzetek és következő lépések ismétlődő mezők nélkül rögzíthetők.' },
      sv: { title: 'Anteckningar och uppföljning är samlade på leadet', description: 'Lägg till anteckningar och nästa uppföljning utan dubbla fält.' },
      fr: { title: 'Les notes et le suivi sont regroupés sur le lead', description: 'Ajoutez des notes et le prochain suivi sans champs en double.' },
      pl: { title: 'Notatki i działania są zebrane w leadzie', description: 'Dodawaj notatki i kolejne działania bez powielonych pól.' },
      cs: { title: 'Poznámky a následné kroky jsou u leadu pohromadě', description: 'Přidávejte poznámky a další krok bez duplicitních polí.' },
    },
  },
  {
    id: 'crm-budget-basis',
    pattern: /original dealer budget basis|oprindelig.*budget|budgetgrundlag/i,
    copy: {
      da: { title: 'Budgetgrundlag er nu synligt', description: 'Se hvordan det oprindelige budget var fordelt på forhandlere.' },
      en: { title: 'The original budget basis is now visible', description: 'See how the original budget was distributed across dealers.' },
      de: { title: 'Die ursprüngliche Budgetbasis ist jetzt sichtbar', description: 'Sehen Sie, wie das ursprüngliche Budget auf Händler verteilt war.' },
      it: { title: 'La base del budget è ora visibile', description: 'Vedi come il budget originale era distribuito tra i rivenditori.' },
      hu: { title: 'Az eredeti költségvetési alap most látható', description: 'Megtekintheti az eredeti költségvetés kereskedők közötti elosztását.' },
      sv: { title: 'Det ursprungliga budgetunderlaget visas nu', description: 'Se hur den ursprungliga budgeten fördelades mellan återförsäljare.' },
      fr: { title: 'La base budgétaire initiale est maintenant visible', description: 'Consultez la répartition initiale du budget entre les revendeurs.' },
      pl: { title: 'Pierwotna podstawa budżetu jest teraz widoczna', description: 'Zobacz pierwotny podział budżetu między dealerów.' },
      cs: { title: 'Původní základ rozpočtu je nyní viditelný', description: 'Podívejte se na původní rozdělení rozpočtu mezi prodejce.' },
    },
  },
  {
    id: 'academy-advanced-sales',
    pattern: /advanced sales campaign academy case|academy.*(?:advanced|campaign).*(?:sales|salg)/i,
    copy: {
      da: { title: 'Ny avanceret salgscase i Academy', description: 'Træn salg af Timan 3330 sammen med CS-200 og kampagner.' },
      en: { title: 'New advanced sales case in Academy', description: 'Practise selling Timan 3330 with CS-200 and campaigns.' },
      de: { title: 'Neue fortgeschrittene Verkaufsaufgabe in Academy', description: 'Trainieren Sie den Verkauf des Timan 3330 mit CS-200 und Kampagnen.' },
      it: { title: 'Nuovo caso di vendita avanzato in Academy', description: 'Esercitati a vendere Timan 3330 con CS-200 e campagne.' },
      hu: { title: 'Új haladó értékesítési eset az Academyben', description: 'Gyakorolja a Timan 3330 értékesítését CS-200-zal és kampányokkal.' },
      sv: { title: 'Nytt avancerat försäljningscase i Academy', description: 'Träna på att sälja Timan 3330 tillsammans med CS-200 och kampanjer.' },
      fr: { title: 'Nouveau cas de vente avancé dans Academy', description: 'Entraînez-vous à vendre le Timan 3330 avec le CS-200 et des campagnes.' },
      pl: { title: 'Nowy zaawansowany przypadek sprzedaży w Academy', description: 'Ćwicz sprzedaż Timan 3330 z CS-200 i kampaniami.' },
      cs: { title: 'Nový pokročilý prodejní případ v Academy', description: 'Procvičte si prodej Timan 3330 s CS-200 a kampaněmi.' },
    },
  },
  {
    id: 'configurator-scroll',
    pattern: /configurator.*scroll.*navigation|reset configurator scroll|scroll.*(?:step|machine|navigation)/i,
    copy: {
      da: { title: 'Konfiguratoren starter øverst ved hvert trin', description: 'Du lander automatisk det rigtige sted, når du skifter trin eller maskine.' },
      en: { title: 'The Configurator starts at the top of each step', description: 'You land in the right place when changing step or machine.' },
      de: { title: 'Der Konfigurator startet bei jedem Schritt oben', description: 'Beim Wechsel von Schritt oder Maschine landen Sie automatisch richtig.' },
      it: { title: 'Il Configurator parte dall’alto a ogni fase', description: 'Passando a una fase o macchina arrivi automaticamente al punto giusto.' },
      hu: { title: 'A Konfigurátor minden lépésnél felül indul', description: 'Lépés- vagy gépváltáskor automatikusan a megfelelő helyre jut.' },
      sv: { title: 'Konfiguratorn börjar högst upp i varje steg', description: 'Du hamnar automatiskt rätt när du byter steg eller maskin.' },
      fr: { title: 'Le Configurateur commence en haut à chaque étape', description: 'Vous arrivez automatiquement au bon endroit en changeant d’étape ou de machine.' },
      pl: { title: 'Konfigurator zaczyna od góry na każdym kroku', description: 'Po zmianie kroku lub maszyny trafiasz automatycznie we właściwe miejsce.' },
      cs: { title: 'Konfigurátor začíná nahoře v každém kroku', description: 'Při změně kroku nebo stroje se automaticky zobrazí správné místo.' },
    },
  },
  {
    id: 'crm-budget-currency',
    pattern: /(?:crm )?budget currency normalization|budget.*(?:currency|valuta)/i,
    copy: {
      da: { title: 'Budget viser nu beløb i korrekt valuta', description: 'Ordrebeløb og totaler omregnes korrekt mellem kroner og euro.' },
      en: { title: 'Budget now shows amounts in the correct currency', description: 'Order amounts and totals are converted correctly between kroner and euros.' },
      de: { title: 'Budget zeigt Beträge jetzt in der richtigen Währung', description: 'Auftragsbeträge und Summen werden korrekt zwischen Kronen und Euro umgerechnet.' },
      it: { title: 'Il budget mostra gli importi nella valuta corretta', description: 'Importi e totali vengono convertiti correttamente tra corone ed euro.' },
      hu: { title: 'A költségvetés a helyes pénznemben jelenik meg', description: 'A rendelési összegek és végösszegek helyesen váltódnak korona és euró között.' },
      sv: { title: 'Budget visar nu belopp i rätt valuta', description: 'Orderbelopp och totaler räknas om korrekt mellan kronor och euro.' },
      fr: { title: 'Le budget affiche les montants dans la bonne devise', description: 'Les montants et totaux sont correctement convertis entre couronnes et euros.' },
      pl: { title: 'Budżet pokazuje kwoty we właściwej walucie', description: 'Kwoty zamówień i sumy są poprawnie przeliczane między koronami i euro.' },
      cs: { title: 'Rozpočet nyní zobrazuje částky ve správné měně', description: 'Částky objednávek a součty se správně převádějí mezi korunami a eury.' },
    },
  },
];

function sourceText(source: SiteFeatureSource): string {
  return `${source.title_internal || ''}\n${source.description_internal || ''}\n${source.technical_description || ''}`;
}

export function resolveUserFacingSiteFeature(source: SiteFeatureSource, language: SiteFeatureLanguage) {
  const rule = RULES.find((candidate) => candidate.pattern.test(sourceText(source)));
  return rule ? { id: rule.id, ...rule.copy[language] } : null;
}

export function siteFeatureTopicKey(source: SiteFeatureSource): string | null {
  const rule = RULES.find((candidate) => candidate.pattern.test(sourceText(source)));
  return rule?.id || null;
}

export function isPureTechnicalSiteChange(source: SiteFeatureSource): boolean {
  if (siteFeatureTopicKey(source)) return false;
  const title = source.title_internal?.trim() || '';
  const text = sourceText(source);
  return /^(?:chore|refactor|test|docs|build|ci)(?:\([^)]+\))?:/i.test(title)
    || /\b(?:test[- ]only|tests? only|migration cleanup|dependency update|code cleanup|internal resolver)\b/i.test(text);
}
