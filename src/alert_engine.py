"""
NeerDrishti Alert Decision Engine (Python Implementation)
Phase F: Alert Intelligence and Public Safety Decision Layer
"""

from typing import Dict, List, Any, Optional
from datetime import datetime
import json

# Alert Config Constants
ALERT_CONFIG = {
    'CURRENT_RISK': {
        'CRITICAL': 75.0,
        'HIGH': 50.0,
        'ELEVATED': 35.0,
        'WATCH': 25.0,
    },
    'PROJECTED_PEAK_RISK': {
        'CRITICAL': 75.0,
        'HIGH': 55.0,
        'ELEVATED': 40.0,
        'WATCH': 28.0,
    },
    'RATE_OF_INCREASE': {
        'RAPID_DELTA_THRESHOLD': 16.0,
        'MODERATE_DELTA_THRESHOLD': 8.0,
        'RAPID_6H_THRESHOLD': 12.0,
    },
    'CITIZEN_ESCALATION': {
        'CRITICAL_REPORT_MIN': 1,
        'HIGH_SEVERITY_MIN': 2,
        'RAPID_SURGE_HOURLY_RATE': 3,
        'SCORE_IMPACT_HIGH': 10.0,
    },
    'BASIN_PROPAGATION': {
        'SIGNIFICANT_SURGE_PTS': 5.0,
        'STRONG_SURGE_PTS': 9.0,
        'UPSTREAM_HIGH_RISK_PTS': 65.0,
    },
    'DATA_QUALITY': {
        'LOW_CONFIDENCE_THRESHOLD': 0.55,
        'LIMITED_DATA_SCORE_THRESHOLD': 40.0,
    },
    'DISCLAIMERS': {
        'AUTHORITY_NOTICE_EN': 'Follow instructions and evacuation directives from official Telangana State Disaster Management Authority (TGSDMA) and District Collectorates during emergencies.',
        'AUTHORITY_NOTICE_TE': 'అత్యవసర సమయాల్లో తెలంగాణ రాష్ట్ర విపత్తు నిర్వహణ సంస్థ (TGSDMA) మరియు స్థానిక జిల్లా కలెక్టరేట్ అధికారిక సూచనలను పాటించండి.',
        'PROTOTYPE_SIMULATION_NOTICE_EN': 'NeerDrishti alert intelligence is synthesized from deterministic hydro-meteorological models, citizen hazard reports, and forecast algorithms for prototype scenario testing.',
        'PROTOTYPE_SIMULATION_NOTICE_TE': 'ఈ హెచ్చరిక సమాచారం నీర్ దృష్టి హైడ్రో-వాతావరణ నమూనాలు మరియు పౌరుల నివేదికల ఆధారంగా రూపొందించబడిన ప్రోటోటైప్ సిమ్యులేషన్ అంచనా.',
    }
}

class AlertEngine:
    """
    Deterministic Alert Intelligence Engine
    Evaluates current risk, multi-horizon projections, basin propagation,
    and citizen reports to produce explainable public safety alerts.
    """

    @classmethod
    def evaluate_district_alert(cls, district_data: Dict[str, Any]) -> Dict[str, Any]:
        district_id = district_data.get('district_id') or district_data.get('district', '').lower().replace(' ', '_')
        district_name = district_data.get('district') or district_data.get('district_name', 'Unknown')
        region_zone = district_data.get('region_zone') or district_data.get('simulation_zone', 'Telangana Monitored Zone')

        current_risk = float(round(district_data.get('flood_risk_score', 0.0), 1))
        timeline = district_data.get('forecast_timeline', {}) or {}
        timeline_points = timeline.get('timeline', {}) or {}

        # Multi-horizon risk projection values
        now_risk = current_risk
        h3_risk = float(timeline_points.get('h3', {}).get('projectedRiskScore', current_risk))
        h6_risk = float(timeline_points.get('h6', {}).get('projectedRiskScore', current_risk))
        h12_risk = float(timeline_points.get('h12', {}).get('projectedRiskScore', current_risk))
        h24_risk = float(timeline_points.get('h24', {}).get('projectedRiskScore', current_risk))

        horizon_list = [
            {'horizon': 'NOW', 'hours': 0, 'risk': now_risk, 'outlook': district_data.get('risk_category', 'LOW')},
            {'horizon': '+3H', 'hours': 3, 'risk': h3_risk, 'outlook': timeline_points.get('h3', {}).get('outlookCategory', 'STABLE')},
            {'horizon': '+6H', 'hours': 6, 'risk': h6_risk, 'outlook': timeline_points.get('h6', {}).get('outlookCategory', 'STABLE')},
            {'horizon': '+12H', 'hours': 12, 'risk': h12_risk, 'outlook': timeline_points.get('h12', {}).get('outlookCategory', 'STABLE')},
            {'horizon': '+24H', 'hours': 24, 'risk': h24_risk, 'outlook': timeline_points.get('h24', {}).get('outlookCategory', 'STABLE')},
        ]

        peak_item = max(horizon_list, key=lambda x: x['risk'])
        peak_risk = float(round(peak_item['risk'], 1))
        peak_horizon = peak_item['horizon']
        risk_delta = float(round(peak_risk - current_risk, 1))
        forecast_delta = float(round(h6_risk - current_risk, 1))

        # Trend & Rate of Change
        trend = timeline.get('dominantTrend') or ('RISING' if risk_delta > 2.0 else 'IMPROVING' if risk_delta < -2.0 else 'STABLE')
        if trend == 'IMPROVING' and risk_delta <= -3.0:
            rate_of_change = 'IMPROVING'
        elif risk_delta >= ALERT_CONFIG['RATE_OF_INCREASE']['RAPID_DELTA_THRESHOLD'] or (forecast_delta >= ALERT_CONFIG['RATE_OF_INCREASE']['RAPID_6H_THRESHOLD'] and trend == 'RISING'):
            rate_of_change = 'RAPID_ESCALATION'
        elif risk_delta >= ALERT_CONFIG['RATE_OF_INCREASE']['MODERATE_DELTA_THRESHOLD'] or trend == 'RISING':
            rate_of_change = 'MODERATE_RISE'
        else:
            rate_of_change = 'STABLE'

        # Citizen Report Signals
        total_24h_reports = district_data.get('citizen_reports_24h', district_data.get('citizen_reports_count', 0))
        high_sev_reports = district_data.get('citizen_reports_high_severity', 0)
        crit_reports = district_data.get('citizen_reports_critical', 0)
        report_trend = district_data.get('citizen_reports_trend', 'Stable')

        is_citizen_surging = (
            high_sev_reports >= ALERT_CONFIG['CITIZEN_ESCALATION']['HIGH_SEVERITY_MIN'] or
            crit_reports >= ALERT_CONFIG['CITIZEN_ESCALATION']['CRITICAL_REPORT_MIN'] or
            (report_trend == 'Increasing' and total_24h_reports >= 3)
        )

        citizen_summary = (
            f"{crit_reports} critical citizen flood reports recorded." if crit_reports > 0 else
            f"{high_sev_reports} high-severity citizen reports active ({total_24h_reports} total in 24h)." if high_sev_reports > 0 else
            f"{total_24h_reports} citizen hazard reports logged with stable trend." if total_24h_reports > 0 else
            "No active crowd hazard reports in this window."
        )

        # Basin Signals
        basin_influence = timeline.get('basinInfluence', {}) or {}
        basin_surge_pts = float(round(basin_influence.get('total_projected_basin_surge', 0.0), 1))
        has_upstream_threat = basin_influence.get('has_upstream_influence', False) or (basin_surge_pts >= ALERT_CONFIG['BASIN_PROPAGATION']['SIGNIFICANT_SURGE_PTS'])
        upstream_threats = basin_influence.get('active_upstream_threats', []) or []
        upstream_districts = [t.get('upstream_district_name', '') for t in upstream_threats if t.get('upstream_district_name')]

        basin_summary = (
            f"Potential upstream influence detected: +{basin_surge_pts} pts projected surge propagation from {', '.join(upstream_districts) or 'upstream reaches'}."
            if has_upstream_threat else
            "Upstream river basin telemetry stable; no significant downstream surge propagation projected."
        )

        # Data Confidence
        data_mode = district_data.get('data_source_mode') or ('Simulated Data' if district_data.get('is_simulated') else 'Live Data')
        data_confidence = district_data.get('data_confidence') or district_data.get('risk_confidence') or 'Medium'
        forecast_confidence = timeline.get('dataConfidence', 'MEDIUM')
        confidence_score = (district_data.get('risk_data_completeness', 80) / 100.0)

        limitations = []
        if district_data.get('data_limitation_notes'):
            limitations.append(district_data.get('data_limitation_notes'))
        if district_data.get('is_simulated') or 'simulat' in data_mode.lower() or 'prototype' in data_mode.lower():
            limitations.append('Decision support generated from prototype simulation parameters.')
        if district_data.get('monitoring_category') == 'Limited Data':
            limitations.append('Limited local AWS telemetry coverage; reliance on interpolated regional grid.')
        if not limitations:
            limitations.append('Model outputs reflect automated multi-sensor convergence.')

        # Triggers
        trigger_signals = []
        trigger_reasons = []
        secondary_alerts = []

        # 1. Current Risk Triggers
        if current_risk >= ALERT_CONFIG['CURRENT_RISK']['CRITICAL']:
            trigger_signals.append({
                'signal_type': 'CURRENT_RISK',
                'severity': 'CRITICAL',
                'description': f"Current flood risk score is critical ({current_risk}/100)",
                'evidence': f"Exceeds critical threshold of {ALERT_CONFIG['CURRENT_RISK']['CRITICAL']}/100",
                'threshold_matched': f"CURRENT_RISK >= {ALERT_CONFIG['CURRENT_RISK']['CRITICAL']}",
            })
            trigger_reasons.append(f"Current flood risk is in the CRITICAL zone ({current_risk}/100).")
        elif current_risk >= ALERT_CONFIG['CURRENT_RISK']['HIGH']:
            trigger_signals.append({
                'signal_type': 'CURRENT_RISK',
                'severity': 'HIGH',
                'description': f"Current flood risk score is high ({current_risk}/100)",
                'evidence': f"Exceeds high risk threshold of {ALERT_CONFIG['CURRENT_RISK']['HIGH']}/100",
                'threshold_matched': f"CURRENT_RISK >= {ALERT_CONFIG['CURRENT_RISK']['HIGH']}",
            })
            trigger_reasons.append(f"Current flood risk is in the HIGH zone ({current_risk}/100).")
        elif current_risk >= ALERT_CONFIG['CURRENT_RISK']['ELEVATED']:
            trigger_signals.append({
                'signal_type': 'CURRENT_RISK',
                'severity': 'MODERATE',
                'description': f"Current flood risk score is elevated ({current_risk}/100)",
                'evidence': f"Exceeds elevated threshold of {ALERT_CONFIG['CURRENT_RISK']['ELEVATED']}/100",
                'threshold_matched': f"CURRENT_RISK >= {ALERT_CONFIG['CURRENT_RISK']['ELEVATED']}",
            })
            trigger_reasons.append(f"Current flood risk is ELEVATED ({current_risk}/100).")

        # 2. Forecast Peak Triggers
        if peak_risk >= ALERT_CONFIG['PROJECTED_PEAK_RISK']['CRITICAL']:
            trigger_signals.append({
                'signal_type': 'FORECAST_PEAK',
                'severity': 'CRITICAL',
                'description': f"Projected risk reaches critical level of {peak_risk}/100 at horizon {peak_horizon}",
                'evidence': f"Forecast peak ({peak_risk}) crosses critical threshold ({ALERT_CONFIG['PROJECTED_PEAK_RISK']['CRITICAL']})",
                'threshold_matched': f"PROJECTED_PEAK >= {ALERT_CONFIG['PROJECTED_PEAK_RISK']['CRITICAL']}",
            })
            trigger_reasons.append(f"Projected peak risk reaches CRITICAL level of {peak_risk}/100 at horizon {peak_horizon}.")
        elif peak_risk >= ALERT_CONFIG['PROJECTED_PEAK_RISK']['HIGH']:
            trigger_signals.append({
                'signal_type': 'FORECAST_PEAK',
                'severity': 'HIGH',
                'description': f"Projected risk reaches high level of {peak_risk}/100 at horizon {peak_horizon}",
                'evidence': f"Forecast peak ({peak_risk}) crosses high threshold ({ALERT_CONFIG['PROJECTED_PEAK_RISK']['HIGH']})",
                'threshold_matched': f"PROJECTED_PEAK >= {ALERT_CONFIG['PROJECTED_PEAK_RISK']['HIGH']}",
            })
            trigger_reasons.append(f"Projected peak risk reaches HIGH level of {peak_risk}/100 at horizon {peak_horizon}.")
        elif peak_risk >= ALERT_CONFIG['PROJECTED_PEAK_RISK']['ELEVATED']:
            trigger_signals.append({
                'signal_type': 'FORECAST_PEAK',
                'severity': 'MODERATE',
                'description': f"Projected risk elevates to {peak_risk}/100 at horizon {peak_horizon}",
                'evidence': f"Forecast peak ({peak_risk}) crosses elevated threshold ({ALERT_CONFIG['PROJECTED_PEAK_RISK']['ELEVATED']})",
                'threshold_matched': f"PROJECTED_PEAK >= {ALERT_CONFIG['PROJECTED_PEAK_RISK']['ELEVATED']}",
            })
            trigger_reasons.append(f"Projected peak risk elevates to {peak_risk}/100 at horizon {peak_horizon}.")

        # 3. Rate of Increase Triggers
        if rate_of_change == 'RAPID_ESCALATION':
            trigger_signals.append({
                'signal_type': 'RATE_OF_INCREASE',
                'severity': 'HIGH',
                'description': f"Rapid risk escalation detected (+{risk_delta} pts delta to {peak_horizon})",
                'evidence': f"Delta of +{risk_delta} pts exceeds rapid escalation threshold (+{ALERT_CONFIG['RATE_OF_INCREASE']['RAPID_DELTA_THRESHOLD']} pts)",
                'threshold_matched': f"RATE_OF_INCREASE >= {ALERT_CONFIG['RATE_OF_INCREASE']['RAPID_DELTA_THRESHOLD']}",
            })
            trigger_reasons.append(f"Rapid risk escalation detected (+{risk_delta} pts increase projected by {peak_horizon}).")
            secondary_alerts.append({
                'alert_type': 'Rapid Risk Increase',
                'level': 'HIGH',
                'reason': f"Risk is projected to rise rapidly by +{risk_delta} points by {peak_horizon}.",
            })
        elif rate_of_change == 'MODERATE_RISE':
            trigger_signals.append({
                'signal_type': 'RATE_OF_INCREASE',
                'severity': 'MODERATE',
                'description': f"Forecast trend is rising (+{risk_delta} pts delta)",
                'evidence': f"Positive delta with {trend} trajectory",
                'threshold_matched': 'TREND == RISING',
            })
            trigger_reasons.append(f"Risk trajectory is rising steadily with +{risk_delta} pts delta.")
            secondary_alerts.append({
                'alert_type': 'Forecast Escalation',
                'level': 'ELEVATED',
                'reason': "Steady upward trajectory projected across upcoming forecast horizons.",
            })

        # 4. Citizen Report Triggers
        if crit_reports >= ALERT_CONFIG['CITIZEN_ESCALATION']['CRITICAL_REPORT_MIN']:
            trigger_signals.append({
                'signal_type': 'CITIZEN_REPORTS',
                'severity': 'CRITICAL',
                'description': f"{crit_reports} critical citizen hazard reports active in field",
                'evidence': "Critical citizen report presence confirmed on ground",
                'threshold_matched': f"CRITICAL_REPORTS >= {ALERT_CONFIG['CITIZEN_ESCALATION']['CRITICAL_REPORT_MIN']}",
            })
            trigger_reasons.append(f"Field crowd reports indicate active severe inundation ({crit_reports} critical reports).")
            secondary_alerts.append({
                'alert_type': 'Citizen Report Surge',
                'level': 'CRITICAL',
                'reason': "Critical flood hazard reports verified by ground citizens.",
            })
        elif high_sev_reports >= ALERT_CONFIG['CITIZEN_ESCALATION']['HIGH_SEVERITY_MIN']:
            trigger_signals.append({
                'signal_type': 'CITIZEN_REPORTS',
                'severity': 'HIGH',
                'description': f"{high_sev_reports} high-severity citizen reports logged",
                'evidence': "Multiple severe incident reports confirmed in 24h window",
                'threshold_matched': f"HIGH_SEVERITY_REPORTS >= {ALERT_CONFIG['CITIZEN_ESCALATION']['HIGH_SEVERITY_MIN']}",
            })
            trigger_reasons.append(f"Community crowd reports indicate multiple high-severity flooding incidents ({high_sev_reports} reports).")
            secondary_alerts.append({
                'alert_type': 'Citizen Report Surge',
                'level': 'HIGH',
                'reason': "Surge in high-severity citizen flooding reports in the district.",
            })

        # 5. Basin Propagation Triggers
        if has_upstream_threat:
            basin_sev = 'HIGH' if basin_surge_pts >= ALERT_CONFIG['BASIN_PROPAGATION']['STRONG_SURGE_PTS'] else 'MODERATE'
            trigger_signals.append({
                'signal_type': 'BASIN_PROPAGATION',
                'severity': basin_sev,
                'description': f"Potential upstream basin surge propagation (+{basin_surge_pts} pts)",
                'evidence': f"Upstream connection influence from {', '.join(upstream_districts) or 'hydrological corridor'}",
                'threshold_matched': f"BASIN_SURGE >= {ALERT_CONFIG['BASIN_PROPAGATION']['SIGNIFICANT_SURGE_PTS']}",
            })
            trigger_reasons.append(f"Potential upstream hydrological influence detected (+{basin_surge_pts} pts projected surge from upstream river reaches).")
            secondary_alerts.append({
                'alert_type': 'Basin Propagation Watch',
                'level': 'HIGH' if basin_sev == 'HIGH' else 'ELEVATED',
                'reason': "Upstream river discharge and runoff may propagate downstream into local watercourses.",
            })

        # Final Alert Level Synthesis
        if current_risk >= ALERT_CONFIG['CURRENT_RISK']['CRITICAL'] or peak_risk >= ALERT_CONFIG['PROJECTED_PEAK_RISK']['CRITICAL'] or (current_risk >= 65 and rate_of_change == 'RAPID_ESCALATION') or crit_reports > 0:
            alert_level = 'CRITICAL'
            alert_level_code = 4
            primary_alert_type = 'Critical Projection' if (peak_risk >= ALERT_CONFIG['PROJECTED_PEAK_RISK']['CRITICAL'] and current_risk < ALERT_CONFIG['CURRENT_RISK']['CRITICAL']) else 'Current Risk Alert'
        elif current_risk >= ALERT_CONFIG['CURRENT_RISK']['HIGH'] or peak_risk >= ALERT_CONFIG['PROJECTED_PEAK_RISK']['HIGH'] or (current_risk >= 45 and has_upstream_threat and rate_of_change == 'RAPID_ESCALATION') or high_sev_reports >= 2:
            alert_level = 'HIGH'
            alert_level_code = 3
            primary_alert_type = (
                'Rapid Risk Increase' if rate_of_change == 'RAPID_ESCALATION' else
                'Forecast Escalation' if (peak_risk >= ALERT_CONFIG['PROJECTED_PEAK_RISK']['HIGH'] and current_risk < ALERT_CONFIG['CURRENT_RISK']['HIGH']) else
                'Basin Propagation Watch' if (has_upstream_threat and basin_surge_pts >= 6.0) else
                'Current Risk Alert'
            )
        elif current_risk >= ALERT_CONFIG['CURRENT_RISK']['ELEVATED'] or peak_risk >= ALERT_CONFIG['PROJECTED_PEAK_RISK']['ELEVATED'] or trend == 'RISING' or has_upstream_threat or total_24h_reports >= 2:
            alert_level = 'ELEVATED'
            alert_level_code = 2
            primary_alert_type = 'Forecast Escalation' if (rate_of_change == 'MODERATE_RISE' or trend == 'RISING') else 'Basin Propagation Watch' if has_upstream_threat else 'Current Risk Alert'
        elif current_risk >= ALERT_CONFIG['CURRENT_RISK']['WATCH'] or peak_risk >= ALERT_CONFIG['PROJECTED_PEAK_RISK']['WATCH'] or trend == 'RISING':
            alert_level = 'WATCH'
            alert_level_code = 1
            primary_alert_type = 'Forecast Escalation' if trend == 'RISING' else 'Current Risk Alert'
        else:
            alert_level = 'NORMAL'
            alert_level_code = 0
            primary_alert_type = 'Current Risk Alert'
            if not trigger_reasons:
                trigger_reasons.append('Current and forecast indicators remain within normal operational baselines.')

        # Headline
        headline = (
            f"CRITICAL FLOOD RISK ALERT — {district_name.upper()} ({peak_horizon} Peak: {peak_risk}/100)" if alert_level == 'CRITICAL' else
            f"HIGH FLOOD RISK PROJECTION — {district_name.upper()} ({peak_horizon} Outlook: {peak_risk}/100)" if alert_level == 'HIGH' else
            f"ELEVATED FLOOD MONITORING — {district_name.upper()} ({trend} Trajectory)" if alert_level == 'ELEVATED' else
            f"FLOOD RISK WATCH — {district_name.upper()} (Monitoring Baseline)" if alert_level == 'WATCH' else
            f"NORMAL HYDRO-METEOROLOGICAL CONDITIONS — {district_name.upper()}"
        )

        timeline_escalation = [
            {
                'horizon': h['horizon'],
                'hours': h['hours'],
                'projected_risk': float(round(h['risk'], 1)),
                'outlook': h['outlook'],
                'escalation_flag': (h['risk'] >= (50 if alert_level_code >= 3 else 35) and h['risk'] > current_risk)
            }
            for h in horizon_list
        ]

        # Bilingual advisories
        advisories = cls._generate_bilingual_advisories(
            district_name, alert_level, primary_alert_type, current_risk,
            peak_risk, peak_horizon, trend, rate_of_change, trigger_reasons,
            has_upstream_threat, basin_summary, data_mode, limitations
        )

        alert_id = f"ALT-{district_id.upper()[:8]}-{int(datetime.utcnow().timestamp()) % 1000000:06d}"
        now_iso = datetime.utcnow().isoformat() + 'Z'

        return {
            'alert_id': alert_id,
            'district_id': district_id,
            'district_name': district_name,
            'region_zone': region_zone,
            'alert_level': alert_level,
            'alert_level_code': alert_level_code,
            'primary_alert_type': primary_alert_type,
            'headline': headline,
            'trigger_reasons': trigger_reasons,
            'trigger_signals': trigger_signals,
            'current_risk': current_risk,
            'projected_risk': peak_risk,
            'peak_horizon': peak_horizon,
            'trend': trend,
            'rate_of_change': rate_of_change,
            'risk_delta': risk_delta,
            'forecast_delta': forecast_delta,
            'citizen_signal': {
                'total_24h': total_24h_reports,
                'high_severity_count': high_sev_reports,
                'critical_count': crit_reports,
                'growth_trend': report_trend,
                'is_surging': is_citizen_surging,
                'score_contribution': district_data.get('contributions', {}).get('citizen_reports', 0.0),
                'summary': citizen_summary,
            },
            'basin_signal': {
                'has_upstream_threat': has_upstream_threat,
                'upstream_districts': upstream_districts,
                'projected_surge_score': basin_surge_pts,
                'estimated_travel_window_hours': 6,
                'summary': basin_summary,
            },
            'confidence': data_confidence,
            'confidence_score': confidence_score,
            'forecast_confidence': forecast_confidence,
            'data_mode': data_mode,
            'model_limitations': limitations,
            'advisories': advisories,
            'timeline_escalation': timeline_escalation,
            'secondary_alerts': secondary_alerts,
            'status': 'Active',
            'created_at': now_iso,
            'updated_at': now_iso,
        }

    @classmethod
    def _generate_bilingual_advisories(
        cls, district_name: str, alert_level: str, primary_alert_type: str,
        current_risk: float, peak_risk: float, peak_horizon: str, trend: str,
        rate_of_change: str, trigger_reasons: List[str], has_upstream_threat: bool,
        basin_summary: str, data_mode: str, limitations: List[str]
    ) -> Dict[str, Any]:
        is_simulated = 'simulat' in data_mode.lower() or 'prototype' in data_mode.lower()
        sim_notice_en = (
            f"PROTOTYPE DECISION SUPPORT: This advisory is based on mathematical risk modeling and {data_mode.lower()} for scenario evaluation."
            if is_simulated else
            "TELEMETRY NOTICE: Synthesized from multi-sensor automatic weather and river gauging feeds."
        )
        sim_notice_te = (
            "ప్రోటోటైప్ నిర్ణయ మద్దతు: ఈ సలహా గణిత ప్రమాద నమూనా మరియు సిమ్యులేషన్ డేటా ఆధారంగా రూపొందించబడింది."
            if is_simulated else
            "టెలిమెట్రీ నోటీసు: ఆటోమేటిక్ వాతావరణ మరియు నదీ గేజింగ్ డేటా నుండి విశ్లేషించబడింది."
        )

        if alert_level == 'CRITICAL':
            en_title = f"CRITICAL FLOOD RISK ALERT — {district_name.upper()}"
            te_title = f"తీవ్ర వరద ప్రమాద హెచ్చరిక — {district_name}"
            en_situation = f"{district_name} is facing a critical flood risk state (Current: {current_risk}/100, Peak Projected: {peak_risk}/100 at {peak_horizon}). Severe inundation of low-lying settlements and road transport disruptions are highly probable."
            te_situation = f"{district_name} జిల్లాలో వరద ప్రమాదం అత్యవసర క్లిష్ట స్థాయికి చేరుకుంది (ప్రస్తుత ప్రమాదం: {current_risk}/100, {peak_horizon} గంటల్లో అంచనా: {peak_risk}/100)."
            en_precautions = [
                'Avoid all non-essential road travel and stay clear of submerged causeways and underpasses.',
                'Residents in riverbank lowlands and low-lying nala corridors should move valuables to upper floors.',
                'Keep emergency battery backups and local administrative contact numbers ready.',
                'Follow instructions from official District Collectorates and Disaster Response Force (DRF) teams.',
            ]
            te_precautions = [
                'అనవసర ప్రయాణాలను పూర్తిగా నివారించండి; ముంపునకు గురైన అండర్‌పాస్‌ల వద్దకు వెళ్లవద్దు.',
                'నదీ పరివాహక ప్రాంత ప్రజలు విలువైన వస్తువులను సురక్షిత ప్రదేశాలకు తరలించండి.',
                'ఎమర్జెన్సీ లైట్లు మరియు ఫోన్ ఛార్జింగ్ అందుబాటులో ఉంచుకోండి.',
            ]
        elif alert_level == 'HIGH':
            en_title = f"HIGH FLOOD RISK PROJECTION — {district_name.upper()}"
            te_title = f"అధిక వరద ప్రమాద అంచనా — {district_name}"
            en_situation = f"Flood risk is projected to escalate across {district_name} over the coming hours (Current Risk: {current_risk}/100, Projected Peak: {peak_risk}/100 by {peak_horizon})."
            te_situation = f"{district_name} జిల్లాలో రాబోయే గంటల్లో వరద ముప్పు పెరిగే అవకాశం ఉంది (ప్రస్తుత స్కోర్: {current_risk}/100, {peak_horizon} సమయానికి: {peak_risk}/100)."
            en_precautions = [
                'Avoid parking vehicles in low-lying basements or near open stormwater drains.',
                'Commuters should check alternate elevated routes and monitor live traffic advisories.',
                'Monitor local weather bulletins and municipal corporation alerts.',
            ]
            te_precautions = [
                'లోతట్టు సెల్లార్లలో వాహనాలను నిలపవద్దు.',
                'ప్రయాణికులు ముందస్తుగా సురక్షిత మార్గాలను ఎంచుకోండి.',
            ]
        elif alert_level == 'ELEVATED':
            en_title = f"ELEVATED FLOOD RISK WATCH — {district_name.upper()}"
            te_title = f"పెరుగుతున్న వరద అప్రమత్తత — {district_name}"
            en_situation = f"Elevated hydro-meteorological indicators detected for {district_name} (+{round(peak_risk - current_risk, 1)} pts by {peak_horizon})."
            te_situation = f"{district_name} పరిధిలో వర్షపాతం మరియు నీటి ప్రవాహ సూచికలు పెరుగుతున్నాయి."
            en_precautions = [
                'Exercise caution near urban culverts, roadside drains, and construction areas.',
                'Stay tuned to local rainfall forecast updates.',
            ]
            te_precautions = [
                'రోడ్ల పక్కన ఉన్న డ్రైనేజీల వద్ద జాగ్రత్త వహించండి.',
            ]
        elif alert_level == 'WATCH':
            en_title = f"FLOOD RISK WATCH — {district_name.upper()}"
            te_title = f"వరద ముప్పు పరిశీలన — {district_name}"
            en_situation = f"Baseline monitoring active for {district_name}."
            te_situation = f"{district_name} జిల్లాలో పరిస్థితి సాధారణ పరిశీలనలో ఉంది."
            en_precautions = ['Regular monitoring of daily weather updates is advised.']
            te_precautions = ['సాధారణ వాతావరణ హెచ్చరికలను గమనిస్తూ ఉండండి.']
        else:
            en_title = f"NORMAL CONDITIONS — {district_name.upper()}"
            te_title = f"సాధారణ వాతావరణం — {district_name}"
            en_situation = f"Hydro-meteorological conditions in {district_name} are currently within safe baseline parameters (Risk Score: {current_risk}/100)."
            te_situation = f"{district_name} పరిధిలో వరద ముప్పు సాధారణ స్థాయిలో ఉంది."
            en_precautions = ['No emergency flood precautions required at this time.']
            te_precautions = ['ప్రస్తుతం ఎటువంటి ముందస్తు జాగ్రత్తలు అవసరం లేదు.']

        why_en = ' '.join(trigger_reasons)
        why_te = ' '.join([
            'ప్రస్తుత లేదా అంచనా వేసిన వరద సూచిక అత్యవసర పరిమితిని దాటింది.' if 'CRITICAL' in r else
            'అధిక వర్షపాతం లేదా వరద ప్రమాద సూచిక నమోదైంది.' if 'HIGH' in r else
            'త్వరితగతిన వరద ప్రమాదం పెరుగుతోందని అంచనా.' if 'escalation' in r else
            'ఎగువ పరివాహక ప్రాంతాల నుండి నీటి ప్రవాహం పెరిగే అవకాశం ఉంది.' if 'upstream' in r else
            'పౌరుల నుండి తీవ్రమైన నీటి ముంపు నివేదికలు నమోదయ్యాయి.' if 'crowd' in r else
            'పరిస్థితి సాధారణ పరిశీలన పరిధిలో ఉంది.'
            for r in trigger_reasons
        ])

        return {
            'english': {
                'title': en_title,
                'situation_summary': en_situation,
                'why_triggered': why_en,
                'recommended_precautions': en_precautions,
                'uncertainty_notice': f"{sim_notice_en} {' '.join(limitations)}",
                'authority_disclaimer': ALERT_CONFIG['DISCLAIMERS']['AUTHORITY_NOTICE_EN'],
            },
            'telugu': {
                'title': te_title,
                'situation_summary': te_situation,
                'why_triggered': why_te,
                'recommended_precautions': te_precautions,
                'uncertainty_notice': f"{sim_notice_te} {' '.join(limitations)}",
                'authority_disclaimer': ALERT_CONFIG['DISCLAIMERS']['AUTHORITY_NOTICE_TE'],
            }
        }

    @classmethod
    def evaluate_all_districts(cls, districts_list: List[Dict[str, Any]]) -> Dict[str, Any]:
        alerts = [cls.evaluate_district_alert(d) for d in districts_list]

        normal_count = sum(1 for a in alerts if a['alert_level'] == 'NORMAL')
        watch_count = sum(1 for a in alerts if a['alert_level'] == 'WATCH')
        elevated_count = sum(1 for a in alerts if a['alert_level'] == 'ELEVATED')
        high_count = sum(1 for a in alerts if a['alert_level'] == 'HIGH')
        critical_count = sum(1 for a in alerts if a['alert_level'] == 'CRITICAL')

        rising_count = sum(1 for a in alerts if a['trend'] == 'RISING')
        rapid_escalation_count = sum(1 for a in alerts if a['rate_of_change'] == 'RAPID_ESCALATION')
        basin_threat_count = sum(1 for a in alerts if a['basin_signal']['has_upstream_threat'])
        citizen_surge_count = sum(1 for a in alerts if a['citizen_signal']['is_surging'])

        top_escalating = sorted(
            [a for a in alerts if a['risk_delta'] > 0],
            key=lambda x: x['risk_delta'],
            reverse=True
        )[:5]

        top_escalating_formatted = [
            {
                'district_id': a['district_id'],
                'district_name': a['district_name'],
                'current_risk': a['current_risk'],
                'peak_risk': a['projected_risk'],
                'peak_horizon': a['peak_horizon'],
                'risk_delta': a['risk_delta'],
                'alert_level': a['alert_level'],
            }
            for a in top_escalating
        ]

        highest_alert = max(alerts, key=lambda a: (a['alert_level_code'], a['projected_risk']), default=None)
        highest_district = {
            'district_id': highest_alert['district_id'],
            'district_name': highest_alert['district_name'],
            'alert_level': highest_alert['alert_level'],
            'alert_type': highest_alert['primary_alert_type'],
            'peak_risk': highest_alert['projected_risk'],
            'peak_horizon': highest_alert['peak_horizon'],
        } if highest_alert else None

        summary = {
            'total_districts': len(alerts),
            'total_active_alerts': watch_count + elevated_count + high_count + critical_count,
            'normal_count': normal_count,
            'watch_count': watch_count,
            'elevated_count': elevated_count,
            'high_count': high_count,
            'critical_count': critical_count,
            'rising_trend_count': rising_count,
            'rapid_escalation_count': rapid_escalation_count,
            'basin_threat_count': basin_threat_count,
            'citizen_surge_count': citizen_surge_count,
            'top_escalating_districts': top_escalating_formatted,
            'highest_severity_district': highest_district,
            'last_recalculated_at': datetime.utcnow().isoformat() + 'Z',
        }

        return {'alerts': alerts, 'summary': summary}
