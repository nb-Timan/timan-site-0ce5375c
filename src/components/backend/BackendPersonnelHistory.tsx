import { useState } from 'react';
import { PORTAL_ROLE_LABELS } from '@/lib/portalAccess';
import { fetchPersonnelHistory, personnelDate, userLifecycleFacts, type PersonnelHistory } from '@/lib/backendPersonnelHistory';

export default function BackendPersonnelHistory() {
  const [data,setData] = useState<PersonnelHistory | null>(null);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [query,setQuery] = useState('');
  const load = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try { setData(await fetchPersonnelHistory()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Historikken kunne ikke hentes.'); }
    finally { setBusy(false); }
  };
  const matches = (...values: (string | null)[]) => values.join(' ').toLocaleLowerCase('da').includes(query.toLocaleLowerCase('da'));
  return <section aria-label="Bruger- og medarbejderhistorik" className="mt-5 min-w-0 rounded-xl border bg-white p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Bruger- og medarbejderhistorik</h2>
      <button type="button" disabled={busy} onClick={() => void load()} className="min-h-10 rounded-md border px-3 text-xs font-semibold">{data ? 'Opdater historik' : 'Vis historik'}</button></div>
    <p className="mt-1 text-xs text-slate-600">Kontaktfjernelse, deaktiveret Portal-login og arkivering er forskellige tilstande. Manglende historiske oplysninger vises som “Ikke registreret”.</p>
    {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
    {data && <div className="mt-3 space-y-3">
      <input aria-label="Søg i medarbejderhistorik" placeholder="Søg på navn eller firma" value={query} onChange={(e) => setQuery(e.target.value)} className="h-9 w-full max-w-sm rounded border px-2 text-sm" />
      {data.users.filter((u) => matches(u.name,u.company)).map((user) => {
        const facts = userLifecycleFacts(user,data.events);
        const role = PORTAL_ROLE_LABELS[user.role as keyof typeof PORTAL_ROLE_LABELS]?.da ?? user.role ?? 'Ikke registreret';
        return <details key={user.id} className="rounded border p-2">
          <summary className="cursor-pointer break-words text-xs"><strong>{user.name || 'Ikke registreret'}</strong> · {user.company || 'Ikke registreret'} · {role} · {facts.status}</summary>
          <dl className="mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            <Fact label="Oprettet" value={personnelDate(user.created_at)} /><Fact label="Aktiveret" value={personnelDate(facts.activated?.at)} />
            <Fact label="Sidste registrerede login" value={personnelDate(user.last_login_at)} /><Fact label="Deaktiveret" value={personnelDate(facts.deactivated?.at)} />
            <Fact label="Deaktiveret af" value={facts.deactivated?.actor || 'Ikke registreret'} /><Fact label="Arkiveret" value={personnelDate(facts.archived?.at)} />
          </dl>
          <ul className="mt-2 space-y-1 text-xs">{facts.history.map((event) => <li key={event.id} className="break-words border-t pt-1">{personnelDate(event.at)} · {event.actor || 'Ikke registreret'} · {event.action} · {Object.keys(event.new).join(', ') || 'Brugerændring'}{!event.server_recorded && ' · Ældre log: serverkilde ikke registreret'}</li>)}</ul>
          {!facts.history.length && <p className="mt-2 text-xs">Historik: Ikke registreret</p>}
        </details>;
      })}
      <h3 className="font-semibold">Fjernet fra kontaktlisten ({data.contacts.length})</h3>
      {data.contacts.filter((c) => matches(c.name,c.company)).map((contact) => <p key={contact.id} className="break-words rounded border p-2 text-xs"><strong>{contact.name || 'Ikke registreret'}</strong> · {contact.company} #{contact.account} · {contact.area}<br />{personnelDate(contact.removed_at)} · {contact.removed_by || 'Ikke registreret'} · Portal-login uændret</p>)}
      {!data.contacts.length && <p className="text-xs text-slate-600">Ingen registrerede kontaktfjernelser.</p>}
      {data.events.filter((e) => e.record_type === 'app_users' && !data.users.some((u) => u.id === e.record_id) && matches(e.label)).map((e) => <p key={e.id} className="break-words rounded border p-2 text-xs">{e.label?.split(' · ')[0] || 'Ikke registreret'} · Historisk brugerregistrering · {personnelDate(e.at)} · {e.actor || 'Ikke registreret'} · {e.action}<br />Arkivering: {personnelDate(typeof e.new.archived_at === 'string' ? e.new.archived_at : null)}</p>)}
    </div>}
  </section>;
}
function Fact({label,value}: {label:string;value:string}) {
  return <div className="min-w-0"><dt className="text-slate-500">{label}</dt><dd className="break-words">{value}</dd></div>;
}
