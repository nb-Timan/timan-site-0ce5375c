import { supabase } from "@/lib/supabase";

export interface PortalWarrantyRegistrationInput {
  isDemo: boolean;
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
}

export interface CreatedPortalWarrantyRegistration {
  id: string;
  certificateNumber: string;
}

/** The RPC derives dealer identity from auth; caller input contains no dealer fields. */
export async function createPortalWarrantyRegistration(
  input: PortalWarrantyRegistrationInput,
): Promise<CreatedPortalWarrantyRegistration> {
  const { data, error } = await supabase.rpc("create_scoped_portal_warranty_registration", {
    p_registration: {
      is_demo: input.isDemo,
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
    },
  });

  if (error) throw error;
  const row = data as { id?: string; certificate_number?: string | null } | null;
  if (!row?.id || !row.certificate_number) {
    throw new Error("Serveren bekræftede ikke garantiregistreringen.");
  }
  return { id: row.id, certificateNumber: row.certificate_number };
}
