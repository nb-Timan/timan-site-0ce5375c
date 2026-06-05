/**
 * Partner map — warranty registration aggregates per dealer_account.
 *
 * PII safety: this service only selects aggregate-relevant columns
 * (id, dealer_account_id, machine_model, machine_serial_number,
 * delivery_date). It NEVER selects customer_name, customer_address,
 * customer_phone or customer_email.
 *
 * RLS on warranty_registrations already enforces who may read which
 * rows; this client just trims the projection so customer PII never
 * reaches the partner map UI even by accident.
 */
import { supabase } from "@/lib/supabase";

export interface PartnerMachineStats {
  totalMachines: number;
  latestDelivery: string | null; // ISO date (yyyy-mm-dd) or null
  models: Array<{ model: string; count: number }>;
  serialCount: number;
}

const EMPTY: PartnerMachineStats = {
  totalMachines: 0,
  latestDelivery: null,
  models: [],
  serialCount: 0,
};

export async function fetchPartnerMachineStats(
  dealerAccountIds: string[],
): Promise<Record<string, PartnerMachineStats>> {
  const ids = Array.from(new Set(dealerAccountIds.filter(Boolean)));
  if (ids.length === 0) return {};

  const { data, error } = await supabase
    .from("warranty_registrations")
    .select(
      "dealer_account_id, machine_model, machine_serial_number, delivery_date",
    )
    .in("dealer_account_id", ids);

  if (error) {
    console.warn("[partnerMachineStats] fetch failed:", error.message);
    return {};
  }

  const out: Record<string, PartnerMachineStats> = {};
  const serialsByDealer = new Map<string, Set<string>>();
  const modelsByDealer = new Map<string, Map<string, number>>();

  for (const row of data ?? []) {
    const did = row.dealer_account_id as string | null;
    if (!did) continue;
    const bucket = out[did] ?? { ...EMPTY, models: [] };

    bucket.totalMachines += 1;

    const dd = (row.delivery_date as string | null) ?? null;
    if (dd && (!bucket.latestDelivery || dd > bucket.latestDelivery)) {
      bucket.latestDelivery = dd;
    }

    const serial = (row.machine_serial_number as string | null)?.trim();
    if (serial) {
      const set = serialsByDealer.get(did) ?? new Set<string>();
      set.add(serial);
      serialsByDealer.set(did, set);
    }

    const model = (row.machine_model as string | null)?.trim();
    if (model) {
      const mm = modelsByDealer.get(did) ?? new Map<string, number>();
      mm.set(model, (mm.get(model) ?? 0) + 1);
      modelsByDealer.set(did, mm);
    }

    out[did] = bucket;
  }

  for (const did of Object.keys(out)) {
    out[did].serialCount = serialsByDealer.get(did)?.size ?? 0;
    const mm = modelsByDealer.get(did);
    out[did].models = mm
      ? Array.from(mm.entries())
          .map(([model, count]) => ({ model, count }))
          .sort((a, b) => b.count - a.count || a.model.localeCompare(b.model))
      : [];
  }

  return out;
}
