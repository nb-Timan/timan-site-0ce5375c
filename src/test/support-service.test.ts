import { afterEach, describe, expect, it, vi } from 'vitest';
import { MockSupportService } from '@/lib/supportService';
import { PORTAL_LANGUAGE_CODES } from '@/lib/portalLanguages';
import { t } from '@/lib/i18n/translations';
import { SUPPORT_TRANSLATIONS } from '@/lib/i18n/supportTranslations';
import type { SupportSendRequest } from '@/lib/supportService';

function request(content: string, language: SupportSendRequest['language'] = 'da'): SupportSendRequest {
  const context = { route: '/portal' };
  return {
    content,
    language,
    context,
    intent: undefined,
    workflowState: {},
    conversation: {
      id: 'conversation-1',
      messages: [],
      context,
      workflowState: {},
    },
  };
}

describe('Timan Support mock service', () => {
  afterEach(() => vi.useRealTimers());

  it('returns deterministic mock responses for the three supported topics and a fallback', async () => {
    const service = new MockSupportService(0);
    await expect(service.sendMessage(request('Fortæl om 3330'))).resolves.toMatchObject({
      role: 'assistant', content: t('supportMock3330', 'da'), status: 'sent',
    });
    await expect(service.sendMessage(request('Hjælp i portalen'))).resolves.toMatchObject({
      content: t('supportMockPortal', 'da'),
    });
    await expect(service.sendMessage(request('Hvad findes på Timan.dk?'))).resolves.toMatchObject({
      content: t('supportMockTimanWebsite', 'da'),
    });
    await expect(service.sendMessage(request('Noget andet'))).resolves.toMatchObject({
      content: t('supportMockGeneric', 'da'),
    });
  });

  it('exposes a deterministic error path for retry UX without making a network call', async () => {
    const service = new MockSupportService(0);
    await expect(service.sendMessage(request('__mock_error__'))).rejects.toThrow('mock-support-error');
  });

  it('provides complete Support UI copy in all nine portal languages', () => {
    const keys = [
      'supportTitle', 'supportBackendOnly', 'supportWelcome', 'supportPlaceholder',
      'supportQuickMachineInfo', 'supportQuickPortalHelp', 'supportQuickTimanWebsite',
      'supportLauncherLabel', 'supportCloseLabel', 'supportSendLabel', 'supportSending',
      'supportError', 'supportRetry', 'supportMock3330', 'supportMockPortal',
      'supportMockTimanWebsite', 'supportMockGeneric', 'supportSourcesLabel',
    ];
    for (const language of PORTAL_LANGUAGE_CODES) {
      for (const key of keys) expect(t(key, language)).not.toBe(key);
      expect(t('supportBackendOnly', language)).toBe(SUPPORT_TRANSLATIONS[language].supportBackendOnly);
      expect(t('supportWelcome', language)).toBe(SUPPORT_TRANSLATIONS[language].supportWelcome);
      expect(t('supportRetry', language)).toBe(SUPPORT_TRANSLATIONS[language].supportRetry);
    }
  });
});
