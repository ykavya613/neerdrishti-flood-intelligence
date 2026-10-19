# NeerDrishti System & Project Architecture

## 1. Project Purpose & Scope
* **Decision Support Prototype**: NeerDrishti is an explainable flood intelligence and early warning decision-support system tailored for all 33 districts of Telangana.
* **Non-Emergency Advisory Notice**: NeerDrishti provides analytical simulation, situational synthesis, and predictive assessments. It is NOT a replacement for statutory government evacuation orders or official IMD weather bulletins.

## 2. Core 5-Factor Deterministic Risk Model
The mathematical flood risk score (0–100) is calculated using weighted contributions:
1. **Rainfall (35% Weight)**: Combines 24-hour cumulative precipitation (mm) and short-duration 3-hour burst rainfall.
2. **Historical Flood Inundation (25% Weight)**: District-level vulnerability derived from past monsoon inundation records and flood frequency.
3. **Terrain & Topography (15% Weight)**: Elevation, slope gradient, and terrain characteristics (Deccan plateau, riverine floodplains, granitic basin).
4. **Citizen Ground Reports (15% Weight)**: Verified crowdsourced field reports with incident type, severity multipliers, and temporal decay.
5. **Drainage & Nala Vulnerability (10% Weight)**: Stormwater drain constriction, encroachment levels, and urban impervious surface density.

## 3. Predictive Forecast Engine
* **Forecast Horizons**: NOW (Baseline), +3 Hours, +6 Hours, +12 Hours, +24 Hours.
* **Deterministic Trajectory Curves**: Models rainfall forecast projections, antecedent soil saturation, hydrological discharge routing, and citizen ground surge trends.
* **Forecast Outlook Categories**: NORMAL_OUTLOOK, ELEVATING_RISK, WATCH_FOR_ESCALATION, HIGH_PROJECTION, CRITICAL_PROJECTION.

## 4. Alert Intelligence Decision Layer
* **Alert Levels**: NORMAL (0), WATCH (1), ELEVATED (2), HIGH (3), CRITICAL (4).
* **Multi-Signal Triggers**: Current risk threshold, 6h/12h projected peak horizon, upstream river basin propagation surge, citizen ground report surges, and rapid escalation rate-of-change deltas.

## 5. Data Provenance & Limitations
* **Data Modes**: Live Data, Historical Baseline, Simulated Forecast, Prototype Estimation.
* **Data Confidence**: High (>80%), Medium (50-80%), Low (<50%), Prototype.
* **District Coverage**: 5 Priority Monitoring districts, 15 Standard Monitoring districts, 13 Limited Data districts.
