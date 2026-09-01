import { useEffect, useMemo, useState } from 'react';
import { useAppUser } from '@/context/AppUserContext';
import { derivePortalRole } from '@/lib/portalAccess';
import { isCrmAdmin } from '@/lib/crmScope';
import { resolveSellerId } from '@/lib/resolveSellerId';
import { listDemoLeads, resolveSeedOwners, type CrmDemoLead } from '@/lib/crmLeadsService';
import { Sparkles, MapPin, Wrench, Users, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

function topN(items: (string | null | undefined)[], n: number) {
  const map = new Map<string, number>();
  for (const i of items) {
    const k = (i || '').trim();
    if (!k) continue;
    map.set(k, (map.get(k) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

function Bar({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 text-xs text-gray-700 truncate">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full bg-[#2d5a27]" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-12 text-right text-xs tabular-nums text-gray-600">{count}</span>
    </div>
  );
}

export default function DemoStatsSection() {
  const { appUser } = useAppUser();
  const portalRole = derivePortalRole(appUser);
  const isAdmin = isCrmAdmin(portalRole);
  const [rows, setRows] = useState<CrmDemoLead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const sellerId = await resolveSellerId(appUser?.email);
      const all = await listDemoLeads({ payload: "summary" });
      const resolved = await resolveSeedOwners(all);
      const visible = isAdmin ? resolved : resolved.filter(r => r.owner_user_id && r.owner_user_id === sellerId);
      if (!cancelled) { setRows(visible); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [appUser?.email, isAdmin]);

  const stats = useMemo(() => {
    const total = rows.length;
    const sellers = topN(rows.map(r => r.owner_name), 6);
    const countries = topN(rows.map(r => r.dealer_country), 6);
    const machines = topN(rows.map(r => r.demo_machine), 6);
    const equipment = topN(rows.flatMap(r => r.demo_equipment || []), 6);
    return { total, sellers, countries, machines, equipment };
  }, [rows]);

  if (loading) return null;
  if (rows.length === 0) return null;

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mt-6">
      <header className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-[15px] font-semibold text-gray-900">Demo statistik</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {stats.total} demoer i alt · baseret på importerede demonstrationer
            </p>
          </div>
        </div>
        <Link to="/portal/crm/demo-leads" className="text-xs text-gray-600 hover:text-[#2d5a27] inline-flex items-center gap-1">
          Se alle demoer <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6">
        <div>
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500 mb-3 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> Sælger performance (demoer)
          </h4>
          <div className="space-y-2">
            {stats.sellers.map(([k, v]) => <Bar key={k} label={k} count={v} total={stats.total} />)}
          </div>
        </div>

        <div>
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500 mb-3 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" /> Lande
          </h4>
          <div className="space-y-2">
            {stats.countries.map(([k, v]) => <Bar key={k} label={k} count={v} total={stats.total} />)}
          </div>
        </div>

        <div>
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500 mb-3 flex items-center gap-1.5">
            <Wrench className="h-3.5 w-3.5" /> Demonstrerede maskiner
          </h4>
          <div className="space-y-2">
            {stats.machines.map(([k, v]) => <Bar key={k} label={k} count={v} total={stats.total} />)}
          </div>
        </div>

        <div>
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500 mb-3 flex items-center gap-1.5">
            <Wrench className="h-3.5 w-3.5" /> Demonstreret udstyr
          </h4>
          {stats.equipment.length === 0 ? (
            <p className="text-xs text-gray-400">Intet udstyr registreret</p>
          ) : (
            <div className="space-y-2">
              {stats.equipment.map(([k, v]) => <Bar key={k} label={k} count={v} total={stats.total} />)}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
