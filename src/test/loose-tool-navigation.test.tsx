import { useState } from 'react';
import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LooseToolFilters } from '@/components/configurator/LooseToolFilters';
import { getLooseToolAccessories, LOOSE_TOOL_KEY } from '@/data/machines';
import { isLooseConsumable } from '@/data/looseToolAssortment';
import { t } from '@/data/translations';
import { useConfigurator } from '@/hooks/useConfigurator';
import {
  resolveLooseToolPresentation, selectLooseToolCategory, selectLooseToolMachine,
  type LooseToolNavigation,
} from '@/lib/looseToolPresentation';

const initial: LooseToolNavigation = { category: 'all', machine: null };
const catalog = getLooseToolAccessories();
const resolve = (state: LooseToolNavigation, selected: string[] = []) =>
  resolveLooseToolPresentation(catalog, state.machine, state.category, selected);

function Navigation() {
  const [state, setState] = useState(initial);
  return <LooseToolFilters category={state.category} machine={state.machine} search=""
    onCategory={category => setState(current => selectLooseToolCategory(current, category))}
    onMachine={machine => setState(current => selectLooseToolMachine(current, machine))}
    onSearch={() => {}} translate={t} />;
}

describe('explicit two-level loose-tool navigation', () => {
  it.each(['all', 'attachments', 'consumables'] as const)('category %s never selects a machine implicitly', category => {
    const state = selectLooseToolCategory(initial, category);
    expect(state).toEqual({ category, machine: null });
    expect(resolve(state)).toEqual([]);
    expect(initial).toEqual({ category: 'all', machine: null });
  });

  it('starts with no pressed machine and category changes keep every machine unselected', () => {
    render(<Navigation />);
    const machines = within(screen.getByRole('group', { name: t('looseToolsMachineFilterPrompt') }));
    const nonePressed = () => machines.getAllByRole('button').forEach(button =>
      expect(button).toHaveAttribute('aria-pressed', 'false'));
    nonePressed();
    fireEvent.click(screen.getByRole('button', { name: 'Forbrugsvarer' }));
    nonePressed();
    fireEvent.click(machines.getByRole('button', { name: 'RC-1000s' }));
    expect(machines.getByRole('button', { name: 'RC-1000s' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Redskaber' }));
    expect(machines.getByRole('button', { name: 'RC-1000s' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(machines.getByRole('button', { name: 'RC-751' }));
    expect(screen.getByRole('button', { name: 'Forbrugsvarer' })).toHaveAttribute('aria-pressed', 'true');
    expect(machines.getByRole('button', { name: 'RC-751' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Redskaber' }));
    nonePressed();
  });

  it.each(['all', 'attachments', 'consumables'] as const)('RC-751 switches category %s to populated consumables atomically', category => {
    const state = selectLooseToolMachine({ category, machine: 'Timan 3330' }, 'RC-751');
    expect(state).toEqual({ category: 'consumables', machine: 'RC-751' });
    expect(resolve(state).filter(row => !row.isHeader).map(row => row.varenr))
      .toEqual(['411687', '410106', '411571', '411866', '411867', '795015']);
  });

  it('clears only the incompatible RC-751 attachments context, never selects all as a fallback', () => {
    expect(selectLooseToolCategory({ category: 'consumables', machine: 'RC-751' }, 'attachments'))
      .toEqual({ category: 'attachments', machine: null });
    expect(selectLooseToolCategory({ category: 'consumables', machine: 'RC-751' }, 'all'))
      .toEqual({ category: 'all', machine: 'RC-751' });
  });

  it.each(['RC-1000S', 'Timan 3330', 'Timan 2620'] as const)('%s preserves a valid explicit machine in both categories', machine => {
    for (const category of ['attachments', 'consumables'] as const) {
      const state = selectLooseToolCategory(selectLooseToolMachine(initial, machine), category);
      expect(state).toEqual({ category, machine });
      const rows = resolve(state).filter(row => !row.isHeader && !row.isProductGroup);
      expect(rows.length).toBeGreaterThan(0);
      rows.forEach(row => expect(isLooseConsumable(row.varenr)).toBe(category === 'consumables'));
    }
  });

  it('machine all is explicit and retains populated grouping and category boundaries', () => {
    const state = selectLooseToolMachine(selectLooseToolCategory(initial, 'consumables'), 'all');
    expect(resolve(state).filter(row => row.isHeader).map(row => row.name))
      .toEqual(['RC-751', 'RC-1000s', 'Timan 3330', 'Timan 2620', 'Loader-Line / CS-200']);
    const attachments = selectLooseToolCategory(state, 'attachments');
    expect(attachments.machine).toBe('all');
    expect(resolve(attachments).some(row => row.varenr === '410910')).toBe(true);
    expect(resolve(attachments).some(row => isLooseConsumable(row.varenr))).toBe(false);
  });

  it('filter transitions preserve selected cart identity, quantity, pricing and the entire domain state', () => {
    const { result } = renderHook(() => useConfigurator());
    const selected = '720485';
    act(() => result.current.setState(state => ({ ...state, flowType: 'quote', step: 3,
      accQty: { ['m0_' + selected]: 2 },
      machineConfigs: [{ id: 'm0', type: LOOSE_TOOL_KEY, qty: 1, configMode: 'shared', acc: [selected] }] })));
    const before = JSON.stringify(result.current.state);
    const priceBefore = JSON.stringify(result.current.calcResult);
    let state = initial;
    for (const machine of ['RC-751', 'RC-1000S', 'Timan 3330', 'all'] as const) {
      state = selectLooseToolMachine(state, machine);
      resolve(state, [selected]);
      state = selectLooseToolCategory(state, 'attachments');
      resolve(state, [selected]);
      state = selectLooseToolCategory(state, 'consumables');
      resolve(state, [selected]);
    }
    expect(JSON.stringify(result.current.state)).toBe(before);
    expect(JSON.stringify(result.current.calcResult)).toBe(priceBefore);
    expect(result.current.calcResult?.lineItems).toContainEqual(expect.objectContaining({ varenr: selected, quantity: 2 }));
  });
});
