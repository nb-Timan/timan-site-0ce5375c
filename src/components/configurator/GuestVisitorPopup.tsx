/**
 * Guest visitor popup — email, country and postal code are all required.
 * Per-field validation with inline error messages.
 * Continue button is disabled until all fields are valid.
 */
import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { registerGuestVisitor } from "@/lib/visitorTracking";
import { Language } from "@/types/configurator";

const T: Record<string, Record<Language, string>> = {
  title:    { da: "Inden du fortsætter", en: "Before you continue", de: "Bevor Sie fortfahren", it: "Prima di continuare", hu: "Mielőtt folytatja" },
  desc:     { da: "Vi bruger dette til at forstå brugen af portalen og forbedre oplevelsen.", en: "We use this to understand portal usage and improve the experience.", de: "Wir verwenden diese Angaben, um die Nutzung des Portals zu verstehen und die Erfahrung zu verbessern.", it: "Usiamo questi dati per capire l'uso del portale e migliorare l'esperienza.", hu: "Ezt a portál használatának megértésére és az élmény javítására használjuk." },
  email:    { da: "Email", en: "Email", de: "E-Mail", it: "Email", hu: "E-mail" },
  country:  { da: "Land", en: "Country", de: "Land", it: "Paese", hu: "Ország" },
  postal:   { da: "Postnummer", en: "Postal code", de: "Postleitzahl", it: "Codice postale", hu: "Irányítószám" },
  cont:     { da: "Fortsæt", en: "Continue", de: "Weiter", it: "Continua", hu: "Folytatás" },
  cancel:   { da: "Annullér", en: "Cancel", de: "Abbrechen", it: "Annulla", hu: "Mégse" },
  emailInvalid: { da: "Indtast en gyldig email-adresse.", en: "Please enter a valid email address.", de: "Bitte geben Sie eine gültige E-Mail-Adresse ein.", it: "Inserisci un indirizzo email valido.", hu: "Kérjük, adjon meg egy érvényes e-mail címet." },
  countryRequired: { da: "Vælg et land.", en: "Please select a country.", de: "Bitte wählen Sie ein Land.", it: "Seleziona un paese.", hu: "Kérjük, válasszon egy országot." },
  postalInvalid: { da: "Postnummer skal være 3-10 tegn.", en: "Postal code must be 3-10 characters.", de: "Postleitzahl muss 3-10 Zeichen lang sein.", it: "Il codice postale deve essere di 3-10 caratteri.", hu: "Az irányítószámnak 3-10 karakterből kell állnia." },
};

const COUNTRIES = [
  "Danmark","Sverige","Norge","Tyskland","Holland","Belgien","Frankrig","Italien","Spanien","Portugal",
  "Polen","Ungarn","Tjekkiet","Slovakiet","Østrig","Schweiz","UK","Irland","Finland","Estland","Letland","Litauen","Andet",
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Props {
  open: boolean;
  language: Language;
  onCancel: () => void;
  onConfirm: (email: string) => void;
}

export default function GuestVisitorPopup({ open, language, onCancel, onConfirm }: Props) {
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("");
  const [postal, setPostal] = useState("");
  const [touched, setTouched] = useState({ email: false, country: false, postal: false });
  const [busy, setBusy] = useState(false);

  const t = (k: string) => T[k]?.[language] || T[k]?.en || k;

  const emailError = useMemo(() => {
    if (!touched.email) return "";
    if (!email.trim()) return t("emailInvalid");
    if (!EMAIL_REGEX.test(email.trim())) return t("emailInvalid");
    return "";
  }, [email, touched.email, t]);

  const countryError = useMemo(() => {
    if (!touched.country) return "";
    if (!country.trim()) return t("countryRequired");
    return "";
  }, [country, touched.country, t]);

  const postalError = useMemo(() => {
    if (!touched.postal) return "";
    const p = postal.trim();
    if (!p) return t("postalInvalid");
    if (p.length < 3 || p.length > 10) return t("postalInvalid");
    return "";
  }, [postal, touched.postal, t]);

  const isValid =
    email.trim() &&
    EMAIL_REGEX.test(email.trim()) &&
    country.trim() &&
    postal.trim().length >= 3 &&
    postal.trim().length <= 10;

  const resetAll = () => {
    setEmail("");
    setCountry("");
    setPostal("");
    setTouched({ email: false, country: false, postal: false });
    setBusy(false);
  };

  const handleConfirm = async () => {
    // Force validation display
    setTouched({ email: true, country: true, postal: true });
    if (!isValid) return;

    setBusy(true);
    try {
      await registerGuestVisitor({
        country: country.trim(),
        postal_code: postal.trim(),
        language,
        email: email.trim().toLowerCase(),
      });
      onConfirm(email.trim().toLowerCase());
      resetAll();
    } finally {
      setBusy(false);
    }
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      resetAll();
      onCancel();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {t("desc")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Email */}
          <div>
            <Label htmlFor="gv-email">{t("email")} *</Label>
            <Input
              id="gv-email"
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setTouched(p => ({ ...p, email: true })); }}
              onBlur={() => setTouched(p => ({ ...p, email: true }))}
              className="mt-1"
              autoFocus
              autoComplete="email"
            />
            {emailError && <p className="text-sm text-rose-600 mt-1">{emailError}</p>}
          </div>

          {/* Country */}
          <div>
            <Label htmlFor="gv-country">{t("country")} *</Label>
            <select
              id="gv-country"
              value={country}
              onChange={e => { setCountry(e.target.value); setTouched(p => ({ ...p, country: true })); }}
              onBlur={() => setTouched(p => ({ ...p, country: true }))}
              className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">—</option>
              {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {countryError && <p className="text-sm text-rose-600 mt-1">{countryError}</p>}
          </div>

          {/* Postal */}
          <div>
            <Label htmlFor="gv-postal">{t("postal")} *</Label>
            <Input
              id="gv-postal"
              value={postal}
              onChange={e => { setPostal(e.target.value); setTouched(p => ({ ...p, postal: true })); }}
              onBlur={() => setTouched(p => ({ ...p, postal: true }))}
              maxLength={10}
              className="mt-1"
            />
            {postalError && <p className="text-sm text-rose-600 mt-1">{postalError}</p>}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>{t("cancel")}</Button>
          <Button onClick={handleConfirm} disabled={busy || !isValid}>{busy ? "…" : t("cont")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
