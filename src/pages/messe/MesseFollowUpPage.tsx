import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ClipboardList, Loader2, Mail } from 'lucide-react';
import MesseSubpageHeader from '@/components/messe/MesseSubpageHeader';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { toast } from 'sonner';
import { createLead, formatLeadNo, getLeadAttachmentSignedUrl, updateLead, uploadLeadAttachments } from '@/lib/crmLeadsService';
import { fetchDealerAccounts, type DealerAccount } from '@/lib/dealerAccountsService';
import { resolveSellerId } from '@/lib/resolveSellerId';
import { loadSellerDirectory, type SellerDirectoryEntry } from '@/lib/sellerDirectory';
import { getMesseLeadWebhookUrl } from '@/lib/webhookUrls';
import { mapUiLanguageToLegacy } from '@/lib/portalLanguages';
import { buildConfiguratorStateFromLead } from '@/lib/leadToConfiguratorDraft';
import { createEmptyConfiguratorState } from '@/lib/configuratorState';
import { calcConfigurationTotals } from '@/lib/calcConfiguration';
import { buildMesseLeadMailRecipients } from '@/lib/messeLeadMail';
import type { CrmLead, CrmLeadAttachment } from '@/lib/crmLeadsService';

type LeadType = 'dealer' | 'customer' | '';
type YesNo = 'yes' | 'no' | '';
type CountryQuickChoice = 'de' | 'dk' | 'other' | '';
type FormSectionKey = 'country' | 'dealerCustomer' | 'customerInfo' | 'businessCard' | 'product' | 'demo' | 'responsible';
type FormSectionErrors = Partial<Record<FormSectionKey, string>>;
type MesseMailAttachment = CrmLeadAttachment & {
  signed_url: string | null;
};

const PRODUCTS = [
  'RC-751',
  'RC-1000',
  'Timan 2620',
  'Timan 3330',
  'Equipment',
  'Loader line / Tractor Equipment',
  'All',
];

const EQUIPMENT_GROUPS = [
  {
    machine: 'RC-1000s',
    items: [
      'Slagleklipper inkl. Y-slagle sæt',
      'Rotorklipper 1350 mm',
      'Fingerklipper 1700 mm',
      'Skivehøster 1150mm',
      'Stubfræser m/hydraulisk sving',
      'V-plov m/gummiskær',
      'Centerdrevet fejemaskine',
      'Sneslynge 1100 mm',
      'WB-170 ukrudtsbørste basis enhed',
    ],
  },
  {
    machine: 'Timan 2620',
    items: [
      'Med kabine',
      'Uden kabine',
      'V-plov',
      'Skovl',
      'Skrabeblad/Dozerblad',
      'DS-250 Saltspreder',
    ],
  },
  {
    machine: 'Loader line / Tractor Equipment - Loader line',
    items: [
      'CS-200 Valspreder, manuel reg. Inklusiv svingbar ophængs beslag',
      'CS-200 Combi, manuel reg. Inklusiv svingbar ophængs beslag til Weidemann',
      'CS-200 Combi, El. reg. Inklusiv svingbar ophængs beslag til Weidemann',
      'Timan hydr. fejemaskine D1316 med skrabeblad Ø600 mm børster',
      'Timan hydr. fejemaskine D1518 med skrabeblad Ø600 mm børster',
      'Flydende ophæng inklusiv 6/2 ventil til Weidemann',
      'Tornado 400 fejebredde 135 til 180 cm. 400 liter beholder, 50 liter vandtank',
    ],
  },
  {
    machine: 'Loader line / Tractor Equipment - Tractor',
    items: [
      'CS-200 Valspreder, manuel reg.',
      'CS-200 Combi, manuel reg.',
      'CS-200 Combi, El. reg.',
    ],
  },
  {
    machine: 'Timan 3330 - Feje/Sug Redskaber',
    items: [
      'T2 Opsamlingstank uden højtryksslange',
      'T2 Opsamlingstank inkl. højtryksrenser',
      'T3 Opsamlingstank med tørsug',
      'T3 Opsamlingstank med tørsug og højtryksrenser',
      'Forkostesæt med 2 koste til fejesug forberedt til venstre og højre sidekost',
    ],
  },
  {
    machine: 'Timan 3330 - Ukrudtsbørste',
    items: [
      'WB-170 Ukrudtsbørste basisenhed',
    ],
  },
  {
    machine: 'Timan 3330 - Græs opgaver',
    items: [
      'Rotorklipper med 3 gatorknive og tilt-up, 135 cm klippebredde',
      'Rotorklipper 150 cm med hydraulisk højdejustering og tilt-up',
      'Rotorklipper 120 cm for opsamling til fejesugtank',
    ],
  },
  {
    machine: 'Timan 3330 - Vinter redskaber',
    items: [
      'Centerdrevet fejemaskine med reversering, 120 cm, Ø550 mm børster',
      'V-plov 130-150 cm med gummiskær',
      'Dozerblad 130 cm med gummiskær',
      'Sneslynge, 110 cm arbejdsbredde',
      'CS-200 Valsespreder, for lad, manuel reg. Husk lad og vogn',
      'CS-200 Combi, for lad, manuel reg. Husk lad og vogn',
      'CS-200 Combi, for lad, el reg. Husk lad og vogn',
    ],
  },
  {
    machine: 'Timan 3330 - Øvrige Redskaber',
    items: [
      'Fingerklipper for Termit-arm',
      'Multitrimmer for Termit-arm',
      'Skovl med hydraulisk tip',
      'Ramme for montering af udstyr bag - andre end Timan produkter',
      'Hurtigkobling for frontudstyr - andre end Timan produkter',
      'Fabriksmontering af centerslange for fejesug T2 og T3',
      'Ekstra vogn til afmontering af redskaber',
      'Ekstra lad med hydraulisk tip uden vogn',
      'Timan 3330 udvidet komponentgaranti med 12 mdr.',
    ],
  },
];

const FORM_TEXT = {
  title: { da: 'Opfølgningsformular', en: 'Follow-up form', de: 'Follow-up Formular', it: 'Follow-up form', hu: 'Follow-up form' },
  exhibition: { da: 'Messe / Udstilling', en: 'Messe / Exhibition', de: 'Messe / Ausstellung', it: 'Fiera / Esposizione', hu: 'Kiállítás' },
  country: { da: '1. Land', en: '1. Country', de: '1. Land', it: '1. Paese', hu: '1. Ország' },
  germany: { da: 'Tyskland', en: 'Germany', de: 'Deutschland', it: 'Germania', hu: 'Németország' },
  denmark: { da: 'Danmark', en: 'Denmark', de: 'Dänemark', it: 'Danimarca', hu: 'Dánia' },
  other: { da: 'Andet', en: 'Other', de: 'Andere', it: 'Altro', hu: 'Egyéb' },
  chooseCountry: { da: 'Vælg specifikt land', en: 'Choose specific country', de: 'Bestimmtes Land wählen', it: 'Scegli paese specifico', hu: 'Válasszon országot' },
  dealerCustomer: { da: '2. Forhandler eller Kunde', en: '2. Dealer or Customer', de: '2. Händler oder Kunde', it: '2. Rivenditore o cliente', hu: '2. Kereskedő vagy ügyfél' },
  dealerLabel: { da: 'Forhandler', en: 'Dealer', de: 'Händler', it: 'Rivenditore', hu: 'Kereskedő' },
  customerLabel: { da: 'Kunde', en: 'Customer', de: 'Kunde', it: 'Cliente', hu: 'Ügyfél' },
  dealerDesc: { da: 'Vil gerne repræsentere Timan som forhandler.', en: 'Would like to represent Timan as a dealer.', de: 'Möchte Timan als Händler vertreten.', it: 'Vuole rappresentare Timan come rivenditore.', hu: 'Timan kereskedőként szeretne képviselni.' },
  customerDesc: { da: 'Er interesseret i produkt og ønsker kontakt.', en: 'Interested in a product and wants contact.', de: 'Interessiert sich für ein Produkt und möchte kontaktiert werden.', it: 'Interessato a un prodotto e desidera essere contattato.', hu: 'Érdeklődik egy termék iránt és kapcsolatfelvételt kér.' },
  product: { da: '4. Produkt', en: '4. Product', de: '4. Produkt', it: '4. Prodotto', hu: '4. Termék' },
  productEquipment: { da: 'Redskaber', en: 'Equipment', de: 'Anbaugeräte', it: 'Attrezzature', hu: 'Eszközök' },
  productLoaderTractor: { da: 'Loader line / traktor-redskaber', en: 'Loader line / Tractor Equipment', de: 'Loader line / Traktor-Anbaugeräte', it: 'Attrezzature Loader line / trattore', hu: 'Loader line / traktor eszközök' },
  productAll: { da: 'Alle', en: 'All', de: 'Alle', it: 'Tutti', hu: 'Összes' },
  chooseEquipment: { da: 'Vælg redskaber', en: 'Choose equipment', de: 'Anbaugeräte wählen', it: 'Scegli attrezzature', hu: 'Eszközök kiválasztása' },
  demo: { da: '5. Ønsker demonstration', en: '5. Wants a demonstration', de: '5. Möchte eine Vorführung', it: '5. Vuole una dimostrazione', hu: '5. Bemutatót szeretne' },
  yes: { da: 'Ja', en: 'Yes', de: 'Ja', it: 'Si', hu: 'Igen' },
  no: { da: 'Nej', en: 'No', de: 'Nein', it: 'No', hu: 'Nem' },
  choose: { da: 'Vælg', en: 'Choose', de: 'Wählen', it: 'Scegli', hu: 'Válasszon' },
  responsible: { da: '6. Timan sælger', en: '6. Timan seller', de: '6. Timan Verkäufer', it: '6. Venditore Timan', hu: '6. Timan értékesítő' },
  dealerSelect: { da: 'Vælg forhandler', en: 'Choose dealer', de: 'Händler wählen', it: 'Scegli rivenditore', hu: 'Kereskedő kiválasztása' },
  mailTo: { da: 'Mail sendes til', en: 'Mail is sent to', de: 'E-Mail wird gesendet an', it: 'Mail inviata a', hu: 'Email címzettje' },
  chooseResponsible: { da: 'vælg Timan sælger', en: 'choose Timan seller', de: 'Timan Verkäufer wählen', it: 'scegli venditore Timan', hu: 'válasszon Timan értékesítőt' },
  customerInfo: { da: '3. Kundeinformation', en: '3. Customer information', de: '3. Kundeninformationen', it: '3. Informazioni cliente', hu: '3. Ügyféladatok' },
  companyPlaceholder: { da: 'Firma navn eller CVR', en: "Customer's Company Name or CVR", de: 'Firmenname oder USt-IdNr.', it: 'Nome azienda o partita IVA', hu: 'Cégnév vagy adószám' },
  contactPlaceholder: { da: 'Kontaktperson', en: 'Contact person', de: 'Kontaktperson', it: 'Persona di contatto', hu: 'Kapcsolattartó' },
  addressPlaceholder: { da: 'Adresse', en: 'Address', de: 'Adresse', it: 'Indirizzo', hu: 'Cím' },
  zipCityPlaceholder: { da: 'Postnr. og by', en: 'ZIP code and city', de: 'PLZ und Ort', it: 'CAP e città', hu: 'Irányítószám és város' },
  phonePlaceholder: { da: 'Telefon nr.', en: 'Phone no.', de: 'Telefonnummer', it: 'Telefono', hu: 'Telefonszám' },
  emailPlaceholder: { da: 'E-mail', en: 'E-mail', de: 'E-Mail', it: 'E-mail', hu: 'E-mail' },
  commentPlaceholder: { da: 'Kommentar', en: 'Comment', de: 'Kommentar', it: 'Commento', hu: 'Megjegyzés' },
  businessCard: { da: '3a. Visitkort / billeder (maks. 3)', en: '3a. Business card / images (max. 3)', de: '3a. Visitenkarte / Bilder (max. 3)', it: '3a. Biglietto da visita / immagini (max. 3)', hu: '3a. Névjegykártya / képek (max. 3)' },
  submit: { da: 'Gem lead og send mail', en: 'Save lead and send mail', de: 'Lead speichern und E-Mail senden', it: 'Salva lead e invia mail', hu: 'Lead mentése és email küldése' },
  sending: { da: 'Sender...', en: 'Sending...', de: 'Sendet...', it: 'Invio...', hu: 'Küldés...' },
  errCountry: { da: 'Mangler valg af land', en: 'Choose a country', de: 'Land auswählen', it: 'Scegli un paese', hu: 'Válasszon országot' },
  errDealerCustomer: { da: 'Vælg forhandler eller kunde', en: 'Choose dealer or customer', de: 'Händler oder Kunde auswählen', it: 'Scegli rivenditore o cliente', hu: 'Válasszon kereskedőt vagy ügyfelet' },
  errCustomerInfo: { da: 'Udfyld kundeoplysninger eller vedhæft visitkort/billede', en: 'Fill in customer information or attach a business card/image', de: 'Kundendaten ausfüllen oder Visitenkarte/Bild anhängen', it: 'Compila i dati cliente oppure allega biglietto da visita/immagine', hu: 'Töltse ki az ügyféladatokat, vagy csatoljon névjegykártyát/képet' },
  errBusinessCard: { da: 'Vedhæft visitkort/billede eller udfyld kundeoplysninger', en: 'Attach a business card/image or fill in customer information', de: 'Visitenkarte/Bild anhängen oder Kundendaten ausfüllen', it: 'Allega biglietto da visita/immagine oppure compila i dati cliente', hu: 'Csatoljon névjegykártyát/képet, vagy töltse ki az ügyféladatokat' },
  errProduct: { da: 'Vælg mindst ét produkt', en: 'Choose at least one product', de: 'Mindestens ein Produkt auswählen', it: 'Scegli almeno un prodotto', hu: 'Válasszon legalább egy terméket' },
  errEquipment: { da: 'Vælg mindst ét redskab', en: 'Choose at least one equipment item', de: 'Mindestens ein Anbaugerät auswählen', it: 'Scegli almeno un accessorio', hu: 'Válasszon legalább egy eszközt' },
  errDemo: { da: 'Vælg ja eller nej', en: 'Choose yes or no', de: 'Ja oder Nein auswählen', it: 'Scegli sì o no', hu: 'Válasszon igen vagy nem' },
  errResponsible: { da: 'Vælg Timan sælger', en: 'Choose Timan seller', de: 'Timan Verkäufer auswählen', it: 'Scegli venditore Timan', hu: 'Válasszon Timan értékesítőt' },
  errSubmit: { da: 'Formularen mangler oplysninger. Ret de markerede sektioner.', en: 'The form is missing information. Fix the marked sections.', de: 'Im Formular fehlen Angaben. Bitte die markierten Abschnitte korrigieren.', it: 'Nel modulo mancano informazioni. Correggi le sezioni evidenziate.', hu: 'Az űrlapon adatok hiányoznak. Javítsa a megjelölt szakaszokat.' },
};

function clean(value: string): string {
  return value.trim();
}

function same(value: string | null | undefined, target: string): boolean {
  return (value || '').toLowerCase() === target.toLowerCase();
}

function normalizeCountry(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase();
}

function countryMatches(value: string | null | undefined, selectedCountry: string): boolean {
  const current = normalizeCountry(value);
  const selected = normalizeCountry(selectedCountry);
  if (!selected || selected === 'all') return true;
  if (selected === 'germany') return ['germany', 'deutschland', 'tyskland', 'de'].includes(current);
  if (selected === 'denmark') return ['denmark', 'danmark', 'dk'].includes(current);
  return current === selected;
}

function isDenmarkOrGermany(value: string | null | undefined): boolean {
  return countryMatches(value, 'Denmark') || countryMatches(value, 'Germany');
}

function alphaCompare(a: string | null | undefined, b: string | null | undefined): number {
  return (a || '').localeCompare(b || '', 'da', { sensitivity: 'base' });
}

function dealerBelongsToSeller(dealer: DealerAccount, seller: SellerDirectoryEntry | null): boolean {
  if (!seller) return false;
  const sellerEmail = seller.email?.trim().toLowerCase();
  const sellerInitials = seller.initials?.trim().toLowerCase();
  const sellerName = seller.full_name?.trim().toLowerCase();
  return Boolean(
    (sellerEmail && dealer.assigned_seller_email?.trim().toLowerCase() === sellerEmail) ||
    (sellerInitials && dealer.assigned_seller_initials?.trim().toLowerCase() === sellerInitials) ||
    (sellerName && dealer.assigned_seller_name?.trim().toLowerCase() === sellerName),
  );
}

function dealerSellerSortKey(dealer: DealerAccount): string {
  return dealer.assigned_seller_name || dealer.assigned_seller_initials || dealer.assigned_seller_email || '';
}

function sortDealersForSeller(dealers: DealerAccount[], seller: SellerDirectoryEntry | null): DealerAccount[] {
  return [...dealers].sort((a, b) => {
    const aSelected = dealerBelongsToSeller(a, seller);
    const bSelected = dealerBelongsToSeller(b, seller);
    if (aSelected !== bSelected) return aSelected ? -1 : 1;

    const aHasSeller = Boolean(dealerSellerSortKey(a));
    const bHasSeller = Boolean(dealerSellerSortKey(b));
    if (aHasSeller !== bHasSeller) return aHasSeller ? -1 : 1;

    if (!aSelected && aHasSeller && bHasSeller) {
      const sellerOrder = alphaCompare(dealerSellerSortKey(a), dealerSellerSortKey(b));
      if (sellerOrder !== 0) return sellerOrder;
    }

    return alphaCompare(a.company_name, b.company_name);
  });
}

function RequiredMark() {
  return <span className="ml-1 text-red-600">*</span>;
}

function RequiredHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-bold">
      {children}
      <RequiredMark />
    </h2>
  );
}

function FormSection({
  children,
  error,
  forwardedRef,
}: {
  children: React.ReactNode;
  error?: string;
  forwardedRef?: React.RefObject<HTMLElement>;
}) {
  return (
    <section
      ref={forwardedRef}
      className={`space-y-3 rounded-xl border p-4 transition sm:p-5 ${
        error
          ? 'border-rose-200 bg-rose-50/70'
          : 'border-slate-200 bg-slate-50/70'
      }`}
    >
      {children}
    </section>
  );
}

function SectionError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs font-semibold text-rose-700">{message}</p>;
}

function FlagIcon({ code, className }: { code: string; className?: string }) {
  const common = `block rounded-sm ${className || ''}`;
  if (code === 'de') {
    return (
      <svg viewBox="0 0 5 3" className={`${common} h-4 w-6`} aria-hidden="true" preserveAspectRatio="xMidYMid meet">
        <rect width="5" height="1" fill="#000" />
        <rect y="1" width="5" height="1" fill="#DD0000" />
        <rect y="2" width="5" height="1" fill="#FFCE00" />
      </svg>
    );
  }
  if (code === 'dk') {
    return (
      <svg viewBox="0 0 37 28" className={`${common} h-4 w-6`} aria-hidden="true" preserveAspectRatio="xMidYMid meet">
        <rect width="37" height="28" fill="#C60C30" />
        <path d="M12 0h4v28h-4zM0 12h37v4H0z" fill="#fff" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 60 30" className={`${common} h-4 w-6`} aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      <rect width="60" height="30" fill="#012169" />
      <path d="M0 0L60 30M60 0L0 30" stroke="#fff" strokeWidth="6" />
      <path d="M0 0L60 30M60 0L0 30" stroke="#C8102E" strokeWidth="4" />
      <path d="M30 0v30M0 15h60" stroke="#fff" strokeWidth="10" />
      <path d="M30 0v30M0 15h60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  );
}

function isGermanySeller(seller: SellerDirectoryEntry): boolean {
  const haystack = [seller.full_name, seller.email, seller.initials].join(' ').toLowerCase();
  return haystack.includes('jakob') ||
    haystack.includes('alexander') ||
    ['jtn', 'akr', 'ak'].includes(seller.initials.toLowerCase());
}

function isDenmarkDefaultSeller(seller: SellerDirectoryEntry): boolean {
  const haystack = [seller.full_name, seller.email, seller.initials].join(' ').toLowerCase();
  return seller.initials.toLowerCase() === 'em' || haystack.includes('esben');
}

async function sendLeadMail(payload: Record<string, unknown>): Promise<void> {
  const response = await fetch(getMesseLeadWebhookUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}${text ? ` - ${text}` : ''}`);
  }
}

function localDateIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDaysIso(date: Date, days: number): string {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return localDateIso(next);
}

function addYearsIso(date: Date, years: number): string {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + years);
  return localDateIso(next);
}

export default function MesseFollowUpPage() {
  const { appUser } = useAppUser();
  const { uiLanguage, setAutoLanguage } = useLanguage();
  const now = new Date();
  const today = localDateIso(now);
  const followUpDate = addDaysIso(now, 7);
  const expectedCloseDate = addYearsIso(now, 1);
  const textLanguage = mapUiLanguageToLegacy(uiLanguage);
  const f = (key: keyof typeof FORM_TEXT) => FORM_TEXT[key][textLanguage] || FORM_TEXT[key].en;
  const productLabel = (product: string) => {
    if (product === 'Equipment') return f('productEquipment');
    if (product === 'Loader line / Tractor Equipment') return f('productLoaderTractor');
    if (product === 'All') return f('productAll');
    return product;
  };
  const [dealers, setDealers] = useState<DealerAccount[]>([]);
  const [sellers, setSellers] = useState<SellerDirectoryEntry[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [createdLead, setCreatedLead] = useState<{ id: string; leadNo: number | null | undefined } | null>(null);

  const [countryQuickChoice, setCountryQuickChoice] = useState<CountryQuickChoice>('');
  const [specificCountry, setSpecificCountry] = useState('');
  const [leadType, setLeadType] = useState<LeadType>('');
  const [products, setProducts] = useState<string[]>([]);
  const [equipmentItems, setEquipmentItems] = useState<string[]>([]);
  const [wantsDemo, setWantsDemo] = useState<YesNo>('');
  const [sellerEmail, setSellerEmail] = useState('');
  const [dealerNumber, setDealerNumber] = useState('');
  const [company, setCompany] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [address, setAddress] = useState('');
  const [zipCity, setZipCity] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [businessCardFiles, setBusinessCardFiles] = useState<File[]>([]);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  const countrySectionRef = useRef<HTMLElement>(null);
  const dealerCustomerSectionRef = useRef<HTMLElement>(null);
  const customerInfoSectionRef = useRef<HTMLElement>(null);
  const businessCardSectionRef = useRef<HTMLElement>(null);
  const productSectionRef = useRef<HTMLElement>(null);
  const demoSectionRef = useRef<HTMLElement>(null);
  const responsibleSectionRef = useRef<HTMLElement>(null);
  const countryFirstButtonRef = useRef<HTMLButtonElement>(null);
  const countrySelectRef = useRef<HTMLSelectElement>(null);
  const dealerTypeFirstButtonRef = useRef<HTMLButtonElement>(null);
  const companyInputRef = useRef<HTMLInputElement>(null);
  const contactInputRef = useRef<HTMLInputElement>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const businessCardInputRef = useRef<HTMLInputElement>(null);
  const firstProductInputRef = useRef<HTMLInputElement>(null);
  const firstEquipmentInputRef = useRef<HTMLInputElement>(null);
  const demoFirstButtonRef = useRef<HTMLButtonElement>(null);
  const firstSellerButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document.scrollingElement?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

  const selectedLeadCountry = countryQuickChoice === 'de'
    ? 'Germany'
    : countryQuickChoice === 'dk'
      ? 'Denmark'
      : countryQuickChoice === 'other'
        ? specificCountry
        : '';

  function handleCountryChoice(value: Exclude<CountryQuickChoice, ''>) {
    setCountryQuickChoice(value);
    if (value === 'de') setAutoLanguage('de');
    if (value === 'dk') {
      setAutoLanguage('da');
      const esben = sellers.find(isDenmarkDefaultSeller);
      if (esben) setSellerEmail(esben.email);
    }
    if (value === 'other') setAutoLanguage('en');
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingData(true);
      try {
        const [dealerResult, sellerList] = await Promise.all([
          fetchDealerAccounts({ includeDeleted: false }),
          loadSellerDirectory(),
        ]);
        if (cancelled) return;
        setDealers(dealerResult.rows);
        const activeSellers = sellerList
          .filter((seller) => seller.email && seller.initials)
          .sort((a, b) => a.initials.localeCompare(b.initials));
        setSellers(activeSellers);
        const current = appUser?.email
          ? activeSellers.find((seller) => same(seller.email, appUser.email))
          : null;
        if (current) {
          setSellerEmail(current.email);
        }
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    })();
    return () => { cancelled = true; };
  }, [appUser?.email]);

  const selectedDealer = useMemo(
    () => dealers.find((dealer) => dealer.account_number === dealerNumber) || null,
    [dealers, dealerNumber],
  );

  const countryOptions = useMemo(() => {
    const countries = new Set<string>();
    dealers.forEach((dealer) => {
      if (dealer.country) countries.add(dealer.country);
    });
    return Array.from(countries).sort((a, b) => a.localeCompare(b));
  }, [dealers]);

  const otherCountryOptions = useMemo(() => (
    countryOptions.filter((country) => !isDenmarkOrGermany(country))
  ), [countryOptions]);

  const sellerOptions = useMemo(() => (
    countryQuickChoice === 'de'
      ? sellers.filter(isGermanySeller)
      : sellers
  ), [countryQuickChoice, sellers]);

  const responsibleSeller = useMemo(() => {
    return sellerOptions.find((seller) => seller.email === sellerEmail) || null;
  }, [sellerEmail, sellerOptions]);

  const filteredDealers = useMemo(() => {
    const countryFiltered = dealers.filter((dealer) => countryMatches(dealer.country, selectedLeadCountry));
    return sortDealersForSeller(countryFiltered, responsibleSeller);
  }, [dealers, selectedLeadCountry, responsibleSeller]);

  useEffect(() => {
    if (countryQuickChoice !== 'de') return;
    if (sellerOptions.length === 0) return;
    if (!sellerOptions.some((seller) => seller.email === sellerEmail)) {
      setSellerEmail(sellerOptions[0].email);
    }
  }, [countryQuickChoice, sellerEmail, sellerOptions]);

  useEffect(() => {
    if (countryQuickChoice !== 'dk' || sellerEmail) return;
    const esben = sellers.find(isDenmarkDefaultSeller);
    if (esben) setSellerEmail(esben.email);
  }, [countryQuickChoice, sellerEmail, sellers]);

  useEffect(() => {
    if (leadType === 'dealer' && dealerNumber) {
      setDealerNumber('');
    }
  }, [dealerNumber, leadType]);

  useEffect(() => {
    if (!dealerNumber) return;
    const dealerStillValid = filteredDealers.some((dealer) => dealer.account_number === dealerNumber);
    if (!dealerStillValid) setDealerNumber('');
  }, [dealerNumber, filteredDealers]);

  useEffect(() => {
    if (!products.includes('Equipment') && !products.includes('Loader line / Tractor Equipment') && equipmentItems.length > 0) {
      setEquipmentItems([]);
    }
  }, [equipmentItems.length, products]);

  function toggleProduct(product: string) {
    setProducts((current) => (
      current.includes(product)
        ? current.filter((item) => item !== product)
        : [...current, product]
    ));
  }

  function toggleEquipment(item: string) {
    setEquipmentItems((current) => (
      current.includes(item)
        ? current.filter((entry) => entry !== item)
        : [...current, item]
    ));
  }

  const hasCustomerInfo = useMemo(
    () => Boolean(clean(company) && clean(contactPerson) && clean(address) && clean(phone)),
    [address, company, contactPerson, phone],
  );
  const hasBusinessCard = businessCardFiles.length > 0;
  const hasRequiredEquipment = !products.includes('Equipment') && !products.includes('Loader line / Tractor Equipment')
    ? true
    : equipmentItems.length > 0;
  const isEquipmentBoxActive = (box: 'rc1000' | '2620' | '3330' | 'loaderTractor') => (
    products.includes('All') ||
    (box === 'rc1000' && products.includes('RC-1000')) ||
    (box === '2620' && products.includes('Timan 2620')) ||
    (box === '3330' && products.includes('Timan 3330')) ||
    (box === 'loaderTractor' && products.includes('Loader line / Tractor Equipment'))
  );
  const equipmentBoxClass = (active: boolean) => `rounded-lg border-2 p-3 shadow-sm transition ${
    active
      ? 'border-emerald-700 bg-emerald-200/70 ring-2 ring-emerald-300/70'
      : 'border-slate-400 bg-white'
  }`;
  function buildValidationErrors(): FormSectionErrors {
    const errors: FormSectionErrors = {};
    if (!selectedLeadCountry || (countryQuickChoice === 'other' && !clean(specificCountry))) {
      errors.country = f('errCountry');
    }
    if (!leadType) errors.dealerCustomer = f('errDealerCustomer');
    if (!hasCustomerInfo && !hasBusinessCard) {
      errors.customerInfo = f('errCustomerInfo');
      errors.businessCard = f('errBusinessCard');
    }
    if (products.length === 0) {
      errors.product = f('errProduct');
    } else if (!hasRequiredEquipment) {
      errors.product = f('errEquipment');
    }
    if (!wantsDemo) errors.demo = f('errDemo');
    if (!responsibleSeller) errors.responsible = f('errResponsible');
    return errors;
  }

  const formErrors = useMemo(
    () => attemptedSubmit ? buildValidationErrors() : {},
    [
      attemptedSubmit,
      selectedLeadCountry,
      countryQuickChoice,
      specificCountry,
      leadType,
      hasCustomerInfo,
      hasBusinessCard,
      products,
      hasRequiredEquipment,
      wantsDemo,
      responsibleSeller,
      textLanguage,
    ],
  );

  const sectionRefs: Record<FormSectionKey, React.RefObject<HTMLElement>> = {
    country: countrySectionRef,
    dealerCustomer: dealerCustomerSectionRef,
    customerInfo: customerInfoSectionRef,
    businessCard: businessCardSectionRef,
    product: productSectionRef,
    demo: demoSectionRef,
    responsible: responsibleSectionRef,
  };

  const sectionOrder: FormSectionKey[] = ['country', 'dealerCustomer', 'customerInfo', 'businessCard', 'product', 'demo', 'responsible'];

  function focusFirstField(section: FormSectionKey) {
    if (section === 'country') {
      if (countryQuickChoice === 'other') countrySelectRef.current?.focus();
      else countryFirstButtonRef.current?.focus();
      return;
    }
    if (section === 'dealerCustomer') {
      dealerTypeFirstButtonRef.current?.focus();
      return;
    }
    if (section === 'customerInfo') {
      if (!clean(company)) companyInputRef.current?.focus();
      else if (!clean(contactPerson)) contactInputRef.current?.focus();
      else if (!clean(address)) addressInputRef.current?.focus();
      else if (!clean(phone)) phoneInputRef.current?.focus();
      else companyInputRef.current?.focus();
      return;
    }
    if (section === 'businessCard') {
      businessCardInputRef.current?.focus();
      return;
    }
    if (section === 'product') {
      if (products.length === 0) firstProductInputRef.current?.focus();
      else firstEquipmentInputRef.current?.focus();
      return;
    }
    if (section === 'demo') {
      demoFirstButtonRef.current?.focus();
      return;
    }
    firstSellerButtonRef.current?.focus();
  }

  function scrollToFirstError(errors: FormSectionErrors) {
    const firstError = sectionOrder.find((section) => errors[section]);
    if (!firstError) return;
    requestAnimationFrame(() => {
      sectionRefs[firstError].current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => focusFirstField(firstError), 300);
    });
  }

  const hasCustomerInfoError = Boolean(formErrors.customerInfo && !hasBusinessCard);
  const fieldClass = (invalid: boolean) => `rounded-lg border px-3 py-2 text-sm outline-none transition ${
    invalid
      ? 'border-rose-300 bg-rose-50 focus:border-rose-400 focus:ring-2 focus:ring-rose-100'
      : 'border-slate-200 bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100'
  }`;

  function validate(): boolean {
    const errors = buildValidationErrors();
    if (Object.keys(errors).length > 0) {
      setAttemptedSubmit(true);
      toast.error(f('errSubmit'));
      scrollToFirstError(errors);
      return false;
    }
    return true;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate() || !responsibleSeller) return;
    setSubmitting(true);
    try {
      const ownerId = await resolveSellerId(responsibleSeller.email);
      const cleanCompany = clean(company);
      const cleanContactPerson = clean(contactPerson);
      const cleanAddress = clean(address);
      const cleanZipCity = clean(zipCity);
      const cleanPhone = clean(phone);
      const cleanEmail = clean(email);
      const contactInformation = [
        cleanCompany ? `Firma/CVR: ${cleanCompany}` : null,
        cleanContactPerson ? `Kontaktperson: ${cleanContactPerson}` : null,
        cleanAddress ? `Adresse: ${cleanAddress}` : null,
        cleanZipCity ? `Postnr. og by: ${cleanZipCity}` : null,
        cleanPhone ? `Telefon: ${cleanPhone}` : null,
        cleanEmail ? `E-mail: ${cleanEmail}` : null,
        selectedLeadCountry ? `Land: ${selectedLeadCountry}` : null,
      ].filter(Boolean).join('\n');
      const dealerText = selectedDealer
        ? `${selectedDealer.company_name} (${selectedDealer.account_number})`
        : 'Ingen forhandler valgt';
      const selectedProductList = [
        ...products,
        ...equipmentItems.map((item) => `Equipment: ${item}`),
      ];
      const draftState = buildConfiguratorStateFromLead(
        { machine_types: selectedProductList, contact_information: null, notes: null, trade_fair: null } as CrmLead,
        createEmptyConfiguratorState('da', 'quote'),
      );
      const estimatedLeadValue = Math.round(calcConfigurationTotals(draftState).finalPrice || 0);
      const leadNotes = [
        'Messeformular / Follow-up form',
        `Land: ${selectedLeadCountry}`,
        `Type: ${leadType === 'dealer' ? 'Dealer' : 'Customer'}`,
        `Produkter: ${products.join(', ')}`,
        equipmentItems.length > 0 ? `Redskaber: ${equipmentItems.join(', ')}` : null,
        `Ønsker demonstration: ${wantsDemo === 'yes' ? 'Ja' : 'Nej'}`,
        `Timan sælger: ${responsibleSeller.full_name || responsibleSeller.initials}`,
        `Forhandler: ${dealerText}`,
        notes ? `Kommentar: ${clean(notes)}` : null,
      ].filter(Boolean).join('\n');

      const leadTitle = clean(company) || clean(contactPerson) || `Messe lead ${today}`;
      const lead = await createLead({
        title: `Messe lead - ${leadTitle}`,
        owner_user_id: ownerId,
        owner_name: responsibleSeller.full_name || responsibleSeller.initials,
        owner_email: responsibleSeller.email,
        linked_dealer_id: selectedDealer?.id || null,
        first_contact_date: today,
        expected_close_date: expectedCloseDate,
        next_followup_date: followUpDate,
        machine_types: selectedProductList,
        next_activity: wantsDemo === 'yes' ? 'Customer requests a demonstration' : 'Wants to be contacted',
        demo_has_run: 'no',
        contact_type: 'Trade fair',
        customer_type: leadType === 'dealer' ? 'Dealer/Demo machine' : 'Company',
        contact_information: contactInformation,
        trade_fair: 'Messe / Exhibition',
        country: selectedLeadCountry || selectedDealer?.country || null,
        notes: leadNotes,
        estimated_value: estimatedLeadValue > 0 ? estimatedLeadValue : null,
        probability: wantsDemo === 'yes' ? 50 : 25,
        pipeline_stage: 'Lead',
        lost_competitor: null,
        lost_reason: null,
        lost_comment: null,
        attachments: [],
        status: 'open',
        move_to_working_qty: 0,
        incomplete_from_configurator: false,
      }, { requireRemote: true });

      let leadAttachments: CrmLeadAttachment[] = [];
      let attachmentError: unknown = null;
      try {
        leadAttachments = await uploadLeadAttachments(lead.id, businessCardFiles);
        if (leadAttachments.length > 0) {
          await updateLead(lead.id, { attachments: leadAttachments });
        }
      } catch (error) {
        attachmentError = error;
        console.error('[messe lead attachments] failed:', error);
      }

      setCreatedLead({ id: lead.id, leadNo: lead.lead_no });
      try {
        let mailAttachmentFiles: MesseMailAttachment[] = [];
        if (leadAttachments.length > 0) {
          try {
            mailAttachmentFiles = await Promise.all(leadAttachments.map(async (attachment) => ({
              ...attachment,
              signed_url: await getLeadAttachmentSignedUrl(attachment, 60 * 60 * 24 * 7),
            })));
          } catch (error) {
            attachmentError = attachmentError || error;
            console.error('[messe lead attachment links] failed:', error);
          }
        }
        const mailRecipients = buildMesseLeadMailRecipients(responsibleSeller.email, email);
        await sendLeadMail({
          source: 'messe_follow_up_form',
          lead_id: lead.id,
          lead_no: lead.lead_no,
          created_at: new Date().toISOString(),
          recipient_email: mailRecipients.recipientEmail,
          extra_recipient_email: mailRecipients.extraRecipientEmail,
          recipient_emails: mailRecipients.to,
          to: mailRecipients.to,
          bcc: mailRecipients.bcc,
          bcc_recipients: mailRecipients.bcc,
          bccRecipients: mailRecipients.bcc,
          responsible_seller: {
            id: ownerId,
            name: responsibleSeller.full_name || responsibleSeller.initials,
            initials: responsibleSeller.initials,
            email: responsibleSeller.email,
          },
          dealer: selectedDealer ? {
            account_number: selectedDealer.account_number,
            company_name: selectedDealer.company_name,
            country: selectedDealer.country,
          } : null,
          customer: {
            type: leadType,
            country: selectedLeadCountry,
            company,
            contact_person: contactPerson,
            address,
            zip_city: zipCity,
            phone,
            email,
          },
          products,
          equipment: equipmentItems,
          wants_demo: wantsDemo,
          responsible_seller_name: responsibleSeller.full_name || responsibleSeller.initials,
          notes,
          attachment_status: attachmentError ? 'failed' : 'ok',
          attachments: leadAttachments,
          attachment_links: mailAttachmentFiles,
          attachment_files: mailAttachmentFiles,
        });
        if (attachmentError) {
          toast.warning('Lead gemt og mail sendt, men billede kunne ikke vedhæftes');
        } else {
          toast.success('Messe lead gemt og mail sendt');
        }
      } catch (mailError) {
        console.error('[messe lead webhook] failed:', mailError);
        toast.warning(attachmentError
          ? 'Lead gemt i CRM, men billede og mail kunne ikke færdiggøres'
          : 'Lead gemt i CRM, men mail kunne ikke sendes');
      }
    } catch (error) {
      console.error(error);
      toast.error('Kunne ikke gemme messe lead');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <MesseSubpageHeader backTo="/messe" backLabel="Tilbage til Timan Messe" />
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">
            <ClipboardList className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-3xl font-bold">{f('title')}</h1>
            <p className="text-sm text-slate-600">{f('exhibition')}</p>
          </div>
        </div>

        {createdLead ? (
          <section className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-6 w-6 text-emerald-700" />
              <div>
                <h2 className="text-xl font-bold">Lead er oprettet</h2>
                <p className="mt-1 text-sm text-slate-600">Nummer: {formatLeadNo(createdLead.leadNo)}</p>
                <Link
                  to="/messe"
                  className="mt-5 inline-flex rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"
                >
                  Tilbage til Messe
                </Link>
              </div>
            </div>
          </section>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <FormSection forwardedRef={countrySectionRef} error={formErrors.country}>
              <RequiredHeading>{f('country')}</RequiredHeading>
              <SectionError message={formErrors.country} />
              <div className="flex flex-wrap gap-2">
                {([
                  ['dk', f('denmark')],
                  ['de', f('germany')],
                  ['other', f('other')],
                ] as [Exclude<CountryQuickChoice, ''>, string][]).map(([value, label], index) => (
                  <button
                    ref={index === 0 ? countryFirstButtonRef : undefined}
                    type="button"
                    key={value}
                    onClick={() => handleCountryChoice(value)}
                    className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                      countryQuickChoice === value
                        ? 'border-emerald-700 bg-emerald-50 text-emerald-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300'
                    }`}
                  >
                    <FlagIcon code={value} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
              {countryQuickChoice === 'other' && (
                <select
                  ref={countrySelectRef}
                  value={specificCountry}
                  onChange={(e) => {
                    setSpecificCountry(e.target.value);
                  }}
                  className={fieldClass(Boolean(formErrors.country && !clean(specificCountry)))}
                >
                  <option value="">{f('chooseCountry')}</option>
                  {otherCountryOptions.map((country) => <option key={country} value={country}>{country}</option>)}
                </select>
              )}
            </FormSection>

            <FormSection forwardedRef={dealerCustomerSectionRef} error={formErrors.dealerCustomer}>
              <RequiredHeading>{f('dealerCustomer')}</RequiredHeading>
              <SectionError message={formErrors.dealerCustomer} />
              <div className="grid gap-3 sm:grid-cols-2">
                {(['dealer', 'customer'] as Exclude<LeadType, ''>[]).map((type, index) => (
                  <button
                    ref={index === 0 ? dealerTypeFirstButtonRef : undefined}
                    type="button"
                    key={type}
                    onClick={() => setLeadType(type)}
                    className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${
                      leadType === type
                        ? 'border-emerald-700 bg-emerald-50 text-emerald-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300'
                    }`}
                  >
                    {type === 'dealer' ? f('dealerLabel') : f('customerLabel')}
                    <span className="mt-1 block text-xs font-normal text-slate-500">
                      {type === 'dealer' ? f('dealerDesc') : f('customerDesc')}
                    </span>
                  </button>
                ))}
              </div>
            </FormSection>

            <FormSection forwardedRef={customerInfoSectionRef} error={formErrors.customerInfo}>
              <RequiredHeading>{f('customerInfo')}</RequiredHeading>
              <SectionError message={formErrors.customerInfo} />
              <div className="grid gap-3 sm:grid-cols-2">
                <input ref={companyInputRef} value={company} onChange={(e) => setCompany(e.target.value)} placeholder={`${f('companyPlaceholder')} *`} className={fieldClass(hasCustomerInfoError && !clean(company))} />
                <input ref={contactInputRef} value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} placeholder={`${f('contactPlaceholder')} *`} className={fieldClass(hasCustomerInfoError && !clean(contactPerson))} />
                <input ref={addressInputRef} value={address} onChange={(e) => setAddress(e.target.value)} placeholder={`${f('addressPlaceholder')} *`} className={fieldClass(hasCustomerInfoError && !clean(address))} />
                <input value={zipCity} onChange={(e) => setZipCity(e.target.value)} placeholder={f('zipCityPlaceholder')} className={fieldClass(false)} />
                <input ref={phoneInputRef} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={`${f('phonePlaceholder')} *`} className={fieldClass(hasCustomerInfoError && !clean(phone))} />
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={f('emailPlaceholder')} type="email" className={fieldClass(false)} />
              </div>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={f('commentPlaceholder')} rows={4} className={`w-full ${fieldClass(false)}`} />
            </FormSection>

            <FormSection forwardedRef={businessCardSectionRef} error={formErrors.businessCard}>
              <label className="text-sm font-bold">
                {f('businessCard')}
                <RequiredMark />
              </label>
              <SectionError message={formErrors.businessCard} />
              <p className="text-xs text-slate-500">
                Vedhæft et visitkort, hvis du ikke udfylder kundeoplysningerne manuelt.
              </p>
              <input
                ref={businessCardInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                onChange={(e) => {
                  const selectedFiles = Array.from(e.target.files || []);
                  const imageFiles = selectedFiles.filter((file) => file.type.startsWith('image/')).slice(0, 3);
                  if (selectedFiles.length > 3) toast.warning('Der kan maks. vedhæftes 3 billeder');
                  if (imageFiles.length < selectedFiles.length && selectedFiles.length <= 3) toast.warning('Kun billedfiler kan vedhæftes');
                  setBusinessCardFiles(imageFiles);
                }}
                className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-emerald-800"
              />
              {businessCardFiles.length > 0 && (
                <div className="space-y-1 text-xs text-slate-600">
                  {businessCardFiles.map((file, index) => (
                    <div key={`${file.name}-${file.size}`} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2">
                      <span>{index + 1}. {file.name}</span>
                      <button
                        type="button"
                        onClick={() => setBusinessCardFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                        className="font-semibold text-red-600 hover:text-red-700"
                      >
                        Fjern
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </FormSection>

            <FormSection forwardedRef={productSectionRef} error={formErrors.product}>
              <RequiredHeading>{f('product')}</RequiredHeading>
              <SectionError message={formErrors.product} />
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {PRODUCTS.map((product, index) => (
                  <label key={product} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <input
                      ref={index === 0 ? firstProductInputRef : undefined}
                      type="checkbox"
                      checked={products.includes(product)}
                      onChange={() => toggleProduct(product)}
                      className="h-4 w-4 accent-emerald-700"
                    />
                    {productLabel(product)}
                  </label>
                ))}
              </div>
              {(products.includes('Equipment') || products.includes('Loader line / Tractor Equipment')) && (
                <details className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3" open>
                  <summary className="cursor-pointer text-sm font-bold text-emerald-900">
                    {f('chooseEquipment')}
                  </summary>
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <div className="space-y-3">
                      {EQUIPMENT_GROUPS.filter((group) => group.machine === 'RC-1000s' || group.machine === 'Timan 2620').map((group, groupIndex) => {
                        const active = group.machine === 'RC-1000s'
                          ? isEquipmentBoxActive('rc1000')
                          : isEquipmentBoxActive('2620');

                        return (
                          <div key={group.machine} className={equipmentBoxClass(active)}>
                            <h3 className="mb-2 text-sm font-bold text-slate-900">{group.machine}</h3>
                            {'subtitle' in group && typeof group.subtitle === 'string' && group.subtitle && (
                              <div className="mb-2 rounded-md bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">
                                {group.subtitle}
                              </div>
                            )}
                            <div className="space-y-2">
                              {group.items.map((item, itemIndex) => (
                                <label key={`${group.machine}-${item}`} className="flex items-center gap-2 text-sm text-slate-700">
                                  <input
                                    ref={groupIndex === 0 && itemIndex === 0 ? firstEquipmentInputRef : undefined}
                                    type="checkbox"
                                    checked={equipmentItems.includes(`${group.machine} - ${item}`)}
                                    onChange={() => toggleEquipment(`${group.machine} - ${item}`)}
                                    className="h-4 w-4 accent-emerald-700"
                                  />
                                  {item}
                                </label>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                      <div className={equipmentBoxClass(isEquipmentBoxActive('loaderTractor'))}>
                        <h3 className="mb-3 text-sm font-bold text-slate-900">Loader line / Tractor Equipment</h3>
                        <div className="space-y-4">
                          {EQUIPMENT_GROUPS.filter((group) => group.machine.startsWith('Loader line / Tractor Equipment - ')).map((group) => (
                            <div key={group.machine} className="space-y-2">
                              <div className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">
                                {group.machine.replace('Loader line / Tractor Equipment - ', '')}
                              </div>
                              {group.items.map((item) => (
                                <label key={`${group.machine}-${item}`} className="flex items-center gap-2 text-sm text-slate-700">
                                  <input
                                    type="checkbox"
                                    checked={equipmentItems.includes(`${group.machine} - ${item}`)}
                                    onChange={() => toggleEquipment(`${group.machine} - ${item}`)}
                                    className="h-4 w-4 accent-emerald-700"
                                  />
                                  {item}
                                </label>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className={equipmentBoxClass(isEquipmentBoxActive('3330'))}>
                      <h3 className="mb-3 text-sm font-bold text-slate-900">Timan 3330</h3>
                      <div className="space-y-4">
                        {EQUIPMENT_GROUPS.filter((group) => group.machine.startsWith('Timan 3330 - ')).map((group) => (
                          <div key={group.machine} className="space-y-2">
                            <div className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">
                              {group.machine.replace('Timan 3330 - ', '')}
                            </div>
                            {group.items.map((item) => (
                              <label key={`${group.machine}-${item}`} className="flex items-center gap-2 text-sm text-slate-700">
                                <input
                                  type="checkbox"
                                  checked={equipmentItems.includes(`${group.machine} - ${item}`)}
                                  onChange={() => toggleEquipment(`${group.machine} - ${item}`)}
                                  className="h-4 w-4 accent-emerald-700"
                                />
                                {item}
                              </label>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </details>
              )}
            </FormSection>

            <FormSection forwardedRef={demoSectionRef} error={formErrors.demo}>
              <RequiredHeading>{f('demo')}</RequiredHeading>
              <SectionError message={formErrors.demo} />
              <div className="grid gap-3 sm:grid-cols-2">
                {(['yes', 'no'] as const).map((value, index) => (
                  <button
                    ref={index === 0 ? demoFirstButtonRef : undefined}
                    type="button"
                    key={value}
                    onClick={() => setWantsDemo(value)}
                    className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${
                      wantsDemo === value
                        ? 'border-emerald-700 bg-emerald-50 text-emerald-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300'
                    }`}
                  >
                    {f(value === 'yes' ? 'yes' : 'no')}
                  </button>
                ))}
              </div>
            </FormSection>
            <FormSection forwardedRef={responsibleSectionRef} error={formErrors.responsible}>
              <div className="flex items-center justify-between gap-3">
                <RequiredHeading>{f('responsible')}</RequiredHeading>
                {loadingData && <Loader2 className="h-4 w-4 animate-spin text-slate-500" />}
              </div>
              <SectionError message={formErrors.responsible} />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sellerOptions.map((seller, index) => (
                  <button
                    ref={index === 0 ? firstSellerButtonRef : undefined}
                    type="button"
                    key={seller.id}
                    onClick={() => setSellerEmail(seller.email)}
                    className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${
                      sellerEmail === seller.email
                        ? 'border-emerald-700 bg-emerald-50 text-emerald-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300'
                    }`}
                  >
                    {seller.initials} - {seller.full_name || seller.email}
                    <span className="mt-1 block text-xs font-normal text-slate-500">
                      {seller.email}
                    </span>
                  </button>
                ))}
              </div>
              {leadType === 'customer' && (
                <div className="space-y-2">
                  <label className="text-sm font-semibold">{f('dealerSelect')}</label>
                  <select value={dealerNumber} onChange={(e) => setDealerNumber(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                    <option value="">{f('dealerSelect')}</option>
                    {filteredDealers.slice(0, 250).map((dealer) => (
                      <option key={dealer.id} value={dealer.account_number}>
                        {dealer.company_name} - {dealer.account_number}
                        {dealer.assigned_seller_initials ? ` - ${dealer.assigned_seller_initials}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <p className="text-xs text-slate-500">
                {f('mailTo')}: {responsibleSeller?.email || f('chooseResponsible')}
              </p>
            </FormSection>

            <div className="flex justify-end border-t border-slate-200 pt-5">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-full bg-emerald-700 px-6 py-3 text-sm font-bold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                {submitting ? f('sending') : f('submit')}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
