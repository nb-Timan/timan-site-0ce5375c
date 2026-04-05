import { useState, useEffect } from 'react';
import { AppUser } from '@/data/appUsers';
import { Language, ConfiguratorState } from '@/types/configurator';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export type SavedStatus = 'aktiv' | 'pause' | 'ordre_afgivet';

export interface SavedItem {
  id: string;
  label: string;
  type: 'quote' | 'order';
  status: SavedStatus;
  savedAt: string;
  state: ConfiguratorState;
}

const STORAGE_KEY = 'timan_saved_configs';

function loadSavedItems(): SavedItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const items: SavedItem[] = raw ? JSON.parse(raw) : [];
    // Migrate old items without status
    return items.map(i => ({ ...i, status: i.status || 'aktiv' }));
  } catch { return []; }
}

function persistItems(items: SavedItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function saveCurrentConfig(state: ConfiguratorState, label: string): SavedItem {
  const items = loadSavedItems();
  const item: SavedItem = {
    id: `cfg_${Date.now()}`,
    label,
    type: state.flowType || 'quote',
    status: 'aktiv',
    savedAt: new Date().toISOString(),
    state,
  };
  items.unshift(item);
  persistItems(items);
  return item;
}

/** Mark a saved item as "Ordre afgivet" by id, also sets type to 'order' */
export function markAsOrderSubmitted(id: string) {
  const items = loadSavedItems();
  const idx = items.findIndex(i => i.id === id);
  if (idx >= 0) {
    items[idx].type = 'order';
    items[idx].status = 'ordre_afgivet';
    persistItems(items);
  }
}

interface Props {
  appUser: AppUser & { email: string };
  language: Language;
  currentState: ConfiguratorState;
  onLogout: () => void;
  onRestoreState: (state: ConfiguratorState) => void;
}

function getRoleBadge(role: string, lang: Language) {
  const map: Record<string, Record<string, string>> = {
    slutkunde: { da: 'Slutkunde', en: 'End Customer' },
    forhandler_servicepartner: { da: 'Forhandler', en: 'Dealer' },
    timan_saelger: { da: 'Timan Sælger', en: 'Timan Sales' },
  };
  return map[role]?.[lang] || map[role]?.en || role;
}

function roleBadgeColor(role: string) {
  if (role === 'timan_saelger') return 'bg-blue-100 text-blue-800';
  if (role === 'forhandler_servicepartner') return 'bg-emerald-100 text-emerald-800';
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
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const [saveLabel, setSaveLabel] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);

  useEffect(() => {
    if (open) setSavedItems(loadSavedItems());
  }, [open]);

  const handleSave = () => {
    if (!saveLabel.trim()) return;
    saveCurrentConfig(currentState, saveLabel.trim());
    setSavedItems(loadSavedItems());
    setSaveLabel('');
    setShowSaveInput(false);
  };

  const handleDelete = (id: string) => {
    const items = loadSavedItems().filter(i => i.id !== id);
    persistItems(items);
    setSavedItems(items);
  };

  const handleToggleStatus = (id: string) => {
    const items = loadSavedItems();
    const item = items.find(i => i.id === id);
    if (!item || item.status === 'ordre_afgivet') return; // can't toggle completed orders
    item.status = item.status === 'aktiv' ? 'pause' : 'aktiv';
    persistItems(items);
    setSavedItems(items);
  };

  const handleOpen = (item: SavedItem) => {
    onRestoreState(item.state);
    setOpen(false);
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
            <span className={`inline-block mt-0.5 px-1.5 py-px rounded text-[10px] font-semibold ${roleBadgeColor(appUser.role)}`}>
              {getRoleBadge(appUser.role, language)}
            </span>
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
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tx('Min konto', 'My account')}</DialogTitle>
          </DialogHeader>

          {/* User details */}
          <div className="space-y-2 text-sm border-b pb-4">
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
              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${roleBadgeColor(appUser.role)}`}>
                {getRoleBadge(appUser.role, language)}
              </span>
            </div>
          </div>

          {/* Saved items */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-800">{tx('Gemte sager', 'Saved cases')}</h3>
              <button
                onClick={() => setShowSaveInput(v => !v)}
                className="text-xs text-emerald-700 hover:text-emerald-900 font-medium"
              >
                {tx('+ Gem nuværende', '+ Save current')}
              </button>
            </div>

            {showSaveInput && (
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={saveLabel}
                  onChange={e => setSaveLabel(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                  placeholder={tx('Navngiv sag...', 'Name case...')}
                  className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-1.5"
                  autoFocus
                />
                <button onClick={handleSave} className="px-3 py-1.5 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 font-medium">
                  {tx('Gem', 'Save')}
                </button>
              </div>
            )}

            {savedItems.length === 0 ? (
              <p className="text-xs text-gray-400 italic">{tx('Ingen gemte sager', 'No saved cases')}</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {savedItems.map(item => (
                  <div key={item.id} className="p-2.5 border rounded-lg bg-gray-50 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-900 truncate">{item.label}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] text-gray-400">
                            {item.type === 'quote' ? tx('Tilbud', 'Quote') : tx('Ordre', 'Order')}
                          </span>
                          <span className="text-[10px] text-gray-300">·</span>
                          <span className={`px-1.5 py-px rounded text-[10px] font-semibold ${statusColor(item.status)}`}>
                            {statusLabel(item.status, language)}
                          </span>
                          <span className="text-[10px] text-gray-300">·</span>
                          <span className="text-[10px] text-gray-400">
                            {new Date(item.savedAt).toLocaleDateString(language === 'da' ? 'da-DK' : 'en-US')}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      {item.status !== 'ordre_afgivet' && (
                        <button
                          onClick={() => handleOpen(item)}
                          className="text-xs px-2 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 font-medium"
                        >
                          {tx('Åbn', 'Open')}
                        </button>
                      )}
                      {item.status !== 'ordre_afgivet' && (
                        <button
                          onClick={() => handleToggleStatus(item.id)}
                          className="text-xs px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 font-medium"
                        >
                          {item.status === 'aktiv' ? tx('Sæt på pause', 'Pause') : tx('Genaktivér', 'Reactivate')}
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100 font-medium"
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
          <div className="pt-4 border-t mt-2">
            <button
              onClick={() => { onLogout(); setOpen(false); }}
              className="w-full py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition"
            >
              {tx('Log ud', 'Log out')}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
