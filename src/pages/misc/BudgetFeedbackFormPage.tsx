import { useMemo, useState } from 'react';
import { useAppUser } from '@/context/AppUserContext';
import FormSubmitShell, { Field, inputCls, textareaCls } from './FormSubmitShell';

const MACHINES = ['Timan 3330', 'RC-751', 'RC-1000s', '2620'] as const;
type MachineKey = typeof MACHINES[number];
type Quarter = 'q1' | 'q2' | 'q3' | 'q4';
const QUARTERS: { key: Quarter; label: string }[] = [
  { key: 'q1', label: '1. Kvartal' },
  { key: 'q2', label: '2. Kvartal' },
  { key: 'q3', label: '3. Kvartal' },
  { key: 'q4', label: '4. Kvartal' },
];
const QTY_OPTIONS = [0, 1, 2, 3, 4, 5] as const;

type ForecastMap = Record<MachineKey, Record<Quarter, number>>;

function emptyForecast(): ForecastMap {
  const m = {} as ForecastMap;
  for (const machine of MACHINES) {
    m[machine] = { q1: 0, q2: 0, q3: 0, q4: 0 };
  }
  return m;
}

const QUALITY_OPTIONS = [
  'Rigtig dårlig kvalitet',
  'Dårlig kvalitet',
  'God kvalitet',
  'Rigtig god kvalitet',
];
const SATISFACTION_OPTIONS = ['Meget tilfreds', 'Tilfreds', 'Utilfreds', 'Meget utilfreds'];
const SIZE_DEMAND_OPTIONS = [
  'Henvendelser på mindre maskiner',
  'Henvendelser på større maskiner',
  'Nej',
  'Henvendelser på begge størrelser',
];

export default function BudgetFeedbackFormPage() {
  const { appUser } = useAppUser();
  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear, currentYear + 1, currentYear + 2];

  const [year, setYear] = useState<number>(currentYear + 1);
  const [companyName, setCompanyName] = useState<string>(appUser?.company_dealer ?? '');
  const [accountNumber, setAccountNumber] = useState<string>(appUser?.dealer_number ?? '');

  const [forecast, setForecast] = useState<ForecastMap>(emptyForecast());

  const [qualityRating, setQualityRating] = useState<string>('');
  const [qualityComment, setQualityComment] = useState<string>('');
  const [supportRating, setSupportRating] = useState<string>('');
  const [supportComment, setSupportComment] = useState<string>('');
  const [trainingRating, setTrainingRating] = useState<string>('');
  const [trainingComment, setTrainingComment] = useState<string>('');

  const [missingTools, setMissingTools] = useState<'' | 'ja' | 'nej'>('');
  const [missingToolsDetail, setMissingToolsDetail] = useState<string>('');
  const [sizeDemand, setSizeDemand] = useState<string>('');
  const [sizeDemandDetail, setSizeDemandDetail] = useState<string>('');

  const [openHouse, setOpenHouse] = useState<'' | 'ja' | 'nej'>('');
  const [openHouseDetail, setOpenHouseDetail] = useState<string>('');

  const title = useMemo(() => `Timan Forecast & Feedback ${year}`, [year]);

  function setForecastCell(machine: MachineKey, q: Quarter, value: number) {
    setForecast(prev => ({ ...prev, [machine]: { ...prev[machine], [q]: value } }));
  }

  function reset() {
    setYear(currentYear + 1);
    setCompanyName(appUser?.company_dealer ?? '');
    setAccountNumber(appUser?.dealer_number ?? '');
    setForecast(emptyForecast());
    setQualityRating('');
    setQualityComment('');
    setSupportRating('');
    setSupportComment('');
    setTrainingRating('');
    setTrainingComment('');
    setMissingTools('');
    setMissingToolsDetail('');
    setSizeDemand('');
    setSizeDemandDetail('');
    setOpenHouse('');
    setOpenHouseDetail('');
  }

  return (
    <FormSubmitShell
      formType="budget_feedback"
      title={title}
      intro="Intern formular: forventet salg pr. kvartal og feedback til Timan."
      requireDealer={false}
      buildPayload={() => ({
        forecast_year: year,
        company_name: companyName.trim(),
        account_number: accountNumber.trim() || null,
        forecast,
        feedback: {
          quality: { rating: qualityRating, comment: qualityComment.trim() || null },
          technical_support: { rating: supportRating, comment: supportComment.trim() || null },
          training: { rating: trainingRating, comment: trainingComment.trim() || null },
        },
        machines_and_equipment: {
          missing_tools: missingTools || null,
          missing_tools_detail: missingTools === 'ja' ? missingToolsDetail.trim() || null : null,
          size_demand: sizeDemand || null,
          size_demand_detail:
            sizeDemand && sizeDemand !== 'Nej' ? sizeDemandDetail.trim() || null : null,
        },
        open_house: {
          has_event: openHouse || null,
          detail: openHouse === 'ja' ? openHouseDetail.trim() || null : null,
        },
      })}
      onReset={reset}
    >
      {/* Year + company */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="År">
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className={inputCls}
            required
          >
            {yearOptions.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </Field>
        <Field label="Firmanavn *">
          <input
            type="text"
            required
            value={companyName}
            onChange={e => setCompanyName(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Kunde nr. / Kontonr.">
          <input
            type="text"
            value={accountNumber}
            onChange={e => setAccountNumber(e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>

      {/* Forecast */}
      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gray-900">Budget – Forventet salg</h3>
        <p className="text-sm text-gray-500">
          Vælg forventet antal pr. kvartal for hver maskine (0–5).
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-lg">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-3 py-2 font-semibold text-gray-700">Maskine / Kvartal</th>
                {QUARTERS.map(q => (
                  <th key={q.key} className="px-3 py-2 font-semibold text-gray-700 text-center">
                    {q.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MACHINES.map(machine => (
                <tr key={machine} className="border-t border-gray-200">
                  <td className="px-3 py-2 font-semibold text-gray-900">{machine}</td>
                  {QUARTERS.map(q => (
                    <td key={q.key} className="px-3 py-2 text-center">
                      <div className="flex flex-wrap justify-center gap-1">
                        {QTY_OPTIONS.map(n => {
                          const id = `${machine}-${q.key}-${n}`;
                          const checked = forecast[machine][q.key] === n;
                          return (
                            <label
                              key={id}
                              htmlFor={id}
                              className={`cursor-pointer text-xs px-2 py-1 rounded border ${
                                checked
                                  ? 'bg-[#2d5a27] text-white border-[#2d5a27]'
                                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              <input
                                id={id}
                                type="radio"
                                name={`${machine}-${q.key}`}
                                value={n}
                                checked={checked}
                                onChange={() => setForecastCell(machine, q.key, n)}
                                className="sr-only"
                              />
                              {n}
                            </label>
                          );
                        })}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Feedback */}
      <section className="space-y-4">
        <h3 className="text-lg font-bold text-gray-900">Hjælp os med at blive bedre</h3>

        <RadioBlock
          label="Hvordan vurderer du kvaliteten af Timan-produkterne, som du sælger?"
          name="quality"
          options={QUALITY_OPTIONS}
          value={qualityRating}
          onChange={setQualityRating}
          required
        />
        <Field label="Uddyb venligst her">
          <textarea value={qualityComment} onChange={e => setQualityComment(e.target.value)} className={textareaCls} />
        </Field>

        <RadioBlock
          label="Hvor tilfreds er du med den tekniske assistance, når du oplever udfordringer?"
          name="support"
          options={SATISFACTION_OPTIONS}
          value={supportRating}
          onChange={setSupportRating}
          required
        />
        <Field label="Uddyb venligst her">
          <textarea value={supportComment} onChange={e => setSupportComment(e.target.value)} className={textareaCls} />
        </Field>

        <RadioBlock
          label="Hvordan vurderer du den træning og produktdemonstrationer, du har modtaget fra Timan?"
          name="training"
          options={SATISFACTION_OPTIONS}
          value={trainingRating}
          onChange={setTrainingRating}
          required
        />
        <Field label="Uddyb venligst her">
          <textarea value={trainingComment} onChange={e => setTrainingComment(e.target.value)} className={textareaCls} />
        </Field>
      </section>

      {/* Machines and equipment */}
      <section className="space-y-4">
        <h3 className="text-lg font-bold text-gray-900">Maskiner og Udstyr</h3>

        <RadioBlock
          label="Savner du nogle redskaber eller udstyr til vores maskiner?"
          name="missing_tools"
          options={['Ja', 'Nej']}
          value={missingTools === 'ja' ? 'Ja' : missingTools === 'nej' ? 'Nej' : ''}
          onChange={v => setMissingTools(v === 'Ja' ? 'ja' : 'nej')}
          required
        />
        {missingTools === 'ja' && (
          <Field label="Uddyb hvilke redskaber/udstyr">
            <textarea
              value={missingToolsDetail}
              onChange={e => setMissingToolsDetail(e.target.value)}
              className={textareaCls}
            />
          </Field>
        )}

        <RadioBlock
          label="Har I forespørgsler på maskiner, der er større eller mindre end vores udvalg?"
          name="size_demand"
          options={SIZE_DEMAND_OPTIONS}
          value={sizeDemand}
          onChange={setSizeDemand}
          required
        />
        {sizeDemand && sizeDemand !== 'Nej' && (
          <Field label="Uddyb venligst">
            <textarea
              value={sizeDemandDetail}
              onChange={e => setSizeDemandDetail(e.target.value)}
              className={textareaCls}
            />
          </Field>
        )}
      </section>

      {/* Open house */}
      <section className="space-y-4">
        <h3 className="text-lg font-bold text-gray-900">Åbent hus eller andre arrangementer</h3>
        <p className="text-sm text-gray-500">
          Vi hjælper gerne med udstillingsmateriale og maskiner.
        </p>

        <RadioBlock
          label="Har I nogle åbent hus arrangementer?"
          name="open_house"
          options={['Ja', 'Nej']}
          value={openHouse === 'ja' ? 'Ja' : openHouse === 'nej' ? 'Nej' : ''}
          onChange={v => setOpenHouse(v === 'Ja' ? 'ja' : 'nej')}
          required
        />
        {openHouse === 'ja' && (
          <Field label="Beskriv arrangement, dato/periode og behov">
            <textarea
              value={openHouseDetail}
              onChange={e => setOpenHouseDetail(e.target.value)}
              className={textareaCls}
            />
          </Field>
        )}
      </section>
    </FormSubmitShell>
  );
}

function RadioBlock({
  label,
  name,
  options,
  value,
  onChange,
  required,
}: {
  label: string;
  name: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-gray-800 mb-1.5">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => {
          const id = `${name}-${opt}`;
          const checked = value === opt;
          return (
            <label
              key={id}
              htmlFor={id}
              className={`cursor-pointer text-sm px-3 py-2 rounded-lg border ${
                checked
                  ? 'bg-[#2d5a27] text-white border-[#2d5a27]'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              <input
                id={id}
                type="radio"
                name={name}
                value={opt}
                checked={checked}
                onChange={() => onChange(opt)}
                required={required}
                className="sr-only"
              />
              {opt}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
