import { isDealerInactive, type DealerAccount } from './dealerAccountsService';

export function isActivePartnerMapAccount(account: Pick<DealerAccount, 'is_deleted' | 'is_blocked' | 'is_active' | 'status'>): boolean {
  return !isDealerInactive(account) && account.is_active !== false
    && (account.status == null || account.status === 'active');
}

export function partnerMapCoordinates(account: Pick<DealerAccount, 'latitude' | 'longitude'>): [number, number] | null {
  const { latitude, longitude } = account;
  return latitude != null && longitude != null && Number.isFinite(latitude) && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? [latitude, longitude] : null;
}
