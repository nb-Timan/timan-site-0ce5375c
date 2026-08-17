import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ClipboardList, Loader2, Mail } from 'lucide-react';
import MesseSubpageHeader from '@/components/messe/MesseSubpageHeader';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { toast } from 'sonner';
import { createLead, formatLeadNo } from '@/lib/crmLeadsService';
import { fetchDealerAccounts, type DealerAccount } from '@/lib/dealerAccountsService';
import { resolveSellerId } from '@/lib/resolveSellerId';
import { loadSellerDirectory, type SellerDirectoryEntry } from '@/lib/sellerDirectory';
import { getMesseLeadWebhookUrl } from '@/lib/webhookUrls';
import { mapUiLanguageToLegacy } from '@/lib/portalLanguages';

type LeadType = 'dealer' | 'customer' | '';
type YesNo = 'yes' | 'no' | '';
type CountryQuickChoice = 'de' | 'dk' | 'other' | '';
type MesseMailAttachment = {
  name: string;
  size: number;
  type: string;
  data_base64: string;
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
  businessCard: { da: '7. Tilføj billeder (maks. 3)', en: '7. Add images (max. 3)', de: '7. Bilder hinzufügen (max. 3)', it: '7. Aggiungi immagini (max. 3)', hu: '7. Képek hozzáadása (max. 3)' },
  submit: { da: 'Gem lead og send mail', en: 'Save lead and send mail', de: 'Lead speichern und E-Mail senden', it: 'Salva lead e invia mail', hu: 'Lead mentése és email küldése' },
  sending: { da: 'Sender...', en: 'Sending...', de: 'Sendet...', it: 'Invio...', hu: 'Küldés...' },
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

function fileSummary(files: File[]): { name: string; size: number }[] {
  return files.map((file) => ({ name: file.name, size: file.size }));
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(reader.error || new Error(`Kunne ikke læse filen ${file.name}`));
    reader.readAsDataURL(file);
  });
}

async function filesForMail(files: File[]): Promise<MesseMailAttachment[]> {
  return Promise.all(files.map(async (file) => ({
    name: file.name,
    size: file.size,
    type: file.type || 'application/octet-stream',
    data_base64: await fileToBase64(file),
  })));
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

  const selectedLeadCountry = countryQuickChoice === 'de'
    ? 'Germany'
    : countryQuickChoice === 'dk'
      ? 'Denmark'
      : countryQuickChoice === 'other'
        ? specificCountry
        : '';

  function handleCountryChoice(value: Exclude<CountryQuickChoice, ''>) {
    setCountryQuickChoice(value);
    setDealerNumber('');
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

  const sellerOptions = useMemo(() => (
    countryQuickChoice === 'de'
      ? sellers.filter(isGermanySeller)
      : sellers
  ), [countryQuickChoice, sellers]);

  const filteredDealers = useMemo(() => (
    dealers.filter((dealer) => countryMatches(dealer.country, selectedLeadCountry))
  ), [dealers, selectedLeadCountry]);

  const responsibleSeller = useMemo(() => {
    return sellerOptions.find((seller) => seller.email === sellerEmail) || null;
  }, [sellerEmail, sellerOptions]);

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
    () => Boolean(clean(company) && clean(contactPerson) && clean(phone)),
    [company, contactPerson, phone],
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
  const isFormReady = Boolean(
    selectedLeadCountry &&
    leadType &&
    products.length > 0 &&
    hasRequiredEquipment &&
    wantsDemo &&
    responsibleSeller &&
    (hasCustomerInfo || hasBusinessCard),
  );

  function validate(): boolean {
    if ((products.includes('Equipment') || products.includes('Loader line / Tractor Equipment')) && equipmentItems.length === 0) { toast.error('Vaelg mindst et redskab'); return false; }
    if (countryQuickChoice === 'other' && !clean(specificCountry)) { toast.error('Vaelg specifikt land'); return false; }
    if (!leadType) { toast.error('Vælg dealer eller customer'); return false; }
    if (products.length === 0) { toast.error('Vælg mindst ét produkt'); return false; }
    if (!wantsDemo) { toast.error('Vælg om kunden ønsker demonstration'); return false; }
    if (!responsibleSeller) { toast.error('Vælg Timan sælger'); return false; }
    if (!hasCustomerInfo && !hasBusinessCard) {
      toast.error('Udfyld firma, kontaktperson og telefon - eller vedhaeft visitkort/billede');
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
      const contactInformation = [
        `Firma/CVR: ${clean(company)}`,
        `Kontaktperson: ${clean(contactPerson)}`,
        address ? `Adresse: ${clean(address)}` : null,
        zipCity ? `Postnr. og by: ${clean(zipCity)}` : null,
        phone ? `Telefon: ${clean(phone)}` : null,
        email ? `E-mail: ${clean(email)}` : null,
      ].filter(Boolean).join('\n');
      const dealerText = selectedDealer
        ? `${selectedDealer.company_name} (${selectedDealer.account_number})`
        : 'Ingen forhandler valgt';
      const selectedProductList = [
        ...products,
        ...equipmentItems.map((item) => `Equipment: ${item}`),
      ];
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
        linked_dealer_id: selectedDealer?.account_number || null,
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
        estimated_value: null,
        probability: wantsDemo === 'yes' ? 50 : 25,
        pipeline_stage: 'Lead',
        lost_competitor: null,
        lost_reason: null,
        lost_comment: null,
        attachments: fileSummary(businessCardFiles),
        status: 'open',
        move_to_working_qty: 0,
        incomplete_from_configurator: false,
      });

      setCreatedLead({ id: lead.id, leadNo: lead.lead_no });
      try {
        const mailAttachmentFiles = await filesForMail(businessCardFiles);
        await sendLeadMail({
          source: 'messe_follow_up_form',
          lead_id: lead.id,
          lead_no: lead.lead_no,
          created_at: new Date().toISOString(),
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
          attachments: fileSummary(businessCardFiles),
          attachment_files: mailAttachmentFiles,
        });
        toast.success('Messe lead gemt og mail sendt');
      } catch (mailError) {
        console.error('[messe lead webhook] failed:', mailError);
        toast.warning('Lead gemt i CRM, men mail kunne ikke sendes');
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
                <p className="mt-1 text-sm text-slate-600">
                  Nummer: {formatLeadNo(createdLead.leadNo)}
                </p>
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
            <section className="space-y-3">
              <RequiredHeading>{f('country')}</RequiredHeading>
              <div className="grid gap-3 sm:grid-cols-2">
                {([
                  ['de', f('germany')],
                  ['dk', f('denmark')],
                  ['other', f('other')],
                ] as [Exclude<CountryQuickChoice, ''>, string][]).map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    onClick={() => handleCountryChoice(value)}
                    className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${
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
                  value={specificCountry}
                  onChange={(e) => {
                    setSpecificCountry(e.target.value);
                    setDealerNumber('');
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">{f('chooseCountry')}</option>
                  {countryOptions.map((country) => <option key={country} value={country}>{country}</option>)}
                </select>
              )}
            </section>

            <section className="space-y-3">
              <RequiredHeading>{f('dealerCustomer')}</RequiredHeading>
              <div className="grid gap-3 sm:grid-cols-2">
                {(['dealer', 'customer'] as Exclude<LeadType, ''>[]).map((type) => (
                  <button
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
                      {type === 'dealer'
                        ? f('dealerDesc')
                        : f('customerDesc')}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <RequiredHeading>{f('customerInfo')}</RequiredHeading>
              <div className="grid gap-3 sm:grid-cols-2">
                <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder={f('companyPlaceholder')} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                <input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} placeholder={f('contactPlaceholder')} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder={f('addressPlaceholder')} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                <input value={zipCity} onChange={(e) => setZipCity(e.target.value)} placeholder={f('zipCityPlaceholder')} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={f('phonePlaceholder')} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={f('emailPlaceholder')} type="email" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </div>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={f('commentPlaceholder')} rows={4} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </section>

            <section className="space-y-3">
              <RequiredHeading>{f('product')}</RequiredHeading>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {PRODUCTS.map((product) => (
                  <label key={product} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <input
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
                      {EQUIPMENT_GROUPS.filter((group) => group.machine === 'RC-1000s' || group.machine === 'Timan 2620').map((group) => {
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
            </section>

            <section className="space-y-3">
              <RequiredHeading>{f('demo')}</RequiredHeading>
              <div className="grid gap-3 sm:grid-cols-2">
                {(['yes', 'no'] as const).map((value) => (
                  <button
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
            </section>
            <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <RequiredHeading>{f('responsible')}</RequiredHeading>
                {loadingData && <Loader2 className="h-4 w-4 animate-spin text-slate-500" />}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sellerOptions.map((seller) => (
                  <button
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
            </section>

            <section className="space-y-2">
              <label className="text-sm font-bold">
                {f('businessCard')}
                <RequiredMark />
              </label>
              <input
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
                    <div key={`${file.name}-${file.size}`} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
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
            </section>

            <div className="flex justify-end border-t border-slate-200 pt-5">
              <button
                type="submit"
                disabled={submitting || !isFormReady}
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
