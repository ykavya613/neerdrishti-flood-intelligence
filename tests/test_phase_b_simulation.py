"""
Unit tests for Phase B: Telangana Flood Intelligence Dashboard & 33-District Scalable Simulation.
"""

import unittest
import json
import os
from src.config import load_telangana_districts
from src.data_processor import DataProcessor
from src.risk_engine import RiskEngine, compute_district_simulation_rainfall, REGION_ZONE_MODIFIERS, SCENARIO_BASE_CONFIG


class TestPhaseBSimulation(unittest.TestCase):

    def setUp(self):
        self.districts = load_telangana_districts()
        self.engine = RiskEngine()
        self.processor = DataProcessor()

    def test_1_all_33_districts_present(self):
        """Test 1: Exactly 33 districts are loaded and processed."""
        self.assertEqual(len(self.districts), 33)

    def test_2_scenario_normal_conditions(self):
        """Test 2: Normal Conditions scenario produces baseline low risk scores across state."""
        scores = []
        for d in self.districts:
            rain = compute_district_simulation_rainfall(d, "Normal Conditions")
            self.assertLessEqual(rain, 25.0, f"Rainfall too high in normal conditions for {d['district_name']}")
            rf_score = self.engine.calculate_rainfall_score(rain, rain * 0.35)
            contrib_rf = rf_score * 0.35
            contrib_hist = (d.get("prototype_vulnerability_score", 50.0)) * 0.25
            total = contrib_rf + contrib_hist + (50 * 0.15) + 0 + (50 * 0.10)
            scores.append(total)

        avg_score = sum(scores) / len(scores)
        self.assertLess(avg_score, 45.0, "Average risk score should be low/moderate under normal conditions")

    def test_3_scenario_critical_flood_event(self):
        """Test 3: Critical Flood Event significantly elevates risk across multiple zones."""
        critical_high_count = 0
        for d in self.districts:
            rain = compute_district_simulation_rainfall(d, "Critical Flood Event")
            rf_score = self.engine.calculate_rainfall_score(rain, rain * 0.35)
            vuln = d.get("prototype_vulnerability_score", 50.0)
            total = (rf_score * 0.35) + (vuln * 0.25) + (vuln * 0.95 * 0.15) + (30 * 0.15) + (vuln * 1.05 * 0.10)
            if total >= 50.0:
                critical_high_count += 1

        self.assertGreaterEqual(critical_high_count, 10, "Expected at least 10 high/critical districts in Critical event")

    def test_4_all_scores_bounded_between_0_and_100(self):
        """Test 4: Every district across all 4 scenarios has score in [0.0, 100.0]."""
        scenarios = ["Normal Conditions", "Heavy Rainfall", "Flood Warning", "Critical Flood Event"]
        for sc in scenarios:
            for d in self.districts:
                rain = compute_district_simulation_rainfall(d, sc)
                self.assertGreaterEqual(rain, 0.0)
                rf_score = self.engine.calculate_rainfall_score(rain, rain * 0.35)
                self.assertTrue(0.0 <= rf_score <= 100.0)
                
                vuln = d.get("prototype_vulnerability_score", 50.0)
                total = self.engine.calculate_flood_risk_score(
                    rainfall_score=rf_score,
                    flood_history_score=vuln,
                    location_risk_score=vuln * 0.95,
                    citizen_report_score=20.0,
                    drainage_vulnerability_score=vuln * 1.0,
                )
                self.assertTrue(0.0 <= total <= 100.0, f"Score {total} out of bounds for {d['district_name']} in {sc}")

    def test_5_regional_zone_modifiers_applied(self):
        """Test 5: Godavari and Hyderabad zones receive appropriate hydrological multipliers."""
        hyd = next(d for d in self.districts if d["district_name"] == "Hyderabad")
        bhadradri = next(d for d in self.districts if d["district_name"] == "Bhadradri Kothagudem")
        
        rain_hyd = compute_district_simulation_rainfall(hyd, "Heavy Rainfall")
        rain_bhadradri = compute_district_simulation_rainfall(bhadradri, "Heavy Rainfall")
        
        self.assertGreater(rain_hyd, 50.0, "Hyderabad should receive heavy rainfall in Heavy Rainfall scenario")
        self.assertGreater(rain_bhadradri, 60.0, "Bhadradri should receive Godavari basin rainfall")

    def test_6_priority_districts_calibrated(self):
        """Test 6: 5 Priority districts have expected calibrated demonstration values."""
        priority_names = ["Hyderabad", "Warangal", "Nirmal", "Mancherial", "Bhadradri Kothagudem"]
        for p in priority_names:
            meta = next(d for d in self.districts if d["district_name"] == p)
            self.assertEqual(meta["monitoring_category"], "Priority Flood Monitoring")
            rain = compute_district_simulation_rainfall(meta, "Heavy Rainfall")
            self.assertGreater(rain, 30.0)

    def test_7_deterministic_reproducibility(self):
        """Test 7: Simulation rainfall is 100% deterministic and identical across repeated calls."""
        for d in self.districts:
            r1 = compute_district_simulation_rainfall(d, "Flood Warning")
            r2 = compute_district_simulation_rainfall(d, "Flood Warning")
            self.assertEqual(r1, r2, f"Non-deterministic calculation for {d['district_name']}")

    def test_8_contribution_mathematical_sum(self):
        """Test 8: Exact mathematical sum of contributions equals total score within rounding precision."""
        rf_score = 80.0
        hist_score = 75.0
        loc_score = 60.0
        rep_score = 40.0
        drain_score = 70.0

        c_rf = rf_score * 0.35
        c_hist = hist_score * 0.25
        c_loc = loc_score * 0.15
        c_rep = rep_score * 0.15
        c_drain = drain_score * 0.10

        expected_sum = round((c_rf + c_hist + c_loc + c_rep + c_drain) * 100) / 100
        actual_score = self.engine.calculate_flood_risk_score(rf_score, hist_score, loc_score, rep_score, drain_score)
        self.assertAlmostEqual(actual_score, expected_sum, places=2)

    def test_9_scenario_config_integrity(self):
        """Test 9: SCENARIO_BASE_CONFIG contains all 4 standard scenarios."""
        required = ["Normal Conditions", "Heavy Rainfall", "Flood Warning", "Critical Flood Event"]
        for r in required:
            self.assertIn(r, SCENARIO_BASE_CONFIG)
            self.assertIn("baseRainfall", SCENARIO_BASE_CONFIG[r])
            self.assertIn("description", SCENARIO_BASE_CONFIG[r])

    def test_10_region_zone_modifiers_integrity(self):
        """Test 10: All 6 regional zones exist with positive multipliers."""
        zones = [
            "North Telangana",
            "Central Telangana",
            "Hyderabad Urban Region",
            "Godavari Influence Region",
            "South Telangana",
            "Krishna Influence Region",
        ]
        for z in zones:
            self.assertIn(z, REGION_ZONE_MODIFIERS)
            self.assertGreater(REGION_ZONE_MODIFIERS[z]["rainMultiplier"], 0.0)


if __name__ == "__main__":
    unittest.main()
