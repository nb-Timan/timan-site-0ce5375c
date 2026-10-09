import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import AcademyCrmGuidance from '@/components/academy/AcademyCrmGuidance';

describe('Academy CRM Case 1 guidance', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('shows the guidance beneath both existing completion requirements', () => {
    render(<MemoryRouter><AcademyCrmGuidance part={1} /></MemoryRouter>);

    expect(screen.getByText('Forfaldent lead opdateret')).toBeInTheDocument();
    expect(screen.getByText(/Åbn det røde lead, hvor datoen for næste opfølgning er overskredet/)).toBeInTheDocument();
    expect(screen.getByText('Configurator-lead færdigoprettet')).toBeInTheDocument();
    expect(screen.getByText(/Åbn leadet og udfyld de manglende oplysninger/)).toBeInTheDocument();
  });
});
