import { 
  DistrictAlert, 
  AlertLevel, 
  AlertType, 
  TriggerSignal, 
  DistrictAdvisory,
  BilingualAdvisory,
  MultilingualAdvisory, 
  AlertSummaryMetrics 
} from '../types/alerts';
import { DistrictStatus } from '../types';
import { ALERT_CONFIG } from '../config/alert_thresholds';
import { normalizeDistrict } from './district_normalizer';

/**
 * Deterministic Alert Decision Engine for NeerDrishti
 * Integrates:
 * Current Risk + Forecast Multi-Horizon Risk + Basin Propagation + Citizen Reports + Data Confidence
 */

export class AlertEngine {
  /**
   * Evaluates a single district status and generates comprehensive Alert Intelligence
   */
  public static evaluateDistrictAlert(district: DistrictStatus): DistrictAlert {
    const rawId = district.district_id || district.district;
    const norm = normalizeDistrict(rawId);
    const districtId = norm.canonical_id || norm.districtId || district.district.toLowerCase().replace(/ /g, '_');
    const districtName = norm.district_name || norm.canonicalName || district.district;
    const regionZone = district.region_zone || district.simulation_zone || 'Telangana Monitored Zone';

    const currentRisk = Number((district.flood_risk_score || 0).toFixed(1));
    const timeline = district.forecast_timeline;

    // Horizon risks
    const nowRisk = currentRisk;
    const h3Risk = timeline?.timeline?.h3?.projectedRiskScore ?? currentRisk;
    const h6Risk = timeline?.timeline?.h6?.projectedRiskScore ?? (district.forecast_summary?.projectedRiskScore ?? currentRisk);
    const h12Risk = timeline?.timeline?.h12?.projectedRiskScore ?? currentRisk;
    const h24Risk = timeline?.timeline?.h24?.projectedRiskScore ?? currentRisk;

    // Find peak risk & peak horizon
    const horizonList: Array<{ horizon: string; hours: number; risk: number; outlook: string }> = [
      { horizon: 'NOW', hours: 0, risk: nowRisk, outlook: district.risk_category },
      { horizon: '+3H', hours: 3, risk: h3Risk, outlook: timeline?.timeline?.h3?.outlookCategory || 'STABLE' },
      { horizon: '+6H', hours: 6, risk: h6Risk, outlook: timeline?.timeline?.h6?.outlookCategory || 'STABLE' },
      { horizon: '+12H', hours: 12, risk: h12Risk, outlook: timeline?.timeline?.h12?.outlookCategory || 'STABLE' },
      { horizon: '+24H', hours: 24, risk: h24Risk, outlook: timeline?.timeline?.h24?.outlookCategory || 'STABLE' },
    ];

    let peakObj = horizonList[0];
    for (const item of horizonList) {
      if (item.risk > peakObj.risk) {
        peakObj = item;
      }
    }

    const peakRisk = Number(peakObj.risk.toFixed(1));
    const peakHorizon = peakObj.horizon;
    const riskDelta = Number((peakRisk - currentRisk).toFixed(1));
    const forecastDelta = Number((h6Risk - currentRisk).toFixed(1));

    // Trend and Rate of Change
    const rawTrend = timeline?.dominantTrend || (riskDelta > 2.0 ? 'RISING' : riskDelta < -2.0 ? 'IMPROVING' : 'STABLE');
    const trend: 'RISING' | 'STABLE' | 'IMPROVING' = rawTrend === 'RISING' ? 'RISING' : rawTrend === 'IMPROVING' ? 'IMPROVING' : 'STABLE';
    let rateOfChange: 'STABLE' | 'MODERATE_RISE' | 'RAPID_ESCALATION' | 'IMPROVING' = 'STABLE';
    if (trend === 'IMPROVING' && riskDelta <= -3.0) {
      rateOfChange = 'IMPROVING';
    } else if (riskDelta >= ALERT_CONFIG.RATE_OF_INCREASE.RAPID_DELTA_THRESHOLD || (forecastDelta >= ALERT_CONFIG.RATE_OF_INCREASE.RAPID_6H_THRESHOLD && trend === 'RISING')) {
      rateOfChange = 'RAPID_ESCALATION';
    } else if (riskDelta >= ALERT_CONFIG.RATE_OF_INCREASE.MODERATE_DELTA_THRESHOLD || trend === 'RISING') {
      rateOfChange = 'MODERATE_RISE';
    }

    // Citizen Signals
    const total24hReports = district.citizen_reports_24h ?? district.citizen_reports_count ?? 0;
    const highSevReports = district.citizen_reports_high_severity ?? 0;
    const critReports = district.citizen_reports_critical ?? 0;
    const reportTrend = district.citizen_reports_trend ?? 'Stable';
    const isCitizenSurging = (highSevReports >= ALERT_CONFIG.CITIZEN_ESCALATION.HIGH_SEVERITY_MIN) ||
                             (critReports >= ALERT_CONFIG.CITIZEN_ESCALATION.CRITICAL_REPORT_MIN) ||
                             (reportTrend === 'Increasing' && total24hReports >= 3);

    const citizenSummary = critReports > 0
      ? `${critReports} critical citizen flood reports recorded.`
      : highSevReports > 0
      ? `${highSevReports} high-severity citizen reports active (${total24hReports} total in 24h).`
      : total24hReports > 0
      ? `${total24hReports} citizen hazard reports logged with stable trend.`
      : 'No active crowd hazard reports in this window.';

    // Basin Propagation Signals
    const basinInfluence = timeline?.basinInfluence;
    const basinSurgePts = Number((basinInfluence?.total_projected_basin_surge ?? 0).toFixed(1));
    const hasUpstreamThreat = Boolean(
      basinInfluence?.has_upstream_influence ||
      ((basinInfluence as any)?.upstream_surge_detected) ||
      (basinInfluence?.active_upstream_threats && basinInfluence.active_upstream_threats.length > 0) ||
      (basinSurgePts >= ALERT_CONFIG.BASIN_PROPAGATION.SIGNIFICANT_SURGE_PTS)
    );
    const upstreamDistricts = basinInfluence?.active_upstream_threats?.map(t => t.upstream_district_name) || [];

    const basinSummary = hasUpstreamThreat
      ? `Potential upstream influence detected: +${basinSurgePts} pts projected surge propagation from ${upstreamDistricts.join(', ') || 'upstream river catchments'}.`
      : 'Upstream river basin telemetry stable; no significant downstream surge propagation projected.';

    // Data Confidence & Provenance
    const dataMode = district.data_source_mode || (district.is_simulated ? 'Simulated Data' : 'Live Data');
    const dataConfidence = district.data_confidence || district.risk_confidence || 'Medium';
    const forecastConfidence = timeline?.dataConfidence || 'MEDIUM';
    const confidenceScore = district.risk_data_completeness ? district.risk_data_completeness / 100 : 0.8;

    const limitations: string[] = [];
    if (district.data_limitation_notes) {
      limitations.push(district.data_limitation_notes);
    }
    if (district.is_simulated || dataMode.toLowerCase().includes('simulat') || dataMode.toLowerCase().includes('prototype')) {
      limitations.push('Decision support generated from prototype simulation parameters.');
    }
    if (district.monitoring_category === 'Limited Data') {
      limitations.push('Limited local AWS telemetry coverage; reliance on interpolated regional grid.');
    }
    if (limitations.length === 0) {
      limitations.push('Model outputs reflect automated multi-sensor convergence.');
    }

    // ========================================================
    // TRIGGER SIGNALS & DETERMINISTIC DECISION RULES
    // ========================================================
    const triggerSignals: TriggerSignal[] = [];
    const triggerReasons: string[] = [];
    const secondaryAlertsList: Array<{ alert_type: AlertType; level: AlertLevel; reason: string }> = [];

    // 1. Current Risk Triggers
    if (currentRisk >= ALERT_CONFIG.CURRENT_RISK.CRITICAL) {
      triggerSignals.push({
        signal_type: 'CURRENT_RISK',
        severity: 'CRITICAL',
        description: `Current flood risk score is critical (${currentRisk}/100)`,
        evidence: `Exceeds critical threshold of ${ALERT_CONFIG.CURRENT_RISK.CRITICAL}/100`,
        threshold_matched: `CURRENT_RISK >= ${ALERT_CONFIG.CURRENT_RISK.CRITICAL}`,
      });
      triggerReasons.push(`Current flood risk is in the CRITICAL zone (${currentRisk}/100).`);
    } else if (currentRisk >= ALERT_CONFIG.CURRENT_RISK.HIGH) {
      triggerSignals.push({
        signal_type: 'CURRENT_RISK',
        severity: 'HIGH',
        description: `Current flood risk score is high (${currentRisk}/100)`,
        evidence: `Exceeds high risk threshold of ${ALERT_CONFIG.CURRENT_RISK.HIGH}/100`,
        threshold_matched: `CURRENT_RISK >= ${ALERT_CONFIG.CURRENT_RISK.HIGH}`,
      });
      triggerReasons.push(`Current flood risk is in the HIGH zone (${currentRisk}/100).`);
    } else if (currentRisk >= ALERT_CONFIG.CURRENT_RISK.ELEVATED) {
      triggerSignals.push({
        signal_type: 'CURRENT_RISK',
        severity: 'MODERATE',
        description: `Current flood risk score is elevated (${currentRisk}/100)`,
        evidence: `Exceeds elevated threshold of ${ALERT_CONFIG.CURRENT_RISK.ELEVATED}/100`,
        threshold_matched: `CURRENT_RISK >= ${ALERT_CONFIG.CURRENT_RISK.ELEVATED}`,
      });
      triggerReasons.push(`Current flood risk is ELEVATED (${currentRisk}/100).`);
    }

    // 2. Forecast Peak Triggers
    if (peakRisk >= ALERT_CONFIG.PROJECTED_PEAK_RISK.CRITICAL) {
      triggerSignals.push({
        signal_type: 'FORECAST_PEAK',
        severity: 'CRITICAL',
        description: `Projected risk reaches critical level of ${peakRisk}/100 at horizon ${peakHorizon}`,
        evidence: `Forecast multi-horizon peak (${peakRisk}) crosses critical threshold (${ALERT_CONFIG.PROJECTED_PEAK_RISK.CRITICAL})`,
        threshold_matched: `PROJECTED_PEAK >= ${ALERT_CONFIG.PROJECTED_PEAK_RISK.CRITICAL}`,
      });
      triggerReasons.push(`Projected peak risk reaches CRITICAL level of ${peakRisk}/100 at horizon ${peakHorizon}.`);
    } else if (peakRisk >= ALERT_CONFIG.PROJECTED_PEAK_RISK.HIGH) {
      triggerSignals.push({
        signal_type: 'FORECAST_PEAK',
        severity: 'HIGH',
        description: `Projected risk reaches high level of ${peakRisk}/100 at horizon ${peakHorizon}`,
        evidence: `Forecast multi-horizon peak (${peakRisk}) crosses high threshold (${ALERT_CONFIG.PROJECTED_PEAK_RISK.HIGH})`,
        threshold_matched: `PROJECTED_PEAK >= ${ALERT_CONFIG.PROJECTED_PEAK_RISK.HIGH}`,
      });
      triggerReasons.push(`Projected peak risk reaches HIGH level of ${peakRisk}/100 at horizon ${peakHorizon}.`);
    } else if (peakRisk >= ALERT_CONFIG.PROJECTED_PEAK_RISK.ELEVATED) {
      triggerSignals.push({
        signal_type: 'FORECAST_PEAK',
        severity: 'MODERATE',
        description: `Projected risk elevates to ${peakRisk}/100 at horizon ${peakHorizon}`,
        evidence: `Forecast peak (${peakRisk}) crosses elevated threshold (${ALERT_CONFIG.PROJECTED_PEAK_RISK.ELEVATED})`,
        threshold_matched: `PROJECTED_PEAK >= ${ALERT_CONFIG.PROJECTED_PEAK_RISK.ELEVATED}`,
      });
      triggerReasons.push(`Projected peak risk elevates to ${peakRisk}/100 at horizon ${peakHorizon}.`);
    }

    // 3. Rate of Increase / Escalation Triggers
    if (rateOfChange === 'RAPID_ESCALATION') {
      triggerSignals.push({
        signal_type: 'RATE_OF_INCREASE',
        severity: 'HIGH',
        description: `Rapid risk escalation detected (+${riskDelta} pts delta to ${peakHorizon})`,
        evidence: `Delta of +${riskDelta} pts exceeds rapid escalation threshold (+${ALERT_CONFIG.RATE_OF_INCREASE.RAPID_DELTA_THRESHOLD} pts)`,
        threshold_matched: `RATE_OF_INCREASE >= ${ALERT_CONFIG.RATE_OF_INCREASE.RAPID_DELTA_THRESHOLD}`,
      });
      triggerReasons.push(`Rapid risk escalation detected (+${riskDelta} pts increase projected by ${peakHorizon}).`);
      secondaryAlertsList.push({
        alert_type: 'Rapid Risk Increase',
        level: 'HIGH',
        reason: `Risk is projected to rise rapidly by +${riskDelta} points by ${peakHorizon}.`,
      });
    } else if (rateOfChange === 'MODERATE_RISE') {
      triggerSignals.push({
        signal_type: 'RATE_OF_INCREASE',
        severity: 'MODERATE',
        description: `Forecast trend is rising (+${riskDelta} pts delta)`,
        evidence: `Positive delta with ${trend} trajectory`,
        threshold_matched: 'TREND == RISING',
      });
      triggerReasons.push(`Risk trajectory is rising steadily with +${riskDelta} pts delta.`);
      secondaryAlertsList.push({
        alert_type: 'Forecast Escalation',
        level: 'ELEVATED',
        reason: `Steady upward trajectory projected across upcoming forecast horizons.`,
      });
    }

    // 4. Citizen Report Triggers
    if (critReports >= ALERT_CONFIG.CITIZEN_ESCALATION.CRITICAL_REPORT_MIN) {
      triggerSignals.push({
        signal_type: 'CITIZEN_REPORTS',
        severity: 'CRITICAL',
        description: `${critReports} critical citizen hazard reports active in field`,
        evidence: `Critical citizen report presence confirmed on ground`,
        threshold_matched: `CRITICAL_REPORTS >= ${ALERT_CONFIG.CITIZEN_ESCALATION.CRITICAL_REPORT_MIN}`,
      });
      triggerReasons.push(`Field crowd reports indicate active severe inundation (${critReports} critical reports).`);
      secondaryAlertsList.push({
        alert_type: 'Citizen Report Surge',
        level: 'CRITICAL',
        reason: `Critical flood hazard reports verified by ground citizens.`,
      });
    } else if (highSevReports >= ALERT_CONFIG.CITIZEN_ESCALATION.HIGH_SEVERITY_MIN) {
      triggerSignals.push({
        signal_type: 'CITIZEN_REPORTS',
        severity: 'HIGH',
        description: `${highSevReports} high-severity citizen reports logged`,
        evidence: `Multiple severe incident reports confirmed in 24h window`,
        threshold_matched: `HIGH_SEVERITY_REPORTS >= ${ALERT_CONFIG.CITIZEN_ESCALATION.HIGH_SEVERITY_MIN}`,
      });
      triggerReasons.push(`Community crowd reports indicate multiple high-severity flooding incidents (${highSevReports} reports).`);
      secondaryAlertsList.push({
        alert_type: 'Citizen Report Surge',
        level: 'HIGH',
        reason: `Surge in high-severity citizen flooding reports in the district.`,
      });
    }

    // 5. Basin Propagation Triggers
    if (hasUpstreamThreat) {
      const basinSeverity = basinSurgePts >= ALERT_CONFIG.BASIN_PROPAGATION.STRONG_SURGE_PTS ? 'HIGH' : 'MODERATE';
      triggerSignals.push({
        signal_type: 'BASIN_PROPAGATION',
        severity: basinSeverity,
        description: `Potential upstream basin surge propagation (+${basinSurgePts} pts)`,
        evidence: `Upstream connection influence from ${upstreamDistricts.join(', ') || 'hydrological corridor'}`,
        threshold_matched: `BASIN_SURGE >= ${ALERT_CONFIG.BASIN_PROPAGATION.SIGNIFICANT_SURGE_PTS}`,
      });
      triggerReasons.push(`Potential upstream hydrological influence detected (+${basinSurgePts} pts projected surge from upstream river reaches).`);
      secondaryAlertsList.push({
        alert_type: 'Basin Propagation Watch',
        level: basinSeverity === 'HIGH' ? 'HIGH' : 'ELEVATED',
        reason: `Upstream river discharge and runoff may propagate downstream into local watercourses.`,
      });
    }

    // 6. Data Quality & Uncertainty Notice
    if (district.monitoring_category === 'Limited Data' && (dataConfidence === 'Low' || dataConfidence === 'Prototype')) {
      triggerSignals.push({
        signal_type: 'DATA_QUALITY',
        severity: 'INFO',
        description: 'Limited data confidence notice active for telemetry grid',
        evidence: 'Interpolated rainfall and synthetic station telemetry',
        threshold_matched: 'CATEGORY == LIMITED_DATA',
      });
      secondaryAlertsList.push({
        alert_type: 'Data Uncertainty Notice',
        level: 'WATCH',
        reason: 'District utilizes limited data density; exercise caution when evaluating high variance trends.',
      });
    }

    // ========================================================
    // SYNTHESIZE FINAL ALERT LEVEL & PRIMARY ALERT TYPE
    // ========================================================
    let alertLevel: AlertLevel = 'NORMAL';
    let alertLevelCode = 0;
    let primaryAlertType: AlertType = 'Current Risk Alert';

    const hasCritSignal = triggerSignals.some(s => s.severity === 'CRITICAL');
    const hasHighSignal = triggerSignals.some(s => s.severity === 'HIGH');
    const hasModSignal = triggerSignals.some(s => s.severity === 'MODERATE');

    if (currentRisk >= ALERT_CONFIG.CURRENT_RISK.CRITICAL || peakRisk >= ALERT_CONFIG.PROJECTED_PEAK_RISK.CRITICAL || (currentRisk >= 65 && rateOfChange === 'RAPID_ESCALATION') || critReports > 0) {
      alertLevel = 'CRITICAL';
      alertLevelCode = 4;
      primaryAlertType = peakRisk >= ALERT_CONFIG.PROJECTED_PEAK_RISK.CRITICAL && currentRisk < ALERT_CONFIG.CURRENT_RISK.CRITICAL
        ? 'Critical Projection'
        : 'Current Risk Alert';
    } else if (currentRisk >= ALERT_CONFIG.CURRENT_RISK.HIGH || peakRisk >= ALERT_CONFIG.PROJECTED_PEAK_RISK.HIGH || (currentRisk >= 45 && hasUpstreamThreat && rateOfChange === 'RAPID_ESCALATION') || highSevReports >= 2) {
      alertLevel = 'HIGH';
      alertLevelCode = 3;
      primaryAlertType = rateOfChange === 'RAPID_ESCALATION'
        ? 'Rapid Risk Increase'
        : (peakRisk >= ALERT_CONFIG.PROJECTED_PEAK_RISK.HIGH && currentRisk < ALERT_CONFIG.CURRENT_RISK.HIGH)
        ? 'Forecast Escalation'
        : hasUpstreamThreat && basinSurgePts >= 6.0
        ? 'Basin Propagation Watch'
        : 'Current Risk Alert';
    } else if (currentRisk >= ALERT_CONFIG.CURRENT_RISK.ELEVATED || peakRisk >= ALERT_CONFIG.PROJECTED_PEAK_RISK.ELEVATED || (trend === 'RISING' && riskDelta >= 6.0) || (hasUpstreamThreat && basinSurgePts >= 5.0) || isCitizenSurging) {
      alertLevel = 'ELEVATED';
      alertLevelCode = 2;
      primaryAlertType = rateOfChange === 'MODERATE_RISE' || (trend === 'RISING' && riskDelta >= 6.0)
        ? 'Forecast Escalation'
        : hasUpstreamThreat
        ? 'Basin Propagation Watch'
        : 'Current Risk Alert';
    } else if (currentRisk >= ALERT_CONFIG.CURRENT_RISK.WATCH || peakRisk >= ALERT_CONFIG.PROJECTED_PEAK_RISK.WATCH || (trend === 'RISING' && riskDelta >= 2.0) || hasUpstreamThreat || (total24hReports >= 2 && reportTrend === 'Increasing')) {
      alertLevel = 'WATCH';
      alertLevelCode = 1;
      primaryAlertType = trend === 'RISING' ? 'Forecast Escalation' : hasUpstreamThreat ? 'Basin Propagation Watch' : 'Current Risk Alert';
    } else {
      alertLevel = 'NORMAL';
      alertLevelCode = 0;
      primaryAlertType = 'Current Risk Alert';
      if (triggerReasons.length === 0) {
        triggerReasons.push('Current and forecast indicators remain within normal operational baselines.');
      }
    }

    // Headline
    const headline = alertLevel === 'CRITICAL'
      ? `CRITICAL FLOOD RISK ALERT — ${districtName.toUpperCase()} (${peakHorizon} Peak: ${peakRisk}/100)`
      : alertLevel === 'HIGH'
      ? `HIGH FLOOD RISK PROJECTION — ${districtName.toUpperCase()} (${peakHorizon} Outlook: ${peakRisk}/100)`
      : alertLevel === 'ELEVATED'
      ? `ELEVATED FLOOD MONITORING — ${districtName.toUpperCase()} (${trend} Trajectory)`
      : alertLevel === 'WATCH'
      ? `FLOOD RISK WATCH — ${districtName.toUpperCase()} (Monitoring Baseline)`
      : `NORMAL HYDRO-METEOROLOGICAL CONDITIONS — ${districtName.toUpperCase()}`;

    // Timeline Escalation Points
    const timelineEscalation = horizonList.map(h => ({
      horizon: h.horizon,
      hours: h.hours,
      projected_risk: Number(h.risk.toFixed(1)),
      outlook: h.outlook,
      escalation_flag: h.risk >= (alertLevelCode >= 3 ? 50 : 35) && h.risk > currentRisk,
    }));

    // Generate Bilingual Advisories (English & Telugu)
    const advisories = this.generateBilingualAdvisories(
      districtName,
      alertLevel,
      primaryAlertType,
      currentRisk,
      peakRisk,
      peakHorizon,
      trend,
      rateOfChange,
      triggerReasons,
      hasUpstreamThreat,
      basinSummary,
      dataMode,
      limitations
    );

    const alertId = `ALT-${districtId.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)}-${Date.now().toString().slice(-6)}`;
    const nowIso = new Date().toISOString();

    return {
      alert_id: alertId,
      district_id: districtId,
      district_name: districtName,
      region_zone: regionZone,
      alert_level: alertLevel,
      alert_level_code: alertLevelCode,
      primary_alert_type: primaryAlertType,
      headline,
      trigger_reasons: triggerReasons,
      trigger_signals: triggerSignals,
      current_risk: currentRisk,
      projected_risk: peakRisk,
      peak_horizon: peakHorizon,
      trend,
      rate_of_change: rateOfChange,
      risk_delta: riskDelta,
      forecast_delta: forecastDelta,
      citizen_signal: {
        total_24h: total24hReports,
        high_severity_count: highSevReports,
        critical_count: critReports,
        growth_trend: reportTrend,
        is_surging: isCitizenSurging,
        score_contribution: district.contributions?.citizen_reports ?? 0,
        summary: citizenSummary,
      },
      basin_signal: {
        has_upstream_threat: hasUpstreamThreat,
        upstream_districts: upstreamDistricts,
        projected_surge_score: basinSurgePts,
        estimated_travel_window_hours: basinInfluence?.active_upstream_threats?.[0]?.travel_window_hours ?? 6,
        summary: basinSummary,
      },
      confidence: dataConfidence,
      confidence_score: confidenceScore,
      forecast_confidence: forecastConfidence,
      data_mode: dataMode,
      model_limitations: limitations,
      advisories,
      timeline_escalation: timelineEscalation,
      secondary_alerts: secondaryAlertsList,
      status: 'Active',
      created_at: nowIso,
      updated_at: nowIso,
    };
  }

  /**
   * Generates bilingual structured advisories (English & Telugu)
   */
  private static generateBilingualAdvisories(
    districtName: string,
    alertLevel: AlertLevel,
    primaryAlertType: AlertType,
    currentRisk: number,
    peakRisk: number,
    peakHorizon: string,
    trend: string,
    rateOfChange: string,
    triggerReasons: string[],
    hasUpstreamThreat: boolean,
    basinSummary: string,
    dataMode: string,
    limitations: string[]
  ): { english: DistrictAdvisory; telugu: DistrictAdvisory; hindi: DistrictAdvisory } {
    let enTitle = '';
    let teTitle = '';
    let hiTitle = '';
    let enSituation = '';
    let teSituation = '';
    let hiSituation = '';
    let enPrecautions: string[] = [];
    let tePrecautions: string[] = [];
    let hiPrecautions: string[] = [];

    const isSimulated = dataMode.toLowerCase().includes('simulat') || dataMode.toLowerCase().includes('prototype');
    const simNoticeEn = isSimulated
      ? `PROTOTYPE DECISION SUPPORT: This advisory is based on mathematical risk modeling and ${dataMode.toLowerCase()} for scenario evaluation.`
      : `TELEMETRY NOTICE: Synthesized from multi-sensor automatic weather and river gauging feeds.`;
    const simNoticeTe = isSimulated
      ? `ప్రోటోటైప్ నిర్ణయ మద్దతు: ఈ సలహా గణిత ప్రమాద నమూనా మరియు సిమ్యులేషన్ డేటా ఆధారంగా రూపొందించబడింది.`
      : `టెలిమెట్రీ నోటీసు: ఆటోమేటిక్ వాతావరణ మరియు నదీ గేజింగ్ డేటా నుండి విశ్లేషించబడింది.`;
    const simNoticeHi = isSimulated
      ? `प्रोटोटाइप निर्णय सहायता: यह परामर्श गणितीय जोखिम मॉडलिंग और सिमुलेशन डेटा पर आधारित है।`
      : `टेलीमेट्री सूचना: स्वचालित मौसम और नदी गेजिंग डेटा से संश्लेषित।`;

    if (alertLevel === 'CRITICAL') {
      enTitle = `CRITICAL FLOOD RISK ALERT — ${districtName.toUpperCase()}`;
      teTitle = `తీవ్ర వరద ప్రమాద హెచ్చరిక — ${districtName}`;
      hiTitle = `गंभीर बाढ़ जोखिम चेतावनी — ${districtName.toUpperCase()}`;
      enSituation = `${districtName} is facing a critical flood risk state (Current: ${currentRisk}/100, Peak Projected: ${peakRisk}/100 at ${peakHorizon}). Severe inundation of low-lying settlements, stormwater channel overflows, and road transport disruptions are highly probable under current hydrological trajectory.`;
      teSituation = `${districtName} జిల్లాలో వరద ప్రమాదం అత్యవసర క్లిష్ట స్థాయికి చేరుకుంది (ప్రస్తుత ప్రమాదం: ${currentRisk}/100, ${peakHorizon} గంటల్లో అంచనా: ${peakRisk}/100). లోతట్టు ప్రాంతాలు, నాలాలు, రోడ్లపై భారీగా నీరు చేరే అవకాశం ఉంది.`;
      hiSituation = `${districtName} में बाढ़ का गंभीर जोखिम बना हुआ है (वर्तमान स्कोर: ${currentRisk}/100, ${peakHorizon} पर अनुमानित शिखर: ${peakRisk}/100)। निचले इलाकों में जलभराव, नालों के उफान और यातायात में गंभीर व्यवधान की प्रबल संभावना है।`;
      enPrecautions = [
        'Avoid all non-essential road travel and stay clear of submerged causeways and underpasses.',
        'Residents in riverbank lowlands and low-lying nala corridors should move valuables and power systems to upper floors.',
        'Keep emergency battery backups and local administrative contact numbers ready.',
        'Follow instructions from official District Collectorates and Disaster Response Force (DRF) teams.',
      ];
      tePrecautions = [
        'అనవసర ప్రయాణాలను పూర్తిగా నివారించండి; ముంపునకు గురైన అండర్‌పాస్‌లు మరియు కాజ్‌వేల వద్దకు వెళ్లవద్దు.',
        'నదీ పరివాహక మరియు లోతట్టు ప్రాంతాల ప్రజలు విలువైన వస్తువులను సురక్షిత ప్రదేశాలకు తరలించండి.',
        'ఎమర్జెన్సీ లైట్లు, తాగునీరు మరియు ఫోన్ ఛార్జింగ్ అందుబాటులో ఉంచుకోండి.',
        'జిల్లా కలెక్టరేట్ మరియు విపత్తు స్పందన దళాల (DRF) సూచనలను ఖచ్చితంగా పాటించండి.',
      ];
      hiPrecautions = [
        'अनावश्यक यात्रा से बचें और जलमग्न अंडरपास व निचले रास्तों से दूर रहें।',
        'नदी किनारे व निचले इलाकों के निवासी कीमती सामान और विद्युत उपकरण ऊपरी मंजिलों पर स्थानांतरित करें।',
        'आपातकालीन लाइट, पेयजल और मोबाइल चार्जिंग की पर्याप्त व्यवस्था रखें।',
        'जिला कलेक्ट्रेट और आपदा मोचन बल (DRF) के आधिकारिक निर्देशों का पालन करें।',
      ];
    } else if (alertLevel === 'HIGH') {
      enTitle = `HIGH FLOOD RISK PROJECTION — ${districtName.toUpperCase()}`;
      teTitle = `అధిక వరద ప్రమాద అంచనా — ${districtName}`;
      hiTitle = `उच्च बाढ़ जोखिम पूर्वानुमान — ${districtName.toUpperCase()}`;
      enSituation = `Flood risk is projected to escalate across ${districtName} over the coming hours (Current Risk: ${currentRisk}/100, Projected Peak: ${peakRisk}/100 by ${peakHorizon}). Drainage networks and low-lying culverts are approaching high saturation levels.`;
      teSituation = `${districtName} జిల్లాలో రాబోయే గంటల్లో వరద ముప్పు పెరిగే అవకాశం ఉందని నమూనా అంచనా సూచిస్తోంది (ప్రస్తుత స్కోర్: ${currentRisk}/100, ${peakHorizon} సమయానికి: ${peakRisk}/100). లోతట్టు కాల్వలు మరియు డ్రైనేజీలపై ఒత్తిడి పెరుగుతోంది.`;
      hiSituation = `${districtName} में आने वाले घंटों में बाढ़ जोखिम बढ़ने का अनुमान है (वर्तमान स्कोर: ${currentRisk}/100, ${peakHorizon} तक अनुमानित: ${peakRisk}/100)। जल निकासी प्रणालियों और पुलियों पर जलभराव का दबाव बढ़ रहा है।`;
      enPrecautions = [
        'Avoid parking vehicles in low-lying basements or near open stormwater drains.',
        'Commuters should check alternate elevated routes and monitor live traffic advisories.',
        'Keep drainage grates clear of domestic waste to prevent localized pooling.',
        'Monitor local weather bulletins and municipal corporation alerts.',
      ];
      tePrecautions = [
        'లోతట్టు సెల్లార్లు లేదా తెరిచిన డ్రైనేజీల సమీపంలో వాహనాలను నిలపవద్దు.',
        'ప్రయాణికులు ముందస్తుగా సురక్షితమైన ప్రత్యామ్నాయ మార్గాలను ఎంచుకోండి.',
        'స్థానిక వాతావరణ మరియు మున్సిపల్ కార్పొరేషన్ సూచనలను గమనిస్తూ ఉండండి.',
      ];
      hiPrecautions = [
        'निचले बेसमेंट या खुले नालों के पास वाहन पार्क करने से बचें।',
        'यात्री सुरक्षित वैकल्पिक मार्गों का चयन करें और यातायात संबंधी जानकारी लेते रहें।',
        'नालों में कचरा न फेंकें ताकि जल निकासी सुचारू बनी रहे।',
        'स्थानीय मौसम बुलेटिन और नगर निगम की सूचनाओं पर नज़र रखें।',
      ];
    } else if (alertLevel === 'ELEVATED') {
      enTitle = `ELEVATED FLOOD RISK WATCH — ${districtName.toUpperCase()}`;
      teTitle = `పెరుగుతున్న వరద అప్రమత్తత — ${districtName}`;
      hiTitle = `बढ़ती बाढ़ सतर्कता — ${districtName.toUpperCase()}`;
      enSituation = `Elevated hydro-meteorological indicators detected for ${districtName}. While primary channels remain operational, projected rainfall and local runoff indicate an upward risk trend (+${peakRisk - currentRisk} pts by ${peakHorizon}).`;
      teSituation = `${districtName} పరిధిలో వర్షపాతం మరియు నీటి ప్రవాహ సూచికలు పెరుగుతున్నాయి. రాబోయే ${peakHorizon} గంటల్లో మోస్తరు నుండి అధిక స్థాయికి చేరే అవకాశం ఉంది.`;
      hiSituation = `${districtName} में वर्षा और जलस्तर के संकेतकों में वृद्धि देखी गई है। आगामी ${peakHorizon} में जोखिम मध्यम से उच्च स्तर तक जा सकता है।`;
      enPrecautions = [
        'Exercise caution near urban culverts, roadside drains, and construction areas.',
        'Stay tuned to local rainfall forecast updates.',
      ];
      tePrecautions = [
        'రోడ్ల పక్కన ఉన్న డ్రైనేజీలు మరియు గుంతల వద్ద జాగ్రత్త వహించండి.',
        'తాజా వర్షపాత సమాచారాన్ని ఎప్పటికప్పుడు తెలుసుకోండి.',
      ];
      hiPrecautions = [
        'सड़क किनारे नालों, निर्माण क्षेत्रों और जलभराव वाले स्थानों के पास सावधानी बरतें।',
        'स्थानीय वर्षा और मौसम पूर्वानुमान के अपडेट पर ध्यान दें।',
      ];
    } else if (alertLevel === 'WATCH') {
      enTitle = `FLOOD RISK WATCH — ${districtName.toUpperCase()}`;
      teTitle = `వరద ముప్పు పరిశీలన — ${districtName}`;
      hiTitle = `बाढ़ जोखिम निगरानी — ${districtName.toUpperCase()}`;
      enSituation = `Baseline monitoring active for ${districtName}. Moderate rainfall or steady basin flows are present without immediate severe threshold exceedance.`;
      teSituation = `${districtName} జిల్లాలో పరిస్థితి సాధారణ పరిశీలనలో ఉంది. ప్రస్తుతం ఎటువంటి తీవ్రమైన వరద హెచ్చరికలు లేవు.`;
      hiSituation = `${districtName} में स्थिति सामान्य निगरानी में है। मध्यम वर्षा या सामान्य नदी प्रवाह बना हुआ है और तत्काल कोई गंभीर संकट नहीं है।`;
      enPrecautions = [
        'Regular monitoring of daily weather updates is advised.',
      ];
      tePrecautions = [
        'సాధారణ వాతావరణ హెచ్చరికలను గమనిస్తూ ఉండండి.',
      ];
      hiPrecautions = [
        'दैनिक मौसम समाचारों और अपडेट पर सामान्य नज़र बनाए रखें।',
      ];
    } else {
      enTitle = `NORMAL CONDITIONS — ${districtName.toUpperCase()}`;
      teTitle = `సాధారణ వాతావరణం — ${districtName}`;
      hiTitle = `सामान्य स्थिति — ${districtName.toUpperCase()}`;
      enSituation = `Hydro-meteorological conditions in ${districtName} are currently within safe baseline parameters (Risk Score: ${currentRisk}/100).`;
      teSituation = `${districtName} పరిధిలో వరద ముప్పు సాధారణ స్థాయిలో ఉంది (ప్రమాద స్కోరు: ${currentRisk}/100).`;
      hiSituation = `${districtName} में जल-मौसम विज्ञान स्थितियां सुरक्षित सीमा के भीतर हैं (जोखिम स्कोर: ${currentRisk}/100)।`;
      enPrecautions = [
        'No emergency flood precautions required at this time.',
      ];
      tePrecautions = [
        'ప్రస్తుతం ఎటువంటి ముందస్తు జాగ్రత్తలు అవసరం లేదు.',
      ];
      hiPrecautions = [
        'वर्तमान में किसी आपातकालीन बाढ़ सावधानी की आवश्यकता नहीं है।',
      ];
    }

    const whyTriggeredEn = triggerReasons.join(' ');
    const whyTriggeredTe = triggerReasons.map(r => {
      if (r.includes('CRITICAL')) return 'ప్రస్తుత లేదా అంచనా వేసిన వరద సూచిక అత్యవసర పరిమితిని దాటింది.';
      if (r.includes('HIGH')) return 'అధిక వర్షపాతం లేదా వరద ప్రమాద సూచిక నమోదైంది.';
      if (r.includes('escalation')) return 'త్వరితగతిన వరద ప్రమాదం పెరుగుతోందని అంచనా.';
      if (r.includes('upstream')) return 'ఎగువ పరివాహక ప్రాంతాల నుండి నీటి ప్రవాహం పెరిగే అవకాశం ఉంది.';
      if (r.includes('crowd')) return 'పౌరుల నుండి తీవ్రమైన నీటి ముంపు నివేదికలు నమోదయ్యాయి.';
      return 'పరిస్థితి సాధారణ పరిశీలన పరిధిలో ఉంది.';
    }).join(' ');

    const whyTriggeredHi = triggerReasons.map(r => {
      if (r.includes('CRITICAL')) return 'वर्तमान या अनुमानित बाढ़ सूचकांक आपातकालीन सीमा को पार कर गया है।';
      if (r.includes('HIGH')) return 'उच्च वर्षा या बाढ़ जोखिम सूचकांक दर्ज किया गया है।';
      if (r.includes('escalation')) return 'बाढ़ जोखिम में तेजी से वृद्धि का अनुमान है।';
      if (r.includes('upstream')) return 'ऊपरी जलग्रहण क्षेत्रों से जल प्रवाह बढ़ने की संभावना है।';
      if (r.includes('crowd')) return 'नागरिकों द्वारा गंभीर जलभराव की रिपोर्ट दर्ज की गई है।';
      return 'स्थिति सामान्य निगरानी के दायरे में है।';
    }).join(' ');

    return {
      english: {
        title: enTitle,
        situation_summary: enSituation,
        why_triggered: whyTriggeredEn,
        recommended_precautions: enPrecautions,
        uncertainty_notice: `${simNoticeEn} ${limitations.join(' ')}`,
        authority_disclaimer: ALERT_CONFIG.DISCLAIMERS.AUTHORITY_NOTICE_EN,
      },
      telugu: {
        title: teTitle,
        situation_summary: teSituation,
        why_triggered: whyTriggeredTe,
        recommended_precautions: tePrecautions,
        uncertainty_notice: `${simNoticeTe} ${limitations.join(' ')}`,
        authority_disclaimer: ALERT_CONFIG.DISCLAIMERS.AUTHORITY_NOTICE_TE,
      },
      hindi: {
        title: hiTitle,
        situation_summary: hiSituation,
        why_triggered: whyTriggeredHi,
        recommended_precautions: hiPrecautions,
        uncertainty_notice: `${simNoticeHi} ${limitations.join(' ')}`,
        authority_disclaimer: ALERT_CONFIG.DISCLAIMERS.AUTHORITY_NOTICE_HI,
      },
    };
  }

  /**
   * Evaluates all 33 districts and calculates statewide summary metrics
   */
  public static evaluateAllDistrictsAlerts(districts: DistrictStatus[]): { alerts: DistrictAlert[]; summary: AlertSummaryMetrics } {
    const alerts = districts.map(d => this.evaluateDistrictAlert(d));

    let normalCount = 0;
    let watchCount = 0;
    let elevatedCount = 0;
    let highCount = 0;
    let criticalCount = 0;
    let risingCount = 0;
    let rapidEscalationCount = 0;
    let basinThreatCount = 0;
    let citizenSurgeCount = 0;

    for (const a of alerts) {
      if (a.alert_level === 'CRITICAL') criticalCount++;
      else if (a.alert_level === 'HIGH') highCount++;
      else if (a.alert_level === 'ELEVATED') elevatedCount++;
      else if (a.alert_level === 'WATCH') watchCount++;
      else normalCount++;

      if (a.trend === 'RISING') risingCount++;
      if (a.rate_of_change === 'RAPID_ESCALATION') rapidEscalationCount++;
      if (a.basin_signal.has_upstream_threat) basinThreatCount++;
      if (a.citizen_signal.is_surging) citizenSurgeCount++;
    }

    // Top escalating districts
    const topEscalating = alerts
      .filter(a => a.risk_delta > 0)
      .sort((a, b) => b.risk_delta - a.risk_delta)
      .slice(0, 5)
      .map(a => ({
        district_id: a.district_id,
        district_name: a.district_name,
        current_risk: a.current_risk,
        peak_risk: a.projected_risk,
        peak_horizon: a.peak_horizon,
        risk_delta: a.risk_delta,
        alert_level: a.alert_level,
      }));

    // Highest severity district
    const sortedBySeverity = [...alerts].sort((a, b) => {
      if (b.alert_level_code !== a.alert_level_code) return b.alert_level_code - a.alert_level_code;
      return b.projected_risk - a.projected_risk;
    });

    const highest = sortedBySeverity[0];
    const highestDistrict = highest ? {
      district_id: highest.district_id,
      district_name: highest.district_name,
      alert_level: highest.alert_level,
      alert_type: highest.primary_alert_type,
      peak_risk: highest.projected_risk,
      peak_horizon: highest.peak_horizon,
    } : undefined;

    const summary: AlertSummaryMetrics = {
      total_districts: alerts.length,
      total_active_alerts: watchCount + elevatedCount + highCount + criticalCount,
      normal_count: normalCount,
      watch_count: watchCount,
      elevated_count: elevatedCount,
      high_count: highCount,
      critical_count: criticalCount,
      rising_trend_count: risingCount,
      rapid_escalation_count: rapidEscalationCount,
      basin_threat_count: basinThreatCount,
      citizen_surge_count: citizenSurgeCount,
      top_escalating_districts: topEscalating,
      highest_severity_district: highestDistrict,
      last_recalculated_at: new Date().toISOString(),
    };

    return { alerts, summary };
  }
}
