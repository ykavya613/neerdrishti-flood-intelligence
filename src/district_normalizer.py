"""
District Normalization Engine (Python implementation)
Authoritative mapping for 33 Telangana Districts and known aliases.
"""

import json
import os
import re
from typing import Dict, Any, Optional

KNOWN_ALIASES = {
    "tel-hyd": "hyderabad",
    "tel-wgl": "warangal",
    "tel-nir": "nirmal",
    "tel-mnc": "mancherial",
    "tel-bdk": "bhadradri_kothagudem",
    "tel-ped": "peddapalli",
    "tel-jys": "jayashankar_bhupalpally",
    "tel-rgr": "rangareddy",
    "tel-ydb": "yadadri_bhuvanagiri",
    "tel-nlk": "nalgonda",
    "tel-sury": "suryapet",
    "tel-kmm": "khammam",
    "tel-krm": "karimnagar",
    "tel-rjs": "rajanna_sircilla",
    "tel-jgb": "jogulamba_gadwal",
    "tel-wnp": "wanaparthy",
    "tel-ngk": "nagar_kurnool",
    "tel-mhb": "mahabubnagar",
    "tel-mdb": "medak",
    "tel-sdd": "siddipet",
    "tel-nzb": "nizamabad",
    "tel-kmb": "kumuram_bheem_asifabad",
    "tel-adb": "adilabad",
    "tel-jtl": "jagtial",
    "tel-kmr": "kamareddy",
    "tel-mdm": "medchal_malkajgiri",
    "tel-vkr": "vikarabad",
    "tel-sgr": "sangareddy",
    "tel-nrp": "narayanpet",
    "tel-mlg": "mulugu",
    "tel-jng": "jangaon",
    "tel-mhb-2": "mahabubabad",
    "tel-hnk": "hanumakonda",
    "tel-bhd": "bhadradri_kothagudem",

    "warangal urban": "warangal",
    "warangal rural": "warangal",
    "hanumakonda": "hanumakonda",
    "hanamkonda": "hanumakonda",
    "hyderabad district": "hyderabad",
    "ghmc": "hyderabad",
    "hyderabad urban": "hyderabad",
    "kothagudem": "bhadradri_kothagudem",
    "bhadradri": "bhadradri_kothagudem",
    "bhadrachalam": "bhadradri_kothagudem",
    "bhadradri-kothagudem": "bhadradri_kothagudem",
    "bhupalpally": "jayashankar_bhupalpally",
    "jayashankar": "jayashankar_bhupalpally",
    "jayashankar-bhupalpally": "jayashankar_bhupalpally",
    "medchal": "medchal_malkajgiri",
    "malkajgiri": "medchal_malkajgiri",
    "medchal-malkajgiri": "medchal_malkajgiri",
    "asifabad": "kumuram_bheem_asifabad",
    "komaram bheem": "kumuram_bheem_asifabad",
    "komaram bheem asifabad": "kumuram_bheem_asifabad",
    "kumuram bheem": "kumuram_bheem_asifabad",
    "kumuram bheem asifabad": "kumuram_bheem_asifabad",
    "gadwal": "jogulamba_gadwal",
    "jogulamba": "jogulamba_gadwal",
    "yadadri": "yadadri_bhuvanagiri",
    "bhongir": "yadadri_bhuvanagiri",
    "bhuvanagiri": "yadadri_bhuvanagiri",
    "janagaon": "jangaon",
    "sircilla": "rajanna_sircilla",
    "rajanna": "rajanna_sircilla",
    "mahaboobnagar": "mahabubnagar",
    "mahbubnagar": "mahabubnagar",
    "mahaboobabad": "mahabubabad",
    "mahbubabad": "mahabubabad",
    "ranga reddy": "rangareddy",
    "r.r. district": "rangareddy",
    "cyberabad": "rangareddy",
}

_districts_cache: Dict[str, Dict[str, Any]] = {}
_name_to_id: Dict[str, str] = {}


def _load_cache():
    global _districts_cache, _name_to_id
    if _districts_cache:
        return
    json_path = os.path.join(os.getcwd(), "data", "telangana_districts.json")
    if os.path.exists(json_path):
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                for d in data:
                    d_id = str(d.get("district_id", "")).lower().strip()
                    name = str(d.get("district_name", "")).strip()
                    if d_id and name:
                        _districts_cache[d_id] = d
                        _name_to_id[name.lower()] = d_id
                        clean = re.sub(r"[^a-z0-9]", "", name.lower())
                        _name_to_id[clean] = d_id
        except Exception as e:
            print(f"Error loading districts json: {e}")


def normalize_district(raw_input: Optional[str]) -> Dict[str, Any]:
    """
    Resolves raw input to canonical Telangana district representation.
    """
    _load_cache()
    if not raw_input or not isinstance(raw_input, str):
        return {
            "district_id": "",
            "canonical_name": "",
            "match_type": "UNRESOLVED",
            "confidence": 0.0,
            "resolved": False,
        }

    raw = raw_input.strip()
    low = raw.lower()
    clean = re.sub(r"[^a-z0-9]", "", low)

    # 1. Exact ID
    if low in _districts_cache:
        d = _districts_cache[low]
        return {
            "district_id": d.get("district_id"),
            "canonical_id": d.get("district_id"),
            "district_name": d.get("district_name"),
            "canonical_name": d.get("district_name"),
            "match_type": "EXACT_ID",
            "confidence": 1.0,
            "resolved": True,
        }

    # 2. Exact Name
    if low in _name_to_id:
        d_id = _name_to_id[low]
        d = _districts_cache[d_id]
        return {
            "district_id": d.get("district_id"),
            "canonical_id": d.get("district_id"),
            "district_name": d.get("district_name"),
            "canonical_name": d.get("district_name"),
            "match_type": "EXACT_NAME",
            "confidence": 1.0,
            "resolved": True,
        }

    # 3. Normalized Name
    if clean in _name_to_id:
        d_id = _name_to_id[clean]
        d = _districts_cache[d_id]
        return {
            "district_id": d.get("district_id"),
            "canonical_id": d.get("district_id"),
            "district_name": d.get("district_name"),
            "canonical_name": d.get("district_name"),
            "match_type": "NORMALIZED_NAME",
            "confidence": 0.95,
            "resolved": True,
        }

    # 4. Verified Alias
    if low in KNOWN_ALIASES and KNOWN_ALIASES[low] in _districts_cache:
        d_id = KNOWN_ALIASES[low]
        d = _districts_cache[d_id]
        return {
            "district_id": d.get("district_id"),
            "canonical_id": d.get("district_id"),
            "district_name": d.get("district_name"),
            "canonical_name": d.get("district_name"),
            "match_type": "ALIAS",
            "confidence": 0.90,
            "resolved": True,
        }

    # 5. Unresolved
    return {
        "district_id": "",
        "canonical_id": "",
        "district_name": raw,
        "canonical_name": raw,
        "match_type": "UNRESOLVED",
        "confidence": 0.0,
        "resolved": False,
    }
