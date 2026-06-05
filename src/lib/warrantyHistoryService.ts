/**
 * Reads warranty_registration_history rows for a single registration.
 * Pure read-only — write path goes through the (proposed) RPC
 * `warranty_update_registration` which creates these rows.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface HistoryFieldChange {
  field: string;
  old: string | null;
  new: string | null;
}

export interface RegistrationHistoryEntry {
  id: string;
  changed_at: string;
  change_source: string;
  actor: string | null;
  fields: HistoryFieldChange[];
}

interface Row {
  id: string;
  changed_at: string;
  change_source: string;
  snapshot: Record<string, unknown> | null;
  diff: Record<string, unknown> | null;
}

function stringify(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

function parseEntry(row: Row): RegistrationHistoryEntry {
  const diff = row.diff ?? {};
  const fields: HistoryFieldChange[] = [];
  let actor: string | null = null;
  for (const [k, v] of Object.entries(diff)) {
    if (k === "_actor") {
      actor = typeof v === "string" ? v : null;
      continue;
    }
    if (v && typeof v === "object" && "old" in (v as object) && "new" in (v as object)) {
      const entry = v as { old: unknown; new: unknown };
      fields.push({ field: k, old: stringify(entry.old), new: stringify(entry.new) });
    }
  }
  return {
    id: row.id,
    changed_at: row.changed_at,
    change_source: row.change_source,
    actor,
    fields,
  };
}

export function useRegistrationHistory(registrationId: string | null) {
  const [entries, setEntries] = useState<RegistrationHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!registrationId) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from("warranty_registration_history")
      .select("id, changed_at, change_source, snapshot, diff")
      .eq("registration_id", registrationId)
      .order("changed_at", { ascending: false })
      .limit(100)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          setError(err.message);
          setEntries([]);
        } else {
          setEntries((data ?? []).map((r) => parseEntry(r as Row)));
          setError(null);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [registrationId]);

  return { entries, loading, error };
}
