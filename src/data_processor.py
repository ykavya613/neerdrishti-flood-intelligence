"""
NeerDrishti Data Processor
Loads central Telangana district metadata, merges historical attributes,
integrates citizen reports, calculates data completeness, and invokes the deterministic risk engine.
"""

import os
from pathlib import Path
from typing import Dict, Any, List, Optional

from src.config import DATA_DIR, load_telangana_districts, get_district_metadata
from src.risk_engine import (
    calculate_flood_risk,
    calculate_rainfall_score,
    calculate_citizen_report_score,
)
from src.database import get_report_counts_by_district, init_database


def calculate_data_completeness(district_meta: Dict[str, Any], has_reports: bool) -> int:
    """
    Calculates transparent data completeness percentage (0-100%) based on verified components:
    - 20% Rainfall telemetry / baseline
    - 20% Historical flood context
    - 20% Location / terrain hydrological context
    - 20% Drainage vulnerability / nala context
    - 20% Active citizen reports telemetry
    """
    score = 0
    cat = district_meta.get("monitoring_category", "")
    
    # Rainfall telemetry availability
    if cat == "Priority Flood Monitoring":
        score += 20
    elif cat == "Standard Monitoring":
        score += 15
    else:
        score += 10  # Coarse regional estimate

    # Historical context
    if district_meta.get("historical_flood_context") and len(district_meta["historical_flood_context"]) > 10:
        score += 20
    else:
        score += 5

    # Location / terrain context
    if district_meta.get("terrain_context") and district_meta.get("river_basin_context"):
        score += 20
    else:
        score += 10

    # Drainage / vulnerability score context
    if district_meta.get("prototype_vulnerability_score") is not None:
        score += 20
    else:
        score += 5

    # Citizen reports telemetry
    if has_reports:
        score += 20
    elif cat == "Priority Flood Monitoring":
        score += 10  # Active monitoring channel without current incident
    else:
        score += 0

    return min(100, max(0, score))


class DataProcessor:
    """Handles structured data ingestion and real-time risk compilation across all 33 Telangana districts."""

    def __init__(self, data_dir: Optional[Path] = None):
        self.data_dir = data_dir or DATA_DIR
        init_database()
        self.load_datasets()

    def load_datasets(self) -> None:
        """Loads master district JSON dataset and optional legacy CSV overrides."""
        self.master_districts = load_telangana_districts()

    def get_district_status_list(self, custom_rainfall_override: Optional[Dict[str, float]] = None) -> List[Dict[str, Any]]:
        """
        Compiles the unified risk state for all 33 Telangana districts.
        Preserves 5-district simulation overrides while gracefully handling all 33 districts.
        """
        report_counts = get_report_counts_by_district()
        results = []

        for d_meta in self.master_districts:
            district_name = d_meta["district_name"]
            cat = d_meta.get("monitoring_category", "Limited Data")

            # Default baseline metrics based on category
            is_priority = (cat == "Priority Flood Monitoring")
            is_standard = (cat == "Standard Monitoring")

            # Rainfall values (or simulation override)
            if custom_rainfall_override and district_name in custom_rainfall_override:
                rf_24h = float(custom_rainfall_override[district_name])
                rf_3h = rf_24h * 0.35
            elif is_priority:
                # Default active telemetry / baseline for priority districts
                priority_defaults = {
                    "Hyderabad": 68.0,
                    "Warangal": 55.0,
                    "Nirmal": 74.0,
                    "Mancherial": 58.0,
                    "Bhadradri Kothagudem": 82.0,
                }
                rf_24h = priority_defaults.get(district_name, 25.0)
                rf_3h = rf_24h * 0.35
            elif is_standard:
                rf_24h = 18.0
                rf_3h = 5.0
            else:
                rf_24h = 8.0
                rf_3h = 2.0

            rf_score = calculate_rainfall_score(rf_24h, rf_3h)
            
            # Historical and drainage scores
            proto_vuln = float(d_meta.get("prototype_vulnerability_score", 50.0))
            history_score = proto_vuln
            location_score = proto_vuln * 0.95
            drainage_score = proto_vuln * 1.05 if is_priority else proto_vuln * 0.9

            # Citizen reports metrics
            dist_rep = report_counts.get(district_name, {"total": 0, "high": 0})
            citizen_count = dist_rep["total"]
            high_count = dist_rep["high"]
            citizen_score = calculate_citizen_report_score(citizen_count, high_count)

            # Compute transparent mathematical risk score
            risk_eval = calculate_flood_risk(
                rainfall_score=rf_score,
                flood_history_score=history_score,
                location_risk_score=location_score,
                citizen_report_score=citizen_score,
                drainage_vulnerability_score=drainage_score,
            )

            completeness = calculate_data_completeness(d_meta, citizen_count > 0)
            confidence = d_meta.get("data_confidence", "Prototype")

            status_entry = {
                "district": district_name,
                "district_id": d_meta.get("district_id", district_name.lower().replace(" ", "_")),
                "lat": float(d_meta.get("latitude") or 17.5),
                "lng": float(d_meta.get("longitude") or 78.5),
                "terrain_type": d_meta.get("terrain_context", "Standard Upland"),
                "river_basin": d_meta.get("river_basin_context", "Telangana Regional Basin"),
                "monitoring_category": cat,
                "category_basis": d_meta.get("category_basis", "Prototype project prioritization based on current project scope and available data."),
                "data_source_mode": d_meta.get("data_source_mode", "Prototype Baseline"),
                "data_confidence": confidence,
                "data_provenance": d_meta.get("data_provenance", "Regional Synoptic Overview"),
                "data_limitation_notes": d_meta.get("data_limitation_notes", ""),
                "region_zone": d_meta.get("region_zone", "Central Telangana"),
                "simulation_zone": d_meta.get("simulation_zone", "Central Telangana"),
                "last_updated": "2026-08-26 10:00 IST",
                "is_simulated": is_priority,
                "risk_confidence": confidence,
                "risk_data_completeness": completeness,
                "rainfall_mm_24h": round(rf_24h, 1),
                "rainfall_mm_3h": round(rf_3h, 1),
                "rainfall_score": rf_score,
                "flood_history_score": round(history_score, 1),
                "location_risk_score": round(location_score, 1),
                "drainage_vulnerability_score": round(drainage_score, 1),
                "citizen_reports_count": citizen_count,
                "citizen_reports_high_severity": high_count,
                "citizen_report_score": citizen_score,
                "flood_risk_score": risk_eval["flood_risk_score"],
                "risk_category": risk_eval["risk_category"],
                "contributions": risk_eval["contributions"],
                "components": risk_eval["components"],
                "major_past_events": d_meta.get("historical_flood_context", ""),
                "vulnerable_hotspots": d_meta.get("river_basin_context", ""),
                "primary_nala_network": d_meta.get("terrain_context", ""),
                "encroachment_level": "Prototype Baseline",
            }
            results.append(status_entry)

        return results

    def get_district_status_by_name(self, district_name: str) -> Optional[Dict[str, Any]]:
        """Retrieves unified status for a single named district."""
        all_status = self.get_district_status_list()
        for item in all_status:
            if item["district"].lower() == district_name.lower() or item.get("district_id", "").lower() == district_name.lower():
                return item
        return None

