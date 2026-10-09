import type { SupportPageContext } from '@/lib/supportTypes';

export function deriveSupportPageContext(pathname: string, search = ''): SupportPageContext {
  const params = new URLSearchParams(search);
  const machineMatch = pathname.match(/\/portal\/service\/machines\/([^/]+)/);
  const productMatch = pathname.match(/\/(?:product|products)\/([^/]+)/);
  return {
    route: pathname,
    machineId: params.get('machineId') || machineMatch?.[1] || undefined,
    productId: params.get('productId') || productMatch?.[1] || undefined,
  };
}
