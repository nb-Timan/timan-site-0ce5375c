import { useState } from 'react';
import { MachineSelection, UnitConfig, Accessory, Machine } from '@/types/configurator';
import { getMachineById } from '@/data/machines';
import { t } from '@/data/translations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Check, Minus, Plus, Palette } from 'lucide-react';

interface AccessoryStepProps {
  machineSelections: MachineSelection[];
  unitConfigs: UnitConfig[];
  onUpdateUnitConfig: (machineId: string, unitIndex: number, updates: Partial<UnitConfig>) => void;
  onNext: () => void;
  onPrevious: () => void;
}

function formatPrice(price: number): string {
  if (price === 0) return 'Inkl.';
  const prefix = price < 0 ? '-' : '+';
  return `${prefix} ${Math.abs(price).toLocaleString('da-DK')} kr.`;
}

function AccessoryCard({
  acc,
  machine,
  config,
  onToggle,
  onQuantityChange,
  onRalChange,
}: {
  acc: Accessory;
  machine: Machine;
  config: UnitConfig;
  onToggle: (id: string) => void;
  onQuantityChange: (id: string, qty: number) => void;
  onRalChange: (id: string, value: string) => void;
}) {
  const isSelected = !!config.selectedAccessories[acc.id];
  const qty = config.accessoryQuantities[acc.id] ?? 1;

  // Check dependency
  if (acc.dependsOn && !config.selectedAccessories[acc.dependsOn]) {
    const parent = machine.accessories.find((a) => a.id === acc.dependsOn);
    return (
      <div className="accessory-card opacity-50 cursor-not-allowed bg-muted/30">
        <p className="text-sm font-medium text-muted-foreground">{acc.name}</p>
        <p className="text-xs text-muted-foreground">
          {t('dependsOnLabel')}: {parent?.name}
        </p>
      </div>
    );
  }

  if (acc.hidden) return null;

  return (
    <div
      className={`accessory-card ${isSelected ? 'accessory-card-selected' : 'bg-card'}`}
      onClick={() => !acc.groupId && onToggle(acc.id)}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{acc.name}</span>
            {acc.groupId && (
              <Badge variant="outline" className="text-[10px]">
                {t('requiredChoice')}
              </Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground">{acc.itemNumber}</span>
          {acc.description && <p className="text-xs text-muted-foreground mt-1">{acc.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold whitespace-nowrap">{formatPrice(acc.price)}</span>
          {isSelected && !acc.groupId && (
            <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
              <Check className="w-3 h-3 text-primary-foreground" />
            </div>
          )}
          {isSelected && acc.groupId && (
            <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
              <Check className="w-3 h-3 text-primary-foreground" />
            </div>
          )}
        </div>
      </div>

      {/* Quantity controls */}
      {isSelected && acc.hasQuantity && (
        <div className="flex items-center gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
          <span className="text-xs text-muted-foreground">{t('quantity')}:</span>
          <button
            className="w-6 h-6 flex items-center justify-center rounded border border-border hover:bg-muted"
            onClick={() => onQuantityChange(acc.id, Math.max(1, qty - 1))}
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="text-sm font-medium w-6 text-center">{qty}</span>
          <button
            className="w-6 h-6 flex items-center justify-center rounded border border-border hover:bg-muted"
            onClick={() => onQuantityChange(acc.id, Math.min(acc.maxQuantity ?? 99, qty + 1))}
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* RAL input */}
      {isSelected && acc.hasRalInput && (
        <div className="flex items-center gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
          <Palette className="w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t('ralColorLabel')}
            value={config.ralColors[acc.id] ?? ''}
            onChange={(e) => onRalChange(acc.id, e.target.value)}
            className="h-8 text-xs max-w-[200px]"
          />
        </div>
      )}

      {/* Sub-items */}
      {isSelected && acc.subItems && acc.subItems.length > 0 && (
        <div className="mt-2 pl-4 space-y-1 border-l-2 border-primary/20" onClick={(e) => e.stopPropagation()}>
          {acc.subItems.map((si) => (
            <div key={si.id} className="flex items-center gap-2 text-xs">
              <Check className="w-3 h-3 text-success" />
              <span>{si.name}</span>
              {si.price > 0 && <span className="text-muted-foreground">+{si.price.toLocaleString('da-DK')} kr.</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AccessoryStep({
  machineSelections,
  unitConfigs,
  onUpdateUnitConfig,
  onNext,
  onPrevious,
}: AccessoryStepProps) {
  // Build tabs: one per machine selection, and within each, tabs per unit (if individual)
  const machineEntries = machineSelections.map((sel) => ({
    sel,
    machine: getMachineById(sel.machineId)!,
    configs: unitConfigs.filter((c) => c.machineId === sel.machineId),
  })).filter((e) => e.machine);

  const [activeMachine, setActiveMachine] = useState(machineEntries[0]?.sel.machineId ?? '');

  const handleToggle = (machineId: string, unitIndex: number, accId: string, machine: Machine) => {
    const cfg = unitConfigs.find((c) => c.machineId === machineId && c.unitIndex === unitIndex);
    if (!cfg) return;
    const acc = machine.accessories.find((a) => a.id === accId);
    if (!acc) return;

    let newSelected = { ...cfg.selectedAccessories };

    if (acc.groupId) {
      // Radio behavior: deselect others in group, select this one
      const group = machine.requiredGroups?.find((g) => g.id === acc.groupId);
      if (group) {
        for (const gAccId of group.accessories) {
          newSelected[gAccId] = false;
        }
      }
      newSelected[accId] = true;
    } else {
      newSelected[accId] = !newSelected[accId];
    }

    // Auto-add logic
    for (const a of machine.accessories) {
      if (a.autoAdd) {
        const allMet = a.autoAdd.requiresAll.every((id) => newSelected[id]);
        newSelected[a.id] = allMet;
      }
    }

    onUpdateUnitConfig(machineId, unitIndex, { selectedAccessories: newSelected });
  };

  const handleQuantity = (machineId: string, unitIndex: number, accId: string, qty: number) => {
    const cfg = unitConfigs.find((c) => c.machineId === machineId && c.unitIndex === unitIndex);
    if (!cfg) return;
    onUpdateUnitConfig(machineId, unitIndex, {
      accessoryQuantities: { ...cfg.accessoryQuantities, [accId]: qty },
    });
  };

  const handleRal = (machineId: string, unitIndex: number, accId: string, value: string) => {
    const cfg = unitConfigs.find((c) => c.machineId === machineId && c.unitIndex === unitIndex);
    if (!cfg) return;
    onUpdateUnitConfig(machineId, unitIndex, {
      ralColors: { ...cfg.ralColors, [accId]: value },
    });
  };

  const renderAccessories = (machine: Machine, config: UnitConfig, unitIndex: number) => {
    // Group required groups first, then optional
    const requiredGroups = machine.requiredGroups ?? [];
    const optionalAccessories = machine.accessories.filter(
      (a) => !a.groupId && !a.hidden
    );

    return (
      <div className="space-y-6">
        {/* Required groups */}
        {requiredGroups.map((group) => {
          const groupAccs = machine.accessories.filter((a) => a.groupId === group.id);
          return (
            <div key={group.id}>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                {group.label}
                <Badge variant="destructive" className="text-[10px]">{t('requiredChoice')}</Badge>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {groupAccs.map((acc) => (
                  <AccessoryCard
                    key={acc.id}
                    acc={acc}
                    machine={machine}
                    config={config}
                    onToggle={(id) => handleToggle(machine.id, unitIndex, id, machine)}
                    onQuantityChange={(id, qty) => handleQuantity(machine.id, unitIndex, id, qty)}
                    onRalChange={(id, v) => handleRal(machine.id, unitIndex, id, v)}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {/* Optional accessories */}
        {optionalAccessories.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-2">{t('optional')}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {optionalAccessories.map((acc) => (
                <AccessoryCard
                  key={acc.id}
                  acc={acc}
                  machine={machine}
                  config={config}
                  onToggle={(id) => handleToggle(machine.id, unitIndex, id, machine)}
                  onQuantityChange={(id, qty) => handleQuantity(machine.id, unitIndex, id, qty)}
                  onRalChange={(id, v) => handleRal(machine.id, unitIndex, id, v)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {machineEntries.length > 1 && (
        <Tabs value={activeMachine} onValueChange={setActiveMachine}>
          <TabsList>
            {machineEntries.map((e) => (
              <TabsTrigger key={e.sel.machineId} value={e.sel.machineId}>
                {e.machine.name} ({e.sel.quantity}x)
              </TabsTrigger>
            ))}
          </TabsList>
          {machineEntries.map((e) => (
            <TabsContent key={e.sel.machineId} value={e.sel.machineId}>
              {e.sel.configMode === 'individual' && e.configs.length > 1 ? (
                <Tabs defaultValue="0">
                  <TabsList>
                    {e.configs.map((_, idx) => (
                      <TabsTrigger key={idx} value={String(idx)}>
                        {t('unit')} {idx + 1}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {e.configs.map((cfg, idx) => (
                    <TabsContent key={idx} value={String(idx)}>
                      {renderAccessories(e.machine, cfg, idx)}
                    </TabsContent>
                  ))}
                </Tabs>
              ) : (
                e.configs[0] && renderAccessories(e.machine, e.configs[0], 0)
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}

      {machineEntries.length === 1 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">
            {machineEntries[0].machine.name} — {t('step3Title')}
          </h3>
          {machineEntries[0].sel.configMode === 'individual' && machineEntries[0].configs.length > 1 ? (
            <Tabs defaultValue="0">
              <TabsList>
                {machineEntries[0].configs.map((_, idx) => (
                  <TabsTrigger key={idx} value={String(idx)}>
                    {t('unit')} {idx + 1}
                  </TabsTrigger>
                ))}
              </TabsList>
              {machineEntries[0].configs.map((cfg, idx) => (
                <TabsContent key={idx} value={String(idx)}>
                  {renderAccessories(machineEntries[0].machine, cfg, idx)}
                </TabsContent>
              ))}
            </Tabs>
          ) : (
            machineEntries[0].configs[0] && renderAccessories(machineEntries[0].machine, machineEntries[0].configs[0], 0)
          )}
        </div>
      )}

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onPrevious}>{t('previous')}</Button>
        <Button onClick={onNext}>{t('next')}</Button>
      </div>
    </div>
  );
}
