/**
 * Country / postal-code popup shown when a user clicks "Continue without login".
 * Required fields. Stores guest visitor in Supabase via visitorTracking service.
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { registerGuestVisitor } from "@/lib/visitorTracking";
import { Language } from "@/types/configurator";

const T: Record<string, Record<Language, string>> = {
  title:    { da: "Inden du fortsætter", en: "Before you continue", de: "Bevor Sie fortfahren", it: "Prima di continuare", hu: "Mielőtt folytatja" },
  desc:     { da: "Vi bruger dette til at forstå brugen af portalen og forbedre oplevelsen.", en: "We use this to understand portal usage and improve the experience.", de: "Wir verwenden diese Angaben, um die Nutzung des Portals zu verstehen und die Erfahrung zu verbessern.", it: "Usiamo questi dati per capire l'uso del portale e migliorare l'esperienza.", hu: "Ezt a portál használatának megértésére és az élmény javítására használjuk." },
  country:  { da: "Land", en: "Country", de: "Land", it: "Paese", hu: "Ország" },
  postal:   { da: "Postnummer", en: "Postal code", de: "Postleitzahl", it: "Codice postale", hu: "Irányítószám" },
  cont:     { da: "Fortsæt", en: "Continue", de: "Weiter", it: "Continua", hu: "Folytatás" },
  cancel:   { da: "Annullér", en: "Cancel", de: "Abbrechen", it: "Annulla", hu: "Mégse" },
  required: { da: "Begge felter er påkrævet.", en: "Both fields are required.", de: "Beide Felder sind erforderlich.", it: "Entrambi i campi sono obbligatori.", hu: "Mindkét mező kötelező." },
};

const COUNTRIES = [
  "Danmark","Sverige","Norge","Tyskland","Holland","Belgien","Frankrig","Italien","Spanien","Portugal",
  "Polen","Ungarn","Tjekkiet","Slovakiet","Østrig","Schweiz","UK","Irland","Finland","Estland","Letland","Litauen","Andet",
];

interface Props {
  open: boolean;
  language: Language;
  email?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function GuestVisitorPopup({ open, language, email, onCancel, onConfirm }: Props) {
  const [country, setCountry] = useState("");
  const [postal, setPostal] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const t = (k: string) => T[k]?.[language] || T[k]?.en || k;

  const handleConfirm = async () => {
    if (!country.trim() || !postal.trim()) {
      setError(t("required"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      await registerGuestVisitor({
        country: country.trim(),
        postal_code: postal.trim(),
        language,
        email: email ?? null,
      });
      onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {t("desc")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="gv-country">{t("country")} *</Label>
            <select
              id="gv-country"
              value={country}
              onChange={e => { setCountry(e.target.value); setError(""); }}
              className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              autoFocus
            >
              <option value="">—</option>
              {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="gv-postal">{t("postal")} *</Label>
            <Input
              id="gv-postal"
              value={postal}
              onChange={e => { setPostal(e.target.value); setError(""); }}
              maxLength={20}
              className="mt-1"
            />
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>{t("cancel")}</Button>
          <Button onClick={handleConfirm} disabled={busy}>{busy ? "…" : t("cont")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
