import { PRODUCTS, getAccessoriesFlat, getLocalizedName } from '@/data/machines';
import {
  getConfiguratorMachineUnits,
  setConfiguratorMachineQuantity,
  toggleConfiguratorAccessory,
} from '@/lib/configuratorDomain';
import { createEmptyConfiguratorState, normalizeConfiguratorState } from '@/lib/configuratorState';
import type {
  AssistantActionCommand,
  AssistantWorkflowState,
  SupportActionCard,
} from '@/lib/supportTypes';
import type { ConfiguratorState, Language } from '@/types/configurator';

type AssistantDraftState = {
  configurator: ConfiguratorState;
  pendingField?: string | null;
  pendingMachineType?: string | null;
  pendingAccessoryChoices?: Array<{ unitIndex: number; accessoryId: string }>;
  dealer?: Record<string, unknown> | null;
  contact?: Record<string, unknown> | null;
  timanSeller?: Record<string, unknown> | null;
  canChangeTimanSeller?: boolean;
  quoteKind?: 'ordinary' | 'demo';
  [key: string]: unknown;
};

export type AssistantWorkflowInputCompatibility = 'compatible' | 'interrupt' | 'ambiguous';

export interface AssistantPrompt {
  state: AssistantDraftState;
  content: string;
  card?: SupportActionCard;
  ready: boolean;
}

function normalized(value: unknown): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function language(value: string): Language {
  return ['da', 'en', 'de', 'it', 'hu'].includes(value) ? value as Language : 'en';
}

export function resolveAssistantMachine(search: string): string | null {
  const query = normalized(search);
  if (!query) return null;
  const candidates = Object.values(PRODUCTS).map((machine) => ({
    type: machine.id,
    values: [
      machine.id,
      machine.varenr,
      machine.nameShort,
      ...(typeof machine.name === 'string' ? [machine.name] : Object.values(machine.name || {})),
    ]
      .map(normalized)
      .filter(Boolean),
  }));
  const direct = candidates.find((candidate) => candidate.values.some((value) => (
    query === value
    || (value.length >= 4 && query.includes(value))
    || (query.length >= 4 && value.includes(query))
  )));
  if (direct) return direct.type;
  if (/\b3330\b/.test(query)) return candidates.find((candidate) => candidate.type.includes('3330'))?.type || null;
  if (/\b2620\b/.test(query)) return candidates.find((candidate) => candidate.type.includes('2620'))?.type || null;
  if (/\brc\s?1000s?\b/.test(query)) return candidates.find((candidate) => normalized(candidate.type).includes('rc 1000'))?.type || null;
  return null;
}

function requestedQuantity(content: string): number {
  const match = content.match(/\b([1-9]|[1-9][0-9])\s*(?:stk\.?|styk(?:ker)?|pcs?|x)\b/i)
    || content.match(/\bx\s*([1-9]|[1-9][0-9])\b/i)
    || content.match(/\b([1-9]|[1-9][0-9])\s+(?=(?:timan|rc[-\s]))/i);
  return match ? Number(match[1]) : 1;
}

const CAMPAIGN_DISABLE_PATTERNS = [
  /\b(?:uden|without|ohne|senza|utan|sans|bez)\s+(?:kampagne|campaign|campagna|kampány|kampanj|campagne|kampanii|kampan[eě])\b/i,
  /\b(?:deaktiver|disable|deaktivieren|disattiva|kikapcsol|inaktivera|désactiver|wyłącz|deaktivovat)\b.{0,24}\b(?:kampagnen?|campaign|campagna|kampány|kampanj(?:en)?|campagne|kampanię|kampaň)\b/i,
];
const CAMPAIGN_ENABLE_PATTERNS = [
  /\b(?:med|with|mit|con|kampánnyal|avec|z|s)\s+(?:kampagne|campaign|campagna|kampány|kampanj|campagne|kampanią|kampaní)\b/i,
  /\b(?:genaktiver|enable|aktivieren|riattiva|bekapcsol|aktivera|réactiver|włącz|aktivovat)\b.{0,24}\b(?:kampagnen?|campaign|campagna|kampány|kampanj(?:en)?|campagne|kampanię|kampaň)\b/i,
];

export function assistantCampaignDisabledFromText(content: string): boolean | null {
  if (CAMPAIGN_DISABLE_PATTERNS.some((pattern) => pattern.test(content))) return true;
  if (CAMPAIGN_ENABLE_PATTERNS.some((pattern) => pattern.test(content))) return false;
  return null;
}

function productChoices(lang: Language): SupportActionCard {
  return {
    kind: 'choices',
    title: lang === 'da' ? 'Vælg maskine' : 'Choose machine',
    choices: Object.values(PRODUCTS)
      .filter((machine) => !machine.isLooseTool)
      .map((machine) => ({
        id: `machine-${machine.id}`,
        label: getLocalizedName(machine.name, lang),
        command: { type: 'select_machine', value: machine.id },
      })),
  };
}

function applyMentionedAccessories(state: ConfiguratorState, content: string): ConfiguratorState {
  let next = state;
  const query = normalized(content);
  for (const unit of getConfiguratorMachineUnits(next)) {
    const accessories = getAccessoriesFlat(unit.modelType).filter((item) => !item.hidden && !item.auto && !item.isHeader);
    for (const accessory of accessories) {
      const names = typeof accessory.name === 'string' ? [accessory.name] : Object.values(accessory.name || {});
      const itemNumber = normalized(accessory.varenr);
      const nameMatch = names.map(normalized).filter((name) => name.length >= 4).some((name) => query.includes(name));
      if (!nameMatch && !(itemNumber && query.includes(itemNumber))) continue;
      const selected = unit.isSharedUnit
        ? next.machineConfigs.find((machine) => machine.id === unit.modelId)?.acc || []
        : next.individualUnitConfigs[unit.configKey]?.acc || [];
      if (!selected.includes(accessory.id)) next = toggleConfiguratorAccessory(next, accessory.id, unit.globalIndex).state;
    }
  }
  return next;
}

function ambiguousMentionChoices(state: ConfiguratorState, content: string) {
  if (!/\bt2\b/i.test(content)) return [];
  const unit = getConfiguratorMachineUnits(state)[0];
  if (!unit) return [];
  return getAccessoriesFlat(unit.modelType)
    .filter((item) => !item.hidden && !item.auto && !item.isHeader)
    .filter((item) => {
      const names = typeof item.name === 'string' ? [item.name] : Object.values(item.name || {});
      return names.some((name) => normalized(name).startsWith('t2 '));
    })
    .map((item) => ({ unitIndex: unit.globalIndex, accessoryId: item.id }));
}

export function createAssistantConfiguratorDraft(content: string, uiLanguage: string): AssistantDraftState {
  const lang = language(uiLanguage);
  let configurator = createEmptyConfiguratorState(lang, 'quote');
  configurator.campaignDisabled = assistantCampaignDisabledFromText(content) === true;
  const machineType = resolveAssistantMachine(content);
  if (machineType) {
    configurator = setConfiguratorMachineQuantity(configurator, machineType, requestedQuantity(content));
    configurator = applyMentionedAccessories(configurator, content);
  }
  return {
    configurator,
    pendingField: machineType ? null : 'machine',
    pendingAccessoryChoices: machineType ? ambiguousMentionChoices(configurator, content) : [],
    quoteKind: undefined,
  };
}

function selectedForUnit(state: ConfiguratorState, unitIndex: number): string[] {
  const unit = getConfiguratorMachineUnits(state)[unitIndex];
  if (!unit) return [];
  return unit.isSharedUnit
    ? state.machineConfigs.find((machine) => machine.id === unit.modelId)?.acc || []
    : state.individualUnitConfigs[unit.configKey]?.acc || [];
}

function missingAccessoryGroup(state: ConfiguratorState) {
  for (const unit of getConfiguratorMachineUnits(state)) {
    const selected = selectedForUnit(state, unit.globalIndex);
    const grouped = getAccessoriesFlat(unit.modelType)
      .filter((item) => item.group && !item.hidden && !item.auto && !item.isHeader);
    const groups = [...new Set(grouped.map((item) => item.group!))];
    for (const group of groups) {
      if (!grouped.some((item) => item.group === group && selected.includes(item.id))) {
        return { unit, group, options: grouped.filter((item) => item.group === group) };
      }
    }
  }
  return null;
}

function applyDemoKind(state: ConfiguratorState, quoteKind: 'ordinary' | 'demo'): ConfiguratorState {
  if (quoteKind === 'ordinary') return { ...state, demoMachines: {} };
  const demoMachines: Record<string, boolean> = {};
  for (const unit of getConfiguratorMachineUnits(state)) {
    const itemNumber = PRODUCTS[unit.modelType]?.varenr;
    if (itemNumber) demoMachines[`${itemNumber}_${unit.unitNumber}`] = true;
  }
  return { ...state, demoMachines };
}

export function applyAssistantConfiguratorCommand(
  input: AssistantDraftState,
  command: AssistantActionCommand,
): AssistantDraftState {
  let state = normalizeConfiguratorState(input.configurator);
  if (command.type === 'select_machine' && command.value) {
    state = setConfiguratorMachineQuantity(state, command.value, 1);
  } else if (command.type === 'select_accessory' && command.value) {
    const [unitIndex, accessoryId] = command.value.split('::');
    state = toggleConfiguratorAccessory(state, accessoryId, Number(unitIndex)).state;
  } else if (command.type === 'set_delivery_method' && command.value) {
    state = { ...state, deliveryMethod: command.value as ConfiguratorState['deliveryMethod'] };
  } else if (command.type === 'set_quote_kind' && (command.value === 'ordinary' || command.value === 'demo')) {
    state = applyDemoKind(state, command.value);
    return { ...input, configurator: state, quoteKind: command.value, pendingField: null };
  } else if (command.type === 'set_campaign_disabled') {
    state = { ...state, campaignDisabled: command.value !== 'false' };
  }
  return { ...input, configurator: state, pendingField: null, pendingAccessoryChoices: [] };
}

export function applyAssistantTextInput(input: AssistantDraftState, content: string): AssistantDraftState {
  const pending = String(input.pendingField || '');
  let state = normalizeConfiguratorState(input.configurator);
  const campaignDisabled = assistantCampaignDisabledFromText(content);
  if (campaignDisabled !== null) state = { ...state, campaignDisabled };
  if (pending === 'machine') {
    const machineType = resolveAssistantMachine(content);
    if (machineType) state = setConfiguratorMachineQuantity(state, machineType, requestedQuantity(content));
  } else if (pending === 'delivery_date') {
    const iso = content.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/)?.[0];
    if (iso) state = { ...state, date: iso };
  }
  return { ...input, configurator: state, pendingField: null };
}

const WORKFLOW_CANCEL_PATTERNS = [
  /\b(?:stop|annuller|nulstil|afbryd)\b.{0,40}\btilbud(?:det)?\b/i,
  /\bjeg\s+vil\s+ikke\s+have\s+et\s+tilbud\b/i,
  /\bjeg\s+vil\s+hellere\s+sp[øo]rge\s+om\s+noget\s+andet\b/i,
  /\b(?:stop|cancel|reset|abort)\b.{0,40}\b(?:quote|offer)\b/i,
  /\bi\s+(?:do\s+not|don['’]?t)\s+want\s+(?:a\s+)?(?:quote|offer)\b/i,
  /\b(?:angebot|offerta|aj[aá]nlat|offert|devis|ofert[aeę]|nab[ií]dk[au])\b.{0,40}\b(?:abbrechen|stornieren|annullare|megszak[ií]t|avbryt|annuler|anuluj|zru[sš]it)\b/i,
  /\b(?:abbrechen|stornieren|annullare|megszak[ií]t|avbryt|annuler|anuluj|zru[sš]it)\b.{0,40}\b(?:angebot|offerta|aj[aá]nlat|offert|devis|ofert[aeę]|nab[ií]dk[au])\b/i,
];

const QUESTION_WORDS = /\b(?:hvor|hvad|hvordan|hvem|hvilken|hvilket|what|where|when|how|who|which|was|wer|wie|wo|wann|quanto|quale|come|dove|mi|mit|hogyan|ki|melyik|vad|var|n[aä]r|hur|qui|quoi|quel|comment|o[uù]|kto|co|jak|gdzie|kdo|jak|kde)\b/i;

export function matchAssistantWorkflowTextChoice(
  input: AssistantDraftState,
  content: string,
  uiLanguage: string,
): AssistantActionCommand | null {
  const prompt = nextAssistantConfiguratorPrompt(input, uiLanguage);
  const query = normalized(content);
  if (!query || !prompt.card?.choices?.length) return null;
  const choice = prompt.card.choices.find((item) => {
    const label = normalized(item.label);
    const value = normalized(item.command.value);
    return query === label
      || (label.length >= 4 && query.includes(label))
      || (value.length >= 4 && query === value);
  });
  return choice?.command || null;
}

export function classifyAssistantWorkflowInput(
  input: AssistantDraftState,
  content: string,
  uiLanguage: string,
): AssistantWorkflowInputCompatibility {
  const value = content.trim();
  const pending = String(input.pendingField || '');
  if (!value) return 'ambiguous';
  if (WORKFLOW_CANCEL_PATTERNS.some((pattern) => pattern.test(value))) return 'interrupt';
  if (assistantCampaignDisabledFromText(value) !== null) return 'compatible';

  const choice = matchAssistantWorkflowTextChoice(input, value, uiLanguage);
  if (choice) return 'compatible';
  if (QUESTION_WORDS.test(value)) return 'interrupt';

  if (pending === 'machine') return resolveAssistantMachine(value) ? 'compatible' : 'ambiguous';
  if (pending === 'delivery_date') return /\b20\d{2}-\d{2}-\d{2}\b/.test(value) ? 'compatible' : 'ambiguous';
  if (pending === 'dealer') return normalized(value).length >= 2 ? 'compatible' : 'ambiguous';
  if (pending === 'contact' || pending === 'timan_seller') return 'ambiguous';
  if (pending.startsWith('accessory:') || pending === 'delivery_method' || pending === 'quote_kind') {
    return 'ambiguous';
  }
  return 'interrupt';
}

export function nextAssistantConfiguratorPrompt(input: AssistantDraftState, uiLanguage: string): AssistantPrompt {
  const lang = language(uiLanguage);
  const state = normalizeConfiguratorState(input.configurator);
  if (!state.machineConfigs.length) {
    return {
      state: { ...input, configurator: state, pendingField: 'machine' },
      content: lang === 'da' ? 'Hvilken Timan-maskine skal tilbuddet indeholde?' : 'Which Timan machine should the quote include?',
      card: productChoices(lang),
      ready: false,
    };
  }
  if (input.pendingAccessoryChoices?.length) {
    const first = input.pendingAccessoryChoices[0];
    const unit = getConfiguratorMachineUnits(state)[first.unitIndex];
    const options = unit
      ? getAccessoriesFlat(unit.modelType).filter((item) => (
          input.pendingAccessoryChoices!.some((choice) => choice.accessoryId === item.id)
        ))
      : [];
    if (unit && options.length) {
      return {
        state: { ...input, configurator: state, pendingField: 'accessory:mentioned', pendingMachineType: unit.modelType },
        content: lang === 'da'
          ? 'Der er flere T2-muligheder. Vælg den ønskede konfiguration.'
          : 'There are several T2 options. Choose the intended configuration.',
        card: {
          kind: 'choices',
          title: 'T2',
          choices: options.map((item) => ({
            id: `accessory-${unit.globalIndex}-${item.id}`,
            label: getLocalizedName(item.name, lang),
            command: { type: 'select_accessory', value: `${unit.globalIndex}::${item.id}` },
          })),
        },
        ready: false,
      };
    }
  }
  const missingGroup = missingAccessoryGroup(state);
  if (missingGroup) {
    const machineName = getLocalizedName(PRODUCTS[missingGroup.unit.modelType]?.name || missingGroup.unit.modelType, lang);
    return {
      state: { ...input, configurator: state, pendingField: `accessory:${missingGroup.group}`, pendingMachineType: missingGroup.unit.modelType },
      content: lang === 'da'
        ? `Vælg ${missingGroup.group} til ${machineName}.`
        : `Choose ${missingGroup.group} for ${machineName}.`,
      card: {
        kind: 'choices',
        title: String(missingGroup.group).replaceAll('_', ' '),
        choices: missingGroup.options.map((item) => ({
          id: `accessory-${missingGroup.unit.globalIndex}-${item.id}`,
          label: getLocalizedName(item.name, lang),
          command: { type: 'select_accessory', value: `${missingGroup.unit.globalIndex}::${item.id}` },
        })),
      },
      ready: false,
    };
  }
  if (!state.date) {
    return {
      state: { ...input, configurator: state, pendingField: 'delivery_date' },
      content: lang === 'da' ? 'Skriv ønsket leveringsdato som ÅÅÅÅ-MM-DD.' : 'Enter the requested delivery date as YYYY-MM-DD.',
      ready: false,
    };
  }
  if (!state.deliveryMethod) {
    return {
      state: { ...input, configurator: state, pendingField: 'delivery_method' },
      content: lang === 'da' ? 'Hvordan skal maskinen leveres?' : 'How should the machine be delivered?',
      card: {
        kind: 'choices',
        title: lang === 'da' ? 'Levering' : 'Delivery',
        choices: [
          { id: 'delivery-pickup', label: lang === 'da' ? 'Afhentning' : 'Pickup', command: { type: 'set_delivery_method', value: 'pickup' } },
          { id: 'delivery-send', label: lang === 'da' ? 'Forsendelse' : 'Shipping', command: { type: 'set_delivery_method', value: 'send' } },
          { id: 'delivery-deliver', label: lang === 'da' ? 'Levering og opstart' : 'Delivery and startup', command: { type: 'set_delivery_method', value: 'deliver' } },
        ],
      },
      ready: false,
    };
  }
  if (!input.dealer) {
    return {
      state: { ...input, configurator: state, pendingField: 'dealer' },
      content: lang === 'da' ? 'Skriv mindst to bogstaver af forhandlerens navn.' : 'Enter at least two letters from the dealer name.',
      ready: false,
    };
  }
  if (!input.contact) {
    return {
      state: { ...input, configurator: state, pendingField: 'contact' },
      content: lang === 'da' ? 'Vælg kontaktpersonen til tilbuddet.' : 'Choose the contact for the quote.',
      ready: false,
    };
  }
  if (!input.timanSeller) {
    return {
      state: { ...input, configurator: state, pendingField: 'timan_seller' },
      content: lang === 'da' ? 'Timan-sælgeren findes ud fra forhandlerens ansvarlige sælger og land.' : 'The Timan seller is resolved from the dealer owner and country.',
      ready: false,
    };
  }
  if (!input.quoteKind) {
    const sellerName = String(input.timanSeller.name || '');
    const sellerEmail = String(input.timanSeller.email || '');
    return {
      state: { ...input, configurator: state, pendingField: 'quote_kind' },
      content: lang === 'da' ? 'Er det et almindeligt tilbud eller en demomaskine?' : 'Is this an ordinary quote or a demo machine?',
      card: {
        kind: 'choices',
        title: lang === 'da' ? 'Tilbud' : 'Quote',
        lines: [
          { label: lang === 'da' ? 'Timan-sælger' : 'Timan seller', value: [sellerName, sellerEmail].filter(Boolean).join(' · ') },
        ],
        choices: [
          { id: 'quote-ordinary', label: lang === 'da' ? 'Almindeligt tilbud' : 'Ordinary quote', command: { type: 'set_quote_kind', value: 'ordinary' } },
          { id: 'quote-demo', label: lang === 'da' ? 'Demomaskine' : 'Demo machine', command: { type: 'set_quote_kind', value: 'demo' } },
          ...(input.canChangeTimanSeller
            ? [{ id: 'change-timan-seller', label: lang === 'da' ? 'Skift sælger' : 'Change seller', command: { type: 'change_timan_seller' as const } }]
            : []),
        ],
      },
      ready: false,
    };
  }
  return {
    state: { ...input, configurator: state, pendingField: null },
    content: lang === 'da' ? 'Konfigurationen er klar til prisberegning.' : 'The configuration is ready for pricing.',
    ready: true,
  };
}

export function hydrateAssistantWorkflow(workflow: AssistantWorkflowState): AssistantDraftState {
  return {
    configurator: normalizeConfiguratorState(workflow.configurator),
    pendingField: workflow.pendingField,
    pendingMachineType: workflow.pendingMachineType,
    pendingAccessoryChoices: Array.isArray(workflow.pendingAccessoryChoices)
      ? workflow.pendingAccessoryChoices as Array<{ unitIndex: number; accessoryId: string }>
      : [],
    dealer: workflow.dealer,
    contact: workflow.contact,
    timanSeller: workflow.timanSeller,
    canChangeTimanSeller: workflow.canChangeTimanSeller,
    quoteKind: workflow.quoteKind,
  };
}
