"""
NeerDrishti Phase D1 - Real-Time Rainfall Data Foundation Test Suite
Tests validation, freshness, normalization, priority fallback, SQLite signal operations,
and mathematical risk integration without regressing citizen intelligence.
"""

import json
import os
import unittest
from datetime import datetime, timedelta, timezone

from src.district_normalizer import normalize_district
from src.signal_validator import validate_signal, evaluate_freshness
from src.risk_engine import (
    calculate_rainfall_score,
    calculate_flood_risk,
    calculate_citizen_report_score,
)
from src.database import get_db_connection, init_database


class TestPhaseD1RainfallFoundation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_database()
        with open(os.path.join(os.getcwd(), "data", "telangana_districts.json"), "r") as f:
            cls.districts_data = json.load(f)

    # 1. All 33 canonical districts resolve correctly
    def test_01_all_33_districts_resolve(self):
        self.assertEqual(len(self.districts_data), 33)
        for d in self.districts_data:
            res = normalize_district(d["district_name"])
            self.assertTrue(res["resolved"], f"Failed resolving {d['district_name']}")
            self.assertEqual(res["canonical_name"].lower(), d["district_name"].lower())

    # 2. Canonical district IDs work
    def test_02_canonical_district_ids(self):
        res = normalize_district("hyderabad")
        self.assertTrue(res["resolved"])
        self.assertEqual(res["match_type"], "EXACT_ID")
        self.assertEqual(res["canonical_name"], "Hyderabad")

    # 3. Case-insensitive names work
    def test_03_case_insensitive_matching(self):
        res = normalize_district("  wArAnGaL  ")
        self.assertTrue(res["resolved"])
        self.assertEqual(res["canonical_name"], "Warangal")

    # 4. Known aliases work
    def test_04_known_aliases(self):
        aliases = {
            "warangal urban": "Warangal",
            "kothagudem": "Bhadradri Kothagudem",
            "bhupalpally": "Jayashankar Bhupalpally",
            "asifabad": "Kumuram Bheem Asifabad",
            "gadwal": "Jogulamba Gadwal",
            "bhongir": "Yadadri Bhuvanagiri",
        }
        for alias, expected in aliases.items():
            res = normalize_district(alias)
            self.assertTrue(res["resolved"], f"Alias {alias} failed")
            self.assertEqual(res["canonical_name"], expected)

    # 5. Unknown district rejected
    def test_05_unknown_district_rejected(self):
        res = normalize_district("Unknown Land 123")
        self.assertFalse(res["resolved"])
        self.assertEqual(res["match_type"], "UNRESOLVED")

    # 6. Negative rainfall rejected
    def test_06_negative_rainfall_rejected(self):
        val = validate_signal({
            "district_id": "hyderabad",
            "value": -15.0,
            "recorded_at": datetime.now().isoformat(),
            "unit": "mm",
            "source_name": "Test IMD",
        })
        self.assertFalse(val["is_valid"])
        self.assertTrue(any("negative" in e.lower() for e in val["errors"]))

    # 7. Missing rainfall rejected
    def test_07_missing_rainfall_rejected(self):
        val = validate_signal({
            "district_id": "hyderabad",
            "value": None,
            "recorded_at": datetime.now().isoformat(),
            "unit": "mm",
            "source_name": "Test IMD",
        })
        self.assertFalse(val["is_valid"])

    # 8. Invalid timestamp rejected
    def test_08_invalid_timestamp_rejected(self):
        val = validate_signal({
            "district_id": "hyderabad",
            "value": 45.0,
            "recorded_at": "not-a-timestamp",
            "unit": "mm",
            "source_name": "Test IMD",
        })
        self.assertFalse(val["is_valid"])

    # 9. Future timestamp rejected
    def test_09_future_timestamp_rejected(self):
        future_time = (datetime.now() + timedelta(days=2)).isoformat()
        val = validate_signal({
            "district_id": "hyderabad",
            "value": 45.0,
            "recorded_at": future_time,
            "unit": "mm",
            "source_name": "Test IMD",
        })
        self.assertFalse(val["is_valid"])
        self.assertTrue(any("future" in e.lower() for e in val["errors"]))

    # 10. Freshness FRESH (0-3h)
    def test_10_freshness_fresh(self):
        now = datetime.now()
        t = (now - timedelta(hours=1.5)).isoformat()
        f = evaluate_freshness(t, now=now)
        self.assertEqual(f["status"], "FRESH")
        self.assertEqual(f["factor"], 1.0)

    # 11. Freshness AGING (3-12h)
    def test_11_freshness_aging(self):
        now = datetime.now()
        t = (now - timedelta(hours=6.0)).isoformat()
        f = evaluate_freshness(t, now=now)
        self.assertEqual(f["status"], "AGING")
        self.assertEqual(f["factor"], 0.8)

    # 12. Freshness STALE (12-24h)
    def test_12_freshness_stale(self):
        now = datetime.now()
        t = (now - timedelta(hours=18.0)).isoformat()
        f = evaluate_freshness(t, now=now)
        self.assertEqual(f["status"], "STALE")
        self.assertEqual(f["factor"], 0.5)

    # 13. Freshness EXPIRED (>24h)
    def test_13_freshness_expired(self):
        now = datetime.now()
        t = (now - timedelta(hours=36.0)).isoformat()
        f = evaluate_freshness(t, now=now)
        self.assertEqual(f["status"], "EXPIRED")
        self.assertEqual(f["factor"], 0.0)

    # 14. Rainfall score mathematical bounds
    def test_14_rainfall_score_bounds(self):
        score_0 = calculate_rainfall_score(0, 0)
        score_med = calculate_rainfall_score(80, 25)
        score_max = calculate_rainfall_score(350, 60)
        self.assertGreaterEqual(score_0, 0)
        self.assertLessEqual(score_max, 100)
        self.assertGreater(score_med, score_0)
        self.assertGreater(score_max, score_med)

    # 15. Composite risk formula exact 35% rainfall and 15% citizen weights
    def test_15_composite_risk_weights(self):
        # 100 rainfall, 0 for others -> exactly 35.0
        risk = calculate_flood_risk(100.0, 0.0, 0.0, 0.0, 0.0)
        self.assertAlmostEqual(risk["flood_risk_score"], 35.0, places=1)
        self.assertAlmostEqual(risk["contributions"]["rainfall"], 35.0, places=1)

        # 100 citizen report score, 0 for others -> exactly 15.0
        risk_citizen = calculate_flood_risk(0.0, 0.0, 0.0, 100.0, 0.0)
        self.assertAlmostEqual(risk_citizen["flood_risk_score"], 15.0, places=1)
        self.assertAlmostEqual(risk_citizen["contributions"]["citizen_reports"], 15.0, places=1)

    # 16. Citizen intelligence remains unchanged
    def test_16_citizen_scoring_unaffected(self):
        score = calculate_citizen_report_score(
            report_count=5,
            high_severity_count=2,
            critical_count=1,
            reports_24h_count=5
        )
        self.assertGreater(score, 40.0)

    # 17. SQLite External Signals Table insertion and retrieval
    def test_17_sqlite_external_signals_ledger(self):
        conn = get_db_connection()
        cursor = conn.cursor()
        now_str = datetime.now().isoformat()
        cursor.execute("""
            INSERT INTO external_signals (
                district_id, source_name, source_type, signal_type,
                value, unit, data_mode, freshness, confidence,
                is_valid, recorded_at, ingested_at, metadata
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            "hyderabad", "IMD AWS Test", "official_api", "rainfall",
            65.5, "mm", "LIVE", "FRESH", 0.95, 1, now_str, now_str, json.dumps({"burst": 18.0})
        ))
        conn.commit()
        sig_id = cursor.lastrowid

        cursor.execute("SELECT * FROM external_signals WHERE id = ?", (sig_id,))
        row = cursor.fetchone()
        self.assertIsNotNone(row)
        self.assertEqual(row["district_id"], "hyderabad")
        self.assertEqual(row["value"], 65.5)
        self.assertEqual(row["is_valid"], 1)
        conn.close()


if __name__ == "__main__":
    unittest.main()
