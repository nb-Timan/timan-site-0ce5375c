import { useSyncExternalStore } from 'react';
import { productMasterRevision, subscribeProductMaster } from '@/lib/publishedProductMaster';

export function useProductMasterRevision() {
  return useSyncExternalStore(subscribeProductMaster, productMasterRevision, productMasterRevision);
}
