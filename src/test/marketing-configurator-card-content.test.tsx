import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MarketingConfiguratorProductCard } from '@/components/configurator/MarketingConfiguratorProductCard';

afterEach(cleanup);

describe('Marketing Configurator product-card content hierarchy', () => {
  it('renders title, item number and optional short description exactly once', () => {
    render(<MarketingConfiguratorProductCard
      title="CS-200 Valsespreder, for lad, manuel regulering"
      itemNumber="725131"
      itemNumberLabel="Varenr."
      description="Til lad, med manuel regulering"
      language="da"
    />);

    expect(screen.getAllByText('CS-200 Valsespreder, for lad, manuel regulering')).toHaveLength(1);
    expect(screen.getAllByText('Varenr.: 725131')).toHaveLength(1);
    expect(screen.getAllByText('Til lad, med manuel regulering')).toHaveLength(1);
  });

  it('does not render a description row when the published value is empty', () => {
    const { container } = render(<MarketingConfiguratorProductCard
      title="CS-200 Valsespreder"
      itemNumber="725131"
      itemNumberLabel="Varenr."
      description=""
      language="da"
    />);

    expect(container.querySelectorAll('p')).toHaveLength(1);
    expect(screen.getByText('Varenr.: 725131')).toBeVisible();
  });
});
