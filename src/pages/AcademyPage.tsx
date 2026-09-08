import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { academySandbox } from '@/lib/academySandbox';
import { activateLocalAcademyEnrollment, getAcademyCapabilityProgress, getAcademyProgress, getLocalAcademyUser, isAcademyCapabilityUnlocked } from '@/lib/academyCurriculum';
import { useAppUser } from '@/context/AppUserContext';

export default function AcademyPage() {
  const navigate = useNavigate(); const [params] = useSearchParams(); const { appUser, setAppUser } = useAppUser(); const task = academySandbox.getCase1();
  useEffect(() => { if (import.meta.env.DEV) { activateLocalAcademyEnrollment(); if (appUser?.id !== 'academy-local-sales-user') setAppUser(getLocalAcademyUser()); } }, [appUser, setAppUser]);
  const start = () => { academySandbox.startCase1(); navigate('/configurator?academy_mode=true'); };
  const status = task.completed ? 'Gennemført' : task.started ? 'I gang' : 'Ny';
  const completed = academySandbox.getCompletedCaseIds(); const progress = getAcademyProgress(appUser, completed); const configurator = getAcademyCapabilityProgress('configurator', completed); const unlocked = isAcademyCapabilityUnlocked(appUser, 'configurator', completed);
  return <main className="mx-auto max-w-6xl p-6"><h1 className="text-2xl font-bold">Min Academy</h1><p className="mt-1 text-sm text-slate-600">Academy træningsmiljø. Du arbejder med træningsdata. Ingen rigtige kunder, mails eller salgsdata påvirkes.</p>
    {params.get('locked') && <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">Denne funktion kræver Academy. Gennemfør det relevante forløb først.</div>}
    <div className="mt-6 grid gap-4 md:grid-cols-3">
      <section className="border rounded-lg p-4"><b>Din progression</b><p className="mt-3 text-2xl font-bold">{progress.completedCount} / {progress.total}</p><div className="mt-2 h-2 bg-slate-100"><div className="h-full bg-emerald-500" style={{width:`${progress.percentage}%`}}/></div><p className="mt-2 text-sm">{progress.percentage}% gennemført</p></section>
      <section className="rounded-lg border border-amber-300 bg-amber-50 p-4"><b>Næste oplåsning: Konfigurator</b><p className="mt-3 text-sm">{unlocked ? 'Konfigurator låst op' : 'Gennemfør Sales Case 1 for at få adgang til den rigtige konfigurator.'}</p><p className="mt-2 text-sm font-semibold">{configurator.completedCount} / {configurator.total} gennemført</p></section>
      <section className="border rounded-lg p-4"><b>Fortsæt hvor jeg slap</b><p className="mt-3 font-medium">Case 1 - RC-1000 kundetilbud</p><p className="text-sm">Status: {status}</p><button className="mt-3 rounded bg-emerald-600 px-3 py-2 text-white" onClick={start}>{task.started ? 'Fortsæt' : 'Start opgave'}</button></section>
      <section className="border rounded-lg p-4"><b>Din Sales Academy-rejse</b><p className="mt-3 text-sm">{unlocked ? '✓ Konfigurator' : '● Konfigurator'} → 🔒 CRM → 🔒 Demo → 🔒 Tilbud & ordre</p></section>
      <section className="border rounded-lg p-4"><b>Næste milepæl</b><p className="mt-3 text-sm">Bronze - grundlæggende portalflows</p><p className="text-sm">{progress.completedCount} / 1</p></section>
      <section className="border rounded-lg p-4"><b>Din opgave</b><p className="mt-3 font-medium">Case 1 - Byg korrekt RC-1000 ordre</p><p className="text-sm">{task.completed ? 'Gennemført' : task.started ? 'I gang' : 'Ny'}</p></section>
    </div><Link className="mt-6 inline-block text-sm font-semibold text-emerald-700 underline" to="/portal">Tilbage til portalen</Link></main>;
}
