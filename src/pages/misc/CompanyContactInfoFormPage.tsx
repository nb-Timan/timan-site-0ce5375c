import { useMemo, useState, useEffect, FormEvent } from 'react';
import { CheckCircle2, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { useDealerScope } from '@/lib/dealerScope';
import { getCompanyContactInfoCopy } from '@/lib/i18n/companyContactInfoTranslations';
import MiscPageShell from './MiscPageShell';
import { submitPortalForm, PortalFormSubmission } from '@/lib/portalFormsService';
import AddressAutocomplete, { type ResolvedAddress } from '@/components/crm/AddressAutocomplete';

// ──────────────────────────────────────────────────────────────────────────────
// Phase 49 — company_contact_info
// Multi-step internal portal form. Stores everything in payload jsonb.
// ──────────────────────────────────────────────────────────────────────────────

type DealerKind = 'new' | 'existing' | '';

interface ExtraPerson {
  name: string;
  phone: string;
  email: string;
  comment: string;
}

const blankPerson = (): ExtraPerson => ({ name: '', phone: '', email: '', comment: '' });

const inputCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d5a27]/30 focus:border-[#2d5a27]';
const textareaCls = inputCls + ' min-h-[120px]';
const labelCls = 'block text-sm font-semibold text-gray-800 mb-1.5';
const reqMark = <span className="text-red-600 ml-0.5">*</span>;

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export default function CompanyContactInfoFormPage() {
  const { appUser } = useAppUser();
  const { uiLanguage } = useLanguage();
  const scope = useDealerScope();
  const navigate = useNavigate();
  const copy = getCompanyContactInfoCopy(uiLanguage);
  const sections = copy.sections;

  // ── Section 1: Firma
  const [companyName, setCompanyName] = useState(scope.lockedDealerName ?? appUser?.company_dealer ?? '');
  const [dealerKind, setDealerKind] = useState<DealerKind>(
    scope.isExternalDealerUser ? 'existing' : (appUser?.dealer_number ? 'existing' : ''),
  );

  // Når scope-data lander (asynkront): prefill firmanavn for ekstern bruger.
  useEffect(() => {
    if (scope.isExternalDealerUser) {
      setDealerKind('existing');
      if (scope.lockedDealerName) setCompanyName(scope.lockedDealerName);
    }
  }, [scope.isExternalDealerUser, scope.lockedDealerName]);

  const [address, setAddress] = useState('');
  const [zipCity, setZipCity] = useState('');
  const [country, setCountry] = useState('');
  const [vat, setVat] = useState('');
  const [ceoName, setCeoName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  // ── Section 2: Økonomi
  const [finName, setFinName] = useState('');
  const [finPhone, setFinPhone] = useState('');
  const [finEmail, setFinEmail] = useState('');
  const [invoiceEmail, setInvoiceEmail] = useState('');

  // ── Section 3: Medier
  const [website, setWebsite] = useState('');
  const [facebook, setFacebook] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [tiktok, setTiktok] = useState('');
  const [youtube, setYoutube] = useState('');
  const [instagram, setInstagram] = useState('');

  // ── Section 4: Salg
  const [salesName, setSalesName] = useState('');
  const [salesPhone, setSalesPhone] = useState('');
  const [salesEmail, setSalesEmail] = useState('');
  const [moreSales, setMoreSales] = useState<'ja' | 'nej' | ''>('');
  const [salesExtras, setSalesExtras] = useState<ExtraPerson[]>([]);

  // ── Section 5: Værksted / reservedele
  const [wpName, setWpName] = useState('');
  const [wpPhone, setWpPhone] = useState('');
  const [wpEmail, setWpEmail] = useState('');
  const [moreWp, setMoreWp] = useState<'ja' | 'nej' | ''>('');
  const [wpExtras, setWpExtras] = useState<ExtraPerson[]>([]);

  // ── Section 6: Marketing
  const [mktName, setMktName] = useState('');
  const [mktPhone, setMktPhone] = useState('');
  const [mktEmail, setMktEmail] = useState('');

  // ── Section 7
  const [finalComment, setFinalComment] = useState('');

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<PortalFormSubmission | null>(null);

  // ── Per-step validation
  const stepErrors = useMemo<string | null>(() => {
    switch (step) {
      case 0:
        if (!companyName.trim()) return 'Firma Navn er påkrævet.';
        if (!dealerKind) return 'Vælg Ny eller Eksisterende forhandler.';
        if (!address.trim()) return 'Firma Adresse er påkrævet.';
        if (!zipCity.trim()) return 'Postnummer og by er påkrævet.';
        if (!country.trim()) return 'Land er påkrævet.';
        if (!vat.trim()) return 'CVR / VAT er påkrævet.';
        if (!ceoName.trim()) return 'Direktør navn er påkrævet.';
        if (!phone.trim()) return 'Telefon er påkrævet.';
        if (!email.trim() || !isEmail(email)) return 'Gyldig e-mail er påkrævet.';
        return null;
      case 1:
        if (!finName.trim()) return 'Økonomi kontaktperson er påkrævet.';
        if (!invoiceEmail.trim() || !isEmail(invoiceEmail)) return 'Gyldig e-mail til faktura er påkrævet.';
        if (finEmail.trim() && !isEmail(finEmail)) return 'Ugyldig e-mail til økonomi.';
        return null;
      case 2:
        if (!website.trim()) return 'Hjemmeside adresse er påkrævet.';
        return null;
      case 3:
        if (!moreSales) return 'Angiv om der er flere salgspersoner.';
        if (salesEmail.trim() && !isEmail(salesEmail)) return 'Ugyldig e-mail til salg.';
        if (moreSales === 'ja') {
          for (const p of salesExtras) {
            if (!p.name.trim()) return 'Udfyld navn på alle ekstra salgspersoner.';
            if (p.email.trim() && !isEmail(p.email)) return 'Ugyldig e-mail på ekstra salgsperson.';
          }
        }
        return null;
      case 4:
        if (!moreWp) return 'Angiv om der er flere personer i værksted/reservedele.';
        if (wpEmail.trim() && !isEmail(wpEmail)) return 'Ugyldig e-mail til værksted/reservedele.';
        if (moreWp === 'ja') {
          for (const p of wpExtras) {
            if (!p.name.trim()) return 'Udfyld navn på alle ekstra værksted-/reservedelspersoner.';
            if (p.email.trim() && !isEmail(p.email)) return 'Ugyldig e-mail på ekstra værksted-/reservedelsperson.';
          }
        }
        return null;
      case 5:
        if (mktEmail.trim() && !isEmail(mktEmail)) return 'Ugyldig e-mail til marketing.';
        return null;
      case 6:
        return null;
      default:
        return null;
    }
  }, [
    step, companyName, dealerKind, address, zipCity, country, vat, ceoName, phone, email,
    finName, finEmail, invoiceEmail, website,
    moreSales, salesEmail, salesExtras,
    moreWp, wpEmail, wpExtras,
    mktEmail,
  ]);

  const isLast = step === sections.length - 1;

  function next() {
    if (stepErrors) {
      toast.error(stepErrors);
      return;
    }
    setStep((s) => Math.min(sections.length - 1, s + 1));
  }
  function prev() {
    setStep((s) => Math.max(0, s - 1));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (stepErrors) {
      toast.error(stepErrors);
      return;
    }

    const payload = {
      dealer_kind: dealerKind, // 'new' | 'existing'
      company: {
        name: companyName.trim(),
        address: address.trim(),
        zip_city: zipCity.trim(),
        country: country.trim(),
        vat: vat.trim(),
        ceo_name: ceoName.trim(),
        phone: phone.trim(),
        email: email.trim(),
      },
      finance: {
        contact_name: finName.trim(),
        phone: finPhone.trim() || null,
        email: finEmail.trim() || null,
        invoice_email: invoiceEmail.trim(),
      },
      media: {
        website: website.trim(),
        facebook: facebook.trim() || null,
        linkedin: linkedin.trim() || null,
        tiktok: tiktok.trim() || null,
        youtube: youtube.trim() || null,
        instagram: instagram.trim() || null,
      },
      sales: {
        contact_name: salesName.trim() || null,
        phone: salesPhone.trim() || null,
        email: salesEmail.trim() || null,
        more_people: moreSales,
        extras: moreSales === 'ja' ? salesExtras.map((p) => ({
          name: p.name.trim(), phone: p.phone.trim() || null, email: p.email.trim() || null, comment: p.comment.trim() || null,
        })) : [],
      },
      workshop_parts: {
        contact_name: wpName.trim() || null,
        phone: wpPhone.trim() || null,
        email: wpEmail.trim() || null,
        more_people: moreWp,
        extras: moreWp === 'ja' ? wpExtras.map((p) => ({
          name: p.name.trim(), phone: p.phone.trim() || null, email: p.email.trim() || null, comment: p.comment.trim() || null,
        })) : [],
      },
      marketing: {
        contact_name: mktName.trim() || null,
        phone: mktPhone.trim() || null,
        email: mktEmail.trim() || null,
      },
      final_comment: finalComment.trim() || null,
    };

    setSubmitting(true);
    try {
      // Ekstern bruger: altid låst dealer_number (uanset UI).
      // Intern / "Ny forhandler": kan være null.
      const dealerNumber = scope.isExternalDealerUser
        ? scope.lockedDealerNumber
        : (dealerKind === 'existing' ? (appUser?.dealer_number ?? null) : null);
      const dealerNameOut = scope.isExternalDealerUser
        ? (scope.lockedDealerName ?? (companyName.trim() || null))
        : (companyName.trim() || appUser?.company_dealer || null);
      const row = await submitPortalForm({
        form_type: 'company_contact_info',
        dealer_account_number: dealerNumber,
        dealer_name: dealerNameOut,
        payload,
      });
      setReceipt(row);
    } catch (err) {
      console.error('[company-contact-info] submit failed', err);
      toast.error('Kunne ikke indsende formularen. ' + (err instanceof Error ? err.message : ''));
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Receipt
  if (receipt) {
    return (
      <MiscPageShell title={copy.title} subtitle={copy.subtitle} backTo="/portal/misc/forms">
        <div className="max-w-3xl bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-7 w-7 text-[#2d5a27]" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Tak — din indsendelse er modtaget.</h2>
              <p className="text-sm text-gray-500 mt-1">
                Reference: <span className="font-mono">{receipt.id.slice(0, 8)}</span>
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {new Date(receipt.created_at).toLocaleString('da-DK')}
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { setReceipt(null); setStep(0); }}
              className="px-4 py-2 rounded-lg bg-[#2d5a27] text-white text-sm font-semibold hover:bg-[#244a20]"
            >
              Send en ny
            </button>
            <button
              type="button"
              onClick={() => navigate('/portal/misc/forms')}
              className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50"
            >
              Tilbage til formularer
            </button>
          </div>
        </div>
      </MiscPageShell>
    );
  }

  return (
    <MiscPageShell title={copy.title} subtitle={copy.subtitle} intro={copy.intro} backTo="/portal/misc/forms">
      <div className="max-w-3xl">
        {/* Stepper */}
        <ol className="flex flex-wrap gap-2 mb-6 text-xs">
          {sections.map((s, i) => (
            <li
              key={s}
              className={
                'px-3 py-1.5 rounded-full border ' +
                (i === step
                  ? 'bg-[#2d5a27] text-white border-[#2d5a27]'
                  : i < step
                    ? 'bg-[#2d5a27]/10 text-[#2d5a27] border-[#2d5a27]/30'
                    : 'bg-white text-gray-500 border-gray-200')
              }
            >
              {s}
            </li>
          ))}
        </ol>

        <form
          onSubmit={(e) => { if (isLast) handleSubmit(e); else { e.preventDefault(); next(); } }}
          className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm space-y-6"
        >
          <h2 className="text-lg font-bold text-gray-900">{sections[step]}</h2>

          {step === 0 && (
            <>
              <div>
                <label className={labelCls}>Firma Navn{reqMark}</label>
                <input
                  className={inputCls + (scope.isExternalDealerUser ? ' bg-gray-100 cursor-not-allowed' : '')}
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  readOnly={scope.isExternalDealerUser}
                  disabled={scope.isExternalDealerUser}
                />
              </div>
              <div>
                <span className={labelCls}>Forhandler{reqMark}</span>
                <div className="flex flex-col gap-2">
                  <label className="inline-flex items-center gap-2 text-sm text-gray-800">
                    <input
                      type="radio"
                      name="dealerKind"
                      checked={dealerKind === 'new'}
                      onChange={() => setDealerKind('new')}
                      disabled={scope.isExternalDealerUser}
                    />
                    Ny forhandler
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-gray-800">
                    <input
                      type="radio"
                      name="dealerKind"
                      checked={dealerKind === 'existing'}
                      onChange={() => setDealerKind('existing')}
                      disabled={scope.isExternalDealerUser}
                    />
                    Eksisterende forhandler
                    {scope.lockedDealerNumber ? (
                      <span className="ml-1 text-xs text-gray-500">
                        (tilknyttet {scope.lockedDealerName ?? scope.lockedDealerNumber} #{scope.lockedDealerNumber})
                      </span>
                    ) : appUser?.dealer_number && (
                      <span className="ml-1 text-xs text-gray-500">(tilknyttet {appUser.dealer_number})</span>
                    )}
                  </label>
                  {scope.isExternalDealerUser && (
                    <p className="text-xs text-gray-500">
                      Din bruger er låst til din egen forhandler — kan ikke ændres her.
                    </p>
                  )}
                </div>
              </div>
              <div>
                <label className={labelCls}>Firma Adresse{reqMark}</label>
                <AddressAutocomplete
                  className={inputCls}
                  value={address}
                  onChange={setAddress}
                  onResolve={(r: ResolvedAddress) => {
                    if (r.address_line_1) setAddress(r.address_line_1);
                    const pc = [r.postal_code, r.city].filter(Boolean).join(' ');
                    if (pc) setZipCity(pc);
                    if (r.country_name) setCountry(r.country_name);
                  }}
                  placeholder="Begynd at skrive adressen…"
                  showValidationState
                  addressParts={{ address_line_1: address, postal_code: zipCity, country }}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Firmaets postnummer og by{reqMark}</label>
                  <input className={inputCls} value={zipCity} onChange={(e) => setZipCity(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Firmaets land{reqMark}</label>
                  <input className={inputCls} value={country} onChange={(e) => setCountry(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>CVR eller VAT nr.{reqMark}</label>
                  <input className={inputCls} value={vat} onChange={(e) => setVat(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Direktør navn{reqMark}</label>
                  <input className={inputCls} value={ceoName} onChange={(e) => setCeoName(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Telefon{reqMark}</label>
                  <input type="tel" className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>E-mail{reqMark}</label>
                  <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div>
                <label className={labelCls}>Økonomi Kontakt person{reqMark}</label>
                <input className={inputCls} value={finName} onChange={(e) => setFinName(e.target.value)} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Telefon til økonomi</label>
                  <input type="tel" className={inputCls} value={finPhone} onChange={(e) => setFinPhone(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>E-mail til økonomi</label>
                  <input type="email" className={inputCls} value={finEmail} onChange={(e) => setFinEmail(e.target.value)} />
                </div>
              </div>
              <div>
                <label className={labelCls}>E-mail til faktura{reqMark}</label>
                <input type="email" className={inputCls} value={invoiceEmail} onChange={(e) => setInvoiceEmail(e.target.value)} />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <label className={labelCls}>Hjemmeside adresse{reqMark}</label>
                <input className={inputCls} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Facebook</label>
                  <input className={inputCls} value={facebook} onChange={(e) => setFacebook(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>LinkedIn</label>
                  <input className={inputCls} value={linkedin} onChange={(e) => setLinkedin(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>TikTok</label>
                  <input className={inputCls} value={tiktok} onChange={(e) => setTiktok(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>YouTube</label>
                  <input className={inputCls} value={youtube} onChange={(e) => setYoutube(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Instagram</label>
                  <input className={inputCls} value={instagram} onChange={(e) => setInstagram(e.target.value)} />
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div>
                <label className={labelCls}>Salgsafdeling Kontakt person</label>
                <input className={inputCls} value={salesName} onChange={(e) => setSalesName(e.target.value)} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Telefon til salg</label>
                  <input type="tel" className={inputCls} value={salesPhone} onChange={(e) => setSalesPhone(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>E-mail til salg</label>
                  <input type="email" className={inputCls} value={salesEmail} onChange={(e) => setSalesEmail(e.target.value)} />
                </div>
              </div>
              <div>
                <span className={labelCls}>Flere salgs personer{reqMark}</span>
                <div className="flex gap-4">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input type="radio" name="moreSales" checked={moreSales === 'ja'} onChange={() => setMoreSales('ja')} /> Ja
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input type="radio" name="moreSales" checked={moreSales === 'nej'} onChange={() => { setMoreSales('nej'); setSalesExtras([]); }} /> Nej
                  </label>
                </div>
              </div>
              {moreSales === 'ja' && (
                <ExtraPeopleEditor people={salesExtras} setPeople={setSalesExtras} addLabel="Tilføj salgsperson" />
              )}
            </>
          )}

          {step === 4 && (
            <>
              <div>
                <label className={labelCls}>Værksted og reservedel Kontakt person</label>
                <input className={inputCls} value={wpName} onChange={(e) => setWpName(e.target.value)} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Telefon til Værksted og reservedel</label>
                  <input type="tel" className={inputCls} value={wpPhone} onChange={(e) => setWpPhone(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>E-mail til Værksted og reservedel</label>
                  <input type="email" className={inputCls} value={wpEmail} onChange={(e) => setWpEmail(e.target.value)} />
                </div>
              </div>
              <div>
                <span className={labelCls}>Flere personer i værksted og reservedele{reqMark}</span>
                <div className="flex gap-4">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input type="radio" name="moreWp" checked={moreWp === 'ja'} onChange={() => setMoreWp('ja')} /> Ja
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input type="radio" name="moreWp" checked={moreWp === 'nej'} onChange={() => { setMoreWp('nej'); setWpExtras([]); }} /> Nej
                  </label>
                </div>
              </div>
              {moreWp === 'ja' && (
                <ExtraPeopleEditor people={wpExtras} setPeople={setWpExtras} addLabel="Tilføj person" />
              )}
            </>
          )}

          {step === 5 && (
            <>
              <div>
                <label className={labelCls}>Marketing Kontakt person</label>
                <input className={inputCls} value={mktName} onChange={(e) => setMktName(e.target.value)} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Telefon nr. til marketingafdelingen</label>
                  <input type="tel" className={inputCls} value={mktPhone} onChange={(e) => setMktPhone(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>E-mail til marketingsafdelingen</label>
                  <input type="email" className={inputCls} value={mktEmail} onChange={(e) => setMktEmail(e.target.value)} />
                </div>
              </div>
            </>
          )}

          {step === 6 && (
            <div>
              <label className={labelCls}>Hvis du har noget at tilføje, skrive det venligst herunder.</label>
              <textarea className={textareaCls} value={finalComment} onChange={(e) => setFinalComment(e.target.value)} />
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={prev}
              disabled={step === 0 || submitting}
              className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Tilbage
            </button>
            <span className="text-xs text-gray-400">Trin {step + 1} af {sections.length}</span>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#2d5a27] text-white text-sm font-semibold hover:bg-[#244a20] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isLast ? (submitting ? 'Sender…' : 'Send') : 'Næste'}
            </button>
          </div>
        </form>
      </div>
    </MiscPageShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function ExtraPeopleEditor({
  people, setPeople, addLabel,
}: {
  people: ExtraPerson[];
  setPeople: (p: ExtraPerson[]) => void;
  addLabel: string;
}) {
  function update(i: number, patch: Partial<ExtraPerson>) {
    setPeople(people.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }
  function remove(i: number) {
    setPeople(people.filter((_, idx) => idx !== i));
  }
  return (
    <div className="space-y-4">
      {people.map((p, i) => (
        <div key={i} className="rounded-lg border border-gray-200 p-4 bg-gray-50/50 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-600">Person {i + 1}</span>
            <button
              type="button"
              onClick={() => remove(i)}
              className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline"
            >
              <Trash2 className="h-3.5 w-3.5" /> Fjern
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Navn *</label>
              <input className={inputCls} value={p.name} onChange={(e) => update(i, { name: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Telefon</label>
              <input type="tel" className={inputCls} value={p.phone} onChange={(e) => update(i, { phone: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>E-mail</label>
              <input type="email" className={inputCls} value={p.email} onChange={(e) => update(i, { email: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Kommentar / område</label>
              <input className={inputCls} value={p.comment} onChange={(e) => update(i, { comment: e.target.value })} />
            </div>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setPeople([...people, blankPerson()])}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-[#2d5a27]/40 text-[#2d5a27] text-sm font-semibold hover:bg-[#2d5a27]/5"
      >
        <Plus className="h-4 w-4" /> {addLabel}
      </button>
    </div>
  );
}
