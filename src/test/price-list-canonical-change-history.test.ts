import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261007113139_price_list_change_history.sql"),
  "utf8",
);
const publishService = readFileSync(resolve(process.cwd(), "src/lib/pricePublishService.ts"), "utf8");

describe("canonical released price-change history", () => {
  it("stores one typed append-only event per changed SKU and release", () => {
    expect(migration).toContain("create table if not exists public.price_list_price_changes");
    expect(migration).toContain("unique (release_id, item_number)");
    expect(migration).toContain("old_price_dkk numeric");
    expect(migration).toContain("new_price_dkk numeric");
    expect(migration).toContain("change_dkk numeric");
    expect(migration).toContain("change_pct numeric");
    expect(migration).toContain("old_price_sek numeric");
    expect(migration).toContain("new_price_eur numeric");
    expect(migration).not.toContain("grant insert on table public.price_list_price_changes");
    expect(migration).not.toContain("grant update on table public.price_list_price_changes");
    expect(migration).not.toContain("grant delete on table public.price_list_price_changes");
  });

  it("records only actual canonical price changes during the existing release transaction", () => {
    const insert = migration.slice(migration.indexOf("insert into public.price_list_price_changes"));
    expect(insert).toContain("is distinct from p.price_dkk");
    expect(insert).toContain("is distinct from p.price_sek");
    expect(insert).toContain("is distinct from p.price_eur");
    expect(insert).toContain("on conflict (release_id, item_number) do nothing");
    expect(migration.indexOf("insert into public.price_list_price_changes")).toBeLessThan(
      migration.indexOf("insert into public.price_list_published"),
    );
  });

  it("links canonical actor, import batch, version and effective date", () => {
    expect(migration).toContain("changed_by_app_user_id uuid not null references public.app_users(id)");
    expect(migration).toContain("import_log_id uuid references public.price_list_import_logs(id)");
    expect(migration).toContain("release_version_number");
    expect(migration).toContain("effective_at timestamptz not null");
    expect(migration).toContain("where au.auth_user_id = auth.uid()");
    expect(migration).toContain("actor_app_user.id");
    expect(migration).toContain("item_sources ->> s.item_number");
    expect(migration).toContain("'MANUAL_UPLOAD', 'MASS_CHANGE', 'DIRECT_PRICE', 'PERCENT_CHANGE'");
  });

  it("supports future history filters without exposing client writes", () => {
    expect(migration).toContain("price_list_price_changes_item_date_idx");
    expect(migration).toContain("price_list_price_changes_group_date_idx");
    expect(migration).toContain("price_list_price_changes_direction_date_idx");
    expect(migration).toContain("price_list_price_changes_actor_date_idx");
    expect(migration).toContain("price_list_price_changes_version_idx");
    expect(publishService).toContain("export async function listPriceChanges");
    expect(publishService).toContain('.eq("item_number", filters.itemNumber)');
    expect(publishService).toContain('.eq("product_group", filters.productGroup)');
    expect(publishService).toContain('.eq("changed_by_app_user_id", filters.changedByAppUserId)');
  });

  it("keeps release authorization backend-only", () => {
    expect(migration).toContain("if not public.is_timan_backend() then");
    expect(migration).toContain("using ((select public.is_timan_backend()))");
    expect(migration).toContain("revoke all on table public.price_list_price_changes from public, anon, authenticated");
    expect(migration).toContain("grant select on table public.price_list_price_changes to authenticated");
  });
});
