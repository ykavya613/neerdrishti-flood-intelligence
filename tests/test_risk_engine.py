"""
Unit tests for the NeerDrishti Flood Risk Engine
"""

import unittest
from src.risk_engine import (
    calculate_flood_risk,
    calculate_rainfall_score,
    calculate_citizen_report_score,
    get_risk_category,
    clamp,
)


class TestRiskEngine(unittest.TestCase):

    def test_zero_scores(self):
        """Verify minimum risk evaluation."""
        result = calculate_flood_risk(
            rainfall_score=0,
            flood_history_score=0,
            location_risk_score=0,
            citizen_report_score=0,
            drainage_vulnerability_score=0,
        )
        self.assertEqual(result["flood_risk_score"], 0.0)
        self.assertEqual(result["risk_category"], "LOW")

    def test_maximum_scores(self):
        """Verify maximum risk ceiling evaluation."""
        result = calculate_flood_risk(
            rainfall_score=100,
            flood_history_score=100,
            location_risk_score=100,
            citizen_report_score=100,
            drainage_vulnerability_score=100,
        )
        self.assertEqual(result["flood_risk_score"], 100.0)
        self.assertEqual(result["risk_category"], "CRITICAL")

    def test_formula_weights(self):
        """
        Test exact weighted formula:
        Rainfall (0.35) + History (0.25) + Location (0.15) + Reports (0.15) + Drainage (0.10)
        """
        # 80*0.35 (28) + 60*0.25 (15) + 70*0.15 (10.5) + 50*0.15 (7.5) + 90*0.10 (9) = 70.0
        result = calculate_flood_risk(
            rainfall_score=80,
            flood_history_score=60,
            location_risk_score=70,
            citizen_report_score=50,
            drainage_vulnerability_score=90,
        )
        self.assertEqual(result["flood_risk_score"], 70.0)
        self.assertEqual(result["risk_category"], "HIGH")

    def test_risk_categories(self):
        """Test risk category thresholds."""
        self.assertEqual(get_risk_category(10.0), "LOW")
        self.assertEqual(get_risk_category(25.0), "LOW")
        self.assertEqual(get_risk_category(26.0), "MODERATE")
        self.assertEqual(get_risk_category(50.0), "MODERATE")
        self.assertEqual(get_risk_category(51.0), "HIGH")
        self.assertEqual(get_risk_category(75.0), "HIGH")
        self.assertEqual(get_risk_category(76.0), "CRITICAL")
        self.assertEqual(get_risk_category(100.0), "CRITICAL")

    def test_clamp_and_bounds(self):
        """Test out-of-range input clamping."""
        self.assertEqual(clamp(-50), 0.0)
        self.assertEqual(clamp(150), 100.0)
        self.assertEqual(clamp(55.5), 55.5)

    def test_rainfall_normalization(self):
        """Test IMD-based rainfall normalization."""
        self.assertLess(calculate_rainfall_score(10.0), 20.0)
        self.assertGreater(calculate_rainfall_score(80.0), 50.0)
        self.assertGreaterEqual(calculate_rainfall_score(220.0), 90.0)


if __name__ == "__main__":
    unittest.main()

