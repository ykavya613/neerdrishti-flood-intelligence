"""
NeerDrishti Flood Risk Engine (Phase C)
Deterministic, rule-based mathematical scoring engine for Telangana districts.
Incorporates multi-factor telemetry, hydrological history, and crowdsourced citizen intelligence.
"""

from typing import Dict, Any, Tuple, List, Optional
from datetime import datetime, timedelta
from src.config import (
    WEIGHT_RAINFALL,
    WEIGHT_FLOOD_HISTORY,
    WEIGHT_LOCATION_RISK,
    WEIGHT_CITIZEN_REPORT,
    WEIGHT_DRAINAGE_VULNERABILITY,
)

# Regional zone multipliers for simulation across 33 districts
REGION_ZONE_MODIFIERS: Dict[str, Dict[str, float]] = {
    "North Telangana": {"rainMultiplier": 1.15, "burstMultiplier": 1.10},
    "Central Telangana": {"rainMultiplier": 1.00, "burstMultiplier": 1.00},
    "Hyderabad Urban Region": {"rainMultiplier": 1.25, "burstMultiplier": 1.35},
    "Godavari Influence Region": {"rainMultiplier": 1.30, "burstMultiplier": 1.20},
    "South Telangana": {"rainMultiplier": 0.85, "burstMultiplier": 0.90},
    "Krishna Influence Region": {"rainMultiplier": 1.10, "burstMultiplier": 1.05},
}

SCENARIO_BASE_CONFIG: Dict[str, Dict[str, Any]] = {
    "Normal Conditions": {
        "baseRainfall": 8.0,
        "baseReportsMultiplier": 0.2,
        "description": "Synoptic seasonal conditions with standard baseline drainage.",
    },
    "Heavy Rainfall": {
        "baseRainfall": 48.0,
        "baseReportsMultiplier": 1.0,
        "description": "Monsoon active surge across Godavari & Central basins.",
    },
    "Flood Warning": {
        "baseRainfall": 85.0,
        "baseReportsMultiplier": 2.2,
        "description": "High-intensity depression causing major catchment swells.",
    },
    "Critical Flood Event": {
        "baseRainfall": 140.0,
        "baseReportsMultiplier": 4.0,
        "description": "Extremely heavy precipitation with severe urban/riverine inundation.",
    },
}

PRIORITY_DISTRICT_CALIBRATED_RAIN: Dict[str, Dict[str, float]] = {
    "Hyderabad": {
        "Normal Conditions": 12.0,
        "Heavy Rainfall": 68.0,
        "Flood Warning": 115.0,
        "Critical Flood Event": 185.0,
    },
    "Warangal": {
        "Normal Conditions": 10.0,
        "Heavy Rainfall": 55.0,
        "Flood Warning": 92.0,
        "Critical Flood Event": 160.0,
    },
    "Nirmal": {
        "Normal Conditions": 14.0,
        "Heavy Rainfall": 62.0,
        "Flood Warning": 105.0,
        "Critical Flood Event": 170.0,
    },
    "Mancherial": {
        "Normal Conditions": 11.0,
        "Heavy Rainfall": 58.0,
        "Flood Warning": 98.0,
        "Critical Flood Event": 165.0,
    },
    "Bhadradri Kothagudem": {
        "Normal Conditions": 15.0,
        "Heavy Rainfall": 72.0,
        "Flood Warning": 120.0,
        "Critical Flood Event": 195.0,
    },
}


def clamp(val: float, min_val: float = 0.0, max_val: float = 100.0) -> float:
    """Clamps a numeric value between min_val and max_val."""
    return max(min_val, min(max_val, float(val)))


def compute_district_simulation_rainfall(district_meta: Dict[str, Any], scenario_name: str) -> float:
    """
    Computes deterministic simulation rainfall (mm 24h) for any of the 33 districts.
    """
    name = district_meta.get("district_name", "")
    if name in PRIORITY_DISTRICT_CALIBRATED_RAIN and scenario_name in PRIORITY_DISTRICT_CALIBRATED_RAIN[name]:
        return PRIORITY_DISTRICT_CALIBRATED_RAIN[name][scenario_name]

    config = SCENARIO_BASE_CONFIG.get(scenario_name, SCENARIO_BASE_CONFIG["Heavy Rainfall"])
    base = config["baseRainfall"]

    zone = district_meta.get("region_zone") or district_meta.get("simulation_zone") or "Central Telangana"
    zone_mod = REGION_ZONE_MODIFIERS.get(zone, {"rainMultiplier": 1.0, "burstMultiplier": 1.0})

    vuln = float(district_meta.get("prototype_vulnerability_score") or 50.0)
    vuln_factor = 0.85 + (vuln / 100.0) * 0.30

    rainfall = base * zone_mod["rainMultiplier"] * vuln_factor
    return round(rainfall, 1)


def calculate_rainfall_score(rainfall_mm_24h: float, rainfall_mm_3h: float = 0.0) -> float:
    """
    Normalizes 24h rainfall (and optional 3h intensity) to a 0-100 score according to IMD curves.
    """
    rf = max(0.0, float(rainfall_mm_24h))
    
    if rf <= 15.5:
        base_score = (rf / 15.5) * 20.0
    elif rf <= 64.4:
        base_score = 20.0 + ((rf - 15.5) / (64.4 - 15.5)) * 30.0
    elif rf <= 115.5:
        base_score = 50.0 + ((rf - 64.4) / (115.5 - 64.4)) * 25.0
    elif rf <= 204.4:
        base_score = 75.0 + ((rf - 115.5) / (204.4 - 115.5)) * 15.0
    else:
        base_score = 90.0 + min(10.0, ((rf - 204.4) / 100.0) * 10.0)
    
    if rainfall_mm_3h > 35.0:
        base_score = min(100.0, base_score + 10.0)
    elif rainfall_mm_3h > 20.0:
        base_score = min(100.0, base_score + 5.0)

    return clamp(round(base_score, 2))


def calculate_citizen_report_score(
    report_count: int = 0,
    high_severity_count: int = 0,
    reports_24h_count: Optional[int] = None,
    critical_count: int = 0,
    total_reports: Optional[int] = None,
    high_count: Optional[int] = None,
    moderate_count: Optional[int] = None,
) -> float:
    """
    Deterministically computes 0-100 Citizen Report score incorporating:
    - Total report volume
    - Severity weighting: Low=3 pts, Moderate=8-10 pts, High=18-20 pts, Critical=30-40 pts
    - Recency window: Reports within 24h have 1.0x weight; older reports have 0.4x weight
    - High severity density bonus for multiple critical/high reports
    """
    count = total_reports if total_reports is not None else report_count
    count = max(0, int(count))
    if count == 0:
        return 0.0

    raw_high = high_count if high_count is not None else high_severity_count
    crit_c = min(count, max(0, int(critical_count)))
    high_c = min(count, max(int(raw_high or 0), crit_c))
    high_only = max(0, high_c - crit_c)
    mod_or_low = max(0, count - high_c)

    # Calculate severity points
    raw_points = (crit_c * 40.0) + (high_only * 20.0) + (mod_or_low * 10.0)


    # If reports_24h_count is not provided, assume all are recent
    rec_count = count if reports_24h_count is None else min(count, max(0, int(reports_24h_count)))
    older_count = count - rec_count

    # Recency scaling
    avg_recency_factor = (rec_count * 1.0 + older_count * 0.40) / count
    weighted_score = raw_points * avg_recency_factor

    # Cluster bonus if >= 2 High/Critical reports
    if high_c >= 2:
        weighted_score += min(20.0, high_c * 5.0)

    return clamp(round(weighted_score, 2))



def get_risk_category(score: float) -> str:
    """Assigns qualitative risk category based on 0-100 score."""
    s = clamp(score)
    if s <= 25.0:
        return "LOW"
    elif s <= 50.0:
        return "MODERATE"
    elif s <= 75.0:
        return "HIGH"
    else:
        return "CRITICAL"


def calculate_flood_risk(
    rainfall_score: float,
    flood_history_score: float,
    location_risk_score: float,
    citizen_report_score: float,
    drainage_vulnerability_score: float,
) -> Dict[str, Any]:
    """
    Calculates composite flood risk score using the official 5-factor weighted formula:
    - Rainfall Score: 35%
    - Flood History: 25%
    - Location Risk: 15%
    - Citizen Reports: 15%
    - Drainage Vulnerability: 10%
    """
    norm_rainfall = clamp(rainfall_score)
    norm_history = clamp(flood_history_score)
    norm_location = clamp(location_risk_score)
    norm_citizen = clamp(citizen_report_score)
    norm_drainage = clamp(drainage_vulnerability_score)

    contrib_rainfall = norm_rainfall * WEIGHT_RAINFALL
    contrib_history = norm_history * WEIGHT_FLOOD_HISTORY
    contrib_location = norm_location * WEIGHT_LOCATION_RISK
    contrib_citizen = norm_citizen * WEIGHT_CITIZEN_REPORT
    contrib_drainage = norm_drainage * WEIGHT_DRAINAGE_VULNERABILITY

    total_score = contrib_rainfall + contrib_history + contrib_location + contrib_citizen + contrib_drainage
    total_score = clamp(round(total_score, 2))
    category = get_risk_category(total_score)

    return {
        "flood_risk_score": total_score,
        "risk_category": category,
        "components": {
            "rainfall_score": norm_rainfall,
            "flood_history_score": norm_history,
            "location_risk_score": norm_location,
            "citizen_report_score": norm_citizen,
            "drainage_vulnerability_score": norm_drainage,
        },
        "contributions": {
            "rainfall": round(contrib_rainfall, 2),
            "flood_history": round(contrib_history, 2),
            "location_risk": round(contrib_location, 2),
            "citizen_reports": round(contrib_citizen, 2),
            "drainage_vulnerability": round(contrib_drainage, 2),
        },
        "weights": {
            "rainfall": WEIGHT_RAINFALL,
            "flood_history": WEIGHT_FLOOD_HISTORY,
            "location_risk": WEIGHT_LOCATION_RISK,
            "citizen_reports": WEIGHT_CITIZEN_REPORT,
            "drainage_vulnerability": WEIGHT_DRAINAGE_VULNERABILITY,
        },
    }


class RiskEngine:
    """Class wrapper for Risk Engine calculations."""
    @staticmethod
    def calculate_rainfall_score(rainfall_mm_24h: float, rainfall_mm_3h: float = 0.0) -> float:
        return calculate_rainfall_score(rainfall_mm_24h, rainfall_mm_3h)

    @staticmethod
    def calculate_citizen_report_score(
        report_count: int,
        high_severity_count: int = 0,
        reports_24h_count: Optional[int] = None,
        critical_count: int = 0,
    ) -> float:
        return calculate_citizen_report_score(
            report_count, high_severity_count, reports_24h_count, critical_count
        )

    @staticmethod
    def get_risk_category(score: float) -> str:
        return get_risk_category(score)

    @staticmethod
    def calculate_flood_risk(
        rainfall_score: float,
        flood_history_score: float,
        location_risk_score: float,
        citizen_report_score: float,
        drainage_vulnerability_score: float,
    ) -> Dict[str, Any]:
        return calculate_flood_risk(
            rainfall_score,
            flood_history_score,
            location_risk_score,
            citizen_report_score,
            drainage_vulnerability_score,
        )

    @staticmethod
    def calculate_flood_risk_score(
        rainfall_score: float,
        flood_history_score: float,
        location_risk_score: float,
        citizen_report_score: float,
        drainage_vulnerability_score: float,
    ) -> float:
        res = calculate_flood_risk(
            rainfall_score,
            flood_history_score,
            location_risk_score,
            citizen_report_score,
            drainage_vulnerability_score,
        )
        return res["flood_risk_score"]
