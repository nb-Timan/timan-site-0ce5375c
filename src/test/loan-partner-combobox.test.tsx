import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import LoanPartnerCombobox from '@/pages/loans/LoanPartnerCombobox';
import type { LoanPartner } from '@/lib/loanService';

const partners: LoanPartner[] = [
  { id: 'a', account_number: '10295', company_name: 'AB Lauridsen Maskiner ApS', customer_type: null },
  { id: 'b', account_number: '20411', company_name: 'Integra Group', customer_type: null },
  { id: 'c', account_number: '20412', company_name: 'Integra Danmark', customer_type: null },
  { id: 'd', account_number: '30500', company_name: 'Ærø Ågård Øst', customer_type: null },
];
const changed = vi.fn();
function Picker({ disabled = false }: { disabled?: boolean }) {
  const [value, setValue] = useState('');
  return <LoanPartnerCombobox partners={partners} value={value} onChange={(id) => { changed(id); setValue(id); }} label="Samarbejdspartner" placeholder="Vælg samarbejdspartner" disabled={disabled} />;
}
const trigger = () => screen.getByRole('combobox', { name: 'Samarbejdspartner' });
const search = () => screen.getByPlaceholderText('Søg forhandler eller kontonummer...');
beforeEach(() => {
  changed.mockReset();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Loans partner combobox using the existing portal/command primitives', () => {
  it('starts empty, portals out of a clipping parent, and autofocuses search without changing the value', async () => {
    const mounted = render(<div style={{ overflow: 'hidden', position: 'relative', height: 40 }}><Picker /></div>);
    expect(trigger()).toHaveTextContent('Vælg samarbejdspartner');
    fireEvent.click(trigger());
    expect(mounted.container).not.toContainElement(screen.getByRole('dialog'));
    expect(document.body).toContainElement(screen.getByRole('dialog'));
    expect(document.getElementById(trigger().getAttribute('aria-controls')!)).toBe(screen.getByRole('dialog'));
    expect(document.getElementById(search().getAttribute('aria-controls')!)).toBe(screen.getByRole('listbox'));
    await waitFor(() => expect(search()).toHaveFocus());
    expect(screen.getAllByRole('option')).toHaveLength(4);
    expect(changed).not.toHaveBeenCalled();
  });

  it.each([
    ['iNtEgRa', ['20411 · Integra Group', '20412 · Integra Danmark']],
    ['10295', ['10295 · AB Lauridsen Maskiner ApS']],
    ['lauridsen', ['10295 · AB Lauridsen Maskiner ApS']],
    ['æRØ a\u030Agård øST', ['30500 · Ærø Ågård Øst']],
  ])('searches names/account numbers with Danish Unicode: %s', async (query, expected) => {
    render(<Picker />); fireEvent.click(trigger());
    fireEvent.change(search(), { target: { value: query } });
    await waitFor(() => expect(screen.getAllByRole('option').map((entry) => entry.textContent)).toEqual(expected));
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(changed).not.toHaveBeenCalled();
  });

  it('shows an empty result without closing or changing the selected partner, then resets search on reopen', async () => {
    render(<Picker />); fireEvent.click(trigger());
    fireEvent.change(search(), { target: { value: '10295' } });
    fireEvent.click(await screen.findByRole('option', { name: '10295 · AB Lauridsen Maskiner ApS' }));
    await waitFor(() => expect(trigger()).toHaveTextContent('10295 · AB Lauridsen Maskiner ApS'));
    fireEvent.click(trigger());
    fireEvent.change(search(), { target: { value: 'does not exist' } });
    expect(await screen.findByText('Ingen samarbejdspartnere fundet')).toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(changed).toHaveBeenCalledTimes(1);
    expect(trigger()).toHaveTextContent('AB Lauridsen');
    fireEvent.keyDown(search(), { key: 'Escape' });
    await waitFor(() => expect(trigger()).toHaveAttribute('aria-expanded', 'false'));
    fireEvent.click(trigger());
    expect(search()).toHaveValue('');
    expect(screen.getAllByRole('option')).toHaveLength(4);
  });

  it('supports arrows and Enter without submitting a surrounding form, and restores trigger focus', async () => {
    const submit = vi.fn((event) => event.preventDefault());
    render(<form onSubmit={submit}><Picker /><button type="submit">Gem</button></form>);
    fireEvent.click(trigger());
    await waitFor(() => expect(screen.getByRole('option', { name: '10295 · AB Lauridsen Maskiner ApS' })).toHaveAttribute('aria-selected', 'true'));
    fireEvent.keyDown(search(), { key: 'ArrowDown' });
    await waitFor(() => expect(screen.getByRole('option', { name: '20411 · Integra Group' })).toHaveAttribute('aria-selected', 'true'));
    fireEvent.keyDown(search(), { key: 'Enter' });
    await waitFor(() => expect(changed).toHaveBeenCalledWith('b'));
    expect(submit).not.toHaveBeenCalled();
    await waitFor(() => expect(trigger()).toHaveFocus());
  });

  it('does not open when disabled and closes a previously open popup when disabled', async () => {
    const mounted = render(<Picker disabled />);
    expect(trigger()).toBeDisabled(); fireEvent.click(trigger());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    mounted.rerender(<Picker />); fireEvent.click(trigger());
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    mounted.rerender(<Picker disabled />);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('filters only supplied canonical scoped partners; search never fetches additional accounts', async () => {
    render(<LoanPartnerCombobox partners={[partners[1]]} value="" onChange={changed} label="Samarbejdspartner" placeholder="Vælg samarbejdspartner" />);
    fireEvent.click(trigger()); fireEvent.change(search(), { target: { value: '10295' } });
    expect(await screen.findByText('Ingen samarbejdspartnere fundet')).toBeInTheDocument();
    expect(changed).not.toHaveBeenCalled();
  });
});
