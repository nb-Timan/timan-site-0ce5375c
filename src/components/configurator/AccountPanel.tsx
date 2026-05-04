import { useState, useEffect, useCallback, useMemo } from 'react';
import { AppUser } from '@/data/appUsers';
import { Language, ConfiguratorState, PartnerType } from '@/types/configurator';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  SavedConfiguration,
  loadConfigurationById,
  loadConfigurations,
  saveConfiguration,
  updateConfigurationStatus,
  updateConfigurationNote,
  deleteConfiguration,
  SavedStatus,
  getSentPdfSignedUrl,
} from '@/lib/configurationsService';
import { calcConfigurationTotals, formatMoney } from '@/lib/calcConfiguration';
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
  language: Language;
  currentState: ConfiguratorState;
  onLogout: () => void;
  onRestoreState: (state: ConfiguratorState, configId: string) => void;
  onSavedConfiguration: (configId: string, quoteNumber?: string | null, orderNumber?: string | null) => void;
  /** Optional pre-built ownership payload (from the in-configurator picker). */
  ownershipOverride?: () => Promise<ConfiguratorOwnership>;
}

function getRoleBadge(role: string, lang: Language) {
  const map: Record<string, Record<string, string>> = {
    slutkunde: { da: 'Default bruger', en: 'Default user', de: 'Standardbenutzer', it: 'Utente predefinito', hu: 'Alapértelmezett felhasználó' },
    partner: { da: 'Partner', en: 'Partner', de: 'Partner', it: 'Partner', hu: 'Partner' },
    timan_saelger: { da: 'Timan Sælger', en: 'Timan Sales', de: 'Timan Verkauf', it: 'Timan Vendite', hu: 'Timan Értékesítő' },
  };
  return map[role]?.[lang] || map[role]?.en || role;
}

function getSubRoleLabel(subRole: PartnerType | null | undefined, lang: Language): string | null {
  if (!subRole) return null;
  const map: Record<PartnerType, Record<string, string>> = {
    service_partner: { da: 'Service partner', en: 'Service Partner', de: 'Servicepartner', it: 'Partner di servizio', hu: 'Szervizpartner' },
    forhandler: { da: 'Forhandler', en: 'Dealer', de: 'Händler', it: 'Rivenditore', hu: 'Kereskedő' },
    importoer: { da: 'Importør', en: 'Importer', de: 'Importeur', it: 'Importatore', hu: 'Importőr' },
  };
  return map[subRole]?.[lang] || map[subRole]?.en || subRole;
}

function roleBadgeColor(role: string) {
  if (role === 'timan_saelger') return 'bg-blue-100 text-blue-800';
  if (role === 'partner') return 'bg-emerald-100 text-emerald-800';
  return 'bg-gray-100 text-gray-700';
}

function statusLabel(status: SavedStatus, lang: Language): string {
  const labels: Record<SavedStatus, Record<string, string>> = {
    aktiv: { da: 'Aktiv', en: 'Active', de: 'Aktiv', it: 'Attivo', hu: 'Aktív' },
    pause: { da: 'Pause', en: 'Paused', de: 'Pausiert', it: 'In pausa', hu: 'Szünetel' },
    ordre_afgivet: { da: 'Ordre afgivet', en: 'Order submitted', de: 'Bestellung aufgegeben', it: 'Ordine inviato', hu: 'Rendelés leadva' },
    deleted: { da: 'Slettet', en: 'Deleted', de: 'Gelöscht', it: 'Eliminato', hu: 'Törölve' },
  };
  return labels[status]?.[lang] || labels[status]?.en || status;
}

function statusColor(status: SavedStatus): string {
  if (status === 'aktiv') return 'bg-emerald-100 text-emerald-700';
  if (status === 'pause') return 'bg-amber-100 text-amber-700';
  return 'bg-blue-100 text-blue-700';
}

export default function AccountPanel({ appUser, language, currentState, onLogout, onRestoreState, onSavedConfiguration, ownershipOverride }: Props) {
  const { appUser: sessionUser } = useAppUser();
  const [open, setOpen] = useState(false);
  const [savedItems, setSavedItems] = useState<SavedConfiguration[]>([]);
  const [saveLabel, setSaveLabel] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saving, setSaving] = useState(false);

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

  const handleDelete = async (id: string) => {
    await deleteConfiguration(id);
    setSavedItems(prev => prev.filter(i => i.id !== id));
  };

  const handleToggleStatus = async (id: string) => {
    const item = savedItems.find(i => i.id === id);
    if (!item || item.case_status === 'ordre_afgivet') return;
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

    onRestoreState(saved.state_json, saved.id);
    setOpen(false);
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
    if (item.case_status === 'ordre_afgivet') {
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
      if (item.case_status === 'aktiv') {
        totals.active.count += 1;
        totals.active.value += finalPrice;
      } else if (item.case_status === 'ordre_afgivet') {
        totals.closed.count += 1;
        totals.closed.value += finalPrice;
      } else if (item.case_status === 'pause') {
        totals.paused.count += 1;
        totals.paused.value += finalPrice;
      }
    });
    return totals;
  }, [savedItems]);

  const tx = useMemo(() => {
    const strings: Record<string, Record<Language, string>> = {
      myAccount: { da: 'Min konto', en: 'My account', de: 'Mein Konto', it: 'Il mio account', hu: 'Fiókom' },
      name: { da: 'Navn', en: 'Name', de: 'Name', it: 'Nome', hu: 'Név' },
      role: { da: 'Rolle', en: 'Role', de: 'Rolle', it: 'Ruolo', hu: 'Szerepkör' },
      partnerType: { da: 'Partnertype', en: 'Partner type', de: 'Partnertyp', it: 'Tipo di partner', hu: 'Partnertípus' },
      savedCases: { da: 'Gemte sager', en: 'Saved cases', de: 'Gespeicherte Fälle', it: 'Casi salvati', hu: 'Mentett ügyek' },
      saveCurrent: { da: '+ Gem nuværende', en: '+ Save current', de: '+ Aktuelle speichern', it: '+ Salva corrente', hu: '+ Jelenlegi mentése' },
      saveHint: { da: 'Udfyld firma, kontaktperson og email i trin 4 for at gemme', en: 'Fill in company, contact and email in step 4 to save', de: 'Firma, Kontakt und E-Mail in Schritt 4 ausfüllen zum Speichern', it: 'Compila azienda, contatto ed email al passo 4 per salvare', hu: 'Töltsd ki a cégnevet, kapcsolattartót és e-mailt a 4. lépésben a mentéshez' },
      nameCase: { da: 'Navngiv sag...', en: 'Name case...', de: 'Fall benennen...', it: 'Nomina caso...', hu: 'Ügy elnevezése...' },
      save: { da: 'Gem', en: 'Save', de: 'Speichern', it: 'Salva', hu: 'Mentés' },
      noCases: { da: 'Ingen gemte sager', en: 'No saved cases', de: 'Keine gespeicherten Fälle', it: 'Nessun caso salvato', hu: 'Nincsenek mentett ügyek' },
      quote: { da: 'Tilbud', en: 'Quote', de: 'Angebot', it: 'Preventivo', hu: 'Árajánlat' },
      order: { da: 'Ordre', en: 'Order', de: 'Bestellung', it: 'Ordine', hu: 'Rendelés' },
      internalNote: { da: 'Intern note', en: 'Internal note', de: 'Interne Notiz', it: 'Nota interna', hu: 'Belső jegyzet' },
      writeNote: { da: 'Skriv en huskenote...', en: 'Write a reminder...', de: 'Erinnerung schreiben...', it: 'Scrivi un promemoria...', hu: 'Írj emlékeztetőt...' },
      open: { da: 'Åbn', en: 'Open', de: 'Öffnen', it: 'Apri', hu: 'Megnyitás' },
      pause: { da: 'Sæt på pause', en: 'Pause', de: 'Pausieren', it: 'Pausa', hu: 'Szüneteltetés' },
      reactivate: { da: 'Genaktivér', en: 'Reactivate', de: 'Reaktivieren', it: 'Riattiva', hu: 'Újraaktiválás' },
      statusActive: { da: 'Aktiv', en: 'Active', de: 'Aktiv', it: 'Attivo', hu: 'Aktív' },
      statusPaused: { da: 'Pause', en: 'Paused', de: 'Pausiert', it: 'In pausa', hu: 'Szünetel' },
      clickToPause: { da: 'Klik for at sætte på pause', en: 'Click to pause', de: 'Klicken zum Pausieren', it: 'Clicca per mettere in pausa', hu: 'Kattints a szüneteltetéshez' },
      clickToActivate: { da: 'Klik for at genaktivere', en: 'Click to reactivate', de: 'Klicken zum Reaktivieren', it: 'Clicca per riattivare', hu: 'Kattints az újraaktiváláshoz' },
      delete: { da: 'Slet', en: 'Delete', de: 'Löschen', it: 'Elimina', hu: 'Törlés' },
      logout: { da: 'Log ud', en: 'Log out', de: 'Abmelden', it: 'Esci', hu: 'Kijelentkezés' },
      saveFailed: { da: 'Kunne ikke gemme sag', en: 'Failed to save case', de: 'Speichern fehlgeschlagen', it: 'Salvataggio fallito', hu: 'Mentés sikertelen' },
      savedButLinesFailed: { da: 'Sag gemt, men linjer fejlede', en: 'Case saved, but line items failed', de: 'Fall gespeichert, aber Positionen fehlgeschlagen', it: 'Caso salvato, ma righe fallite', hu: 'Ügy mentve, de a tételek sikertelenek' },
      caseSaved: { da: 'Sag gemt', en: 'Case saved', de: 'Fall gespeichert', it: 'Caso salvato', hu: 'Ügy mentve' },
      caseId: { da: 'Sag ID', en: 'Case ID', de: 'Fall-ID', it: 'ID caso', hu: 'Ügy ID' },
      openFailed: { da: 'Kunne ikke åbne sag', en: 'Failed to open case', de: 'Öffnen fehlgeschlagen', it: 'Apertura fallita', hu: 'Megnyitás sikertelen' },
      missingState: { da: 'Sagen mangler komplet gemt konfigurationsdata', en: 'The case is missing the full saved configurator state', de: 'Dem Fall fehlen vollständige Konfigurationsdaten', it: 'Il caso non contiene i dati di configurazione completi', hu: 'Az ügyből hiányoznak a teljes konfigurációs adatok' },
      statsActive: { da: 'Aktive sager', en: 'Active cases', de: 'Aktive Fälle', it: 'Casi attivi', hu: 'Aktív ügyek' },
      statsClosed: { da: 'Sendte/lukkede ordrer', en: 'Sent/closed orders', de: 'Gesendete/abgeschlossene Bestellungen', it: 'Ordini inviati/chiusi', hu: 'Elküldött/lezárt rendelések' },
      statsPaused: { da: 'Sager på pause', en: 'Paused cases', de: 'Pausierte Fälle', it: 'Casi in pausa', hu: 'Szüneteltetett ügyek' },
      statsTotalValue: { da: 'Samlet værdi', en: 'Total value', de: 'Gesamtwert', it: 'Valore totale', hu: 'Teljes érték' },
      statsCount: { da: 'antal', en: 'count', de: 'Anzahl', it: 'numero', hu: 'darab' },
      quoteNumber: { da: 'Tilbudsnr', en: 'Quote no.', de: 'Angebotsnr.', it: 'N. preventivo', hu: 'Árajánlatszám' },
      orderNumber: { da: 'Ordrenr', en: 'Order no.', de: 'Bestellnr.', it: 'N. ordine', hu: 'Rendelésszám' },
      sentDate: { da: 'Dato for afsendt ordre', en: 'Order sent date', de: 'Versanddatum der Bestellung', it: 'Data ordine inviato', hu: 'Rendelés elküldésének dátuma' },
      createdCaseAt: { da: 'Oprettet', en: 'Created', de: 'Erstellt', it: 'Creato', hu: 'Létrehozva' },
      quoteSentAt: { da: 'Afsendt tilbud', en: 'Quote sent', de: 'Angebot gesendet', it: 'Preventivo inviato', hu: 'Árajánlat elküldve' },
      orderSentAt: { da: 'Afsendt ordre', en: 'Order sent', de: 'Bestellung gesendet', it: 'Ordine inviato', hu: 'Rendelés elküldve' },
      openSentPdf: { da: 'Åbn afsendt PDF', en: 'Open sent PDF', de: 'Gesendete PDF öffnen', it: 'Apri PDF inviato', hu: 'Elküldött PDF megnyitása' },
      openCasePdf: { da: 'Åbn sag', en: 'Open case', de: 'Fall öffnen', it: 'Apri caso', hu: 'Ügy megnyitása' },
      pdfOpenFailed: { da: 'Kunne ikke åbne PDF', en: 'Could not open PDF', de: 'PDF konnte nicht geöffnet werden', it: 'Impossibile aprire il PDF', hu: 'A PDF nem nyitható meg' },
      pdfNotStored: { da: 'Den afsendte PDF er ikke gemt for denne sag', en: 'No stored sent PDF for this case', de: 'Für diesen Fall ist keine gesendete PDF gespeichert', it: 'Nessun PDF inviato salvato per questo caso', hu: 'Nincs mentett elküldött PDF ehhez az ügyhöz' },
      noDealerLinked: { da: 'Din bruger har ingen forhandler tilknyttet — kontakt admin.', en: 'Your user has no dealer linked — please contact an admin.', de: 'Ihr Benutzer hat keinen Händler verknüpft – bitte Admin kontaktieren.', it: 'Il tuo utente non ha un rivenditore collegato — contatta un amministratore.', hu: 'A felhasználódhoz nincs kereskedő rendelve — fordulj az adminhoz.' },
    };
    return (key: string) => strings[key]?.[language] || strings[key]?.en || key;
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
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
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
                  {formatMoney(stats.active.value, language)}
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
                  {formatMoney(stats.closed.value, language)}
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
                  {formatMoney(stats.paused.value, language)}
                </div>
              </div>
            </div>
          </div>

          {/* Saved items */}
          <div className="pt-3">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800">{tx('savedCases')}</h3>
              {canSave ? (
                <button
                  onClick={() => setShowSaveInput(v => !v)}
                  className="text-sm text-emerald-700 hover:text-emerald-900 font-medium"
                >
                  {tx('saveCurrent')}
                </button>
              ) : (
                <span className="text-xs text-gray-400 italic max-w-[240px] text-right">
                  {tx('saveHint')}
                </span>
              )}
            </div>

            {showSaveInput && (
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={saveLabel}
                  onChange={e => setSaveLabel(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                  placeholder={tx('nameCase')}
                  className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2"
                  autoFocus
                />
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 font-medium disabled:opacity-50"
                >
                  {saving ? '...' : tx('save')}
                </button>
              </div>
            )}

            {savedItems.length === 0 ? (
              <p className="text-sm text-gray-400 italic">{tx('noCases')}</p>
            ) : (
              <div className="space-y-3 max-h-[50vh] overflow-y-auto">
                {savedItems.map(item => (
                  <div key={item.id} className="p-4 border rounded-xl bg-gray-50 space-y-3">
                    {(() => {
                      const dateLocale = ({ da: 'da-DK', en: 'en-GB', de: 'de-DE', it: 'it-IT', hu: 'hu-HU' } as Record<string, string>)[language] || 'en-GB';
                      const fmt = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString(dateLocale) : null;
                      const createdAt = fmt(item.created_case_at) || fmt(item.created_at);
                      const quoteSentAt = fmt(item.quote_sent_at);
                      const orderSentAt = fmt(item.order_sent_at) || (item.case_status === 'ordre_afgivet' ? fmt(item.submitted_at) : null);
                      return (
                        <div className="flex gap-4">
                          {/* Left: case info */}
                          <div className="flex-1 min-w-0">
                            <div className="text-base font-semibold text-gray-900 truncate">{item.title}</div>
                            {item.state_json?.firmanavn && (
                              <div className="text-sm text-gray-500 truncate mt-0.5">{item.state_json.firmanavn}</div>
                            )}
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <span className="text-sm text-gray-400">
                                {item.case_type === 'quote' ? tx('quote') : tx('order')}
                              </span>
                              {item.case_status === 'ordre_afgivet' && (
                                <>
                                  <span className="text-sm text-gray-300">·</span>
                                  <span className={`px-2 py-0.5 rounded text-sm font-semibold ${statusColor(item.case_status)}`}>
                                    {statusLabel(item.case_status, language)}
                                  </span>
                                </>
                              )}
                              {item.pdf_downloaded && (
                                <>
                                  <span className="text-sm text-gray-300">·</span>
                                  <span className="text-xs text-blue-500 font-medium">📄 PDF</span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Middle: dates + references */}
                          <div className="flex-shrink-0 min-w-[180px] space-y-1">
                            {/* Dates block */}
                            <div className="text-xs space-y-0.5">
                              <div className="flex justify-between gap-3">
                                <span className="text-gray-500">{tx('createdCaseAt')}</span>
                                <span className="font-semibold text-gray-800 tabular-nums">{createdAt ?? '-'}</span>
                              </div>
                              <div className="flex justify-between gap-3">
                                <span className="text-gray-500">{tx('quoteSentAt')}</span>
                                <span className="font-semibold text-gray-800 tabular-nums">{quoteSentAt ?? '-'}</span>
                              </div>
                              <div className="flex justify-between gap-3">
                                <span className="text-gray-500">{tx('orderSentAt')}</span>
                                <span className="font-semibold text-gray-800 tabular-nums">{orderSentAt ?? '-'}</span>
                              </div>
                            </div>
                            {/* Reference numbers */}
                            <div className="text-xs space-y-0.5 border-t border-gray-200 pt-1">
                              <div className="flex justify-between gap-3">
                                <span className="text-gray-500">{tx('quoteNumber')}</span>
                                <span className="font-semibold text-gray-800 tabular-nums">{item.quote_number ?? '-'}</span>
                              </div>
                              <div className="flex justify-between gap-3">
                                <span className="text-gray-500">{tx('orderNumber')}</span>
                                <span className="font-semibold text-gray-800 tabular-nums">{item.order_number ?? '-'}</span>
                              </div>
                            </div>
                          </div>

                          {/* Right: internal note */}
                          <div className="w-40 flex-shrink-0">
                            <div className="text-xs font-medium text-gray-400 mb-1">📝 {tx('internalNote')}</div>
                            <textarea
                              rows={2}
                              value={item.internal_note || ''}
                              onChange={e => handleNoteChange(item.id, e.target.value)}
                              placeholder={tx('writeNote')}
                              className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 resize-none bg-white focus:border-gray-400 transition"
                            />
                          </div>
                        </div>
                      );
                    })()}
                    {/* Action buttons */}
                    <div className="flex gap-2">
                      {/* PDF icon — sent orders open the stored sent PDF (view-only, never resends);
                          non-sent cases open the case so the user can review/regenerate. */}
                      <button
                        onClick={() => void handleOpenPdf(item)}
                        title={item.sent_pdf_path ? tx('openSentPdf') : tx('openCasePdf')}
                        aria-label={item.sent_pdf_path ? tx('openSentPdf') : tx('openCasePdf')}
                        className={`text-sm px-2.5 py-1.5 rounded-lg font-medium border transition flex items-center gap-1 ${
                          item.sent_pdf_path
                            ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        PDF
                      </button>
                      {item.case_status !== 'ordre_afgivet' && (
                        <button
                          onClick={() => void handleOpen(item)}
                          className="text-sm px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium"
                        >
                          {tx('open')}
                        </button>
                      )}
                      {item.case_status !== 'ordre_afgivet' && (
                        <button
                          onClick={() => handleToggleStatus(item.id)}
                          title={item.case_status === 'aktiv' ? tx('clickToPause') : tx('clickToActivate')}
                          className={`text-sm px-3 py-1.5 rounded-lg font-semibold transition ${
                            item.case_status === 'aktiv'
                              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                              : 'bg-amber-400 text-amber-900 hover:bg-amber-500'
                          }`}
                        >
                          {item.case_status === 'aktiv' ? tx('statusActive') : tx('statusPaused')}
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-sm px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-medium"
                      >
                        {tx('delete')}
                      </button>
                    </div>
                  </div>
                ))}
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
    </>
  );
}
