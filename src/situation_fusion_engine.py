"""
NeerDrishti Phase D3 - Multi-Signal Intelligence and District Situation Fusion Engine
Deterministically fuses 5-factor composite risk, rainfall telemetry, hydrological stage,
citizen reports, signal freshness, data confidence, and physical anomalies into an
explainable operational situation summary.

IMPORTANT SAFETY RULE:
The system must not generate official emergency warnings or disaster decrees.
It distinguishes:
NORMAL | MONITORING | ELEVATED_ATTENTION | HIGH_CONCERN | CRITICAL_INFORMATIONAL
"""

from datetime import datetime, timezone
import json
import os
from typing import Any, Dict, List, Optional, Tuple

from src.config import load_telangana_districts
from src.district_normalizer import normalize_district
from src.data_processor import DataProcessor
from src.hydrology_engine import (
    get_district_hydrological_summary,
    get_all_districts_hydrological_summaries,
)
from src.simulation import SIMULATION_SCENARIOS


# -------------------------------------------------------------
# 1. SIGNAL COVERAGE EVALUATION
# -------------------------------------------------------------

def calculate_signal_coverage(
    rainfall_data: Dict[str, Any],
    hydrology_data: Optional[Dict[str, Any]],
    citizen_data: Dict[str, Any],
    has_history: bool = True,
    has_drainage: bool = True
) -> Dict[str, Any]:
    """
    Evaluates availability across 5 key signal domains:
    1. Rainfall telemetry
    2. Hydrological stage/gauge telemetry
    3. Citizen ground intelligence
    4. Historical flood vulnerability
    5. Terrain & drainage vulnerability
    """
    rf_avail = bool(
        rainfall_data and
        rainfall_data.get("data_mode") != "UNAVAILABLE" and
        rainfall_data.get("rainfall_24h") is not None
    )
    hydro_avail = bool(
        hydrology_data and
        hydrology_data.get("active_stations_count", 0) > 0 and
        hydrology_data.get("data_mode") != "UNAVAILABLE" and
        hydrology_data.get("dominant_status") != "UNKNOWN"
    )
    cit_avail = bool(
        citizen_data and
        (citizen_data.get("total_reports", 0) >= 0 or citizen_data.get("score", 0) >= 0)
    )

    available_count = (
        (1 if rf_avail else 0) +
        (1 if hydro_avail else 0) +
        (1 if cit_avail else 0) +
        (1 if has_history else 0) +
        (1 if has_drainage else 0)
    )
    total = 5
    ratio = round(available_count / total, 2)

    return {
        "available": available_count,
        "total": total,
        "ratio": ratio,
        "signals": {
            "rainfall": rf_avail,
            "hydrology": hydro_avail,
            "citizen": cit_avail,
            "flood_history": has_history,
            "drainage_vulnerability": has_drainage,
        }
    }


def evaluate_signal_coverage(district_status: Dict[str, Any]) -> Dict[str, Any]:
    """Evaluates signal availability from a unified DistrictStatus dictionary."""
    rf_mode = district_status.get("rainfall_data_mode", "")
    rf_24 = district_status.get("rainfall_mm_24h")
    rainfall_data = {
        "data_mode": rf_mode,
        "rainfall_24h": rf_24,
    }
    hydro = district_status.get("hydrological_summary")
    if hydro and "active_stations_count" not in hydro:
        hydro = dict(hydro)
        hydro["active_stations_count"] = 1 if hydro.get("dominant_status") != "UNKNOWN" else 0

    citizen_data = {
        "total_reports": district_status.get("citizen_reports_count", 0),
        "score": district_status.get("citizen_report_score", 0.0),
    }

    return calculate_signal_coverage(
        rainfall_data=rainfall_data,
        hydrology_data=hydro,
        citizen_data=citizen_data,
        has_history=district_status.get("flood_history_score") is not None,
        has_drainage=district_status.get("drainage_vulnerability_score") is not None,
    )


# -------------------------------------------------------------
# 2. DATA CONFIDENCE EVALUATION
# -------------------------------------------------------------

def _get_freshness_weight(freshness: Optional[str]) -> float:
    if not freshness:
        return 0.70
    f = freshness.upper()
    if f == "FRESH":
        return 1.0
    elif f == "AGING":
        return 0.80
    elif f == "STALE":
        return 0.55
    elif f == "EXPIRED":
        return 0.20
    return 0.60


def calculate_data_confidence(
    coverage: Dict[str, Any],
    rf_freshness: str,
    hydro_freshness: str,
    citizen_count: int = 0
) -> Tuple[str, float]:
    """
    Calculates unified data confidence level (HIGH, MEDIUM, LOW, LIMITED) and numeric score (0.0 to 1.0).
    """
    available = coverage.get("available", 0)
    signals = coverage.get("signals", {})

    rf_w = _get_freshness_weight(rf_freshness) if signals.get("rainfall") else 0.05
    hydro_w = _get_freshness_weight(hydro_freshness) if signals.get("hydrology") else 0.05
    cit_w = 0.90 if citizen_count > 0 else (0.70 if signals.get("citizen") else 0.05)
    history_w = 0.85 if signals.get("flood_history") else 0.0
    drainage_w = 0.85 if signals.get("drainage_vulnerability") else 0.0

    # Weighted contribution: Rain (0.30) + Hydro (0.25) + Cit (0.20) + Hist (0.15) + Drain (0.10)
    score = (
        rf_w * 0.30 +
        hydro_w * 0.25 +
        cit_w * 0.20 +
        history_w * 0.15 +
        drainage_w * 0.10
    )

    score = round(max(0.10, min(1.0, score)), 2)

    if score >= 0.80 and available >= 4:
        level = "HIGH"
    elif score >= 0.58 and available >= 3:
        level = "MEDIUM"
    elif score >= 0.40 and available >= 3:
        level = "LOW"
    else:
        level = "LIMITED"

    return level, score


def evaluate_data_confidence(
    district_status: Dict[str, Any],
    coverage: Dict[str, Any]
) -> Tuple[str, float, Dict[str, str]]:
    """Evaluates data confidence from a DistrictStatus dictionary and returns freshness summary."""
    rf_freshness = district_status.get("rainfall_freshness") or "FRESH"
    hydro = district_status.get("hydrological_summary") or {}
    hydro_freshness = hydro.get("freshness") or ("FRESH" if coverage["signals"]["hydrology"] else "UNAVAILABLE")
    citizen_count = district_status.get("citizen_reports_count", 0)

    level, score = calculate_data_confidence(
        coverage=coverage,
        rf_freshness=rf_freshness,
        hydro_freshness=hydro_freshness,
        citizen_count=citizen_count
    )

    freshness_summary = {
        "rainfall": rf_freshness,
        "hydrology": hydro_freshness,
        "citizen": "FRESH" if citizen_count > 0 else "BASELINE",
        "flood_history": "STATIC_INDEX",
        "drainage_vulnerability": "STATIC_INDEX",
    }

    return level, score, freshness_summary


# -------------------------------------------------------------
# 3. DETERMINISTIC RISK DRIVERS EXTRACTION
# -------------------------------------------------------------

def rank_risk_drivers(
    composite_risk: float,
    rainfall_24h: float,
    rainfall_3h: float,
    contributions: Dict[str, float],
    hydro_status: str = "NORMAL",
    hydro_trend: str = "STABLE",
    primary_water_body: Optional[str] = None,
    citizen_high_sev: int = 0,
    citizen_total: int = 0,
    flood_history_score: float = 50.0,
    drainage_vulnerability_score: float = 50.0
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Ranks risk factors into PRIMARY and SUPPORTING categories with traceable evidence strings.
    """
    primary: List[Dict[str, Any]] = []
    supporting: List[Dict[str, Any]] = []

    # 1. Rainfall Signal
    rf_pts = contributions.get("rainfall", 0.0)
    if rainfall_24h >= 65.0 or rf_pts >= 20.0:
        primary.append({
            "source": "TSDPS Automated Telemetry",
            "signal": "Heavy Precipitation (24h Accumulation & Burst)",
            "importance": "PRIMARY",
            "evidence": f"Heavy rainfall recorded: {rainfall_24h} mm in 24h ({rainfall_3h} mm/3h burst), contributing {rf_pts:.1f} pts to composite risk.",
            "value": rainfall_24h,
            "contribution_pts": rf_pts,
        })
    elif rainfall_24h >= 15.0 or rf_pts >= 8.0:
        supporting.append({
            "source": "TSDPS Telemetry",
            "signal": "Moderate Precipitation",
            "importance": "SUPPORTING",
            "evidence": f"Moderate rainfall accumulation: {rainfall_24h} mm in 24h ({rf_pts:.1f} pts contribution).",
            "value": rainfall_24h,
            "contribution_pts": rf_pts,
        })

    # 2. Hydrological River/Dam Signal
    wb_name = primary_water_body or "Regional Basin Catchment"
    if hydro_status in ["CRITICAL", "DANGER"]:
        primary.append({
            "source": "CWC / I&CAD Telemetry",
            "signal": "River Stage Threshold Alert (Danger Breach)",
            "importance": "PRIMARY",
            "evidence": f"Critical danger stage breach on {wb_name} with trend '{hydro_trend}'.",
            "status": hydro_status,
            "trend": hydro_trend,
        })
    elif hydro_status == "WARNING":
        primary.append({
            "source": "CWC / I&CAD Telemetry",
            "signal": "River Stage Warning Alert (Rising Discharge)",
            "importance": "PRIMARY",
            "evidence": f"Warning level threshold reached on {wb_name} (trend: '{hydro_trend}').",
            "status": hydro_status,
            "trend": hydro_trend,
        })
    elif hydro_status == "WATCH" and hydro_trend == "RISING":
        primary.append({
            "source": "CWC / I&CAD Telemetry",
            "signal": "River Stage Upward Trend Alert",
            "importance": "PRIMARY",
            "evidence": f"River gauge watch stage with active rising trend on {wb_name}.",
            "status": hydro_status,
            "trend": hydro_trend,
        })
    elif hydro_status == "WATCH":
        supporting.append({
            "source": "CWC / I&CAD Telemetry",
            "signal": "River Watch Level Observed",
            "importance": "SUPPORTING",
            "evidence": f"Water stage within watch boundaries on {wb_name} (trend: '{hydro_trend}').",
            "status": hydro_status,
            "trend": hydro_trend,
        })

    # 3. Citizen Ground Intelligence Signal
    cit_pts = contributions.get("citizen_reports", 0.0)
    if citizen_high_sev >= 2 or cit_pts >= 10.0:
        primary.append({
            "source": "NeerDrishti Citizen Ledger",
            "signal": "Active Field Flooding & Hazard Reports",
            "importance": "PRIMARY",
            "evidence": f"{citizen_total} verified ground reports with {citizen_high_sev} severe/critical inundation alerts ({cit_pts:.1f} pts).",
            "reports_count": citizen_total,
            "high_severity": citizen_high_sev,
            "contribution_pts": cit_pts,
        })
    elif citizen_total >= 1:
        supporting.append({
            "source": "NeerDrishti Citizen Ledger",
            "signal": "Ground Hazard Observations",
            "importance": "SUPPORTING",
            "evidence": f"{citizen_total} field report(s) logged in district ({cit_pts:.1f} pts).",
            "reports_count": citizen_total,
            "contribution_pts": cit_pts,
        })

    # 4. Drainage Bottleneck Signal
    drain_pts = contributions.get("drainage_vulnerability", 0.0)
    if drainage_vulnerability_score >= 75.0 and (composite_risk >= 45.0 or drain_pts >= 7.0):
        primary.append({
            "source": "Telangana Spatial Matrix",
            "signal": "Stormwater Bottleneck & Nala Vulnerability",
            "importance": "PRIMARY",
            "evidence": f"Severe urban stormwater and nala discharge vulnerability (score: {drainage_vulnerability_score:.0f}/100, {drain_pts:.1f} pts).",
            "score": drainage_vulnerability_score,
            "contribution_pts": drain_pts,
        })
    elif drainage_vulnerability_score >= 50.0:
        supporting.append({
            "source": "Telangana Spatial Matrix",
            "signal": "Drainage Infrastructure Vulnerability",
            "importance": "SUPPORTING",
            "evidence": f"Moderate stormwater drainage vulnerability (score: {drainage_vulnerability_score:.0f}/100).",
            "score": drainage_vulnerability_score,
        })

    # 5. Historical Flood Susceptibility
    hist_pts = contributions.get("flood_history", 0.0)
    if flood_history_score >= 75.0 and (composite_risk >= 45.0 or hist_pts >= 18.0):
        primary.append({
            "source": "Telangana Historical Registry",
            "signal": "High Historical Inundation Frequency",
            "importance": "PRIMARY",
            "evidence": f"High baseline historical flood recurrence in micro-catchments (score: {flood_history_score:.0f}/100, {hist_pts:.1f} pts).",
            "score": flood_history_score,
            "contribution_pts": hist_pts,
        })
    elif flood_history_score >= 50.0:
        supporting.append({
            "source": "Telangana Historical Registry",
            "signal": "Historical Flood Susceptibility",
            "importance": "SUPPORTING",
            "evidence": f"Moderate historical flood recurrence index (score: {flood_history_score:.0f}/100).",
            "score": flood_history_score,
        })

    return primary, supporting


def extract_risk_drivers(district_status: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Helper wrapping rank_risk_drivers for unified DistrictStatus."""
    hydro = district_status.get("hydrological_summary") or {}
    return rank_risk_drivers(
        composite_risk=district_status.get("flood_risk_score", 0.0),
        rainfall_24h=district_status.get("rainfall_mm_24h", 0.0),
        rainfall_3h=district_status.get("rainfall_mm_3h", 0.0),
        contributions=district_status.get("contributions", {}),
        hydro_status=hydro.get("dominant_status", "NORMAL"),
        hydro_trend=hydro.get("dominant_trend", "STABLE"),
        primary_water_body=hydro.get("primary_water_body"),
        citizen_high_sev=district_status.get("citizen_reports_high_severity", 0) + district_status.get("citizen_reports_critical", 0),
        citizen_total=district_status.get("citizen_reports_count", 0),
        flood_history_score=district_status.get("flood_history_score", 50.0),
        drainage_vulnerability_score=district_status.get("drainage_vulnerability_score", 50.0)
    )


# -------------------------------------------------------------
# 4. OPERATIONAL SITUATION CLASSIFICATION
# -------------------------------------------------------------

def classify_operational_situation(
    composite_risk: float = 0.0,
    rainfall_24h: float = 0.0,
    hydro_status: str = "NORMAL",
    hydro_trend: str = "STABLE",
    citizen_high_sev: int = 0,
    citizen_total: int = 0,
    anomalies: Optional[List[Any]] = None,
    **kwargs
) -> str:
    """
    Deterministically classifies district operational situation:
    - CRITICAL_INFORMATIONAL
    - HIGH_CONCERN
    - ELEVATED_ATTENTION
    - MONITORING
    - NORMAL
    """
    # Accept district_status as first arg or kwargs for compatibility
    if isinstance(composite_risk, dict):
        d = composite_risk
        hydro = d.get("hydrological_summary") or {}
        return classify_operational_situation(
            composite_risk=d.get("flood_risk_score", 0.0),
            rainfall_24h=d.get("rainfall_mm_24h", 0.0),
            hydro_status=hydro.get("dominant_status", "NORMAL"),
            hydro_trend=hydro.get("dominant_trend", "STABLE"),
            citizen_high_sev=d.get("citizen_reports_high_severity", 0) + d.get("citizen_reports_critical", 0),
            citizen_total=d.get("citizen_reports_count", 0),
            anomalies=hydro.get("anomalies") or []
        )

    # 1. CRITICAL_INFORMATIONAL
    if (
        composite_risk >= 75.0 or
        (hydro_status in ["CRITICAL", "DANGER"] and rainfall_24h >= 45.0) or
        (hydro_status == "WARNING" and citizen_high_sev >= 3 and rainfall_24h >= 45.0)
    ):
        return "CRITICAL_INFORMATIONAL"

    # 2. HIGH_CONCERN
    if (
        composite_risk >= 50.0 or
        hydro_status in ["CRITICAL", "DANGER"] or
        hydro_status == "WARNING" or
        (hydro_status == "WATCH" and hydro_trend == "RISING" and rainfall_24h >= 35.0) or
        (rainfall_24h >= 65.0 and citizen_high_sev >= 1) or
        (citizen_high_sev >= 2 and rainfall_24h >= 30.0)
    ):
        return "HIGH_CONCERN"

    # 3. ELEVATED_ATTENTION
    if (
        composite_risk >= 35.0 or
        hydro_status == "WATCH" or
        hydro_trend == "RISING" or
        rainfall_24h >= 30.0 or
        citizen_high_sev >= 1 or
        citizen_total >= 3
    ):
        return "ELEVATED_ATTENTION"

    # 4. MONITORING
    if (
        composite_risk >= 20.0 or
        rainfall_24h >= 15.0 or
        citizen_total >= 1
    ):
        return "MONITORING"

    # 5. NORMAL
    return "NORMAL"


# -------------------------------------------------------------
# 5. RECOMMENDED ACTIONS (SAFETY COMPLIANT)
# -------------------------------------------------------------

def generate_recommended_actions(
    situation: str,
    primary_drivers: Optional[List[Dict[str, Any]]] = None,
    **kwargs
) -> List[str]:
    """Generates non-warning, explainable monitoring and decision-support guidance."""
    if situation == "CRITICAL_INFORMATIONAL":
        return [
            "Highlight strong multi-signal convergence across river gauge telemetry, rainfall bursts, and ground reports.",
            "Prioritize continuous surveillance of critical stormwater nala choke points and low-lying habitats.",
            "Maintain active situational telemetry awareness across municipal and district disaster management desks (Decision Support Only).",
            "Coordinate field verification with State Disaster Management Authority (TGDMA) official directives.",
        ]
    elif situation == "HIGH_CONCERN":
        return [
            "Prioritize immediate field review of verified high-severity citizen inundation alerts.",
            "Monitor river stage telemetry and upstream barrage discharge advisories closely.",
            "Review urban stormwater drainage outflow bottlenecks in designated flood hotspots.",
            "Increase situational update review cadence to every 30-60 minutes.",
        ]
    elif situation == "ELEVATED_ATTENTION":
        return [
            "Increase telemetry surveillance cadence for 3-hour rainfall accumulation spikes.",
            "Review incoming citizen ground reports and cross-verify with localized rainfall intensity.",
            "Inspect key stormwater drainage culverts, low-lying underpasses, and vulnerable road corridors.",
        ]
    elif situation == "MONITORING":
        return [
            "Continue routine meteorological and hydrological surveillance.",
            "Track 24-hour cumulative rainfall trends across all district mandals.",
        ]
    else:  # NORMAL
        return [
            "Maintain standard baseline monitoring.",
            "Verify telemetry station communication readiness and reporting health.",
        ]


# -------------------------------------------------------------
# 6. DATA LIMITATIONS & ANOMALIES
# -------------------------------------------------------------

def generate_data_limitations(
    rf_mode: str,
    rf_freshness: str,
    hydro_avail: bool,
    hydro_freshness: str,
    citizen_count: int
) -> List[str]:
    """Generates transparent notices about data limitations."""
    limitations: List[str] = []

    if rf_mode == "SIMULATED":
        limitations.append("Rainfall input is driven by calibrated scenario simulation; live automated weather station feed is pending direct telemetry integration.")
    elif rf_freshness in ["STALE", "EXPIRED"]:
        limitations.append(f"Rainfall telemetry is {rf_freshness.lower()} - real-time flash cloudbursts may not be fully represented.")

    if not hydro_avail:
        limitations.append("No direct hydrological river gauge telemetry reporting in this immediate district boundary; estimates rely on regional basin modeling.")
    elif hydro_freshness in ["STALE", "EXPIRED"]:
        limitations.append(f"Hydrological water stage telemetry is {hydro_freshness.lower()} (>24h since latest observation transmission).")

    if citizen_count == 0:
        limitations.append("Zero active citizen ground reports logged for this district in the current observation window.")

    return limitations


def extract_data_limitations(district_status: Dict[str, Any], coverage: Dict[str, Any]) -> List[str]:
    rf_mode = district_status.get("rainfall_data_mode") or ("SIMULATED" if district_status.get("is_simulated") else "LIVE")
    rf_freshness = district_status.get("rainfall_freshness") or "FRESH"
    hydro = district_status.get("hydrological_summary") or {}
    hydro_freshness = hydro.get("freshness") or "FRESH"
    citizen_count = district_status.get("citizen_reports_count", 0)

    limits = generate_data_limitations(
        rf_mode=rf_mode,
        rf_freshness=rf_freshness,
        hydro_avail=coverage["signals"]["hydrology"],
        hydro_freshness=hydro_freshness,
        citizen_count=citizen_count
    )

    if district_status.get("monitoring_category") == "Limited Data":
        limits.append("District categorized under Limited Data - vulnerability metrics reflect regional synoptic averages.")

    return limits


def extract_recent_anomalies(district_status: Dict[str, Any]) -> List[Dict[str, Any]]:
    anomalies: List[Dict[str, Any]] = []
    hydro = district_status.get("hydrological_summary")
    if hydro and hydro.get("has_anomaly") and hydro.get("anomaly_desc"):
        anomalies.append({
            "type": "HYDROLOGICAL_ANOMALY",
            "description": hydro.get("anomaly_desc"),
            "severity": "HIGH",
            "water_body": hydro.get("primary_water_body"),
        })
    return anomalies


def describe_rainfall_condition(rf24: float, rf3: float, score: float) -> str:
    if rf24 >= 115.5 or score >= 80.0:
        return f"Very Heavy Rainfall ({rf24} mm / 24h, {rf3} mm / 3h)"
    elif rf24 >= 64.5 or score >= 60.0:
        return f"Heavy Rainfall ({rf24} mm / 24h, {rf3} mm / 3h)"
    elif rf24 >= 15.5 or score >= 30.0:
        return f"Moderate Rainfall ({rf24} mm / 24h)"
    elif rf24 > 0:
        return f"Light Rainfall ({rf24} mm / 24h)"
    return "Dry / No Precipitation"


# -------------------------------------------------------------
# 7. DISTRICT SITUATION SYNTHESIS
# -------------------------------------------------------------

def fuse_district_situation(
    district_id: str,
    district_name: str,
    composite_risk_score: float,
    composite_risk_level: str,
    rainfall_24h: float,
    rainfall_3h: float,
    rainfall_source: str,
    rainfall_data_mode: str,
    rainfall_freshness: str,
    rainfall_confidence: float,
    contributions: Dict[str, float],
    hydrology_summary: Optional[Dict[str, Any]],
    citizen_reports_count: int,
    citizen_high_sev: int,
    citizen_critical: int,
    citizen_score: float,
    citizen_trend: str,
    flood_history_score: float,
    drainage_vulnerability_score: float
) -> Dict[str, Any]:
    """Fuses all multi-signal telemetry parameters into a structured situation object."""
    coverage = calculate_signal_coverage(
        rainfall_data={"rainfall_24h": rainfall_24h, "data_mode": rainfall_data_mode},
        hydrology_data=hydrology_summary,
        citizen_data={"total_reports": citizen_reports_count, "score": citizen_score},
        has_history=True,
        has_drainage=True
    )

    hydro_freshness = hydrology_summary.get("freshness") if hydrology_summary else "UNAVAILABLE"
    data_confidence, data_confidence_score = calculate_data_confidence(
        coverage=coverage,
        rf_freshness=rainfall_freshness,
        hydro_freshness=hydro_freshness or "UNAVAILABLE",
        citizen_count=citizen_reports_count
    )

    primary_drivers, supporting_signals = rank_risk_drivers(
        composite_risk=composite_risk_score,
        rainfall_24h=rainfall_24h,
        rainfall_3h=rainfall_3h,
        contributions=contributions,
        hydro_status=hydrology_summary.get("dominant_status", "NORMAL") if hydrology_summary else "NORMAL",
        hydro_trend=hydrology_summary.get("dominant_trend", "STABLE") if hydrology_summary else "STABLE",
        primary_water_body=hydrology_summary.get("primary_water_body") if hydrology_summary else None,
        citizen_high_sev=citizen_high_sev + citizen_critical,
        citizen_total=citizen_reports_count,
        flood_history_score=flood_history_score,
        drainage_vulnerability_score=drainage_vulnerability_score
    )

    operational_situation = classify_operational_situation(
        composite_risk=composite_risk_score,
        rainfall_24h=rainfall_24h,
        hydro_status=hydrology_summary.get("dominant_status", "NORMAL") if hydrology_summary else "NORMAL",
        hydro_trend=hydrology_summary.get("dominant_trend", "STABLE") if hydrology_summary else "STABLE",
        citizen_high_sev=citizen_high_sev + citizen_critical,
        citizen_total=citizen_reports_count,
        anomalies=hydrology_summary.get("anomalies") if hydrology_summary else []
    )

    recommended_actions = generate_recommended_actions(
        situation=operational_situation,
        primary_drivers=primary_drivers
    )

    data_limitations = generate_data_limitations(
        rf_mode=rainfall_data_mode,
        rf_freshness=rainfall_freshness,
        hydro_avail=coverage["signals"]["hydrology"],
        hydro_freshness=hydro_freshness or "UNAVAILABLE",
        citizen_count=citizen_reports_count
    )

    freshness_summary = {
        "rainfall": rainfall_freshness,
        "hydrology": hydro_freshness or "UNAVAILABLE",
        "citizen": "FRESH" if citizen_reports_count > 0 else "BASELINE",
        "flood_history": "STATIC_INDEX",
        "drainage_vulnerability": "STATIC_INDEX",
    }

    recent_anomalies = []
    if hydrology_summary and hydrology_summary.get("has_anomaly") and hydrology_summary.get("anomaly_desc"):
        recent_anomalies.append({
            "type": "HYDROLOGICAL_ANOMALY",
            "description": hydrology_summary.get("anomaly_desc"),
            "severity": "HIGH",
            "water_body": hydrology_summary.get("primary_water_body"),
        })

    return {
        "districtId": district_id,
        "districtName": district_name,
        "compositeRiskScore": composite_risk_score,
        "compositeRiskLevel": composite_risk_level,
        "operationalSituation": operational_situation,
        "dataConfidence": data_confidence,
        "dataConfidenceScore": data_confidence_score,
        "signalCoverage": coverage,
        "freshnessSummary": freshness_summary,
        "rainfallSummary": {
            "condition": describe_rainfall_condition(rainfall_24h, rainfall_3h, contributions.get("rainfall", 0.0) / 0.35 if contributions.get("rainfall") else 0.0),
            "value_24h": rainfall_24h,
            "value_3h": rainfall_3h,
            "score": round(contributions.get("rainfall", 0.0) / 0.35, 1) if contributions.get("rainfall") else 0.0,
            "dataMode": rainfall_data_mode,
            "freshness": rainfall_freshness,
            "source": rainfall_source,
        },
        "hydrologySummary": {
            "primaryWaterBody": hydrology_summary.get("primary_water_body") if hydrology_summary else None,
            "waterBodyType": hydrology_summary.get("water_body_type") if hydrology_summary else None,
            "latestValue": hydrology_summary.get("latest_value") if hydrology_summary else None,
            "unit": hydrology_summary.get("unit", "m") if hydrology_summary else "m",
            "dominantStatus": hydrology_summary.get("dominant_status", "UNKNOWN") if hydrology_summary else "UNKNOWN",
            "dominantTrend": hydrology_summary.get("dominant_trend", "STABLE") if hydrology_summary else "STABLE",
            "dataMode": hydrology_summary.get("data_mode", "SIMULATED") if hydrology_summary else "SIMULATED",
            "freshness": hydrology_summary.get("freshness", "FRESH") if hydrology_summary else "UNAVAILABLE",
            "source": hydrology_summary.get("source_name") or (hydrology_summary.get("source_attribution") if hydrology_summary else None),
            "hasAnomaly": hydrology_summary.get("has_anomaly", False) if hydrology_summary else False,
            "anomalyDesc": hydrology_summary.get("anomaly_desc") if hydrology_summary else None,
        } if hydrology_summary else None,
        "citizenSummary": {
            "totalReports": citizen_reports_count,
            "highSeverityReports": citizen_high_sev,
            "criticalReports": citizen_critical,
            "trend": citizen_trend,
            "score": citizen_score,
        },
        "primaryDrivers": primary_drivers,
        "supportingSignals": supporting_signals,
        "dataLimitations": data_limitations,
        "recentAnomalies": recent_anomalies,
        "recommendedActions": recommended_actions,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }


def synthesize_district_situation(district_status: Dict[str, Any]) -> Dict[str, Any]:
    """Synthesizes comprehensive multi-signal situation intelligence from a DistrictStatus dict."""
    norm = normalize_district(district_status.get("district_id") or district_status.get("district", ""))
    district_id = norm["district_id"] if norm["resolved"] else (district_status.get("district_id") or district_status.get("district", "").lower().replace(" ", "_"))
    district_name = district_status.get("district", "")
    composite_risk_score = district_status.get("flood_risk_score", 0.0)
    composite_risk_level = district_status.get("risk_category", "LOW")

    return fuse_district_situation(
        district_id=district_id,
        district_name=district_name,
        composite_risk_score=composite_risk_score,
        composite_risk_level=composite_risk_level,
        rainfall_24h=district_status.get("rainfall_mm_24h", 0.0),
        rainfall_3h=district_status.get("rainfall_mm_3h", 0.0),
        rainfall_source=district_status.get("rainfall_source") or "TSDPS / IMD Telemetry",
        rainfall_data_mode=district_status.get("rainfall_data_mode") or ("SIMULATED" if district_status.get("is_simulated") else "LIVE"),
        rainfall_freshness=district_status.get("rainfall_freshness") or "FRESH",
        rainfall_confidence=district_status.get("rainfall_confidence", 0.85),
        contributions=district_status.get("contributions", {}),
        hydrology_summary=district_status.get("hydrological_summary"),
        citizen_reports_count=district_status.get("citizen_reports_count", 0),
        citizen_high_sev=district_status.get("citizen_reports_high_severity", 0),
        citizen_critical=district_status.get("citizen_reports_critical", 0),
        citizen_score=district_status.get("citizen_report_score", 0.0),
        citizen_trend=district_status.get("citizen_reports_trend", "Stable"),
        flood_history_score=district_status.get("flood_history_score", 50.0),
        drainage_vulnerability_score=district_status.get("drainage_vulnerability_score", 50.0)
    )


def get_district_situation_by_id(
    district_id_or_name: str,
    scenario_name: str = "Heavy Rainfall"
) -> Optional[Dict[str, Any]]:
    """Retrieves full situation intelligence for a single district."""
    processor = DataProcessor()
    scenario_config = SIMULATION_SCENARIOS.get(scenario_name, SIMULATION_SCENARIOS["Heavy Rainfall"])
    rainfall_override = scenario_config.get("rainfall_multipliers", {})

    status_list = processor.get_district_status_list(rainfall_override)
    norm = normalize_district(district_id_or_name)
    target_id = norm["district_id"] if norm["resolved"] else district_id_or_name.lower().replace(" ", "_")

    for status in status_list:
        if (
            status.get("district_id", "").lower() == target_id or
            status.get("district", "").lower() == district_id_or_name.lower()
        ):
            # Attach hydrological summary
            status["hydrological_summary"] = get_district_hydrological_summary(target_id, scenario_name)
            return synthesize_district_situation(status)

    return None


def get_all_districts_situations(
    scenario_name: str = "Heavy Rainfall"
) -> Dict[str, Dict[str, Any]]:
    """Retrieves situation intelligence for all 33 Telangana districts."""
    processor = DataProcessor()
    scenario_config = SIMULATION_SCENARIOS.get(scenario_name, SIMULATION_SCENARIOS["Heavy Rainfall"])
    rainfall_override = scenario_config.get("rainfall_multipliers", {})

    status_list = processor.get_district_status_list(rainfall_override)
    hydro_summaries = get_all_districts_hydrological_summaries(scenario_name)

    results: Dict[str, Dict[str, Any]] = {}
    for status in status_list:
        d_id = status.get("district_id", status.get("district", "").lower().replace(" ", "_"))
        status["hydrological_summary"] = hydro_summaries.get(d_id)
        situation = synthesize_district_situation(status)
        results[d_id] = situation

    return results


def explain_district_situation(
    district_id_or_name: str,
    scenario_name: str = "Heavy Rainfall"
) -> Optional[Dict[str, Any]]:
    """Returns an explainable breakdown for decision-makers."""
    situation = get_district_situation_by_id(district_id_or_name, scenario_name)
    if not situation:
        return None

    primary_text = "; ".join([d["evidence"] for d in situation["primaryDrivers"]]) if situation["primaryDrivers"] else "Baseline conditions."

    return {
        "districtId": situation["districtId"],
        "districtName": situation["districtName"],
        "compositeRiskScore": situation["compositeRiskScore"],
        "compositeRiskLevel": situation["compositeRiskLevel"],
        "operationalSituation": situation["operationalSituation"],
        "dataConfidence": situation["dataConfidence"],
        "dataConfidenceScore": situation["dataConfidenceScore"],
        "signalCoverage": situation["signalCoverage"],
        "freshnessSummary": situation["freshnessSummary"],
        "primaryDrivers": situation["primaryDrivers"],
        "supportingSignals": situation["supportingSignals"],
        "dataLimitations": situation["dataLimitations"],
        "recentAnomalies": situation["recentAnomalies"],
        "recommendedActions": situation["recommendedActions"],
        "explanation": (
            f"District {situation['districtName']} is classified under {situation['operationalSituation'].replace('_', ' ')} "
            f"with a 5-factor composite flood risk score of {situation['compositeRiskScore']}/100 ({situation['compositeRiskLevel']}). "
            f"Signal coverage is {situation['signalCoverage']['available']}/{situation['signalCoverage']['total']} "
            f"with {situation['dataConfidence']} confidence ({int(situation['dataConfidenceScore'] * 100)}%). "
            f"Key driving factors include: {primary_text}"
        ),
        "generatedAt": situation["generatedAt"],
    }
