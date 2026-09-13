export const ACADEMY_PARTNERDATA_PART_1 = 'partnerdata.part_1_profile';
export const ACADEMY_PARTNERDATA_PART_2 = 'partnerdata.part_2_relations';

type PartnerDataState = {
  part1Started: boolean;
  part2Started: boolean;
  contactName: string;
  primaryContactId: string | null;
  youtubeChannel: string;
  relationReviewed: boolean;
  invoiceFlowReviewed: boolean;
};

const KEY = 'timan.academy.partnerdata.v1';
const SESSION_KEY = 'timan.academy.session.v1';

const initial = (): PartnerDataState => ({
  part1Started: false,
  part2Started: false,
  contactName: '',
  primaryContactId: null,
  youtubeChannel: '',
  relationReviewed: false,
  invoiceFlowReviewed: false,
});

function read(): PartnerDataState {
  try {
    return { ...initial(), ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } } catch {
    return initial();
  }
}

function write(state: PartnerDataState) {
  localStorage.setItem(KEY, JSON.stringify(state));
  return state;
}

function isAcademyMode() {
  return import.meta.env.DEV && (
    new URLSearchParams(window.location.search).get('academy_mode') === 'true'
    || sessionStorage.getItem(SESSION_KEY) === 'active'
  );
}

function isYoutubeChannel(value: string) {
  return /^https?:\/\/(www\.)?youtube\.com\//i.test(value.trim());
}

function progress(state = read()) {
  const part1Completed = Boolean(state.contactName.trim())
    && state.primaryContactId === 'academy-contact-1'
    && isYoutubeChannel(state.youtubeChannel);
  const part2Completed = part1Completed && state.relationReviewed && state.invoiceFlowReviewed;
  return { part1Completed, part2Completed };
}

function assertActive() {
  if (!isAcademyMode()) throw new Error('Academy Partnerdata writes must never use production persistence.');
}

export const academyPartnerDataSandbox = {
  isActive: isAcademyMode,
  getState: read,
  getProgress: () => progress(),
  start(part: 1 | 2) {
    assertActive();
    const current = read();
    if (part === 2 && !progress(current).part1Completed) throw new Error('Partnerdata Part 1 skal gennemføres først.');
    return write({
      ...current,
      part1Started: part === 1 || current.part1Started,
      part2Started: part === 2 || current.part2Started,
    });
  },
  saveProfile(patch: Pick<PartnerDataState, 'contactName' | 'youtubeChannel'>) {
    assertActive();
    return write({ ...read(), ...patch });
  },
  choosePrimaryContact(contactId: string) {
    assertActive();
    return write({ ...read(), primaryContactId: contactId });
  },
  reviewPartnerRelation() {
    assertActive();
    return write({ ...read(), relationReviewed: true });
  },
  reviewInvoiceFlow() {
    assertActive();
    return write({ ...read(), invoiceFlowReviewed: true });
  },
};
