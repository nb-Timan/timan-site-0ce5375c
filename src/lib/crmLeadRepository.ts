import {
  createDemoLead, createLead, getLead, listLeadsPage, type CrmDemoLead,
  type CrmLead, type CrmLeadPatch, type CrmLeadsPageQueryResult, type ListLeadsPageOpts,
  type NewCrmDemoLead, type NewCrmLead, type UpdateLeadOptions, updateLead,
} from '@/lib/crmLeadsService';
import {
  getResponsibleTimanSellerTarget, listActiveDealerLeadShareTargets, listLeadShares,
  resolveAppUserByEmail, shareLead, type CrmLeadShare, type LeadShareTarget,
} from '@/lib/crmLeadSharingService';
import { academyCrmSandbox } from '@/lib/academyCrmSandbox';

export interface CrmLeadRepository {
  academy: boolean;
  listLeadsPage: (options: ListLeadsPageOpts) => Promise<CrmLeadsPageQueryResult>;
  getLead: (id: string) => Promise<CrmLead | null>;
  createLead: (input: NewCrmLead, options?: { requireRemote?: boolean }) => Promise<CrmLead>;
  updateLead: (id: string, patch: CrmLeadPatch, options?: UpdateLeadOptions) => Promise<CrmLead>;
  createDemoLead: (input: NewCrmDemoLead) => Promise<CrmDemoLead>;
  resolveAppUserByEmail: (email: string | null | undefined) => Promise<LeadShareTarget | null>;
  listLeadShares: (leadId: string) => Promise<CrmLeadShare[]>;
  listActiveDealerLeadShareTargets: (dealerId: string) => Promise<LeadShareTarget[]>;
  getResponsibleTimanSellerTarget: (dealerId: string) => Promise<LeadShareTarget | null>;
  shareLead: (input: Parameters<typeof shareLead>[0]) => Promise<CrmLeadShare>;
}

const productionRepository: CrmLeadRepository = {
  academy: false, listLeadsPage, getLead, createLead, updateLead, createDemoLead,
  resolveAppUserByEmail, listLeadShares, listActiveDealerLeadShareTargets,
  getResponsibleTimanSellerTarget, shareLead,
};

const academyRepository: CrmLeadRepository = {
  academy: true,
  listLeadsPage: async (options) => academyCrmSandbox.listLeadsPage(options),
  getLead: async (id) => academyCrmSandbox.getCrmLead(id),
  createLead: async (input) => academyCrmSandbox.createCrmLead(input),
  updateLead: async (id, patch) => academyCrmSandbox.updateCrmLead(id, patch),
  createDemoLead: async (input) => academyCrmSandbox.createCrmDemoLead(input),
  resolveAppUserByEmail: async () => academyCrmSandbox.getAcademyActor(),
  listLeadShares: async (leadId) => academyCrmSandbox.listShares(leadId),
  listActiveDealerLeadShareTargets: async () => [academyCrmSandbox.getAcademyPartner()],
  getResponsibleTimanSellerTarget: async () => academyCrmSandbox.getAcademyPartner(),
  shareLead: async (input) => academyCrmSandbox.shareCrmLead(input),
};

export function getCrmLeadRepository(): CrmLeadRepository {
  return academyCrmSandbox.isActive() ? academyRepository : productionRepository;
}
