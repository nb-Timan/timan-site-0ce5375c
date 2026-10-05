import { useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  parsePlanningSupplyFile,
  planningSupplyFileSha256,
  processPlanningSupplyImport,
  type PlanningSupplyImportResult,
  type PlanningSupplyImportRow,
} from '@/lib/planningSupplyImport';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: (key: string) => string;
  onImported: () => void;
}

const MACHINES = [
  { itemNumber: '410040', label: 'RC-751' },
  { itemNumber: '411000', label: 'RC-1000s' },
  { itemNumber: '712000', label: 'Timan 3330' },
  { itemNumber: '761000', label: 'Timan 2620' },
];

export default function PlanningSupplyImportDialog({ open, onOpenChange, label, onImported }: Props) {
  const [itemNumber, setItemNumber] = useState('410040');
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<PlanningSupplyImportRow[]>([]);
  const [fileSha256, setFileSha256] = useState('');
  const [result, setResult] = useState<PlanningSupplyImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const resetFile = () => {
    setFile(null); setRows([]); setFileSha256(''); setResult(null); setError('');
  };

  const chooseFile = async (next: File | null) => {
    resetFile();
    if (!next) return;
    setBusy(true);
    try {
      const [parsedRows, hash] = await Promise.all([
        parsePlanningSupplyFile(next, itemNumber), planningSupplyFileSha256(next),
      ]);
      setFile(next); setRows(parsedRows); setFileSha256(hash);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : label('planningImportError'));
    } finally {
      setBusy(false);
    }
  };

  const process = async (confirm: boolean) => {
    if (!file || !fileSha256 || rows.length === 0) return;
    setBusy(true); setError('');
    try {
      const next = await processPlanningSupplyImport({
        fileName: file.name, fileSha256, itemNumber, rows, confirm,
      });
      setResult(next);
      if (confirm) onImported();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : label('planningImportError'));
    } finally {
      setBusy(false);
    }
  };

  const summary = result?.summary;
  const canConfirm = !!result?.preview && !busy
    && summary.invalidRows === 0 && summary.duplicates === 0 && summary.conflicts === 0;

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) resetFile(); }}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] min-w-0 max-w-[calc(100vw-1rem)] overflow-y-auto p-4 sm:max-w-[1024px] sm:p-6">
        <DialogHeader><DialogTitle>{label('planningImportTitle')}</DialogTitle></DialogHeader>
        <div className="min-w-0 space-y-4">
          <p className="text-sm text-slate-600">{label('planningImportDescription')}</p>
          <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)_auto] sm:items-end">
            <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-800">
              {label('planningImportMachine')}
              <select value={itemNumber} onChange={(event) => { setItemNumber(event.target.value); resetFile(); }}
                className="h-10 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3">
                {MACHINES.map((machine) => <option key={machine.itemNumber} value={machine.itemNumber}>
                  {machine.label} · {machine.itemNumber}
                </option>)}
              </select>
            </label>
            <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-800">
              {label('planningImportFile')}
              <input type="file" accept=".csv,text/csv,.xlsx,.xls" disabled={busy}
                onChange={(event) => void chooseFile(event.target.files?.[0] ?? null)}
                className="h-10 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm" />
            </label>
            <Button type="button" variant="outline" disabled={!file || busy || rows.length === 0}
              onClick={() => void process(false)} className="w-full min-w-0 sm:w-auto">
              <FileSpreadsheet className="mr-2 h-4 w-4" aria-hidden />{label('planningImportPreview')}
            </Button>
          </div>

          <div className="flex items-start gap-2 border-l-4 border-sky-500 bg-sky-50 p-3 text-sm text-sky-950">
            <Upload className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{label('planningImportIgnoredFields')}</span>
          </div>
          {error && <p role="alert" className="border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

          {summary && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {[
                  ['planningImportRows', summary.sourceRows],
                  ['planningImportNew', summary.newMachines],
                  ['planningImportExisting', summary.existingMatches],
                  ['planningImportUpdated', summary.updatedMachines],
                  ['planningImportConflicts', summary.conflicts],
                  ['planningImportInvalid', summary.invalidRows + summary.duplicates],
                ].map(([key, value]) => <div key={key} className="rounded-md border border-slate-200 bg-white p-2">
                  <p className="text-xs text-slate-600">{label(String(key))}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{value}</p>
                </div>)}
              </div>
              <div className="w-full max-w-full overflow-x-auto rounded-md border border-slate-200">
                <table className="min-w-[840px] w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-600"><tr>
                    <th className="px-3 py-2">#</th><th className="px-3 py-2">{label('planningSerial')}</th>
                    <th className="px-3 py-2">{label('planningProductionReference')}</th>
                    <th className="px-3 py-2">{label('planningProductionEnd')}</th>
                    <th className="px-3 py-2">{label('planningErpOrder')}</th>
                    <th className="px-3 py-2">{label('planningStatus')}</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-200">
                    {result.rows.map((row) => <tr key={`${row.rowNumber}:${row.serialNumber}`}>
                      <td className="px-3 py-2 tabular-nums">{row.rowNumber}</td>
                      <td className="px-3 py-2 font-medium tabular-nums">{row.serialNumber || '—'}</td>
                      <td className="px-3 py-2 tabular-nums">{row.productionReference || '—'}</td>
                      <td className="px-3 py-2 tabular-nums">{row.productionCompletedAt || '—'}</td>
                      <td className="px-3 py-2 tabular-nums">{row.salesOrderNumber || '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 ${row.outcome === 'conflict' || row.outcome === 'invalid'
                          || row.outcome === 'duplicate' ? 'text-amber-800' : 'text-emerald-800'}`}>
                          {row.outcome === 'conflict' || row.outcome === 'invalid' || row.outcome === 'duplicate'
                            ? <AlertTriangle className="h-4 w-4" aria-hidden />
                            : <CheckCircle2 className="h-4 w-4" aria-hidden />}
                          {label(`planningImportOutcome_${row.outcome}`)}
                        </span>
                      </td>
                    </tr>)}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-600">{label('planningImportConfirmHelp')}</p>
                <Button type="button" disabled={!canConfirm} onClick={() => void process(true)}>
                  {label('planningImportConfirm')}
                </Button>
              </div>
              {!result.preview && <p role="status" className="text-sm font-medium text-emerald-800">
                {result.alreadyImported ? label('planningImportAlreadyImported') : label('planningImportComplete')}
              </p>}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
