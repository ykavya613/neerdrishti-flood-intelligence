import fs from 'fs';
import path from 'path';
import {
  HydrologicalStation,
  HydrologicalObservation,
  HydrologicalDistrictSummary,
  HydrologicalStatus,
  HydrologicalTrend,
  HydrologicalAnomaly,
  SignalDataMode,
  SignalFreshness,
  SignalType,
  SourceType
} from '../types/signals';
import {
  getAllHydrologicalStations as getDbStations,
  getHydrologicalStationById as getDbStationById,
  getLatestHydrologicalSignals,
  getStationSignalHistory,
  insertExternalSignal,
  detectDuplicateSignal
} from '../db/sqlite';
import { normalizeDistrict } from './district_normalizer';
import { evaluateFreshness, validateSignal } from './signal_validator';
import { DATA_SOURCES } from '../config/data_sources';

export interface RawHydrologicalObservation {
  rawDistrict?: string;
  stationId: string;
  stationName?: string;
  waterBodyName?: string;
  waterBodyType?: string;
  signalType: SignalType;
  value: number;
  unit?: string;
  sourceName?: string;
  sourceType?: string;
  dataMode?: SignalDataMode;
  timestamp?: string;
  warningThreshold?: number;
  dangerThreshold?: number;
  metadata?: Record<string, any>;
}

let cachedStations: HydrologicalStation[] | null = null;

/**
 * Loads the hydrological stations from disk or database.
 */
export function loadHydrologicalStations(): HydrologicalStation[] {
  if (cachedStations && cachedStations.length > 0) {
    return cachedStations;
  }

  try {
    const dbStations = getDbStations();
    if (dbStations && dbStations.length > 0) {
      cachedStations = dbStations.map((s) => ({
        station_id: s.station_id,
        station_name: s.station_name,
        water_body_name: s.water_body_name,
        water_body_type: s.water_body_type,
        district_id: s.district_id,
        basin: s.basin || undefined,
        latitude: s.latitude || undefined,
        longitude: s.longitude || undefined,
        warning_threshold: s.warning_threshold || undefined,
        danger_threshold: s.danger_threshold || undefined,
        unit: s.unit || 'm',
        active: Boolean(s.active),
        metadata: s.metadata ? (typeof s.metadata === 'string' ? JSON.parse(s.metadata) : s.metadata) : {},
      }));
      return cachedStations;
    }

    const stationsPath = path.join(process.cwd(), 'data', 'hydrological_stations.json');
    if (fs.existsSync(stationsPath)) {
      const raw = fs.readFileSync(stationsPath, 'utf-8');
      cachedStations = JSON.parse(raw);
      return cachedStations || [];
    }
  } catch (err) {
    console.error('Failed loading hydrological stations:', err);
  }

  return [];
}

/**
 * Gets stations for a specific district or all districts.
 */
export function getHydrologicalStations(districtId?: string): HydrologicalStation[] {
  const all = loadHydrologicalStations();
  if (!districtId) return all;
  const norm = normalizeDistrict(districtId);
  const targetId = norm.resolved ? norm.districtId : districtId.toLowerCase().trim();
  return all.filter((s) => s.district_id.toLowerCase() === targetId);
}

/**
 * Gets station by ID.
 */
export function getStationById(stationId: string): HydrologicalStation | null {
  const all = loadHydrologicalStations();
  const stn = all.find((s) => s.station_id.toLowerCase() === stationId.toLowerCase());
  return stn || null;
}

/**
 * Ingests and persists a hydrological observation (river level, reservoir storage, dam discharge) into SQLite ledger.
 */
export function ingestHydrologicalObservation(raw: RawHydrologicalObservation): {
  success: boolean;
  observation?: HydrologicalObservation;
  error?: string;
} {
  const stn = getStationById(raw.stationId);
  const targetDistrict = raw.rawDistrict || (stn ? stn.district_id : undefined);

  if (!targetDistrict) {
    return { success: false, error: `Cannot resolve district for station ID: ${raw.stationId}` };
  }

  const norm = normalizeDistrict(targetDistrict);
  const districtId = norm.resolved ? norm.districtId : targetDistrict.toLowerCase().trim();
  const recordedAt = raw.timestamp || new Date().toISOString();
  const signalType = raw.signalType || 'river_level';
  const unit = raw.unit || (stn ? stn.unit : 'm');
  const sourceName = raw.sourceName || (stn ? `${stn.station_name} Hydrological Telemetry` : 'CWC / I&CAD Telemetry');
  const sourceType: SourceType = (raw.sourceType as SourceType) || 'official_api';
  const dataMode = raw.dataMode || 'LIVE';

  const freshnessRes = evaluateFreshness(recordedAt, new Date(), signalType);

  const warnThresh = raw.warningThreshold !== undefined ? raw.warningThreshold : (stn?.warning_threshold);
  const dangerThresh = raw.dangerThreshold !== undefined ? raw.dangerThreshold : (stn?.danger_threshold);
  const status = classifyHydrologicalStatus(raw.value, warnThresh, dangerThresh);

  // Validate signal bounds
  const candidateSignal = {
    districtId,
    sourceName,
    sourceType,
    signalType,
    value: raw.value,
    unit,
    dataMode,
    freshness: freshnessRes.status,
    confidence: Math.round(freshnessRes.factor * 0.95 * 100) / 100,
    isValid: true,
    recordedAt,
    ingestedAt: new Date().toISOString(),
    metadata: {
      station_id: raw.stationId,
      station_name: raw.stationName || stn?.station_name,
      water_body_name: raw.waterBodyName || stn?.water_body_name,
      water_body_type: raw.waterBodyType || stn?.water_body_type,
      ...raw.metadata,
    },
  };

  const valRes = validateSignal(candidateSignal as any);
  if (!valRes.isValid) {
    return { success: false, error: `Hydrological signal validation failed: ${valRes.errors.join(', ')}` };
  }

  // Duplicate detection
  const isDup = detectDuplicateSignal(districtId, sourceName, signalType, recordedAt);
  let signalId: number | undefined;

  if (!isDup) {
    signalId = insertExternalSignal({
      district_id: districtId,
      source_name: sourceName,
      source_type: sourceType,
      signal_type: signalType,
      value: raw.value,
      unit,
      data_mode: dataMode,
      freshness: candidateSignal.freshness,
      confidence: candidateSignal.confidence,
      is_valid: 1,
      recorded_at: recordedAt,
      metadata: candidateSignal.metadata,
    });
  }

  const observation: HydrologicalObservation = {
    id: signalId,
    station_id: raw.stationId,
    station_name: raw.stationName || stn?.station_name || raw.stationId,
    water_body_name: raw.waterBodyName || stn?.water_body_name || 'Water body',
    water_body_type: (raw.waterBodyType || stn?.water_body_type || 'river') as any,
    district_id: districtId,
    district_name: norm.canonicalName || districtId,
    signal_type: signalType,
    value: raw.value,
    unit,
    data_mode: dataMode,
    freshness: freshnessRes.status,
    confidence: candidateSignal.confidence,
    status,
    trend: 'STABLE',
    warning_threshold: warnThresh,
    danger_threshold: dangerThresh,
    source_name: sourceName,
    source_type: sourceType,
    recorded_at: recordedAt,
    ingested_at: candidateSignal.ingestedAt,
    is_valid: true,
    metadata: candidateSignal.metadata,
  };

  return { success: true, observation };
}

/**
 * Deterministic threshold classification for water levels and gauge stages.
 */
export function classifyHydrologicalStatus(
  value: number,
  warningThreshold?: number,
  dangerThreshold?: number
): HydrologicalStatus {
  if (value === undefined || value === null || isNaN(value)) {
    return 'UNKNOWN';
  }

  if (dangerThreshold !== undefined && dangerThreshold !== null && value >= dangerThreshold) {
    return 'CRITICAL';
  }

  if (warningThreshold !== undefined && warningThreshold !== null) {
    if (value >= warningThreshold) {
      return 'WARNING';
    }
    // Approaching within 90% of warning threshold
    if (value >= warningThreshold * 0.90) {
      return 'WATCH';
    }
    return 'NORMAL';
  }

  return 'UNKNOWN';
}

/**
 * Deterministic trend calculation across historical observations.
 */
export function detectHydrologicalTrend(
  observations: { value: number; recorded_at?: string; recordedAt?: string }[]
): { trend: HydrologicalTrend; delta: number; ratePerHour?: number } {
  if (!observations || observations.length < 2) {
    return { trend: 'UNKNOWN', delta: 0 };
  }

  // Ensure observations are ordered chronologically ascending
  const sorted = [...observations].sort((a, b) => {
    const timeA = new Date(a.recorded_at || a.recordedAt || 0).getTime();
    const timeB = new Date(b.recorded_at || b.recordedAt || 0).getTime();
    return timeA - timeB;
  });

  const latest = sorted[sorted.length - 1];
  const previous = sorted[sorted.length - 2];

  if (typeof latest.value !== 'number' || typeof previous.value !== 'number') {
    return { trend: 'UNKNOWN', delta: 0 };
  }

  const delta = Math.round((latest.value - previous.value) * 1000) / 1000;

  // Compute rate per hour if timestamps available
  let ratePerHour: number | undefined;
  const timeLatest = new Date(latest.recorded_at || latest.recordedAt || 0).getTime();
  const timePrev = new Date(previous.recorded_at || previous.recordedAt || 0).getTime();
  if (timeLatest > timePrev) {
    const diffHours = (timeLatest - timePrev) / 3600000;
    if (diffHours > 0) {
      ratePerHour = Math.round((delta / diffHours) * 100) / 100;
    }
  }

  const deadband = 0.05; // 5cm / 0.05 threshold
  if (delta > deadband) {
    return { trend: 'RISING', delta, ratePerHour };
  } else if (delta < -deadband) {
    return { trend: 'FALLING', delta, ratePerHour };
  } else {
    return { trend: 'STABLE', delta, ratePerHour };
  }
}

/**
 * Deterministic Anomaly Detection on hydrological telemetry.
 */
export function detectHydrologicalAnomalies(
  station: HydrologicalStation,
  recentObservations: any[]
): HydrologicalAnomaly[] {
  const anomalies: HydrologicalAnomaly[] = [];
  if (!recentObservations || recentObservations.length === 0) {
    return anomalies;
  }

  // 1. Rapid Level Rise Detection (> 0.5m/hr or > 1.5 ft/hr)
  if (recentObservations.length >= 2) {
    const { trend, delta, ratePerHour } = detectHydrologicalTrend(recentObservations);
    const isFt = (station.unit || '').toLowerCase().includes('ft');
    const surgeRateThreshold = isFt ? 1.5 : 0.5;

    if (ratePerHour !== undefined && ratePerHour >= surgeRateThreshold) {
      anomalies.push({
        station_id: station.station_id,
        district_id: station.district_id,
        type: 'RAPID_LEVEL_RISE',
        severity: ratePerHour >= (surgeRateThreshold * 2) ? 'CRITICAL' : 'HIGH',
        description: `Rapid gauge elevation rise detected: +${ratePerHour} ${station.unit}/hr on ${station.water_body_name}.`,
        detected_at: new Date().toISOString(),
        confidence: 0.90,
        supporting_observations: recentObservations.slice(0, 3)
      });
    }
  }

  // 2. Sudden Discharge Spike Detection (> 50,000 cusecs or sudden doubling)
  const dischargeObs = recentObservations.filter(
    (o) => o.signal_type === 'dam_discharge' || o.signal_type === 'reservoir_release'
  );
  if (dischargeObs.length >= 2) {
    const delta = dischargeObs[0].value - dischargeObs[1].value;
    if (delta >= 50000 || (dischargeObs[1].value > 5000 && delta >= dischargeObs[1].value)) {
      anomalies.push({
        station_id: station.station_id,
        district_id: station.district_id,
        type: 'SUDDEN_DISCHARGE_SPIKE',
        severity: 'HIGH',
        description: `Sudden flood discharge increase detected: +${delta} cusecs on ${station.water_body_name}.`,
        detected_at: new Date().toISOString(),
        confidence: 0.88,
        supporting_observations: dischargeObs.slice(0, 2)
      });
    }
  }

  // 3. Missing Expected Updates (> 24 hours staleness on active station)
  const latest = recentObservations[0];
  if (latest && latest.recorded_at) {
    const freshness = evaluateFreshness(latest.recorded_at, new Date(), latest.signal_type);
    if (freshness.status === 'EXPIRED') {
      anomalies.push({
        station_id: station.station_id,
        district_id: station.district_id,
        type: 'MISSING_EXPECTED_UPDATE',
        severity: 'LOW',
        description: `Station telemetry is overdue (${freshness.ageHours}h since last transmission).`,
        detected_at: new Date().toISOString(),
        confidence: 0.95,
      });
    }
  }

  return anomalies;
}

/**
 * Builds simulated baseline observation for a station based on the active scenario.
 */
function buildSimulatedStationObservation(
  station: HydrologicalStation,
  scenarioName: string = 'Heavy Rainfall'
): HydrologicalObservation {
  const isDanger = scenarioName === 'Critical Flood Event';
  const isWarning = scenarioName === 'Flood Warning';
  const isNormal = scenarioName === 'Normal Conditions';

  const warnThresh = station.warning_threshold || 10.0;
  const dangerThresh = station.danger_threshold || (warnThresh * 1.25);

  let value: number;
  let trend: HydrologicalTrend = 'STABLE';
  if (isNormal) {
    value = Math.round((warnThresh * 0.45) * 100) / 100;
    trend = 'STABLE';
  } else if (isWarning) {
    value = Math.round((warnThresh + (dangerThresh - warnThresh) * 0.45) * 100) / 100;
    trend = 'RISING';
  } else if (isDanger) {
    value = Math.round((dangerThresh * 1.05) * 100) / 100;
    trend = 'RISING';
  } else {
    // Heavy Rainfall
    value = Math.round((warnThresh * 0.90) * 100) / 100;
    trend = 'RISING';
  }
  
  const status = classifyHydrologicalStatus(value, warnThresh, dangerThresh);

  return {
    station_id: station.station_id,
    station_name: station.station_name,
    water_body_name: station.water_body_name,
    water_body_type: station.water_body_type,
    district_id: station.district_id,
    signal_type: 'river_level',
    value,
    unit: station.unit || 'm',
    data_mode: 'SIMULATED',
    freshness: 'FRESH',
    confidence: 0.65,
    status,
    trend,
    warning_threshold: warnThresh,
    danger_threshold: dangerThresh,
    source_name: 'NeerDrishti Hydrological Simulation Engine',
    source_type: 'simulation_engine',
    recorded_at: new Date().toISOString(),
    ingested_at: new Date().toISOString(),
    is_valid: true,
    metadata: {
      scenario: scenarioName,
      reference_type: 'SIMULATION_REFERENCE',
      basin: station.basin
    }
  };
}

/**
 * Computes district-level hydrological summary with explainability and transparent fallback.
 */
export function getDistrictHydrologicalSummary(
  districtId: string,
  scenarioName: string = 'Heavy Rainfall'
): HydrologicalDistrictSummary {
  const norm = normalizeDistrict(districtId);
  const canonId = norm.resolved ? norm.districtId : districtId.toLowerCase().trim();
  const canonName = norm.canonicalName || districtId;

  const stations = getHydrologicalStations(canonId);
  const dbSignals = getLatestHydrologicalSignals(canonId);

  const observations: HydrologicalObservation[] = [];
  const allAnomalies: HydrologicalAnomaly[] = [];

  if (stations.length > 0) {
    for (const stn of stations) {
      // Look for recorded signals in database for this station
      const stnSignals = dbSignals.filter(
        (s) => s.metadata?.includes(stn.station_id) || s.source_name?.includes(stn.station_id)
      );

      if (stnSignals.length > 0) {
        const latestDb = stnSignals[0];
        const freshnessRes = evaluateFreshness(latestDb.recorded_at, new Date(), latestDb.signal_type);
        const warn = stn.warning_threshold;
        const dang = stn.danger_threshold;
        const status = classifyHydrologicalStatus(latestDb.value, warn, dang);
        
        // Check trend from history
        const history = getStationSignalHistory(canonId, latestDb.signal_type, stn.station_id, 5);
        const { trend } = detectHydrologicalTrend(history);

        const obs: HydrologicalObservation = {
          id: latestDb.id,
          station_id: stn.station_id,
          station_name: stn.station_name,
          water_body_name: stn.water_body_name,
          water_body_type: stn.water_body_type,
          district_id: canonId,
          district_name: canonName,
          signal_type: latestDb.signal_type as SignalType,
          value: latestDb.value,
          unit: latestDb.unit || stn.unit,
          data_mode: latestDb.data_mode as SignalDataMode,
          freshness: freshnessRes.status,
          confidence: Math.round((latestDb.confidence * freshnessRes.factor) * 100) / 100,
          status,
          trend,
          warning_threshold: warn,
          danger_threshold: dang,
          source_name: latestDb.source_name,
          source_type: latestDb.source_type,
          recorded_at: latestDb.recorded_at,
          ingested_at: latestDb.ingested_at,
          is_valid: Boolean(latestDb.is_valid),
          metadata: latestDb.metadata ? (typeof latestDb.metadata === 'string' ? JSON.parse(latestDb.metadata) : latestDb.metadata) : {}
        };
        observations.push(obs);

        // Run anomaly detection
        const stnAnomalies = detectHydrologicalAnomalies(stn, history.length > 0 ? history : [latestDb]);
        allAnomalies.push(...stnAnomalies);
      } else {
        // Fallback to simulation model for this station
        const simObs = buildSimulatedStationObservation(stn, scenarioName);
        observations.push(simObs);
      }
    }
  }

  // Aggregate dominant status
  const statusRank: Record<HydrologicalStatus, number> = {
    CRITICAL: 4,
    WARNING: 3,
    WATCH: 2,
    NORMAL: 1,
    UNKNOWN: 0
  };

  let dominantStatus: HydrologicalStatus = 'NORMAL';
  let highestRank = 0;
  for (const obs of observations) {
    const rank = statusRank[obs.status] || 0;
    if (rank > highestRank) {
      highestRank = rank;
      dominantStatus = obs.status;
    }
  }

  // Aggregate dominant trend
  let risingCount = 0;
  let fallingCount = 0;
  let stableCount = 0;
  for (const obs of observations) {
    if (obs.trend === 'RISING') risingCount++;
    else if (obs.trend === 'FALLING') fallingCount++;
    else if (obs.trend === 'STABLE') stableCount++;
  }

  let dominantTrend: HydrologicalTrend = 'STABLE';
  if (risingCount > 0 && risingCount >= fallingCount) dominantTrend = 'RISING';
  else if (fallingCount > 0 && fallingCount > risingCount) dominantTrend = 'FALLING';
  else if (observations.length === 0) dominantTrend = 'UNKNOWN';

  // Overall mode & freshness
  const hasLive = observations.some((o) => o.data_mode === 'LIVE');
  const hasHist = observations.some((o) => o.data_mode === 'HISTORICAL');
  const overallMode: SignalDataMode = hasLive ? 'LIVE' : hasHist ? 'HISTORICAL' : (observations.length > 0 ? 'SIMULATED' : 'UNAVAILABLE');

  const overallFreshness: SignalFreshness = observations.some((o) => o.freshness === 'FRESH')
    ? 'FRESH'
    : observations.some((o) => o.freshness === 'AGING')
    ? 'AGING'
    : 'STALE';

  const overallConf = observations.length > 0
    ? Math.round((observations.reduce((acc, o) => acc + o.confidence, 0) / observations.length) * 100) / 100
    : 0.0;

  const primaryWaterBody = stations.length > 0 ? stations[0].water_body_name : undefined;
  const sourceAttribution = overallMode === 'LIVE'
    ? 'CWC / Telangana I&CAD Gauge Telemetry'
    : overallMode === 'HISTORICAL'
    ? 'Telangana State Hydrological Baseline'
    : overallMode === 'SIMULATED'
    ? 'NeerDrishti Hydrodynamic Simulation Model'
    : 'No active telemetry stations';

  // Natural language explanation
  let contextSummary = '';
  if (stations.length === 0) {
    contextSummary = 'No designated river/reservoir gauging stations in this district. Drainage monitored via local urban stormwater networks.';
  } else if (dominantStatus === 'CRITICAL') {
    contextSummary = `Critical hydrological alert: ${primaryWaterBody} gauge levels have crossed danger thresholds with ${dominantTrend.toLowerCase()} trend.`;
  } else if (dominantStatus === 'WARNING') {
    contextSummary = `Hydrological warning active: Water levels along ${primaryWaterBody} have crossed 1st warning mark.`;
  } else if (dominantStatus === 'WATCH') {
    contextSummary = `Hydrological watch: ${primaryWaterBody} levels are elevated and trending ${dominantTrend.toLowerCase()}.`;
  } else {
    contextSummary = `Normal river and reservoir conditions across ${stations.length} gauging points with ${dominantTrend.toLowerCase()} trend.`;
  }

  return {
    district_id: canonId,
    district_name: canonName,
    active_stations_count: stations.length,
    primary_water_body: primaryWaterBody,
    dominant_status: dominantStatus,
    dominant_trend: dominantTrend,
    latest_observations: observations,
    anomalies: allAnomalies,
    data_mode: overallMode,
    freshness: overallFreshness,
    overall_confidence: overallConf,
    source_attribution: sourceAttribution,
    hydrological_context_summary: contextSummary,
    has_active_warning: dominantStatus === 'WARNING' || dominantStatus === 'CRITICAL',
    has_active_danger: dominantStatus === 'CRITICAL',
    last_updated: new Date().toISOString()
  };
}

/**
 * Returns summaries for all 33 Telangana districts.
 */
export function getAllDistrictsHydrologicalSummaries(scenarioName: string = 'Heavy Rainfall'): Record<string, HydrologicalDistrictSummary> {
  const result: Record<string, HydrologicalDistrictSummary> = {};
  const stations = loadHydrologicalStations();
  const districtIds = new Set(stations.map((s) => s.district_id));

  // Add Hyderabad and other core districts
  districtIds.add('hyderabad');
  districtIds.add('warangal');
  districtIds.add('bhadradri_kothagudem');
  districtIds.add('nizamabad');
  districtIds.add('nirmal');

  for (const distId of Array.from(districtIds)) {
    result[distId] = getDistrictHydrologicalSummary(distId, scenarioName);
  }
  return result;
}
