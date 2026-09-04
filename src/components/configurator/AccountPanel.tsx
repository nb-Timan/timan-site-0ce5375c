import { useState, useEffect, useCallback, useMemo } from 'react';
import { AppUser } from '@/data/appUsers';
import { Language, ConfiguratorState, PartnerType } from '@/types/configurator';
import { pickT } from '@/lib/i18n/translations';
import { mapUiLanguageToLegacy, type PortalUiLanguage } from '@/lib/portalLanguages';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  SavedConfiguration,
  loadConfigurationById,
  loadConfigurations,
  saveConfiguration,
  updateConfigurationStatus,
  updateConfigurationNote,
  SavedStatus,
  getSentPdfSignedUrl,
  isSavedConfigurationOrderLocked,
} from '@/lib/configurationsService';
import { hideConfigurationForScope } from '@/lib/userHiddenConfigurationsService';
import { resolveHideScopeForCurrentUser } from '@/lib/configurationsService';
import { calcConfigurationTotals, formatMoney } from '@/lib/calcConfiguration';
import {
  AccountCaseStatusFilter,
  buildAccountCaseLines,
  buildAccountCaseSummary,
  buildReorderDraft,
  filterAccountCases,
} from '@/lib/configuratorAccountSummaries';
import {
  buildConfiguratorOwnership,
  isExternalDealerRole,
  externalDealerHasLink,
  ConfiguratorOwnership,
} from '@/lib/configuratorOwnership';
import { derivePortalRole } from '@/lib/portalAccess';
import { useAppUser } from '@/context/AppUserContext';
import { toast } from 'sonner';

// Re-export for external use
export type { SavedStatus } from '@/lib/configurationsService';
export { markAsOrderSubmitted, markPdfDownloaded } from '@/lib/configurationsService';

interface Props {
  appUser: AppUser & { email: string };
  /** Portal UI language (9-locale). Falls back to legacy 5 for raw-data helpers. */
  language: PortalUiLanguage | Language | string;
  currentState: ConfiguratorState;
  onLogout: () => void;
  onRestoreState: (state: ConfiguratorState, configId: string | null, ownership?: {
    seller_initials: string | null;
    seller_email: string | null;
    seller_name: string | null;
    assigned_seller_id: string | null;
    dealer_number: string | null;
    dealer_name: string | null;
    dealer_account_id: string | null;
  }, options?: { asNewDraft?: boolean }) => void;
  onSavedConfiguration: (configId: string, quoteNumber?: string | null, orderNumber?: string | null) => void;
  /** Optional pre-built ownership payload (from the in-configurator picker). */
  ownershipOverride?: () => Promise<ConfiguratorOwnership>;
}

function getRoleBadge(role: string, lang: string) {
  const map: Record<string, Record<string, string>> = {
    slutkunde:     { da: 'Default bruger', en: 'Default user',   de: 'Standardbenutzer', it: 'Utente predefinito', hu: 'Alapértelmezett felhasználó', sv: 'Standardanvändare', fr: 'Utilisateur par défaut', pl: 'Użytkownik domyślny', cs: 'Výchozí uživatel' },
    partner:       { da: 'Partner',         en: 'Partner',        de: 'Partner',          it: 'Partner',             hu: 'Partner',                    sv: 'Partner',           fr: 'Partenaire',             pl: 'Partner',             cs: 'Partner' },
    timan_saelger: { da: 'Timan Sælger',    en: 'Timan Sales',    de: 'Timan Verkauf',    it: 'Timan Vendite',       hu: 'Timan Értékesítő',           sv: 'Timan Sälj',        fr: 'Vente Timan',            pl: 'Sprzedaż Timan',      cs: 'Prodej Timan' },
  };
  return pickT(map[role], lang) || role;
}

function getSubRoleLabel(subRole: PartnerType | null | undefined, lang: string): string | null {
  if (!subRole) return null;
  const map: Record<PartnerType, Record<string, string>> = {
    service_partner: { da: 'Service partner', en: 'Service Partner', de: 'Servicepartner', it: 'Partner di servizio', hu: 'Szervizpartner', sv: 'Servicepartner', fr: 'Partenaire de service', pl: 'Partner serwisowy', cs: 'Servisní partner' },
    forhandler:      { da: 'Forhandler',      en: 'Dealer',          de: 'Händler',        it: 'Rivenditore',         hu: 'Kereskedő',      sv: 'Återförsäljare', fr: 'Revendeur',             pl: 'Dealer',            cs: 'Prodejce' },
    importoer:       { da: 'Importør',        en: 'Importer',        de: 'Importeur',      it: 'Importatore',         hu: 'Importőr',       sv: 'Importör',       fr: 'Importateur',           pl: 'Importer',          cs: 'Dovozce' },
  };
  return pickT(map[subRole], lang) || subRole;
}

function roleBadgeColor(role: string) {
  if (role === 'timan_saelger') return 'bg-blue-100 text-blue-800';
  if (role === 'partner') return 'bg-emerald-100 text-emerald-800';
  return 'bg-gray-100 text-gray-700';
}

function statusLabel(status: SavedStatus, lang: string): string {
  const labels: Record<SavedStatus, Record<string, string>> = {
    aktiv:         { da: 'Aktiv',          en: 'Active',           de: 'Aktiv',                  it: 'Attivo',           hu: 'Aktív',          sv: 'Aktiv',             fr: 'Actif',             pl: 'Aktywne',           cs: 'Aktivní' },
    pause:         { da: 'Pause',          en: 'Paused',           de: 'Pausiert',               it: 'In pausa',         hu: 'Szünetel',       sv: 'Pausad',            fr: 'En pause',          pl: 'Wstrzymane',        cs: 'Pozastaveno' },
    ordre_afgivet: { da: 'Ordre afgivet',  en: 'Order submitted',  de: 'Bestellung aufgegeben',  it: 'Ordine inviato',   hu: 'Rendelés leadva',sv: 'Order skickad',     fr: 'Commande envoyée',  pl: 'Zamówienie złożone',cs: 'Objednávka odeslána' },
    deleted:       { da: 'Slettet',        en: 'Deleted',          de: 'Gelöscht',               it: 'Eliminato',        hu: 'Törölve',        sv: 'Borttagen',         fr: 'Supprimé',          pl: 'Usunięte',          cs: 'Smazáno' },
  };
  return pickT(labels[status], lang) || status;
}

function statusColor(status: SavedStatus): string {
  if (status === 'aktiv') return 'bg-emerald-100 text-emerald-700';
  if (status === 'pause') return 'bg-amber-100 text-amber-700';
  return 'bg-blue-100 text-blue-700';
}

function effectiveCaseStatus(item: SavedConfiguration): SavedStatus {
  return isSavedConfigurationOrderLocked(item) ? 'ordre_afgivet' : item.case_status;
}

export default function AccountPanel({ appUser, language, currentState, onLogout, onRestoreState, onSavedConfiguration, ownershipOverride }: Props) {
  const { appUser: sessionUser } = useAppUser();
  const [open, setOpen] = useState(false);
  const [savedItems, setSavedItems] = useState<SavedConfiguration[]>([]);
  const [saveLabel, setSaveLabel] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmHideId, setConfirmHideId] = useState<string | null>(null);
  const [hiding, setHiding] = useState(false);
  const [statusFilter, setStatusFilter] = useState<AccountCaseStatusFilter>('all');
  const [search, setSearch] = useState('');
  const [detailItem, setDetailItem] = useState<SavedConfiguration | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const canSave = currentState.step === 4
    && currentState.firmanavn.trim() !== ''
    && currentState.kontaktperson.trim() !== ''
    && currentState.email.trim() !== '';

  const userEmail = appUser.email.toLowerCase();

  const refreshItems = useCallback(async () => {
    const items = await loadConfigurations(userEmail);
    setSavedItems(items);
  }, [userEmail]);

  useEffect(() => {
    if (open) refreshItems();
  }, [open, refreshItems]);

  const handleSave = async () => {
    if (!saveLabel.trim() || saving) return;

    setSaving(true);

    try {
      // Phase 23 — block external dealer users without a linked dealer.
      const portalRole = derivePortalRole(sessionUser);
      if (sessionUser && isExternalDealerRole(portalRole) && !externalDealerHasLink(sessionUser)) {
        toast.error(tx('saveFailed'), {
          description: tx('noDealerLinked'),
        });
        return;
      }

      const ownership = ownershipOverride ? await ownershipOverride() : await buildConfiguratorOwnership(sessionUser);
      const result = await saveConfiguration(
        currentState,
        saveLabel.trim(),
        userEmail,
        { ownership },
      );

      if (result.error) {
        console.error('handleSave failed:', result.error);
        toast.error(tx('saveFailed'), {
          description: result.error,
        });
        return;
      }

      await refreshItems();

      if (result.id) {
        onSavedConfiguration(result.id, result.quote_number, result.order_number);
      }

      if (result.itemsError) {
        toast.error(tx('savedButLinesFailed'), {
          description: `${tx('caseId')}: ${result.id} — ${result.itemsError}`,
        });
      } else {
        toast.success(tx('caseSaved'), {
          description: `${tx('caseId')}: ${result.id}`,
        });
      }

      setSaveLabel('');
      setShowSaveInput(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Unexpected save error:', error);
      toast.error(tx('saveFailed'), {
        description: message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmHide = async () => {
    if (!confirmHideId || hiding) return;
    setHiding(true);
    try {
      const scope = await resolveHideScopeForCurrentUser(userEmail);
      const { error } = await hideConfigurationForScope(confirmHideId, scope);
      if (error) {
        toast.error(tx('hideFailed'), { description: error });
        return;
      }
      setSavedItems(prev => prev.filter(i => i.id !== confirmHideId));
      toast.success(tx('hideSuccess'));
      setConfirmHideId(null);
    } finally {
      setHiding(false);
    }
  };

  const handleToggleStatus = async (id: string) => {
    const item = savedItems.find(i => i.id === id);
    if (!item || isSavedConfigurationOrderLocked(item)) return;
    const newStatus: SavedStatus = item.case_status === 'aktiv' ? 'pause' : 'aktiv';
    await updateConfigurationStatus(id, newStatus);
    setSavedItems(prev => prev.map(i => i.id === id ? { ...i, case_status: newStatus } : i));
  };

  const handleOpen = async (item: SavedConfiguration) => {
    const saved = await loadConfigurationById(item.id, userEmail);

    if (!saved) {
      toast.error(tx('openFailed'));
      return;
    }

    if (!saved.has_full_state) {
      toast.error(tx('missingState'));
      return;
    }

    onRestoreState(saved.state_json, saved.id, {
      seller_initials: saved.seller_initials,
      seller_email: saved.seller_email,
      seller_name: saved.seller_name,
      assigned_seller_id: saved.assigned_seller_id,
      dealer_number: saved.dealer_number,
      dealer_name: saved.dealer_name,
      dealer_account_id: saved.dealer_account_id,
    });
    setOpen(false);
  };

  const handleShowDetails = async (item: SavedConfiguration) => {
    setDetailLoading(true);
    try {
      const saved = await loadConfigurationById(item.id, userEmail);
      if (!saved) {
        toast.error(tx('openFailed'));
        return;
      }
      setDetailItem(saved);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleReorder = async (item: SavedConfiguration) => {
    const saved = await loadConfigurationById(item.id, userEmail);

    if (!saved) {
      toast.error(tx('openFailed'));
      return;
    }

    if (!saved.has_full_state) {
      toast.error(tx('missingState'));
      return;
    }

    onRestoreState(buildReorderDraft(saved.state_json), null, {
      seller_initials: saved.seller_initials,
      seller_email: saved.seller_email,
      seller_name: saved.seller_name,
      assigned_seller_id: saved.assigned_seller_id,
      dealer_number: saved.dealer_number,
      dealer_name: saved.dealer_name,
      dealer_account_id: saved.dealer_account_id,
    }, { asNewDraft: true });
    setDetailItem(null);
    setOpen(false);
    toast.success(tx('reorderStarted'), { description: tx('reorderStartedDescription') });
  };

  const handleNoteChange = async (id: string, text: string) => {
    setSavedItems(prev => prev.map(i => i.id === id ? { ...i, internal_note: text } : i));
    await updateConfigurationNote(id, text);
  };

  const handleOpenPdf = async (item: SavedConfiguration) => {
    // Sent orders/quotes: open the actual stored sent PDF (view-only, no resend).
    if (item.sent_pdf_path) {
      const { url, error } = await getSentPdfSignedUrl(item.sent_pdf_path, 120);
      if (error || !url) {
        toast.error(tx('pdfOpenFailed'), { description: error ?? undefined });
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    // Sent order without a stored PDF (legacy row from before storage): can't view.
    if (isSavedConfigurationOrderLocked(item)) {
      toast.error(tx('pdfNotStored'));
      return;
    }
    // Non-sent cases: behave like "Åbn" so the user can review/regenerate from the configurator.
    await handleOpen(item);
  };

  const stats = useMemo(() => {
    const totals = {
      active: { count: 0, value: 0 },
      closed: { count: 0, value: 0 },
      paused: { count: 0, value: 0 },
    };
    savedItems.forEach(item => {
      if (!item.state_json) return;
      const { finalPrice } = calcConfigurationTotals(item.state_json);
      const status = effectiveCaseStatus(item);
      if (status === 'aktiv') {
        totals.active.count += 1;
        totals.active.value += finalPrice;
      } else if (status === 'ordre_afgivet') {
        totals.closed.count += 1;
        totals.closed.value += finalPrice;
      } else if (status === 'pause') {
        totals.paused.count += 1;
        totals.paused.value += finalPrice;
      }
    });
    return totals;
  }, [savedItems]);

  const filteredItems = useMemo(
    () => filterAccountCases(savedItems, statusFilter, search),
    [savedItems, search, statusFilter],
  );

  const detailSummary = useMemo(
    () => detailItem ? buildAccountCaseSummary(detailItem, language) : null,
    [detailItem, language],
  );

  const detailLines = useMemo(
    () => detailItem ? buildAccountCaseLines(detailItem.state_json, language) : [],
    [detailItem, language],
  );

  const detailTotals = useMemo(
    () => detailItem ? calcConfigurationTotals(detailItem.state_json) : null,
    [detailItem],
  );

  const tx = useMemo(() => {
    const strings: Record<string, Record<string, string>> = {
      myAccount:           { da: 'Min konto',                                en: 'My account',                          de: 'Mein Konto',                          it: 'Il mio account',                                  hu: 'Fiókom',                                        sv: 'Mitt konto',                                  fr: 'Mon compte',                                pl: 'Moje konto',                                cs: 'Můj účet' },
      name:                { da: 'Navn',                                    en: 'Name',                                de: 'Name',                                it: 'Nome',                                            hu: 'Név',                                           sv: 'Namn',                                        fr: 'Nom',                                       pl: 'Imię',                                      cs: 'Jméno' },
      role:                { da: 'Rolle',                                   en: 'Role',                                de: 'Rolle',                               it: 'Ruolo',                                           hu: 'Szerepkör',                                     sv: 'Roll',                                        fr: 'Rôle',                                      pl: 'Rola',                                      cs: 'Role' },
      partnerType:         { da: 'Partnertype',                             en: 'Partner type',                        de: 'Partnertyp',                          it: 'Tipo di partner',                                 hu: 'Partnertípus',                                  sv: 'Partnertyp',                                  fr: 'Type de partenaire',                        pl: 'Typ partnera',                              cs: 'Typ partnera' },
      savedCases:          { da: 'Gemte sager',                             en: 'Saved cases',                         de: 'Gespeicherte Fälle',                  it: 'Casi salvati',                                    hu: 'Mentett ügyek',                                 sv: 'Sparade ärenden',                             fr: 'Dossiers enregistrés',                      pl: 'Zapisane sprawy',                           cs: 'Uložené případy' },
      saveCurrent:         { da: '+ Gem nuværende',                         en: '+ Save current',                      de: '+ Aktuelle speichern',                it: '+ Salva corrente',                                hu: '+ Jelenlegi mentése',                           sv: '+ Spara nuvarande',                           fr: '+ Enregistrer en cours',                    pl: '+ Zapisz bieżące',                          cs: '+ Uložit aktuální' },
      saveHint:            { da: 'Udfyld firma, kontaktperson og email i trin 4 for at gemme', en: 'Fill in company, contact and email in step 4 to save', de: 'Firma, Kontakt und E-Mail in Schritt 4 ausfüllen zum Speichern', it: 'Compila azienda, contatto ed email al passo 4 per salvare', hu: 'Töltsd ki a cégnevet, kapcsolattartót és e-mailt a 4. lépésben a mentéshez', sv: 'Fyll i företag, kontakt och e-post i steg 4 för att spara', fr: 'Renseignez société, contact et e-mail à l’étape 4 pour enregistrer', pl: 'Wypełnij firmę, kontakt i e-mail w kroku 4, aby zapisać', cs: 'Vyplňte firmu, kontakt a e-mail v kroku 4 pro uložení' },
      nameCase:            { da: 'Navngiv sag...',                          en: 'Name case...',                        de: 'Fall benennen...',                    it: 'Nomina caso...',                                  hu: 'Ügy elnevezése...',                             sv: 'Namnge ärende...',                            fr: 'Nommer le dossier...',                      pl: 'Nazwij sprawę...',                          cs: 'Pojmenovat případ...' },
      save:                { da: 'Gem',                                     en: 'Save',                                de: 'Speichern',                           it: 'Salva',                                           hu: 'Mentés',                                        sv: 'Spara',                                       fr: 'Enregistrer',                               pl: 'Zapisz',                                    cs: 'Uložit' },
      noCases:             { da: 'Ingen gemte sager',                       en: 'No saved cases',                      de: 'Keine gespeicherten Fälle',           it: 'Nessun caso salvato',                             hu: 'Nincsenek mentett ügyek',                       sv: 'Inga sparade ärenden',                        fr: 'Aucun dossier enregistré',                  pl: 'Brak zapisanych spraw',                     cs: 'Žádné uložené případy' },
      myOrders:            { da: 'Mine ordrer',                             en: 'My orders',                           de: 'Meine Bestellungen',                  it: 'I miei ordini',                                  hu: 'Rendeléseim',                                  sv: 'Mina ordrar',                                fr: 'Mes commandes',                            pl: 'Moje zamówienia',                         cs: 'Moje objednávky' },
      accountOrdersIntro:  { da: 'Overblik over dine tilbud, ordrer og tidligere konfigurationer.', en: 'Overview of your quotes, orders and previous configurations.', de: 'Überblick über Ihre Angebote, Bestellungen und früheren Konfigurationen.', it: 'Panoramica di preventivi, ordini e configurazioni precedenti.', hu: 'Ajánlatok, rendelések és korábbi konfigurációk áttekintése.', sv: 'Översikt över offerter, ordrar och tidigare konfigurationer.', fr: 'Vue d’ensemble de vos devis, commandes et configurations précédentes.', pl: 'Przegląd ofert, zamówień i poprzednich konfiguracji.', cs: 'Přehled nabídek, objednávek a předchozích konfigurací.' },
      filterAll:           { da: 'Alle',                                    en: 'All',                                 de: 'Alle',                                it: 'Tutti',                                           hu: 'Összes',                                        sv: 'Alla',                                        fr: 'Tous',                                      pl: 'Wszystkie',                                cs: 'Vše' },
      filterActive:        { da: 'Aktive',                                  en: 'Active',                              de: 'Aktiv',                               it: 'Attivi',                                          hu: 'Aktív',                                         sv: 'Aktiva',                                      fr: 'Actives',                                   pl: 'Aktywne',                                  cs: 'Aktivní' },
      filterSent:          { da: 'Sendt/lukket',                            en: 'Sent/closed',                         de: 'Gesendet/geschlossen',                it: 'Inviati/chiusi',                                  hu: 'Elküldve/lezárva',                              sv: 'Skickade/stängda',                           fr: 'Envoyées/clôturées',                       pl: 'Wysłane/zamknięte',                      cs: 'Odeslané/uzavřené' },
      filterPaused:        { da: 'På pause',                                en: 'Paused',                              de: 'Pausiert',                            it: 'In pausa',                                        hu: 'Szünetel',                                      sv: 'Pausade',                                    fr: 'En pause',                                  pl: 'Wstrzymane',                               cs: 'Pozastavené' },
      searchOrders:        { da: 'Søg ordrenr., kunde eller forhandler...', en: 'Search order no., customer or dealer...', de: 'Bestellnr., Kunde oder Händler suchen...', it: 'Cerca n. ordine, cliente o rivenditore...', hu: 'Rendelésszám, ügyfél vagy kereskedő keresése...', sv: 'Sök ordernr, kund eller återförsäljare...', fr: 'Rechercher n° commande, client ou revendeur...', pl: 'Szukaj nr zamówienia, klienta lub dealera...', cs: 'Hledat č. objednávky, zákazníka nebo prodejce...' },
      customer:            { da: 'Kunde',                                   en: 'Customer',                            de: 'Kunde',                               it: 'Cliente',                                         hu: 'Ügyfél',                                        sv: 'Kund',                                        fr: 'Client',                                    pl: 'Klient',                                    cs: 'Zákazník' },
      dealer:              { da: 'Forhandler',                              en: 'Dealer',                              de: 'Händler',                             it: 'Rivenditore',                                    hu: 'Kereskedő',                                     sv: 'Återförsäljare',                            fr: 'Revendeur',                                 pl: 'Dealer',                                    cs: 'Prodejce' },
      totalPrice:          { da: 'Totalpris',                               en: 'Total price',                         de: 'Gesamtpreis',                         it: 'Prezzo totale',                                  hu: 'Teljes ár',                                     sv: 'Totalpris',                                  fr: 'Prix total',                                pl: 'Cena łączna',                              cs: 'Celková cena' },
      machine:             { da: 'Maskine/model',                           en: 'Machine/model',                       de: 'Maschine/Modell',                     it: 'Macchina/modello',                              hu: 'Gép/modell',                                    sv: 'Maskin/modell',                              fr: 'Machine/modèle',                            pl: 'Maszyna/model',                            cs: 'Stroj/model' },
      latestChange:        { da: 'Seneste ændring',                         en: 'Latest change',                       de: 'Letzte Änderung',                     it: 'Ultima modifica',                                hu: 'Utolsó módosítás',                              sv: 'Senaste ändring',                            fr: 'Dernière modification',                     pl: 'Ostatnia zmiana',                          cs: 'Poslední změna' },
      details:             { da: 'Se detaljer',                             en: 'View details',                        de: 'Details anzeigen',                    it: 'Vedi dettagli',                                 hu: 'Részletek',                                     sv: 'Visa detaljer',                              fr: 'Voir les détails',                         pl: 'Zobacz szczegóły',                         cs: 'Zobrazit detaily' },
      reorder:             { da: 'Genbestil',                               en: 'Reorder',                             de: 'Erneut bestellen',                    it: 'Riordina',                                       hu: 'Újrarendelés',                                  sv: 'Beställ igen',                               fr: 'Commander à nouveau',                      pl: 'Zamów ponownie',                          cs: 'Objednat znovu' },
      orderDetails:        { da: 'Ordredetaljer',                           en: 'Order details',                       de: 'Bestelldetails',                      it: 'Dettagli ordine',                               hu: 'Rendelés részletei',                            sv: 'Orderdetaljer',                              fr: 'Détails de la commande',                   pl: 'Szczegóły zamówienia',                    cs: 'Detaily objednávky' },
      contact:             { da: 'Kontaktperson',                           en: 'Contact',                             de: 'Kontaktperson',                       it: 'Contatto',                                        hu: 'Kapcsolattartó',                                sv: 'Kontaktperson',                             fr: 'Contact',                                   pl: 'Kontakt',                                  cs: 'Kontakt' },
      phone:               { da: 'Telefon',                                 en: 'Phone',                               de: 'Telefon',                             it: 'Telefono',                                       hu: 'Telefon',                                       sv: 'Telefon',                                    fr: 'Téléphone',                                pl: 'Telefon',                                  cs: 'Telefon' },
      email:               { da: 'E-mail',                                  en: 'Email',                               de: 'E-Mail',                              it: 'E-mail',                                         hu: 'E-mail',                                        sv: 'E-post',                                     fr: 'E-mail',                                   pl: 'E-mail',                                  cs: 'E-mail' },
      seller:              { da: 'Sælger',                                  en: 'Seller',                              de: 'Verkäufer',                           it: 'Venditore',                                      hu: 'Értékesítő',                                    sv: 'Säljare',                                    fr: 'Vendeur',                                  pl: 'Sprzedawca',                              cs: 'Prodejce' },
      deliveryDate:        { da: 'Leveringsdato',                           en: 'Delivery date',                       de: 'Lieferdatum',                         it: 'Data di consegna',                               hu: 'Szállítási dátum',                              sv: 'Leveransdatum',                             fr: 'Date de livraison',                       pl: 'Data dostawy',                            cs: 'Datum dodání' },
      deliveryMethod:      { da: 'Leveringsmetode',                         en: 'Delivery method',                     de: 'Liefermethode',                       it: 'Metodo di consegna',                            hu: 'Szállítási mód',                                sv: 'Leveransmetod',                             fr: 'Mode de livraison',                       pl: 'Metoda dostawy',                          cs: 'Způsob dodání' },
      itemNo:              { da: 'Varenummer',                              en: 'Item no.',                            de: 'Artikelnr.',                          it: 'N. articolo',                                    hu: 'Cikkszám',                                      sv: 'Artikelnummer',                             fr: 'N° article',                               pl: 'Nr artykułu',                             cs: 'Č. položky' },
      description:         { da: 'Beskrivelse',                             en: 'Description',                         de: 'Beschreibung',                        it: 'Descrizione',                                   hu: 'Leírás',                                        sv: 'Beskrivning',                                fr: 'Description',                              pl: 'Opis',                                     cs: 'Popis' },
      note:                { da: 'Note',                                    en: 'Note',                                de: 'Notiz',                               it: 'Nota',                                           hu: 'Megjegyzés',                                    sv: 'Not',                                        fr: 'Note',                                      pl: 'Notatka',                                  cs: 'Poznámka' },
      unitPrice:           { da: 'Pris pr. stk.',                           en: 'Unit price',                          de: 'Stückpreis',                          it: 'Prezzo unitario',                               hu: 'Egységár',                                      sv: 'Pris/st.',                                   fr: 'Prix unitaire',                           pl: 'Cena jedn.',                              cs: 'Jedn. cena' },
      quantity:            { da: 'Antal',                                   en: 'Quantity',                            de: 'Menge',                               it: 'Quantità',                                       hu: 'Mennyiség',                                     sv: 'Antal',                                      fr: 'Quantité',                                pl: 'Ilość',                                   cs: 'Množství' },
      lineTotal:           { da: 'I alt',                                   en: 'Total',                               de: 'Gesamt',                              it: 'Totale',                                         hu: 'Összesen',                                      sv: 'Totalt',                                     fr: 'Total',                                    pl: 'Razem',                                   cs: 'Celkem' },
      subtotal:            { da: 'Subtotal',                                en: 'Subtotal',                            de: 'Zwischensumme',                       it: 'Subtotale',                                      hu: 'Részösszeg',                                    sv: 'Delsumma',                                   fr: 'Sous-total',                              pl: 'Suma częściowa',                         cs: 'Mezisoučet' },
      discount:            { da: 'Rabat',                                   en: 'Discount',                            de: 'Rabatt',                              it: 'Sconto',                                         hu: 'Kedvezmény',                                    sv: 'Rabatt',                                     fr: 'Remise',                                   pl: 'Rabat',                                   cs: 'Sleva' },
      reorderStarted:      { da: 'Ny ordrekladde åbnet',                    en: 'New order draft opened',              de: 'Neuer Bestellentwurf geöffnet',       it: 'Nuova bozza ordine aperta',                     hu: 'Új rendelési vázlat megnyitva',                 sv: 'Ny orderutkast öppnat',                     fr: 'Nouveau brouillon de commande ouvert',      pl: 'Otworzono nowy szkic zamówienia',          cs: 'Otevřen nový koncept objednávky' },
      reorderStartedDescription: { da: 'Den gamle ordre er uændret. Valgene er kopieret til en ny redigerbar konfiguration med aktuelle priser.', en: 'The old order is unchanged. Choices were copied into a new editable configuration with current prices.', de: 'Die alte Bestellung bleibt unverändert. Die Auswahl wurde in eine neue bearbeitbare Konfiguration mit aktuellen Preisen kopiert.', it: 'Il vecchio ordine resta invariato. Le scelte sono copiate in una nuova configurazione modificabile con prezzi attuali.', hu: 'A régi rendelés változatlan. A választások új, szerkeszthető konfigurációba kerültek aktuális árakkal.', sv: 'Den gamla ordern är oförändrad. Valen kopierades till en ny redigerbar konfiguration med aktuella priser.', fr: 'L’ancienne commande reste inchangée. Les choix ont été copiés dans une nouvelle configuration modifiable avec les prix actuels.', pl: 'Stare zamówienie pozostaje bez zmian. Wybory skopiowano do nowej edytowalnej konfiguracji z aktualnymi cenami.', cs: 'Původní objednávka zůstává beze změny. Volby byly zkopírovány do nové upravitelné konfigurace s aktuálními cenami.' },
      quote:               { da: 'Tilbud',                                  en: 'Quote',                               de: 'Angebot',                             it: 'Preventivo',                                      hu: 'Árajánlat',                                     sv: 'Offert',                                      fr: 'Devis',                                     pl: 'Oferta',                                    cs: 'Nabídka' },
      order:               { da: 'Ordre',                                   en: 'Order',                               de: 'Bestellung',                          it: 'Ordine',                                          hu: 'Rendelés',                                      sv: 'Order',                                       fr: 'Commande',                                  pl: 'Zamówienie',                                cs: 'Objednávka' },
      internalNote:        { da: 'Intern note',                             en: 'Internal note',                       de: 'Interne Notiz',                       it: 'Nota interna',                                    hu: 'Belső jegyzet',                                 sv: 'Intern anteckning',                           fr: 'Note interne',                              pl: 'Notatka wewnętrzna',                        cs: 'Interní poznámka' },
      writeNote:           { da: 'Skriv en huskenote...',                   en: 'Write a reminder...',                 de: 'Erinnerung schreiben...',             it: 'Scrivi un promemoria...',                         hu: 'Írj emlékeztetőt...',                           sv: 'Skriv en påminnelse...',                      fr: 'Écrire un rappel...',                       pl: 'Napisz przypomnienie...',                   cs: 'Napsat připomínku...' },
      open:                { da: 'Åbn',                                     en: 'Open',                                de: 'Öffnen',                              it: 'Apri',                                            hu: 'Megnyitás',                                     sv: 'Öppna',                                       fr: 'Ouvrir',                                    pl: 'Otwórz',                                    cs: 'Otevřít' },
      pause:               { da: 'Sæt på pause',                            en: 'Pause',                               de: 'Pausieren',                           it: 'Pausa',                                           hu: 'Szüneteltetés',                                 sv: 'Pausa',                                       fr: 'Mettre en pause',                           pl: 'Wstrzymaj',                                 cs: 'Pozastavit' },
      reactivate:          { da: 'Genaktivér',                              en: 'Reactivate',                          de: 'Reaktivieren',                        it: 'Riattiva',                                        hu: 'Újraaktiválás',                                 sv: 'Återaktivera',                                fr: 'Réactiver',                                 pl: 'Aktywuj ponownie',                          cs: 'Znovu aktivovat' },
      statusActive:        { da: 'Aktiv',                                   en: 'Active',                              de: 'Aktiv',                               it: 'Attivo',                                          hu: 'Aktív',                                         sv: 'Aktiv',                                       fr: 'Actif',                                     pl: 'Aktywne',                                   cs: 'Aktivní' },
      statusPaused:        { da: 'Pause',                                   en: 'Paused',                              de: 'Pausiert',                            it: 'In pausa',                                        hu: 'Szünetel',                                      sv: 'Pausad',                                      fr: 'En pause',                                  pl: 'Wstrzymane',                                cs: 'Pozastaveno' },
      clickToPause:        { da: 'Klik for at sætte på pause',              en: 'Click to pause',                      de: 'Klicken zum Pausieren',               it: 'Clicca per mettere in pausa',                     hu: 'Kattints a szüneteltetéshez',                   sv: 'Klicka för att pausa',                        fr: 'Cliquer pour mettre en pause',              pl: 'Kliknij, aby wstrzymać',                    cs: 'Klikněte pro pozastavení' },
      clickToActivate:     { da: 'Klik for at genaktivere',                 en: 'Click to reactivate',                 de: 'Klicken zum Reaktivieren',            it: 'Clicca per riattivare',                           hu: 'Kattints az újraaktiváláshoz',                  sv: 'Klicka för att återaktivera',                 fr: 'Cliquer pour réactiver',                    pl: 'Kliknij, aby aktywować',                    cs: 'Klikněte pro reaktivaci' },
      delete:              { da: 'Slet',                                    en: 'Delete',                              de: 'Löschen',                             it: 'Elimina',                                         hu: 'Törlés',                                        sv: 'Ta bort',                                     fr: 'Supprimer',                                 pl: 'Usuń',                                      cs: 'Smazat' },
      logout:              { da: 'Log ud',                                  en: 'Log out',                             de: 'Abmelden',                            it: 'Esci',                                            hu: 'Kijelentkezés',                                 sv: 'Logga ut',                                    fr: 'Se déconnecter',                            pl: 'Wyloguj się',                               cs: 'Odhlásit se' },
      saveFailed:          { da: 'Kunne ikke gemme sag',                    en: 'Failed to save case',                 de: 'Speichern fehlgeschlagen',            it: 'Salvataggio fallito',                             hu: 'Mentés sikertelen',                             sv: 'Kunde inte spara ärendet',                    fr: 'Échec de l’enregistrement',                 pl: 'Nie udało się zapisać sprawy',              cs: 'Nepodařilo se uložit případ' },
      savedButLinesFailed: { da: 'Sag gemt, men linjer fejlede',            en: 'Case saved, but line items failed',   de: 'Fall gespeichert, aber Positionen fehlgeschlagen', it: 'Caso salvato, ma righe fallite',        hu: 'Ügy mentve, de a tételek sikertelenek',         sv: 'Ärende sparat, men rader misslyckades',       fr: 'Dossier enregistré, mais les lignes ont échoué', pl: 'Zapisano sprawę, ale pozycje zawiodły', cs: 'Případ uložen, ale položky selhaly' },
      caseSaved:           { da: 'Sag gemt',                                en: 'Case saved',                          de: 'Fall gespeichert',                    it: 'Caso salvato',                                    hu: 'Ügy mentve',                                    sv: 'Ärende sparat',                               fr: 'Dossier enregistré',                        pl: 'Sprawa zapisana',                           cs: 'Případ uložen' },
      caseId:              { da: 'Sag ID',                                  en: 'Case ID',                             de: 'Fall-ID',                             it: 'ID caso',                                         hu: 'Ügy ID',                                        sv: 'Ärende-ID',                                   fr: 'ID dossier',                                pl: 'ID sprawy',                                 cs: 'ID případu' },
      openFailed:          { da: 'Kunne ikke åbne sag',                     en: 'Failed to open case',                 de: 'Öffnen fehlgeschlagen',               it: 'Apertura fallita',                                hu: 'Megnyitás sikertelen',                          sv: 'Kunde inte öppna ärendet',                    fr: 'Échec de l’ouverture',                      pl: 'Nie udało się otworzyć sprawy',             cs: 'Nepodařilo se otevřít případ' },
      missingState:        { da: 'Sagen mangler komplet gemt konfigurationsdata', en: 'The case is missing the full saved configurator state', de: 'Dem Fall fehlen vollständige Konfigurationsdaten', it: 'Il caso non contiene i dati di configurazione completi', hu: 'Az ügyből hiányoznak a teljes konfigurációs adatok', sv: 'Ärendet saknar fullständig sparad konfiguration', fr: 'Le dossier ne contient pas l’état complet du configurateur', pl: 'Sprawa nie zawiera pełnych zapisanych danych konfiguratora', cs: 'Případu chybí kompletní uložený stav konfigurátoru' },
      statsActive:         { da: 'Aktive sager',                            en: 'Active cases',                        de: 'Aktive Fälle',                        it: 'Casi attivi',                                     hu: 'Aktív ügyek',                                   sv: 'Aktiva ärenden',                              fr: 'Dossiers actifs',                           pl: 'Aktywne sprawy',                            cs: 'Aktivní případy' },
      statsClosed:         { da: 'Sendte/lukkede ordrer',                   en: 'Sent/closed orders',                  de: 'Gesendete/abgeschlossene Bestellungen', it: 'Ordini inviati/chiusi',                          hu: 'Elküldött/lezárt rendelések',                   sv: 'Skickade/avslutade ordrar',                    fr: 'Commandes envoyées/clôturées',              pl: 'Wysłane/zamknięte zamówienia',              cs: 'Odeslané/uzavřené objednávky' },
      statsPaused:         { da: 'Sager på pause',                          en: 'Paused cases',                        de: 'Pausierte Fälle',                     it: 'Casi in pausa',                                   hu: 'Szüneteltetett ügyek',                          sv: 'Pausade ärenden',                             fr: 'Dossiers en pause',                         pl: 'Sprawy wstrzymane',                         cs: 'Pozastavené případy' },
      statsTotalValue:     { da: 'Samlet værdi',                            en: 'Total value',                         de: 'Gesamtwert',                          it: 'Valore totale',                                   hu: 'Teljes érték',                                  sv: 'Totalt värde',                                fr: 'Valeur totale',                             pl: 'Wartość łączna',                            cs: 'Celková hodnota' },
      statsCount:          { da: 'antal',                                   en: 'count',                               de: 'Anzahl',                              it: 'numero',                                          hu: 'darab',                                         sv: 'antal',                                       fr: 'nombre',                                    pl: 'liczba',                                    cs: 'počet' },
      quoteNumber:         { da: 'Tilbudsnr',                               en: 'Quote no.',                           de: 'Angebotsnr.',                         it: 'N. preventivo',                                   hu: 'Árajánlatszám',                                 sv: 'Offertnr',                                    fr: 'N° devis',                                  pl: 'Nr oferty',                                 cs: 'Č. nabídky' },
      orderNumber:         { da: 'Ordrenr',                                 en: 'Order no.',                           de: 'Bestellnr.',                          it: 'N. ordine',                                       hu: 'Rendelésszám',                                  sv: 'Ordernr',                                     fr: 'N° commande',                               pl: 'Nr zamówienia',                             cs: 'Č. objednávky' },
      sentDate:            { da: 'Dato for afsendt ordre',                  en: 'Order sent date',                     de: 'Versanddatum der Bestellung',         it: 'Data ordine inviato',                             hu: 'Rendelés elküldésének dátuma',                  sv: 'Datum för skickad order',                     fr: 'Date d’envoi de la commande',               pl: 'Data wysłania zamówienia',                  cs: 'Datum odeslání objednávky' },
      createdCaseAt:       { da: 'Oprettet',                                en: 'Created',                             de: 'Erstellt',                            it: 'Creato',                                          hu: 'Létrehozva',                                    sv: 'Skapad',                                      fr: 'Créé',                                      pl: 'Utworzono',                                 cs: 'Vytvořeno' },
      quoteSentAt:         { da: 'Afsendt tilbud',                          en: 'Quote sent',                          de: 'Angebot gesendet',                    it: 'Preventivo inviato',                              hu: 'Árajánlat elküldve',                            sv: 'Offert skickad',                              fr: 'Devis envoyé',                              pl: 'Oferta wysłana',                            cs: 'Nabídka odeslána' },
      orderSentAt:         { da: 'Afsendt ordre',                           en: 'Order sent',                          de: 'Bestellung gesendet',                 it: 'Ordine inviato',                                  hu: 'Rendelés elküldve',                             sv: 'Order skickad',                               fr: 'Commande envoyée',                          pl: 'Zamówienie wysłane',                        cs: 'Objednávka odeslána' },
      openSentPdf:         { da: 'Åbn afsendt PDF',                         en: 'Open sent PDF',                       de: 'Gesendete PDF öffnen',                it: 'Apri PDF inviato',                                hu: 'Elküldött PDF megnyitása',                      sv: 'Öppna skickad PDF',                           fr: 'Ouvrir le PDF envoyé',                      pl: 'Otwórz wysłany PDF',                        cs: 'Otevřít odeslaný PDF' },
      openCasePdf:         { da: 'Åbn sag',                                 en: 'Open case',                           de: 'Fall öffnen',                         it: 'Apri caso',                                       hu: 'Ügy megnyitása',                                sv: 'Öppna ärende',                                fr: 'Ouvrir le dossier',                         pl: 'Otwórz sprawę',                             cs: 'Otevřít případ' },
      pdfOpenFailed:       { da: 'Kunne ikke åbne PDF',                     en: 'Could not open PDF',                  de: 'PDF konnte nicht geöffnet werden',    it: 'Impossibile aprire il PDF',                       hu: 'A PDF nem nyitható meg',                        sv: 'Kunde inte öppna PDF',                        fr: 'Impossible d’ouvrir le PDF',                pl: 'Nie można otworzyć PDF',                    cs: 'PDF nelze otevřít' },
      pdfNotStored:        { da: 'Den afsendte PDF er ikke gemt for denne sag', en: 'No stored sent PDF for this case', de: 'Für diesen Fall ist keine gesendete PDF gespeichert', it: 'Nessun PDF inviato salvato per questo caso', hu: 'Nincs mentett elküldött PDF ehhez az ügyhöz', sv: 'Ingen sparad skickad PDF för detta ärende', fr: 'Aucun PDF envoyé enregistré pour ce dossier', pl: 'Brak zapisanego wysłanego PDF dla tej sprawy', cs: 'Pro tento případ není uložen odeslaný PDF' },
      noDealerLinked:      { da: 'Din bruger har ingen forhandler tilknyttet — kontakt admin.', en: 'Your user has no dealer linked — please contact an admin.', de: 'Ihr Benutzer hat keinen Händler verknüpft – bitte Admin kontaktieren.', it: 'Il tuo utente non ha un rivenditore collegato — contatta un amministratore.', hu: 'A felhasználódhoz nincs kereskedő rendelve — fordulj az adminhoz.', sv: 'Din användare har ingen återförsäljare kopplad — kontakta admin.', fr: 'Aucun revendeur lié à votre utilisateur — contactez un administrateur.', pl: 'Twoje konto nie ma przypisanego dealera — skontaktuj się z administratorem.', cs: 'Váš uživatel nemá přiřazeného prodejce — kontaktujte admina.' },
      hideTitle:           { da: 'Fjern sag fra Min konto?',                en: 'Remove case from My account?',        de: 'Fall aus Meinem Konto entfernen?',    it: 'Rimuovere il caso da Il mio account?',            hu: 'Eltávolítod az ügyet a Fiókomból?',             sv: 'Ta bort ärendet från Mitt konto?',            fr: 'Retirer le dossier de Mon compte ?',        pl: 'Usunąć sprawę z Mojego konta?',             cs: 'Odebrat případ z Mého účtu?' },
      hideBody:            { da: 'Sagen fjernes kun fra din egen liste. Den slettes ikke fra CRM eller Timan Backend.', en: 'The case is only removed from your own list. It is not deleted from CRM or Timan Backend.', de: 'Der Fall wird nur aus Ihrer eigenen Liste entfernt. Er wird nicht aus dem CRM oder Timan Backend gelöscht.', it: 'Il caso viene rimosso solo dal tuo elenco. Non viene eliminato da CRM o Timan Backend.', hu: 'Az ügy csak a saját listádról kerül eltávolításra. Nem törlődik a CRM-ből vagy a Timan Backendből.', sv: 'Ärendet tas endast bort från din egen lista. Det raderas inte från CRM eller Timan Backend.', fr: 'Le dossier est uniquement retiré de votre liste. Il n’est pas supprimé du CRM ni du Timan Backend.', pl: 'Sprawa zostanie usunięta tylko z Twojej listy. Nie zostanie usunięta z CRM ani Timan Backend.', cs: 'Případ bude odstraněn pouze z vašeho seznamu. Nebude smazán z CRM ani Timan Backendu.' },
      hideCancel:          { da: 'Annuller',                                en: 'Cancel',                              de: 'Abbrechen',                           it: 'Annulla',                                         hu: 'Mégse',                                         sv: 'Avbryt',                                      fr: 'Annuler',                                   pl: 'Anuluj',                                    cs: 'Zrušit' },
      hideConfirm:         { da: 'Fjern fra Min konto',                     en: 'Remove from My account',              de: 'Aus Meinem Konto entfernen',          it: 'Rimuovi da Il mio account',                       hu: 'Eltávolítás a Fiókomból',                       sv: 'Ta bort från Mitt konto',                     fr: 'Retirer de Mon compte',                     pl: 'Usuń z Mojego konta',                       cs: 'Odebrat z Mého účtu' },
      hideSuccess:         { da: 'Sagen er fjernet fra Min konto.',         en: 'The case has been removed from My account.', de: 'Der Fall wurde aus Meinem Konto entfernt.', it: 'Il caso è stato rimosso da Il mio account.',         hu: 'Az ügy eltávolítva a Fiókomból.',               sv: 'Ärendet har tagits bort från Mitt konto.',    fr: 'Le dossier a été retiré de Mon compte.',    pl: 'Sprawa została usunięta z Mojego konta.',   cs: 'Případ byl odebrán z Mého účtu.' },
      hideFailed:          { da: 'Kunne ikke fjerne sag fra Min konto',     en: 'Could not remove case from My account', de: 'Fall konnte nicht aus Meinem Konto entfernt werden', it: 'Impossibile rimuovere il caso da Il mio account', hu: 'Nem sikerült eltávolítani az ügyet a Fiókomból', sv: 'Kunde inte ta bort ärendet från Mitt konto', fr: 'Impossible de retirer le dossier de Mon compte', pl: 'Nie udało się usunąć sprawy z Mojego konta', cs: 'Nepodařilo se odebrat případ z Mého účtu' },
    };
    return (key: string) => pickT(strings[key], language) || key;
  }, [language]);

  return (
    <>
      {/* Compact user area */}
      <div className="mb-4 flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white border border-gray-200">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold">
            {(appUser.display_name || appUser.email || '?').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900 truncate leading-tight">
              {appUser.display_name || appUser.email}
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className={`px-1.5 py-px rounded text-[10px] font-semibold ${roleBadgeColor(appUser.role)}`}>
                {getRoleBadge(appUser.role, language)}
              </span>
              {appUser.partner_type && (
                <span className="px-1.5 py-px rounded text-[10px] font-semibold bg-teal-100 text-teal-800">
                  {getSubRoleLabel(appUser.partner_type, language)}
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="flex-shrink-0 text-xs font-medium text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 rounded-lg transition"
        >
          {tx('myAccount')}
        </button>
      </div>

      {/* Account Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[95vw] sm:max-w-none md:!max-w-[1200px] max-h-[90vh] overflow-y-auto overflow-x-hidden break-words">
          <DialogHeader>
            <DialogTitle className="text-xl">{tx('myAccount')}</DialogTitle>
          </DialogHeader>

          {/* Top: User info (left) + Statistics (right) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 border-b pb-5">
            {/* Left: user info grouped */}
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center text-base font-bold">
                {(appUser.display_name || appUser.email || '?').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-base font-semibold text-gray-900 truncate">
                  {appUser.display_name || '—'}
                </div>
                <div className="text-sm text-gray-500 truncate">{appUser.email}</div>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${roleBadgeColor(appUser.role)}`}>
                    {getRoleBadge(appUser.role, language)}
                  </span>
                  {appUser.partner_type && (
                    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-teal-100 text-teal-800">
                      {getSubRoleLabel(appUser.partner_type, language)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Right: stats overview */}
            <div className="grid grid-cols-1 gap-2">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-50 border border-emerald-100">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-emerald-800 truncate">{tx('statsActive')}</div>
                  <div className="text-[11px] text-emerald-700/70">
                    {stats.active.count} {tx('statsCount')} · {tx('statsTotalValue')}
                  </div>
                </div>
                <div className="text-sm font-bold text-emerald-900 tabular-nums whitespace-nowrap ml-2">
                  {formatMoney(stats.active.value, mapUiLanguageToLegacy(language))}
                </div>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-blue-50 border border-blue-100">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-blue-800 truncate">{tx('statsClosed')}</div>
                  <div className="text-[11px] text-blue-700/70">
                    {stats.closed.count} {tx('statsCount')} · {tx('statsTotalValue')}
                  </div>
                </div>
                <div className="text-sm font-bold text-blue-900 tabular-nums whitespace-nowrap ml-2">
                  {formatMoney(stats.closed.value, mapUiLanguageToLegacy(language))}
                </div>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-amber-50 border border-amber-100">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-amber-800 truncate">{tx('statsPaused')}</div>
                  <div className="text-[11px] text-amber-700/70">
                    {stats.paused.count} {tx('statsCount')} · {tx('statsTotalValue')}
                  </div>
                </div>
                <div className="text-sm font-bold text-amber-900 tabular-nums whitespace-nowrap ml-2">
                  {formatMoney(stats.paused.value, mapUiLanguageToLegacy(language))}
                </div>
              </div>
            </div>
          </div>

          {/* Orders */}
          <div className="pt-3">
            <div className="flex flex-col gap-1 mb-4">
              <h3 className="text-lg font-bold text-gray-900">{tx('myOrders')}</h3>
              <p className="text-sm text-gray-500">{tx('accountOrdersIntro')}</p>
            </div>

            <div className="flex flex-col lg:flex-row gap-3 mb-4">
              <div className="flex flex-wrap gap-2">
                {([
                  ['all', 'filterAll'],
                  ['active', 'filterActive'],
                  ['sent', 'filterSent'],
                  ['paused', 'filterPaused'],
                ] as Array<[AccountCaseStatusFilter, string]>).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setStatusFilter(value)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                      statusFilter === value
                        ? 'bg-gray-950 text-white border-gray-950'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    {tx(label)}
                  </button>
                ))}
              </div>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={tx('searchOrders')}
                className="lg:ml-auto w-full lg:w-80 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>

            {savedItems.length === 0 ? (
              <p className="text-sm text-gray-400 italic">{tx('noCases')}</p>
            ) : filteredItems.length === 0 ? (
              <p className="text-sm text-gray-400 italic">{tx('noCases')}</p>
            ) : (
              <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-gray-200">
                <div className="hidden lg:grid grid-cols-[1.1fr_1.3fr_1.1fr_1fr_1fr_1fr_auto] gap-3 bg-gray-50 px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                  <div>{tx('orderNumber')}</div>
                  <div>{tx('customer')}</div>
                  <div>{tx('dealer')}</div>
                  <div>{tx('machine')}</div>
                  <div>{tx('statusActive')}</div>
                  <div className="text-right">{tx('totalPrice')}</div>
                  <div className="text-right">{tx('details')}</div>
                </div>

                <div className="divide-y divide-gray-100">
                  {filteredItems.map(item => {
                    const summary = buildAccountCaseSummary(item, language);
                    const effectiveStatus = effectiveCaseStatus(item);
                    const dateLocale = ({ da: 'da-DK', en: 'en-GB', de: 'de-DE', it: 'it-IT', hu: 'hu-HU', sv: 'sv-SE', fr: 'fr-FR', pl: 'pl-PL', cs: 'cs-CZ' } as Record<string, string>)[language as string] || 'en-GB';
                    const fmt = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString(dateLocale) : '-';
                    return (
                      <div key={item.id} className="grid grid-cols-1 lg:grid-cols-[1.1fr_1.3fr_1.1fr_1fr_1fr_1fr_auto] gap-3 px-4 py-4 text-sm">
                        <div>
                          <div className="font-bold text-gray-900">{summary.reference}</div>
                          <div className="text-xs text-gray-500">{fmt(summary.orderDate)}</div>
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-gray-900 truncate">{summary.customerName}</div>
                          <div className="text-xs text-gray-500 truncate">{summary.contactName}</div>
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-gray-800 truncate">{summary.dealerName}</div>
                          <div className="text-xs text-gray-500 truncate">{summary.dealerNumber ?? '-'}</div>
                        </div>
                        <div className="text-gray-700">{summary.machineLabel}</div>
                        <div>
                          <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${statusColor(effectiveStatus)}`}>
                            {statusLabel(effectiveStatus, language)}
                          </span>
                          <div className="text-xs text-gray-500 mt-1">{fmt(summary.latestChange)}</div>
                        </div>
                        <div className="lg:text-right font-bold text-gray-900 tabular-nums">
                          {formatMoney(summary.totalPrice, mapUiLanguageToLegacy(language))}
                        </div>
                        <div className="flex lg:justify-end gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => void handleShowDetails(item)}
                            disabled={detailLoading}
                            className="text-xs px-3 py-1.5 bg-white text-gray-800 border border-gray-200 rounded-lg hover:bg-gray-50 font-semibold disabled:opacity-60"
                          >
                            {tx('details')}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleReorder(item)}
                            className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-semibold"
                          >
                            {tx('reorder')}
                          </button>
                          {effectiveStatus !== 'ordre_afgivet' && (
                            <button
                              type="button"
                              onClick={() => void handleOpen(item)}
                              className="text-xs px-3 py-1.5 bg-gray-950 text-white rounded-lg hover:bg-gray-800 font-semibold"
                            >
                              {tx('open')}
                            </button>
                          )}
                          {(item.sent_pdf_path || effectiveStatus === 'ordre_afgivet') && (
                            <button
                              type="button"
                              onClick={() => void handleOpenPdf(item)}
                              title={item.sent_pdf_path ? tx('openSentPdf') : tx('pdfNotStored')}
                              className="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 font-semibold"
                            >
                              PDF
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Logout */}
          <div className="pt-5 border-t mt-3">
            <button
              onClick={() => { onLogout(); setOpen(false); }}
              className="w-full py-2.5 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition"
            >
              {tx('logout')}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={detailItem !== null} onOpenChange={(nextOpen) => !nextOpen && setDetailItem(null)}>
        <DialogContent className="w-[95vw] sm:max-w-none md:!max-w-[1100px] max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle className="text-xl">{tx('orderDetails')}</DialogTitle>
          </DialogHeader>

          {detailSummary && detailTotals && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">{tx('customer')}</div>
                  <div className="font-bold text-gray-900">{detailSummary.customerName}</div>
                  <div className="text-sm text-gray-600">{tx('contact')}: {detailSummary.contactName}</div>
                  <div className="text-sm text-gray-600">{tx('phone')}: {detailSummary.customerPhone}</div>
                  <div className="text-sm text-gray-600">{tx('email')}: {detailSummary.customerEmail}</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">{tx('dealer')}</div>
                  <div className="font-bold text-gray-900">{detailSummary.dealerName}</div>
                  <div className="text-sm text-gray-600">{tx('orderNumber')}: {detailSummary.reference}</div>
                  <div className="text-sm text-gray-600">{tx('seller')}: {detailSummary.sellerName}</div>
                  <div className="text-sm text-gray-600">{tx('email')}: {detailSummary.sellerEmail}</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">{tx('order')}</div>
                  <div className="font-bold text-gray-900">{statusLabel(effectiveCaseStatus(detailItem!), language)}</div>
                  <div className="text-sm text-gray-600">{tx('deliveryDate')}: {detailSummary.deliveryDate || '-'}</div>
                  <div className="text-sm text-gray-600">{tx('deliveryMethod')}: {detailSummary.deliveryMethod || '-'}</div>
                  <div className="text-sm text-gray-600">{tx('latestChange')}: {detailSummary.latestChange ? new Date(detailSummary.latestChange).toLocaleString() : '-'}</div>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="grid grid-cols-[1fr_2fr_1fr_1fr_0.7fr_1fr] gap-3 bg-gray-50 px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                  <div>{tx('itemNo')}</div>
                  <div>{tx('description')}</div>
                  <div>{tx('note')}</div>
                  <div className="text-right">{tx('unitPrice')}</div>
                  <div className="text-right">{tx('quantity')}</div>
                  <div className="text-right">{tx('lineTotal')}</div>
                </div>
                <div className="divide-y divide-gray-100">
                  {detailLines.map((line, index) => (
                    <div key={`${line.itemNo}-${index}`} className="grid grid-cols-[1fr_2fr_1fr_1fr_0.7fr_1fr] gap-3 px-4 py-3 text-sm">
                      <div className="font-mono text-xs text-gray-600">{line.itemNo}</div>
                      <div className="font-medium text-gray-900">{line.description}</div>
                      <div className="text-gray-500">{line.note || '-'}</div>
                      <div className="text-right tabular-nums">{formatMoney(line.unitPrice, mapUiLanguageToLegacy(language))}</div>
                      <div className="text-right tabular-nums">{line.quantity}</div>
                      <div className="text-right font-semibold tabular-nums">{formatMoney(line.total, mapUiLanguageToLegacy(language))}</div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-gray-200 bg-white px-4 py-3 space-y-1">
                  <div className="flex justify-end gap-6 text-sm">
                    <span className="text-gray-500">{tx('subtotal')}</span>
                    <span className="w-32 text-right font-semibold tabular-nums">{formatMoney(detailTotals.subtotal, mapUiLanguageToLegacy(language))}</span>
                  </div>
                  <div className="flex justify-end gap-6 text-sm">
                    <span className="text-gray-500">{tx('discount')}</span>
                    <span className="w-32 text-right font-semibold tabular-nums">{formatMoney(detailTotals.totalDiscount, mapUiLanguageToLegacy(language))}</span>
                  </div>
                  <div className="flex justify-end gap-6 text-base">
                    <span className="font-bold text-gray-900">{tx('totalPrice')}</span>
                    <span className="w-32 text-right font-bold tabular-nums">{formatMoney(detailTotals.finalPrice, mapUiLanguageToLegacy(language))}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                {detailItem!.sent_pdf_path && (
                  <button
                    type="button"
                    onClick={() => void handleOpenPdf(detailItem!)}
                    className="text-sm px-4 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 font-semibold"
                  >
                    PDF
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleReorder(detailItem!)}
                  className="text-sm px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-semibold"
                >
                  {tx('reorder')}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmHideId !== null} onOpenChange={(o) => !o && setConfirmHideId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tx('hideTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{tx('hideBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={hiding}>{tx('hideCancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={hiding}
              onClick={(e) => { e.preventDefault(); void handleConfirmHide(); }}
              className="bg-red-600 hover:bg-red-700"
            >
              {hiding ? '...' : tx('hideConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
