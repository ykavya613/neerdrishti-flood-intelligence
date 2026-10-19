"""
NeerDrishti Hydrological Signal Intelligence Engine (Phase D2)
Deterministic hydrological status classification, trend detection, anomaly detection, and district summaries.
"""

import os
import json
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple

from src.database import (
    get_all_hydrological_stations,
    get_hydrological_station_by_id,
    get_latest_hydrological_signals,
)
from src.district_normalizer import normalize_district
from src.signal_validator import evaluate_freshness

HYDRO_STATIONS_CACHE: Optional[List[Dict[str, Any]]] = None


def load_hydrological_stations() -> List[Dict[str, Any]]:
    """Loads hydrological stations from database or JSON registry."""
    global HYDRO_STATIONS_CACHE
    if HYDRO_STATIONS_CACHE is not None and len(HYDRO_STATIONS_CACHE) > 0:
        return HYDRO_STATIONS_CACHE

    try:
        db_stations = get_all_hydrological_stations()
        if db_stations and len(db_stations) > 0:
            HYDRO_STATIONS_CACHE = db_stations
            return HYDRO_STATIONS_CACHE
    except Exception:
        pass

    data_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "hydrological_stations.json")
    if os.path.exists(data_path):
        try:
            with open(data_path, "r", encoding="utf-8") as f:
                HYDRO_STATIONS_CACHE = json.load(f)
                return HYDRO_STATIONS_CACHE
        except Exception as e:
            print(f"Error loading hydrological stations JSON: {e}")

    return []


def get_hydrological_stations_for_district(district_id_or_name: str) -> List[Dict[str, Any]]:
    """Retrieves all hydrological stations mapped to a district."""
    norm = normalize_district(district_id_or_name)
    target_id = norm["district_id"] if norm["resolved"] else district_id_or_name.lower().strip()
    all_stations = load_hydrological_stations()
    return [
        s for s in all_stations
        if str(s.get("district_id", "")).lower() == target_id
    ]


def get_hydrological_stations(district_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Gets stations for a district or all districts."""
    if district_id:
        return get_hydrological_stations_for_district(district_id)
    return load_hydrological_stations()


def get_hydrological_station_by_id_cached(station_id: str) -> Optional[Dict[str, Any]]:
    """Retrieves station by ID."""
    all_stations = load_hydrological_stations()
    for s in all_stations:
        if str(s.get("station_id", "")).lower() == station_id.lower():
            return s
    return get_hydrological_station_by_id(station_id)


def classify_hydrological_status(
    value: Optional[float],
    warning_threshold: Optional[float] = None,
    danger_threshold: Optional[float] = None
) -> str:
    """
    Deterministic threshold classification for hydrological telemetry.
    Returns: 'CRITICAL', 'WARNING', 'WATCH', 'NORMAL', or 'UNKNOWN'
    """
    if value is None:
        return "UNKNOWN"

    try:
        val = float(value)
    except (ValueError, TypeError):
        return "UNKNOWN"

    if danger_threshold is not None:
        try:
            dt = float(danger_threshold)
            if val >= dt:
                return "CRITICAL"
        except (ValueError, TypeError):
            pass

    if warning_threshold is not None:
        try:
            wt = float(warning_threshold)
            if val >= wt:
                return "WARNING"
            if val >= (wt * 0.85):
                return "WATCH"
            return "NORMAL"
        except (ValueError, TypeError):
            pass

    return "UNKNOWN"


def calculate_hydrological_trend(
    current_value: Optional[float],
    prior_value: Optional[float],
    deadband: float = 0.05
) -> str:
    """
    Calculates deterministic trend between current and prior values with deadband.
    """
    if current_value is None or prior_value is None:
        return "STABLE"

    try:
        cur = float(current_value)
        prev = float(prior_value)
        delta = cur - prev
        if delta > deadband:
            return "RISING"
        elif delta < -deadband:
            return "FALLING"
        else:
            return "STABLE"
    except (ValueError, TypeError):
        return "STABLE"


def detect_hydrological_trend(
    observations: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Computes deterministic hydrological trend from historical observations.
    Returns: {'trend': 'RISING'|'FALLING'|'STABLE'|'UNKNOWN', 'delta': float, 'rate_per_hour': Optional[float]}
    """
    if not observations or len(observations) < 2:
        return {"trend": "UNKNOWN", "delta": 0.0, "rate_per_hour": None}

    # Sort observations ascending by timestamp
    def parse_time(o: Dict[str, Any]) -> float:
        t = o.get("recorded_at") or o.get("recordedAt") or ""
        try:
            return datetime.fromisoformat(str(t).replace("Z", "+00:00")).timestamp()
        except Exception:
            return 0.0

    sorted_obs = sorted(observations, key=parse_time)
    latest = sorted_obs[-1]
    prev = sorted_obs[-2]

    try:
        val_latest = float(latest.get("value", 0))
        val_prev = float(prev.get("value", 0))
        delta = round(val_latest - val_prev, 3)
    except (ValueError, TypeError):
        return {"trend": "UNKNOWN", "delta": 0.0, "rate_per_hour": None}

    rate_per_hour = None
    t_latest = parse_time(latest)
    t_prev = parse_time(prev)
    if t_latest > t_prev:
        diff_hours = (t_latest - t_prev) / 3600.0
        if diff_hours > 0:
            rate_per_hour = round(delta / diff_hours, 2)

    deadband = 0.05
    if delta > deadband:
        trend = "RISING"
    elif delta < -deadband:
        trend = "FALLING"
    else:
        trend = "STABLE"

    return {"trend": trend, "delta": delta, "rate_per_hour": rate_per_hour}


def detect_hydrological_anomalies(*args, **kwargs) -> List[Dict[str, Any]]:
    """
    Detects physical anomalies in hydrological gauge telemetry.
    Supports either:
      detect_hydrological_anomalies(station_dict, recent_observations)
    OR:
      detect_hydrological_anomalies(station_id, signal_type, value, unit, recent_observations)
    """
    anomalies: List[Dict[str, Any]] = []

    if len(args) == 2 and isinstance(args[0], dict):
        station = args[0]
        recent_observations = args[1]
        stn_id = station.get("station_id", "")
        dist_id = station.get("district_id", "")
        water_body = station.get("water_body_name", "Water body")
        unit = station.get("unit", "m")
        signal_type = station.get("signal_type", "river_level")
        val = station.get("value")
    elif len(args) >= 4:
        stn_id = str(args[0])
        signal_type = str(args[1])
        val = float(args[2]) if args[2] is not None else None
        unit = str(args[3])
        recent_observations = args[4] if len(args) > 4 else []
        dist_id = kwargs.get("district_id", "")
        water_body = kwargs.get("water_body_name", "Water body")
    else:
        return anomalies

    if not recent_observations:
        return anomalies

    # 1. Rapid Level Rise
    if len(recent_observations) >= 2:
        trend_res = detect_hydrological_trend(recent_observations)
        rate = trend_res.get("rate_per_hour")
        is_ft = "ft" in unit.lower()
        surge_threshold = 1.5 if is_ft else 0.5

        if rate is not None and rate >= surge_threshold:
            anomalies.append({
                "station_id": stn_id,
                "district_id": dist_id,
                "type": "RAPID_LEVEL_RISE",
                "severity": "CRITICAL" if rate >= (surge_threshold * 2) else "HIGH",
                "description": f"Rapid gauge elevation rise detected: +{rate} {unit}/hr on {water_body}.",
                "detected_at": datetime.utcnow().isoformat() + "Z",
                "confidence": 0.90,
            })

    # 2. Sudden Discharge Spike
    discharge_obs = [
        o for o in recent_observations
        if o.get("signal_type") in ["dam_discharge", "reservoir_release"] or signal_type in ["dam_discharge", "reservoir_release"]
    ]
    if len(discharge_obs) >= 2:
        v1 = float(discharge_obs[0].get("value", 0))
        v2 = float(discharge_obs[1].get("value", 0))
        delta = abs(v1 - v2)
        if delta >= 50000 or (min(v1, v2) > 5000 and delta >= min(v1, v2)):
            anomalies.append({
                "station_id": stn_id,
                "district_id": dist_id,
                "type": "DISCHARGE_SPIKE",
                "severity": "HIGH",
                "description": f"Sudden flood discharge increase detected: +{delta} cusecs on {water_body}.",
                "detected_at": datetime.utcnow().isoformat() + "Z",
                "confidence": 0.88,
            })

    # 3. Missing Expected Updates
    latest = recent_observations[0]
    rec_time = latest.get("recorded_at") or latest.get("recordedAt")
    if rec_time:
        fresh_res = evaluate_freshness(rec_time, signal_type=signal_type)
        if fresh_res.get("status") in ["EXPIRED", "STALE"] or fresh_res.get("age_hours", 0) >= 24:
            anomalies.append({
                "station_id": stn_id,
                "district_id": dist_id,
                "type": "MISSING_UPDATE",
                "severity": "LOW",
                "description": f"Station telemetry is overdue ({fresh_res.get('age_hours')}h since last transmission).",
                "detected_at": datetime.utcnow().isoformat() + "Z",
                "confidence": 0.95,
            })

    return anomalies


def build_simulated_observation(
    station: Dict[str, Any],
    scenario_name: str = "Heavy Rainfall"
) -> Dict[str, Any]:
    """Generates deterministic scenario-based hydrological simulation observation."""
    warn_th = float(station.get("warning_threshold") or 10.0)
    dang_th = float(station.get("danger_threshold") or (warn_th * 1.25))

    if scenario_name == "Critical Flood Event":
        val = round(dang_th * 1.05, 2)
        trend = "RISING"
    elif scenario_name == "Flood Warning":
        val = round(warn_th + (dang_th - warn_th) * 0.45, 2)
        trend = "RISING"
    elif scenario_name == "Normal Conditions":
        val = round(warn_th * 0.45, 2)
        trend = "STABLE"
    else:
        # Heavy Rainfall
        val = round(warn_th * 0.90, 2)
        trend = "RISING"

    status = classify_hydrological_status(val, warn_th, dang_th)

    now_iso = datetime.utcnow().isoformat() + "Z"

    return {
        "station_id": station.get("station_id"),
        "station_name": station.get("station_name"),
        "water_body_name": station.get("water_body_name"),
        "water_body_type": station.get("water_body_type"),
        "district_id": station.get("district_id"),
        "signal_type": "river_level",
        "value": val,
        "unit": station.get("unit", "m"),
        "data_mode": "SIMULATED",
        "freshness": "FRESH",
        "confidence": 0.65,
        "status": status,
        "trend": trend,
        "warning_threshold": warn_th,
        "danger_threshold": dang_th,
        "source_name": "NeerDrishti Hydrological Simulation Engine",
        "source_type": "simulation_engine",
        "recorded_at": now_iso,
        "ingested_at": now_iso,
        "is_valid": True,
        "metadata": {
            "scenario": scenario_name,
            "reference_type": "SIMULATION_REFERENCE",
            "basin": station.get("basin")
        }
    }


def get_district_hydrological_summary(
    district_id_or_name: str,
    scenario_name: str = "Heavy Rainfall"
) -> Dict[str, Any]:
    """
    Computes complete district-level hydrological summary.
    """
    norm = normalize_district(district_id_or_name)
    canon_id = norm["district_id"] if norm["resolved"] else district_id_or_name.lower().strip()
    canon_name = norm.get("canonical_name") or district_id_or_name

    stations = get_hydrological_stations_for_district(canon_id)
    db_signals = get_latest_hydrological_signals(district_id=canon_id)

    observations: List[Dict[str, Any]] = []
    all_anomalies: List[Dict[str, Any]] = []

    if stations:
        for stn in stations:
            stn_id = stn.get("station_id", "")
            # Match signals for this station
            stn_signals = [
                s for s in db_signals
                if (s.get("metadata") and stn_id in str(s.get("metadata"))) or (stn_id in str(s.get("source_name", "")))
            ]

            if stn_signals:
                latest_db = stn_signals[0]
                fresh_res = evaluate_freshness(latest_db.get("recorded_at"), signal_type=latest_db.get("signal_type", "river_level"))
                warn = stn.get("warning_threshold")
                dang = stn.get("danger_threshold")
                status = classify_hydrological_status(latest_db.get("value"), warn, dang)
                trend_res = detect_hydrological_trend(stn_signals)

                conf = round(float(latest_db.get("confidence", 1.0)) * fresh_res.get("factor", 1.0), 2)

                obs = {
                    "id": latest_db.get("id"),
                    "station_id": stn_id,
                    "station_name": stn.get("station_name"),
                    "water_body_name": stn.get("water_body_name"),
                    "water_body_type": stn.get("water_body_type"),
                    "district_id": canon_id,
                    "district_name": canon_name,
                    "signal_type": latest_db.get("signal_type"),
                    "value": latest_db.get("value"),
                    "unit": latest_db.get("unit") or stn.get("unit"),
                    "data_mode": latest_db.get("data_mode", "LIVE"),
                    "freshness": fresh_res.get("status"),
                    "confidence": conf,
                    "status": status,
                    "trend": trend_res.get("trend"),
                    "warning_threshold": warn,
                    "danger_threshold": dang,
                    "source_name": latest_db.get("source_name"),
                    "source_type": latest_db.get("source_type"),
                    "recorded_at": latest_db.get("recorded_at"),
                    "ingested_at": latest_db.get("ingested_at"),
                    "is_valid": bool(latest_db.get("is_valid", 1)),
                    "metadata": latest_db.get("metadata") if isinstance(latest_db.get("metadata"), dict) else {},
                }
                observations.append(obs)
                anomalies = detect_hydrological_anomalies(stn, stn_signals)
                all_anomalies.extend(anomalies)
            else:
                sim_obs = build_simulated_observation(stn, scenario_name)
                observations.append(sim_obs)

    # Dominant status determination
    status_rank = {"CRITICAL": 4, "WARNING": 3, "WATCH": 2, "NORMAL": 1, "UNKNOWN": 0}
    dominant_status = "NORMAL"
    highest_rank = 0
    for obs in observations:
        r = status_rank.get(obs.get("status"), 0)
        if r > highest_rank:
            highest_rank = r
            dominant_status = obs.get("status")

    # Dominant trend
    rising = sum(1 for o in observations if o.get("trend") == "RISING")
    falling = sum(1 for o in observations if o.get("trend") == "FALLING")
    if rising > 0 and rising >= falling:
        dominant_trend = "RISING"
    elif falling > 0 and falling > rising:
        dominant_trend = "FALLING"
    elif not observations:
        dominant_trend = "UNKNOWN"
    else:
        dominant_trend = "STABLE"

    has_live = any(o.get("data_mode") == "LIVE" for o in observations)
    has_hist = any(o.get("data_mode") == "HISTORICAL" for o in observations)
    overall_mode = "LIVE" if has_live else ("HISTORICAL" if has_hist else ("SIMULATED" if observations else "UNAVAILABLE"))

    has_fresh = any(o.get("freshness") == "FRESH" for o in observations)
    has_aging = any(o.get("freshness") == "AGING" for o in observations)
    overall_freshness = "FRESH" if has_fresh else ("AGING" if has_aging else "STALE")

    overall_conf = (
        round(sum(float(o.get("confidence", 0.6)) for o in observations) / len(observations), 2)
        if observations else 0.0
    )

    primary_water = stations[0].get("water_body_name") if stations else None
    if overall_mode == "LIVE":
        attribution = "CWC / Telangana I&CAD Gauge Telemetry"
    elif overall_mode == "HISTORICAL":
        attribution = "Telangana State Hydrological Baseline"
    elif overall_mode == "SIMULATED":
        attribution = "NeerDrishti Hydrodynamic Simulation Model"
    else:
        attribution = "No active telemetry stations"

    if not stations:
        context_summary = "No designated river/reservoir gauging stations in this district. Drainage monitored via local urban stormwater networks."
    elif dominant_status == "CRITICAL":
        context_summary = f"Critical hydrological alert: {primary_water} gauge levels have crossed danger thresholds with {dominant_trend.lower()} trend."
    elif dominant_status == "WARNING":
        context_summary = f"Hydrological warning active: Water levels along {primary_water} have crossed 1st warning mark."
    elif dominant_status == "WATCH":
        context_summary = f"Hydrological watch: {primary_water} levels are elevated and trending {dominant_trend.lower()}."
    else:
        context_summary = f"Normal river and reservoir conditions across {len(stations)} gauging points with {dominant_trend.lower()} trend."

    return {
        "district_id": canon_id,
        "district_name": canon_name,
        "active_stations_count": len(stations),
        "primary_water_body": primary_water,
        "dominant_status": dominant_status,
        "dominant_trend": dominant_trend,
        "latest_observations": observations,
        "anomalies": all_anomalies,
        "data_mode": overall_mode,
        "freshness": overall_freshness,
        "overall_confidence": overall_conf,
        "source_attribution": attribution,
        "hydrological_context_summary": context_summary,
        "has_active_warning": dominant_status in ["WARNING", "CRITICAL"],
        "has_active_danger": dominant_status == "CRITICAL",
        "last_updated": datetime.utcnow().isoformat() + "Z"
    }


def get_all_districts_hydrological_summaries(
    scenario_name: str = "Heavy Rainfall"
) -> Dict[str, Dict[str, Any]]:
    """Returns hydrological summaries for all 33 Telangana districts."""
    districts_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "telangana_districts.json")
    district_ids = []
    if os.path.exists(districts_file):
        try:
            with open(districts_file, "r", encoding="utf-8") as f:
                dist_list = json.load(f)
                district_ids = [d.get("district_id") for d in dist_list if d.get("district_id")]
        except Exception:
            pass

    if not district_ids:
        stations = load_hydrological_stations()
        district_ids = list(set(s.get("district_id") for s in stations if s.get("district_id")))

    result: Dict[str, Dict[str, Any]] = {}
    for d_id in district_ids:
        result[d_id] = get_district_hydrological_summary(d_id, scenario_name)
    return result
