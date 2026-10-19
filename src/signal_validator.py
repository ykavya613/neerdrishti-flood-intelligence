"""
Signal Validation and Freshness Engine (Python implementation)
Authoritative validation logic and freshness decay models.
"""

from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

MIN_MM = 0.0
MAX_MM_24H = 500.0

FRESH_MAX_HOURS = 3.0
AGING_MAX_HOURS = 12.0
STALE_MAX_HOURS = 24.0

HYDRO_RIVER_FRESH_MAX_HOURS = 3.0
HYDRO_RIVER_AGING_MAX_HOURS = 12.0
HYDRO_RIVER_STALE_MAX_HOURS = 24.0

HYDRO_RESERVOIR_FRESH_MAX_HOURS = 6.0
HYDRO_RESERVOIR_AGING_MAX_HOURS = 24.0
HYDRO_RESERVOIR_STALE_MAX_HOURS = 48.0

MAX_RIVER_LEVEL_M = 1000.0
MAX_RIVER_LEVEL_FT = 3500.0
MAX_STORAGE_TMC = 1000.0
MAX_DISCHARGE_CUSECS = 3000000.0
MAX_DISCHARGE_CUMECS = 85000.0


def validate_signal(signal: Dict[str, Any]) -> Dict[str, Any]:
    errors: List[str] = []

    district_id = signal.get("district_id") or signal.get("districtId")
    if not district_id or not str(district_id).strip():
        errors.append("Missing or invalid district identifier")

    signal_type = str(signal.get("signal_type") or signal.get("signalType") or "rainfall").lower()
    raw_unit = str(signal.get("unit", "")).strip().lower()

    val = signal.get("value")
    if val is None or not isinstance(val, (int, float)):
        errors.append("Signal value must be a valid numeric value")
    else:
        if signal_type == "rainfall":
            if val < MIN_MM:
                errors.append(f"Signal value cannot be negative (got {val})")
            if val > MAX_MM_24H:
                errors.append(f"Signal value exceeds plausible upper limit of {MAX_MM_24H} mm (got {val})")
        elif signal_type in ["river_level", "reservoir_level"]:
            if val < 0:
                errors.append(f"Water level cannot be negative (got {val})")
            if raw_unit in ["ft", "feet"]:
                if val > MAX_RIVER_LEVEL_FT:
                    errors.append(f"Water level in feet exceeds plausible limit of {MAX_RIVER_LEVEL_FT} ft (got {val})")
            else:
                if val > MAX_RIVER_LEVEL_M:
                    errors.append(f"Water level in meters exceeds plausible limit of {MAX_RIVER_LEVEL_M} m (got {val})")
        elif signal_type == "reservoir_storage":
            if val < 0:
                errors.append(f"Storage value cannot be negative (got {val})")
            if raw_unit in ["%", "percent"]:
                if val > 100.0:
                    errors.append(f"Storage percentage exceeds 100% (got {val}%)")
            elif raw_unit in ["tmc"]:
                if val > MAX_STORAGE_TMC:
                    errors.append(f"Storage in TMC exceeds plausible limit of {MAX_STORAGE_TMC} TMC (got {val})")
        elif signal_type in ["dam_discharge", "reservoir_release", "river_flow"]:
            if val < 0:
                errors.append(f"Discharge flow cannot be negative (got {val})")
            if raw_unit in ["cusecs", "cfs"]:
                if val > MAX_DISCHARGE_CUSECS:
                    errors.append(f"Discharge flow exceeds plausible maximum of {MAX_DISCHARGE_CUSECS} cusecs (got {val})")
            elif raw_unit in ["cumecs", "m3/s"]:
                if val > MAX_DISCHARGE_CUMECS:
                    errors.append(f"Discharge flow exceeds plausible maximum of {MAX_DISCHARGE_CUMECS} cumecs (got {val})")
        elif signal_type == "hydrological_alert":
            if val < 0 or val > 5:
                errors.append(f"Hydrological alert severity code must be between 0 and 5 (got {val})")

    rec = signal.get("recorded_at") or signal.get("recordedAt")
    if not rec:
        errors.append("Missing observation timestamp")
    else:
        try:
            # Parse ISO or standard formats
            dt_str = str(rec).replace("Z", "+00:00")
            dt = datetime.fromisoformat(dt_str)
            now = datetime.now(dt.tzinfo) if dt.tzinfo else datetime.now()
            # Allow max 10 min drift
            if (dt - now).total_seconds() > 600:
                errors.append("Recorded timestamp is unreasonably in the future")
        except Exception:
            errors.append("Unparseable observation timestamp")

    valid_units = [
        "mm", "mm/h", "cm",
        "m", "meters", "ft", "feet",
        "cusecs", "cfs", "cumecs", "m3/s",
        "tmc", "mcft", "%", "percent",
        "level", "alert_code"
    ]
    if not raw_unit or raw_unit not in valid_units:
        errors.append(f"Unsupported or missing unit (got '{raw_unit}')")

    source = signal.get("source_name") or signal.get("sourceName")
    if not source:
        errors.append("Missing data source name")

    return {
        "is_valid": len(errors) == 0,
        "errors": errors,
        "sanitized_value": val if len(errors) == 0 else None,
    }


def evaluate_freshness(recorded_at: Any, now: Optional[datetime] = None, signal_type: str = "rainfall") -> Dict[str, Any]:
    try:
        if isinstance(recorded_at, str):
            dt_str = recorded_at.replace("Z", "+00:00")
            dt = datetime.fromisoformat(dt_str)
        elif isinstance(recorded_at, datetime):
            dt = recorded_at
        else:
            return {"status": "EXPIRED", "factor": 0.0, "age_hours": 999.0}

        current_time = now or (datetime.now(dt.tzinfo) if dt.tzinfo else datetime.now())
        diff_sec = max(0.0, (current_time - dt).total_seconds())
        age_hours = round(diff_sec / 3600.0, 2)

        fresh_max = FRESH_MAX_HOURS
        aging_max = AGING_MAX_HOURS
        stale_max = STALE_MAX_HOURS

        st_lower = str(signal_type).lower()
        if st_lower in ["reservoir_level", "reservoir_storage", "reservoir_release"]:
            fresh_max = HYDRO_RESERVOIR_FRESH_MAX_HOURS
            aging_max = HYDRO_RESERVOIR_AGING_MAX_HOURS
            stale_max = HYDRO_RESERVOIR_STALE_MAX_HOURS
        elif st_lower in ["river_level", "river_flow", "dam_discharge"]:
            fresh_max = HYDRO_RIVER_FRESH_MAX_HOURS
            aging_max = HYDRO_RIVER_AGING_MAX_HOURS
            stale_max = HYDRO_RIVER_STALE_MAX_HOURS

        if age_hours <= fresh_max:
            return {"status": "FRESH", "factor": 1.0, "age_hours": age_hours}
        elif age_hours <= aging_max:
            return {"status": "AGING", "factor": 0.8, "age_hours": age_hours}
        elif age_hours <= stale_max:
            return {"status": "STALE", "factor": 0.5, "age_hours": age_hours}
        else:
            return {"status": "EXPIRED", "factor": 0.0, "age_hours": age_hours}
    except Exception:
        return {"status": "EXPIRED", "factor": 0.0, "age_hours": 999.0}
