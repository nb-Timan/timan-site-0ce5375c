import type { PortalUiLanguage } from '@/lib/portalLanguages';

export interface SupportIngestionCopy {
  heading: string; description: string; associations: string; machines: string; products: string;
  productSearch: string; saveAssociations: string; associationsSaved: string; sourceFile: string;
  uploadAndProcess: string; sourceLanguage: string; sources: string; noSources: string;
  revision: string; uploaded: string; pages: string; characters: string; chunks: string; indexState: string;
  extractionPreview: string; sections: string; noPreview: string; reprocess: string; rechunk: string;
  download: string; processingStarted: string; loading: string; error: string; previousRuns: string;
  currentSource: string; equivalentContent: string; selectFile: string; duplicateSource: string;
  indexApproved: string; indexingStarted: string;
  currentVersion: string; reviewed: string; effectiveFrom: string; embeddingModel: string; supersedes: string;
  submitReview: string; approveRevision: string; reindex: string; reembed: string; lifecycleSaved: string;
  compareVersions: string; lifecycleAudit: string; noAuditEvents: string;
}

const en: SupportIngestionCopy = {
  heading: 'Sources and processing', description: 'Private source revisions, extraction preview and traceable chunks.',
  associations: 'Associations', machines: 'Machines', products: 'Products', productSearch: 'Search item number or product',
  saveAssociations: 'Save associations', associationsSaved: 'Associations saved.', sourceFile: 'PDF or text source',
  uploadAndProcess: 'Upload and process', sourceLanguage: 'Source language', sources: 'Source revisions', noSources: 'No sources uploaded yet.',
  revision: 'Revision', uploaded: 'Uploaded', pages: 'Pages', characters: 'Characters', chunks: 'Chunks', indexState: 'Index state',
  extractionPreview: 'Extraction preview', sections: 'Detected sections', noPreview: 'No extracted text is available yet.',
  reprocess: 'Reprocess', rechunk: 'Re-chunk', download: 'Download source', processingStarted: 'Processing started.',
  loading: 'Loading...', error: 'The source operation failed.', previousRuns: 'Processing attempts', currentSource: 'Current source',
  equivalentContent: 'Content-equivalent to an earlier revision', selectFile: 'Select a PDF or TXT file.', duplicateSource: 'This source is already uploaded.',
  indexApproved: 'Index approved source', indexingStarted: 'Knowledge indexing completed.',
  currentVersion: 'Current version', reviewed: 'Last reviewed', effectiveFrom: 'Effective from', embeddingModel: 'Embedding model', supersedes: 'Supersedes',
  submitReview: 'Submit for review', approveRevision: 'Approve revision', reindex: 'Re-index', reembed: 'Re-embed', lifecycleSaved: 'Revision lifecycle saved.',
  compareVersions: 'Compare revisions', lifecycleAudit: 'Lifecycle audit', noAuditEvents: 'No lifecycle events yet.',
};

const da: SupportIngestionCopy = {
  heading: 'Kilder og behandling', description: 'Private kilderevisioner, udtrækseksempel og sporbare tekstdele.',
  associations: 'Relationer', machines: 'Maskiner', products: 'Produkter', productSearch: 'Søg varenummer eller produkt',
  saveAssociations: 'Gem relationer', associationsSaved: 'Relationer gemt.', sourceFile: 'PDF- eller tekstkilde',
  uploadAndProcess: 'Upload og behandl', sourceLanguage: 'Kildesprog', sources: 'Kilderevisioner', noSources: 'Der er endnu ikke uploadet kilder.',
  revision: 'Revision', uploaded: 'Uploadet', pages: 'Sider', characters: 'Tegn', chunks: 'Tekstdele', indexState: 'Indeksstatus',
  extractionPreview: 'Eksempel på udtrukket tekst', sections: 'Fundne afsnit', noPreview: 'Der er endnu ingen udtrukket tekst.',
  reprocess: 'Behandl igen', rechunk: 'Opdel igen', download: 'Hent kilde', processingStarted: 'Behandling startet.',
  loading: 'Indlæser...', error: 'Kildehandlingen mislykkedes.', previousRuns: 'Behandlingsforsøg', currentSource: 'Aktuel kilde',
  equivalentContent: 'Indholdet svarer til en tidligere revision', selectFile: 'Vælg en PDF- eller TXT-fil.', duplicateSource: 'Denne kilde er allerede uploadet.',
  indexApproved: 'Indeksér godkendt kilde', indexingStarted: 'Indeksering af viden er gennemført.',
  currentVersion: 'Aktuel version', reviewed: 'Senest gennemgået', effectiveFrom: 'Gyldig fra', embeddingModel: 'Embedding-model', supersedes: 'Erstatter',
  submitReview: 'Send til gennemgang', approveRevision: 'Godkend revision', reindex: 'Indeksér igen', reembed: 'Opret embeddings igen', lifecycleSaved: 'Revisionens status er gemt.',
  compareVersions: 'Sammenlign revisioner', lifecycleAudit: 'Livscyklus-audit', noAuditEvents: 'Ingen livscyklushændelser endnu.',
};

const de: SupportIngestionCopy = {
  heading: 'Quellen und Verarbeitung', description: 'Private Quellenrevisionen, Extraktionsvorschau und nachvollziehbare Textabschnitte.',
  associations: 'Zuordnungen', machines: 'Maschinen', products: 'Produkte', productSearch: 'Artikelnummer oder Produkt suchen',
  saveAssociations: 'Zuordnungen speichern', associationsSaved: 'Zuordnungen gespeichert.', sourceFile: 'PDF- oder Textquelle',
  uploadAndProcess: 'Hochladen und verarbeiten', sourceLanguage: 'Quellsprache', sources: 'Quellenrevisionen', noSources: 'Noch keine Quellen hochgeladen.',
  revision: 'Revision', uploaded: 'Hochgeladen', pages: 'Seiten', characters: 'Zeichen', chunks: 'Textabschnitte', indexState: 'Indexstatus',
  extractionPreview: 'Extraktionsvorschau', sections: 'Erkannte Abschnitte', noPreview: 'Noch kein extrahierter Text verfügbar.',
  reprocess: 'Erneut verarbeiten', rechunk: 'Neu aufteilen', download: 'Quelle herunterladen', processingStarted: 'Verarbeitung gestartet.',
  loading: 'Wird geladen...', error: 'Die Quellenaktion ist fehlgeschlagen.', previousRuns: 'Verarbeitungsversuche', currentSource: 'Aktuelle Quelle',
  equivalentContent: 'Inhalt entspricht einer früheren Revision', selectFile: 'PDF- oder TXT-Datei auswählen.', duplicateSource: 'Diese Quelle wurde bereits hochgeladen.',
  indexApproved: 'Freigegebene Quelle indexieren', indexingStarted: 'Wissensindexierung abgeschlossen.',
  currentVersion: 'Aktuelle Version', reviewed: 'Zuletzt geprüft', effectiveFrom: 'Gültig ab', embeddingModel: 'Embedding-Modell', supersedes: 'Ersetzt',
  submitReview: 'Zur Prüfung einreichen', approveRevision: 'Revision freigeben', reindex: 'Neu indexieren', reembed: 'Neu einbetten', lifecycleSaved: 'Revisionsstatus gespeichert.',
  compareVersions: 'Revisionen vergleichen', lifecycleAudit: 'Lebenszyklus-Audit', noAuditEvents: 'Noch keine Lebenszyklusereignisse.',
};

const partials: Record<Exclude<PortalUiLanguage, 'da' | 'en' | 'de'>, Partial<SupportIngestionCopy>> = {
  it: { heading: 'Fonti ed elaborazione', associations: 'Associazioni', machines: 'Macchine', products: 'Prodotti', sourceFile: 'Fonte PDF o testo', uploadAndProcess: 'Carica ed elabora', sourceLanguage: 'Lingua della fonte', sources: 'Revisioni della fonte', noSources: 'Nessuna fonte caricata.', extractionPreview: 'Anteprima estrazione', reprocess: 'Rielabora', rechunk: 'Suddividi di nuovo', download: 'Scarica fonte', indexState: 'Stato indice', currentVersion: 'Versione corrente', reviewed: 'Ultima revisione', effectiveFrom: 'Valida dal', embeddingModel: 'Modello embedding', supersedes: 'Sostituisce', submitReview: 'Invia in revisione', approveRevision: 'Approva revisione', reindex: 'Reindicizza', reembed: 'Rigenera embedding', lifecycleSaved: 'Stato revisione salvato.', compareVersions: 'Confronta revisioni', lifecycleAudit: 'Audit del ciclo di vita', noAuditEvents: 'Nessun evento del ciclo di vita.' },
  hu: { heading: 'Források és feldolgozás', associations: 'Kapcsolatok', machines: 'Gépek', products: 'Termékek', sourceFile: 'PDF- vagy szövegforrás', uploadAndProcess: 'Feltöltés és feldolgozás', sourceLanguage: 'Forrás nyelve', sources: 'Forrásverziók', noSources: 'Még nincs feltöltött forrás.', extractionPreview: 'Kinyert szöveg előnézete', reprocess: 'Újrafeldolgozás', rechunk: 'Újrafelosztás', download: 'Forrás letöltése', indexState: 'Indexállapot', currentVersion: 'Aktuális verzió', reviewed: 'Utolsó ellenőrzés', effectiveFrom: 'Érvényes ettől', embeddingModel: 'Embedding modell', supersedes: 'Ezt váltja', submitReview: 'Ellenőrzésre küldés', approveRevision: 'Verzió jóváhagyása', reindex: 'Újraindexelés', reembed: 'Új embedding', lifecycleSaved: 'Verzióállapot mentve.', compareVersions: 'Verziók összehasonlítása', lifecycleAudit: 'Életciklus-audit', noAuditEvents: 'Még nincs életciklus-esemény.' },
  sv: { heading: 'Källor och bearbetning', associations: 'Kopplingar', machines: 'Maskiner', products: 'Produkter', sourceFile: 'PDF- eller textkälla', uploadAndProcess: 'Ladda upp och bearbeta', sourceLanguage: 'Källspråk', sources: 'Källrevisioner', noSources: 'Inga källor har laddats upp.', extractionPreview: 'Förhandsvisning av extraherad text', reprocess: 'Bearbeta igen', rechunk: 'Dela upp igen', download: 'Hämta källa', indexState: 'Indexstatus', currentVersion: 'Aktuell version', reviewed: 'Senast granskad', effectiveFrom: 'Gäller från', embeddingModel: 'Embeddingmodell', supersedes: 'Ersätter', submitReview: 'Skicka till granskning', approveRevision: 'Godkänn revision', reindex: 'Indexera om', reembed: 'Skapa embeddings igen', lifecycleSaved: 'Revisionsstatus sparad.', compareVersions: 'Jämför revisioner', lifecycleAudit: 'Livscykelgranskning', noAuditEvents: 'Inga livscykelhändelser ännu.' },
  fr: { heading: 'Sources et traitement', associations: 'Associations', machines: 'Machines', products: 'Produits', sourceFile: 'Source PDF ou texte', uploadAndProcess: 'Téléverser et traiter', sourceLanguage: 'Langue source', sources: 'Révisions de source', noSources: 'Aucune source téléversée.', extractionPreview: "Aperçu de l'extraction", reprocess: 'Retraiter', rechunk: 'Redécouper', download: 'Télécharger la source', indexState: "État de l'index", currentVersion: 'Version actuelle', reviewed: 'Dernière révision', effectiveFrom: 'Valable à partir du', embeddingModel: "Modèle d'embedding", supersedes: 'Remplace', submitReview: 'Soumettre à révision', approveRevision: 'Approuver la révision', reindex: 'Réindexer', reembed: 'Recréer les embeddings', lifecycleSaved: 'État de révision enregistré.', compareVersions: 'Comparer les révisions', lifecycleAudit: 'Audit du cycle de vie', noAuditEvents: 'Aucun événement de cycle de vie.' },
  pl: { heading: 'Źródła i przetwarzanie', associations: 'Powiązania', machines: 'Maszyny', products: 'Produkty', sourceFile: 'Źródło PDF lub tekstowe', uploadAndProcess: 'Prześlij i przetwórz', sourceLanguage: 'Język źródła', sources: 'Wersje źródła', noSources: 'Nie przesłano jeszcze źródeł.', extractionPreview: 'Podgląd wyodrębnionego tekstu', reprocess: 'Przetwórz ponownie', rechunk: 'Podziel ponownie', download: 'Pobierz źródło', indexState: 'Stan indeksu', currentVersion: 'Aktualna wersja', reviewed: 'Ostatni przegląd', effectiveFrom: 'Obowiązuje od', embeddingModel: 'Model embeddingu', supersedes: 'Zastępuje', submitReview: 'Prześlij do przeglądu', approveRevision: 'Zatwierdź wersję', reindex: 'Indeksuj ponownie', reembed: 'Utwórz embeddingi ponownie', lifecycleSaved: 'Stan wersji zapisany.', compareVersions: 'Porównaj wersje', lifecycleAudit: 'Audyt cyklu życia', noAuditEvents: 'Brak zdarzeń cyklu życia.' },
  cs: { heading: 'Zdroje a zpracování', associations: 'Vazby', machines: 'Stroje', products: 'Produkty', sourceFile: 'Zdroj PDF nebo text', uploadAndProcess: 'Nahrát a zpracovat', sourceLanguage: 'Jazyk zdroje', sources: 'Revize zdroje', noSources: 'Zatím nebyly nahrány žádné zdroje.', extractionPreview: 'Náhled extrahovaného textu', reprocess: 'Zpracovat znovu', rechunk: 'Znovu rozdělit', download: 'Stáhnout zdroj', indexState: 'Stav indexu', currentVersion: 'Aktuální verze', reviewed: 'Poslední kontrola', effectiveFrom: 'Platí od', embeddingModel: 'Embeddingový model', supersedes: 'Nahrazuje', submitReview: 'Odeslat ke kontrole', approveRevision: 'Schválit revizi', reindex: 'Přeindexovat', reembed: 'Znovu vytvořit embeddingy', lifecycleSaved: 'Stav revize uložen.', compareVersions: 'Porovnat revize', lifecycleAudit: 'Audit životního cyklu', noAuditEvents: 'Zatím žádné události životního cyklu.' },
};

export const SUPPORT_INGESTION_TRANSLATIONS: Record<PortalUiLanguage, SupportIngestionCopy> = {
  da, en, de,
  it: { ...en, ...partials.it }, hu: { ...en, ...partials.hu }, sv: { ...en, ...partials.sv },
  fr: { ...en, ...partials.fr }, pl: { ...en, ...partials.pl }, cs: { ...en, ...partials.cs },
};

export function getSupportIngestionCopy(language: PortalUiLanguage): SupportIngestionCopy {
  return SUPPORT_INGESTION_TRANSLATIONS[language] || en;
}

const statusLabels: Partial<Record<PortalUiLanguage, Record<string, string>>> = {
  da: { RECEIVED: 'Modtaget', QUEUED: 'I kø', PROCESSING: 'Behandles', READY_FOR_REVIEW: 'Klar til gennemgang', FAILED: 'Fejlet', CANCELLED: 'Annulleret', DRAFT: 'Kladde', REVIEW: 'Gennemgang', APPROVED: 'Godkendt', ARCHIVED: 'Arkiveret', SUPERSEDED: 'Erstattet', NOT_INDEXED: 'Ikke indekseret', INDEXING: 'Indekseres', INDEXED: 'Indekseret', STALE: 'Forældet', CONTENT_STALE: 'Indhold forældet', INDEX_STALE: 'Indeks forældet', EMBEDDING_STALE: 'Embedding forældet', REVIEW_OVERDUE: 'Gennemgang forfalden' },
  en: { RECEIVED: 'Received', QUEUED: 'Queued', PROCESSING: 'Processing', READY_FOR_REVIEW: 'Ready for review', FAILED: 'Failed', CANCELLED: 'Cancelled', DRAFT: 'Draft', REVIEW: 'Review', APPROVED: 'Approved', ARCHIVED: 'Archived', SUPERSEDED: 'Superseded', NOT_INDEXED: 'Not indexed', INDEXING: 'Indexing', INDEXED: 'Indexed', STALE: 'Stale', CONTENT_STALE: 'Content stale', INDEX_STALE: 'Index stale', EMBEDDING_STALE: 'Embedding stale', REVIEW_OVERDUE: 'Review overdue' },
  de: { RECEIVED: 'Empfangen', QUEUED: 'In Warteschlange', PROCESSING: 'Wird verarbeitet', READY_FOR_REVIEW: 'Bereit zur Prüfung', FAILED: 'Fehlgeschlagen', CANCELLED: 'Abgebrochen', DRAFT: 'Entwurf', REVIEW: 'Prüfung', APPROVED: 'Freigegeben', ARCHIVED: 'Archiviert', SUPERSEDED: 'Ersetzt', NOT_INDEXED: 'Nicht indexiert', INDEXING: 'Wird indexiert', INDEXED: 'Indexiert', STALE: 'Veraltet', CONTENT_STALE: 'Inhalt veraltet', INDEX_STALE: 'Index veraltet', EMBEDDING_STALE: 'Embedding veraltet', REVIEW_OVERDUE: 'Prüfung überfällig' },
  it: { DRAFT: 'Bozza', REVIEW: 'Revisione', APPROVED: 'Approvata', ARCHIVED: 'Archiviata', SUPERSEDED: 'Sostituita', INDEXED: 'Indicizzata', CONTENT_STALE: 'Contenuto obsoleto', INDEX_STALE: 'Indice obsoleto', EMBEDDING_STALE: 'Embedding obsoleto', REVIEW_OVERDUE: 'Revisione scaduta' },
  hu: { DRAFT: 'Vázlat', REVIEW: 'Ellenőrzés', APPROVED: 'Jóváhagyott', ARCHIVED: 'Archivált', SUPERSEDED: 'Felülírt', INDEXED: 'Indexelt', CONTENT_STALE: 'Elavult tartalom', INDEX_STALE: 'Elavult index', EMBEDDING_STALE: 'Elavult embedding', REVIEW_OVERDUE: 'Lejárt ellenőrzés' },
  sv: { DRAFT: 'Utkast', REVIEW: 'Granskning', APPROVED: 'Godkänd', ARCHIVED: 'Arkiverad', SUPERSEDED: 'Ersatt', INDEXED: 'Indexerad', CONTENT_STALE: 'Innehåll inaktuellt', INDEX_STALE: 'Index inaktuellt', EMBEDDING_STALE: 'Embedding inaktuell', REVIEW_OVERDUE: 'Granskning försenad' },
  fr: { DRAFT: 'Brouillon', REVIEW: 'Révision', APPROVED: 'Approuvée', ARCHIVED: 'Archivée', SUPERSEDED: 'Remplacée', INDEXED: 'Indexée', CONTENT_STALE: 'Contenu obsolète', INDEX_STALE: 'Index obsolète', EMBEDDING_STALE: 'Embedding obsolète', REVIEW_OVERDUE: 'Révision en retard' },
  pl: { DRAFT: 'Szkic', REVIEW: 'Przegląd', APPROVED: 'Zatwierdzona', ARCHIVED: 'Zarchiwizowana', SUPERSEDED: 'Zastąpiona', INDEXED: 'Zindeksowana', CONTENT_STALE: 'Nieaktualna treść', INDEX_STALE: 'Nieaktualny indeks', EMBEDDING_STALE: 'Nieaktualny embedding', REVIEW_OVERDUE: 'Zaległy przegląd' },
  cs: { DRAFT: 'Koncept', REVIEW: 'Kontrola', APPROVED: 'Schválena', ARCHIVED: 'Archivována', SUPERSEDED: 'Nahrazena', INDEXED: 'Indexována', CONTENT_STALE: 'Zastaralý obsah', INDEX_STALE: 'Zastaralý index', EMBEDDING_STALE: 'Zastaralý embedding', REVIEW_OVERDUE: 'Kontrola po termínu' },
};

export function supportIngestionStatusLabel(language: PortalUiLanguage, value: string): string {
  return statusLabels[language]?.[value] || value.toLowerCase().replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
}
