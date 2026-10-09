import { academySandbox } from '@/lib/academySandbox';

const ACADEMY_METADATA_RPC = new Set([
  'record_academy_cycle_completion',
  // Reads the caller's cycle and may activate an already scheduled recurrence.
  'get_my_academy_cycle',
]);

/** Last line of defence if an Academy data adapter misses a production caller. */
export const academyProtectedFetch: typeof fetch = (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const method = (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
  const isAcademyMetadataWrite = method === 'POST'
    && /^\/rest\/v1\/rpc\/([^/]+)$/.test(url.pathname)
    && ACADEMY_METADATA_RPC.has(url.pathname.split('/').pop() ?? '');
  if (academySandbox.isActive() && !isAcademyMetadataWrite && !['GET', 'HEAD', 'OPTIONS'].includes(method)
    && /^\/(rest|storage|functions)\/v1(?:\/|$)/.test(url.pathname)) {
    return Promise.reject(new Error('Academy: production writes and RPC calls are blocked. Use the local data adapter.'));
  }
  return fetch(input, init);
};
