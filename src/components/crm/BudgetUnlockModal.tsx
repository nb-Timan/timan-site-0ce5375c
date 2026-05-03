/**
 * BudgetUnlockModal — Backend confirmation dialog for opening a budget
 * year for a limited time. Supports scope (all sellers / single seller),
 * preset durations (1h / 4h / 1d / custom), and requires the literal
 * confirmation text "ÅBN ALLE" before opening for ALL sellers.
 *
 * Save action calls createBudgetAccessWindow() — it does NOT modify
 * dealer_accounts, configurator pricing, or existing budget rows.
 */
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldAlert, Unlock } from "lucide-react";
import { BUDGET_SELLERS, BUDGET_BACKEND_USERS } from "@/lib/crmBudgetService";
import {
  createBudgetAccessWindow,
  type BudgetWindowScope,
} from "@/lib/budgetAccessWindows";

type DurationPreset = "1h" | "4h" | "1d" | "custom";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  year: number;
  /** Pre-selected seller email when launched from a per-seller row. */
  defaultSellerEmail?: string | null;
  createdBy: string | null;
  onCreated: () => void;
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Sellers we can open a budget for (BP/JTN/EM/AKR + NB from backend list).
const SELLER_OPTIONS = (() => {
  const map = new Map<string, { initials: string; email: string }>();
  for (const s of BUDGET_SELLERS) map.set(s.email.toLowerCase(), { initials: s.initials, email: s.email });
  for (const s of BUDGET_BACKEND_USERS) {
    if (!map.has(s.email.toLowerCase())) map.set(s.email.toLowerCase(), { initials: s.initials, email: s.email });
  }
  return Array.from(map.values()).sort((a, b) => a.initials.localeCompare(b.initials));
})();

export default function BudgetUnlockModal(props: Props) {
  const { open, onOpenChange, year, defaultSellerEmail, createdBy, onCreated } = props;

  const [scope, setScope] = useState<BudgetWindowScope>("seller");
  const [sellerEmail, setSellerEmail] = useState<string>("");
  const [openFromMode, setOpenFromMode] = useState<"now" | "custom">("now");
  const [openFromCustom, setOpenFromCustom] = useState<string>(toLocalInput(new Date()));
  const [duration, setDuration] = useState<DurationPreset>("4h");
  const [openUntilCustom, setOpenUntilCustom] = useState<string>(
    toLocalInput(new Date(Date.now() + 4 * 60 * 60 * 1000)),
  );
  const [confirmText, setConfirmText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setScope(defaultSellerEmail ? "seller" : "seller");
    setSellerEmail((defaultSellerEmail || SELLER_OPTIONS[0]?.email || "").toLowerCase());
    setOpenFromMode("now");
    setOpenFromCustom(toLocalInput(new Date()));
    setDuration("4h");
    setOpenUntilCustom(toLocalInput(new Date(Date.now() + 4 * 60 * 60 * 1000)));
    setConfirmText("");
  }, [open, defaultSellerEmail]);

  const baseDate = useMemo(() => {
    if (openFromMode === "now") return new Date();
    return fromLocalInput(openFromCustom) ?? new Date();
  }, [openFromMode, openFromCustom]);

  const computedUntil = useMemo<Date | null>(() => {
    if (duration === "custom") return fromLocalInput(openUntilCustom);
    const ms = duration === "1h" ? 3_600_000 : duration === "4h" ? 4 * 3_600_000 : 24 * 3_600_000;
    return new Date(baseDate.getTime() + ms);
  }, [duration, openUntilCustom, baseDate]);

  const requiresExtraConfirm = scope === "all";
  const extraConfirmOk = !requiresExtraConfirm || confirmText.trim().toUpperCase() === "ÅBN ALLE";

  async function handleSubmit() {
    setError(null);
    if (scope === "seller" && !sellerEmail) { setError("Vælg en sælger."); return; }
    if (!computedUntil) { setError("Ugyldig slutdato."); return; }
    const from = openFromMode === "now" ? new Date() : fromLocalInput(openFromCustom);
    if (!from) { setError("Ugyldig startdato."); return; }
    if (computedUntil.getTime() <= from.getTime()) { setError("Slut skal ligge efter start."); return; }
    if (!extraConfirmOk) { setError('Skriv "ÅBN ALLE" for at bekræfte.'); return; }

    setSaving(true);
    const sellerOpt = SELLER_OPTIONS.find((s) => s.email.toLowerCase() === sellerEmail.toLowerCase());
    await createBudgetAccessWindow({
      budget_year: year,
      scope,
      seller_initials: scope === "seller" ? (sellerOpt?.initials || null) : null,
      seller_email: scope === "seller" ? (sellerOpt?.email || null) : null,
      open_from: from.toISOString(),
      open_until: computedUntil.toISOString(),
      created_by: createdBy,
    });
    setSaving(false);
    onCreated();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Unlock className="h-4 w-4 text-emerald-600" />
            Åbn budget {year}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Scope</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as BudgetWindowScope)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="seller">Specifik sælger</SelectItem>
                  <SelectItem value="all">Alle sælgere</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Sælger</Label>
              <Select
                value={sellerEmail}
                onValueChange={setSellerEmail}
                disabled={scope !== "seller"}
              >
                <SelectTrigger><SelectValue placeholder="Vælg sælger" /></SelectTrigger>
                <SelectContent>
                  {SELLER_OPTIONS.map((s) => (
                    <SelectItem key={s.email} value={s.email}>{s.initials}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Åben fra</Label>
              <Select value={openFromMode} onValueChange={(v) => setOpenFromMode(v as "now" | "custom")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="now">Nu</SelectItem>
                  <SelectItem value="custom">Vælg dato/tid</SelectItem>
                </SelectContent>
              </Select>
              {openFromMode === "custom" && (
                <Input
                  type="datetime-local"
                  className="mt-2"
                  value={openFromCustom}
                  onChange={(e) => setOpenFromCustom(e.target.value)}
                />
              )}
            </div>
            <div>
              <Label className="text-xs">Åben i</Label>
              <Select value={duration} onValueChange={(v) => setDuration(v as DurationPreset)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1h">1 time</SelectItem>
                  <SelectItem value="4h">4 timer</SelectItem>
                  <SelectItem value="1d">1 dag</SelectItem>
                  <SelectItem value="custom">Indtil dato/tid</SelectItem>
                </SelectContent>
              </Select>
              {duration === "custom" && (
                <Input
                  type="datetime-local"
                  className="mt-2"
                  value={openUntilCustom}
                  onChange={(e) => setOpenUntilCustom(e.target.value)}
                />
              )}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            Budget åbner{openFromMode === "now" ? " nu" : ` ${baseDate.toLocaleString("da-DK")}`} og lukker automatisk
            {" "}<strong>{computedUntil ? computedUntil.toLocaleString("da-DK") : "—"}</strong>.
            {scope === "all"
              ? " Gælder for ALLE sælgere."
              : ` Gælder kun for ${SELLER_OPTIONS.find((s) => s.email.toLowerCase() === sellerEmail.toLowerCase())?.initials || "—"}.`}
          </div>

          {requiresExtraConfirm && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-900">
                <ShieldAlert className="h-4 w-4" />
                Du åbner budgettet for ALLE sælgere
              </div>
              <p className="text-xs text-amber-800 mt-1">
                Skriv <strong>ÅBN ALLE</strong> for at bekræfte:
              </p>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="ÅBN ALLE"
                className="mt-2"
              />
            </div>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuller
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={saving || !extraConfirmOk}>
            <Unlock className="h-4 w-4 mr-1" /> Åbn budget
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
