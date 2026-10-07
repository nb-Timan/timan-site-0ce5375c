import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import PortalStartupBoundary from '@/components/PortalStartupBoundary';

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { signOut: vi.fn().mockResolvedValue({ error: null }) } },
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function BrokenRoute(): never {
  throw new Error('render failed');
}

describe('PortalStartupBoundary', () => {
  it('replaces an unrecoverable render exception with the controlled Timan fallback', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<PortalStartupBoundary><BrokenRoute /></PortalStartupBoundary>);

    expect(screen.getByRole('heading', { name: 'Portalen kunne ikke indlæses' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Prøv igen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log ind igen' })).toBeInTheDocument();
    expect(screen.getByText(/build/i)).toBeInTheDocument();
  });
});
