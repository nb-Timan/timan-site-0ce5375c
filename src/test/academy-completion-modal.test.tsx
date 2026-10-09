import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import AcademyGuidancePanel from '@/components/academy/AcademyGuidancePanel';
import { academySandbox } from '@/lib/academySandbox';

const incompleteTasks = [
  { label: 'Første krav', complete: true },
  { label: 'Sidste krav', complete: false },
];

describe('Academy completion modal', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/academy');
  });

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

  it('returns a completed case to Academy without leaving the local Academy session', () => {
    academySandbox.enterSession();
    academySandbox.startCase1();
    const { rerender } = render(
      <MemoryRouter initialEntries={['/configurator?academy_mode=true']}>
        <AcademyGuidancePanel title="Case 1" description="Test" tasks={incompleteTasks} next="Sidste krav" completion caseId="sales.case_1_rc1000" />
      </MemoryRouter>,
    );

    rerender(
      <MemoryRouter initialEntries={['/configurator?academy_mode=true']}>
        <AcademyGuidancePanel title="Case 1" description="Test" tasks={incompleteTasks.map((task) => ({ ...task, complete: true }))} next="Sidste krav" completion caseId="sales.case_1_rc1000" />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tilbage til Min Academy' }));
    expect(academySandbox.isActive()).toBe(true);
    expect(academySandbox.getActiveCase()).toBeNull();
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
