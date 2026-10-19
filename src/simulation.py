"""
NeerDrishti Simulation Engine
Allows evaluation of scenarios: Normal Conditions, Heavy Rainfall, Flood Warning, Critical Flood Event.
"""

from typing import Dict, Any, List

SIMULATION_SCENARIOS = {
    "Normal Conditions": {
        "description": "Routine dry or scattered light rain across Telangana with normal river stages.",
        "badge_color": "green",
        "rainfall_multipliers": {
            "Hyderabad": 4.5,
            "Warangal": 2.0,
            "Nirmal": 8.0,
            "Mancherial": 5.0,
            "Bhadradri Kothagudem": 12.0,
        },
        "simulated_reports": {
            "Hyderabad": 0,
            "Warangal": 0,
            "Nirmal": 0,
            "Mancherial": 0,
            "Bhadradri Kothagudem": 0,
        },
    },
    "Heavy Rainfall": {
        "description": "Active South-West monsoon trough causing persistent moderate-to-heavy downpours.",
        "badge_color": "blue",
        "rainfall_multipliers": {
            "Hyderabad": 68.0,
            "Warangal": 55.0,
            "Nirmal": 74.0,
            "Mancherial": 58.0,
            "Bhadradri Kothagudem": 82.0,
        },
        "simulated_reports": {
            "Hyderabad": 4,
            "Warangal": 2,
            "Nirmal": 3,
            "Mancherial": 2,
            "Bhadradri Kothagudem": 5,
        },
    },
    "Flood Warning": {
        "description": "Intense continuous monsoon depression. Reservoir gates opened; secondary nalas overflowing.",
        "badge_color": "orange",
        "rainfall_multipliers": {
            "Hyderabad": 115.0,
            "Warangal": 88.0,
            "Nirmal": 130.0,
            "Mancherial": 105.0,
            "Bhadradri Kothagudem": 145.0,
        },
        "simulated_reports": {
            "Hyderabad": 12,
            "Warangal": 8,
            "Nirmal": 10,
            "Mancherial": 9,
            "Bhadradri Kothagudem": 15,
        },
    },
    "Critical Flood Event": {
        "description": "Extreme cloudburst & record Godavari surge. Critical danger thresholds breached across multiple districts.",
        "badge_color": "red",
        "rainfall_multipliers": {
            "Hyderabad": 195.0,
            "Warangal": 160.0,
            "Nirmal": 220.0,
            "Mancherial": 185.0,
            "Bhadradri Kothagudem": 240.0,
        },
        "simulated_reports": {
            "Hyderabad": 28,
            "Warangal": 19,
            "Nirmal": 22,
            "Mancherial": 18,
            "Bhadradri Kothagudem": 35,
        },
    },
}


def get_scenario_data(scenario_name: str) -> Dict[str, Any]:
    """Returns scenario definition by name or default Normal scenario."""
    return SIMULATION_SCENARIOS.get(scenario_name, SIMULATION_SCENARIOS["Normal Conditions"])
