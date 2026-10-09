import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/pages/ConfiguratorPage.tsx', 'utf8');

describe('Configurator navigation scroll handling', () => {
  it('scrolls the newly selected step content into view only after an explicit step transition', () => {
    expect(source).toContain('pendingStepScrollRef.current = nextStep');
    expect(source).toContain("stepContentRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' })");
    expect(source).toContain('onClick={() => { if (step <= state.step && allowed) navigateToStep(step); }}');
  });

  it('resets the internal equipment container only after an actual machine transition', () => {
    expect(source).toContain('pendingMachineScrollRef.current = nextMachineIndex');
    expect(source).toContain('if (equipmentScrollRef.current) equipmentScrollRef.current.scrollTop = 0');
    expect(source).toContain('onClick={() => navigateToMachine(du.globalIndex)}');
    expect(source).toContain('navigateToMachine(displayUnits[currentDisplayIdx + 1].globalIndex);');
  });

  it('does not couple accessory or pricing updates to scroll resets', () => {
    expect(source).toContain('onClick={() => handleToggleAcc(a.id)}');
    expect(source).not.toContain('handleToggleAcc(a.id); navigateToMachine');
    expect(source).not.toContain('calcResult, state.currentMachineIndex');
  });

  it('defers next-machine navigation until dependency dialogs resolve', () => {
    expect(source).toContain('setReminder721122({ open: true, pendingNext: proceed });');
    expect(source).toContain('setReminder721059({ open: true, pendingNext: proceed });');
    expect(source).toContain('if (next) setTimeout(next, 0);');
  });

  it('uses the same navigation path in Academy and normal configurators', () => {
    expect(source).toContain('const isAcademyMode = academySandbox.isActive();');
    expect(source.match(/function ConfiguratorPage/g)).toHaveLength(1);
    expect(source).not.toContain('isAcademyMode ? navigateToMachine');
  });
});
