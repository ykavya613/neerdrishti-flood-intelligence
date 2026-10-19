import {
  DistrictForecastPoint,
  DistrictForecastTimeline,
  ForecastConfidenceLevel,
  ForecastDataMode,
  ForecastDriver,
  ForecastHorizonHours,
  ForecastOutlookCategory,
  RiskTrend,
  OperationalSituationCategory
} from '../types/signals';
import { normalizeDistrict } from './district_normalizer';
import { calculateBasinInfluence } from './basin_routing_service';
import { insertForecastSnapshot, getLatestDistrictForecastSnapshots } from '../db/sqlite';

export function classifyForecastRainfall(mm: number): 'LIGHT' | 'MODERATE' | 'HEAVY' | 'VERY_HEAVY' | 'EXTREME' {
  if (mm >= 115.5) return 'EXTREME';
  if (mm >= 64.5) return 'VERY_HEAVY';
  if (mm >= 35.5) return 'HEAVY';
  if (mm >= 15.5) return 'MODERATE';
  return 'LIGHT';
}

export function evaluateForecastConfidence(
  rfMode: string,
  rfFreshness: string,
  hydroFreshness: string,
  forecastMode: ForecastDataMode,
  horizonHours: ForecastHorizonHours
): { score: number; level: ForecastConfidenceLevel; reason: string } {
  const baseScore = 0.85;

  let hPenalty = 0.00;
  if (horizonHours === 6) hPenalty = 0.05;
  else if (horizonHours === 12) hPenalty = 0.12;
  else if (horizonHours === 24) hPenalty = 0.20;

  let modeScore = 0.60;
  if (forecastMode === 'LIVE_FORECAST') modeScore = 0.90;
  else if (forecastMode === 'HISTORICAL_BASELINE') modeScore = 0.70;
  else if (forecastMode === 'UNAVAILABLE') modeScore = 0.30;

  const rfFScore = rfFreshness === 'FRESH' ? 0.90 : rfFreshness === 'AGING' ? 0.70 : 0.40;
  const hydroFScore = hydroFreshness === 'FRESH' ? 0.90 : hydroFreshness === 'AGING' ? 0.70 : 0.50;

  let score = Math.round((baseScore * 0.40 + modeScore * 0.30 + (rfFScore * 0.15 + hydroFScore * 0.15) - hPenalty) * 100) / 100;
  score = Math.max(0.10, Math.min(0.98, score));

  let level: ForecastConfidenceLevel = 'MEDIUM';
  let reason = '';

  if (score >= 0.78) {
    level = 'HIGH';
    reason = `High confidence: Fresh telemetry coupled with low horizon uncertainty (${horizonHours}h).`;
  } else if (score >= 0.58) {
    level = 'MEDIUM';
    reason = `Medium confidence: Reliable forecast inputs with moderate horizon projection dispersion at +${horizonHours}h.`;
  } else if (score >= 0.40) {
    level = 'LOW';
    reason = `Low confidence: Aging telemetry and +${horizonHours}h forecast temporal dispersion.`;
  } else {
    level = 'LIMITED';
    reason = `Limited confidence: Model relying primarily on simulation baselines; telemetry unavailable or expired.`;
  }

  return { score, level, reason };
}

export function extractForecastDrivers(
  currentRisk: number,
  projectedRisk: number,
  riskChange: number,
  forecastRf: number,
  rfIntensity: string,
  hydroStatus: string,
  hydroTrend: string,
  hydroSummary: any,
  basinInfo: any,
  drainVuln: number,
  floodHist: number,
  citScore: number,
  forecastMode: ForecastDataMode,
  horizonHours: ForecastHorizonHours
): { primary: ForecastDriver[]; supporting: ForecastDriver[]; evidence: string[] } {
  const primary: ForecastDriver[] = [];
  const supporting: ForecastDriver[] = [];
  const evidence: string[] = [];
  const nowStr = new Date().toISOString();

  // 1. Forecast Rainfall driver
  if (forecastRf >= 35.0) {
    const pDrv: ForecastDriver = {
      driverName: `Forecast ${rfIntensity.toLowerCase().replace('_', ' ')} Rainfall`,
      signalType: 'FORECAST_RAINFALL',
      importance: 'PRIMARY',
      scoreOrSeverity: `${forecastRf.toFixed(1)} mm`,
      evidence: `Projected accumulation of ${forecastRf.toFixed(1)} mm within +${horizonHours}h window.`,
      source: 'IMD NWP Grid Telemetry',
      dataMode: forecastMode,
      freshness: 'FRESH',
      confidence: 0.85,
      timestamp: nowStr,
    };
    primary.push(pDrv);
    evidence.push(pDrv.evidence);
  } else if (forecastRf >= 15.0) {
    const sDrv: ForecastDriver = {
      driverName: 'Forecast Moderate Rainfall',
      signalType: 'FORECAST_RAINFALL',
      importance: 'SUPPORTING',
      scoreOrSeverity: `${forecastRf.toFixed(1)} mm`,
      evidence: `Anticipated precipitation of ${forecastRf.toFixed(1)} mm over next +${horizonHours}h.`,
      source: 'IMD NWP Grid Telemetry',
      dataMode: forecastMode,
      freshness: 'FRESH',
      confidence: 0.80,
      timestamp: nowStr,
    };
    supporting.push(sDrv);
    evidence.push(sDrv.evidence);
  }

  // 2. Upstream Basin Propagation Driver
  const threats = basinInfo?.active_upstream_threats || [];
  for (const t of threats) {
    const pBasin: ForecastDriver = {
      driverName: `Upstream Inflow: ${t.upstream_district_name}`,
      signalType: 'BASIN_PROPAGATION',
      importance: t.projected_downstream_impact_score >= 4.0 ? 'PRIMARY' : 'SUPPORTING',
      scoreOrSeverity: `+${t.projected_downstream_impact_score.toFixed(1)} pts`,
      evidence: t.evidence,
      source: 'Basin Propagation Model',
      dataMode: 'HISTORICAL',
      freshness: 'FRESH',
      confidence: 0.85,
      timestamp: nowStr,
    };
    if (pBasin.importance === 'PRIMARY') {
      primary.push(pBasin);
    } else {
      supporting.push(pBasin);
    }
    evidence.push(t.evidence);
  }

  // 3. Hydrological Status Driver
  if (hydroStatus === 'WARNING' || hydroStatus === 'CRITICAL' || (hydroStatus === 'WATCH' && hydroTrend === 'RISING')) {
    const wbName = hydroSummary?.primary_water_body || 'River/Dam Reach';
    const hDrv: ForecastDriver = {
      driverName: `Hydrological ${hydroStatus} Condition`,
      signalType: 'HYDROLOGICAL_TELEMETRY',
      importance: 'PRIMARY',
      scoreOrSeverity: hydroStatus,
      evidence: `${wbName} river stage is ${hydroStatus} with ${hydroTrend.toLowerCase()} trend, increasing backwater risk.`,
      source: hydroSummary?.source_attribution || 'CWC / State Gauge Network',
      dataMode: hydroSummary?.data_mode || 'LIVE',
      freshness: hydroSummary?.freshness || 'FRESH',
      confidence: 0.90,
      timestamp: nowStr,
    };
    primary.push(hDrv);
    evidence.push(hDrv.evidence);
  } else if (hydroTrend === 'RISING') {
    const hSupp: ForecastDriver = {
      driverName: 'Rising River Stage',
      signalType: 'HYDROLOGICAL_TELEMETRY',
      importance: 'SUPPORTING',
      scoreOrSeverity: 'RISING',
      evidence: 'Active river gauges record rising water level trend.',
      source: hydroSummary?.source_attribution || 'CWC Gauge Network',
      dataMode: hydroSummary?.data_mode || 'LIVE',
      freshness: hydroSummary?.freshness || 'FRESH',
      confidence: 0.85,
      timestamp: nowStr,
    };
    supporting.push(hSupp);
    evidence.push(hSupp.evidence);
  }

  // 4. Drainage Vulnerability
  if (drainVuln >= 70.0 && (forecastRf >= 20.0 || currentRisk >= 50.0)) {
    const dDrv: ForecastDriver = {
      driverName: 'Severe Drainage Bottlenecks',
      signalType: 'DRAINAGE_VULNERABILITY',
      importance: primary.length === 0 ? 'PRIMARY' : 'SUPPORTING',
      scoreOrSeverity: `${Math.round(drainVuln)}/100`,
      evidence: `Low surface runoff infiltration (${Math.round(drainVuln)}/100) causes rapid localized waterlogging during forecast rainfall bursts.`,
      source: 'Municipal Drainage Vulnerability Atlas',
      dataMode: 'HISTORICAL',
      freshness: 'FRESH',
      confidence: 0.90,
      timestamp: nowStr,
    };
    if (dDrv.importance === 'PRIMARY') primary.push(dDrv);
    else supporting.push(dDrv);
    evidence.push(dDrv.evidence);
  }

  // 5. Flood History
  if (floodHist >= 65.0) {
    supporting.push({
      driverName: 'High Historical Inundation Susceptibility',
      signalType: 'FLOOD_HISTORY',
      importance: 'SUPPORTING',
      scoreOrSeverity: `${Math.round(floodHist)}/100`,
      evidence: `District has high historical flood recurrence (${Math.round(floodHist)}/100) in state disaster records.`,
      source: 'Telangana SDMA Baseline',
      dataMode: 'HISTORICAL',
      freshness: 'FRESH',
      confidence: 0.95,
      timestamp: nowStr,
    });
  }

  // 6. Fallback
  if (primary.length === 0) {
    const baseDrv: ForecastDriver = {
      driverName: 'Baseline Flood Risk Index',
      signalType: 'COMPOSITE_RISK',
      importance: 'PRIMARY',
      scoreOrSeverity: `${Math.round(currentRisk)}/100`,
      evidence: `Current multi-factor baseline risk index of ${Math.round(currentRisk)}/100.`,
      source: 'NeerDrishti 5-Factor Risk Engine',
      dataMode: 'LIVE',
      freshness: 'FRESH',
      confidence: 0.90,
      timestamp: nowStr,
    };
    primary.push(baseDrv);
    evidence.push(baseDrv.evidence);
  }

  return { primary, supporting, evidence };
}

/** Live district objects use flood_risk_score; older Python payloads used composite_risk_score. */
export function resolveCurrentRiskScore(districtStatus: any): number {
  const raw = districtStatus?.flood_risk_score ?? districtStatus?.composite_risk_score ?? districtStatus?.currentRiskScore;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function buildNowForecastPoint(timeline: DistrictForecastTimeline): DistrictForecastPoint {
  const template = timeline.timeline.h6;
  const currentRisk = Number(timeline.currentRiskScore ?? 0);
  return {
    ...template,
    forecastHorizonHours: 0,
    label: 'NOW',
    projectedRiskScore: currentRisk,
    currentRiskScore: currentRisk,
    projectedRiskChange: 0,
    riskTrend: 'STABLE',
    outlookCategory: 'STABLE',
    projectedRainfall_mm: Number(template.metadata?.currentRainfall24h ?? template.projectedRainfall_mm ?? 0),
    basinInfluenceContribution: 0,
    evidence: [`Current calculated flood risk is ${currentRisk}/100 (NOW baseline).`],
    limitations: [
      ...(template.limitations || []),
      'NOW is the current calculated score, not a future projection.',
    ],
  };
}

/** Peak among NOW, +3H, +6H, +12H, +24H for dashboard / alerts / assistant. */
export function selectPeakForecastSummary(timeline: DistrictForecastTimeline): DistrictForecastPoint {
  const candidates: DistrictForecastPoint[] = [
    buildNowForecastPoint(timeline),
    timeline.timeline.h3,
    timeline.timeline.h6,
    timeline.timeline.h12,
    timeline.timeline.h24,
  ];
  let peak = candidates[0];
  for (const c of candidates) {
    if (c.projectedRiskScore > peak.projectedRiskScore) {
      peak = c;
    }
  }
  return peak;
}

export function projectDistrictRisk(
  districtStatus: any,
  horizonHours: ForecastHorizonHours = 6,
  forecastRainfallMm?: number,
  forecastDataMode: ForecastDataMode = 'SIMULATED_FORECAST',
  allDistrictStatuses?: Record<string, any>,
  customSources?: string[]
): DistrictForecastPoint {
  const districtId = districtStatus.district_id || districtStatus.id || 'TEL-HYD';
  const norm = normalizeDistrict(districtId);
  const dId = norm.canonical_id;
  const dName = norm.district_name;

  const currentRisk = resolveCurrentRiskScore(districtStatus);
  const currentRf = Number(districtStatus.rainfall_mm_24h ?? 0.0);
  const floodHist = Number(districtStatus.flood_history_score ?? 50.0);
  const topoRisk = Number(districtStatus.location_risk_score ?? 50.0);
  const citScore = Number(districtStatus.citizen_report_score ?? 0.0);
  const drainVuln = Number(districtStatus.drainage_vulnerability_score ?? 50.0);
  const rfFreshness = districtStatus.rainfall_freshness || 'FRESH';
  const rfMode = districtStatus.rainfall_data_mode || 'SIMULATED';

  const hydroSummary = districtStatus.hydrological_summary || {};
  const hydroStatus = hydroSummary.dominant_status || 'NORMAL';
  const hydroTrend = hydroSummary.dominant_trend || 'STABLE';
  const hydroFreshness = hydroSummary.freshness || 'FRESH';

  // Default projection curve if rainfall not specified
  let projRf = forecastRainfallMm;
  if (projRf === undefined || projRf === null) {
    if (horizonHours === 3) {
      projRf = Math.round((currentRf * 0.35 + (currentRf > 40 ? 8.0 : 2.0)) * 10) / 10;
    } else if (horizonHours === 6) {
      projRf = Math.round((currentRf * 0.70 + (currentRf > 40 ? 15.0 : 5.0)) * 10) / 10;
    } else if (horizonHours === 12) {
      projRf = Math.round((currentRf * 1.10 + (currentRf > 40 ? 22.0 : 8.0)) * 10) / 10;
    } else {
      projRf = Math.round((currentRf * 1.30 + (currentRf > 40 ? 28.0 : 10.0)) * 10) / 10;
    }
  }

  const intensity = classifyForecastRainfall(projRf);
  const basinInfo = calculateBasinInfluence(dId, allDistrictStatuses, horizonHours);
  const basinSurge = basinInfo.total_projected_basin_surge;

  // Rainfall factor delta (preserving 35% weight)
  const projectedEffectiveRf = currentRf * 0.6 + projRf * 0.8;
  const rfProjScore = Math.min(projectedEffectiveRf / 1.5, 100.0);
  const currentRfScore = Math.min(currentRf / 1.5, 100.0);
  const rfDelta = (rfProjScore - currentRfScore) * 0.35;

  // Hydro delta
  let hydroDelta = 0.0;
  if (hydroStatus === 'CRITICAL') {
    hydroDelta += hydroTrend === 'RISING' ? 14.0 : 8.0;
  } else if (hydroStatus === 'WARNING') {
    hydroDelta += hydroTrend === 'RISING' ? 9.0 : 4.0;
  } else if (hydroStatus === 'WATCH') {
    hydroDelta += hydroTrend === 'RISING' ? 4.0 : 1.0;
  } else if (hydroTrend === 'RISING') {
    hydroDelta += 3.0;
  } else if (hydroTrend === 'FALLING' && projRf < 15.0) {
    hydroDelta -= 4.0;
  }

  // Drainage delta
  let drainageDelta = 0.0;
  if (projRf > 35.0) {
    drainageDelta = (drainVuln / 100.0) * (horizonHours / 24.0) * 8.0;
  } else if (horizonHours >= 12 && projRf < 10.0 && hydroTrend !== 'RISING') {
    drainageDelta = -((100.0 - drainVuln) / 100.0) * (horizonHours / 24.0) * 6.0;
  }

  const rawProjected = currentRisk + rfDelta + hydroDelta + basinSurge + drainageDelta;
  const projectedRiskScore = Math.round(Math.max(0.0, Math.min(100.0, rawProjected)) * 10) / 10;
  const projectedRiskChange = Math.round((projectedRiskScore - currentRisk) * 10) / 10;

  let riskTrend: RiskTrend = 'STABLE';
  if (projectedRiskChange >= 3.5) riskTrend = 'RISING';
  else if (projectedRiskChange <= -3.5) riskTrend = 'IMPROVING';

  const { score: confScore, level: confLevel, reason: confReason } = evaluateForecastConfidence(
    rfMode,
    rfFreshness,
    hydroFreshness,
    forecastDataMode,
    horizonHours
  );

  if (confLevel === 'LIMITED' && Math.abs(projectedRiskChange) > 15) {
    riskTrend = 'UNCERTAIN';
  }

  let outlookCategory: ForecastOutlookCategory = 'STABLE';
  if (projectedRiskScore >= 75.0 && (intensity === 'VERY_HEAVY' || intensity === 'EXTREME' || hydroStatus === 'WARNING' || hydroStatus === 'CRITICAL' || basinSurge >= 8.0)) {
    outlookCategory = 'CRITICAL_PROJECTION';
  } else if (projectedRiskScore >= 55.0 || (projectedRiskChange >= 14.0 && projectedRiskScore >= 45.0)) {
    outlookCategory = 'HIGH_PROJECTION';
  } else if (projectedRiskScore >= 35.0 || projectedRiskChange >= 8.0) {
    outlookCategory = 'ELEVATING_RISK';
  } else if (projectedRiskScore >= 20.0 || projectedRiskChange >= 4.0) {
    outlookCategory = 'WATCH_FOR_ESCALATION';
  } else if (confLevel === 'LIMITED') {
    outlookCategory = 'UNCERTAIN';
  }

  const { primary, supporting, evidence } = extractForecastDrivers(
    currentRisk,
    projectedRiskScore,
    projectedRiskChange,
    projRf,
    intensity,
    hydroStatus,
    hydroTrend,
    hydroSummary,
    basinInfo,
    drainVuln,
    floodHist,
    citScore,
    forecastDataMode,
    horizonHours
  );

  const limitations = [
    'This is an analytical model projection for decision support and NOT an official government flood forecast.',
    'Inflow arrival times are estimates based on catchment morphometry and may vary with localized gate operations.',
  ];
  if (forecastDataMode === 'SIMULATED_FORECAST') {
    limitations.push('Precipitation forecast is running on transparent simulation fallback mode.');
  }
  if (rfFreshness === 'STALE' || rfFreshness === 'EXPIRED') {
    limitations.push(`Base rainfall telemetry is ${rfFreshness.toLowerCase()} (>12h old); forecast uncertainty is elevated.`);
  }
  if (hydroStatus === 'UNKNOWN') {
    limitations.push('District does not contain an active river gauge station; hydrological projection relies on municipal drainage and basin routing.');
  }

  const sources = customSources || [
    'IMD High-Resolution Numerical Weather Prediction (NWP) Ensemble Grid',
    'Telangana State Development Planning Society (TSDPS) Automatic Weather Station Baseline',
    'Central Water Commission (CWC) Godavari & Krishna Basin Hydrological Telemetry',
    'NeerDrishti Upstream-Downstream Basin Propagation Model (Prototype)',
  ];

  const now = new Date();
  const validUntil = new Date(now.getTime() + horizonHours * 3600 * 1000).toISOString();

  return {
    districtId: dId,
    districtName: dName,
    forecastHorizonHours: horizonHours,
    label: `+${horizonHours}H`,
    projectedRiskScore,
    currentRiskScore: currentRisk,
    projectedRiskChange,
    riskTrend,
    outlookCategory,
    confidence: confLevel,
    confidenceScore: confScore,
    confidenceReason: confReason,
    forecastDataMode,
    projectedRainfall_mm: projRf,
    projectedRainfallIntensity: intensity,
    basinInfluenceContribution: basinSurge,
    primaryProjectedDrivers: primary,
    supportingSignals: supporting,
    evidence,
    forecastSources: sources,
    limitations,
    generatedAt: now.toISOString(),
    validUntil,
    metadata: {
      currentRainfall24h: currentRf,
      hydroStatus,
      hydroTrend,
      upstreamThreatsCount: basinInfo.active_upstream_threats.length,
    },
  };
}

export function projectDistrictTimeline(
  districtStatus: any,
  allDistrictStatuses?: Record<string, any>,
  forecastDataMode: ForecastDataMode = 'SIMULATED_FORECAST'
): DistrictForecastTimeline {
  const districtId = districtStatus.district_id || districtStatus.id || 'TEL-HYD';
  const norm = normalizeDistrict(districtId);
  const dId = norm.canonical_id;
  const dName = norm.district_name;

  const currentRisk = Number(districtStatus.composite_risk_score ?? 0.0);
  const currentLevel = districtStatus.risk_level || 'LOW';
  const currentOp: OperationalSituationCategory = districtStatus.situation_summary?.operationalCategory || 'NORMAL';

  const h3 = projectDistrictRisk(districtStatus, 3, undefined, forecastDataMode, allDistrictStatuses);
  const h6 = projectDistrictRisk(districtStatus, 6, undefined, forecastDataMode, allDistrictStatuses);
  const h12 = projectDistrictRisk(districtStatus, 12, undefined, forecastDataMode, allDistrictStatuses);
  const h24 = projectDistrictRisk(districtStatus, 24, undefined, forecastDataMode, allDistrictStatuses);

  const points: Array<{ h: ForecastHorizonHours; r: number }> = [
    { h: 3, r: h3.projectedRiskScore },
    { h: 6, r: h6.projectedRiskScore },
    { h: 12, r: h12.projectedRiskScore },
    { h: 24, r: h24.projectedRiskScore },
  ];

  let maxPoint = points[0];
  for (const p of points) {
    if (p.r > maxPoint.r) maxPoint = p;
  }

  let dominantTrend: RiskTrend = 'STABLE';
  if (h6.riskTrend === 'RISING' || h12.riskTrend === 'RISING') {
    dominantTrend = 'RISING';
  } else if (h24.riskTrend === 'IMPROVING') {
    dominantTrend = 'IMPROVING';
  }

  const severityOrder: Record<ForecastOutlookCategory, number> = {
    CRITICAL_PROJECTION: 5,
    HIGH_PROJECTION: 4,
    ELEVATING_RISK: 3,
    WATCH_FOR_ESCALATION: 2,
    STABLE: 1,
    UNCERTAIN: 0,
  };

  const outlookList: ForecastOutlookCategory[] = [h3.outlookCategory, h6.outlookCategory, h12.outlookCategory, h24.outlookCategory];
  let overallOutlook = outlookList[0];
  for (const o of outlookList) {
    if (severityOrder[o] > severityOrder[overallOutlook]) {
      overallOutlook = o;
    }
  }

  const basinInfo = calculateBasinInfluence(dId, allDistrictStatuses, 6);

  // Optional: save snapshot into SQLite for audit ledger
  try {
    insertForecastSnapshot({
      district_id: dId,
      forecast_generated_at: h6.generatedAt,
      forecast_horizon_hours: 6,
      projected_risk_score: h6.projectedRiskScore,
      current_risk_score: currentRisk,
      projected_risk_change: h6.projectedRiskChange,
      risk_trend: h6.riskTrend,
      outlook_category: h6.outlookCategory,
      confidence: h6.confidence,
      confidence_score: h6.confidenceScore,
      data_mode: h6.forecastDataMode,
      primary_drivers: h6.primaryProjectedDrivers,
      supporting_signals: h6.supportingSignals,
      forecast_sources: h6.forecastSources,
      limitations: h6.limitations,
      metadata: h6.metadata,
    });
  } catch (err) {
    // Non-blocking snapshot persist
  }

  return {
    districtId: dId,
    districtName: dName,
    currentRiskScore: currentRisk,
    currentRiskLevel: currentLevel,
    currentOperationalCategory: currentOp,
    overallForecastOutlook: overallOutlook,
    dominantTrend,
    maxProjectedRisk: maxPoint.r,
    maxRiskHorizonHours: maxPoint.h,
    timeline: {
      now: {
        riskScore: currentRisk,
        riskLevel: currentLevel,
        operationalCategory: currentOp,
        timestamp: new Date().toISOString(),
      },
      h3,
      h6,
      h12,
      h24,
    },
    basinInfluence: basinInfo,
    dataConfidence: h6.confidence,
    confidenceReason: h6.confidenceReason,
    dataMode: forecastDataMode,
    sourcesAttribution: h6.forecastSources,
    disclaimer: 'Informational model projection only. Not an official flood warning or disaster declaration.',
    generatedAt: new Date().toISOString(),
  };
}

export function projectAllDistricts(
  allDistrictStatuses: any[],
  forecastDataMode: ForecastDataMode = 'SIMULATED_FORECAST'
): Record<string, DistrictForecastTimeline> {
  const statusMap: Record<string, any> = {};
  for (const d of allDistrictStatuses) {
    const id = d.district_id || d.id;
    if (id) statusMap[id] = d;
  }

  const results: Record<string, DistrictForecastTimeline> = {};
  for (const d of allDistrictStatuses) {
    const id = d.district_id || d.id;
    if (id) {
      results[id] = projectDistrictTimeline(d, statusMap, forecastDataMode);
    }
  }
  return results;
}
