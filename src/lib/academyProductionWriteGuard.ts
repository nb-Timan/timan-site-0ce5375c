import { academySandbox } from '@/lib/academySandbox';

/** Last line of defence if an Academy data adapter misses a production caller. */
export const academyProtectedFetch: typeof fetch = (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const method = (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
  if (academySandbox.isActive() && !['GET', 'HEAD', 'OPTIONS'].includes(method)
    && /^\/(rest|storage|functions)\/v1(?:\/|$)/.test(url.pathname)) {
    return Promise.reject(new Error('Academy: production writes and RPC calls are blocked. Use the local data adapter.'));
  }
  return fetch(input, init);
};
