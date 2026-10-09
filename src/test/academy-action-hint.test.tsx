import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AcademyHintTarget from '@/components/academy/AcademyHintTarget';

function HintFixture({
  activeTargetKey = 'partner-invoice-accept',
  academyActive = true,
  onClick,
}: {
  activeTargetKey?: string | null;
  academyActive?: boolean;
  onClick?: () => void;
}) {
  return <>
    <AcademyHintTarget targetKey="partner-invoice-accept" activeTargetKey={activeTargetKey} academyActive={academyActive}>
      <button type="button" onClick={onClick}>Open invoice acceptance</button>
    </AcademyHintTarget>
    <AcademyHintTarget targetKey="partner-history" activeTargetKey={activeTargetKey} academyActive={academyActive}>
      <button type="button">Open history</button>
    </AcademyHintTarget>
  </>;
}

describe('Academy action hint', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits seven seconds before highlighting only the active semantic target', () => {
    render(<HintFixture />);
    const invoice = screen.getByRole('button', { name: 'Open invoice acceptance' });
    const history = screen.getByRole('button', { name: 'Open history' });

    expect(invoice).toHaveAttribute('data-academy-hint-target', 'partner-invoice-accept');
    expect(invoice).not.toHaveAttribute('data-academy-hint-state');
    act(() => vi.advanceTimersByTime(6_999));
    expect(invoice).not.toHaveAttribute('data-academy-hint-state');
    expect(history).not.toHaveAttribute('data-academy-hint-state');

    act(() => vi.advanceTimersByTime(1));
    expect(invoice).toHaveAttribute('data-academy-hint-state', 'pulse');
    expect(history).not.toHaveAttribute('data-academy-hint-state');
  });

  it('clears the hint on target interaction and when the requirement completes', () => {
    const onClick = vi.fn();
    const { rerender } = render(<HintFixture onClick={onClick} />);
    const invoice = screen.getByRole('button', { name: 'Open invoice acceptance' });
    act(() => vi.advanceTimersByTime(7_000));
    expect(invoice).toHaveAttribute('data-academy-hint-state', 'pulse');

    fireEvent.click(invoice);
    expect(onClick).toHaveBeenCalledOnce();
    expect(invoice).not.toHaveAttribute('data-academy-hint-state');

    rerender(<HintFixture activeTargetKey={null} onClick={onClick} />);
    expect(invoice).not.toHaveAttribute('data-academy-hint-state');
  });

  it('cancels timers on unmount and never runs outside Academy', () => {
    const { unmount } = render(<HintFixture academyActive={false} />);
    act(() => vi.advanceTimersByTime(7_000));
    expect(screen.getByRole('button', { name: 'Open invoice acceptance' })).not.toHaveAttribute('data-academy-hint-state');
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses a static outline rather than an animation for reduced motion', () => {
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    render(<HintFixture />);
    act(() => vi.advanceTimersByTime(7_000));
    expect(screen.getByRole('button', { name: 'Open invoice acceptance' })).toHaveAttribute('data-academy-hint-state', 'static');
  });
});
