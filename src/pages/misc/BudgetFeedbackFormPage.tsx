import { useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import FormSubmitShell, { Field, inputCls, textareaCls } from './FormSubmitShell';
import { Language } from '@/types/configurator';

const T: Record<string, Record<Language, string>> = {
  title: { da: 'Budget-tilbagemelding', en: 'Budget feedback', de: 'Budget-Feedback', it: 'Feedback budget', hu: 'Budget visszajelzés' },
  intro: {
    da: 'Send din tilbagemelding på det forhandlerbudget Timan har sendt — fx ændringsforslag, accept eller kommentarer.',
    en: 'Submit your feedback on the dealer budget sent by Timan — change requests, acceptance or comments.',
    de: 'Senden Sie Ihr Feedback zum Händlerbudget von Timan — Änderungswünsche, Annahme oder Kommentare.',
    it: 'Invia il tuo feedback sul budget rivenditore inviato da Timan — richieste di modifica, accettazione o commenti.',
    hu: 'Küldje el visszajelzését a Timan által küldött kereskedői budgetről — módosítások, elfogadás vagy megjegyzések.',
  },
  year: { da: 'Budgetår', en: 'Budget year', de: 'Budgetjahr', it: 'Anno budget', hu: 'Budget év' },
  status: { da: 'Status', en: 'Status', de: 'Status', it: 'Stato', hu: 'Állapot' },
  statusAccept:  { da: 'Accepterer budget', en: 'Accept budget', de: 'Budget annehmen', it: 'Accetto il budget', hu: 'Budget elfogadása' },
  statusAdjust:  { da: 'Ønsker ændringer',  en: 'Request changes', de: 'Änderungen anfragen', it: 'Richiedo modifiche', hu: 'Módosításokat kérek' },
  statusReject:  { da: 'Afviser budget',    en: 'Reject budget',   de: 'Budget ablehnen',     it: 'Rifiuto il budget', hu: 'Budget elutasítása' },
  proposed: { da: 'Foreslået budget (DKK)', en: 'Proposed budget (DKK)', de: 'Vorgeschlagenes Budget (DKK)', it: 'Budget proposto (DKK)', hu: 'Javasolt budget (DKK)' },
  proposedHint: { da: 'Udfyld kun hvis du ønsker et andet beløb end Timans forslag.', en: 'Only fill in if you propose a different amount than Timan\'s.', de: 'Nur ausfüllen, wenn Sie einen anderen Betrag vorschlagen.', it: 'Compila solo se proponi un importo diverso.', hu: 'Csak akkor töltse ki, ha eltérő összeget javasol.' },
  comments: { da: 'Kommentarer', en: 'Comments', de: 'Kommentare', it: 'Commenti', hu: 'Megjegyzések' },
};

export default function BudgetFeedbackFormPage() {
  const { language: lang } = useLanguage();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear + 1);
  const [status, setStatus] = useState<'accept' | 'adjust' | 'reject'>('accept');
  const [proposed, setProposed] = useState<string>('');
  const [comments, setComments] = useState<string>('');

  return (
    <FormSubmitShell
      formType="budget_feedback"
      title={T.title[lang]}
      intro={T.intro[lang]}
      requireDealer={false}
      buildPayload={() => ({
        budget_year: year,
        status,
        proposed_budget_dkk: proposed ? Number(proposed) : null,
        comments: comments.trim() || null,
      })}
      onReset={() => {
        setYear(currentYear + 1);
        setStatus('accept');
        setProposed('');
        setComments('');
      }}
    >
      <Field label={T.year[lang]}>
        <input
          type="number"
          required
          min={2020}
          max={2099}
          value={year}
          onChange={e => setYear(Number(e.target.value))}
          className={inputCls}
        />
      </Field>

      <Field label={T.status[lang]}>
        <select value={status} onChange={e => setStatus(e.target.value as typeof status)} className={inputCls}>
          <option value="accept">{T.statusAccept[lang]}</option>
          <option value="adjust">{T.statusAdjust[lang]}</option>
          <option value="reject">{T.statusReject[lang]}</option>
        </select>
      </Field>

      <Field label={T.proposed[lang]}>
        <input
          type="number"
          min={0}
          step={1000}
          value={proposed}
          onChange={e => setProposed(e.target.value)}
          className={inputCls}
        />
        <span className="block text-xs text-gray-500 mt-1">{T.proposedHint[lang]}</span>
      </Field>

      <Field label={T.comments[lang]}>
        <textarea value={comments} onChange={e => setComments(e.target.value)} className={textareaCls} />
      </Field>
    </FormSubmitShell>
  );
}
