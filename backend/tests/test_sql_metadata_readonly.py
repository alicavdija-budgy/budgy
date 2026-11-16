"""Offline safety guard for the existing self-hosted metadata-only audit SQL."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SQL = (ROOT / "docs" / "PRODUCTION_SELFHOST_READONLY_AUDIT.sql").read_text(encoding="utf-8")
EXPECTED = (
    "user_preferences", "transactions", "incomes", "savings_goals", "budgets",
    "recurring_expenses", "contracts", "debts", "investments", "receipts",
    "invoices", "documents", "expense_groups", "group_expenses", "sync_tombstones",
)


class SelfHostedAuditSqlTests(unittest.TestCase):
    def test_all_expected_tables_and_missing_flag(self):
        for name in EXPECTED:
            self.assertIn(name, SQL)
        self.assertIn("'MISSING'", SQL)
        self.assertIn("LEFT JOIN pg_tables", SQL)

    def test_anon_auth_roles_and_policy_predicates(self):
        for feature in ("has_table_privilege('anon'", "has_table_privilege('authenticated'",
                        "p.qual AS using_condition", "p.with_check AS with_check_condition",
                        "p.schemaname = 'storage'", "p.tablename = 'objects'"):
            self.assertIn(feature, SQL)

    def test_sql_statements_are_metadata_read_only(self):
        # Remove comments. CTEs must lead to SELECT, not write statements.
        uncommented = "\n".join(
            line for line in SQL.splitlines() if not line.lstrip().startswith("--")
        )
        statements = [chunk.strip() for chunk in uncommented.split(";") if chunk.strip()]
        self.assertGreaterEqual(len(statements), 7)
        for stmt in statements:
            self.assertRegex(stmt, r"(?is)^\s*(SELECT\b|WITH\b)")
            self.assertNotRegex(
                stmt,
                r"(?i)\b(?:INSERT\s+INTO|DELETE\s+FROM|UPDATE\s+\w+\s+SET|"
                r"DROP\s+TABLE|ALTER\s+TABLE|CREATE\s+TABLE|TRUNCATE\s+TABLE|"
                r"MERGE\s+INTO|CALL\s+)\b",
            )
        self.assertNotIn("public.transactions tx", uncommented)
        self.assertIn("pg_policies", uncommented)
        self.assertIn("information_schema", uncommented)


if __name__ == "__main__":
    unittest.main()
