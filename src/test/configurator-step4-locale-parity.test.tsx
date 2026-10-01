import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ConfiguratorDemoMachineControl,
  ConfiguratorMachineReferenceField,
  ConfiguratorPurchaseOrderField,
} from '@/components/configurator/ConfiguratorStep4Controls';
import { t } from '@/data/translations';
import { useConfigurator } from '@/hooks/useConfigurator';
import { calculateConfiguration } from '@/lib/calcConfiguration';
import { createEmptyConfiguratorState } from '@/lib/configuratorState';
import { PORTAL_LANGUAGES, mapUiLanguageToLegacy } from '@/lib/portalLanguages';
import type { ConfiguratorState } from '@/types/configurator';
import {
  canSelectConfiguratorDemo,
} from '../../supabase/functions/_shared/configuratorPermissionContract';

afterEach(cleanup);

const step4State = (): ConfiguratorState => ({
  ...createEmptyConfiguratorState('da'),
  step: 4,
  flowType: 'quote',
  machineConfigs: [{ id: 'm0', type: 'Timan 3330', qty: 1, configMode: 'shared', acc: ['725138'] }],
  date: '2027-02-01',
  purchaseOrderNumber: 'PO-PARITY-42',
  reqNumbers: { machine_1: 'REQ-PARITY-42' },
  demoMachines: { '712000_1': true },
});

describe('canonical Configurator Step 4 locale parity', () => {
  it('keeps every core business control in one locale-neutral render tree', () => {
    const source = readFileSync(resolve('src/pages/ConfiguratorPage.tsx'), 'utf8');
    const step4Start = source.indexOf('{/* Step 4: Customer info */}');
    const step4End = source.indexOf('<Dialog open={backendCorrectionDialogOpen}', step4Start);
    const step4Tree = source.slice(step4Start, step4End);
    const coreControls = [
      'data-testid="configurator-step4"',
      'data-testid="configurator-step4-customer-contact"',
      '<ConfiguratorPurchaseOrderField',
      '<ConfiguratorMachineReferenceField',
      'data-testid="configurator-flow-mode-control"',
      'data-testid="configurator-direct-control"',
      '<CampaignDisableControl',
      'data-testid="configurator-delivery-summary"',
      '<ConfiguratorDemoMachineControl',
      'data-testid="configurator-pricing-summary"',
    ];

    expect(step4Start).toBeGreaterThan(-1);
    expect(step4End).toBeGreaterThan(step4Start);
    for (const control of coreControls) expect(step4Tree).toContain(control);
    expect(step4Tree).not.toMatch(/(?:lang|uiLanguage|globalLanguage|state\.language)\s*===\s*['"]de['"]/);
  });

  it.each(PORTAL_LANGUAGES.map(({ code }) => code))(
    'has safe labels for every core Step 4 control in %s',
    (language) => {
      const keys = [
        'purchaseOrderReference',
        'reqNumberPlaceholder',
        'demoMachineLabel',
        'quote',
        'order',
        'directMode',
        'deliveryDate',
        'companyName',
        'contactPerson',
        'finalPrice',
      ];
      for (const key of keys) {
        expect(t(key, language).trim()).not.toBe('');
        expect(t(key, language)).not.toBe(key);
      }
    },
  );

  it.each(PORTAL_LANGUAGES.map(({ code }) => code))(
    'renders the same PO/reference and Demo controls for %s',
    (language) => {
      const onPurchaseOrderChange = vi.fn();
      const onMachineReferenceChange = vi.fn();
      const onDemoChange = vi.fn();

      render(
        <>
          <ConfiguratorPurchaseOrderField
            label={t('purchaseOrderReference', language)}
            value="PO-42"
            onChange={onPurchaseOrderChange}
          />
          <ConfiguratorMachineReferenceField
            machineNumber={1}
            value="REQ-42"
            placeholder={t('reqNumberPlaceholder', language)}
            onChange={onMachineReferenceChange}
          />
          <ConfiguratorDemoMachineControl
            machineNumber={1}
            checked
            disabled={false}
            label={t('demoMachineLabel', language)}
            formattedFee={language === 'da' ? '75 kr.' : '10 €'}
            indentClassName="pl-0"
            onChange={onDemoChange}
          />
        </>,
      );

      expect(screen.getByTestId('configurator-purchase-order-control')).toBeInTheDocument();
      expect(screen.getByTestId('configurator-machine-reference-control')).toBeInTheDocument();
      expect(screen.getByTestId('configurator-demo-control')).toBeInTheDocument();
      expect(screen.getByDisplayValue('PO-42')).toBeInTheDocument();
      expect(screen.getByDisplayValue('REQ-42')).toHaveAttribute('placeholder', t('reqNumberPlaceholder', language));
      expect(screen.getByRole('checkbox')).toBeChecked();
      expect(t('purchaseOrderReference', language)).not.toBe('purchaseOrderReference');
      expect(t('reqNumberPlaceholder', language)).not.toBe('reqNumberPlaceholder');
      expect(t('demoMachineLabel', language)).not.toBe('demoMachineLabel');

      fireEvent.change(screen.getByDisplayValue('PO-42'), { target: { value: 'PO-43' } });
      fireEvent.change(screen.getByDisplayValue('REQ-42'), { target: { value: 'REQ-43' } });
      fireEvent.click(screen.getByRole('checkbox'));
      expect(onPurchaseOrderChange).toHaveBeenCalled();
      expect(onMachineReferenceChange).toHaveBeenCalled();
      expect(onDemoChange).toHaveBeenCalled();
    },
  );

  it('uses natural German labels without English or Danish fallback leakage', () => {
    expect(t('purchaseOrderReference', 'de')).toBe('Bestellreferenz / PO-Nr.');
    expect(t('reqNumberPlaceholder', 'de')).toBe('Bestellreferenz / PO-Nr.');
    expect(t('demoMachineLabel', 'de')).toBe('Demo-Maschine');
  });

  it('preserves Step 4 business state when switching between Danish and German', () => {
    const { result } = renderHook(() => useConfigurator());
    act(() => result.current.setState(step4State()));

    act(() => result.current.setLanguage('de'));
    expect(result.current.state).toMatchObject({
      language: 'de',
      step: 4,
      purchaseOrderNumber: 'PO-PARITY-42',
      reqNumbers: { machine_1: 'REQ-PARITY-42' },
      demoMachines: { '712000_1': true },
      date: '2027-02-01',
    });

    act(() => result.current.setState(current => ({
      ...current,
      purchaseOrderNumber: 'DE-PO-43',
      reqNumbers: { machine_1: 'DE-REQ-43' },
      demoMachines: { '712000_1': false },
    })));
    act(() => result.current.setLanguage('da'));
    expect(result.current.state).toMatchObject({
      language: 'da',
      purchaseOrderNumber: 'DE-PO-43',
      reqNumbers: { machine_1: 'DE-REQ-43' },
      demoMachines: { '712000_1': false },
    });
  });

  it('maps every UI locale without changing the shared Step 4 state fields', () => {
    const canonical = step4State();
    for (const { code } of PORTAL_LANGUAGES) {
      const localized = { ...canonical, language: mapUiLanguageToLegacy(code) };
      expect(localized).toMatchObject({
        purchaseOrderNumber: canonical.purchaseOrderNumber,
        reqNumbers: canonical.reqNumbers,
        demoMachines: canonical.demoMachines,
        machineConfigs: canonical.machineConfigs,
        date: canonical.date,
      });
    }
  });

  it.each(['timan_backend', 'timan_seller'] as const)(
    'keeps Demo authorization locale-neutral for %s',
    (portalRole) => {
      const access = PORTAL_LANGUAGES.map(() => canSelectConfiguratorDemo({
        portalRole,
        hasConfiguratorAccess: true,
        canViewPrices: false,
        isDirectPricing: false,
        isExhibition: false,
      }));
      expect(access).toEqual(PORTAL_LANGUAGES.map(() => true));
    },
  );

  it('keeps pricing rules and selected equipment identical across DA, DE, IT and HU', () => {
    const results = (['da', 'de', 'it', 'hu'] as const).map((language) => {
      const state = { ...step4State(), language };
      const result = calculateConfiguration(state, { now: Date.parse('2026-10-01T12:00:00Z') });
      return {
        language,
        discountKinds: result.discountDetails.map(({ kind }) => kind),
        discountPercents: result.discountDetails.map(({ percent }) => percent),
        itemNumbers: result.lineItems.map(({ varenr }) => varenr).filter(Boolean),
        demoSelected: result.lineItems.some(({ varenr }) => varenr === '795002'),
      };
    });

    for (const result of results.slice(1)) {
      expect(result.discountKinds).toEqual(results[0].discountKinds);
      expect(result.discountPercents).toEqual(results[0].discountPercents);
      expect(result.itemNumbers).toEqual(results[0].itemNumbers);
      expect(result.demoSelected).toBe(true);
    }
  });
});
