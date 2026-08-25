import { supabase } from "@/lib/supabase";

export interface Crm2620Trial {
  id: string;
  created_at: string;
  updated_at?: string | null;
  country: string | null;
  company_cvr: string;
  contact_person: string;
  address: string | null;
  zip_city: string;
  phone: string;
  email: string;
  comment: string | null;
  responsible_seller_id: string | null;
  responsible_seller_name: string | null;
  responsible_seller_email: string | null;
  created_by_email: string | null;
}

export type NewCrm2620TrialInput = Omit<Crm2620Trial, "id" | "created_at" | "updated_at">;

const LS_TRIALS = "timan.crm.2620Trials.v1";

function readLocal(): Crm2620Trial[] {
  try {
    return JSON.parse(localStorage.getItem(LS_TRIALS) || "[]") as Crm2620Trial[];
  } catch {
    return [];
  }
}

function writeLocal(rows: Crm2620Trial[]): void {
  localStorage.setItem(LS_TRIALS, JSON.stringify(rows));
}

function notifyChanged(): void {
  window.dispatchEvent(new CustomEvent("timan:crm-2620-trials-changed"));
}

export async function createCrm2620Trial(input: NewCrm2620TrialInput): Promise<Crm2620Trial> {
  const now = new Date().toISOString();
  const row: Crm2620Trial = {
    ...input,
    id: crypto.randomUUID(),
    created_at: now,
    updated_at: now,
  };

  try {
    const { data, error } = await supabase
      .from("crm_2620_trials")
      .insert(row)
      .select("*")
      .maybeSingle();
    if (!error && data) {
      notifyChanged();
      return data as Crm2620Trial;
    }
    if (error) console.warn("[crm2620Trials.create] Supabase failed, using local fallback", error);
  } catch (error) {
    console.warn("[crm2620Trials.create] Supabase failed, using local fallback", error);
  }

  const rows = [row, ...readLocal()];
  writeLocal(rows);
  notifyChanged();
  return row;
}

export async function listCrm2620Trials(limit = 500): Promise<Crm2620Trial[]> {
  let remoteRows: Crm2620Trial[] = [];
  try {
    const { data, error } = await supabase
      .from("crm_2620_trials")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (!error && data) remoteRows = data as Crm2620Trial[];
    if (error) console.warn("[crm2620Trials.list] Supabase failed, using local fallback", error);
  } catch (error) {
    console.warn("[crm2620Trials.list] Supabase failed, using local fallback", error);
  }

  const byId = new Map<string, Crm2620Trial>();
  for (const row of [...remoteRows, ...readLocal()]) byId.set(row.id, row);
  return Array.from(byId.values())
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
    .slice(0, limit);
}

export async function deleteCrm2620Trial(id: string): Promise<void> {
  const localRows = readLocal();
  const localHadRow = localRows.some((row) => row.id === id);

  try {
    const { error } = await supabase
      .from("crm_2620_trials")
      .delete()
      .eq("id", id);

    if (error) throw error;

    if (localHadRow) {
      writeLocal(localRows.filter((row) => row.id !== id));
    }
    notifyChanged();
    return;
  } catch (error) {
    if (!localHadRow) {
      console.warn("[crm2620Trials.delete] Supabase delete failed", error);
      throw error;
    }

    console.warn("[crm2620Trials.delete] Supabase failed, deleting local fallback row only", error);
    writeLocal(localRows.filter((row) => row.id !== id));
    notifyChanged();
  }
}
