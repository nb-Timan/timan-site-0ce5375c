import { fireEvent, render, screen } from '@testing-library/react';
import { CampaignDisableControl } from '@/components/configurator/CampaignDisableControl';

describe('Configurator campaign disable control', () => {
  it('stays hidden when no campaign is relevant', () => {
    render(
      <CampaignDisableControl
        visible={false}
        checked={false}
        label="Deaktivér kampagne"
        hint="Kampagnen fjernes, og normal rabatberegning anvendes."
        onCheckedChange={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('campaign-disable-control')).not.toBeInTheDocument();
  });

  it('renders compactly and toggles without changing its responsive width contract', () => {
    const onCheckedChange = vi.fn();
    const { rerender } = render(
      <CampaignDisableControl
        visible
        checked={false}
        label="Deaktivér kampagne"
        hint="Kampagnen fjernes, og normal rabatberegning anvendes."
        onCheckedChange={onCheckedChange}
      />,
    );

    const control = screen.getByTestId('campaign-disable-control');
    expect(control).toHaveClass('min-w-0');
    expect(screen.getByText('Kampagnen fjernes, og normal rabatberegning anvendes.')).toHaveClass('max-w-full');
    expect(screen.getByRole('switch', { name: 'Deaktivér kampagne' })).toHaveAttribute('data-state', 'unchecked');

    fireEvent.click(screen.getByRole('switch', { name: 'Deaktivér kampagne' }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    window.dispatchEvent(new Event('resize'));
    rerender(
      <CampaignDisableControl
        visible
        checked
        label="Deaktivér kampagne"
        hint="Kampagnen fjernes, og normal rabatberegning anvendes."
        onCheckedChange={onCheckedChange}
      />,
    );

    expect(screen.getByTestId('campaign-disable-control')).toHaveClass('min-w-0');
    expect(screen.getByRole('switch', { name: 'Deaktivér kampagne' })).toHaveAttribute('data-state', 'checked');
  });
});
