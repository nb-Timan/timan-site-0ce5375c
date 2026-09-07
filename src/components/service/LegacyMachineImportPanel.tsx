import { useEffect, useMemo, useState } from "react";
import { FileUp, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { enrichLegacyMachineSales, hasLegacySalesData, importLegacyMachines, parseLegacyMachineWorkbook, previewLegacyMachineImport, type LegacyMachinePreviewRow } from "@/lib/legacyMachineImportService";

type Dealer = { id: string; account_number: string; company_name: string };
type UnresolvedGroup = { dealerNumber: string; dealerName: string; count: number };

export function LegacyMachineImportPanel({ onCompleted }: { onCompleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<LegacyMachinePreviewRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [groups, setGroups] = useState<UnresolvedGroup[]>([]);
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [createHistorical, setCreateHistorical] = useState<Record<string, boolean>>({});

  const counts = useMemo(() => preview.reduce((all, row) => ({ ...all, [row.status]: (all[row.status] ?? 0) + 1 }), {} as Record<string, number>), [preview]);

  const loadResolutionData = async () => {
    const [{ data: dealerData, error: dealerError }, { data: machineData, error: machineError }] = await Promise.all([
      supabase.from("dealer_accounts").select("id, account_number, company_name").eq("status", "active").eq("is_active", true).eq("is_deleted", false).eq("is_blocked", false).order("company_name"),
      supabase.from("warranty_registrations").select("source_dealer_number, source_dealer_name").eq("source", "legacy_machine_import").eq("dealer_match_status", "needs_review").not("source_dealer_number", "is", null),
    ]);
    if (dealerError || machineError) throw dealerError ?? machineError;
    setDealers((dealerData ?? []) as Dealer[]);
    const grouped = new Map<string, UnresolvedGroup>();
    for (const row of machineData ?? []) {
      const number = row.source_dealer_number;
      const current = grouped.get(number) ?? { dealerNumber: number, dealerName: row.source_dealer_name || "Ukendt forhandler", count: 0 };
      current.count += 1;
      grouped.set(number, current);
    }
    setGroups([...grouped.values()].sort((a, b) => b.count - a.count));
  };

  useEffect(() => { if (open) void loadResolutionData().catch((error) => setMessage(error.message)); }, [open]);

  const chooseFile = async (file: File | null) => {
    if (!file) return;
    setLoading(true); setMessage(null); setPreview([]); setFileName(file.name);
    try { setPreview(await previewLegacyMachineImport(await parseLegacyMachineWorkbook(file))); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Kunne ikke læse filen."); }
    finally { setLoading(false); }
  };

  const importRows = async () => {
    setLoading(true); setMessage(null);
    try {
      const importableRows = preview.filter((row) => row.status !== "duplicate" && row.status !== "error");
      const salesData = hasLegacySalesData(preview);
      const result = importableRows.length > 0
        ? await importLegacyMachines(fileName, importableRows)
        : { created: 0, matched: 0, unresolved: 0, duplicates: preview.length, errors: 0 };
      const sales = salesData ? await enrichLegacyMachineSales(preview) : null;
      setMessage(`${result.created} maskiner importeret. ${result.matched} matchet, ${result.unresolved} skal afklares, ${result.duplicates} findes allerede.${sales ? ` ${sales.updated} maskiner fik ERP- og salgsdata.` : ""}`);
      await loadResolutionData(); onCompleted();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Importen kunne ikke gennemføres."); }
    finally { setLoading(false); }
  };

  const resolveGroup = async (group: UnresolvedGroup) => {
    const target = selection[group.dealerNumber];
    if (!target) return;
    setLoading(true); setMessage(null);
    try {
      const { error } = await supabase.rpc("resolve_legacy_machine_dealer", {
        p_source_dealer_number: group.dealerNumber,
        p_source_dealer_name: group.dealerName,
        p_active_dealer_account_id: target,
        p_create_historical: createHistorical[group.dealerNumber] ?? false,
      });
      if (error) throw error;
      await loadResolutionData(); onCompleted();
      setMessage(`${group.count} maskiner er koblet til den valgte aktive forhandler.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Forhandleren kunne ikke afklares."); }
    finally { setLoading(false); }
  };

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button className="gap-2"><FileUp className="h-4 w-4" />Importer maskiner</Button></DialogTrigger>
    <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Importer historiske maskiner</DialogTitle><DialogDescription>Excel-filen vises først som preview. Eksisterende serienumre overskrives aldrig.</DialogDescription></DialogHeader>
      <input type="file" accept=".xlsx" onChange={(event) => void chooseFile(event.target.files?.[0] ?? null)} disabled={loading} />
      {loading && <div className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Arbejder…</div>}
      {message && <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">{message}</div>}
      {preview.length > 0 && <>
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
          <Summary label="I filen" value={preview.length} tone="slate" /><Summary label="Fundet" value={counts.matched ?? 0} tone="green" />
          <Summary label="Mapping" value={counts.mapped ?? 0} tone="green" /><Summary label="Afklares" value={counts.unresolved ?? 0} tone="yellow" />
          <Summary label="Eksisterer/fejl" value={(counts.duplicate ?? 0) + (counts.error ?? 0)} tone="slate" />
        </div>
        <div className="max-h-72 overflow-auto rounded-md border"><table className="w-full text-xs"><thead className="sticky top-0 bg-slate-50 text-left"><tr><th className="p-2">Serienr.</th><th className="p-2">Model</th><th className="p-2">Forhandler</th><th className="p-2">Status</th></tr></thead><tbody>{preview.map((row) => <tr key={row.rowNumber} className="border-t"><td className="p-2 font-mono">{row.serial || "—"}</td><td className="p-2">{row.model || "—"}</td><td className="p-2">{row.dealerNumber || "—"} · {row.dealerName || "—"}</td><td className="p-2"><Status row={row} /></td></tr>)}</tbody></table></div>
        <Button onClick={() => void importRows()} disabled={loading || (!hasLegacySalesData(preview) && preview.every((row) => row.status === "duplicate" || row.status === "error"))}>{hasLegacySalesData(preview) ? "Importér og berig salgsdata" : "Importér validerede maskiner"}</Button>
      </>}
      {groups.length > 0 && <div className="border-t pt-4"><div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-amber-600" />Forhandler skal afklares</div><p className="mt-1 text-sm text-slate-600">Vælg én aktiv forhandler per gammelt nummer. Alle maskiner i gruppen flyttes samlet.</p><div className="mt-3 space-y-3">{groups.map((group) => <div key={group.dealerNumber} className="rounded-md border p-3"><div className="font-medium">{group.dealerNumber} · {group.dealerName} <span className="text-slate-500">({group.count} maskiner)</span></div><div className="mt-2 flex flex-wrap items-center gap-2"><select value={selection[group.dealerNumber] ?? ""} onChange={(event) => setSelection((state) => ({ ...state, [group.dealerNumber]: event.target.value }))} className="min-w-64 rounded-md border px-2 py-1.5 text-sm"><option value="">Vælg aktiv forhandler</option>{dealers.map((dealer) => <option key={dealer.id} value={dealer.id}>{dealer.account_number} · {dealer.company_name}</option>)}</select><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={createHistorical[group.dealerNumber] ?? false} onChange={(event) => setCreateHistorical((state) => ({ ...state, [group.dealerNumber]: event.target.checked }))} />Opret historisk forhandler</label><Button size="sm" variant="outline" disabled={loading || !selection[group.dealerNumber]} onClick={() => void resolveGroup(group)}>Kobl alle {group.count}</Button></div></div>)}</div></div>}
    </DialogContent>
  </Dialog>;
}

function Summary({ label, value, tone }: { label: string; value: number; tone: "slate" | "green" | "yellow" }) {
  const classes = tone === "green" ? "border-emerald-200 bg-emerald-50" : tone === "yellow" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50";
  return <div className={`rounded-md border p-2 ${classes}`}><div className="text-xs text-slate-600">{label}</div><div className="text-lg font-bold">{value}</div></div>;
}

function Status({ row }: { row: LegacyMachinePreviewRow }) {
  const classes = row.status === "matched" || row.status === "mapped" ? "bg-emerald-100 text-emerald-800" : row.status === "unresolved" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700";
  return <span className={`rounded-full px-2 py-1 font-medium ${classes}`}>{row.statusLabel}</span>;
}
