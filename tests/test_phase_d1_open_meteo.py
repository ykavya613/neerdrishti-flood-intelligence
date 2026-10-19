"""
NeerDrishti Phase D1 - Open-Meteo Live Rainfall Connector Test Suite
Tests live forecast parsing, 24h accumulation & 3h burst calculation,
archive baseline extraction, SQLite live signal ingestion, and graceful fallback.
"""

import json
import os
import unittest
from datetime import datetime, timedelta, timezone

from src.district_normalizer import normalize_district
from src.open_meteo_service import (
    calculate_24h_and_3h_burst,
    parse_open_meteo_response,
    ingest_open_meteo_reading,
    OPEN_METEO_SOURCE_NAME,
)
from src.database import get_db_connection, init_database
from src.risk_engine import calculate_flood_risk, calculate_rainfall_score


class TestOpenMeteoRainfallConnector(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_database()
        with open(os.path.join(os.getcwd(), "data", "telangana_districts.json"), "r") as f:
            cls.districts_data = json.load(f)

    # 1. 24h accumulation and 3h burst calculation
    def test_01_calculate_24h_and_3h_burst(self):
        # 24 hourly periods with 5.0 mm each, last 3 periods with 10.0 mm each
        times = [f"2026-08-31T{h:02d}:00" for h in range(24)]
        precips = [5.0] * 21 + [10.0, 10.0, 10.0]

        rf_24h, rf_3h, matched_time = calculate_24h_and_3h_burst(times, precips)
        # Total 24h = (21 * 5.0) + (3 * 10.0) = 105.0 + 30.0 = 135.0
        self.assertEqual(rf_24h, 135.0)
        # Total 3h burst = 3 * 10.0 = 30.0
        self.assertEqual(rf_3h, 30.0)
        self.assertEqual(matched_time, "2026-08-31T23:00")

    # 2. Target hour matching in time series
    def test_02_target_hour_matching(self):
        times = [f"2026-08-31T{h:02d}:00" for h in range(24)]
        precips = [2.0] * 24

        rf_24h, rf_3h, matched = calculate_24h_and_3h_burst(times, precips, target_time_str="2026-08-31T05:00")
        # Target is index 5 -> 6 hours available from 0 to 5 -> 6 * 2.0 = 12.0 mm
        self.assertEqual(rf_24h, 12.0)
        # 3 hours (idx 3, 4, 5) -> 3 * 2.0 = 6.0 mm
        self.assertEqual(rf_3h, 6.0)
        self.assertEqual(matched, "2026-08-31T05:00")

    # 3. Parse Open-Meteo standard response payload
    def test_03_parse_open_meteo_payload(self):
        mock_payload = {
            "latitude": 17.385,
            "longitude": 78.4875,
            "elevation": 505.0,
            "timezone": "Asia/Kolkata",
            "hourly": {
                "time": ["2026-08-31T00:00", "2026-08-31T01:00", "2026-08-31T02:00", "2026-08-31T03:00"],
                "precipitation": [0.0, 5.2, 12.8, 8.0]
            }
        }
        res = parse_open_meteo_response(mock_payload)
        self.assertTrue(res["success"])
        self.assertEqual(res["rainfall_mm_24h"], 26.0)
        self.assertEqual(res["rainfall_mm_3h"], 26.0)
        self.assertEqual(res["latitude"], 17.385)

    # 4. Handle corrupted or empty payload gracefully
    def test_04_handle_invalid_payload(self):
        res1 = parse_open_meteo_response({})
        self.assertFalse(res1["success"])
        self.assertIn("error", res1)

        res2 = parse_open_meteo_response({"hourly": {"time": [], "precipitation": []}})
        self.assertFalse(res2["success"])

    # 5. Ingest valid Open-Meteo live reading into SQLite
    def test_05_ingest_live_reading_sqlite(self):
        now_str = datetime.now(timezone.utc).isoformat()
        res = ingest_open_meteo_reading(
            district_name="Hyderabad",
            rainfall_24h=72.4,
            rainfall_3h=22.1,
            recorded_at=now_str,
            data_mode="LIVE"
        )
        self.assertTrue(res["success"])
        self.assertEqual(res["district_id"], "hyderabad")
        self.assertEqual(res["data_mode"], "LIVE")
        self.assertEqual(res["freshness"], "FRESH")
        self.assertEqual(res["value"], 72.4)

        # Verify in DB
        conn = get_db_connection()
        c = conn.cursor()
        c.execute("""
            SELECT * FROM external_signals
            WHERE district_id = 'hyderabad' AND source_name = ? AND data_mode = 'LIVE'
            ORDER BY id DESC LIMIT 1
        """, (OPEN_METEO_SOURCE_NAME,))
        row = c.fetchone()
        self.assertIsNotNone(row)
        self.assertEqual(row["value"], 72.4)
        self.assertEqual(row["freshness"], "FRESH")
        conn.close()

    # 6. Reject negative rainfall or unresolvable district
    def test_06_reject_invalid_reading(self):
        res1 = ingest_open_meteo_reading("Invalid District 999", 50.0, 10.0)
        self.assertFalse(res1["success"])
        self.assertIn("Unresolved", res1["error"])

        res2 = ingest_open_meteo_reading("Warangal", -25.0, 0.0)
        self.assertFalse(res2["success"])
        self.assertIn("Validation failed", res2["error"])

    # 7. Coordinates for all 33 Telangana districts are valid
    def test_07_all_33_district_coordinates_valid(self):
        self.assertEqual(len(self.districts_data), 33)
        for d in self.districts_data:
            lat = d.get("latitude")
            lon = d.get("longitude")
            self.assertIsNotNone(lat, f"Missing latitude for {d['district_name']}")
            self.assertIsNotNone(lon, f"Missing longitude for {d['district_name']}")
            # Telangana coordinates bounds: Lat ~15.8 - 19.9, Lon ~77.2 - 81.3
            self.assertGreaterEqual(lat, 15.0, f"Lat too low for {d['district_name']}")
            self.assertLessEqual(lat, 21.0, f"Lat too high for {d['district_name']}")
            self.assertGreaterEqual(lon, 76.0, f"Lon too low for {d['district_name']}")
            self.assertLessEqual(lon, 82.5, f"Lon too high for {d['district_name']}")

    # 8. Rainfall score calculation from live ingested telemetry
    def test_08_rainfall_score_live_telemetry(self):
        # 85 mm in 24h with 25 mm burst -> score between 60 and 85
        score = calculate_rainfall_score(85.0, 25.0)
        self.assertGreater(score, 60.0)
        self.assertLessEqual(score, 90.0)

        # Risk calculation with live score
        risk = calculate_flood_risk(score, 70.0, 80.0, 50.0, 80.0)
        self.assertIn(risk["risk_category"], ["MODERATE", "HIGH", "CRITICAL"])
        self.assertGreater(risk["contributions"]["rainfall"], 20.0)


if __name__ == "__main__":
    unittest.main()
