import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PlanningUnitDetail from '@/components/PlanningUnitDetail';
import { PLANNING_TRANSLATIONS } from '@/lib/i18n/planningTranslations';
import type { PlanningUnit } from '@/lib/planningService';

const unit: PlanningUnit = {
  id: 'qa-unit', source_system: 'qa-source', item_number: '411000',
  serial_number: '411000-04-1557', machine_ident_number: '411000-04-1557',
  production_reference: 'S47-1', production_series: 47, production_series_position: 1,
  production_order_number: '656331', erp_order_number: '138271',
  production_completed_week: 10, production_completed_year: 2026,
  available_at: null, expected_delivery_at: null, supply_status: 'in_production',
  warehouse_location: null, source_updated_at: '2026-10-04T12:00:00Z',
};
const label = (key: string) => PLANNING_TRANSLATIONS.da[key];

describe('Planning unit production detail', () => {
  it('shows distinct production, ERP and Portal references for one unit', () => {
    render(<PlanningUnitDetail unit={unit} portalOrderNumber="O-7026" language="da" label={label} />);
    expect(screen.getByRole('region', { name: 'Produktion & ERP' })).toBeInTheDocument();
    for (const value of ['411000-04-1557', 'S47-1', '47', '1', '656331', '138271', 'O-7026', 'Uge 10 / 2026']) {
      expect(screen.getAllByText(value).length).toBeGreaterThan(0);
    }
    expect(screen.getByText('P-nr.')).toBeInTheDocument();
    expect(screen.getByText('P-Ordre nr.')).toBeInTheDocument();
    expect(screen.getByText('ERP nr.')).toBeInTheDocument();
  });

  it('omits unknown values instead of rendering empty rows', () => {
    render(<PlanningUnitDetail unit={{ ...unit, production_reference: null, erp_order_number: null }}
      language="da" label={label} />);
    expect(screen.queryByText('P-nr.')).not.toBeInTheDocument();
    expect(screen.queryByText('ERP nr.')).not.toBeInTheDocument();
    expect(screen.queryByText('Portal-ordrenr.')).not.toBeInTheDocument();
    expect(screen.getByText('P-Ordre nr.')).toBeInTheDocument();
  });

  it('shows internal source context only when a permitted detail was loaded', () => {
    const { rerender } = render(<PlanningUnitDetail unit={unit} language="da" label={label} />);
    expect(screen.queryByText('Testforhandler')).not.toBeInTheDocument();
    rerender(<PlanningUnitDetail unit={unit} language="da" label={label}
      privateDetail={{ dealer_name: 'Testforhandler', customer_name: 'Testkunde',
        source_comment: 'Kun QA', production_notes: null, responsible_initials: null }} />);
    expect(screen.getByText('Testforhandler')).toBeInTheDocument();
    expect(screen.getByText('Testkunde')).toBeInTheDocument();
    expect(screen.getByText('Kun QA')).toBeInTheDocument();
    expect(screen.queryByText('Produktionsnoter')).not.toBeInTheDocument();
  });

  it('shows a neutral action reason without inventing dealer or customer data', () => {
    render(<PlanningUnitDetail unit={{ ...unit, supply_status: 'blocked' }} language="da" label={label}
      unresolvedCommercialRelation />);
    expect(screen.getByText('Kræver handling')).toBeInTheDocument();
    expect(screen.getByText(/ingen sikker Portal-relation er fundet/)).toBeInTheDocument();
    expect(screen.queryByText('Testforhandler')).not.toBeInTheDocument();
  });
});
