from copy import deepcopy
from datetime import datetime, timezone
from decimal import Decimal
import ast
from pathlib import Path
import unittest

from fabric.portal_orders.model import ContractError, TABLES, day, number, project_order, timestamp
from fabric.portal_orders.staging import SOURCES, check_schema


def configuration():
    return {"id": "order-a", "order_number": "O-TEST", "document_type": "order",
            "submitted_at": "2026-09-30T14:16:06Z", "order_sent_at": "2026-09-30T14:16:06Z",
            "created_at": "2026-09-30T14:16:02Z", "currency": "EUR", "total_price": 80,
            "assigned_seller_id": "seller-a", "dealer_account_id": "dealer-a",
            "state_json": {"date": "2026-10-21", "firmanavn": "Example",
                           "kontaktperson": "Contact", "telefon": "+4512345678",
                           "email": "filler@example.invalid", "emailRecipient": "buyer@example.invalid",
                           "address": "Street 1", "postalCode": "0123", "city": "City", "country": "Country",
                           "machineConfigs": [{"id": "m0", "type": "RC-1000S", "qty": 1, "configMode": "individual"}],
                           "reqNumbers": {"machine_1": "PO-A"},
                           "pricingSnapshot": {"currency": "EUR", "lines": [
                               {"itemNo": "001", "description": "Machine", "quantity": 1, "unitPrice": 100,
                                "total": 100, "unitNumber": 1, "purchaseReferences": ["PO-A"]}],
                               "totals": {"subtotal": 100, "totalDiscount": "19.99", "finalPrice": "80.01"},
                               "discountDetails": [{"kind": "base", "basis": 100, "percent": "19.99", "amount": "19.99"}]}}}


def correction(n, before=None, after=None, status="completed"):
    return {"id": f"session-{n}", "configuration_id": "order-a", "status": status,
            "started_at": f"2026-10-01T0{n}:00:00Z", "completed_at": f"2026-10-01T0{n}:01:00Z",
            "before_snapshot": {"configuration": before or configuration()},
            "after_snapshot": {"configuration": after or configuration()}}


class ModelTests(unittest.TestCase):
    def test_submitted_only(self):
        source = configuration()
        source.update(submitted_at=None, order_sent_at=None)
        self.assertFalse(project_order(source, [])["order"])

    def test_order_number_marks_legacy_order(self):
        source = configuration()
        source.update(document_type="quote")
        self.assertEqual(len(project_order(source, [])["order"]), 1)

    def test_grain_and_frozen_decimal_not_rounded_header(self):
        tables = project_order(configuration(), [])
        self.assertEqual([len(tables[k]) for k in ("order", "revision", "line")], [1, 1, 1])
        self.assertEqual(tables["revision"][0]["total"], Decimal("80.01"))
        self.assertEqual(tables["line"][0]["item_number"], "001")

    def test_revisions_preserve_original_and_number_all_sessions(self):
        sessions = [correction(1, status="expired"), correction(2), correction(3)]
        tables = project_order(configuration(), sessions)
        self.assertEqual([r["revision_number"] for r in tables["revision"]], [0, 2, 3])
        self.assertEqual([r["revision_number"] for r in tables["revision"] if r["is_current"]], [3])
        self.assertEqual(len(tables["line"]), 3)

    def test_current_selected_by_completion_not_start(self):
        first, second = correction(1), correction(2)
        first["completed_at"] = "2026-10-02T00:00:00Z"
        current = [r for r in project_order(configuration(), [first, second])["revision"] if r["is_current"]]
        self.assertEqual(current[0]["revision_number"], 1)

    def test_tie_breaker_session_id(self):
        first, second = correction(1), correction(2)
        second["started_at"], second["completed_at"] = first["started_at"], first["completed_at"]
        self.assertEqual(project_order(configuration(), [second, first])["order"][0]["current_revision_key"], "order-a:session-2")

    def test_active_session_uses_before_not_mutable_live_row(self):
        changed = configuration()
        changed["state_json"]["firmanavn"] = "Unsaved correction"
        result = project_order(changed, [correction(1, status="active")])
        self.assertEqual(result["revision"][0]["company_name"], "Example")

    def test_missing_snapshot_is_explicit_not_repriced(self):
        source = configuration()
        del source["state_json"]["pricingSnapshot"]
        result = project_order(source, [])
        self.assertEqual(result["quality"][0]["code"], "MISSING_SNAPSHOT")
        self.assertIsNone(result["revision"][0]["total"])
        self.assertFalse(result["line"])

    def test_mismatched_totals_quarantined(self):
        source = configuration()
        source["state_json"]["pricingSnapshot"]["totals"]["finalPrice"] = 99
        result = project_order(source, [])
        self.assertEqual(result["revision"][0]["financial_status"], "INVALID_SNAPSHOT")
        self.assertFalse(result["line"])

    def test_non_finite_or_missing_numeric_quarantined(self):
        for value in (None, "NaN", "Infinity", True):
            with self.subTest(value=value):
                source = configuration()
                source["state_json"]["pricingSnapshot"]["lines"][0]["unitPrice"] = value
                self.assertEqual(project_order(source, [])["revision"][0]["financial_status"], "INVALID_SNAPSHOT")

    def test_zero_price_retained(self):
        source = configuration()
        source["state_json"]["pricingSnapshot"]["lines"].append({"itemNo": "002", "quantity": 1, "unitPrice": 0, "total": 0})
        lines = project_order(source, [])["line"]
        self.assertEqual(len(lines), 2)
        self.assertEqual(lines[1]["unit_price"], Decimal(0))

    def test_multiple_units_have_separate_references_and_dates(self):
        source = configuration()
        state = source["state_json"]
        state["machineConfigs"][0]["qty"] = 2
        state["reqNumbers"]["machine_2"] = "PO-B"
        state["machineDeliveryDates"] = {"m0_2": "2026-11-02", "machine_2": "2026-11-03"}
        result = project_order(source, [])
        self.assertEqual(len(result["machine"]), 2)
        self.assertEqual(str(result["machine"][1]["delivery_date"]), "2026-11-02")
        self.assertEqual(result["machine"][1]["purchase_reference"], "PO-B")
        self.assertEqual(len(result["line"]), 1)

    def test_unmatched_unit_preserved_with_quality_flag(self):
        source = configuration()
        source["state_json"]["pricingSnapshot"]["lines"][0]["unitNumber"] = 9
        result = project_order(source, [])
        self.assertEqual(len(result["line"]), 1)
        self.assertIsNone(result["line"][0]["machine_key"])
        self.assertEqual(result["quality"][0]["code"], "UNMAPPED_LINE_UNIT:1")

    def test_contacts_are_separate_historical_fields(self):
        row = project_order(configuration(), [])["revision"][0]
        self.assertEqual(row["postal_code"], "0123")
        self.assertEqual(row["recipient_email"], "buyer@example.invalid")
        self.assertEqual(row["filler_email"], "filler@example.invalid")
        self.assertNotIn("contact_information", row)

    def test_no_cross_order_sessions(self):
        session = correction(1)
        session["configuration_id"] = "other"
        with self.assertRaises(ContractError):
            project_order(configuration(), [session])

    def test_no_mismatched_snapshot(self):
        session = correction(1)
        session["after_snapshot"]["configuration"]["id"] = "other"
        with self.assertRaises(ContractError):
            project_order(configuration(), [session])

    def test_no_duplicate_sessions(self):
        with self.assertRaises(ContractError):
            project_order(configuration(), [correction(1), correction(1)])

    def test_idempotent_and_does_not_mutate_source(self):
        source = configuration()
        before = deepcopy(source)
        self.assertEqual(project_order(source, []), project_order(source, []))
        self.assertEqual(source, before)

    def test_timestamps_utc_and_dates_native(self):
        self.assertEqual(timestamp("2026-10-01T14:00:00+02:00"), datetime(2026, 10, 1, 12, tzinfo=timezone.utc))
        self.assertEqual(day("2026-10-01").isoformat(), "2026-10-01")
        with self.assertRaises(ContractError):
            timestamp("2026-10-01T12:00:00")

    def test_currency_mismatch_quarantined(self):
        source = configuration()
        source["currency"] = "SEK"
        self.assertEqual(project_order(source, [])["revision"][0]["financial_status"], "INVALID_SNAPSHOT")

    def test_decimal_limits(self):
        self.assertEqual(number("0.000000000001"), Decimal("0.000000000001"))
        for value in ("1e30", "0.0000000000001"):
            with self.assertRaises(ContractError):
                number(value)

    def test_source_acceptance_financial_example(self):
        # Acceptance fixture only, never a filter or constant in the transformation.
        source = configuration()
        prices = ["31590", "0", "5905", "150", "335"]
        source["state_json"]["pricingSnapshot"].update(
            lines=[{"itemNo": str(i), "quantity": 1, "unitPrice": p, "total": p, "unitNumber": 1} for i, p in enumerate(prices)],
            totals={"subtotal": "37980", "totalDiscount": "9611.79", "finalPrice": "28368.21"})
        result = project_order(source, [correction(1, source, source), correction(2, source, source), correction(3, source, source)])
        current = [r for r in result["revision"] if r["is_current"]][0]
        self.assertEqual(current["revision_number"], 3)
        self.assertEqual(current["total"], Decimal("28368.21"))
        self.assertEqual(len([r for r in result["line"] if r["revision_key"] == current["revision_key"]]), 5)

    def test_all_output_columns_have_explicit_schema(self):
        tables = project_order(configuration(), [correction(1)])
        for name, rows in tables.items():
            fields = {pair.split(":")[0] for pair in TABLES[name].split()}
            for row in rows:
                self.assertEqual(set(row), fields, name)


class SchemaTests(unittest.TestCase):
    def setUp(self):
        self.schema = {(t, "id"): "uuid" for t in SOURCES}

    def test_additive(self):
        current = {**self.schema, ("configurations", "delivery_priority"): "text"}
        self.assertEqual(check_schema(self.schema, current), [("configurations", "delivery_priority")])

    def test_removed_renamed_type_and_missing_table_fail(self):
        for change in ("remove", "rename", "type", "table"):
            with self.subTest(change=change):
                previous = {**self.schema, ("configurations", "title"): "text"}
                current = dict(previous)
                if change in ("remove", "rename"):
                    del current[("configurations", "title")]
                    if change == "rename":
                        current[("configurations", "new_title")] = "text"
                elif change == "type":
                    current[("configurations", "title")] = "integer"
                else:
                    del current[("dealer_accounts", "id")]
                with self.assertRaises(ContractError):
                    check_schema(previous, current)

    def test_artifacts_compile_without_spark(self):
        for path in Path("fabric/portal_orders").glob("*.py"):
            ast.parse(path.read_text(encoding="utf-8"), filename=str(path))


if __name__ == "__main__":
    unittest.main()
