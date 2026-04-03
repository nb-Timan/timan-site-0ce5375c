import { useState } from 'react';
import { Machine, MachineSelection, DocumentType, ConfigMode } from '@/types/configurator';
import { machines } from '@/data/machines';
import { t } from '@/data/translations';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Info, Plus, Minus } from 'lucide-react';

interface MachineSelectionStepProps {
  documentType: DocumentType;
  selections: MachineSelection[];
  onDocumentTypeChange: (dt: DocumentType) => void;
  onSelectionsChange: (selections: MachineSelection[]) => void;
  onNext: () => void;
}

function formatPrice(price: number): string {
  return price.toLocaleString('da-DK') + ' kr.';
}

export function MachineSelectionStep({
  documentType,
  selections,
  onDocumentTypeChange,
  onSelectionsChange,
  onNext,
}: MachineSelectionStepProps) {
  const getSelection = (id: string) => selections.find((s) => s.machineId === id);

  const toggleMachine = (machineId: string) => {
    const existing = getSelection(machineId);
    if (existing) {
      onSelectionsChange(selections.filter((s) => s.machineId !== machineId));
    } else {
      onSelectionsChange([...selections, { machineId, quantity: 1, configMode: 'shared' }]);
    }
  };

  const updateQty = (machineId: string, delta: number) => {
    onSelectionsChange(
      selections.map((s) =>
        s.machineId === machineId ? { ...s, quantity: Math.max(1, s.quantity + delta) } : s
      )
    );
  };

  const updateConfigMode = (machineId: string, mode: ConfigMode) => {
    onSelectionsChange(
      selections.map((s) => (s.machineId === machineId ? { ...s, configMode: mode } : s))
    );
  };

  const hasSelections = selections.length > 0;

  return (
    <div className="space-y-6">
      {/* Document type */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">{t('documentTypeLabel')}:</span>
        <div className="flex gap-2">
          {(['quote', 'order'] as DocumentType[]).map((dt) => (
            <Button
              key={dt}
              variant={documentType === dt ? 'default' : 'outline'}
              size="sm"
              onClick={() => onDocumentTypeChange(dt)}
            >
              {t(dt)}
            </Button>
          ))}
        </div>
      </div>

      {/* Machine cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {machines.map((machine) => {
          const sel = getSelection(machine.id);
          const isSelected = !!sel;

          return (
            <div
              key={machine.id}
              className={`machine-card bg-card ${isSelected ? 'machine-card-selected' : 'border-border'}`}
              onClick={() => !isSelected && toggleMachine(machine.id)}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-semibold text-card-foreground">{machine.name}</h3>
                  <span className="text-xs text-muted-foreground">{machine.itemNumber}</span>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <button
                      className="text-muted-foreground hover:text-primary p-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Info className="w-4 h-4" />
                    </button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{machine.name}</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground mb-3">{machine.description}</p>
                    {Object.keys(machine.specs).length > 0 && (
                      <div className="space-y-1">
                        {Object.entries(machine.specs).map(([k, v]) => (
                          <div key={k} className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{k}</span>
                            <span className="font-medium">{v}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {machine.basePrice > 0 && (
                      <p className="mt-3 text-lg font-semibold text-primary">{formatPrice(machine.basePrice)}</p>
                    )}
                  </DialogContent>
                </Dialog>
              </div>

              <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{machine.description}</p>

              {machine.basePrice > 0 && (
                <p className="text-base font-bold text-primary mb-3">{formatPrice(machine.basePrice)}</p>
              )}

              {!machine.isLooseTool && Object.keys(machine.specs).length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {Object.entries(machine.specs).slice(0, 2).map(([k, v]) => (
                    <Badge key={k} variant="secondary" className="text-[10px]">
                      {k}: {v}
                    </Badge>
                  ))}
                </div>
              )}

              {isSelected ? (
                <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                  {/* Quantity */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{t('quantity')}</span>
                    <div className="flex items-center gap-2">
                      <button
                        className="w-6 h-6 flex items-center justify-center rounded border border-border hover:bg-muted"
                        onClick={() => updateQty(machine.id, -1)}
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-6 text-center text-sm font-medium">{sel!.quantity}</span>
                      <button
                        className="w-6 h-6 flex items-center justify-center rounded border border-border hover:bg-muted"
                        onClick={() => updateQty(machine.id, 1)}
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Config mode (only if qty > 1) */}
                  {sel!.quantity > 1 && (
                    <Select
                      value={sel!.configMode}
                      onValueChange={(v) => updateConfigMode(machine.id, v as ConfigMode)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="shared">{t('sharedConfig')}</SelectItem>
                        <SelectItem value="individual">{t('individualConfig')}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={() => toggleMachine(machine.id)}
                  >
                    Fjern
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="w-full" onClick={() => toggleMachine(machine.id)}>
                  <Plus className="w-3 h-3 mr-1" />
                  {t('addToQuote')}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-end">
        <Button onClick={onNext} disabled={!hasSelections}>
          {t('next')}
        </Button>
      </div>
    </div>
  );
}
