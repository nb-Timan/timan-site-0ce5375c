import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/context/LanguageContext";
import type { Language } from "@/types/configurator";
import type { CellDetailItem, MachineKey, Quarter, SellerDisplay } from "./useBudgetDashboardData";

interface Props {
  open: boolean;
  onClose: () => void;
  seller: SellerDisplay | null;
  quarter: Quarter | null;
  machine: MachineKey | null;
  items: CellDetailItem[];
}

const LT: Record<string, Record<Language, string>> = {
  lead:        { da: 'Lead',       en: 'Lead',       de: 'Lead',       it: 'Lead',       hu: 'Lead' },
  quote:       { da: 'Tilbud',     en: 'Quote',      de: 'Angebot',    it: 'Preventivo', hu: 'Árajánlat' },
  order:       { da: 'Ordre',      en: 'Order',      de: 'Auftrag',    it: 'Ordine',     hu: 'Rendelés' },
  quarter:     { da: 'kvartal',    en: 'quarter',    de: 'Quartal',    it: 'trimestre',  hu: 'negyedév' },
  no_activity_in_combo: { da: 'Ingen aktivitet i denne kombination.', en: 'No activity for this combination.', de: 'Keine Aktivität.', it: 'Nessuna attività.', hu: 'Nincs tevékenység.' },
  records_found_singular: { da: 'post fundet.', en: 'record found.', de: 'Eintrag gefunden.', it: 'record trovato.', hu: 'rekord található.' },
  records_found_plural:   { da: 'poster fundet.', en: 'records found.', de: 'Einträge gefunden.', it: 'record trovati.', hu: 'rekord található.' },
  no_activity_short:      { da: 'Ingen aktivitet', en: 'No activity', de: 'Keine Aktivität', it: 'Nessuna attività', hu: 'Nincs tevékenység' },
  col_dealer:  { da: 'Forhandler', en: 'Dealer',    de: 'Händler',    it: 'Rivenditore', hu: 'Kereskedő' },
  col_lqo:     { da: 'Lead / tilbud / ordre', en: 'Lead / quote / order', de: 'Lead / Angebot / Auftrag', it: 'Lead / preventivo / ordine', hu: 'Lead / árajánlat / rendelés' },
  col_status:  { da: 'Status',     en: 'Status',    de: 'Status',     it: 'Stato',      hu: 'Státusz' },
  col_machine: { da: 'Maskine',    en: 'Machine',   de: 'Maschine',   it: 'Macchina',   hu: 'Gép' },
  col_date:    { da: 'Dato',       en: 'Date',      de: 'Datum',      it: 'Data',       hu: 'Dátum' },
  col_seller:  { da: 'Sælger',     en: 'Seller',    de: 'Verkäufer',  it: 'Venditore',  hu: 'Értékesítő' },
  col_open:    { da: 'Åbn',        en: 'Open',      de: 'Öffnen',     it: 'Apri',       hu: 'Megnyit' },
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("da-DK"); } catch { return iso; }
}

export default function CellDetailDialog({ open, onClose, seller, quarter, machine, items }: Props) {
  const { language: lang } = useLanguage();
  const KIND_LABEL: Record<CellDetailItem["kind"], string> = {
    lead: LT.lead[lang], quote: LT.quote[lang], order: LT.order[lang],
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {seller?.display_name} · {quarter ? `${quarter}. ${LT.quarter[lang]}` : ""} · {machine}
          </DialogTitle>
          <DialogDescription>
            {items.length === 0
              ? LT.no_activity_in_combo[lang]
              : `${items.length} ${items.length === 1 ? LT.records_found_singular[lang] : LT.records_found_plural[lang]}`}
          </DialogDescription>
        </DialogHeader>

        {items.length === 0 ? (
          <div className="py-8 text-center text-sm text-red-600 font-medium">{LT.no_activity_short[lang]}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">{LT.col_dealer[lang]}</th>
                  <th className="text-left px-3 py-2 font-medium">{LT.col_lqo[lang]}</th>
                  <th className="text-left px-3 py-2 font-medium">{LT.col_status[lang]}</th>
                  <th className="text-left px-3 py-2 font-medium">{LT.col_machine[lang]}</th>
                  <th className="text-left px-3 py-2 font-medium">{LT.col_date[lang]}</th>
                  <th className="text-left px-3 py-2 font-medium">{LT.col_seller[lang]}</th>
                  <th className="text-right px-3 py-2 font-medium">{LT.col_open[lang]}</th>
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
                        {LT.col_open[lang]} <ExternalLink className="h-3 w-3" />
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
