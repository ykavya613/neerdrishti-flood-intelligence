"""
NeerDrishti Citizen Report Processor (Phase C)
Performs structured AI triage and validated rule-based fallback for citizen hazard reports.
"""

from typing import Dict, Any, Optional, Tuple
import json
import re

ALLOWED_INCIDENT_TYPES = [
    "Urban Flooding",
    "Road Flooding",
    "Water Entering Buildings",
    "Drainage Overflow",
    "River Overflow",
    "Other",
]

ALLOWED_SEVERITIES = ["Low", "Moderate", "High", "Critical"]
ALLOWED_PRIORITIES = ["Monitor", "Review", "High Priority", "Immediate Review"]


def validate_structured_classification(obj: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Strictly validates LLM JSON output against allowed enums and schema constraints.
    Returns normalized dictionary or None if invalid.
    """
    if not isinstance(obj, dict):
        return None

    raw_type = str(obj.get("incident_type", "")).strip()
    incident_type = "Other"
    for allowed in ALLOWED_INCIDENT_TYPES:
        if allowed.lower() == raw_type.lower():
            incident_type = allowed
            break
    else:
        if "river" in raw_type.lower():
            incident_type = "River Overflow"
        elif "drain" in raw_type.lower() or "nala" in raw_type.lower():
            incident_type = "Drainage Overflow"
        elif "building" in raw_type.lower() or "house" in raw_type.lower() or "basement" in raw_type.lower():
            incident_type = "Water Entering Buildings"
        elif "road" in raw_type.lower() or "traffic" in raw_type.lower() or "causeway" in raw_type.lower():
            incident_type = "Road Flooding"
        elif "urban" in raw_type.lower() or "waterlog" in raw_type.lower():
            incident_type = "Urban Flooding"
        else:
            incident_type = "Other"

    raw_sev = str(obj.get("severity", "")).strip()
    severity = "Moderate"
    for allowed in ALLOWED_SEVERITIES:
        if allowed.lower() == raw_sev.lower():
            severity = allowed
            break

    raw_pri = str(obj.get("priority", "")).strip()
    priority = "Review"
    for allowed in ALLOWED_PRIORITIES:
        if allowed.lower() == raw_pri.lower():
            priority = allowed
            break
    else:
        if severity == "Critical":
            priority = "Immediate Review"
        elif severity == "High":
            priority = "High Priority"
        elif severity == "Moderate":
            priority = "Review"
        else:
            priority = "Monitor"

    impact = str(obj.get("impact", "")).strip()[:300] or "Localized roadway and drainage corridor."
    summary = str(obj.get("summary", "")).strip()[:300] or "Citizen hazard alert reported."
    recommended_action = str(obj.get("recommended_action", "")).strip()[:300] or "Avoid submerged roadways and follow safety advisories."

    return {
        "incident_type": incident_type,
        "severity": severity,
        "impact": impact,
        "priority": priority,
        "summary": summary,
        "recommended_action": recommended_action,
    }


def rule_based_fallback_triage(
    description: str,
    user_severity: str = "Moderate",
    district: str = "Telangana",
    location_description: str = "",
    user_incident_type: str = "Other",
) -> Dict[str, Any]:
    """
    Deterministic rule-based fallback when LLM is unavailable or returns invalid JSON.
    """
    combined = f"{description.lower()} {location_description.lower()}"

    # 1. Incident Type
    if any(k in combined for k in ["musi", "godavari", "river", "causeway", "kadam", "riverbank"]):
        incident_type = "River Overflow"
    elif any(k in combined for k in ["nala", "drain", "choked", "plastic", "gutter", "manhole", "culvert"]):
        incident_type = "Drainage Overflow"
    elif any(k in combined for k in ["basement", "house", "building", "apartment", "ground floor", "shop"]):
        incident_type = "Water Entering Buildings"
    elif any(k in combined for k in ["road", "traffic", "highway", "underpass", "bridge", "vehicle", "lane"]):
        incident_type = "Road Flooding"
    elif any(k in combined for k in ["colony", "street", "waterlogging", "inundation"]):
        incident_type = "Urban Flooding"
    else:
        incident_type = user_incident_type if user_incident_type in ALLOWED_INCIDENT_TYPES else "Urban Flooding"

    # 2. Severity & Priority
    critical_keywords = ["submerged", "overflowing", "waist", "trapped", "stuck", "breach", "danger", "burst", "rescue"]
    high_keywords = ["knee-deep", "blocked", "heavy water", "rising fast", "debris", "gushing"]

    has_critical = any(kw in combined for kw in critical_keywords) or user_severity.lower() == "critical"
    has_high = any(kw in combined for kw in high_keywords) or user_severity.lower() == "high"

    if has_critical:
        severity = "Critical"
        priority = "Immediate Review"
        impact = "Severe threat to life, transit links, and submerged properties"
        rec_action = "Do not attempt to cross inundated roads; move to higher ground; alert emergency helpline."
    elif has_high:
        severity = "High"
        priority = "High Priority"
        impact = "Disruption of vehicular movement and water ingress risk"
        rec_action = "Avoid affected roadways; park vehicles on elevated ground; assist vulnerable residents."
    elif user_severity.lower() == "low":
        severity = "Low"
        priority = "Monitor"
        impact = "Minor roadside puddles"
        rec_action = "Standard caution; monitor drainage channels."
    else:
        severity = "Moderate"
        priority = "Review"
        impact = "Temporary traffic slowdown and localized waterlogging"
        rec_action = "Exercise caution while driving; report clogged stormwater drains to local ward office."

    loc_str = f" near {location_description}" if location_description else ""
    summary = f"{incident_type} ({severity.lower()} severity) reported in {district}{loc_str}."

    return {
        "incident_type": incident_type,
        "severity": severity,
        "impact": impact,
        "priority": priority,
        "summary": summary,
        "recommended_action": rec_action,
        "model_provider": "Rule Engine",
        "model_name": "Rule-Based Fallback",
    }


def classify_report_rule_based(
    description: str,
    water_depth: float = 0.0,
    location_description: str = "",
    district: str = "Telangana",
) -> Dict[str, Any]:
    """
    Evaluates report description and water depth to determine severity, category, confidence, and action.
    """
    is_low = water_depth <= 0.0 or any(k in description.lower() for k in ["drizzle", "minor", "damp", "dry", "normal"])
    calc_sev = "Critical" if water_depth >= 3.0 else "High" if water_depth >= 1.5 else "Low" if is_low else "Moderate"

    res = rule_based_fallback_triage(
        description=description,
        user_severity=calc_sev,
        district=district,
        location_description=location_description,
    )
    
    # Map incident_type to standard uppercase category code
    inc = res["incident_type"]
    if inc == "River Overflow":
        cat = "RIVER_OVERFLOW"
    elif inc == "Drainage Overflow":
        cat = "DRAINAGE_FAILURE"
    elif inc in ["Water Entering Buildings", "Urban Flooding"]:
        cat = "INUNDATION" if "inundation" in description.lower() else "WATERLOGGING"
    elif is_low:
        cat = "OBSERVATION"
    else:
        cat = "WATERLOGGING"

    sev_upper = res["severity"].upper()
    confidence = 0.95 if sev_upper == "CRITICAL" else 0.90 if sev_upper == "HIGH" else 0.85

    return {
        "severity": sev_upper,
        "category": cat,
        "confidence": confidence,
        "reasoning": res["impact"],
        "recommended_action": res["recommended_action"],
        "ai_model": "rule-based-fallback",
    }


