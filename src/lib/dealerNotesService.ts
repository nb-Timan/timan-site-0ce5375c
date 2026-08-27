/**
 * Dealer notes — internal Timan note history per dealer.
 *
 * Source of truth: public.dealer_notes (Phase 18 SQL — see
 * docs/sql/phase18_dealer_notes.sql). Falls back to localStorage so the UI
 * never breaks when the table doesn't exist yet.
 *
 * Internal-only: External dealer/service-partner/importer users must never
 * read these. RLS in Phase 18 enforces this; the UI also gates rendering.
 */
import { supabase } from "@/lib/supabase";
import { notifyLocalFallback } from "@/lib/persistenceWarning";

export type DealerNoteType =
  | "general"
  | "call"
  | "visit"
  | "follow_up"
  | "demo"
  | "offer"
  | "service";
export type DealerNoteVisibility = "internal" | "shared";
export type DealerNoteAuthorParty = "timan" | "dealer";

export interface DealerNote {
  id: string;
  dealer_number: string;
  dealer_name: string | null;
  created_by_user_id: string | null;
  created_by_email: string | null;
  seller_initials: string | null;
  note_type: DealerNoteType;
  note_text: string;
  linked_activity_id: string | null;
  follow_up_date: string | null; // ISO date or datetime
  visibility: DealerNoteVisibility;
  author_party: DealerNoteAuthorParty;
  shared_at: string | null;
  created_at: string;
}

export interface DealerNoteComment {
  id: string;
  note_id: string;
  comment_text: string;
  created_by_user_id: string | null;
  created_by_email: string | null;
  seller_initials: string | null;
  created_at: string;
}

export interface NewDealerNote {
  dealer_number: string;
  dealer_name?: string | null;
  created_by_user_id?: string | null;
  created_by_email?: string | null;
  seller_initials?: string | null;
  note_type: DealerNoteType;
  note_text: string;
  linked_activity_id?: string | null;
  follow_up_date?: string | null;
  visibility?: DealerNoteVisibility;
  author_party?: DealerNoteAuthorParty;
  shared_at?: string | null;
}

const LS_KEY = "timan.crm.dealer_notes.v1";
const COMMENTS_LS_KEY = "timan.crm.dealer_note_comments.v1";
const MAX_LOCAL = 2000;

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `dn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function readLocal(): DealerNote[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw);
    return Array.isArray(p) ? (p as DealerNote[]) : [];
  } catch { return []; }
}
function writeLocal(rows: DealerNote[]): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(rows.slice(0, MAX_LOCAL))); } catch { /* */ }
}
function normalizeNote(row: DealerNote): DealerNote {
  return {
    ...row,
    visibility: row.visibility ?? "internal",
    author_party: row.author_party ?? "timan",
    shared_at: row.shared_at ?? null,
  };
}
function readLocalComments(): DealerNoteComment[] {
  try {
    const raw = localStorage.getItem(COMMENTS_LS_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw);
    return Array.isArray(p) ? (p as DealerNoteComment[]) : [];
  } catch { return []; }
}
function writeLocalComments(rows: DealerNoteComment[]): void {
  try { localStorage.setItem(COMMENTS_LS_KEY, JSON.stringify(rows.slice(0, MAX_LOCAL))); } catch { /* */ }
}

export async function createDealerNote(input: NewDealerNote): Promise<DealerNote> {
  const row: DealerNote = {
    id: uuid(),
    dealer_number: input.dealer_number,
    dealer_name: input.dealer_name ?? null,
    created_by_user_id: input.created_by_user_id ?? null,
    created_by_email: input.created_by_email ?? null,
    seller_initials: input.seller_initials ?? null,
    note_type: input.note_type,
    note_text: input.note_text,
    linked_activity_id: input.linked_activity_id ?? null,
    follow_up_date: input.follow_up_date ?? null,
    visibility: input.visibility ?? "internal",
    author_party: input.author_party ?? "timan",
    shared_at: input.shared_at ?? null,
    created_at: new Date().toISOString(),
  };
  writeLocal([row, ...readLocal()]);
  try {
    const { error } = await supabase.from("dealer_notes").insert(row);
    if (error) notifyLocalFallback({ table: "dealer_notes", action: "insert", error });
  } catch (err) {
    notifyLocalFallback({ table: "dealer_notes", action: "insert", error: err });
  }
  return row;
}

export async function listDealerNotes(dealerNumber: string): Promise<DealerNote[]> {
  try {
    const { data, error } = await supabase
      .from("dealer_notes")
      .select("*")
      .eq("dealer_number", dealerNumber)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    if (data && data.length > 0) return (data as unknown as DealerNote[]).map(normalizeNote);
  } catch (err) {
    console.warn("[dealerNotes.list] supabase failed → local fallback:", err);
  }
  return readLocal()
    .filter(r => r.dealer_number === dealerNumber)
    .map(normalizeNote)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Bulk version for dealer groups (main + branches). */
export async function listDealerNotesForNumbers(numbers: string[]): Promise<DealerNote[]> {
  if (numbers.length === 0) return [];
  try {
    const { data, error } = await supabase
      .from("dealer_notes")
      .select("*")
      .in("dealer_number", numbers)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) throw error;
    if (data && data.length > 0) return (data as unknown as DealerNote[]).map(normalizeNote);
  } catch (err) {
    console.warn("[dealerNotes.listMany] supabase failed → local fallback:", err);
  }
  const set = new Set(numbers);
  return readLocal()
    .filter(r => set.has(r.dealer_number))
    .map(normalizeNote)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function updateDealerNote(
  id: string,
  patch: Partial<Pick<DealerNote, "note_type" | "note_text" | "follow_up_date" | "visibility" | "shared_at">>,
): Promise<{ ok: boolean; error?: string }> {
  writeLocal(readLocal().map((row) => row.id === id ? { ...row, ...patch } : row));
  try {
    const { error } = await supabase
      .from("dealer_notes")
      .update(patch)
      .eq("id", id);
    if (error) {
      notifyLocalFallback({ table: "dealer_notes", action: "update", error });
      return { ok: false, error: error.message };
    }
  } catch (err) {
    notifyLocalFallback({ table: "dealer_notes", action: "update", error: err });
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  return { ok: true };
}

export async function shareDealerNote(id: string): Promise<{ ok: boolean; error?: string }> {
  return updateDealerNote(id, {
    visibility: "shared",
    shared_at: new Date().toISOString(),
  });
}

export async function deleteDealerNote(id: string): Promise<{ ok: boolean; error?: string }> {
  writeLocal(readLocal().filter((row) => row.id !== id));
  writeLocalComments(readLocalComments().filter((row) => row.note_id !== id));
  try {
    const { error } = await supabase
      .from("dealer_notes")
      .delete()
      .eq("id", id);
    if (error) {
      notifyLocalFallback({ table: "dealer_notes", action: "delete", error });
      return { ok: false, error: error.message };
    }
  } catch (err) {
    notifyLocalFallback({ table: "dealer_notes", action: "delete", error: err });
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  return { ok: true };
}

export async function listDealerNoteComments(noteIds: string[]): Promise<DealerNoteComment[]> {
  if (noteIds.length === 0) return [];
  try {
    const { data, error } = await supabase
      .from("dealer_note_comments")
      .select("*")
      .in("note_id", noteIds)
      .order("created_at", { ascending: true })
      .limit(2000);
    if (error) throw error;
    if (data) return data as unknown as DealerNoteComment[];
  } catch (err) {
    console.warn("[dealerNoteComments.list] supabase failed → local fallback:", err);
  }
  const set = new Set(noteIds);
  return readLocalComments()
    .filter((row) => set.has(row.note_id))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function createDealerNoteComment(input: {
  note_id: string;
  comment_text: string;
  created_by_user_id?: string | null;
  created_by_email?: string | null;
  seller_initials?: string | null;
}): Promise<DealerNoteComment> {
  const row: DealerNoteComment = {
    id: uuid(),
    note_id: input.note_id,
    comment_text: input.comment_text,
    created_by_user_id: input.created_by_user_id ?? null,
    created_by_email: input.created_by_email ?? null,
    seller_initials: input.seller_initials ?? null,
    created_at: new Date().toISOString(),
  };
  writeLocalComments([...readLocalComments(), row]);
  try {
    const { error } = await supabase.from("dealer_note_comments").insert(row);
    if (error) notifyLocalFallback({ table: "dealer_note_comments", action: "insert", error });
  } catch (err) {
    notifyLocalFallback({ table: "dealer_note_comments", action: "insert", error: err });
  }
  return row;
}
