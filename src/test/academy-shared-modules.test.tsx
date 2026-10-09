import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { academySandbox } from '@/lib/academySandbox';
import { getAcademyVideoFallback, readAcademyVideoPreferences, saveAcademyVideoPreferences } from '@/lib/academyVideoData';
import { DEFAULT_VIDEO_FILTERS } from '@/lib/videoLibraryFilters';
import { useConfigurator } from '@/hooks/useConfigurator';
import { academyCrmSandbox } from '@/lib/academyCrmSandbox';
import { academyProtectedFetch } from '@/lib/academyProductionWriteGuard';

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  window.history.replaceState({}, '', '/configurator?academy_mode=true');
});

describe('same module, local Academy persistence', () => {
  it('restores the real Configurator state on remount without touching a normal configuration', () => {
    const first = renderHook(() => useConfigurator());
    act(() => first.result.current.setMachineQty('RC-1000S', 2));
    act(() => first.result.current.setStep(3));
    act(() => first.result.current.setDate('2099-01-20'));
    const saved = first.result.current.state;
    first.unmount();
    const reopened = renderHook(() => useConfigurator());
    expect(reopened.result.current.state).toEqual(saved);
    reopened.unmount();
    academySandbox.leaveSession();
    window.history.replaceState({}, '', '/configurator');
    const normal = renderHook(() => useConfigurator());
    expect(normal.result.current.state.machineConfigs).toEqual([]);
    expect(JSON.parse(localStorage.getItem('timan.academy.configurator.v1')!)).toEqual(saved);
    normal.unmount();
  });

  it('keeps Academy video preferences local while the gallery uses the published library', () => {
    const filters = { ...DEFAULT_VIDEO_FILTERS, machineFilter: 'TIMAN_3330', typeFilter: 'maintenance' as const };
    saveAcademyVideoPreferences({ filters, favorites: ['published-video-id'] });
    expect(readAcademyVideoPreferences()).toEqual({ filters, favorites: ['published-video-id'] });
    academySandbox.leaveSession();
    window.history.replaceState({}, '', '/portal/videos');
    saveAcademyVideoPreferences({ favorites: [] });
    expect(readAcademyVideoPreferences().favorites).toEqual(['published-video-id']);
  });

  it('provides only the local canonical Case 2 video when an unauthenticated Academy preview cannot read the public library', () => {
    const videos = getAcademyVideoFallback();
    expect(videos).toHaveLength(1);
    expect(videos[0]).toMatchObject({
      youtube_video_id: 'sxYALA86PaI',
      content_type: 'maintenance',
      status: 'published',
      products: [{ machine_key: 'Timan 3330' }],
    });
  });

  it('persists full canonical lead fields and idempotent demo records, not completion flags alone', () => {
    const lead = academyCrmSandbox.updateCrmLead('academy-demo-lead', {
      title: 'Academy revised', contact_information: 'Telefon: 00000000', notes: 'Local only',
      next_activity: 'Customer requests a demonstration', next_followup_date: '2099-01-01',
    });
    expect(academyCrmSandbox.getCrmLead(lead.id)).toMatchObject({ title: 'Academy revised', contact_information: 'Telefon: 00000000', notes: 'Local only' });
    academyCrmSandbox.convertToDemo(lead.id);
    expect(academyCrmSandbox.getProgress().demoConverted).toBe(false);
    const input = { source_lead_id: lead.id, title: 'Local demo', demo_equipment: ['410910'] };
    const demo = academyCrmSandbox.createCrmDemoLead(input as never);
    expect(academyCrmSandbox.createCrmDemoLead(input as never).id).toBe(demo.id);
    expect(academyCrmSandbox.getState().demos).toEqual([demo]);
    expect(demo.demo_equipment).toEqual(['410910']);
    expect(academyCrmSandbox.getProgress().demoConverted).toBe(true);
  });

  it.each(['POST', 'PATCH', 'PUT', 'DELETE'])('blocks %s even after navigation drops the Academy query', async (method) => {
    academySandbox.enterSession();
    window.history.replaceState({}, '', '/portal/dealer-data');
    const network = vi.spyOn(globalThis, 'fetch');
    await expect(academyProtectedFetch(new Request('https://example.supabase.co/rest/v1/dealer_accounts', { method }))).rejects.toThrow('production writes');
    expect(network).not.toHaveBeenCalled();
    network.mockRestore();
    academySandbox.leaveSession();
    expect(academyCrmSandbox.isActive()).toBe(false);
  });
});
