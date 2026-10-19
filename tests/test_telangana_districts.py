"""
Unit tests for Telangana 33-district data architecture, provenance, and data processing.
"""

import unittest
import os
import json
from src.config import (
    load_telangana_districts,
    get_priority_districts,
    get_standard_districts,
    get_limited_data_districts,
    TELANGANA_DISTRICTS_JSON_PATH,
)
from src.data_processor import DataProcessor, calculate_data_completeness


class TestTelanganaDistricts(unittest.TestCase):

    def test_json_file_exists_and_valid(self):
        """Verify telangana_districts.json exists and contains exactly 33 districts."""
        self.assertTrue(os.path.exists(TELANGANA_DISTRICTS_JSON_PATH))
        with open(TELANGANA_DISTRICTS_JSON_PATH, "r", encoding="utf-8") as f:
            districts = json.load(f)
        
        self.assertIsInstance(districts, list)
        self.assertEqual(len(districts), 33, f"Expected 33 districts, found {len(districts)}")

    def test_district_tiers_counts(self):
        """Verify distribution across Priority (5), Standard (15), and Limited Data (13)."""
        districts = load_telangana_districts()
        self.assertEqual(len(districts), 33)

        priority = get_priority_districts()
        standard = get_standard_districts()
        limited = get_limited_data_districts()

        self.assertEqual(len(priority), 5, f"Expected 5 Priority districts, got {len(priority)}")
        self.assertEqual(len(standard), 15, f"Expected 15 Standard districts, got {len(standard)}")
        self.assertEqual(len(limited), 13, f"Expected 13 Limited districts, got {len(limited)}")

        # Check Priority district names
        priority_names = {d["district_name"] for d in priority}
        expected_priority = {"Hyderabad", "Warangal", "Nirmal", "Mancherial", "Bhadradri Kothagudem"}
        self.assertEqual(priority_names, expected_priority)

    def test_district_provenance_and_schema(self):
        """Ensure every district has required fields, valid coordinates, and provenance info."""
        districts = load_telangana_districts()
        for d in districts:
            name = d.get("district_name")
            self.assertIsNotNone(name, "District name cannot be None")
            self.assertIn("latitude", d, f"Missing latitude for {name}")
            self.assertIn("longitude", d, f"Missing longitude for {name}")
            self.assertTrue(15.0 <= d["latitude"] <= 20.0, f"Latitude out of bounds for {name}: {d['latitude']}")
            self.assertTrue(77.0 <= d["longitude"] <= 82.0, f"Longitude out of bounds for {name}: {d['longitude']}")
            
            self.assertIn("monitoring_category", d, f"Missing monitoring_category for {name}")
            self.assertIn("data_provenance", d, f"Missing data_provenance for {name}")

    def test_data_processor_33_districts_output(self):
        """Test DataProcessor compilation produces full status for 33 districts."""
        processor = DataProcessor()
        status_list = processor.get_district_status_list()
        
        self.assertEqual(len(status_list), 33, f"Expected 33 compiled district statuses, got {len(status_list)}")

        for d in status_list:
            self.assertIn("district", d)
            self.assertIn("flood_risk_score", d)
            self.assertTrue(0.0 <= d["flood_risk_score"] <= 100.0)
            self.assertIn(d["risk_category"], ["LOW", "MODERATE", "HIGH", "CRITICAL"])
            self.assertIn("monitoring_category", d)
            self.assertIn("data_provenance", d)
            self.assertIn("risk_data_completeness", d)

    def test_data_completeness_calculation(self):
        """Test the calculate_data_completeness logic."""
        complete_meta = {
            "monitoring_category": "Priority Flood Monitoring",
            "historical_flood_context": "Annual severe flood surge across 140 low-lying colonies",
            "river_basin_context": "Godavari basin",
            "terrain_context": "Deep alluvial gorge",
            "prototype_vulnerability_score": 85.0,
            "data_source_mode": "Simulated Telemetry",
        }
        score = calculate_data_completeness(complete_meta, has_reports=True)
        self.assertGreaterEqual(score, 70)


if __name__ == "__main__":
    unittest.main()
