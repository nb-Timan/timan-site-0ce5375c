/**
 * Warranty serial validation (Phase 2.1).
 *
 * Lightweight checks invoked from the "New warranty registration" form:
 *
 *  - DUPLICATE:  serial is already present in the in-memory warranty store,
 *                in Supabase `warranty_registrations`, or in `machines`.
 *                For external (dealer-side) users this BLOCKS save and the
 *                form shows the canonical Danish message. Internal Timan
 *                roles (`timan_backend`, `timan_service`) can override and
 *                save anyway (acts as "approval").
 *
 *  - UNKNOWN:    soft warning placeholder for the future
 *                "active serial number catalogue" check. Surfaced as a
 *                non-blocking notice. Wire up the real catalogue later by
 *                replacing `isUnknownSerial()`.
 *
 *  - OK:         nothing to report.
 *
 * Important:
 *   This module does NOT lock serials post-registration (per spec) and it
 *   does NOT mutate any data — it only reads. RLS still applies to the
 *   Supabase reads, so external users only see duplicates within their own
 *   dealer scope. Cross-dealer duplicate detection requires an internal
 *   role and is handled by Timan Backend / Timan Service.
 */
import { supabase } from "@/lib/supabase";
import { getWarrantyRecords } from "@/lib/warranty-store";
import { normalizeSerial, serialKey, isInternalRole } from "@/lib/machineJournalService";
import type { PortalRole } from "@/lib/portalAccess";

export type SerialValidationResult =
  | { kind: "ok" }
  | { kind: "duplicate"; source: "warranty_store" | "warranty_registrations" | "machines"; message: string; blocking: boolean }
  | { kind: "unknown"; message: string; blocking: false };

const DUPLICATE_EXTERNAL_MSG =
  "Dette serienummer er allerede registreret. Kontakt Timan Service.";
const DUPLICATE_INTERNAL_MSG =
  "Dette serienummer er allerede registreret. Kræver godkendelse fra Timan Backend / Timan Service.";
const UNKNOWN_MSG = "Serienummeret kunne ikke valideres";

/**
 * Future placeholder: validate against an "active serial number" catalogue.
 * Returns false today (= never warn) so we don't spam dealers when they
 * register brand-new machines. Flip to a real check when the catalogue
 * ships.
 */
function isUnknownSerial(_serial: string): boolean {
  return false;
}

export async function validateWarrantySerial(
  rawSerial: string,
  role: PortalRole | null,
): Promise<SerialValidationResult> {
  const serial = (rawSerial ?? "").trim();
  if (!serial) return { kind: "ok" };

  const key = serialKey(serial);
  const norm = normalizeSerial(serial);
  const internal = isInternalRole(role);

  // 1. Local in-memory warranty store (preview/demo + same-session entries).
  try {
    for (const r of getWarrantyRecords()) {
      if (serialKey(r.machineSerial) === key && key.length > 0) {
        return {
          kind: "duplicate",
          source: "warranty_store",
          message: internal ? DUPLICATE_INTERNAL_MSG : DUPLICATE_EXTERNAL_MSG,
          blocking: !internal,
        };
      }
    }
  } catch (e) {
    console.warn("[warrantySerialValidation] local store check failed (tolerated)", e);
  }

  // 2. Supabase warranty_registrations (RLS-scoped).
  try {
    const safe = serial.replace(/[(),%]/g, "");
    const { data } = await supabase
      .from("warranty_registrations")
      .select("id, machine_serial")
      .ilike("machine_serial", `%${safe}%`)
      .limit(20);
    for (const row of (data ?? []) as Array<{ machine_serial: string | null }>) {
      if (serialKey(row.machine_serial) === key) {
        return {
          kind: "duplicate",
          source: "warranty_registrations",
          message: internal ? DUPLICATE_INTERNAL_MSG : DUPLICATE_EXTERNAL_MSG,
          blocking: !internal,
        };
      }
    }
  } catch (e) {
    console.warn("[warrantySerialValidation] warranty_registrations check failed (tolerated)", e);
  }

  // 3. Supabase machines (RLS-scoped).
  try {
    const safe = serial.replace(/[(),%]/g, "");
    const { data } = await supabase
      .from("machines")
      .select("id, serial_number")
      .ilike("serial_number", `%${safe}%`)
      .limit(20);
    for (const row of (data ?? []) as Array<{ serial_number: string | null }>) {
      if (serialKey(row.serial_number) === key) {
        return {
          kind: "duplicate",
          source: "machines",
          message: internal ? DUPLICATE_INTERNAL_MSG : DUPLICATE_EXTERNAL_MSG,
          blocking: !internal,
        };
      }
    }
  } catch (e) {
    console.warn("[warrantySerialValidation] machines check failed (tolerated)", e);
  }

  if (isUnknownSerial(norm)) {
    return { kind: "unknown", message: UNKNOWN_MSG, blocking: false };
  }
  return { kind: "ok" };
}
