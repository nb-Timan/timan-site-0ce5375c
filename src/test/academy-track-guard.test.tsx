import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AcademyTrackGuard from '@/components/academy/AcademyTrackGuard';
import { getLocalAcademyUser } from '@/lib/academyCurriculum';

const state = vi.hoisted(() => ({ user: null as ReturnType<typeof getLocalAcademyUser> | null, resolving: false }));
vi.mock('@/context/AppUserContext', () => ({ useAppUser: () => ({ appUser: state.user, loading: false }) }));
vi.mock('@/lib/viewAsUser', () => ({ useEffectivePortalUserState: () => ({ effectiveUser: state.user, resolving: state.resolving }) }));
vi.mock('@/lib/academySandbox', () => ({ academySandbox: { isActive: () => false, getActiveCase: () => null, leaveSession: vi.fn() } }));

function open(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AcademyTrackGuard><Routes>
    <Route path="/configurator" element={<p>Sales training</p>} />
    <Route path="/academy" element={<p>Academy home</p>} />
    <Route path="/portal" element={<p>Normal portal</p>} />
  </Routes></AcademyTrackGuard></MemoryRouter>);
}

beforeEach(() => {
  state.user = { ...getLocalAcademyUser(), permissions: { academy_track_sales: false, academy_track_service: true } };
  state.resolving = false;
});
afterEach(cleanup);

describe('Academy track route protection', () => {
  it('redirects direct Sales training requests for Service-only users', () => {
    open('/configurator?academy_mode=true&track=basic');
    expect(screen.queryByText('Sales training')).toBeNull();
    expect(screen.getByText('Academy home')).toBeTruthy();
  });
  it('allows assigned Sales training', () => {
    state.user!.permissions = { academy_track_sales: true };
    open('/configurator?academy_mode=true');
    expect(screen.getByText('Sales training')).toBeTruthy();
  });
  it('blocks the entire Academy when the area is off', () => {
    state.user!.allowed_modules = [];
    open('/academy');
    expect(screen.getByText('Normal portal')).toBeTruthy();
  });
  it('waits for the effective View-as user before mounting training', () => {
    state.resolving = true;
    open('/configurator?academy_mode=true');
    expect(screen.queryByText('Sales training')).toBeNull();
  });
  it('does not change production route permissions outside training', () => {
    open('/configurator');
    expect(screen.getByText('Sales training')).toBeTruthy();
  });
});
