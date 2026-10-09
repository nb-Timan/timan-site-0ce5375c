import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import AcademyGuidancePanel from '@/components/academy/AcademyGuidancePanel';

describe('Academy Case 1 point labels', () => {
  it('maps the existing completion steps to point numbers without changing shared defaults', () => {
    render(
      <MemoryRouter>
        <AcademyGuidancePanel
          title="Case 1"
          description="Test"
          steps={['RC-1000s', 'RC-751', 'Equipment', 'WB-170', 'Lead', 'Quote'].map((title) => ({
            title,
            tasks: [{ label: title, complete: false }],
          }))}
          stepNumbers={['1.1', '1.2', '2.1', '2.2', '3', '4']}
          stepLabelKey="academyPoint"
          nextLabelKey="academyNextPoint"
          next="Gem sagen som Academy-lead."
        />
      </MemoryRouter>,
    );

    for (const point of ['1.1', '1.2', '2.1', '2.2', '3', '4']) {
      expect(screen.getByText(new RegExp(`^Punkt ${point.replace('.', '\\.')}:`))).toBeInTheDocument();
    }
    expect(screen.getByText('Næste punkt: Gem sagen som Academy-lead.')).toBeInTheDocument();
    expect(screen.queryByText(/^Trin 1:/)).not.toBeInTheDocument();
  });

  it('keeps the default shared guidance terminology for other Academy cases', () => {
    render(
      <MemoryRouter>
        <AcademyGuidancePanel
          title="Case 2"
          description="Test"
          steps={[{ title: 'Video', tasks: [{ label: 'Video', complete: false }] }]}
          next="Åbn videoen."
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Trin 1: Video')).toBeInTheDocument();
    expect(screen.getByText('Næste trin: Åbn videoen.')).toBeInTheDocument();
  });
});
