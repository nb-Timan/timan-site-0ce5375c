import { updateDealerAccount } from '@/lib/dealerAccountsService';
import { listDealerContacts, upsertDealerContact, deleteDealerContact, archiveLegacyDealerContact, listRemovedDealerContactAreas } from '@/lib/dealerContactsService';
import { fetchActiveDealerContractPaymentTerm, fetchPartnerAgreementHistory, createPartnerAgreementHistoryEvent, fetchPartnerAgreementHistoryDocumentUrl } from '@/lib/dealerContractsService';
import { listPartnerDataDealers } from '@/lib/partnerDataScope';
import { academyPartnerDataSandbox } from '@/lib/academyPartnerDataSandbox';

const live = { archiveLegacyDealerContact, listRemovedDealerContactAreas, listPartnerDataDealers, updateDealerAccount, listDealerContacts, upsertDealerContact, deleteDealerContact, fetchActiveDealerContractPaymentTerm, fetchPartnerAgreementHistory, createPartnerAgreementHistoryEvent, fetchPartnerAgreementHistoryDocumentUrl };
type PartnerDataRepository = typeof live;
// Same pages and field model, different persistence; no replacement workspace.
const local: PartnerDataRepository = {
  archiveLegacyDealerContact: async (id, area) => {
    // Academy has disposable local practice data, never production contact history.
    if (!['director', 'finance', 'sales', 'workshop', 'marketing'].includes(area)) return { ok: false, error: 'Unknown legacy contact area.' };
    const patch = area === 'director' ? { director_name: null } : {
      [`${area}_contact_name`]: null, [`${area}_contact_email`]: null, [`${area}_contact_phone`]: null,
    };
    return academyPartnerDataSandbox.updateDealerAccount(id, patch);
  },
  listRemovedDealerContactAreas: async () => [],
  listPartnerDataDealers: async () => ({ rows: academyPartnerDataSandbox.listDealers(), source: 'seller' }),
  updateDealerAccount: academyPartnerDataSandbox.updateDealerAccount,
  listDealerContacts: async (id) => academyPartnerDataSandbox.listContacts(id),
  upsertDealerContact: academyPartnerDataSandbox.upsertDealerContact,
  deleteDealerContact: academyPartnerDataSandbox.deleteDealerContact,
  fetchActiveDealerContractPaymentTerm: async () => ({ paymentTerm: null, error: null }),
  fetchPartnerAgreementHistory: async (number) => ({ rows: academyPartnerDataSandbox.history(number), error: null }),
  createPartnerAgreementHistoryEvent: academyPartnerDataSandbox.createHistoryEvent,
  fetchPartnerAgreementHistoryDocumentUrl: async () => null,
};
export function getPartnerDataRepository(): PartnerDataRepository {
  return academyPartnerDataSandbox.isActive() ? local : live;
}
