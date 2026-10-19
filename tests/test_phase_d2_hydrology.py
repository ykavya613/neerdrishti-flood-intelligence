"""
NeerDrishti Phase D2 - Hydrological Signal Intelligence Test Suite
Tests hydrological stations registry, deterministic threshold classification,
trend detection with deadbands, anomaly detection (rapid rise, discharge spike, missing updates),
district hydrological summary synthesis, and risk engine preservation.
"""

import json
import os
import unittest
from datetime import datetime, timedelta, timezone

from src.database import (
    init_database,
    get_all_hydrological_stations,
    get_hydrological_station_by_id,
    get_latest_hydrological_signals,
    insert_external_signal,
)
from src.hydrology_engine import (
    classify_hydrological_status,
    calculate_hydrological_trend,
    detect_hydrological_anomalies,
    get_district_hydrological_summary,
    get_all_districts_hydrological_summaries,
    get_hydrological_stations,
    get_hydrological_station_by_id_cached,
)
from src.signal_validator import validate_signal, evaluate_freshness
from src.risk_engine import calculate_flood_risk, calculate_rainfall_score


class TestPhaseD2HydrologicalIntelligence(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_database()
        stations_path = os.path.join(os.getcwd(), "data", "hydrological_stations.json")
        with open(stations_path, "r") as f:
            cls.seed_stations = json.load(f)

    # 1. Hydrological stations seeding verification
    def test_01_hydrological_stations_seeded(self):
        self.assertGreaterEqual(len(self.seed_stations), 15)
        db_stations = get_all_hydrological_stations()
        self.assertGreaterEqual(len(db_stations), 15)
        # Check priority stations exist
        station_ids = [s["station_id"] for s in db_stations]
        self.assertIn("STN_MUSI_MOOSARAMBAGH", station_ids)
        self.assertIn("STN_GODAVARI_BHADRACHALAM", station_ids)
        self.assertIn("STN_KADAM_RESERVOIR", station_ids)

    # 2. Station retrieval by district and ID
    def test_02_station_retrieval(self):
        bhadradri_stns = get_hydrological_stations("bhadradri_kothagudem")
        self.assertGreaterEqual(len(bhadradri_stns), 1)
        self.assertEqual(bhadradri_stns[0]["district_id"], "bhadradri_kothagudem")

        hyd_stn = get_hydrological_station_by_id("STN_MUSI_MOOSARAMBAGH")
        self.assertIsNotNone(hyd_stn)
        self.assertEqual(hyd_stn["water_body_name"], "Musi River")

    # 3. Deterministic Threshold Classification
    def test_03_threshold_classification(self):
        # Critical when value >= danger_threshold (e.g. 53.0 >= 53.0)
        self.assertEqual(classify_hydrological_status(53.0, 48.0, 53.0), "CRITICAL")
        self.assertEqual(classify_hydrological_status(55.2, 48.0, 53.0), "CRITICAL")

        # Warning when warning_threshold <= value < danger_threshold
        self.assertEqual(classify_hydrological_status(48.0, 48.0, 53.0), "WARNING")
        self.assertEqual(classify_hydrological_status(51.5, 48.0, 53.0), "WARNING")

        # Watch when 85% of warning <= value < warning (0.85 * 48.0 = 40.8)
        self.assertEqual(classify_hydrological_status(42.0, 48.0, 53.0), "WATCH")

        # Normal when value < 85% of warning
        self.assertEqual(classify_hydrological_status(35.0, 48.0, 53.0), "NORMAL")

        # Unknown when None or NaN
        self.assertEqual(classify_hydrological_status(None, 48.0, 53.0), "UNKNOWN")

    # 4. Trend Detection with Deadband (0.05 default)
    def test_04_trend_detection_with_deadband(self):
        # Rising: delta > 0.05
        self.assertEqual(calculate_hydrological_trend(50.0, 48.0), "RISING")
        # Falling: delta < -0.05
        self.assertEqual(calculate_hydrological_trend(45.0, 48.0), "FALLING")
        # Stable: delta within 0.05
        self.assertEqual(calculate_hydrological_trend(48.02, 48.0), "STABLE")
        self.assertEqual(calculate_hydrological_trend(47.98, 48.0), "STABLE")
        # No prior value -> STABLE
        self.assertEqual(calculate_hydrological_trend(48.0, None), "STABLE")

    # 5. Anomaly Detection: Rapid Level Rise (> 0.5 m/hr)
    def test_05_rapid_rise_anomaly_detection(self):
        now = datetime.now(timezone.utc)
        one_hr_ago = now - timedelta(hours=1)

        history = [
            {"value": 50.8, "recorded_at": now.isoformat()},
            {"value": 50.0, "recorded_at": one_hr_ago.isoformat()},
        ]
        # Rate of rise: (50.8 - 50.0) / 1.0 hr = 0.8 m/hr (> 0.5 threshold)
        anomalies = detect_hydrological_anomalies("STN-TEST", "river_level", 50.8, "m", history)
        self.assertTrue(any(a["type"] == "RAPID_LEVEL_RISE" for a in anomalies))

    # 6. Anomaly Detection: Discharge Spike (> 50,000 cusecs or 2x increase)
    def test_06_discharge_spike_anomaly_detection(self):
        now = datetime.now(timezone.utc)
        two_hrs_ago = now - timedelta(hours=2)

        history = [
            {"value": 75000.0, "recorded_at": now.isoformat()},
            {"value": 30000.0, "recorded_at": two_hrs_ago.isoformat()},
        ]
        anomalies = detect_hydrological_anomalies("STN-TEST", "dam_discharge", 75000.0, "cusecs", history)
        self.assertTrue(any(a["type"] == "DISCHARGE_SPIKE" for a in anomalies))

    # 7. Anomaly Detection: Missing / Stale Updates (> 24 hours)
    def test_07_missing_update_anomaly_detection(self):
        stale_time = (datetime.now(timezone.utc) - timedelta(hours=36)).isoformat()
        history = [{"value": 45.0, "recorded_at": stale_time}]

        anomalies = detect_hydrological_anomalies("STN-TEST", "river_level", 45.0, "m", history)
        self.assertTrue(any(a["type"] == "MISSING_UPDATE" for a in anomalies))

    # 8. District Hydrological Summary Generation
    def test_08_district_hydrological_summary(self):
        # Critical Flood Event scenario in Bhadradri Kothagudem (Bhadrachalam Godavari River)
        summary = get_district_hydrological_summary("bhadradri_kothagudem", "Critical Flood Event")
        self.assertEqual(summary["district_id"], "bhadradri_kothagudem")
        self.assertGreaterEqual(summary["active_stations_count"], 1)
        self.assertIn(summary["dominant_status"], ["WARNING", "CRITICAL"])
        self.assertTrue(summary["has_active_danger"] or summary["has_active_warning"])
        self.assertIn("Godavari River", summary["primary_water_body"])

        # All 33 districts can generate summary without crashing
        all_summaries = get_all_districts_hydrological_summaries("Normal Conditions")
        self.assertEqual(len(all_summaries), 33)

    # 9. Signal Validator Hydrological Bounds
    def test_09_hydrological_signal_validation(self):
        # Valid river level
        res_valid = validate_signal({
            "district_id": "hyderabad",
            "signal_type": "river_level",
            "value": 512.4,
            "unit": "m",
            "source_name": "CWC Musi River Gauge",
            "recorded_at": datetime.now(timezone.utc).isoformat(),
        })
        self.assertTrue(res_valid["is_valid"])

        # Negative water level rejected
        res_neg = validate_signal({
            "district_id": "hyderabad",
            "signal_type": "river_level",
            "value": -5.0,
            "unit": "m",
            "source_name": "CWC Musi River Gauge",
            "recorded_at": datetime.now(timezone.utc).isoformat(),
        })
        self.assertFalse(res_neg["is_valid"])

        # Excessive reservoir capacity rejected (> 10000 TMC)
        res_excess = validate_signal({
            "district_id": "nalgonda",
            "signal_type": "reservoir_storage",
            "value": 25000.0,
            "unit": "TMC",
            "source_name": "Nagarjuna Sagar Telemetry",
            "recorded_at": datetime.now(timezone.utc).isoformat(),
        })
        self.assertFalse(res_excess["is_valid"])

    # 10. Risk Engine Mathematical Integrity Preserved
    def test_10_risk_engine_preservation(self):
        # 5-factor math: 35% rain, 25% hist, 15% location, 15% citizen, 10% drainage
        rain_score = calculate_rainfall_score(120.0, 35.0)
        risk = calculate_flood_risk(
            rainfall_score=rain_score,
            flood_history_score=88.0,
            location_risk_score=75.0,
            citizen_report_score=60.0,
            drainage_vulnerability_score=92.0,
        )

        expected_pts = (
            risk["contributions"]["rainfall"]
            + risk["contributions"]["flood_history"]
            + risk["contributions"]["location_risk"]
            + risk["contributions"]["citizen_reports"]
            + risk["contributions"]["drainage_vulnerability"]
        )

        self.assertAlmostEqual(risk["flood_risk_score"], round(expected_pts, 2), delta=0.05)
        # Verify 15% citizen report weight is untouched
        self.assertAlmostEqual(risk["contributions"]["citizen_reports"], 60.0 * 0.15, places=2)


if __name__ == "__main__":
    unittest.main()
