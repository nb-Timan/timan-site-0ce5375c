"""Lossless commercial snapshot projection; no pricing engine or database writes."""

from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation, localcontext
import json


class ContractError(ValueError):
    pass


def obj(value):
    if value is None:
        return {}
    return json.loads(value, parse_float=Decimal) if isinstance(value, str) else value


def text(value):
    return None if value is None or str(value).strip() == "" else str(value)


def number(value):
    if value is None or isinstance(value, bool):
        raise ContractError("Missing/invalid numeric value")
    try:
        result = Decimal(str(value))
    except InvalidOperation as exc:
        raise ContractError("Invalid numeric value") from exc
    if not result.is_finite() or result.as_tuple().exponent < -12 or result.adjusted() >= 26:
        raise ContractError("Value does not fit decimal(38,12)")
    return result


def timestamp(value):
    if not value:
        return None
    parsed = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ContractError("Source timestamp must include timezone")
    return parsed.astimezone(timezone.utc)


def day(value):
    if not value:
        return None
    if isinstance(value, datetime):
        raise ContractError("Expected date, not timestamp")
    return value if isinstance(value, date) else date.fromisoformat(value)


def submitted(configuration):
    return bool((configuration.get("document_type") == "order"
                 or configuration.get("case_type") == "order"
                 or configuration.get("order_number") is not None)
                and (configuration.get("submitted_at") or configuration.get("order_sent_at")))


# The original revision has no source session UUID. Its namespaced key is stable.
def revisions(configuration, sessions):
    order_id = configuration["id"]
    if any(s["configuration_id"] != order_id for s in sessions):
        raise ContractError("Correction belongs to a different order")
    if len({s["id"] for s in sessions}) != len(sessions):
        raise ContractError("Duplicate correction session")
    sessions = sorted(sessions, key=lambda s: (timestamp(s["started_at"]), s["id"]))
    original = obj(sessions[0].get("before_snapshot")) if sessions else {"configuration": configuration}
    result = [(0, None, original, None)]
    # Number ALL sessions, including expired/active ones, exactly as the RPC does.
    for n, session in enumerate(sessions, 1):
        if session["status"] == "completed" and session.get("completed_at") and session.get("after_snapshot"):
            result.append((n, session["id"], obj(session["after_snapshot"]), session))
    current = max(result[1:], key=lambda r: (timestamp(r[3]["completed_at"]), r[0])) if len(result) > 1 else result[0]
    # Ignore original's absent timestamp when selecting completed revisions.
    return result, current[0]


TABLES = {
    "order": "order_id:string order_number:string quote_number:string source_quote_id:string title:string current_status:string seller_id:string dealer_id:string dealer_number:string seller_name:string dealer_name:string created_at:timestamp submitted_at:timestamp sent_at:timestamp updated_at:timestamp current_revision_key:string",
    "revision": "revision_key:string order_id:string revision_id:string revision_number:long is_current:boolean revised_at:timestamp confirmation_sent_at:timestamp actor_user_id:string revision_reason:string currency:string subtotal:decimal discount:decimal total:decimal financial_status:string delivery_date:date delivery_method:string payment_terms:string purchase_order_number:string comment:string company_name:string contact_person_name:string phone:string filler_email:string recipient_email:string address:string postal_code:string city:string country:string seller_id:string dealer_id:string source_kind:string",
    "line": "line_key:string revision_key:string order_id:string line_number:long unit_number:long machine_key:string item_number:string description:string note:string quantity:decimal unit_price:decimal line_total:decimal currency:string",
    "machine": "machine_key:string revision_key:string order_id:string unit_number:long machine_config_id:string machine_type:string config_mode:string delivery_date:date purchase_reference:string",
    "discount": "discount_key:string revision_key:string order_id:string ordinal:long kind:string basis:decimal percentage:decimal amount:decimal item_number:string campaign_id:string description:string currency:string",
    "reference": "reference_key:string revision_key:string order_id:string line_key:string unit_number:long reference:string source:string",
    "quality": "order_id:string revision_key:string code:string",
}


def project_order(configuration, sessions):
    with localcontext() as context:
        context.prec = 50
        return _project_order(configuration, sessions)


def _project_order(configuration, sessions):
    """Return flat, typed tables for one order; malformed financial data is quarantined."""
    configuration = obj(configuration)
    tables = {name: [] for name in TABLES}
    if not submitted(configuration):
        return tables
    order_id = configuration["id"]
    source_revisions, current_number = revisions(configuration, sessions)
    key_for = lambda n, sid: f"{order_id}:{sid or 'original'}"
    current_key = next(key_for(n, sid) for n, sid, _, _ in source_revisions if n == current_number)
    tables["order"].append({
        "order_id": order_id, "order_number": text(configuration.get("order_number")),
        "quote_number": text(configuration.get("source_quote_number") or configuration.get("quote_number")),
        "source_quote_id": text(configuration.get("source_quote_id")), "title": text(configuration.get("title")),
        "current_status": text(configuration.get("case_status") or configuration.get("status")),
        "seller_id": text(configuration.get("assigned_seller_id")), "dealer_id": text(configuration.get("dealer_account_id")),
        "dealer_number": text(configuration.get("dealer_number")), "seller_name": text(configuration.get("seller_name")),
        "dealer_name": text(configuration.get("dealer_name")),
        "created_at": timestamp(configuration.get("created_at")), "updated_at": timestamp(configuration.get("updated_at")),
        "submitted_at": timestamp(configuration.get("submitted_at")), "sent_at": timestamp(configuration.get("order_sent_at")),
        "current_revision_key": current_key,
    })
    for n, sid, snapshot, session in source_revisions:
        revision_key = key_for(n, sid)
        saved = snapshot.get("configuration") or {}
        if saved.get("id") != order_id:
            raise ContractError("Missing snapshot or snapshot/order ID mismatch")
        state = obj(saved.get("state_json"))
        pricing = obj(state.get("pricingSnapshot"))
        base = {"order_id": order_id, "revision_key": revision_key}
        revision = {**base, "revision_id": sid, "revision_number": n, "is_current": n == current_number,
                    "revised_at": timestamp(session["completed_at"] if session else saved.get("submitted_at") or saved.get("order_sent_at")),
                    "confirmation_sent_at": timestamp(session.get("confirmation_sent_at")) if session else timestamp(saved.get("order_sent_at")),
                    "actor_user_id": text(session.get("actor_user_id")) if session else None,
                    "revision_reason": text(session.get("reason")) if session else None,
                    "currency": text(pricing.get("currency") or saved.get("currency")),
                    "subtotal": None, "discount": None, "total": None, "financial_status": "MISSING_SNAPSHOT",
                    "delivery_date": day(state.get("date")), "delivery_method": text(state.get("deliveryMethod")),
                    "payment_terms": text(state.get("paymentTerms")), "purchase_order_number": text(state.get("purchaseOrderNumber")),
                    "comment": text(state.get("comment")), "company_name": text(state.get("firmanavn")),
                    "contact_person_name": text(state.get("kontaktperson")),
                    "phone": text(state.get("telefon")), "filler_email": text(state.get("email")), "recipient_email": text(state.get("emailRecipient")),
                    "address": text(state.get("address")), "postal_code": text(state.get("postalCode")),
                    "city": text(state.get("city")), "country": text(state.get("country")),
                    "seller_id": text(saved.get("assigned_seller_id")), "dealer_id": text(saved.get("dealer_account_id")),
                    "source_kind": "CORRECTION_AFTER" if session else "FIRST_BEFORE" if sessions else "SUBMITTED_ROW"}
        tables["revision"].append(revision)
        unit = 0
        machines = {}
        for machine in state.get("machineConfigs", []):
            qty = number(machine.get("qty", 0))
            if qty != qty.to_integral_value() or qty < 0 or qty > 10000:
                raise ContractError("Invalid machine quantity")
            for index in range(1, int(qty) + 1):
                unit += 1
                machine_key = f"{revision_key}:unit:{unit}"
                machines[unit] = machine_key
                dates = state.get("machineDeliveryDates") or {}
                reference = text((state.get("reqNumbers") or {}).get(f"machine_{unit}"))
                tables["machine"].append({**base, "machine_key": machine_key, "unit_number": unit,
                                          "machine_config_id": machine["id"], "machine_type": machine.get("type"),
                                          "config_mode": machine.get("configMode"),
                                          "delivery_date": day(dates.get(f"{machine['id']}_{index}") or dates.get(f"machine_{unit}") or state.get("date")),
                                          "purchase_reference": reference})
                if reference:
                    tables["reference"].append({**base, "reference_key": f"{machine_key}:reference", "line_key": None,
                                                "unit_number": unit, "reference": reference, "source": "MACHINE"})
        if revision["purchase_order_number"]:
            tables["reference"].append({**base, "reference_key": f"{revision_key}:po", "line_key": None,
                                        "unit_number": None, "reference": revision["purchase_order_number"], "source": "LEGACY_ORDER"})
        if not isinstance(pricing.get("lines"), list) or not isinstance(pricing.get("totals"), dict):
            tables["quality"].append({**base, "code": "MISSING_SNAPSHOT"})
            continue
        try:
            if not revision["currency"] or (saved.get("currency") and saved["currency"] != revision["currency"]):
                raise ContractError("Missing/inconsistent currency")
            totals = pricing["totals"]
            subtotal, discount, total = [number(totals.get(k)) for k in ("subtotal", "totalDiscount", "finalPrice")]
            lines = []
            references = []
            discounts = []
            for ordinal, line in enumerate(pricing["lines"], 1):
                line_key = f"{revision_key}:line:{ordinal}"
                unit_number = line.get("unitNumber")
                if unit_number is not None and (isinstance(unit_number, bool) or number(unit_number) != int(number(unit_number))):
                    raise ContractError("Invalid line unit number")
                unit_number = int(unit_number) if unit_number is not None else None
                if unit_number and unit_number not in machines:
                    tables["quality"].append({**base, "code": f"UNMAPPED_LINE_UNIT:{ordinal}"})
                if not text(line.get("itemNo")):
                    raise ContractError("Missing item number")
                lines.append({**base, "line_key": line_key, "line_number": ordinal, "unit_number": unit_number,
                              "machine_key": machines.get(unit_number), "item_number": text(line["itemNo"]),
                              "description": text(line.get("description")), "note": text(line.get("note")),
                              "quantity": number(line.get("quantity")), "unit_price": number(line.get("unitPrice")),
                              "line_total": number(line.get("total")), "currency": revision["currency"]})
                for i, reference in enumerate(line.get("purchaseReferences") or [], 1):
                    if text(reference):
                        references.append({**base, "reference_key": f"{line_key}:reference:{i}", "line_key": line_key,
                                           "unit_number": unit_number, "reference": text(reference), "source": "FROZEN_LINE"})
            if abs(sum((l["line_total"] for l in lines), Decimal(0)) - subtotal) > Decimal("0.02") or abs(subtotal - discount - total) > Decimal("0.02"):
                raise ContractError("Historical line/totals mismatch")
            for ordinal, detail in enumerate(pricing.get("discountDetails") or [], 1):
                discounts.append({**base, "discount_key": f"{revision_key}:discount:{ordinal}", "ordinal": ordinal,
                                  "kind": text(detail.get("kind")), "basis": number(detail["basis"]) if detail.get("basis") is not None else None,
                                  "percentage": number(detail["percent"]) if detail.get("percent") is not None else None,
                                  "amount": number(detail.get("amount")), "item_number": text(detail.get("varenr")),
                                  "campaign_id": text(detail.get("campaignId")), "description": text(detail.get("txt")),
                                  "currency": revision["currency"]})
            revision.update(subtotal=subtotal, discount=discount, total=total, financial_status="VALID")
            tables["line"].extend(lines)
            tables["reference"].extend(references)
            tables["discount"].extend(discounts)
        except (ContractError, ValueError, TypeError):
            revision["financial_status"] = "INVALID_SNAPSHOT"
            tables["quality"].append({**base, "code": "INVALID_SNAPSHOT"})
    return tables
