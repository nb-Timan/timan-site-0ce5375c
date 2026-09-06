import { describe, expect, it } from "vitest";
import {
  getCrmConfigurationDeepLink,
  getCrmLinkedConfigurationKind,
  isSentForCrm,
  resolveCrmDocumentType,
  type CrmConfigurationRow,
} from "@/lib/crmConfigurationsService";

const baseRow: CrmConfigurationRow = {
  id: "925ae37c-2d1c-4435-8f6a-74b98011d68a",
  document_type: "quote",
  case_type: "quote",
  case_status: "aktiv",
  status: "aktiv",
  created_at: "2026-09-01T07:29:25.363Z",
  last_saved_at: null,
  title: "ÖGA2026 Lead — RC-1000S",
  quote_number: "T-4001",
  order_number: null,
  total_price: null,
  note: null,
  seller_initials: "AKR",
  seller_email: "akr@timan.dk",
  seller_name: "AKR Sælger",
  assigned_seller_id: null,
  dealer_number: "10570",
  dealer_name: "Ad. Bachmann AG",
  dealer_account_id: "42c89ab9-72cb-4def-bb94-78e910bc74f5",
  dealer_company_name: "Ad. Bachmann AG",
  dealer_account_number: "10570",
  dealer_country: "CH",
  created_by_email: "akr@timan.dk",
  created_by_user_id: null,
  created_by_role: null,
  active_mode: null,
  owner_status: null,
  lead_id: "72f270f4-cc62-422f-b67f-ad02c584c7fc",
  quote_sent_at: null,
  order_sent_at: null,
  submitted_at: null,
};

describe("CRM lead linked configurator records", () => {
  it("deep-links to the existing configurator detail route", () => {
    expect(getCrmConfigurationDeepLink(baseRow)).toBe(
      "/configurator?configId=925ae37c-2d1c-4435-8f6a-74b98011d68a",
    );
  });

  it("does not treat a saved configurator case as a sent quote from the T-number alone", () => {
    expect(getCrmLinkedConfigurationKind(baseRow)).toBe("configuration");
  });

  it("does not treat a legacy O-number as a submitted order by itself", () => {
    expect(getCrmLinkedConfigurationKind({
      ...baseRow,
      order_number: "O-7001",
      quote_sent_at: "2026-09-01T07:29:29.748Z",
      submitted_at: null,
      order_sent_at: null,
    })).toBe("quote");
  });

  it("does not treat an active order-flow draft as a submitted order", () => {
    expect(getCrmLinkedConfigurationKind({
      ...baseRow,
      document_type: "order",
      case_type: "order",
      order_number: "O-7001",
      quote_sent_at: "2026-09-01T07:29:29.748Z",
      submitted_at: null,
      order_sent_at: null,
    })).toBe("quote");
  });

  it("classifies quote and order states from canonical sent/submitted fields", () => {
    expect(getCrmLinkedConfigurationKind({
      ...baseRow,
      quote_sent_at: "2026-09-01T07:29:29.748Z",
    })).toBe("quote");

    expect(getCrmLinkedConfigurationKind({
      ...baseRow,
      order_sent_at: "2026-09-01T08:00:00.000Z",
      document_type: "order",
    })).toBe("order");
  });

  it("moves timestamp-submitted rows from active quotes to CRM orders", () => {
    const submittedLegacyQuote = {
      ...baseRow,
      quote_number: "T-4001",
      order_number: "O-7001",
      quote_sent_at: "2026-09-01T07:29:29.748Z",
      submitted_at: "2026-09-04T09:00:00.000Z",
      order_sent_at: null,
      document_type: "order" as const,
    };

    expect(isSentForCrm(submittedLegacyQuote, "quote")).toBe(false);
    expect(isSentForCrm(submittedLegacyQuote, "order")).toBe(true);
  });

  it("keeps an unsent legacy order-flow row in CRM quotes", () => {
    const legacyQuote = {
      ...baseRow,
      document_type: "order" as const,
      case_type: "order",
      quote_number: "T-4002",
      quote_sent_at: "2026-09-04T11:35:14.021Z",
      submitted_at: null,
      order_sent_at: null,
    };

    expect(resolveCrmDocumentType(legacyQuote)).toBe("quote");
    expect(isSentForCrm(legacyQuote, "quote")).toBe(true);
    expect(isSentForCrm(legacyQuote, "order")).toBe(false);
  });

  it("does not promote a stale submitted-looking status without timestamps", () => {
    const staleStatus = {
      ...baseRow,
      quote_number: "T-4002",
      quote_sent_at: "2026-09-04T11:35:14.021Z",
      case_status: "ordre_afgivet",
      status: "ordre_afgivet",
    };

    expect(resolveCrmDocumentType(staleStatus)).toBe("quote");
    expect(isSentForCrm(staleStatus, "quote")).toBe(true);
    expect(isSentForCrm(staleStatus, "order")).toBe(false);
  });
});
