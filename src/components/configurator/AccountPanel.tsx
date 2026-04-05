import { useState, useEffect, useCallback } from 'react';
import { AppUser } from '@/data/appUsers';
import { Language, ConfiguratorState, PartnerType } from '@/types/configurator';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  SavedConfiguration,
  loadConfigurations,
  saveConfiguration,
  updateConfigurationStatus,
  updateConfigurationNote,
  deleteConfiguration,
  SavedStatus,
} from '@/lib/configurationsService';

// Re-export for external use
export type { SavedStatus } from '@/lib/configurationsService';
export { markAsOrderSubmitted, markPdfDownloaded } from '@/lib/configurationsService';

interface Props {
  appUser: AppUser & { email: string };
  language: Language;
  currentState: ConfiguratorState;
  onLogout: () => void;
  onRestoreState: (state: ConfiguratorState) => void;
}

function getRoleBadge(role: string, lang: Language) {
  const map: Record<string, Record<string, string>> = {
    slutkunde: { da: 'Default bruger', en: 'Default user' },
    partner: { da: 'Partner', en: 'Partner' },
    timan_saelger: { da: 'Timan Sælger', en: 'Timan Sales' },
  };
  return map[role]?.[lang] || map[role]?.en || role;
}

function getSubRoleLabel(subRole: PartnerType | null | undefined, lang: Language): string | null {
  if (!subRole) return null;
  const map: Record<PartnerType, Record<string, string>> = {
    service_partner: { da: 'Service partner', en: 'Service Partner' },
    forhandler: { da: 'Forhandler', en: 'Dealer' },
    importoer: { da: 'Importør', en: 'Importer' },
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
    aktiv: { da: 'Aktiv', en: 'Active' },
    pause: { da: 'Pause', en: 'Paused' },
    ordre_afgivet: { da: 'Ordre afgivet', en: 'Order submitted' },
  };
  return labels[status]?.[lang] || labels[status]?.en || status;
}

function statusColor(status: SavedStatus): string {
  if (status === 'aktiv') return 'bg-emerald-100 text-emerald-700';
  if (status === 'pause') return 'bg-amber-100 text-amber-700';
  return 'bg-blue-100 text-blue-700';
}

export default function AccountPanel({ appUser, language, currentState, onLogout, onRestoreState }: Props) {
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
    await saveConfiguration(currentState, saveLabel.trim(), userEmail);
    await refreshItems();
    setSaveLabel('');
    setShowSaveInput(false);
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    await deleteConfiguration(id);
    setSavedItems(prev => prev.filter(i => i.id !== id));
  };

  const handleToggleStatus = async (id: string) => {
    const item = savedItems.find(i => i.id === id);
    if (!item || item.status === 'ordre_afgivet') return;
    const newStatus: SavedStatus = item.status === 'aktiv' ? 'pause' : 'aktiv';
    await updateConfigurationStatus(id, newStatus);
    setSavedItems(prev => prev.map(i => i.id === id ? { ...i, status: newStatus } : i));
  };

  const handleOpen = (item: SavedConfiguration) => {
    onRestoreState(item.state_json);
    setOpen(false);
  };

  const handleNoteChange = async (id: string, text: string) => {
    setSavedItems(prev => prev.map(i => i.id === id ? { ...i, internal_note: text } : i));
    await updateConfigurationNote(id, text);
  };

  const tx = (da: string, en: string) => language === 'da' ? da : en;

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
          {tx('Min konto', 'My account')}
        </button>
      </div>

      {/* Account Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">{tx('Min konto', 'My account')}</DialogTitle>
          </DialogHeader>

          {/* User details */}
          <div className="space-y-3 text-base border-b pb-5">
            <div className="flex justify-between">
              <span className="text-gray-500">{tx('Navn', 'Name')}</span>
              <span className="font-medium text-gray-900">{appUser.display_name || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Email</span>
              <span className="font-medium text-gray-900 truncate ml-4">{appUser.email}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">{tx('Rolle', 'Role')}</span>
              <span className={`px-2 py-0.5 rounded text-sm font-semibold ${roleBadgeColor(appUser.role)}`}>
                {getRoleBadge(appUser.role, language)}
              </span>
            </div>
            {appUser.partner_type && (
              <div className="flex justify-between items-center">
                <span className="text-gray-500">{tx('Partnertype', 'Partner type')}</span>
                <span className="px-2 py-0.5 rounded text-sm font-semibold bg-teal-100 text-teal-800">
                  {getSubRoleLabel(appUser.partner_type, language)}
                </span>
              </div>
            )}
          </div>

          {/* Saved items */}
          <div className="pt-3">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800">{tx('Gemte sager', 'Saved cases')}</h3>
              {canSave ? (
                <button
                  onClick={() => setShowSaveInput(v => !v)}
                  className="text-sm text-emerald-700 hover:text-emerald-900 font-medium"
                >
                  {tx('+ Gem nuværende', '+ Save current')}
                </button>
              ) : (
                <span className="text-xs text-gray-400 italic max-w-[240px] text-right">
                  {tx('Udfyld firma, kontaktperson og email i trin 4 for at gemme', 'Fill in company, contact and email in step 4 to save')}
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
                  placeholder={tx('Navngiv sag...', 'Name case...')}
                  className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2"
                  autoFocus
                />
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 font-medium disabled:opacity-50"
                >
                  {saving ? '...' : tx('Gem', 'Save')}
                </button>
              </div>
            )}

            {savedItems.length === 0 ? (
              <p className="text-sm text-gray-400 italic">{tx('Ingen gemte sager', 'No saved cases')}</p>
            ) : (
              <div className="space-y-3 max-h-[50vh] overflow-y-auto">
                {savedItems.map(item => (
                  <div key={item.id} className="p-4 border rounded-xl bg-gray-50 space-y-3">
                    <div className="flex gap-4">
                      {/* Left: case info */}
                      <div className="flex-1 min-w-0">
                        <div className="text-base font-semibold text-gray-900 truncate">{item.label}</div>
                        {item.state_json?.firmanavn && (
                          <div className="text-sm text-gray-500 truncate mt-0.5">{item.state_json.firmanavn}</div>
                        )}
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className="text-sm text-gray-400">
                            {item.type === 'quote' ? tx('Tilbud', 'Quote') : tx('Ordre', 'Order')}
                          </span>
                          <span className="text-sm text-gray-300">·</span>
                          <span className={`px-2 py-0.5 rounded text-sm font-semibold ${statusColor(item.status)}`}>
                            {statusLabel(item.status, language)}
                          </span>
                          <span className="text-sm text-gray-300">·</span>
                          <span className="text-sm text-gray-400">
                            {new Date(item.created_at).toLocaleDateString(language === 'da' ? 'da-DK' : 'en-US')}
                          </span>
                          {item.pdf_downloaded && (
                            <>
                              <span className="text-sm text-gray-300">·</span>
                              <span className="text-xs text-blue-500 font-medium">📄 PDF</span>
                            </>
                          )}
                        </div>
                      </div>
                      {/* Right: internal note */}
                      <div className="w-48 flex-shrink-0">
                        <div className="text-xs font-medium text-gray-400 mb-1">📝 {tx('Intern note', 'Internal note')}</div>
                        <textarea
                          rows={2}
                          value={item.internal_note || ''}
                          onChange={e => handleNoteChange(item.id, e.target.value)}
                          placeholder={tx('Skriv en huskenote...', 'Write a reminder...')}
                          className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 resize-none bg-white focus:border-gray-400 transition"
                        />
                      </div>
                    </div>
                    {/* Action buttons */}
                    <div className="flex gap-2">
                      {item.status !== 'ordre_afgivet' && (
                        <button
                          onClick={() => handleOpen(item)}
                          className="text-sm px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium"
                        >
                          {tx('Åbn', 'Open')}
                        </button>
                      )}
                      {item.status !== 'ordre_afgivet' && (
                        <button
                          onClick={() => handleToggleStatus(item.id)}
                          className="text-sm px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
                        >
                          {item.status === 'aktiv' ? tx('Sæt på pause', 'Pause') : tx('Genaktivér', 'Reactivate')}
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-sm px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-medium"
                      >
                        {tx('Slet', 'Delete')}
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
              {tx('Log ud', 'Log out')}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
