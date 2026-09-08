import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { academySandbox } from '@/lib/academySandbox';

export default function AcademyPage() {
  const navigate = useNavigate(); const [, refresh] = useState(0); const task = academySandbox.getCase1();
  const start = () => { academySandbox.startCase1(); navigate('/configurator?academy_mode=true'); };
  const status = task.completed ? 'Gennemført' : task.started ? 'I gang' : 'Ny';
  const progress = task.completed ? 100 : 0;
  return <main className="mx-auto max-w-6xl p-6"><h1 className="text-2xl font-bold">Min Academy</h1><p className="mt-1 text-sm text-slate-600">Lokal træningssandkasse. Ingen rigtige kunde- eller salgsdata oprettes.</p>
    <div className="mt-6 grid gap-4 md:grid-cols-3">
      <section className="border rounded-lg p-4"><b>Samlet fremdrift</b><p className="mt-3 text-2xl font-bold">{progress}%</p><div className="mt-2 h-2 bg-slate-100"><div className="h-full bg-emerald-500" style={{width:`${progress}%`}}/></div><p className="mt-2 text-sm">{task.completed ? '1 af 1 opgave' : '0 af 1 opgave'}</p></section>
      <section className="border rounded-lg p-4"><b>Dine badges</b><p className="mt-3 text-sm">Bronze: {task.completed ? 'Opnået' : 'Låst'}</p><p className="text-sm text-slate-500">Sølv og Guld kommer senere.</p></section>
      <section className="border rounded-lg p-4"><b>Fortsæt hvor jeg slap</b><p className="mt-3 text-sm">RC-1000 kundetilbud</p><button className="mt-3 rounded bg-emerald-600 px-3 py-2 text-white" onClick={start}>{task.started ? 'Fortsæt' : 'Start opgave'}</button></section>
      <section className="border rounded-lg p-4"><b>Senest gennemført</b><p className="mt-3 text-sm">{task.completed ? 'RC-1000 kundetilbud' : 'Ingen gennemførte opgaver'}</p></section>
      <section className="border rounded-lg p-4"><b>Dine certifikater</b><p className="mt-3 text-sm text-slate-500">Ingen certifikater endnu.</p></section>
      <section className="border rounded-lg p-4"><b>Dine opgaver</b><p className="mt-3 font-medium">RC-1000 - kundetilbud</p><p className="text-sm">Status: {status}</p><button className="mt-3 text-sm text-emerald-700" onClick={()=>refresh(x=>x+1)}>Opdater status</button></section>
    </div></main>;
}
