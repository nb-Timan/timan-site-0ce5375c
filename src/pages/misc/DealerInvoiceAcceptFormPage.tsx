import { useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import FormSubmitShell, { Field, inputCls, textareaCls } from './FormSubmitShell';
import { Language } from '@/types/configurator';

const T: Record<string, Record<Language, string>> = {
  title: { da: 'Forhandler faktura-accept', en: 'Dealer invoice acceptance', de: 'Händler-Rechnungsannahme', it: 'Accettazione fattura rivenditore', hu: 'Kereskedői számla elfogadás' },
  intro: {
    da: 'Bekræft modtagelse og accept af en faktura fra Timan. Indsendelsen gemmes på din forhandler.',
    en: 'Confirm receipt and acceptance of an invoice from Timan. The submission is saved against your dealer.',
    de: 'Bestätigen Sie den Erhalt und die Annahme einer Rechnung von Timan. Die Einreichung wird Ihrem Händler zugeordnet.',
    it: 'Conferma ricezione e accettazione di una fattura Timan. L\'invio viene salvato sul tuo rivenditore.',
    hu: 'Erősítse meg a Timan számla átvételét és elfogadását. A beküldés a kereskedőjéhez kerül mentésre.',
  },
  invoiceNo: { da: 'Fakturanummer', en: 'Invoice number', de: 'Rechnungsnummer', it: 'Numero fattura', hu: 'Számla száma' },
  invoiceDate: { da: 'Fakturadato', en: 'Invoice date', de: 'Rechnungsdatum', it: 'Data fattura', hu: 'Számla dátuma' },
  amount: { da: 'Beløb (DKK)', en: 'Amount (DKK)', de: 'Betrag (DKK)', it: 'Importo (DKK)', hu: 'Összeg (DKK)' },
  decision: { da: 'Beslutning', en: 'Decision', de: 'Entscheidung', it: 'Decisione', hu: 'Döntés' },
  accept:  { da: 'Acceptér',  en: 'Accept',  de: 'Annehmen', it: 'Accetto',  hu: 'Elfogadom' },
  dispute: { da: 'Bestrid',   en: 'Dispute', de: 'Bestreiten', it: 'Contesto', hu: 'Vitatom' },
  comments: { da: 'Bemærkninger', en: 'Comments', de: 'Bemerkungen', it: 'Note', hu: 'Megjegyzések' },
};

export default function DealerInvoiceAcceptFormPage() {
  const { language: lang } = useLanguage();
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [amount, setAmount] = useState('');
  const [decision, setDecision] = useState<'accept' | 'dispute'>('accept');
  const [comments, setComments] = useState('');

  return (
    <FormSubmitShell
      formType="dealer_invoice_accept"
      title={T.title[lang]}
      intro={T.intro[lang]}
      requireDealer
      buildPayload={() => ({
        invoice_number: invoiceNo.trim(),
        invoice_date: invoiceDate || null,
        amount_dkk: amount ? Number(amount) : null,
        decision,
        comments: comments.trim() || null,
      })}
      onReset={() => {
        setInvoiceNo(''); setInvoiceDate(''); setAmount('');
        setDecision('accept'); setComments('');
      }}
    >
      <Field label={T.invoiceNo[lang]}>
        <input type="text" required value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} className={inputCls} />
      </Field>

      <Field label={T.invoiceDate[lang]}>
        <input type="date" required value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className={inputCls} />
      </Field>

      <Field label={T.amount[lang]}>
        <input type="number" required min={0} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className={inputCls} />
      </Field>

      <Field label={T.decision[lang]}>
        <select value={decision} onChange={e => setDecision(e.target.value as typeof decision)} className={inputCls}>
          <option value="accept">{T.accept[lang]}</option>
          <option value="dispute">{T.dispute[lang]}</option>
        </select>
      </Field>

      <Field label={T.comments[lang]}>
        <textarea value={comments} onChange={e => setComments(e.target.value)} className={textareaCls} />
      </Field>
    </FormSubmitShell>
  );
}
