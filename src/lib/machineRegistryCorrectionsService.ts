import type { SessionUser } from "@/context/AppUserContext";
import { derivePortalRole } from "@/lib/portalAccess";
import { supabase } from "@/lib/supabase";

export type MachineRegistryCorrection = {
  normalized_serial: string;
  dealer_account_id: string | null;
  approved_warranty_registration_id: string | null;
  machine_model: string | null;
  delivery_date: string | null;
  updated_at: string;
};

export type MachineRegistryCorrectionHistory = {
  id: string;
  actor_email: string | null;
  old_values: Record<string, unknown>;
  new_values: Record<string, unknown>;
  created_at: string;
};

export type ApprovedWarrantyReference = {
  id: string;
  certificate_number: string | null;
  delivery_date: string | null;
};

export function canEditMachineRegistry(user: SessionUser | null): boolean {
  if (!user) return false;
  const role = derivePortalRole(user);
  if (role === "timan_backend") return true;
  if (role !== "timan_seller" && role !== "timan_service") return false;
  const modules = new Set([...(user.allowed_modules ?? []), ...(user.module_access ?? []), ...(user.allowed_areas ?? [])]);
  return modules.has("teknik_service");
}

export async function fetchMachineRegistryCorrection(serial: string): Promise<MachineRegistryCorrection | null> {
  const normalized = serial.replace(/[^a-z0-9]+/gi, "").toUpperCase();
  const { data, error } = await supabase
    .from("machine_registry_corrections")
    .select("normalized_serial, dealer_account_id, approved_warranty_registration_id, machine_model, delivery_date, updated_at")
    .eq("normalized_serial", normalized)
    .maybeSingle();
  if (error) throw error;
  return data as MachineRegistryCorrection | null;
}

export async function saveMachineRegistryCorrection(serial: string, patch: Omit<MachineRegistryCorrection, "normalized_serial" | "updated_at">) {
  const { data, error } = await supabase.rpc("save_machine_registry_correction", {
    p_serial: serial,
    p_patch: patch,
  });
  if (error) throw error;
  return data as MachineRegistryCorrection;
}

export async function fetchMachineRegistryCorrectionHistory(serial: string): Promise<MachineRegistryCorrectionHistory[]> {
  const normalized = serial.replace(/[^a-z0-9]+/gi, "").toUpperCase();
  const { data, error } = await supabase
    .from("machine_registry_correction_history")
    .select("id, actor_email, old_values, new_values, created_at")
    .eq("normalized_serial", normalized)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as MachineRegistryCorrectionHistory[];
}

export async function fetchApprovedWarrantyReferences(serial: string): Promise<ApprovedWarrantyReference[]> {
  const { data, error } = await supabase
    .from("warranty_registrations")
    .select("id, certificate_number, delivery_date, machine_serial_number, source, is_active_in_source")
    .ilike("machine_serial_number", serial)
    .neq("source", "legacy_machine_import")
    .eq("is_active_in_source", true)
    .order("delivery_date", { ascending: false });
  if (error) throw error;
  const key = serial.replace(/[^a-z0-9]+/gi, "").toUpperCase();
  return (data ?? [])
    .filter((row) => row.machine_serial_number.replace(/[^a-z0-9]+/gi, "").toUpperCase() === key)
    .map((row) => ({ id: row.id, certificate_number: row.certificate_number, delivery_date: row.delivery_date }));
}
