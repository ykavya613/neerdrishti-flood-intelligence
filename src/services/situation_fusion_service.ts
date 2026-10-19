/**
 * NeerDrishti Phase D3: Multi-Signal Intelligence & District Situation Fusion Service
 * Deterministically combines rainfall telemetry, hydrological stages, citizen ground intelligence,
 * baseline spatial vulnerability, signal freshness, and data confidence into an explainable operational situation.
 */

import {
  DistrictSituation,
  OperationalSituationCategory,
  DataConfidenceLevel,
  RiskDriver,
  SignalCoverage,
} from '../types/signals';
import { DistrictStatus } from '../types';

export class SituationFusionService {
  /**
   * Evaluates availability across 5 signal domains:
   * 1. Rainfall telemetry
   * 2. Hydrological stage/gauge telemetry
   * 3. Citizen ground intelligence
   * 4. Historical flood vulnerability
   * 5. Terrain & drainage vulnerability
   */
  public calculateSignalCoverage(status: DistrictStatus): SignalCoverage {
    const rfAvail = status.rainfall_data_mode !== 'UNAVAILABLE' && status.rainfall_mm_24h !== undefined;
    const hydroAvail = !!status.hydrological_summary &&
      status.hydrological_summary.data_mode !== 'UNAVAILABLE' &&
      status.hydrological_summary.dominant_status !== 'UNKNOWN';
    const citizenAvail = (status.citizen_reports_count ?? 0) > 0 || (status.citizen_report_score ?? 0) >= 0;
    const hasHistory = (status.flood_history_score ?? 0) > 0;
    const hasDrainage = (status.drainage_vulnerability_score ?? 0) > 0;

    const availableCount =
      (rfAvail ? 1 : 0) +
      (hydroAvail ? 1 : 0) +
      (citizenAvail ? 1 : 0) +
      (hasHistory ? 1 : 0) +
      (hasDrainage ? 1 : 0);

    const total = 5;
    const ratio = Math.round((availableCount / total) * 100) / 100;

    return {
      available: availableCount,
      total,
      ratio,
      signals: {
        rainfall: Boolean(rfAvail),
        hydrology: Boolean(hydroAvail),
        citizen: Boolean(citizenAvail),
        flood_history: Boolean(hasHistory),
        drainage_vulnerability: Boolean(hasDrainage),
      },
    };
  }

  /**
   * Computes data confidence level and normalized confidence score (0.0 to 1.0).
   * Levels: HIGH (>= 0.80), MEDIUM (>= 0.60), LOW (>= 0.40), LIMITED (< 0.40)
   */
  public calculateDataConfidence(
    coverage: SignalCoverage,
    status: DistrictStatus
  ): { confidence: DataConfidenceLevel; score: number } {
    const rfFreshness = status.rainfall_freshness || 'FRESH';
    const hydroFreshness = status.hydrological_summary?.freshness || 'FRESH';
    const citizenCount = status.citizen_reports_count || 0;

    const rfWeightMap: Record<string, number> = { FRESH: 0.25, AGING: 0.20, STALE: 0.10, EXPIRED: 0.05 };
    const rfWeight = coverage.signals.rainfall ? (rfWeightMap[rfFreshness.toUpperCase()] ?? 0.10) : 0.0;

    const hydroWeightMap: Record<string, number> = { FRESH: 0.25, AGING: 0.18, STALE: 0.10, EXPIRED: 0.05 };
    const hydroWeight = coverage.signals.hydrology ? (hydroWeightMap[hydroFreshness.toUpperCase()] ?? 0.10) : 0.0;

    const citWeight = citizenCount > 0 ? 0.15 : 0.10;
    const baseWeight = 0.35; // historical + drainage

    let score = Math.round((rfWeight + hydroWeight + citWeight + baseWeight) * 100) / 100;
    score = Math.min(1.0, Math.max(0.0, score));

    let level: DataConfidenceLevel = 'MEDIUM';
    if (score >= 0.80 && coverage.available >= 4) {
      level = 'HIGH';
    } else if (score >= 0.60 && coverage.available >= 3) {
      level = 'MEDIUM';
    } else if (score >= 0.40) {
      level = 'LOW';
    } else {
      level = 'LIMITED';
    }

    return { confidence: level, score };
  }

  /**
   * Evaluates and ranks primary and supporting risk drivers traceable to physical and community telemetry.
   */
  public extractRiskDrivers(status: DistrictStatus): { primaryDrivers: RiskDriver[]; supportingSignals: RiskDriver[] } {
    const primary: RiskDriver[] = [];
    const supporting: RiskDriver[] = [];

    const rf24h = status.rainfall_mm_24h || 0;
    const rf3h = status.rainfall_mm_3h || 0;
    const hydro = status.hydrological_summary;
    const hydroStatus = hydro?.dominant_status || 'UNKNOWN';
    const hydroTrend = hydro?.dominant_trend || 'UNKNOWN';
    const wbName = hydro?.primary_water_body || 'Basin Channel';
    const citizenHighSev = status.citizen_reports_high_severity || 0;
    const citizenTotal = status.citizen_reports_count || 0;
    const floodHistoryScore = status.flood_history_score || 0;
    const drainageScore = status.drainage_vulnerability_score || 0;

    // 1. Rainfall Signal
    if (rf24h >= 64.5 || rf3h >= 25.0) {
      primary.push({
        source: 'IMD / TSDPS Telemetry',
        signal: 'Heavy Precipitation Inundation Risk',
        importance: 'PRIMARY',
        evidence: `${rf24h} mm (24h) / ${rf3h} mm (3h burst) recorded, exceeding drainage threshold.`,
        freshness: status.rainfall_freshness || 'FRESH',
        confidence: status.rainfall_confidence ?? 0.9,
      });
    } else if (rf24h >= 15.5) {
      supporting.push({
        source: 'IMD / TSDPS Telemetry',
        signal: 'Moderate Precipitation Runoff',
        importance: 'SUPPORTING',
        evidence: `${rf24h} mm rainfall in 24h contributing to surface accumulation.`,
        freshness: status.rainfall_freshness || 'FRESH',
        confidence: status.rainfall_confidence ?? 0.9,
      });
    }

    // 2. Hydrological Signal
    if (hydroStatus === 'WARNING' || hydroStatus === 'CRITICAL') {
      primary.push({
        source: 'CWC / Telangana I&CAD Telemetry',
        signal: `River Stage Threshold Alert (${hydroStatus})`,
        importance: 'PRIMARY',
        evidence: `${wbName} gauge reached ${hydroStatus} mark with ${hydroTrend.toLowerCase()} trend.`,
        freshness: hydro?.freshness || 'FRESH',
        confidence: hydro?.overall_confidence ?? 0.9,
      });
    } else if (hydroStatus === 'WATCH' || hydroTrend === 'RISING') {
      supporting.push({
        source: 'CWC / Telangana I&CAD Telemetry',
        signal: 'Elevated Hydrological Catchment Stage',
        importance: 'SUPPORTING',
        evidence: `${wbName} monitoring shows ${hydroStatus.toLowerCase()} condition with ${hydroTrend.toLowerCase()} trend.`,
        freshness: hydro?.freshness || 'FRESH',
        confidence: hydro?.overall_confidence ?? 0.9,
      });
    }

    // 3. Citizen Ground Intelligence
    if (citizenHighSev >= 1) {
      primary.push({
        source: 'Citizen Ground Intelligence',
        signal: 'Active Field Flooding Reports',
        importance: 'PRIMARY',
        evidence: `${citizenHighSev} High/Critical verified community report(s) on waterlogging/inundation.`,
        freshness: 'FRESH',
        confidence: 0.85,
      });
    } else if (citizenTotal > 0) {
      supporting.push({
        source: 'Citizen Ground Intelligence',
        signal: 'Community Ground Reports',
        importance: 'SUPPORTING',
        evidence: `${citizenTotal} field report(s) submitted by local citizens.`,
        freshness: 'FRESH',
        confidence: 0.80,
      });
    }

    // 4. Historical Vulnerability
    if (floodHistoryScore >= 70.0 && (rf24h >= 40.0 || status.flood_risk_score >= 50.0)) {
      primary.push({
        source: 'Telangana State Historical Flood Baseline',
        signal: 'High Historical Inundation Hotspot',
        importance: 'PRIMARY',
        evidence: `Historical flood vulnerability index is ${floodHistoryScore}/100 based on past flood records.`,
        freshness: 'STATIC_VERIFIED',
        confidence: 0.95,
      });
    } else if (floodHistoryScore >= 50.0) {
      supporting.push({
        source: 'Telangana State Historical Flood Baseline',
        signal: 'Historical Vulnerability Profile',
        importance: 'SUPPORTING',
        evidence: `Baseline historical flood score: ${floodHistoryScore}/100.`,
        freshness: 'STATIC_VERIFIED',
        confidence: 0.95,
      });
    }

    // 5. Drainage Bottlenecks
    if (drainageScore >= 75.0 && (rf24h >= 40.0 || citizenTotal >= 1)) {
      primary.push({
        source: 'Municipal Drainage & Terrain Registry',
        signal: 'Urban Stormwater Bottleneck',
        importance: 'PRIMARY',
        evidence: `Drainage vulnerability score: ${drainageScore}/100 (high runoff impedance).`,
        freshness: 'STATIC_VERIFIED',
        confidence: 0.90,
      });
    } else if (drainageScore >= 50.0) {
      supporting.push({
        source: 'Municipal Drainage & Terrain Registry',
        signal: 'Drainage Channel Congestion',
        importance: 'SUPPORTING',
        evidence: `Drainage vulnerability score: ${drainageScore}/100.`,
        freshness: 'STATIC_VERIFIED',
        confidence: 0.90,
      });
    }

    // Fallback if no primary drivers
    if (primary.length === 0) {
      primary.push({
        source: 'Integrated Multi-Signal Telemetry',
        signal: 'Baseline Hydrometeorological Stability',
        importance: 'PRIMARY',
        evidence: 'Rainfall within baseline limits and river water levels below warning thresholds.',
        freshness: status.rainfall_freshness || 'FRESH',
        confidence: 0.90,
      });
    }

    return { primaryDrivers: primary, supportingSignals: supporting };
  }

  /**
   * Deterministic Operational Situation Classification:
   * - CRITICAL_INFORMATIONAL
   * - HIGH_CONCERN
   * - ELEVATED_ATTENTION
   * - MONITORING
   * - NORMAL
   */
  public classifyOperationalSituation(
    status: DistrictStatus,
    anomalies: any[] = []
  ): OperationalSituationCategory {
    const risk = status.flood_risk_score || 0;
    const rf24h = status.rainfall_mm_24h || 0;
    const hydro = status.hydrological_summary;
    const hydroStatus = hydro?.dominant_status || 'UNKNOWN';
    const hydroTrend = hydro?.dominant_trend || 'UNKNOWN';
    const citizenHighSev = status.citizen_reports_high_severity || 0;
    const citizenTotal = status.citizen_reports_count || 0;

    const hasCriticalAnomaly = anomalies.some(
      (a) => a.type === 'DISCHARGE_SPIKE' || a.type === 'RAPID_LEVEL_RISE'
    );

    // 1. CRITICAL_INFORMATIONAL
    if (
      risk >= 75.0 ||
      (hydroStatus === 'CRITICAL' && (rf24h >= 64.5 || citizenHighSev >= 1)) ||
      (rf24h >= 140.0 && citizenHighSev >= 2) ||
      (hydroStatus === 'CRITICAL' && hasCriticalAnomaly)
    ) {
      return 'CRITICAL_INFORMATIONAL';
    }

    // 2. HIGH_CONCERN
    if (
      risk >= 60.0 ||
      hydroStatus === 'WARNING' ||
      hydroStatus === 'CRITICAL' ||
      (rf24h >= 64.5 && (citizenHighSev >= 1 || hydroTrend === 'RISING')) ||
      citizenHighSev >= 3 ||
      (hydroStatus === 'WATCH' && hydroTrend === 'RISING' && citizenHighSev >= 1) ||
      rf24h >= 100.0
    ) {
      return 'HIGH_CONCERN';
    }

    // 3. ELEVATED_ATTENTION
    if (
      risk >= 40.0 ||
      rf24h >= 35.5 ||
      hydroStatus === 'WATCH' ||
      hydroTrend === 'RISING' ||
      citizenHighSev >= 1 ||
      citizenTotal >= 2 ||
      anomalies.length > 0
    ) {
      return 'ELEVATED_ATTENTION';
    }

    // 4. MONITORING
    if (
      risk >= 20.0 ||
      rf24h >= 15.5 ||
      citizenTotal >= 1 ||
      (hydroStatus !== 'NORMAL' && hydroStatus !== 'UNKNOWN')
    ) {
      return 'MONITORING';
    }

    // 5. NORMAL
    return 'NORMAL';
  }

  /**
   * Generates deterministic, operational monitoring recommendations.
   */
  public generateRecommendedActions(
    situation: OperationalSituationCategory,
    status: DistrictStatus
  ): string[] {
    const actions: string[] = [];
    const citizenHighSev = status.citizen_reports_high_severity || 0;

    switch (situation) {
      case 'CRITICAL_INFORMATIONAL':
        actions.push('Maintain continuous real-time telemetry observation and situation log reviews.');
        if (citizenHighSev > 0) {
          actions.push(`Prioritize rapid field cross-checks for ${citizenHighSev} high-severity citizen flood distress reports.`);
        }
        actions.push('Track river gauge surge rates and reservoir emergency release protocols closely.');
        actions.push('Ensure administrative response teams have immediate visibility into composite multi-signal drivers.');
        break;

      case 'HIGH_CONCERN':
        actions.push('Prioritize field verification of active high-severity citizen inundation reports.');
        actions.push('Monitor river/reservoir water level trends and dam discharge schedules frequently.');
        actions.push('Inspect primary urban drainage bottlenecks and low-lying habitations.');
        actions.push('Coordinate inter-agency telemetry cross-checks (IMD radar & CWC stream gauges).');
        break;

      case 'ELEVATED_ATTENTION':
        actions.push('Increase telemetry polling frequency for low-lying and catchment zones.');
        actions.push('Cross-reference newly submitted citizen ground reports with local rainfall intensity.');
        actions.push('Alert field monitoring staff for designated nala and culvert vulnerable hotspots.');
        break;

      case 'MONITORING':
        actions.push('Review upcoming rainfall telemetry and catchment run-off forecasts.');
        actions.push('Monitor local stormwater drainage channels for localized stagnation.');
        break;

      case 'NORMAL':
      default:
        actions.push('Continue routine automated telemetry monitoring.');
        actions.push('Maintain standard baseline polling intervals across weather and hydrological feeds.');
        break;
    }

    return actions;
  }

  /**
   * Generates transparent data limitations notes.
   */
  public generateDataLimitations(coverage: SignalCoverage, status: DistrictStatus): string[] {
    const limitations: string[] = [];
    const hydro = status.hydrological_summary;

    if (!coverage.signals.hydrology || !hydro || hydro.dominant_status === 'UNKNOWN') {
      limitations.push('No dedicated river/reservoir gauging stations in this district (stormwater drainage monitored via municipal network).');
    } else if (hydro.freshness === 'STALE' || hydro.freshness === 'EXPIRED') {
      limitations.push('Hydrological gauge telemetry is aging or stale (>24 hours since last official transmission).');
    }

    if (status.rainfall_data_mode === 'SIMULATED' || status.is_simulated) {
      limitations.push('Rainfall telemetry is running in calibrated simulation prototype mode.');
    } else if (status.rainfall_freshness === 'STALE' || status.rainfall_freshness === 'EXPIRED') {
      limitations.push('Rainfall observation timestamp is overdue.');
    }

    if ((status.citizen_reports_count || 0) === 0) {
      limitations.push('Zero recent citizen ground reports available for localized cross-validation.');
    }

    if (coverage.available < 5) {
      limitations.push(`Partial multi-signal domain coverage: ${coverage.available}/5 domains available.`);
    }

    return limitations;
  }

  /**
   * Core fusion pipeline: Ingests a DistrictStatus and produces a complete, explainable DistrictSituation.
   */
  public fuseDistrictSituation(status: DistrictStatus): DistrictSituation {
    const coverage = this.calculateSignalCoverage(status);
    const { confidence: dataConfidence, score: dataConfidenceScore } = this.calculateDataConfidence(coverage, status);
    const { primaryDrivers, supportingSignals } = this.extractRiskDrivers(status);
    const anomalies: any[] = [];
    if (status.hydrological_summary?.anomalies && status.hydrological_summary.anomalies.length > 0) {
      status.hydrological_summary.anomalies.forEach((a) => {
        anomalies.push({
          type: 'HYDROLOGICAL_ANOMALY',
          description: a.description,
          severity: a.severity || 'HIGH',
        });
      });
    }
    const operationalSituation = this.classifyOperationalSituation(status, anomalies);
    const recommendedActions = this.generateRecommendedActions(operationalSituation, status);
    const dataLimitations = this.generateDataLimitations(coverage, status);

    const rf24h = status.rainfall_mm_24h || 0;
    let rfCond = 'Light / Normal Rainfall';
    if (rf24h >= 204.5) rfCond = 'Extremely Heavy Rainfall';
    else if (rf24h >= 115.6) rfCond = 'Very Heavy Rainfall';
    else if (rf24h >= 64.5) rfCond = 'Heavy Rainfall';
    else if (rf24h >= 15.5) rfCond = 'Moderate Rainfall';

    const hydro = status.hydrological_summary;
    const latestObs = hydro?.latest_observations?.[0];

    const freshnessSummary: Record<string, string> = {
      rainfall: status.rainfall_freshness || 'FRESH',
      hydrology: hydro?.freshness || 'UNAVAILABLE',
      citizen: (status.citizen_reports_count || 0) > 0 ? 'FRESH' : 'AGING',
      flood_history: 'STATIC_VERIFIED',
      drainage_vulnerability: 'STATIC_VERIFIED',
    };

    return {
      districtId: status.district_id,
      districtName: status.district,
      compositeRiskScore: status.flood_risk_score,
      compositeRiskLevel: status.risk_category,
      operationalSituation,
      dataConfidence,
      dataConfidenceScore,
      signalCoverage: coverage,
      freshnessSummary,
      rainfallSummary: {
        condition: rfCond,
        value_24h: rf24h,
        value_3h: status.rainfall_mm_3h || 0,
        score: status.contributions?.rainfall ?? 0,
        dataMode: status.rainfall_data_mode || 'SIMULATED',
        freshness: status.rainfall_freshness || 'FRESH',
        source: status.rainfall_source || 'IMD / TSDPS Telemetry',
      },
      hydrologySummary: hydro
        ? {
            primaryWaterBody: hydro.primary_water_body,
            waterBodyType: latestObs?.water_body_type,
            latestValue: latestObs?.value,
            unit: latestObs?.unit || 'm',
            dominantStatus: hydro.dominant_status,
            dominantTrend: hydro.dominant_trend,
            dataMode: hydro.data_mode,
            freshness: hydro.freshness,
            source: hydro.source_attribution,
            hasAnomaly: (hydro.anomalies?.length ?? 0) > 0,
            anomalyDesc: hydro.anomalies?.[0]?.description,
          }
        : undefined,
      citizenSummary: {
        totalReports: status.citizen_reports_count || 0,
        highSeverityReports: status.citizen_reports_high_severity || 0,
        criticalReports: status.citizen_reports_critical || 0,
        trend: status.citizen_reports_trend || 'Stable',
        score: status.citizen_report_score || 0,
        explainability: status.citizen_explainability,
      },
      primaryDrivers,
      supportingSignals,
      dataLimitations,
      recentAnomalies: anomalies,
      recommendedActions,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Alias for fuseDistrictSituation
   */
  public synthesizeDistrictSituation(status: DistrictStatus): DistrictSituation {
    return this.fuseDistrictSituation(status);
  }
}

export const situationFusionService = new SituationFusionService();
