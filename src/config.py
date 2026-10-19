"""
NeerDrishti Configuration Module
Defines system weights, scoring thresholds, districts, and LLM settings.
"""

import json
import os
from pathlib import Path
from typing import List, Dict, Any, Optional
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
KB_DIR = BASE_DIR / "knowledge_base"
TELANGANA_DISTRICTS_JSON_PATH = DATA_DIR / "telangana_districts.json"

# Database Configuration
DATABASE_PATH = os.getenv("DATABASE_PATH", str(DATA_DIR / "neerdrishti.db"))

def load_telangana_districts() -> List[Dict[str, Any]]:
    """Loads all 33 Telangana districts metadata from the central JSON dataset."""
    if not TELANGANA_DISTRICTS_JSON_PATH.exists():
        return []
    with open(TELANGANA_DISTRICTS_JSON_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def get_priority_districts() -> List[Dict[str, Any]]:
    """Returns the 5 priority flood monitoring districts."""
    return [d for d in load_telangana_districts() if d.get("monitoring_category") == "Priority Flood Monitoring"]

def get_standard_districts() -> List[Dict[str, Any]]:
    """Returns the standard monitoring districts."""
    return [d for d in load_telangana_districts() if d.get("monitoring_category") == "Standard Monitoring"]

def get_limited_data_districts() -> List[Dict[str, Any]]:
    """Returns the limited data districts."""
    return [d for d in load_telangana_districts() if d.get("monitoring_category") == "Limited Data"]

def get_district_metadata(district_name: str) -> Optional[Dict[str, Any]]:
    """Fetches district metadata by case-insensitive name or ID."""
    query = district_name.strip().lower()
    for d in load_telangana_districts():
        if d.get("district_name", "").lower() == query or d.get("district_id", "").lower() == query:
            return d
    return None

def get_districts_by_zone(zone: str) -> List[Dict[str, Any]]:
    """Filters districts by region_zone or simulation_zone."""
    query = zone.strip().lower()
    return [
        d for d in load_telangana_districts()
        if d.get("region_zone", "").lower() == query or d.get("simulation_zone", "").lower() == query
    ]

# Backwards compatibility: list of priority district names
MONITORED_DISTRICTS = [d["district_name"] for d in get_priority_districts()] or [
    "Hyderabad",
    "Warangal",
    "Nirmal",
    "Mancherial",
    "Bhadradri Kothagudem",
]

# Flood Risk Scoring Formula Weights
# Total = 1.00 (100%)
WEIGHT_RAINFALL = 0.35
WEIGHT_FLOOD_HISTORY = 0.25
WEIGHT_LOCATION_RISK = 0.15
WEIGHT_CITIZEN_REPORT = 0.15
WEIGHT_DRAINAGE_VULNERABILITY = 0.10

# Risk Threshold Categories
RISK_CATEGORIES = {
    "LOW": (0.0, 25.0),
    "MODERATE": (25.01, 50.0),
    "HIGH": (50.01, 75.0),
    "CRITICAL": (75.01, 100.0),
}

# LLM Configuration (Meta Llama via OpenAI-Compatible endpoint / Ollama)
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "llama").lower()
OPENAI_COMPATIBLE_BASE_URL = os.getenv("OPENAI_COMPATIBLE_BASE_URL", "http://127.0.0.1:11434/v1")
OPENAI_COMPATIBLE_API_KEY = os.getenv("OPENAI_COMPATIBLE_API_KEY", "ollama")
OPENAI_COMPATIBLE_MODEL = os.getenv("OPENAI_COMPATIBLE_MODEL", "llama3.2:3b")
LIVE_DATA_REFRESH_MINUTES = int(os.getenv("LIVE_DATA_REFRESH_MINUTES", "30"))
