import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ASSIGNABLE_TIMAN_SELLER_ROLES,
  resolveDealerAssignableTimanSeller,
  type SellerDirectoryEntry,
} from '@/lib/sellerDirectory';

const source = readFileSync('src/pages/messe/MesseFollowUpPage.tsx', 'utf8');
const migration = readFileSync(
  'supabase/migrations/20260915092124_messe_assignable_timan_sellers.sql',
  'utf8',
);

const sellers: SellerDirectoryEntry[] = [
  { id: 'akr-id', email: 'akr@timan.dk', initials: 'AKR', full_name: 'Alexander Kirschner', portal_role: 'timan_seller', company: 'Timan', phone: null },
  { id: 'bp-id', email: 'bp@timan.dk', initials: 'BP', full_name: 'Birger Pedersen', portal_role: 'timan_backend', company: 'Timan', phone: null },
  { id: 'dealer-id', email: 'dealer@example.com', initials: 'DLR', full_name: 'External Dealer', portal_role: 'timan_dealer', company: 'Dealer', phone: null },
];

describe('Messe follow-up Timan seller selection', () => {
  it('uses the canonical CRM seller roles and excludes external users', () => {
    expect(ASSIGNABLE_TIMAN_SELLER_ROLES).toEqual(['timan_seller', 'timan_backend']);
    expect(migration).toContain("seller.portal_role::text in ('timan_seller', 'timan_backend')");
    expect(migration).toContain('seller.is_active = true');
    expect(migration).toContain('seller.approved = true');
    expect(migration).toContain('revoke all on function public.list_messe_assignable_timan_sellers() from public, anon;');
  });

  it('resolves the dealer account owner by canonical id before legacy display fields', () => {
    expect(resolveDealerAssignableTimanSeller({
      assigned_seller_id: 'akr-id',
      assigned_seller_email: 'bp@timan.dk',
    }, sellers)).toMatchObject({ initials: 'AKR', email: 'akr@timan.dk' });
    expect(resolveDealerAssignableTimanSeller({ assigned_seller_email: 'bp@timan.dk' }, sellers)).toMatchObject({ initials: 'BP' });
    expect(resolveDealerAssignableTimanSeller({ assigned_seller_initials: 'DLR' }, sellers)).toBeNull();
  });

  it('keeps a manual seller choice while auto-resolving an unmodified dealer choice', () => {
    expect(source).toContain("const [sellerSelectionMode, setSellerSelectionMode] = useState<SellerSelectionMode>('initial');");
    expect(source).toContain("if (sellerSelectionMode === 'manual') return;");
    expect(source).toContain('resolveDealerAssignableTimanSeller(selectedDealer, sellerOptions)');
    expect(source).toContain("setSellerSelectionMode('manual');");
  });

  it('uses the selected canonical seller for both the CRM owner and mail recipient', () => {
    expect(source).toContain('const ownerId = responsibleSeller.id;');
    expect(source).toContain('owner_user_id: ownerId,');
    expect(source).toContain('owner_email: responsibleSeller.email,');
    expect(source).toContain('buildMesseLeadMailRecipients(responsibleSeller.email, email)');
    expect(source).toContain("<option value=\"\">{f('chooseResponsible')}</option>");
  });
});
