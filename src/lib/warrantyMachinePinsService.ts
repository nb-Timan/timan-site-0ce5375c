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
 *   - sharepoint_form_id, sharepoint_item_id (til SP-ID i panel)
 *
 * We NEVER select customer_name, customer_address, customer_postal_code,
 * customer_phone or customer_email. RLS on warranty_registrations remains
 * the source of truth for who may read which rows.
 */
import { supabase } from "@/lib/supabase";

export interface WarrantyMachinePin {
  id: string;
  spId: string | null;
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

export interface WarrantyMachineMissing {
  id: string;
  spId: string | null;
  dealerAccountId: string | null;
  dealerAccountNumber: string | null;
  dealerNameSnapshot: string | null;
  machineSerial: string | null;
  machineModel: string | null;
  customerCity: string | null;
  customerCountry: string | null;
}

function buildSpId(formId: number | null, itemId: string | null, id: string): string {
  if (formId !== null && formId !== undefined) return `SP-${formId}`;
  if (itemId) return `SP-${itemId}`;
  return id.slice(0, 8).toUpperCase();
}

const SELECT_COLS =
  "id, sharepoint_form_id, sharepoint_item_id, dealer_account_id, dealer_account_number, dealer_name_snapshot, machine_serial_number, machine_model, delivery_date, customer_city, customer_country, customer_latitude, customer_longitude, is_active_in_source";

export async function fetchWarrantyMachinePins(): Promise<{
  rows: WarrantyMachinePin[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("warranty_registrations")
    .select(SELECT_COLS)
    .eq("is_active_in_source", true)
    .not("customer_latitude", "is", null)
    .not("customer_longitude", "is", null);

  if (error) return { rows: [], error: error.message };

  const rows: WarrantyMachinePin[] = [];
  for (const r of data ?? []) {
    const lat = r.customer_latitude as number | null;
    const lng = r.customer_longitude as number | null;
    if (lat == null || lng == null) continue;
    rows.push({
      id: r.id as string,
      spId: buildSpId(r.sharepoint_form_id as number | null, r.sharepoint_item_id as string | null, r.id as string),
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

/** Garantiregistreringer som mangler kunde-koordinater (til "Mangler koordinater"-panel). */
export async function fetchWarrantyMachineMissingCoords(): Promise<{
  rows: WarrantyMachineMissing[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("warranty_registrations")
    .select(SELECT_COLS)
    .eq("is_active_in_source", true)
    .or("customer_latitude.is.null,customer_longitude.is.null");

  if (error) return { rows: [], error: error.message };

  const rows: WarrantyMachineMissing[] = (data ?? []).map((r) => ({
    id: r.id as string,
    spId: buildSpId(r.sharepoint_form_id as number | null, r.sharepoint_item_id as string | null, r.id as string),
    dealerAccountId: (r.dealer_account_id as string | null) ?? null,
    dealerAccountNumber: (r.dealer_account_number as string | null) ?? null,
    dealerNameSnapshot: (r.dealer_name_snapshot as string | null) ?? null,
    machineSerial: (r.machine_serial_number as string | null) ?? null,
    machineModel: (r.machine_model as string | null) ?? null,
    customerCity: (r.customer_city as string | null) ?? null,
    customerCountry: (r.customer_country as string | null) ?? null,
  }));
  return { rows, error: null };
}
