import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppUser } from '@/context/AppUserContext';
import { derivePortalRole, hasAreaAccess, isInternalTimanPortalRole } from '@/lib/portalAccess';
import { getFabricLoanStock, refreshFabricLoanStock, setFabricLoanAssetBrikNumber, verifyFabricLoanAccess } from '@/lib/fabricLoanStockService';

export function useFabricLoanStock() {
  const { appUser } = useAppUser();
  const role = derivePortalRole(appUser);
  const enabled = isInternalTimanPortalRole(role) && hasAreaAccess(appUser, 'loans');
  const key = ['fabric-loan-stock', appUser?.id, role];
  const client = useQueryClient();
  const query = useQuery({ queryKey: key, queryFn: getFabricLoanStock, enabled,
    refetchInterval: enabled ? 10000 : false, staleTime: 5000, retry: false });
  const refresh = useMutation({ mutationFn: refreshFabricLoanStock,
    onSettled: () => client.invalidateQueries({ queryKey: key }) });
  const verify = useMutation({ mutationFn: verifyFabricLoanAccess });
  const setBrik = useMutation({
    mutationFn: ({ assetId, brikNumber }: { assetId: string; brikNumber: number | null }) =>
      setFabricLoanAssetBrikNumber(assetId, brikNumber),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });
  return { query, refresh, verify, setBrik, enabled, canRefresh: enabled && role === 'timan_backend',
    canEditBrik: enabled && role === 'timan_backend' };
}
