import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import AcademyGuidancePanel from '@/components/academy/AcademyGuidancePanel';

describe('Academy numbered work steps', () => {
  it('groups related requirements and highlights the first incomplete step', () => {
    render(<MemoryRouter><AcademyGuidancePanel
      title="Testforløb"
      description="Test"
      steps={[
        { title: 'Vælg maskine', tasks: [{ label: 'Maskine valgt', complete: true }] },
        { title: 'Tilføj redskaber', tasks: [
          { label: 'Første redskab valgt', complete: false },
          { label: 'Andet redskab valgt', complete: false },
        ] },
      ]}
      next="Trin 2: Tilføj redskaber."
    /></MemoryRouter>);

    expect(screen.getByText('Trin 1: Vælg maskine')).toBeInTheDocument();
    expect(screen.getByText('Trin 2: Tilføj redskaber')).toBeInTheDocument();
    expect(screen.getByText('Maskine valgt')).toBeInTheDocument();
    expect(screen.getByText('Første redskab valgt')).toBeInTheDocument();
    expect(screen.getByText('Næste trin: Trin 2: Tilføj redskaber.')).toBeInTheDocument();
  });
});
