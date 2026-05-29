import { useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import FormSubmitShell, { Field, inputCls, textareaCls } from './FormSubmitShell';
import { Language } from '@/types/configurator';

const T: Record<string, Record<Language, string>> = {
  title: { da: 'Firma- og kontaktinformation', en: 'Company and contact info', de: 'Firmen- und Kontaktdaten', it: 'Informazioni aziendali e contatti', hu: 'Cég- és kapcsolati adatok' },
  intro: {
    da: 'Indsend opdaterede firmaoplysninger og primære kontaktpersoner — Timan bruger oplysningerne i CRM og kommunikation.',
    en: 'Submit updated company details and primary contacts — Timan uses this in CRM and communications.',
    de: 'Senden Sie aktualisierte Firmenangaben und Hauptkontakte — Timan verwendet diese im CRM und in der Kommunikation.',
    it: 'Invia dati aziendali aggiornati e contatti principali — Timan li usa nel CRM e nelle comunicazioni.',
    hu: 'Küldje el a frissített cégadatokat és fő kapcsolattartókat — a Timan a CRM-ben és a kommunikációban használja.',
  },
  companyName: { da: 'Firmanavn', en: 'Company name', de: 'Firmenname', it: 'Ragione sociale', hu: 'Cégnév' },
  vat:        { da: 'CVR / VAT', en: 'VAT / CVR', de: 'USt-IdNr. / CVR', it: 'P.IVA / CVR', hu: 'Adószám / CVR' },
  address:    { da: 'Adresse', en: 'Address', de: 'Adresse', it: 'Indirizzo', hu: 'Cím' },
  zip:        { da: 'Postnr.', en: 'Zip', de: 'PLZ', it: 'CAP', hu: 'Irányítószám' },
  city:       { da: 'By', en: 'City', de: 'Stadt', it: 'Città', hu: 'Város' },
  country:    { da: 'Land', en: 'Country', de: 'Land', it: 'Paese', hu: 'Ország' },
  phone:      { da: 'Hovedtelefon', en: 'Main phone', de: 'Haupttelefon', it: 'Telefono principale', hu: 'Fő telefon' },
  contactName:  { da: 'Primær kontakt — navn', en: 'Primary contact — name', de: 'Hauptkontakt — Name', it: 'Contatto principale — nome', hu: 'Fő kapcsolattartó — név' },
  contactEmail: { da: 'Primær kontakt — e-mail', en: 'Primary contact — email', de: 'Hauptkontakt — E-Mail', it: 'Contatto principale — email', hu: 'Fő kapcsolattartó — e-mail' },
  contactPhone: { da: 'Primær kontakt — telefon', en: 'Primary contact — phone', de: 'Hauptkontakt — Telefon', it: 'Contatto principale — telefono', hu: 'Fő kapcsolattartó — telefon' },
  notes:      { da: 'Bemærkninger', en: 'Notes', de: 'Anmerkungen', it: 'Note', hu: 'Megjegyzések' },
};

export default function CompanyContactInfoFormPage() {
  const { language: lang } = useLanguage();
  const [companyName, setCompanyName] = useState('');
  const [vat, setVat] = useState('');
  const [address, setAddress] = useState('');
  const [zip, setZip] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [phone, setPhone] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [notes, setNotes] = useState('');

  return (
    <FormSubmitShell
      formType="company_contact_info"
      title={T.title[lang]}
      intro={T.intro[lang]}
      requireDealer
      buildPayload={() => ({
        company_name: companyName.trim(),
        vat: vat.trim() || null,
        address: address.trim() || null,
        zip: zip.trim() || null,
        city: city.trim() || null,
        country: country.trim() || null,
        phone: phone.trim() || null,
        primary_contact: {
          name: contactName.trim(),
          email: contactEmail.trim(),
          phone: contactPhone.trim() || null,
        },
        notes: notes.trim() || null,
      })}
      onReset={() => {
        setCompanyName(''); setVat(''); setAddress(''); setZip(''); setCity('');
        setCountry(''); setPhone(''); setContactName(''); setContactEmail('');
        setContactPhone(''); setNotes('');
      }}
    >
      <Field label={T.companyName[lang]}>
        <input type="text" required value={companyName} onChange={e => setCompanyName(e.target.value)} className={inputCls} />
      </Field>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label={T.vat[lang]}>
          <input type="text" value={vat} onChange={e => setVat(e.target.value)} className={inputCls} />
        </Field>
        <Field label={T.phone[lang]}>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} />
        </Field>
      </div>

      <Field label={T.address[lang]}>
        <input type="text" value={address} onChange={e => setAddress(e.target.value)} className={inputCls} />
      </Field>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label={T.zip[lang]}>
          <input type="text" value={zip} onChange={e => setZip(e.target.value)} className={inputCls} />
        </Field>
        <Field label={T.city[lang]}>
          <input type="text" value={city} onChange={e => setCity(e.target.value)} className={inputCls} />
        </Field>
        <Field label={T.country[lang]}>
          <input type="text" value={country} onChange={e => setCountry(e.target.value)} className={inputCls} />
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label={T.contactName[lang]}>
          <input type="text" required value={contactName} onChange={e => setContactName(e.target.value)} className={inputCls} />
        </Field>
        <Field label={T.contactEmail[lang]}>
          <input type="email" required value={contactEmail} onChange={e => setContactEmail(e.target.value)} className={inputCls} />
        </Field>
        <Field label={T.contactPhone[lang]}>
          <input type="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)} className={inputCls} />
        </Field>
      </div>

      <Field label={T.notes[lang]}>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} className={textareaCls} />
      </Field>
    </FormSubmitShell>
  );
}
