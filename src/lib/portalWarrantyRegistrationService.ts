import { supabase } from "@/lib/supabase";

export interface PortalWarrantyRegistrationInput {
  isDemo: boolean;
  demoHoursAtSale: number | null;
  machineSerial: string;
  machineModel: string;
  replacementBrand: string | null;
  toolSerials: string[];
  deliveryDate: string;
  customerName: string;
  customerAddress: string;
  customerPostalCode: string;
  customerCity: string;
  customerCountry: string;
  customerPhone: string;
  customerEmail: string;
  comment: string | null;
  language: string;
  /** Used only by an internal user acting as the effective dealer. */
  dealerAccountNumber?: string | null;
}

export interface CreatedPortalWarrantyRegistration {
  id: string;
  submissionStatus: "submitted";
}

/** The RPC derives dealer identity from auth; caller input contains no dealer fields. */
export async function createPortalWarrantyRegistration(
  input: PortalWarrantyRegistrationInput,
): Promise<CreatedPortalWarrantyRegistration> {
  const { data, error } = await supabase.rpc("create_scoped_portal_warranty_registration", {
    p_registration: {
      is_demo: input.isDemo,
      demo_hours_at_sale: input.demoHoursAtSale,
      machine_serial_number: input.machineSerial.trim(),
      machine_model: input.machineModel,
      replacement_brand: input.replacementBrand,
      tool_serials: input.toolSerials.map((value) => value.trim()).filter(Boolean),
      delivery_date: input.deliveryDate,
      customer_name: input.customerName.trim(),
      customer_address: input.customerAddress.trim(),
      customer_postal_code: input.customerPostalCode.trim(),
      customer_city: input.customerCity.trim(),
      customer_country: input.customerCountry.trim(),
      customer_phone: input.customerPhone.trim(),
      customer_email: input.customerEmail.trim(),
      comment: input.comment?.trim() || null,
      language: input.language,
      dealer_account_number: input.dealerAccountNumber?.trim() || null,
    },
  });

  if (error) throw error;
  const row = data as { id?: string; submission_status?: string | null } | null;
  if (!row?.id || row.submission_status !== "submitted") {
    throw new Error("Serveren bekræftede ikke garantiregistreringen.");
  }
  return { id: row.id, submissionStatus: "submitted" };
}
