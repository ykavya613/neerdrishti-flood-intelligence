"""
NeerDrishti Phase D3 - Multi-Signal Intelligence and District Situation Fusion Test Suite
Comprehensive testing of deterministic multi-signal fusion, data confidence,
driver ranking, operational situation categorization, and explainability.
"""

import os
import sys
import unittest

# Ensure root directory is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.situation_fusion_engine import (
    calculate_signal_coverage,
    calculate_data_confidence,
    rank_risk_drivers,
    classify_operational_situation,
    generate_recommended_actions,
    generate_data_limitations,
    fuse_district_situation,
)


class TestPhaseD3SituationFusion(unittest.TestCase):

    # 1. Signal Coverage across 5 Domains
    def test_01_signal_coverage_full(self):
        rf = {"rainfall_24h": 45.0, "data_mode": "LIVE"}
        hydro = {"active_stations_count": 2, "data_mode": "LIVE"}
        cit = {"total_reports": 3, "score": 8.0}
        coverage = calculate_signal_coverage(rf, hydro, cit, True, True)

        self.assertEqual(coverage["available"], 5)
        self.assertEqual(coverage["total"], 5)
        self.assertEqual(coverage["ratio"], 1.0)
        self.assertTrue(coverage["signals"]["rainfall"])
        self.assertTrue(coverage["signals"]["hydrology"])
        self.assertTrue(coverage["signals"]["citizen"])

    # 2. Signal Coverage Partial
    def test_02_signal_coverage_partial(self):
        rf = {"rainfall_24h": 12.0, "data_mode": "SIMULATED"}
        hydro = None
        cit = {"total_reports": 0, "score": 0.0}
        coverage = calculate_signal_coverage(rf, hydro, cit, True, True)

        self.assertEqual(coverage["available"], 4)
        self.assertFalse(coverage["signals"]["hydrology"])
        self.assertTrue(coverage["signals"]["rainfall"])
        self.assertEqual(coverage["ratio"], 0.8)

    # 3. High Data Confidence with Fresh Multi-Domain Data
    def test_03_data_confidence_high(self):
        coverage = {
            "available": 5,
            "total": 5,
            "signals": {"rainfall": True, "hydrology": True, "citizen": True, "flood_history": True, "drainage_vulnerability": True}
        }
        level, score = calculate_data_confidence(coverage, "FRESH", "FRESH", citizen_count=2)
        self.assertEqual(level, "HIGH")
        self.assertGreaterEqual(score, 0.80)

    # 4. Medium Data Confidence with Aging Feeds
    def test_04_data_confidence_medium_aging(self):
        coverage = {
            "available": 4,
            "total": 5,
            "signals": {"rainfall": True, "hydrology": False, "citizen": True, "flood_history": True, "drainage_vulnerability": True}
        }
        level, score = calculate_data_confidence(coverage, "AGING", "EXPIRED", citizen_count=0)
        self.assertIn(level, ["MEDIUM", "LOW"])
        self.assertGreaterEqual(score, 0.50)

    # 5. Low Data Confidence with Stale Feeds
    def test_05_data_confidence_low(self):
        coverage = {
            "available": 3,
            "total": 5,
            "signals": {"rainfall": True, "hydrology": False, "citizen": False, "flood_history": True, "drainage_vulnerability": True}
        }
        level, score = calculate_data_confidence(coverage, "STALE", "EXPIRED", citizen_count=0)
        self.assertEqual(level, "LOW")

    # 6. Limited Data Confidence
    def test_06_data_confidence_limited(self):
        coverage = {
            "available": 2,
            "total": 5,
            "signals": {"rainfall": False, "hydrology": False, "citizen": False, "flood_history": True, "drainage_vulnerability": True}
        }
        level, score = calculate_data_confidence(coverage, "EXPIRED", "EXPIRED", citizen_count=0)
        self.assertEqual(level, "LIMITED")
        self.assertLess(score, 0.50)

    # 7. Confidence Degradation with Stale Telemetry
    def test_07_confidence_freshness_impact(self):
        coverage = {
            "available": 5,
            "total": 5,
            "signals": {"rainfall": True, "hydrology": True, "citizen": True, "flood_history": True, "drainage_vulnerability": True}
        }
        _, score_fresh = calculate_data_confidence(coverage, "FRESH", "FRESH", 1)
        _, score_stale = calculate_data_confidence(coverage, "STALE", "STALE", 1)
        self.assertGreater(score_fresh, score_stale)

    # 8. Primary Driver: Heavy Rainfall Dominance
    def test_08_primary_driver_rainfall(self):
        primary, supporting = rank_risk_drivers(
            composite_risk=65.0,
            rainfall_24h=95.0,
            rainfall_3h=32.0,
            contributions={"rainfall": 28.5},
            hydro_status="NORMAL",
            hydro_trend="STABLE",
            primary_water_body="Musi River",
            citizen_high_sev=0,
            citizen_total=0,
            flood_history_score=40.0,
            drainage_vulnerability_score=40.0
        )
        self.assertTrue(any("Heavy Precipitation" in d["signal"] for d in primary))

    # 9. Primary Driver: Hydrological River Stage Critical
    def test_09_primary_driver_hydrology_critical(self):
        primary, supporting = rank_risk_drivers(
            composite_risk=70.0,
            rainfall_24h=10.0,
            rainfall_3h=2.0,
            contributions={"rainfall": 5.0},
            hydro_status="CRITICAL",
            hydro_trend="RISING",
            primary_water_body="Godavari River",
            citizen_high_sev=0,
            citizen_total=0,
            flood_history_score=40.0,
            drainage_vulnerability_score=40.0
        )
        self.assertTrue(any("River Stage Threshold Alert" in d["signal"] for d in primary))

    # 10. Primary Driver: Severe Citizen Ground Reports
    def test_10_primary_driver_citizen_severe(self):
        primary, supporting = rank_risk_drivers(
            composite_risk=55.0,
            rainfall_24h=20.0,
            rainfall_3h=5.0,
            contributions={"citizen_reports": 12.0},
            hydro_status="NORMAL",
            hydro_trend="STABLE",
            primary_water_body=None,
            citizen_high_sev=3,
            citizen_total=5,
            flood_history_score=40.0,
            drainage_vulnerability_score=40.0
        )
        self.assertTrue(any("Active Field Flooding" in d["signal"] for d in primary))

    # 11. Primary Driver: Historical Baseline with Active Trigger
    def test_11_primary_driver_flood_history(self):
        primary, supporting = rank_risk_drivers(
            composite_risk=60.0,
            rainfall_24h=45.0,
            rainfall_3h=10.0,
            contributions={"flood_history": 22.0},
            hydro_status="NORMAL",
            hydro_trend="STABLE",
            primary_water_body=None,
            citizen_high_sev=0,
            citizen_total=0,
            flood_history_score=85.0,
            drainage_vulnerability_score=40.0
        )
        self.assertTrue(any("High Historical Inundation" in d["signal"] for d in primary))

    # 12. Primary Driver: Drainage Hotspots
    def test_12_primary_driver_drainage_bottleneck(self):
        primary, supporting = rank_risk_drivers(
            composite_risk=58.0,
            rainfall_24h=42.0,
            rainfall_3h=12.0,
            contributions={"drainage_vulnerability": 9.0},
            hydro_status="NORMAL",
            hydro_trend="STABLE",
            primary_water_body=None,
            citizen_high_sev=0,
            citizen_total=1,
            flood_history_score=40.0,
            drainage_vulnerability_score=85.0
        )
        self.assertTrue(any("Stormwater Bottleneck" in d["signal"] for d in primary))

    # 13. Supporting Signal Separation
    def test_13_supporting_signal_separation(self):
        primary, supporting = rank_risk_drivers(
            composite_risk=35.0,
            rainfall_24h=20.0,
            rainfall_3h=5.0,
            contributions={"rainfall": 7.0, "flood_history": 15.0},
            hydro_status="WATCH",
            hydro_trend="RISING",
            primary_water_body="Manair River",
            citizen_high_sev=0,
            citizen_total=2,
            flood_history_score=60.0,
            drainage_vulnerability_score=55.0
        )
        self.assertGreater(len(supporting), 0)
        self.assertTrue(any("Moderate Precipitation" in s["signal"] for s in supporting))

    # 14. Operational Situation: CRITICAL_INFORMATIONAL
    def test_14_operational_situation_critical(self):
        situation = classify_operational_situation(
            composite_risk=82.0,
            rainfall_24h=160.0,
            hydro_status="CRITICAL",
            hydro_trend="RISING",
            citizen_high_sev=4,
            citizen_total=6,
            anomalies=[]
        )
        self.assertEqual(situation, "CRITICAL_INFORMATIONAL")

    # 15. Operational Situation: HIGH_CONCERN
    def test_15_operational_situation_high_concern(self):
        situation = classify_operational_situation(
            composite_risk=64.0,
            rainfall_24h=75.0,
            hydro_status="WARNING",
            hydro_trend="RISING",
            citizen_high_sev=1,
            citizen_total=3,
            anomalies=[]
        )
        self.assertEqual(situation, "HIGH_CONCERN")

    # 16. Operational Situation: ELEVATED_ATTENTION
    def test_16_operational_situation_elevated_attention(self):
        situation = classify_operational_situation(
            composite_risk=42.0,
            rainfall_24h=40.0,
            hydro_status="WATCH",
            hydro_trend="STABLE",
            citizen_high_sev=0,
            citizen_total=2,
            anomalies=[]
        )
        self.assertEqual(situation, "ELEVATED_ATTENTION")

    # 17. Operational Situation: MONITORING
    def test_17_operational_situation_monitoring(self):
        situation = classify_operational_situation(
            composite_risk=24.0,
            rainfall_24h=18.0,
            hydro_status="NORMAL",
            hydro_trend="STABLE",
            citizen_high_sev=0,
            citizen_total=1,
            anomalies=[]
        )
        self.assertEqual(situation, "MONITORING")

    # 18. Operational Situation: NORMAL
    def test_18_operational_situation_normal(self):
        situation = classify_operational_situation(
            composite_risk=12.0,
            rainfall_24h=4.0,
            hydro_status="NORMAL",
            hydro_trend="STABLE",
            citizen_high_sev=0,
            citizen_total=0,
            anomalies=[]
        )
        self.assertEqual(situation, "NORMAL")

    # 19. Full End-to-End District Situation Fusion
    def test_19_end_to_end_fusion(self):
        situation = fuse_district_situation(
            district_id="HYD",
            district_name="Hyderabad",
            composite_risk_score=78.5,
            composite_risk_level="CRITICAL",
            rainfall_24h=88.0,
            rainfall_3h=35.0,
            rainfall_source="TSDPS Automatic Weather Station",
            rainfall_data_mode="LIVE",
            rainfall_freshness="FRESH",
            rainfall_confidence=0.95,
            contributions={
                "rainfall": 28.0,
                "flood_history": 21.0,
                "location_risk": 11.5,
                "citizen_reports": 11.0,
                "drainage_vulnerability": 7.0,
            },
            hydrology_summary={
                "primary_water_body": "Musi River",
                "water_body_type": "RIVER",
                "latest_value": 4.5,
                "unit": "m",
                "dominant_status": "WARNING",
                "dominant_trend": "RISING",
                "data_mode": "LIVE",
                "freshness": "FRESH",
                "source_attribution": "CWC Hydrological Feeds",
                "active_stations_count": 2,
                "overall_confidence": 0.92,
                "anomalies": []
            },
            citizen_reports_count=8,
            citizen_high_sev=3,
            citizen_critical=1,
            citizen_score=11.0,
            citizen_trend="Increasing",
            flood_history_score=84.0,
            drainage_vulnerability_score=70.0
        )

        self.assertEqual(situation["districtId"], "HYD")
        self.assertEqual(situation["operationalSituation"], "CRITICAL_INFORMATIONAL")
        self.assertEqual(situation["dataConfidence"], "HIGH")
        self.assertEqual(situation["signalCoverage"]["available"], 5)
        self.assertGreater(len(situation["primaryDrivers"]), 0)
        self.assertGreater(len(situation["recommendedActions"]), 0)
        self.assertTrue(all("official" not in act.lower() or "directives" in act.lower() for act in situation["recommendedActions"]))


if __name__ == "__main__":
    unittest.main()
