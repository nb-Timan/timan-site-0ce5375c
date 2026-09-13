import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import AcademyGuidancePanel from '@/components/academy/AcademyGuidancePanel';

const incompleteTasks = [
  { label: 'Første krav', complete: true },
  { label: 'Sidste krav', complete: false },
];

describe('Academy completion modal', () => {
  it('opens only on a new completion transition and uses dynamic case metadata', () => {
    const { rerender } = render(
      <MemoryRouter>
        <AcademyGuidancePanel
          title="Case 2 - Find en vedligeholdelsesvideo"
          description="Test"
          tasks={incompleteTasks}
          next="Fuldfør sidste krav"
          completion={{ nextUnlock: 'CRM Case 2 - Del lead og opret demo' }}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <AcademyGuidancePanel
          title="Case 2 - Find en vedligeholdelsesvideo"
          description="Test"
          tasks={incompleteTasks.map((task) => ({ ...task, complete: true }))}
          next="Fuldfør sidste krav"
          completion={{ nextUnlock: 'CRM Case 2 - Del lead og opret demo' }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('dialog')).toHaveTextContent('Godt gået!');
    expect(screen.getByRole('dialog')).toHaveTextContent('Case 2 - Find en vedligeholdelsesvideo');
    expect(screen.getByRole('dialog')).toHaveTextContent('Alle 2 af 2 krav er opfyldt.');
    expect(screen.getByRole('dialog')).toHaveTextContent('CRM Case 2 - Del lead og opret demo');
    expect(screen.getByRole('link', { name: 'Tilbage til Min Academy' })).toHaveAttribute('href', '/academy');

    fireEvent.click(screen.getByRole('button', { name: 'Bliv her' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <AcademyGuidancePanel
          title="Case 2 - Find en vedligeholdelsesvideo"
          description="Test"
          tasks={incompleteTasks.map((task) => ({ ...task, complete: true }))}
          next="Fuldfør sidste krav"
          completion
        />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not replay for a case that was already complete on reopen', () => {
    render(
      <MemoryRouter>
        <AcademyGuidancePanel
          title="Portal Basics - 5 hurtige"
          description="Test"
          tasks={incompleteTasks.map((task) => ({ ...task, complete: true }))}
          next="Ingen"
          completion
        />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps partial guidance free of a completion modal', () => {
    const { rerender } = render(
      <MemoryRouter>
        <AcademyGuidancePanel
          title="Portal Basics - Partnerkort"
          description="Test"
          tasks={[{ label: 'Område/layer ændret', complete: false }]}
          next="Vælg et område"
        />
      </MemoryRouter>,
    );

    rerender(
      <MemoryRouter>
        <AcademyGuidancePanel
          title="Portal Basics - Partnerkort"
          description="Test"
          tasks={[{ label: 'Område/layer ændret', complete: true }]}
          next="Vælg et område"
        />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
