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

  it('uses two columns at desktop breakpoints when requested', () => {
    const { container } = render(<MemoryRouter><AcademyGuidancePanel
      title="Testforløb"
      description="Test"
      stepColumns={2}
      steps={[
        { title: 'Første trin', tasks: [{ label: 'Første krav', complete: false }] },
        { title: 'Andet trin', tasks: [{ label: 'Andet krav', complete: false }] },
      ]}
      next="Første trin"
    /></MemoryRouter>);

    expect(container.querySelector('ol')).toHaveClass('md:grid-cols-2');
  });

  it('uses three compact cards at desktop breakpoints when requested', () => {
    const { container } = render(<MemoryRouter><AcademyGuidancePanel
      title="Testforløb"
      description="Test"
      stepColumns={3}
      stepLabelKey="academyPoint"
      nextLabelKey="academyNextPoint"
      steps={[
        { title: 'Punkt A', tasks: [{ label: 'Krav A', complete: false }] },
        { title: 'Punkt B', tasks: [{ label: 'Krav B', complete: false }] },
        { title: 'Punkt C', tasks: [{ label: 'Krav C', complete: false }] },
      ]}
      next="Punkt 1: Punkt A."
    /></MemoryRouter>);

    expect(container.querySelector('ol')).toHaveClass('lg:grid-cols-3');
    expect(screen.getByText('Punkt 1: Punkt A')).toBeInTheDocument();
    expect(screen.getByText('Næste punkt: Punkt 1: Punkt A.')).toBeInTheDocument();
  });
});
