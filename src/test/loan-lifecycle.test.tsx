import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { isLoanClosed, loanMatchesOverviewFilter, type LoanStatus } from '@/lib/loanDomain';
import LoanCancelDialog from '@/pages/loans/LoanCancelDialog';
import { t } from '@/lib/i18n/translations';

const cancel = vi.hoisted(() => vi.fn());
vi.mock('@/lib/loanService', () => ({ cancelLoanDraft: cancel }));
const target = { id: 'qa-case', loan_number: 'U-6605', updated_at: '2026-10-09T08:00:00Z' };
const label = (key: string) => t(key, 'da');
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

describe('canonical loan lifecycle filtering', () => {
  it.each<LoanStatus>(['DRAFT', 'READY_FOR_REVIEW', 'AWAITING_ACCEPTANCE', 'ACCEPTED', 'ON_LOAN', 'RETURN_INSPECTION'])('%s remains active, including partial receipts', (status) => {
    expect(isLoanClosed(status)).toBe(false);
    expect(loanMatchesOverviewFilter(status, 'active')).toBe(true);
    expect(loanMatchesOverviewFilter(status, 'closed')).toBe(false);
    expect(loanMatchesOverviewFilter(status, 'all')).toBe(true);
  });
  it.each<LoanStatus>(['CLOSED_OK', 'CLOSED_WITH_DEVIATION', 'CANCELLED'])('%s remains in closed/all history', (status) => {
    expect(isLoanClosed(status)).toBe(true);
    expect(loanMatchesOverviewFilter(status, 'active')).toBe(false);
    expect(loanMatchesOverviewFilter(status, 'closed')).toBe(true);
    expect(loanMatchesOverviewFilter(status, 'all')).toBe(true);
  });
});

describe('explicit Backend cancellation confirmation', () => {
  it('requires a reason, preserves version/idempotency input and reloads after success', async () => {
    const onCancelled = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<LoanCancelDialog target={target} label={label} onClose={onClose} onCancelled={onCancelled} />);
    expect(screen.getByRole('heading', { name: 'Slet udlån U-6605?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Slet' }));
    expect(cancel).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Årsag til sletning' }), { target: { value: '  Fejloprettet sag  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Slet' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(cancel).toHaveBeenCalledWith(target.id, target.updated_at, 'Fejloprettet sag', expect.any(String));
    expect(onCancelled).toHaveBeenCalledOnce();
  });
  it('retries an uncertain result with exactly the same request key, never changed input', async () => {
    cancel.mockRejectedValueOnce(new Error('Temporary network failure')).mockResolvedValueOnce('qa-case');
    const onClose = vi.fn();
    render(<LoanCancelDialog target={target} label={label} onClose={onClose} onCancelled={vi.fn().mockResolvedValue(undefined)} />);
    const reason = screen.getByRole('textbox');
    fireEvent.change(reason, { target: { value: 'QA mistake' } });
    fireEvent.click(screen.getByRole('button', { name: 'Slet' }));
    await screen.findByText('Temporary network failure');
    const first = cancel.mock.calls[0];
    fireEvent.change(reason, { target: { value: 'Different reason' } });
    fireEvent.click(screen.getByRole('button', { name: 'Slet' }));
    expect(cancel).toHaveBeenCalledOnce();
    fireEvent.change(reason, { target: { value: 'QA mistake' } });
    fireEvent.click(screen.getByRole('button', { name: 'Slet' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(cancel.mock.calls[1]).toEqual(first);
  });
});
