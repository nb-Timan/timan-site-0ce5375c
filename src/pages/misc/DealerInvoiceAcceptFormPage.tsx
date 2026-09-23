import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import FormSubmitShell, { Field, inputCls, textareaCls } from './FormSubmitShell';
import { Language } from '@/types/configurator';
import { useAppUser } from '@/context/AppUserContext';
import { useEffectivePortalUser } from '@/lib/viewAsUser';
import { useDealerScope } from '@/lib/dealerScope';
import { listPartnerDataDealers } from '@/lib/partnerDataScope';
import { listDemoDealerPeople } from '@/lib/crmDemoDealerPeople';
import { academyPartnerDataSandbox } from '@/lib/academyPartnerDataSandbox';
import {
  personForInvoiceAccept,
  preferredInvoiceAcceptCompany,
  preferredInvoiceAcceptPerson,
  type DealerInvoiceAcceptCompany,
  type DealerInvoiceAcceptPerson,
} from '@/lib/dealerInvoiceAcceptIdentity';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const T: Record<string, Record<Language, string>> = {
  title: {
    da: 'Forhandler Accept - Fakturering',
    en: 'Dealer Acceptance - Invoicing',
    de: 'Händler-Annahme - Fakturierung',
    it: 'Accettazione Rivenditore - Fatturazione',
    hu: 'Kereskedői elfogadás - Számlázás',
  },
  intro: {
    da:
      'Denne formular definerer, hvorvidt den omtalte virksomhed må købe reservedele hos os i samarbejde med jer.\n\n' +
      'Herunder udfylder I formularen som dokumentation for, at I har accepteret eller afslået et samarbejde med det nedenfor nævnte firma.',
    en:
      'This form defines whether the company mentioned below may purchase spare parts from us in cooperation with you.\n\n' +
      'Below you fill in the form as documentation that you have accepted or declined a cooperation with the company named below.',
    de:
      'Dieses Formular legt fest, ob das unten genannte Unternehmen Ersatzteile bei uns in Zusammenarbeit mit Ihnen kaufen darf.\n\n' +
      'Unten füllen Sie das Formular als Dokumentation aus, dass Sie eine Zusammenarbeit mit dem unten genannten Unternehmen angenommen oder abgelehnt haben.',
    it:
      'Questo modulo definisce se l\'azienda menzionata può acquistare ricambi da noi in collaborazione con voi.\n\n' +
      'Di seguito compilate il modulo come documentazione di aver accettato o rifiutato una collaborazione con l\'azienda indicata.',
    hu:
      'Ez az űrlap meghatározza, hogy az említett cég vásárolhat-e tőlünk alkatrészeket az Önökkel való együttműködésben.\n\n' +
      'Az alábbi űrlap kitöltése dokumentálja, hogy elfogadták vagy elutasították a megnevezett céggel való együttműködést.',
  },

  benefitsTitle: {
    da: 'Fordele ved at acceptere fakturering gennem jeres virksomhed:',
    en: 'Benefits of accepting invoicing through your company:',
    de: 'Vorteile der Fakturierung über Ihr Unternehmen:',
    it: 'Vantaggi dell\'accettazione della fatturazione tramite la vostra azienda:',
    hu: 'Az Önök cégén keresztüli számlázás elfogadásának előnyei:',
  },

  yourCompany: { da: 'Virksomhed', en: 'Company', de: 'Unternehmen', it: 'Azienda', hu: 'Vállalat' },
  yourName:    { da: 'Dit navn', en: 'Your name', de: 'Ihr Name', it: 'Il tuo nome', hu: 'Az Ön neve' },
  selectCompany: { da: 'Vælg virksomhed', en: 'Select company', de: 'Unternehmen auswählen', it: 'Seleziona azienda', hu: 'Válasszon vállalatot' },
  selectPerson: { da: 'Vælg person', en: 'Select person', de: 'Person auswählen', it: 'Seleziona persona', hu: 'Válasszon személyt' },
  noPeople: { da: 'Ingen aktive personer er tilgængelige for denne virksomhed.', en: 'No active people are available for this company.', de: 'Für dieses Unternehmen sind keine aktiven Personen verfügbar.', it: 'Non sono disponibili persone attive per questa azienda.', hu: 'Ehhez a vállalathoz nem érhetők el aktív személyek.' },
  decisionLbl: { da: 'Vælg om fakturering er tilladt gennem jeres virksomhed eller ej', en: 'Choose whether invoicing is allowed through your company or not', de: 'Wählen Sie, ob die Fakturierung über Ihr Unternehmen erlaubt ist oder nicht', it: 'Scegli se la fatturazione è consentita tramite la vostra azienda o no', hu: 'Válassza ki, hogy engedélyezett-e a számlázás az Önök cégén keresztül vagy sem' },

  optAccept: { da: 'Ja, nedenstående virksomhed må faktureres gennem vores virksomhed', en: 'Yes, the company below may be invoiced through our company', de: 'Ja, das unten genannte Unternehmen darf über unser Unternehmen fakturiert werden', it: 'Sì, l\'azienda indicata può essere fatturata tramite la nostra azienda', hu: 'Igen, az alábbi cég számlázható a mi cégünkön keresztül' },
  optReject: { da: 'Nej, nedenstående virksomhed må ikke faktureres gennem vores virksomhed, men delene skal bestilles hos os.', en: 'No, the company below may not be invoiced through our company, but the parts must be ordered from us.', de: 'Nein, das unten genannte Unternehmen darf nicht über unser Unternehmen fakturiert werden, aber die Teile müssen bei uns bestellt werden.', it: 'No, l\'azienda indicata non può essere fatturata tramite la nostra azienda, ma i ricambi devono essere ordinati da noi.', hu: 'Nem, az alábbi cég nem számlázható a mi cégünkön keresztül, de az alkatrészeket nálunk kell rendelni.' },
  optDecline:{ da: 'Vi ønsker ikke at samarbejde med nedenstående virksomhed.', en: 'We do not wish to cooperate with the company below.', de: 'Wir möchten nicht mit dem unten genannten Unternehmen zusammenarbeiten.', it: 'Non desideriamo collaborare con l\'azienda indicata.', hu: 'Nem kívánunk együttműködni az alábbi céggel.' },

  thirdCompanyAccept: { da: 'Firma navn som må købe igennem jeres virksomhed', en: 'Name of the company that may purchase through your business', de: 'Firmenname, der über Ihr Unternehmen kaufen darf', it: 'Nome dell\'azienda che può acquistare tramite la vostra attività', hu: 'A cég neve, amely az Önök cégén keresztül vásárolhat' },
  thirdCvrAccept:     { da: 'CVR på firmaet der må købe igennem jeres virksomhed', en: 'VAT/CVR of the company that may purchase through your business', de: 'USt-IdNr./CVR des Unternehmens, das über Ihr Unternehmen kaufen darf', it: 'P.IVA/CVR dell\'azienda che può acquistare tramite la vostra attività', hu: 'A vásárlásra jogosult cég adószáma/CVR-je' },

  thirdCompanyReject: { da: 'Firma navn der ikke må købe igennem jeres virksomhed', en: 'Name of the company that may NOT purchase through your business', de: 'Firmenname, der NICHT über Ihr Unternehmen kaufen darf', it: 'Nome dell\'azienda che NON può acquistare tramite la vostra attività', hu: 'A cég neve, amely NEM vásárolhat az Önök cégén keresztül' },
  thirdCvrReject:     { da: 'CVR på firmaet der ikke må købe igennem jeres virksomhed', en: 'VAT/CVR of the company that may NOT purchase through your business', de: 'USt-IdNr./CVR des Unternehmens, das NICHT über Ihr Unternehmen kaufen darf', it: 'P.IVA/CVR dell\'azienda che NON può acquistare tramite la vostra attività', hu: 'A vásárlásra NEM jogosult cég adószáma/CVR-je' },

  otherLbl: { da: 'Andet / Kommentar (f.eks. faktura-mail)', en: 'Other / Comment (e.g. invoice email)', de: 'Sonstiges / Kommentar (z. B. Rechnungs-E-Mail)', it: 'Altro / Commento (es. email per fatturazione)', hu: 'Egyéb / Megjegyzés (pl. számla e-mail)' },
};

const BENEFITS: Record<Language, string[]> = {
  da: [
    'Den pågældende virksomhed kan selv finde og bestille reservedele.',
    'Den pågældende virksomhed kan vælge direkte levering til sig selv.',
    'Den pågældende virksomhed har kun adgang til bruttopriser.',
    'I modtager en faktura fra Timan, som I kan viderefakturere.',
  ],
  en: [
    'The company can find and order spare parts themselves.',
    'The company can choose direct delivery to themselves.',
    'The company only has access to gross prices.',
    'You receive an invoice from Timan that you can re-invoice.',
  ],
  de: [
    'Das betreffende Unternehmen kann selbst Ersatzteile finden und bestellen.',
    'Das betreffende Unternehmen kann die Lieferung direkt an sich selbst wählen.',
    'Das betreffende Unternehmen hat nur Zugriff auf Bruttopreise.',
    'Sie erhalten eine Rechnung von Timan, die Sie weiterberechnen können.',
  ],
  it: [
    'L\'azienda può trovare e ordinare i ricambi autonomamente.',
    'L\'azienda può scegliere la consegna diretta a sé stessa.',
    'L\'azienda ha accesso solo ai prezzi lordi.',
    'Voi ricevete una fattura da Timan che potete rifatturare.',
  ],
  hu: [
    'Az adott cég maga találhatja meg és rendelheti az alkatrészeket.',
    'Az adott cég választhatja a közvetlen szállítást saját magához.',
    'Az adott cégnek csak bruttó árakhoz van hozzáférése.',
    'Önök számlát kapnak a Timantól, amelyet továbbszámlázhatnak.',
  ],
};

type Decision = 'accept' | 'reject' | 'decline';

export default function DealerInvoiceAcceptFormPage() {
  const { language: lang } = useLanguage();
  const { appUser } = useAppUser();
  const effectiveUser = useEffectivePortalUser(appUser);
  const scope = useDealerScope({ requireDealer: true });
  const academyMode = academyPartnerDataSandbox.isActive();
  const [companies, setCompanies] = useState<DealerInvoiceAcceptCompany[]>([]);
  const [people, setPeople] = useState<DealerInvoiceAcceptPerson[]>([]);
  const [selectedCompanyNumber, setSelectedCompanyNumber] = useState('');
  const [selectedPersonKey, setSelectedPersonKey] = useState('');
  const [decision, setDecision] = useState<Decision | ''>('');
  const [thirdCompany, setThirdCompany] = useState('');
  const [thirdCvr, setThirdCvr] = useState('');
  const [other, setOther] = useState('');

  const showFields = decision !== '';
  const isAccept = decision === 'accept';
  const selectedCompany = useMemo(
    () => companies.find((company) => company.accountNumber === selectedCompanyNumber) ?? null,
    [companies, selectedCompanyNumber],
  );
  const selectedPerson = useMemo(
    () => personForInvoiceAccept(people, selectedPersonKey),
    [people, selectedPersonKey],
  );

  useEffect(() => {
    let cancelled = false;
    if (academyMode) {
      const localCompanies = academyPartnerDataSandbox.listDealers()
        .filter((dealer) => !dealer.is_deleted && !dealer.is_blocked)
        .map((dealer) => ({ id: dealer.id, accountNumber: dealer.account_number, name: dealer.company_name }));
      if (!cancelled) {
        setCompanies(localCompanies);
        setSelectedCompanyNumber((current) => current || preferredInvoiceAcceptCompany(localCompanies, effectiveUser?.dealer_number));
      }
      return () => { cancelled = true; };
    }

    if (!effectiveUser || !scope.role) {
      setCompanies([]);
      setSelectedCompanyNumber('');
      return () => { cancelled = true; };
    }
    void listPartnerDataDealers(effectiveUser, scope.role).then((result) => {
      if (cancelled) return;
      const scopedCompanies = result.rows
        .filter((dealer) => !dealer.is_deleted && !dealer.is_blocked)
        .map((dealer) => ({ id: dealer.id, accountNumber: dealer.account_number, name: dealer.company_name }));
      setCompanies(scopedCompanies);
      setSelectedCompanyNumber((current) => {
        if (scopedCompanies.some((company) => company.accountNumber === current)) return current;
        return preferredInvoiceAcceptCompany(scopedCompanies, effectiveUser.dealer_number);
      });
    });
    return () => { cancelled = true; };
  }, [academyMode, effectiveUser, scope.role]);

  useEffect(() => {
    let cancelled = false;
    setPeople([]);
    setSelectedPersonKey('');
    if (!selectedCompany) return () => { cancelled = true; };

    if (academyMode) {
      const localPeople = academyPartnerDataSandbox.listInvoiceAcceptPeople(selectedCompany.accountNumber);
      if (!cancelled) {
        setPeople(localPeople);
        setSelectedPersonKey(preferredInvoiceAcceptPerson(localPeople, effectiveUser?.id));
      }
      return () => { cancelled = true; };
    }

    void listDemoDealerPeople(selectedCompany.accountNumber, selectedCompany.id).then((rows) => {
      if (cancelled) return;
      const scopedPeople: DealerInvoiceAcceptPerson[] = rows.map((person) => ({
        key: person.key, id: person.id, name: person.name, email: person.email, source: person.source,
      }));
      setPeople(scopedPeople);
      setSelectedPersonKey(preferredInvoiceAcceptPerson(scopedPeople, effectiveUser?.id));
    });
    return () => { cancelled = true; };
  }, [academyMode, effectiveUser?.id, selectedCompany]);

  const decisionLabel = (d: Decision) =>
    d === 'accept' ? T.optAccept[lang] : d === 'reject' ? T.optReject[lang] : T.optDecline[lang];

  return (
    <FormSubmitShell
      formType="dealer_invoice_accept"
      title={T.title[lang]}
      intro={T.intro[lang]}
      requireDealer
      dealerSelection={selectedCompany ? { accountNumber: selectedCompany.accountNumber, companyName: selectedCompany.name } : undefined}
      buildPayload={() => {
        if (!decision || !selectedCompany || !selectedPerson) return null;
        return {
          your_company_name: selectedCompany.name,
          your_name: selectedPerson.name,
          selected_company_id: selectedCompany.id,
          selected_company_account_number: selectedCompany.accountNumber,
          selected_person_id: selectedPerson.id,
          selected_person_source: selectedPerson.source,
          selected_person_email: selectedPerson.email,
          decision,
          decision_label: decisionLabel(decision),
          third_party_company_name: thirdCompany.trim(),
          third_party_cvr: thirdCvr.trim(),
          other_comment: isAccept ? null : (other.trim() || null),
        };
      }}
      onReset={() => {
        setDecision('');
        setThirdCompany(''); setThirdCvr(''); setOther('');
      }}
    >
      <div className="rounded-lg bg-green-50 border border-green-200 p-4">
        <p className="text-sm font-semibold text-[#2d5a27] mb-2">{T.benefitsTitle[lang]}</p>
        <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
          {BENEFITS[lang].map((b, i) => <li key={i}>{b}</li>)}
        </ul>
      </div>

      <Field label={T.yourCompany[lang]}>
        <Select value={selectedCompanyNumber} onValueChange={setSelectedCompanyNumber}>
          <SelectTrigger aria-label={T.yourCompany[lang]}><SelectValue placeholder={T.selectCompany[lang]} /></SelectTrigger>
          <SelectContent>
            {companies.map((company) => <SelectItem key={company.id} value={company.accountNumber}>{company.name} · #{company.accountNumber}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>

      <Field label={T.yourName[lang]}>
        <Select value={selectedPersonKey} onValueChange={setSelectedPersonKey} disabled={!selectedCompany || people.length === 0}>
          <SelectTrigger aria-label={T.yourName[lang]}><SelectValue placeholder={T.selectPerson[lang]} /></SelectTrigger>
          <SelectContent>
            {people.map((person) => <SelectItem key={person.key} value={person.key}>{person.name}{person.email ? ` · ${person.email}` : ''}</SelectItem>)}
          </SelectContent>
        </Select>
        {selectedCompany && people.length === 0 && <p className="mt-1.5 text-xs text-amber-700">{T.noPeople[lang]}</p>}
      </Field>

      <fieldset>
        <legend className="block text-sm font-semibold text-gray-800 mb-2">{T.decisionLbl[lang]}</legend>
        <div className="space-y-2">
          {(['accept', 'reject', 'decline'] as Decision[]).map(d => (
            <label
              key={d}
              className={`flex items-start gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                decision === d ? 'border-[#2d5a27] bg-green-50' : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <input
                type="radio"
                name="decision"
                value={d}
                required
                checked={decision === d}
                onChange={() => setDecision(d)}
                className="mt-0.5 h-4 w-4 accent-[#2d5a27]"
              />
              <span className="text-sm text-gray-800">{decisionLabel(d)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {showFields && (
        <>
          <Field label={isAccept ? T.thirdCompanyAccept[lang] : T.thirdCompanyReject[lang]}>
            <input type="text" required value={thirdCompany} onChange={e => setThirdCompany(e.target.value)} className={inputCls} />
          </Field>

          <Field label={isAccept ? T.thirdCvrAccept[lang] : T.thirdCvrReject[lang]}>
            <input type="text" required value={thirdCvr} onChange={e => setThirdCvr(e.target.value)} className={inputCls} />
          </Field>

          {!isAccept && (
            <Field label={T.otherLbl[lang]}>
              <textarea value={other} onChange={e => setOther(e.target.value)} className={textareaCls} />
            </Field>
          )}
        </>
      )}
    </FormSubmitShell>
  );
}
