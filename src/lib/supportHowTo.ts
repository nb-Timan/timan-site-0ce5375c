const SPARE_PARTS_PATTERN = /(reservedele?|reservedelsportal(?:en)?|reservedelsordre|reservedelsliste|spare parts?|parts portal|spare-parts order|ersatzteil[a-zäöüß]*|ricambi|alkatrész[a-záéíóöőúüű]*|reservdelar?|reservdelsportal(?:en)?|pièces détachées|części zamienne|náhradní díly)/i;
const ORDERING_PATTERN = /(bestil(?:le|ler)?|køb(?:e|er)?|får jeg|ordre|order|buy|bestell[a-zäöüß]*|kaufen|ordinare|acquistare|rendel[a-záéíóöőúüű]*|vásárolni|beställ[a-zåäö]*|köpa|commander|acheter|zamówić|kupić|objednat|koupit)/i;
const PORTAL_HELP_PATTERN = /(reservedelsportal(?:en)?|parts portal|ersatzteilportal|portale ricambi|alkatrészportál|reservdelsportal(?:en)?|portail des pièces|portal części|portál náhradních dílů|lagerstatus|stock status|lagerbestand|disponibilit[àé]|készlet|stan magazynowy|stav skladu|grønne? kurv|green cart|grünen? warenkorb|carrello verde|zöld kosár|gröna? kundvagn|panier vert|zielony koszyk|zelený košík|et-liste|spare-parts list|ersatzteilliste|lista ricambi|alkatrészlista|reservdelslista|liste de pièces|lista części|seznam dílů)/i;
const PORTAL_ACTION_PATTERN = /(hvordan|brug(?:er|e)?|åbn|se priser|how|use|open|prices?|wie|verwenden|öffnen|preise|come|usare|apri|prezzi|hogyan|használ|nyisd|árak|hur|använd|öppna|priser|comment|utiliser|ouvrir|prix|jak|używać|otwórz|ceny|používat|otevřít)/i;
const DELIVERY_PATTERN = /(hvor er|min ordre|ordrestatus|levering|leveringsstatus|where is|order status|delivery|lieferung|lieferstatus|bestellstatus|dov['’]?è|stato ordine|consegna|hol van|rendelés állapota|szállítás|var är|orderstatus|leverans|où est|statut de commande|livraison|gdzie jest|status zamówienia|dostawa|kde je|stav objednávky|doručení)/i;
const IDENTIFICATION_PATTERN = /(hvilken|varenummer|reservedelsnummer|which part|part number|welches teil|teilenummer|quale ricambio|numero ricambio|melyik alkatrész|cikkszám|vilken reservdel|artikelnummer|quelle pièce|référence pièce|która część|numer części|který díl|číslo dílu)/i;

export type SupportSparePartsGuidanceIntent =
  | 'SPARE_PARTS_ORDERING'
  | 'SPARE_PARTS_PORTAL_HELP'
  | 'SPARE_PARTS_DELIVERY';

export type SupportSparePartsGuidanceTopic =
  | 'spare-parts-ordering'
  | 'spare-parts-portal-help'
  | 'spare-parts-delivery';

export interface SupportHowToContext {
  domain: 'TIMAN_HOW_TO';
  source: 'approved_knowledge';
  topic: SupportSparePartsGuidanceTopic;
  intent: SupportSparePartsGuidanceIntent;
}

export function isSupportHowToQuestion(question: string): boolean {
  return buildSupportHowToContext(question) !== null;
}

export function buildSupportHowToContext(question: string): SupportHowToContext | null {
  const hasSparePartsContext = SPARE_PARTS_PATTERN.test(question);
  if (hasSparePartsContext && DELIVERY_PATTERN.test(question)) {
    return { domain: 'TIMAN_HOW_TO', source: 'approved_knowledge', topic: 'spare-parts-delivery', intent: 'SPARE_PARTS_DELIVERY' };
  }
  if ((hasSparePartsContext && PORTAL_HELP_PATTERN.test(question) && PORTAL_ACTION_PATTERN.test(question))
      || (/\b(priser?|prices?|preise|prezzi|árak|prix|ceny)\b/i.test(question) && /\b(lagerstatus|stock status|lagerbestand|disponibilit[àé]|készlet|stan magazynowy|stav skladu)\b/i.test(question))
      || /\b(grønne? kurv|green cart|grünen? warenkorb|carrello verde|zöld kosár|gröna? kundvagn|panier vert|zielony koszyk|zelený košík)\b/i.test(question)
      || /\b(et-liste|spare-parts list|ersatzteilliste|lista ricambi|alkatrészlista|reservdelslista|liste de pièces|lista części|seznam dílů)\b/i.test(question)) {
    return { domain: 'TIMAN_HOW_TO', source: 'approved_knowledge', topic: 'spare-parts-portal-help', intent: 'SPARE_PARTS_PORTAL_HELP' };
  }
  if (hasSparePartsContext && ORDERING_PATTERN.test(question) && !IDENTIFICATION_PATTERN.test(question)) {
    return { domain: 'TIMAN_HOW_TO', source: 'approved_knowledge', topic: 'spare-parts-ordering', intent: 'SPARE_PARTS_ORDERING' };
  }
  return null;
}
