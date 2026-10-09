import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ObservabilityPanel, OverviewPanel } from '@/pages/backend/BackendAiSupportPage';
import { EMPTY_SUPPORT_ADMIN_OVERVIEW } from '@/lib/supportAdminTypes';

vi.mock('@/context/LanguageContext', () => ({
  useLanguage: () => ({ uiLanguage: 'da', language: 'da' }),
}));

describe('Support administration empty dashboard', () => {
  it('renders explicit zero metrics without fabricated production data', () => {
    render(<OverviewPanel overview={EMPTY_SUPPORT_ADMIN_OVERVIEW} reload={vi.fn()} loading={false} error={null} />);
    expect(screen.getByText('Spørgsmål i alt')).toBeInTheDocument();
    expect(screen.getByText('Unikke brugere')).toBeInTheDocument();
    expect(screen.getByText('Svarrate')).toBeInTheDocument();
    expect(screen.getByText('Kildebaseret svarrate')).toBeInTheDocument();
    expect(screen.getByText('Ingen-svar-rate')).toBeInTheDocument();
    expect(screen.getByText('Positiv feedback-rate')).toBeInTheDocument();
    expect(screen.getByText(/Der er endnu ikke registreret runtime-hændelser/)).toBeInTheDocument();
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
  });

  it('shows real runtime metrics without the empty-state hint', () => {
    render(
      <ObservabilityPanel
        overview={{
          ...EMPTY_SUPPORT_ADMIN_OVERVIEW,
          total_requests: 12,
          successful_requests: 10,
          failed_requests: 2,
          p95_latency_ms: 4800,
          total_input_tokens: 10030,
          total_output_tokens: 618,
          estimated_cost: 0.00479936,
        }}
        reload={vi.fn()}
        loading={false}
        error={null}
      />,
    );

    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('10030')).toBeInTheDocument();
    expect(screen.getByText('0.00479936')).toBeInTheDocument();
    expect(screen.queryByText(/Der er endnu ikke registreret runtime-hændelser/)).not.toBeInTheDocument();
  });
});
