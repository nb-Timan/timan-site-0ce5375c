import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

export default function UpdatePasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.title = "Nulstil adgangskode";
    // Listen for PASSWORD_RECOVERY event from Supabase recovery link.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    // Also check existing session in case event fired before mount.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pw1.length < 8) { setError("Adgangskoden skal være mindst 8 tegn."); return; }
    if (pw1 !== pw2) { setError("De to adgangskoder er ikke ens."); return; }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    setSaving(false);
    if (error) { setError(error.message); return; }
    setSuccess(true);
    setTimeout(async () => {
      await supabase.auth.signOut();
      navigate("/portal");
    }, 1800);
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Vælg ny adgangskode</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Indtast din nye adgangskode nedenfor.
          </p>
        </div>

        {success ? (
          <div className="text-sm text-green-600">
            Adgangskoden er opdateret. Du sendes til login…
          </div>
        ) : !ready ? (
          <div className="text-sm text-muted-foreground">
            Validerer recovery-link…
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pw1">Ny adgangskode</Label>
              <Input id="pw1" type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} autoComplete="new-password" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw2">Gentag ny adgangskode</Label>
              <Input id="pw2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" required />
            </div>
            {error && <div className="text-sm text-destructive">{error}</div>}
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? "Gemmer…" : "Gem adgangskode"}
            </Button>
          </form>
        )}
      </Card>
    </main>
  );
}
