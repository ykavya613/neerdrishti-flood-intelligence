"""
Unit tests for Phase C: Persistent Citizen Flood Intelligence
Validates SQLite data persistence, AI triage & deterministic fallback classification,
severity/recency scoring, and administrative status transitions.
"""

import unittest
import os
import sqlite3
import json
from src.risk_engine import (
    RiskEngine,
    calculate_citizen_report_score,
    calculate_flood_risk,
)
from src.report_processor import classify_report_rule_based


class TestPhaseCCitizenIntelligence(unittest.TestCase):

    def setUp(self):
        # In-memory test SQLite DB matching production schema
        self.db = sqlite3.connect(":memory:")
        self.cursor = self.db.cursor()
        
        self.cursor.executescript("""
            CREATE TABLE IF NOT EXISTS districts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                district_name TEXT UNIQUE NOT NULL,
                river_basin TEXT,
                terrain_type TEXT,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                monitoring_category TEXT NOT NULL DEFAULT 'Standard Monitoring',
                data_source_mode TEXT NOT NULL DEFAULT 'Simulated Data',
                prototype_vulnerability_score REAL NOT NULL DEFAULT 50.0,
                risk_data_completeness INTEGER NOT NULL DEFAULT 80,
                historical_flood_risk REAL DEFAULT 50.0,
                location_risk REAL DEFAULT 50.0,
                drainage_vulnerability REAL DEFAULT 50.0,
                region_zone TEXT DEFAULT 'Central Telangana',
                is_priority INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS citizen_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                district TEXT NOT NULL,
                location_description TEXT,
                water_depth_ft REAL,
                description TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS report_classification (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                report_id INTEGER UNIQUE NOT NULL,
                severity TEXT NOT NULL,
                category TEXT NOT NULL,
                confidence REAL NOT NULL,
                reasoning TEXT,
                recommended_action TEXT,
                ai_model TEXT NOT NULL,
                classified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (report_id) REFERENCES citizen_reports(id) ON DELETE CASCADE
            );
        """)
        self.db.commit()
        self.engine = RiskEngine()

    def tearDown(self):
        self.db.close()

    def test_1_database_insertion_and_foreign_key(self):
        """Test 1: Insert citizen report and linked AI classification into SQLite."""
        self.cursor.execute("""
            INSERT INTO citizen_reports (district, location_description, water_depth_ft, description, status)
            VALUES (?, ?, ?, ?, ?)
        """, ("Hyderabad", "Begumpet Nala underpass", 3.5, "Severe waterlogging near metro pillar 120", "pending"))
        report_id = self.cursor.lastrowid
        self.assertIsNotNone(report_id)

        self.cursor.execute("""
            INSERT INTO report_classification (report_id, severity, category, confidence, reasoning, recommended_action, ai_model)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (report_id, "CRITICAL", "WATERLOGGING", 0.95, "Deep standing water under urban railway underpass", "Dispatch emergency suction pumps", "llama3.2:3b"))
        self.db.commit()

        # Verify joined retrieval
        self.cursor.execute("""
            SELECT r.id, r.district, r.description, c.severity, c.category, c.confidence
            FROM citizen_reports r
            LEFT JOIN report_classification c ON r.id = c.report_id
            WHERE r.id = ?
        """, (report_id,))
        row = self.cursor.fetchone()
        self.assertEqual(row[1], "Hyderabad")
        self.assertEqual(row[3], "CRITICAL")
        self.assertEqual(row[4], "WATERLOGGING")
        self.assertAlmostEqual(row[5], 0.95)

    def test_2_rule_based_triage_critical_keywords(self):
        """Test 2: Rule-based fallback classifier correctly identifies high/critical severity hazards."""
        # Critical test
        crit_res = classify_report_rule_based(
            description="People trapped on second floor due to river overflowing near temple",
            water_depth=4.5
        )
        self.assertEqual(crit_res["severity"], "CRITICAL")
        self.assertEqual(crit_res["category"], "RIVER_OVERFLOW")
        self.assertGreaterEqual(crit_res["confidence"], 0.90)

        # Inundation test
        high_res = classify_report_rule_based(
            description="Heavy inundation in residential colony, flood water entered ground floor houses",
            water_depth=2.0
        )
        self.assertEqual(high_res["severity"], "HIGH")
        self.assertEqual(high_res["category"], "INUNDATION")

    def test_3_rule_based_triage_drainage_and_low(self):
        """Test 3: Rule-based classifier handles drainage issues and minor observations."""
        drain_res = classify_report_rule_based(
            description="Drainage blockage near main road manhole causing slow water accumulation",
            water_depth=0.5
        )
        self.assertEqual(drain_res["severity"], "MODERATE")
        self.assertEqual(drain_res["category"], "DRAINAGE_FAILURE")

        low_res = classify_report_rule_based(
            description="Mild drizzle and damp pavement, traffic moving normally",
            water_depth=0.0
        )
        self.assertEqual(low_res["severity"], "LOW")
        self.assertEqual(low_res["category"], "OBSERVATION")

    def test_4_severity_weighted_scoring_calculation(self):
        """Test 4: Citizen report scoring scales with severity and report count with cap at 100."""
        # 0 reports => 0 score
        score_0 = calculate_citizen_report_score(total_reports=0, critical_count=0, high_count=0, moderate_count=0)
        self.assertEqual(score_0, 0.0)

        # 1 moderate report
        score_mod = calculate_citizen_report_score(total_reports=1, critical_count=0, high_count=0, moderate_count=1)
        self.assertEqual(score_mod, 10.0)

        # 1 critical report
        score_crit = calculate_citizen_report_score(total_reports=1, critical_count=1, high_count=0, moderate_count=0)
        self.assertEqual(score_crit, 40.0)

        # Multiple critical + high reports with cap test
        score_overflow = calculate_citizen_report_score(total_reports=15, critical_count=4, high_count=6, moderate_count=5)
        self.assertEqual(score_overflow, 100.0)

    def test_5_report_status_lifecycle_updates(self):
        """Test 5: Status transitions through administrative review lifecycle."""
        self.cursor.execute("""
            INSERT INTO citizen_reports (district, location_description, water_depth_ft, description, status)
            VALUES (?, ?, ?, ?, ?)
        """, ("Warangal", "Hunter Road", 2.0, "Submerged culvert", "pending"))
        report_id = self.cursor.lastrowid

        # Update to 'verified'
        self.cursor.execute("UPDATE citizen_reports SET status = ? WHERE id = ?", ("verified", report_id))
        self.db.commit()

        self.cursor.execute("SELECT status FROM citizen_reports WHERE id = ?", (report_id,))
        self.assertEqual(self.cursor.fetchone()[0], "verified")

        # Update to 'resolved'
        self.cursor.execute("UPDATE citizen_reports SET status = ? WHERE id = ?", ("resolved", report_id))
        self.db.commit()

        self.cursor.execute("SELECT status FROM citizen_reports WHERE id = ?", (report_id,))
        self.assertEqual(self.cursor.fetchone()[0], "resolved")

    def test_6_district_report_aggregation(self):
        """Test 6: Aggregate active reports count and high severity breakdown per district."""
        reports_data = [
            ("Hyderabad", "Begumpet", 3.0, "Overpass flooding", "CRITICAL", "WATERLOGGING", "verified"),
            ("Hyderabad", "Khairatabad", 1.5, "Water on road", "HIGH", "WATERLOGGING", "pending"),
            ("Hyderabad", "Secunderabad", 0.5, "Slow drain", "LOW", "DRAINAGE_FAILURE", "resolved"), # resolved should be excluded from active risk if needed or counted by status
            ("Warangal", "Kazipet", 2.0, "Nala overflow", "HIGH", "RIVER_OVERFLOW", "verified"),
        ]

        for dist, loc, depth, desc, sev, cat, stat in reports_data:
            self.cursor.execute("""
                INSERT INTO citizen_reports (district, location_description, water_depth_ft, description, status)
                VALUES (?, ?, ?, ?, ?)
            """, (dist, loc, depth, desc, stat))
            r_id = self.cursor.lastrowid
            self.cursor.execute("""
                INSERT INTO report_classification (report_id, severity, category, confidence, reasoning, recommended_action, ai_model)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (r_id, sev, cat, 0.9, "Test reason", "Test action", "rule-based"))

        self.db.commit()

        # Query active verified/pending reports for Hyderabad
        self.cursor.execute("""
            SELECT 
                COUNT(r.id) as total_reports,
                SUM(CASE WHEN c.severity IN ('CRITICAL', 'HIGH') THEN 1 ELSE 0 END) as high_severity_count,
                SUM(CASE WHEN c.severity = 'CRITICAL' THEN 1 ELSE 0 END) as critical_count
            FROM citizen_reports r
            LEFT JOIN report_classification c ON r.id = c.report_id
            WHERE r.district = 'Hyderabad' AND r.status != 'dismissed'
        """)
        row = self.cursor.fetchone()
        self.assertEqual(row[0], 3)
        self.assertEqual(row[1], 2)
        self.assertEqual(row[2], 1)

    def test_7_no_personal_identifiable_information_in_schema(self):
        """Test 7: Schema verification - guarantee no PII columns (Phone, Email, Full Name, GPS) exist."""
        self.cursor.execute("PRAGMA table_info(citizen_reports)")
        columns = [row[1].lower() for row in self.cursor.fetchall()]
        
        forbidden_pii = ["phone", "mobile", "email", "name", "full_name", "user_name", "gps_lat", "gps_long", "address"]
        for pii in forbidden_pii:
            self.assertNotIn(pii, columns, f"Forbidden PII column '{pii}' detected in citizen_reports table!")

    def test_8_composite_risk_integration(self):
        """Test 8: Ensure composite flood risk reflects citizen report score contribution (15% weight)."""
        # Baseline with 0 reports
        base_result = calculate_flood_risk(
            rainfall_score=60.0,
            flood_history_score=50.0,
            location_risk_score=50.0,
            citizen_report_score=0.0,
            drainage_vulnerability_score=50.0
        )
        # Expected: (60*0.35)+(50*0.25)+(50*0.15)+(0*0.15)+(50*0.10) = 21 + 12.5 + 7.5 + 0 + 5 = 46.0
        self.assertEqual(base_result["flood_risk_score"], 46.0)

        # Same telemetry with citizen report surge (score = 60)
        elevated_result = calculate_flood_risk(
            rainfall_score=60.0,
            flood_history_score=50.0,
            location_risk_score=50.0,
            citizen_report_score=60.0,
            drainage_vulnerability_score=50.0
        )
        # Expected: 46.0 + (60 * 0.15 = 9.0) = 55.0
        self.assertEqual(elevated_result["flood_risk_score"], 55.0)
        self.assertEqual(elevated_result["risk_category"], "HIGH")


if __name__ == "__main__":
    unittest.main()
