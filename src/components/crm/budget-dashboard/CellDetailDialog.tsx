import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { CellDetailItem, MachineKey, Quarter, SellerDisplay } from "./useBudgetDashboardData";

interface Props {
  open: boolean;
  onClose: () => void;
  seller: SellerDisplay | null;
  quarter: Quarter | null;
  machine: MachineKey | null;
  items: CellDetailItem[];
}

const KIND_LABEL: Record<CellDetailItem["kind"], string> = {
  lead: "Lead", quote: "Tilbud", order: "Ordre",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("da-DK"); } catch { return iso; }
}

export default function CellDetailDialog({ open, onClose, seller, quarter, machine, items }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {seller?.display_name} · {quarter ? `${quarter}. kvartal` : ""} · {machine}
          </DialogTitle>
          <DialogDescription>
            {items.length === 0
              ? "Ingen aktivitet i denne kombination."
              : `${items.length} post${items.length === 1 ? "" : "er"} fundet.`}
          </DialogDescription>
        </DialogHeader>

        {items.length === 0 ? (
          <div className="py-8 text-center text-sm text-red-600 font-medium">Ingen aktivitet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Forhandler</th>
                  <th className="text-left px-3 py-2 font-medium">Lead / tilbud / ordre</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  <th className="text-left px-3 py-2 font-medium">Maskine</th>
                  <th className="text-left px-3 py-2 font-medium">Dato</th>
                  <th className="text-left px-3 py-2 font-medium">Sælger</th>
                  <th className="text-right px-3 py-2 font-medium">Åbn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((it, i) => (
                  <tr key={`${it.kind}-${it.id}-${i}`} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-700">{it.dealer || "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{KIND_LABEL[it.kind]}</Badge>
                        <span className="text-slate-900 truncate max-w-[280px]">{it.title}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{it.status || "—"}</td>
                    <td className="px-3 py-2 text-slate-600">{it.machine || "—"}</td>
                    <td className="px-3 py-2 text-slate-600">{fmtDate(it.date)}</td>
                    <td className="px-3 py-2 text-slate-600">{it.sellerLabel || "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        to={it.href}
                        onClick={onClose}
                        className="inline-flex items-center gap-1 text-[#2d5a27] hover:underline text-xs"
                      >
                        Åbn <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
