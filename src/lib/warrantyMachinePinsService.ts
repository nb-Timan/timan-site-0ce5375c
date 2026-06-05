/**
 * Partner map — warranty/machine pin layer.
 *
 * Fetches warranty registrations with geocoded customer coordinates so the
 * partner map can render a SEPARATE layer of machine pins (one pin per
 * registered machine, placed at the customer's geocoded location).
 *
 * PII safety
 * ----------
 * We deliberately select only the fields needed for a non-PII map popup:
 *   - id, dealer_account_id, dealer_account_number
 *   - dealer_name_snapshot                  (forhandler-navn til popup)
 *   - machine_serial_number, machine_model, delivery_date
 *   - customer_city, customer_country       (kun by/land — ingen vej/nr.)
 *   - customer_latitude, customer_longitude
 *
 * We NEVER select customer_name, customer_address, customer_postal_code,
 * customer_phone or customer_email. RLS on warranty_registrations remains
 * the source of truth for who may read which rows.
 */
import { supabase } from "@/lib/supabase";

export interface WarrantyMachinePin {
  id: string;
  dealerAccountId: string | null;
  dealerAccountNumber: string | null;
  dealerNameSnapshot: string | null;
  machineSerial: string | null;
  machineModel: string | null;
  deliveryDate: string | null;
  customerCity: string | null;
  customerCountry: string | null;
  coords: [number, number];
}

export async function fetchWarrantyMachinePins(): Promise<{
  rows: WarrantyMachinePin[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("warranty_registrations")
    .select(
      "id, dealer_account_id, dealer_account_number, dealer_name_snapshot, machine_serial_number, machine_model, delivery_date, customer_city, customer_country, customer_latitude, customer_longitude",
    )
    .not("customer_latitude", "is", null)
    .not("customer_longitude", "is", null);

  if (error) {
    return { rows: [], error: error.message };
  }

  const rows: WarrantyMachinePin[] = [];
  for (const r of data ?? []) {
    const lat = r.customer_latitude as number | null;
    const lng = r.customer_longitude as number | null;
    if (lat == null || lng == null) continue;
    rows.push({
      id: r.id as string,
      dealerAccountId: (r.dealer_account_id as string | null) ?? null,
      dealerAccountNumber: (r.dealer_account_number as string | null) ?? null,
      dealerNameSnapshot: (r.dealer_name_snapshot as string | null) ?? null,
      machineSerial: (r.machine_serial_number as string | null) ?? null,
      machineModel: (r.machine_model as string | null) ?? null,
      deliveryDate: (r.delivery_date as string | null) ?? null,
      customerCity: (r.customer_city as string | null) ?? null,
      customerCountry: (r.customer_country as string | null) ?? null,
      coords: [lat, lng],
    });
  }
  return { rows, error: null };
}
