import { updateDealerAccount } from '@/lib/dealerAccountsService';
import { listDealerContacts, upsertDealerContact, deleteDealerContact } from '@/lib/dealerContactsService';
import { fetchActiveDealerContractPaymentTerm, fetchPartnerAgreementHistory, createPartnerAgreementHistoryEvent, fetchPartnerAgreementHistoryDocumentUrl } from '@/lib/dealerContractsService';
import { listPartnerDataDealers } from '@/lib/partnerDataScope';
import { academyPartnerDataSandbox } from '@/lib/academyPartnerDataSandbox';

const live = { listPartnerDataDealers, updateDealerAccount, listDealerContacts, upsertDealerContact, deleteDealerContact, fetchActiveDealerContractPaymentTerm, fetchPartnerAgreementHistory, createPartnerAgreementHistoryEvent, fetchPartnerAgreementHistoryDocumentUrl };
type PartnerDataRepository = typeof live;
// Same pages and field model, different persistence; no replacement workspace.
const local: PartnerDataRepository = {
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
