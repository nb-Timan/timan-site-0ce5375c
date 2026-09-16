import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260916164630_canonical_service_registration_history.sql"),
  "utf8",
);
const serviceClient = readFileSync(resolve(process.cwd(), "src/lib/serviceMaintenanceService.ts"), "utf8");
const servicePage = readFileSync(resolve(process.cwd(), "src/pages/ServiceMaintenancePage.tsx"), "utf8");
const machineLifecycle = readFileSync(resolve(process.cwd(), "src/lib/machineLifecycleService.ts"), "utf8");

describe("canonical Service Model C", () => {
  it("keeps warranty registrations as the machine source and creates no parallel machine registry", () => {
    expect(migration).toContain("machine_registration_id uuid references public.warranty_registrations(id)");
    expect(migration).toContain("from public.warranty_registrations wr");
    expect(migration).not.toMatch(/create\s+table[^;]*service_machines/i);
    expect(serviceClient).not.toContain(".from('service_machines')");
  });

  it("uses one scoped RPC for the final service event and its parts", () => {
    expect(migration).toContain("create or replace function public.create_scoped_service_registration(p_registration jsonb)");
    expect(migration).toContain("insert into public.service_registrations");
    expect(migration).toContain("insert into public.service_registration_parts");
    expect(migration).toContain("raise exception 'A service part is invalid'");
    expect(serviceClient).toContain("rpc('create_scoped_service_registration'");
  });

  it("allows a manually entered unknown serial but rejects an exact machine outside service scope without leaking data", () => {
    expect(migration).toContain("case when v_has_warranty then v_warranty.id else null end");
    expect(migration).toContain("The selected machine is not available for this service registration");
    expect(migration).toContain("v_warranty.dealer_account_id <> v_dealer.id");
    expect(migration).toContain("Autocomplete deliberately returns only records already inside the caller's");
  });

  it("persists current-user changes separately from warranty ownership", () => {
    expect(migration).toContain("create table if not exists public.machine_service_user_history");
    expect(migration).toContain("register_user_change");
    expect(migration).toContain("update public.machine_service_user_history");
    expect(migration).not.toContain("update public.warranty_registrations");
    expect(servicePage).toContain("service-user-change");
    expect(servicePage).toContain("new_user_name: registerUserChange");
  });

  it("uses server-scoped autocomplete and reads the same canonical history by normalized serial", () => {
    expect(serviceClient).toContain("rpc('search_scoped_service_machines'");
    expect(serviceClient).toContain("rpc('list_scoped_service_machines'");
    expect(servicePage).toContain("searchServiceMachines(query, form.dealer_number || null)");
    expect(machineLifecycle).toContain('.eq("normalized_serial", normalizedSerial)');
    expect(machineLifecycle).toContain("machine_registration_id");
  });

  it("uses effective service scope for reads and writes, including linked service partners", () => {
    expect(migration).toContain("public.warranty_visible_dealer_ids()");
    expect(migration).toContain("public.resolve_collaboration_manager_accounts()");
    expect(migration).toContain("relation.relation_type = 'service_partner_has_dealer'");
    expect(migration).toContain("service_registrations_select_scoped");
    expect(migration).toContain("You do not have permission to create a service registration");
  });
});
