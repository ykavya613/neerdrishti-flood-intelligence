"""
NeerDrishti Open-Meteo Telemetry Connector (Python Module)
Integrates free keyless Open-Meteo forecast and archive endpoints for all 33 Telangana districts.
Parses hourly precipitation, computes 24h accumulated rainfall and 3h burst,
and validates signals into the SQLite external signals ledger with transparent provenance.
"""

import json
import urllib.request
import urllib.error
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple

from src.district_normalizer import normalize_district
from src.signal_validator import validate_signal, evaluate_freshness
from src.database import get_db_connection

OPEN_METEO_SOURCE_NAME = "Open-Meteo High-Resolution Telangana Ingestion"
OPEN_METEO_SOURCE_TYPE = "weather_service"


def calculate_24h_and_3h_burst(
    times: List[str],
    precipitations: List[float],
    target_time_str: Optional[str] = None
) -> Tuple[float, float, str]:
    """
    Given an hourly timestamp list and precipitation array, computes:
    - 24-hour total accumulated rainfall (mm)
    - 3-hour precipitation burst (mm)
    - Matched reference timestamp
    """
    if not times or not precipitations or len(times) != len(precipitations):
        raise ValueError("Mismatched or empty time and precipitation arrays")

    # Determine reference index
    idx = len(times) - 1
    if target_time_str:
        for i, t in enumerate(times):
            if t.startswith(target_time_str):
                idx = i
                break

    # Sum 24 hours preceding and including idx
    start_24h = max(0, idx - 23)
    sum_24h = sum(max(0.0, float(p)) for p in precipitations[start_24h:idx + 1] if p is not None)

    # Sum 3 hours preceding and including idx
    start_3h = max(0, idx - 2)
    sum_3h = sum(max(0.0, float(p)) for p in precipitations[start_3h:idx + 1] if p is not None)

    return round(sum_24h, 1), round(sum_3h, 1), times[idx]


def parse_open_meteo_response(payload: Dict[str, Any], target_time_str: Optional[str] = None) -> Dict[str, Any]:
    """
    Validates and parses raw Open-Meteo JSON payload.
    """
    if not isinstance(payload, dict):
        return {"success": False, "error": "Payload must be a dictionary"}

    hourly = payload.get("hourly", {})
    times = hourly.get("time", [])
    precips = hourly.get("precipitation", [])

    if not times or not precips:
        return {"success": False, "error": "Missing hourly time or precipitation series"}

    rf_24h, rf_3h, matched_time = calculate_24h_and_3h_burst(times, precips, target_time_str)

    return {
        "success": True,
        "rainfall_mm_24h": rf_24h,
        "rainfall_mm_3h": rf_3h,
        "matched_time": matched_time,
        "latitude": payload.get("latitude"),
        "longitude": payload.get("longitude"),
        "elevation": payload.get("elevation"),
        "timezone": payload.get("timezone"),
    }


def fetch_open_meteo_forecast(
    latitude: float,
    longitude: float,
    timeout: int = 5
) -> Dict[str, Any]:
    """
    Fetches real-time hourly precipitation forecast for given coordinates from Open-Meteo API.
    """
    url = f"https://api.open-meteo.com/v1/forecast?latitude={latitude}&longitude={longitude}&hourly=precipitation&timezone=Asia%2FKolkata"
    req = urllib.request.Request(url, headers={"User-Agent": "NeerDrishti-Flood-Intelligence/1.0"})

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status != 200:
                return {"success": False, "error": f"HTTP {resp.status}"}
            body = resp.read().decode("utf-8")
            data = json.loads(body)
            return parse_open_meteo_response(data)
    except urllib.error.URLError as e:
        return {"success": False, "error": f"Network error: {str(e)}"}
    except Exception as e:
        return {"success": False, "error": f"Fetch error: {str(e)}"}


def fetch_open_meteo_archive(
    latitude: float,
    longitude: float,
    start_date: str,
    end_date: str,
    timeout: int = 5
) -> Dict[str, Any]:
    """
    Fetches historical hourly precipitation archive from Open-Meteo Archive API.
    """
    url = f"https://archive-api.open-meteo.com/v1/archive?latitude={latitude}&longitude={longitude}&start_date={start_date}&end_date={end_date}&hourly=precipitation&timezone=Asia%2FKolkata"
    req = urllib.request.Request(url, headers={"User-Agent": "NeerDrishti-Flood-Intelligence/1.0"})

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status != 200:
                return {"success": False, "error": f"HTTP {resp.status}"}
            body = resp.read().decode("utf-8")
            data = json.loads(body)
            hourly = data.get("hourly", {})
            precips = hourly.get("precipitation", [])
            if not precips:
                return {"success": False, "error": "Empty precipitation series in archive"}
            
            valid_precips = [max(0.0, float(p)) for p in precips if p is not None]
            total_mm = sum(valid_precips)
            peak_hourly_mm = max(valid_precips) if valid_precips else 0.0
            days = max(1, len(valid_precips) / 24)
            avg_daily_mm = total_mm / days

            return {
                "success": True,
                "total_mm": round(total_mm, 1),
                "peak_hourly_mm": round(peak_hourly_mm, 1),
                "average_daily_mm": round(avg_daily_mm, 1),
                "data_points": len(valid_precips),
            }
    except Exception as e:
        return {"success": False, "error": f"Archive fetch error: {str(e)}"}


def ingest_open_meteo_reading(
    district_name: str,
    rainfall_24h: float,
    rainfall_3h: float,
    recorded_at: Optional[str] = None,
    source_name: str = OPEN_METEO_SOURCE_NAME,
    data_mode: str = "LIVE"
) -> Dict[str, Any]:
    """
    Ingests parsed Open-Meteo observation into SQLite external signals ledger with validation.
    """
    norm = normalize_district(district_name)
    if not norm["resolved"] or not norm["district_id"]:
        return {"success": False, "error": f"Unresolved district: {district_name}"}

    timestamp = recorded_at or datetime.now(timezone.utc).isoformat()
    freshness = evaluate_freshness(timestamp)

    signal_dict = {
        "district_id": norm["district_id"],
        "source_name": source_name,
        "source_type": OPEN_METEO_SOURCE_TYPE,
        "signal_type": "rainfall",
        "value": rainfall_24h,
        "unit": "mm",
        "data_mode": data_mode,
        "freshness": freshness["status"],
        "confidence": round(freshness["factor"] * 0.90, 2),
        "is_valid": 1,
        "recorded_at": timestamp,
        "metadata": {
            "burst_3h_mm": rainfall_3h,
            "canonical_name": norm["canonical_name"],
            "provider": "open-meteo",
        }
    }

    val = validate_signal(signal_dict)
    if not val["is_valid"]:
        return {"success": False, "error": f"Validation failed: {val['errors']}"}

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO external_signals (
            district_id, source_name, source_type, signal_type,
            value, unit, data_mode, freshness, confidence,
            is_valid, recorded_at, ingested_at, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        signal_dict["district_id"],
        signal_dict["source_name"],
        signal_dict["source_type"],
        signal_dict["signal_type"],
        signal_dict["value"],
        signal_dict["unit"],
        signal_dict["data_mode"],
        signal_dict["freshness"],
        signal_dict["confidence"],
        1,
        signal_dict["recorded_at"],
        datetime.now(timezone.utc).isoformat(),
        json.dumps(signal_dict["metadata"])
    ))
    conn.commit()
    inserted_id = cursor.lastrowid
    conn.close()

    return {
        "success": True,
        "signal_id": inserted_id,
        "district_id": norm["district_id"],
        "data_mode": data_mode,
        "freshness": freshness["status"],
        "value": rainfall_24h,
    }
