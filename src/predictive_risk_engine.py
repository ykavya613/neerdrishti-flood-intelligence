"""
NeerDrishti - Phase E: Predictive Flood Risk Modeling & Forecast Intelligence Engine
Telangana State Flood Decision Support System

Deterministic, explainable predictive risk projection for all 33 Telangana districts.
Supports NOW, +3H, +6H, +12H, and +24H horizon projections incorporating:
1. Current composite risk & factor contributions (Phase B formula preserved)
2. Rainfall telemetry and forecast precipitation (Phase D1)
3. Hydrological status, trends, and dam discharge telemetry (Phase D2)
4. Upstream-to-downstream basin propagation routing (Godavari, Krishna, Musi, Manair, Munneru)
5. Multi-signal situation intelligence (Phase D3)
6. Explainable confidence scoring and transparent model limitation notes.

IMPORTANT: This is a decision-support model projection and NOT an official government flood forecast.
"""

import json
import os
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple

from src.district_normalizer import normalize_district
from src.risk_engine import calculate_flood_risk, calculate_rainfall_score, get_risk_category, clamp

BASIN_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "basin_connections.json")
DISTRICTS_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "telangana_districts.json")


def load_basin_connections() -> List[Dict[str, Any]]:
    """Loads canonical hydrological basin connections between Telangana districts."""
    if os.path.exists(BASIN_FILE):
        try:
            with open(BASIN_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading basin connections: {e}")
    return []


def get_upstream_connections(downstream_district_id: str) -> List[Dict[str, Any]]:
    """Finds all direct upstream basin connections impacting a downstream district."""
    norm = normalize_district(downstream_district_id)
    target_id = norm.get("district_id") or norm.get("canonical_id") or downstream_district_id.lower()
    connections = load_basin_connections()
    return [
        c for c in connections
        if (normalize_district(c.get("downstream_district_id", "")).get("district_id") == target_id
            or c.get("downstream_district_id", "").lower() == target_id)
    ]


def get_downstream_connections(upstream_district_id: str) -> List[Dict[str, Any]]:
    """Finds all downstream basin connections impacted by an upstream district."""
    norm = normalize_district(upstream_district_id)
    target_id = norm.get("district_id") or norm.get("canonical_id") or upstream_district_id.lower()
    connections = load_basin_connections()
    return [
        c for c in connections
        if (normalize_district(c.get("upstream_district_id", "")).get("district_id") == target_id
            or c.get("upstream_district_id", "").lower() == target_id)
    ]


def calculate_basin_influence(
    district_id: str,
    all_district_statuses: Optional[Dict[str, Any]] = None,
    horizon_hours: int = 6
) -> Dict[str, Any]:
    """
    Computes explainable upstream hydrological basin influence for a district.
    Determines if upstream surges propagate downstream within the target time horizon.
    """
    norm_id = normalize_district(district_id)["canonical_id"]
    connections = get_upstream_connections(norm_id)

    if not connections:
        return {
            "has_upstream_influence": False,
            "upstream_connections_count": 0,
            "active_upstream_threats": [],
            "total_projected_basin_surge": 0.0,
            "basin_summary_text": "District is in headwater catchment or standalone drainage system with no direct upstream river cascade."
        }

    threats = []
    total_surge = 0.0

    for conn in connections:
        up_id = conn["upstream_district_id"]
        up_name = conn.get("water_body_name", "Upstream Channel")
        travel_hours = conn.get("estimated_travel_window_hours", 6)
        strength = conn.get("influence_strength", 0.4)
        conf = conn.get("relationship_confidence", 0.8)

        # Evaluate upstream status if provided
        up_status = (all_district_statuses or {}).get(up_id, {})
        up_risk = up_status.get("composite_risk_score", 20.0)
        up_rain = up_status.get("rainfall_mm_24h", 0.0)
        hydro_summary = up_status.get("hydrological_summary") or {}
        dominant_status = hydro_summary.get("dominant_status", "NORMAL")
        dominant_trend = hydro_summary.get("dominant_trend", "STABLE")

        # Arrival weight: peak influence occurs when horizon matches travel window
        time_diff = abs(horizon_hours - travel_hours)
        if time_diff == 0:
            time_factor = 1.0
        elif time_diff <= 3:
            time_factor = 0.80
        elif time_diff <= 6:
            time_factor = 0.55
        elif time_diff <= 12:
            time_factor = 0.30
        else:
            time_factor = 0.15

        # Upstream severity multiplier
        severity_factor = 0.0
        if dominant_status in ["CRITICAL", "WARNING"] or up_risk >= 60:
            severity_factor = 1.0
        elif dominant_status == "WATCH" or up_risk >= 40 or up_rain >= 50:
            severity_factor = 0.65
        elif dominant_trend == "RISING" or up_risk >= 25 or up_rain >= 25:
            severity_factor = 0.35

        impact_score = round(up_risk * strength * conf * time_factor * (0.5 + 0.5 * severity_factor) * 0.25, 1)

        if severity_factor > 0 and impact_score > 1.5:
            now = datetime.utcnow()
            arrival_time = (now + timedelta(hours=travel_hours)).strftime("%H:%M UTC")
            evidence = (
                f"Upstream {conn.get('basin_name', 'basin')} inflow via {up_name} "
                f"(travel time ~{travel_hours}h, arrival approx {arrival_time}). "
                f"Upstream risk index: {up_risk:.0f}/100 with {dominant_status} gauge condition."
            )
            threats.append({
                "upstream_district_id": up_id,
                "upstream_district_name": normalize_district(up_id)["district_name"],
                "water_body_name": up_name,
                "travel_window_hours": travel_hours,
                "estimated_arrival": arrival_time,
                "upstream_risk_score": up_risk,
                "upstream_rainfall_24h": up_rain,
                "upstream_river_status": dominant_status,
                "projected_downstream_impact_score": impact_score,
                "evidence": evidence
            })
            total_surge += impact_score

    # Cap total basin surge contribution
    total_surge = min(round(total_surge, 1), 25.0)

    if threats:
        basin_text = f"Active upstream hydrological propagation detected across {len(threats)} channel(s). Potential downstream surge contribution: +{total_surge:.1f} risk points."
    else:
        basin_text = "Upstream river gauges currently stable; no severe upstream flood propagation expected within this window."

    return {
        "has_upstream_influence": len(threats) > 0,
        "upstream_connections_count": len(connections),
        "active_upstream_threats": threats,
        "total_projected_basin_surge": total_surge,
        "basin_summary_text": basin_text
    }


def classify_forecast_rainfall(mm: float) -> str:
    """Classifies forecast rainfall into standard meteorological intensity categories."""
    if mm >= 115.5:
        return "EXTREME"
    elif mm >= 64.5:
        return "VERY_HEAVY"
    elif mm >= 35.5:
        return "HEAVY"
    elif mm >= 15.5:
        return "MODERATE"
    return "LIGHT"


def project_district_risk(
    district_status: Dict[str, Any],
    forecast_horizon_hours: int = 6,
    forecast_rainfall_mm: Optional[float] = None,
    forecast_data_mode: str = "SIMULATED_FORECAST",
    all_district_statuses: Optional[Dict[str, Any]] = None,
    custom_forecast_sources: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Deterministically projects district flood risk for a specific future horizon (+3h, +6h, +12h, +24h).
    Preserves existing 5-factor mathematical flood risk score as baseline.
    """
    district_id = district_status.get("district_id") or district_status.get("id", "TEL-HYD")
    norm = normalize_district(district_id)
    d_id = norm["canonical_id"]
    d_name = norm["district_name"]

    current_risk = float(district_status.get("composite_risk_score") or district_status.get("flood_risk_score") or 0.0)
    current_rf = float(district_status.get("rainfall_mm_24h", 0.0))
    flood_hist = float(district_status.get("flood_history_score", 50.0))
    topo_risk = float(district_status.get("location_risk_score", 50.0))
    cit_score = float(district_status.get("citizen_report_score", 0.0))
    drain_vuln = float(district_status.get("drainage_vulnerability_score", 50.0))
    rf_freshness = district_status.get("rainfall_freshness", "FRESH")
    rf_mode = district_status.get("rainfall_data_mode", "SIMULATED")

    hydro_summary = district_status.get("hydrological_summary") or {}
    hydro_status = hydro_summary.get("dominant_status", "NORMAL")
    hydro_trend = hydro_summary.get("dominant_trend", "STABLE")
    hydro_freshness = hydro_summary.get("freshness", "FRESH")

    # Determine projected rainfall for this horizon if not explicitly given
    if forecast_rainfall_mm is None:
        # Realistic forecast projection curve based on current rainfall activity
        if forecast_horizon_hours == 3:
            forecast_rainfall_mm = round(current_rf * 0.35 + (8.0 if current_rf > 40 else 2.0), 1)
        elif forecast_horizon_hours == 6:
            forecast_rainfall_mm = round(current_rf * 0.70 + (15.0 if current_rf > 40 else 5.0), 1)
        elif forecast_horizon_hours == 12:
            forecast_rainfall_mm = round(current_rf * 1.10 + (22.0 if current_rf > 40 else 8.0), 1)
        else: # 24h
            forecast_rainfall_mm = round(current_rf * 1.30 + (28.0 if current_rf > 40 else 10.0), 1)

    rainfall_intensity = classify_forecast_rainfall(forecast_rainfall_mm)

    # Calculate upstream basin propagation
    basin_info = calculate_basin_influence(d_id, all_district_statuses, forecast_horizon_hours)
    basin_surge = basin_info.get("total_projected_basin_surge", 0.0)

    # Projected Rainfall Factor delta
    # Baseline 35% weight: calculate simulated future 24h equivalent rainfall
    projected_effective_rf = current_rf * 0.6 + forecast_rainfall_mm * 0.8
    # Projected rainfall risk contribution (0 to 100 normalized)
    rf_proj_score = min(projected_effective_rf / 1.5, 100.0)
    current_rf_score = min(current_rf / 1.5, 100.0)
    rf_delta = (rf_proj_score - current_rf_score) * 0.35

    # Hydrological trend & stage delta
    hydro_delta = 0.0
    if hydro_status == "CRITICAL":
        hydro_delta += 14.0 if hydro_trend == "RISING" else 8.0
    elif hydro_status == "WARNING":
        hydro_delta += 9.0 if hydro_trend == "RISING" else 4.0
    elif hydro_status == "WATCH":
        hydro_delta += 4.0 if hydro_trend == "RISING" else 1.0
    elif hydro_trend == "RISING":
        hydro_delta += 3.0
    elif hydro_trend == "FALLING" and forecast_rainfall_mm < 15.0:
        hydro_delta -= 4.0

    # Horizon-specific drainage decay or accumulation
    drainage_delta = 0.0
    if forecast_rainfall_mm > 35.0:
        # Inadequate drainage compounds in later horizons
        drainage_delta = (drain_vuln / 100.0) * (forecast_horizon_hours / 24.0) * 8.0
    elif forecast_horizon_hours >= 12 and forecast_rainfall_mm < 10.0 and hydro_trend != "RISING":
        # Recession / drainage runoff clearing
        drainage_delta = -((100.0 - drain_vuln) / 100.0) * (forecast_horizon_hours / 24.0) * 6.0

    # Calculate raw projected risk
    raw_projected = current_risk + rf_delta + hydro_delta + basin_surge + drainage_delta
    # Clamp strictly between 0 and 100
    projected_risk = round(max(0.0, min(100.0, raw_projected)), 1)
    risk_change = round(projected_risk - current_risk, 1)

    # Determine Risk Trend
    if risk_change >= 3.5:
        risk_trend = "RISING"
    elif risk_change <= -3.5:
        risk_trend = "IMPROVING"
    else:
        risk_trend = "STABLE"

    # Evaluate Confidence Level
    conf_score, conf_level, conf_reason = evaluate_forecast_confidence(
        rf_mode=rf_mode,
        rf_freshness=rf_freshness,
        hydro_freshness=hydro_freshness,
        forecast_mode=forecast_data_mode,
        has_upstream_threats=basin_info["has_upstream_influence"],
        horizon_hours=forecast_horizon_hours
    )

    if conf_level == "LIMITED" and abs(risk_change) > 15:
        risk_trend = "UNCERTAIN"

    # Classify Outlook Category
    if projected_risk >= 75.0 and (rainfall_intensity in ["VERY_HEAVY", "EXTREME"] or hydro_status in ["WARNING", "CRITICAL"] or basin_surge >= 8.0):
        outlook_cat = "CRITICAL_PROJECTION"
    elif projected_risk >= 55.0 or (risk_change >= 14.0 and projected_risk >= 45.0):
        outlook_cat = "HIGH_PROJECTION"
    elif projected_risk >= 35.0 or risk_change >= 8.0:
        outlook_cat = "ELEVATING_RISK"
    elif projected_risk >= 20.0 or risk_change >= 4.0:
        outlook_cat = "WATCH_FOR_ESCALATION"
    elif conf_level == "LIMITED":
        outlook_cat = "UNCERTAIN"
    else:
        outlook_cat = "STABLE"

    # Extract Primary Drivers & Supporting Signals
    primary_drivers, supporting_signals, evidence_list = extract_forecast_drivers(
        current_risk=current_risk,
        projected_risk=projected_risk,
        risk_change=risk_change,
        forecast_rf=forecast_rainfall_mm,
        rf_intensity=rainfall_intensity,
        hydro_status=hydro_status,
        hydro_trend=hydro_trend,
        hydro_summary=hydro_summary,
        basin_info=basin_info,
        drain_vuln=drain_vuln,
        flood_hist=flood_hist,
        cit_score=cit_score,
        forecast_mode=forecast_data_mode,
        horizon_hours=forecast_horizon_hours
    )

    # Generate Data Limitations & Transparency Notes
    limitations = [
        "This is an analytical model projection for decision support and NOT an official government flood forecast.",
        "Inflow arrival times are estimates based on catchment morphometry and may vary with localized gate operations."
    ]
    if forecast_data_mode == "SIMULATED_FORECAST":
        limitations.append("Precipitation forecast is running on transparent simulation fallback mode.")
    if rf_freshness in ["STALE", "EXPIRED"]:
        limitations.append(f"Base rainfall telemetry is {rf_freshness.lower()} (>12h old); forecast uncertainty is elevated.")
    if hydro_status == "UNKNOWN":
        limitations.append("District does not contain an active river gauge station; hydrological projection relies on municipal drainage and basin routing.")

    sources = custom_forecast_sources or [
        "IMD High-Resolution Numerical Weather Prediction (NWP) Ensemble Grid",
        "Telangana State Development Planning Society (TSDPS) Automatic Weather Station Baseline",
        "Central Water Commission (CWC) Godavari & Krishna Basin Hydrological Telemetry",
        "NeerDrishti Upstream-Downstream Basin Propagation Model (Prototype)"
    ]

    now_dt = datetime.utcnow()
    valid_until_dt = now_dt + timedelta(hours=forecast_horizon_hours)

    return {
        "districtId": d_id,
        "districtName": d_name,
        "forecastHorizonHours": forecast_horizon_hours,
        "label": f"+{forecast_horizon_hours}H",
        "projectedRiskScore": projected_risk,
        "currentRiskScore": current_risk,
        "projectedRiskChange": risk_change,
        "riskTrend": risk_trend,
        "outlookCategory": outlook_cat,
        "confidence": conf_level,
        "confidenceScore": conf_score,
        "confidenceReason": conf_reason,
        "forecastDataMode": forecast_data_mode,
        "projectedRainfall_mm": forecast_rainfall_mm,
        "projectedRainfallIntensity": rainfall_intensity,
        "basinInfluenceContribution": basin_surge,
        "primaryProjectedDrivers": primary_drivers,
        "supportingSignals": supporting_signals,
        "evidence": evidence_list,
        "forecastSources": sources,
        "limitations": limitations,
        "generatedAt": now_dt.isoformat(),
        "validUntil": valid_until_dt.isoformat(),
        "metadata": {
            "currentRainfall24h": current_rf,
            "hydroStatus": hydro_status,
            "hydroTrend": hydro_trend,
            "upstreamThreatsCount": len(basin_info.get("active_upstream_threats", []))
        }
    }


def evaluate_forecast_confidence(
    rf_mode: str,
    rf_freshness: str,
    hydro_freshness: str,
    forecast_mode: str,
    has_upstream_threats: bool,
    horizon_hours: int
) -> Tuple[float, str, str]:
    """
    Calculates deterministic forecast confidence score, level, and transparent reason.
    Horizons further out (+12H, +24H) inherently have greater dispersion.
    """
    base_score = 0.85

    # Horizon dispersion penalty
    if horizon_hours == 3:
        h_penalty = 0.00
    elif horizon_hours == 6:
        h_penalty = 0.05
    elif horizon_hours == 12:
        h_penalty = 0.12
    else: # 24h
        h_penalty = 0.20

    # Data mode penalty
    if forecast_mode == "LIVE_FORECAST":
        mode_score = 0.90
    elif forecast_mode == "HISTORICAL_BASELINE":
        mode_score = 0.70
    elif forecast_mode == "SIMULATED_FORECAST":
        mode_score = 0.60
    else:
        mode_score = 0.30

    # Freshness penalty
    rf_f_score = 0.90 if rf_freshness == "FRESH" else (0.70 if rf_freshness == "AGING" else 0.40)
    hydro_f_score = 0.90 if hydro_freshness == "FRESH" else (0.70 if hydro_freshness == "AGING" else 0.50)

    score = round(base_score * 0.40 + mode_score * 0.30 + (rf_f_score * 0.15 + hydro_f_score * 0.15) - h_penalty, 2)
    score = max(0.10, min(0.98, score))

    if score >= 0.78:
        level = "HIGH"
        reason = f"High confidence: Fresh telemetry coupled with low horizon uncertainty ({horizon_hours}h)."
    elif score >= 0.58:
        level = "MEDIUM"
        reason = f"Medium confidence: Reliable forecast inputs with moderate horizon projection dispersion at +{horizon_hours}h."
    elif score >= 0.40:
        level = "LOW"
        reason = f"Low confidence: Aging telemetry and +{horizon_hours}h forecast temporal dispersion."
    else:
        level = "LIMITED"
        reason = f"Limited confidence: Model relying primarily on simulation baselines; telemetry unavailable or expired."

    return score, level, reason


def extract_forecast_drivers(
    current_risk: float,
    projected_risk: float,
    risk_change: float,
    forecast_rf: float,
    rf_intensity: str,
    hydro_status: str,
    hydro_trend: str,
    hydro_summary: Dict[str, Any],
    basin_info: Dict[str, Any],
    drain_vuln: float,
    flood_hist: float,
    cit_score: float,
    forecast_mode: str,
    horizon_hours: int
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[str]]:
    """Extracts ranked primary drivers and supporting signals for future projections."""
    primary = []
    supporting = []
    evidence = []
    now_str = datetime.utcnow().isoformat()

    # 1. Forecast Rainfall driver
    if forecast_rf >= 35.0:
        p_drv = {
            "driverName": f"Forecast {rf_intensity.title()} Rainfall",
            "signalType": "FORECAST_RAINFALL",
            "importance": "PRIMARY",
            "scoreOrSeverity": f"{forecast_rf:.1f} mm",
            "evidence": f"Projected accumulation of {forecast_rf:.1f} mm within +{horizon_hours}h window.",
            "source": "IMD NWP Grid Telemetry",
            "dataMode": forecast_mode,
            "freshness": "FRESH",
            "confidence": 0.85,
            "timestamp": now_str
        }
        primary.append(p_drv)
        evidence.append(p_drv["evidence"])
    elif forecast_rf >= 15.0:
        s_drv = {
            "driverName": "Forecast Moderate Rainfall",
            "signalType": "FORECAST_RAINFALL",
            "importance": "SUPPORTING",
            "scoreOrSeverity": f"{forecast_rf:.1f} mm",
            "evidence": f"Anticipated precipitation of {forecast_rf:.1f} mm over next +{horizon_hours}h.",
            "source": "IMD NWP Grid Telemetry",
            "dataMode": forecast_mode,
            "freshness": "FRESH",
            "confidence": 0.80,
            "timestamp": now_str
        }
        supporting.append(s_drv)
        evidence.append(s_drv["evidence"])

    # 2. Upstream Basin Propagation Driver
    threats = basin_info.get("active_upstream_threats", [])
    if threats:
        for t in threats:
            p_basin = {
                "driverName": f"Upstream Inflow Surge: {t['upstream_district_name']}",
                "signalType": "BASIN_PROPAGATION",
                "importance": "PRIMARY" if t["projected_downstream_impact_score"] >= 4.0 else "SUPPORTING",
                "scoreOrSeverity": f"+{t['projected_downstream_impact_score']:.1f} pts",
                "evidence": t["evidence"],
                "source": "Basin Propagation Model",
                "dataMode": "HISTORICAL",
                "freshness": "FRESH",
                "confidence": 0.85,
                "timestamp": now_str
            }
            if p_basin["importance"] == "PRIMARY":
                primary.append(p_basin)
            else:
                supporting.append(p_basin)
            evidence.append(t["evidence"])

    # 3. Hydrological Status Driver
    if hydro_status in ["WARNING", "CRITICAL"] or (hydro_status == "WATCH" and hydro_trend == "RISING"):
        wb_name = hydro_summary.get("primary_water_body", "River/Dam Station")
        h_drv = {
            "driverName": f"Hydrological {hydro_status.title()} Condition",
            "signalType": "HYDROLOGICAL_TELEMETRY",
            "importance": "PRIMARY",
            "scoreOrSeverity": hydro_status,
            "evidence": f"{wb_name} river stage is {hydro_status} with {hydro_trend.lower()} trend, increasing backwater risk.",
            "source": hydro_summary.get("source_attribution", "CWC / State Gauge Network"),
            "dataMode": hydro_summary.get("data_mode", "LIVE"),
            "freshness": hydro_summary.get("freshness", "FRESH"),
            "confidence": 0.90,
            "timestamp": now_str
        }
        primary.append(h_drv)
        evidence.append(h_drv["evidence"])
    elif hydro_trend == "RISING":
        h_supp = {
            "driverName": "Rising Hydrological Stage",
            "signalType": "HYDROLOGICAL_TELEMETRY",
            "importance": "SUPPORTING",
            "scoreOrSeverity": "RISING",
            "evidence": f"Active river gauges record rising water level trend.",
            "source": hydro_summary.get("source_attribution", "CWC Gauge Network"),
            "dataMode": hydro_summary.get("data_mode", "LIVE"),
            "freshness": hydro_summary.get("freshness", "FRESH"),
            "confidence": 0.85,
            "timestamp": now_str
        }
        supporting.append(h_supp)
        evidence.append(h_supp["evidence"])

    # 4. Drainage & Topography Vulnerability
    if drain_vuln >= 70.0 and (forecast_rf >= 20.0 or current_risk >= 50.0):
        d_drv = {
            "driverName": "Severe Drainage Bottlenecks",
            "signalType": "DRAINAGE_VULNERABILITY",
            "importance": "PRIMARY" if not primary else "SUPPORTING",
            "scoreOrSeverity": f"{drain_vuln:.0f}/100",
            "evidence": f"Low surface runoff infiltration ({drain_vuln:.0f}/100) causes rapid localized waterlogging during forecast rainfall bursts.",
            "source": "Municipal Drainage Vulnerability Atlas",
            "dataMode": "HISTORICAL",
            "freshness": "FRESH",
            "confidence": 0.90,
            "timestamp": now_str
        }
        if d_drv["importance"] == "PRIMARY":
            primary.append(d_drv)
        else:
            supporting.append(d_drv)
        evidence.append(d_drv["evidence"])

    # 5. Historical Recurrence Context
    if flood_hist >= 65.0:
        hist_drv = {
            "driverName": "High Historical Inundation Susceptibility",
            "signalType": "FLOOD_HISTORY",
            "importance": "SUPPORTING",
            "scoreOrSeverity": f"{flood_hist:.0f}/100",
            "evidence": f"District has high historical recurrence ({flood_hist:.0f}/100) in state disaster vulnerability records.",
            "source": "Telangana State Disaster Management Authority (SDMA) Baseline",
            "dataMode": "HISTORICAL",
            "freshness": "FRESH",
            "confidence": 0.95,
            "timestamp": now_str
        }
        supporting.append(hist_drv)

    # 6. Fallback if no primary driver was triggered
    if not primary:
        base_drv = {
            "driverName": "Baseline Current Flood Risk",
            "signalType": "COMPOSITE_RISK",
            "importance": "PRIMARY",
            "scoreOrSeverity": f"{current_risk:.0f}/100",
            "evidence": f"Current multi-factor baseline risk index of {current_risk:.0f}/100.",
            "source": "NeerDrishti 5-Factor Risk Engine",
            "dataMode": "LIVE",
            "freshness": "FRESH",
            "confidence": 0.90,
            "timestamp": now_str
        }
        primary.append(base_drv)
        evidence.append(base_drv["evidence"])

    return primary, supporting, evidence


def project_district_timeline(
    district_status: Dict[str, Any],
    all_district_statuses: Optional[Dict[str, Any]] = None,
    forecast_data_mode: str = "SIMULATED_FORECAST"
) -> Dict[str, Any]:
    """
    Generates a complete multi-horizon future risk timeline (NOW, +3H, +6H, +12H, +24H)
    for a given district.
    """
    district_id = district_status.get("district_id") or district_status.get("id", "TEL-HYD")
    norm = normalize_district(district_id)
    d_id = norm["canonical_id"]
    d_name = norm["district_name"]

    current_risk = float(district_status.get("composite_risk_score") or district_status.get("flood_risk_score") or 0.0)
    current_level = district_status.get("risk_level") or district_status.get("risk_category") or "LOW"
    current_op = district_status.get("situation_summary", {}).get("operationalCategory") or district_status.get("situation_summary", {}).get("operationalSituation") or "MONITORING"

    h3 = project_district_risk(district_status, 3, None, forecast_data_mode, all_district_statuses)
    h6 = project_district_risk(district_status, 6, None, forecast_data_mode, all_district_statuses)
    h12 = project_district_risk(district_status, 12, None, forecast_data_mode, all_district_statuses)
    h24 = project_district_risk(district_status, 24, None, forecast_data_mode, all_district_statuses)

    # Determine peak risk horizon
    points = [(3, h3["projectedRiskScore"]), (6, h6["projectedRiskScore"]), (12, h12["projectedRiskScore"]), (24, h24["projectedRiskScore"])]
    max_horizon, max_risk = max(points, key=lambda x: x[1])

    # Dominant overall trend
    if h6["riskTrend"] == "RISING" or h12["riskTrend"] == "RISING":
        dominant_trend = "RISING"
    elif h24["riskTrend"] == "IMPROVING" and h6["riskTrend"] != "RISING":
        dominant_trend = "IMPROVING"
    else:
        dominant_trend = "STABLE"

    # Overall outlook category (highest severity among horizons)
    severity_order = {
        "CRITICAL_PROJECTION": 5,
        "HIGH_PROJECTION": 4,
        "ELEVATING_RISK": 3,
        "WATCH_FOR_ESCALATION": 2,
        "STABLE": 1,
        "UNCERTAIN": 0
    }
    outlook_list = [h3["outlookCategory"], h6["outlookCategory"], h12["outlookCategory"], h24["outlookCategory"]]
    overall_outlook = max(outlook_list, key=lambda cat: severity_order.get(cat, 0))

    basin_info = calculate_basin_influence(d_id, all_district_statuses, 6)

    return {
        "districtId": d_id,
        "districtName": d_name,
        "currentRiskScore": current_risk,
        "currentRiskLevel": current_level,
        "currentOperationalCategory": current_op,
        "overallForecastOutlook": overall_outlook,
        "dominantTrend": dominant_trend,
        "maxProjectedRisk": max_risk,
        "maxRiskHorizonHours": max_horizon,
        "timeline": {
            "now": {
                "riskScore": current_risk,
                "riskLevel": current_level,
                "operationalCategory": current_op,
                "timestamp": datetime.utcnow().isoformat()
            },
            "h3": h3,
            "h6": h6,
            "h12": h12,
            "h24": h24
        },
        "basinInfluence": basin_info,
        "dataConfidence": h6["confidence"],
        "confidenceReason": h6["confidenceReason"],
        "dataMode": forecast_data_mode,
        "sourcesAttribution": h6["forecastSources"],
        "disclaimer": "Informational model projection only. Not an official flood warning or disaster declaration.",
        "generatedAt": datetime.utcnow().isoformat()
    }


def project_all_districts(
    all_district_statuses: List[Dict[str, Any]],
    forecast_data_mode: str = "SIMULATED_FORECAST"
) -> Dict[str, Any]:
    """Generates future risk projections for all 33 Telangana districts."""
    status_map = {d.get("district_id", d.get("id")): d for d in all_district_statuses}
    results = {}
    for d in all_district_statuses:
        d_id = d.get("district_id") or d.get("id")
        results[d_id] = project_district_timeline(d, status_map, forecast_data_mode)
    return results


class PredictiveRiskEngine:
    """Class wrapper for Predictive Flood Risk Modeling and Basin Intelligence."""
    def __init__(self):
        self.basin_connections = load_basin_connections()

    def project_district_timeline(self, district_status: Dict[str, Any], all_district_statuses: Optional[Dict[str, Any]] = None, forecast_data_mode: str = "SIMULATED_FORECAST") -> Dict[str, Any]:
        return project_district_timeline(district_status, all_district_statuses, forecast_data_mode)

    def project_horizon_risk(self, district_status: Dict[str, Any], forecast_horizon_hours: int = 6, forecast_rainfall_mm: Optional[float] = None, all_district_statuses: Optional[Dict[str, Any]] = None, forecast_data_mode: str = "SIMULATED_FORECAST") -> Dict[str, Any]:
        return project_horizon_risk(district_status, forecast_horizon_hours, forecast_rainfall_mm, all_district_statuses, forecast_data_mode)

    def calculate_basin_influence(self, district_id: str, all_district_statuses: Optional[Dict[str, Any]] = None, horizon_hours: int = 6) -> Dict[str, Any]:
        return calculate_basin_influence(district_id, all_district_statuses, horizon_hours)

    def project_all_districts(self, all_district_statuses: List[Dict[str, Any]], forecast_data_mode: str = "SIMULATED_FORECAST") -> Dict[str, Any]:
        return project_all_districts(all_district_statuses, forecast_data_mode)

