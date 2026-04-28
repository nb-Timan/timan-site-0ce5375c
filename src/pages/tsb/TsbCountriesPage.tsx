import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { TsbSidebarLayout } from "@/components/tsb/TsbSidebarLayout";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COUNTRY_GROUP_LABEL, addCountry, getCountries, isCustomCountry, removeCustomCountry, type CountryGroup } from "@/lib/countries-store";

export default function TsbCountriesPage() {
  const [, force] = useState(0);
  const [name, setName] = useState("");
  const [group, setGroup] = useState<CountryGroup>("europe");
  const [error, setError] = useState<string | null>(null);
  const countries = getCountries();
  const europe = countries.filter((c) => c.group === "europe");
  const outside = countries.filter((c) => c.group === "outside");

  function handleAdd() {
    setError(null);
    if (!name.trim()) return setError("Indtast et landenavn.");
    if (!addCountry(name, group)) return setError("Landet findes allerede på listen.");
    setName("");
    force((n) => n + 1);
  }

  function handleRemove(countryName: string) {
    if (!isCustomCountry(countryName)) return;
    removeCustomCountry(countryName);
    force((n) => n + 1);
  }

  return (
    <TsbSidebarLayout>
      <div>
        <h1 className="text-2xl font-black text-slate-950">Landeliste</h1>
        <p className="mt-1 text-sm text-slate-500">Administrer hvilke lande forhandlere kan vælge i reklamationsformularen. Tilføj nye lande efter behov — de vises straks i dropdown'en.</p>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-black uppercase tracking-widest text-slate-700">Tilføj nyt land</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_220px_auto]">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Fx Brazil" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-green-600" />
          <Select value={group} onValueChange={(v) => setGroup(v as CountryGroup)}><SelectTrigger className="h-auto rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm shadow-none"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="europe">{COUNTRY_GROUP_LABEL.europe}</SelectItem><SelectItem value="outside">{COUNTRY_GROUP_LABEL.outside}</SelectItem></SelectContent></Select>
          <button type="button" onClick={handleAdd} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"><Plus className="h-4 w-4" /> Tilføj</button>
        </div>
        {error && <p className="mt-2 text-xs font-bold text-red-600">{error}</p>}
        <p className="mt-2 text-xs text-slate-500">Standardlande kan ikke fjernes. Egne tilføjede lande kan slettes.</p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CountryGroupCard title={COUNTRY_GROUP_LABEL.europe} countries={europe.map((c) => c.name)} onRemove={handleRemove} />
        <CountryGroupCard title={COUNTRY_GROUP_LABEL.outside} countries={outside.map((c) => c.name)} onRemove={handleRemove} />
      </div>
    </TsbSidebarLayout>
  );
}

function CountryGroupCard({ title, countries, onRemove }: { title: string; countries: string[]; onRemove: (name: string) => void }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-black uppercase tracking-widest text-slate-700">{title}<span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{countries.length}</span></h2>
      <ul className="mt-3 divide-y divide-slate-100">
        {countries.map((c) => {
          const custom = isCustomCountry(c);
          return <li key={c} className="flex items-center justify-between gap-3 py-2 text-sm"><span className="text-slate-900">{c}{custom && <span className="ml-2 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-black uppercase text-indigo-700">Tilføjet</span>}</span>{custom && <button type="button" onClick={() => onRemove(c)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /> Fjern</button>}</li>;
        })}
      </ul>
    </div>
  );
}