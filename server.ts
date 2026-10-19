import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { 
  initDatabase, 
  insertReportWithClassification, 
  getReports, 
  getReportById, 
  updateReportStatus, 
  getDistrictAggregation, 
  getAllDistrictAggregations,
  getLatestRainfallSignal,
  getDistrictSignals,
  insertExternalSignal,
  insertAlertRecord,
  getAlertsHistoryForDistrict,
  getAllAlertsHistory,
  updateAlertStatus as updateDbAlertStatus
} from './src/db/sqlite';
import { 
  classifyCitizenReport, 
  ALLOWED_INCIDENT_TYPES, 
  ALLOWED_SEVERITIES 
} from './src/classifier';
import { rainfallService } from './src/services/rainfall_service';
import { openMeteoService } from './src/services/open_meteo_service';
import { 
  getDistrictHydrologicalSummary, 
  getAllDistrictsHydrologicalSummaries, 
  getHydrologicalStations, 
  getStationById,
  ingestHydrologicalObservation
} from './src/services/hydrology_service';
import { situationFusionService } from './src/services/situation_fusion_service';
import { 
  projectDistrictTimeline, 
  projectAllDistricts, 
  projectDistrictRisk 
} from './src/services/forecast_service';
import { 
  calculateBasinInfluence, 
  loadBasinConnections, 
  getUpstreamConnections, 
  getDownstreamConnections 
} from './src/services/basin_routing_service';
import { AlertEngine } from './src/services/alert_engine';
import { DATA_SOURCES } from './src/config/data_sources';
import { normalizeDistrict } from './src/services/district_normalizer';
import { aiIntelligenceService } from './src/services/ai_intelligence_service';
import { knowledgeService } from './src/services/knowledge_service';
import { intentService } from './src/services/intent_service';
import { centralDataCoordinator } from './src/services/data/data_connector';
import { iotDeviceRegistry } from './src/services/data/iot_device_registry';
import { dataValidator } from './src/services/data/data_validator';
import { notificationService } from './src/services/notification_service';
import { DistrictStatus } from './src/types';
import { generate24HourRainfallTrend } from './src/utils/rainfall_history';
import { 
  getLlamaConfig, 
  callLlamaChat, 
  pingLlama, 
  extractJsonFromText 
} from './src/services/llama_client';

dotenv.config();

const app = express();
const PORT = 3000;

// Middleware for parsing JSON with increased limit for optional image uploads
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Initialize SQLite Database schema & seed data
initDatabase();

// District Metadata Interface
interface DistrictMetadataFile {
  district_id: string;
  district_name: string;
  latitude: number;
  longitude: number;
  monitoring_category: 'Priority Flood Monitoring' | 'Standard Monitoring' | 'Limited Data';
  category_basis: string;
  data_source_mode: 'Live Data' | 'Historical Data' | 'Simulated Data' | 'Prototype Baseline' | 'Limited Data';
  data_confidence: 'High' | 'Medium' | 'Low' | 'Prototype';
  data_provenance: string;
  last_verified?: string;
  region_zone: string;
  simulation_zone: string;
  river_basin_context?: string;
  terrain_context?: string;
  historical_flood_context?: string;
  prototype_vulnerability_score?: number;
  data_limitation_notes?: string;
}

// Dynamic District Metadata Loader
function loadDistrictMetadata(): DistrictMetadataFile[] {
  const candidatePaths = [
    path.join(process.cwd(), 'data', 'telangana_districts.json'),
    path.join(process.cwd(), '..', 'data', 'telangana_districts.json'),
  ];
  for (const filePath of candidatePaths) {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.warn(`Failed reading district metadata from ${filePath}:`, err);
    }
  }
  return [];
}

function getDistrictByName(nameOrId: string): DistrictMetadataFile | undefined {
  const districts = loadDistrictMetadata();
  const query = nameOrId.trim().toLowerCase();
  return districts.find(
    d => d.district_name.toLowerCase() === query || d.district_id.toLowerCase() === query
  );
}

// Regional simulation zones & modifiers
const REGION_ZONE_MODIFIERS: Record<string, number> = {
  'Godavari Influence Region': 1.22,
  'Hyderabad Urban Region': 1.15,
  'North Telangana': 1.08,
  'Central Telangana': 0.96,
  'Krishna Influence Region': 0.92,
  'South Telangana': 0.84,
};

// Base parameters for simulation scenarios
const SCENARIO_BASE_CONFIG: Record<string, { baseRainfall: number; baseReportsMultiplier: number; description: string }> = {
  'Normal Conditions': {
    baseRainfall: 8.0,
    baseReportsMultiplier: 0.2,
    description: 'Dry to light localized precipitation across Telangana. Reservoir levels normal, urban storm drains clear.',
  },
  'Heavy Rainfall': {
    baseRainfall: 68.0,
    baseReportsMultiplier: 1.0,
    description: 'Widespread monsoon depression with heavy rainfall over Godavari & Musi basins. Low-lying waterlogging expected.',
  },
  'Flood Warning': {
    baseRainfall: 118.0,
    baseReportsMultiplier: 2.5,
    description: 'Severe weather alert. Major river surges along Godavari, Pranhita & Musi. Sluice gates open at major reservoirs.',
  },
  'Critical Flood Event': {
    baseRainfall: 185.0,
    baseReportsMultiplier: 4.0,
    description: 'Extreme cloudburst event (>150mm/24h). Severe flash flooding, urban inundation, and riverbank overtopping.',
  },
};

// Priority district calibrated overrides per scenario for demonstration accuracy
const PRIORITY_DISTRICT_CALIBRATED_RAIN: Record<string, Record<string, number>> = {
  'Normal Conditions': {
    'Hyderabad': 6.0,
    'Warangal': 4.0,
    'Nirmal': 12.0,
    'Mancherial': 8.0,
    'Bhadradri Kothagudem': 14.0,
  },
  'Heavy Rainfall': {
    'Hyderabad': 85.4,
    'Warangal': 45.2,
    'Nirmal': 115.0,
    'Mancherial': 62.0,
    'Bhadradri Kothagudem': 130.5,
  },
  'Flood Warning': {
    'Hyderabad': 120.0,
    'Warangal': 90.0,
    'Nirmal': 140.0,
    'Mancherial': 110.0,
    'Bhadradri Kothagudem': 165.0,
  },
  'Critical Flood Event': {
    'Hyderabad': 195.0,
    'Warangal': 160.0,
    'Nirmal': 225.0,
    'Mancherial': 185.0,
    'Bhadradri Kothagudem': 245.0,
  },
};

let currentScenario = 'Heavy Rainfall';
let customRainfall: Record<string, number> = {};

function computeDistrictSimulationRainfall(meta: DistrictMetadataFile, scenarioName: string): number {
  const name = meta.district_name;
  if (customRainfall[name] !== undefined) {
    return customRainfall[name];
  }

  const priorityMap = PRIORITY_DISTRICT_CALIBRATED_RAIN[scenarioName];
  if (priorityMap && priorityMap[name] !== undefined) {
    return priorityMap[name];
  }

  const scenarioConfig = SCENARIO_BASE_CONFIG[scenarioName] || SCENARIO_BASE_CONFIG['Heavy Rainfall'];
  const zoneMod = REGION_ZONE_MODIFIERS[meta.simulation_zone] || REGION_ZONE_MODIFIERS[meta.region_zone] || 1.0;
  const vuln = meta.prototype_vulnerability_score ?? 50.0;
  const vulnFactor = 0.8 + (vuln / 250.0);

  const calculated = scenarioConfig.baseRainfall * zoneMod * vulnFactor;
  return Math.round(calculated * 10) / 10;
}

// Helper: Calculate Rainfall Score
function calculateRainfallScore(rainfall24h: number, rainfall3h: number = 0): number {
  const rf = Math.max(0, rainfall24h);
  let baseScore = 0;
  if (rf <= 15.5) {
    baseScore = (rf / 15.5) * 20.0;
  } else if (rf <= 64.4) {
    baseScore = 20.0 + ((rf - 15.5) / (64.4 - 15.5)) * 30.0;
  } else if (rf <= 115.5) {
    baseScore = 50.0 + ((rf - 64.4) / (115.5 - 64.4)) * 25.0;
  } else if (rf <= 204.4) {
    baseScore = 75.0 + ((rf - 115.5) / (204.4 - 115.5)) * 15.0;
  } else {
    baseScore = 90.0 + Math.min(10.0, ((rf - 204.4) / 100.0) * 10.0);
  }

  if (rainfall3h > 35.0) {
    baseScore = Math.min(100.0, baseScore + 10.0);
  } else if (rainfall3h > 20.0) {
    baseScore = Math.min(100.0, baseScore + 5.0);
  }

  return Math.max(0, Math.min(100, Math.round(baseScore * 10) / 10));
}

// Composite Status Computation for Any District (combining hydro data + SQLite citizen report aggregation)
function computeDistrictStatus(meta: DistrictMetadataFile) {
  const name = meta.district_name;
  const simRainfall24h = computeDistrictSimulationRainfall(meta, currentScenario);
  const simRainfall3h = Math.round((simRainfall24h * 0.28) * 10) / 10;

  // Authoritative Phase D1 Rainfall Selection:
  // Evaluates Live SQLite Signals -> Aging Signals -> Simulation Fallback
  const rainCtx = rainfallService.selectRainfallForDistrict(
    meta.district_id,
    name,
    simRainfall24h,
    simRainfall3h,
    currentScenario
  );

  const activeDataMode = centralDataCoordinator.getActiveMode();
  let rainfall24h = rainCtx.rainfall_mm_24h;
  let rainfall3h = rainCtx.rainfall_mm_3h;
  let rainfallSource = rainCtx.sourceName;
  let rainfallDataMode = rainCtx.dataMode;

  const iotDevices = iotDeviceRegistry.getDevicesByDistrict(meta.district_id);
  const iotRain = iotDevices.find(d => d.sensor_type === 'rainfall');
  const iotDrain = iotDevices.find(d => d.sensor_type === 'drainage_status');

  if (activeDataMode === 'IOT' && iotRain) {
    rainfall24h = iotRain.current_value;
    rainfall3h = Math.round((rainfall24h * 0.28) * 10) / 10;
    rainfallSource = `${iotRain.device_name} (Virtual IoT Node: ${iotRain.device_id})`;
    rainfallDataMode = 'SIMULATED';
  }

  const rainfallScore = calculateRainfallScore(rainfall24h, rainfall3h);

  // Retrieve actual aggregated citizen reports from SQLite
  const repAgg = getDistrictAggregation(name);
  const citizenReportScore = repAgg.citizen_report_score;

  // Base Historical, Location, and Drainage scores
  let floodHistoryScore = 40.0;
  let locationRiskScore = 40.0;
  let drainageVulnerabilityScore = 40.0;

  if (meta.monitoring_category === 'Priority Flood Monitoring') {
    if (name === 'Hyderabad') {
      floodHistoryScore = 88.0;
      locationRiskScore = 75.0;
      drainageVulnerabilityScore = 92.0;
    } else if (name === 'Warangal') {
      floodHistoryScore = 80.0;
      locationRiskScore = 70.0;
      drainageVulnerabilityScore = 78.0;
    } else if (name === 'Nirmal') {
      floodHistoryScore = 85.0;
      locationRiskScore = 82.0;
      drainageVulnerabilityScore = 65.0;
    } else if (name === 'Mancherial') {
      floodHistoryScore = 78.0;
      locationRiskScore = 80.0;
      drainageVulnerabilityScore = 70.0;
    } else if (name === 'Bhadradri Kothagudem') {
      floodHistoryScore = 92.0;
      locationRiskScore = 88.0;
      drainageVulnerabilityScore = 74.0;
    }
  } else {
    const vuln = meta.prototype_vulnerability_score ?? 45.0;
    floodHistoryScore = Math.round(vuln * 0.95);
    locationRiskScore = Math.round(vuln * 0.90);
    drainageVulnerabilityScore = Math.round(vuln * 0.85);
  }

  if (activeDataMode === 'IOT' && iotDrain) {
    drainageVulnerabilityScore = Math.max(10, Math.min(95, 100 - iotDrain.current_value));
  }

  // Exact 5-factor weighted formula (35% rainfall, 25% hist, 15% terrain, 15% citizen, 10% drainage)
  const rainfallPts = Math.round((rainfallScore * 0.35) * 100) / 100;
  const historyPts = Math.round((floodHistoryScore * 0.25) * 100) / 100;
  const locationPts = Math.round((locationRiskScore * 0.15) * 100) / 100;
  const citizenPts = Math.round((citizenReportScore * 0.15) * 100) / 100;
  const drainagePts = Math.round((drainageVulnerabilityScore * 0.10) * 100) / 100;

  const totalScore = Math.min(100.0, Math.round((rainfallPts + historyPts + locationPts + citizenPts + drainagePts) * 100) / 100);

  let riskCategory: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' = 'LOW';
  if (totalScore > 75.0) riskCategory = 'CRITICAL';
  else if (totalScore > 50.0) riskCategory = 'HIGH';
  else if (totalScore > 25.0) riskCategory = 'MODERATE';

  let completeness = 85;
  if (meta.monitoring_category === 'Priority Flood Monitoring') completeness = 98;
  else if (meta.monitoring_category === 'Limited Data') completeness = 65;

  const baseStatus: DistrictStatus = {
    district: name,
    district_id: meta.district_id,
    lat: meta.latitude,
    lng: meta.longitude,
    terrain_type: meta.terrain_context || 'Deccan Plateau Terrain',
    river_basin: meta.river_basin_context || 'Godavari / Krishna Sub-Basin',
    monitoring_category: meta.monitoring_category,
    data_source_mode: rainCtx.dataMode === 'LIVE' ? 'Live Data' : meta.data_source_mode,
    data_confidence: rainCtx.dataMode === 'LIVE' ? (rainCtx.confidence >= 0.8 ? 'High' : 'Medium') : meta.data_confidence,
    data_provenance: rainCtx.dataMode === 'LIVE' ? `${rainCtx.sourceName} (Observation: ${rainCtx.recordedAt})` : meta.data_provenance,
    data_limitation_notes: meta.data_limitation_notes,
    category_basis: meta.category_basis,
    region_zone: meta.region_zone,
    simulation_zone: meta.simulation_zone,
    last_updated: new Date().toISOString().replace('T', ' ').slice(0, 19),
    is_simulated: rainCtx.isSimulated,
    risk_confidence: meta.data_confidence,
    risk_data_completeness: completeness,
    rainfall_mm_24h: rainfall24h,
    rainfall_mm_3h: rainfall3h,
    rainfall_score: rainfallScore,
    rainfall_source: rainfallSource,
    rainfall_data_mode: rainfallDataMode,
    rainfall_freshness: rainCtx.freshness,
    rainfall_confidence: rainCtx.confidence,
    rainfall_recorded_at: rainCtx.recordedAt,
    rainfall_selection_reason: rainCtx.selectionReason,
    flood_history_score: floodHistoryScore,
    location_risk_score: locationRiskScore,
    drainage_vulnerability_score: drainageVulnerabilityScore,
    citizen_reports_count: repAgg.total_reports,
    citizen_reports_24h: repAgg.reports_24h,
    citizen_reports_high_severity: repAgg.high_severity_reports,
    citizen_reports_critical: repAgg.critical_reports,
    citizen_report_score: citizenReportScore,
    citizen_reports_trend: repAgg.recent_trend,
    citizen_explainability: repAgg.explainability,
    flood_risk_score: totalScore,
    risk_category: riskCategory,
    contributions: {
      rainfall: rainfallPts,
      flood_history: historyPts,
      location_risk: locationPts,
      citizen_reports: citizenPts,
      drainage_vulnerability: drainagePts,
    },
    components: {
      rainfall_score: rainfallScore,
      flood_history_score: floodHistoryScore,
      location_risk_score: locationRiskScore,
      citizen_report_score: citizenReportScore,
      drainage_vulnerability_score: drainageVulnerabilityScore,
    },
    major_past_events: meta.historical_flood_context || 'Monsoon seasonal runoff and drainage surges.',
    vulnerable_hotspots: name === 'Hyderabad' ? 'Nadeem Colony, Moosarambagh, Falaknuma, Alwal' : 'Low-lying culverts and municipal drain channels',
    primary_nala_network: name === 'Hyderabad' ? 'Musi River, Kukatpally Nala, Murki Nala' : 'Regional Stormwater Runoff Channels',
    hydrological_summary: getDistrictHydrologicalSummary(meta.district_id, currentScenario),
  };

  const situation = situationFusionService.synthesizeDistrictSituation(baseStatus);
  baseStatus.situation_summary = situation;

  const timeline = projectDistrictTimeline(baseStatus);
  baseStatus.forecast_timeline = timeline;
  baseStatus.forecast_summary = timeline.timeline.h6;

  const alert = AlertEngine.evaluateDistrictAlert(baseStatus);
  baseStatus.alert_intelligence = alert;

  return baseStatus;
}

function computeAllDistrictStatus() {
  const allDistricts = loadDistrictMetadata();
  const baseList = allDistricts.map(computeDistrictStatus);
  const statusMap: Record<string, any> = {};
  for (const item of baseList) {
    if (item.district_id) statusMap[item.district_id] = item;
  }
  return baseList.map(item => {
    const timeline = projectDistrictTimeline(item, statusMap);
    item.forecast_timeline = timeline;
    item.forecast_summary = timeline.timeline.h6;
    const alert = AlertEngine.evaluateDistrictAlert(item);
    item.alert_intelligence = alert;
    return item;
  });
}

// Knowledge Base Loader
function getKnowledgeDoc(districtName: string): string {
  const kbPath = path.join(process.cwd(), 'knowledge_base', `${districtName.toLowerCase().replace(/ /g, '_')}_knowledge.json`);
  try {
    if (fs.existsSync(kbPath)) {
      return fs.readFileSync(kbPath, 'utf-8');
    }
  } catch (err) {
    console.warn(`Could not read KB for ${districtName}`);
  }
  return `General hydrological and meteorological profile for ${districtName}, Telangana.`;
}

// ==========================================
// API ROUTES
// ==========================================

// 1. Health check
app.get('/api/health', (req, res) => {
  const config = getLlamaConfig();
  res.json({
    status: 'ok',
    app: 'NeerDrishti Flood Intelligence Engine',
    phase: 'Phase C - Persistent Citizen Flood Intelligence',
    database: 'SQLite (data/neerdrishti.db)',
    llm_provider: 'Meta Llama (OpenAI-Compatible)',
    llm_model: config.model,
    districts_loaded: loadDistrictMetadata().length,
  });
});

// 2. Districts Metadata and Live Overview
app.get('/api/districts', (req, res) => {
  try {
    const { category, zone, search } = req.query;
    let districts = computeAllDistrictStatus();

    if (category && typeof category === 'string' && category.toLowerCase() !== 'all') {
      const catLower = category.toLowerCase();
      districts = districts.filter(d => d.monitoring_category.toLowerCase().includes(catLower));
    }

    if (zone && typeof zone === 'string' && zone.toLowerCase() !== 'all') {
      const zoneLower = zone.toLowerCase();
      districts = districts.filter(d => d.region_zone.toLowerCase().includes(zoneLower));
    }

    if (search && typeof search === 'string' && search.trim()) {
      const s = search.trim().toLowerCase();
      districts = districts.filter(d =>
        d.district.toLowerCase().includes(s) ||
        d.river_basin.toLowerCase().includes(s) ||
        d.terrain_type.toLowerCase().includes(s)
      );
    }

    const allDistricts = computeAllDistrictStatus();
    const priorityCount = allDistricts.filter(d => d.monitoring_category === 'Priority Flood Monitoring').length;
    const standardCount = allDistricts.filter(d => d.monitoring_category === 'Standard Monitoring').length;
    const limitedCount = allDistricts.filter(d => d.monitoring_category === 'Limited Data').length;
    const highRiskCount = allDistricts.filter(d => d.risk_category === 'HIGH').length;
    const criticalRiskCount = allDistricts.filter(d => d.risk_category === 'CRITICAL').length;

    const highestRiskDistrict = allDistricts.reduce((max, d) => (d.flood_risk_score > max.flood_risk_score ? d : max), allDistricts[0]);

    res.json({
      scenario: currentScenario,
      is_simulation: true,
      data_source_mode: 'Simulated Data',
      overview: {
        total_districts: allDistricts.length,
        priority_count: priorityCount,
        standard_count: standardCount,
        limited_count: limitedCount,
        high_risk_count: highRiskCount,
        critical_risk_count: criticalRiskCount,
        highest_risk_district: highestRiskDistrict?.district,
        highest_risk_score: highestRiskDistrict?.flood_risk_score,
        highest_risk_category: highestRiskDistrict?.risk_category,
      },
      total_count: districts.length,
      districts,
    });
  } catch (error: any) {
    console.error('Error in /api/districts:', error);
    res.status(500).json({
      error: error?.message || 'Failed to compute districts status',
      districts: [],
    });
  }
});

// 2b. District 24-Hour Historical Rainfall Trend (Last 24 Hours)
app.get('/api/districts/:district/rainfall-history', (req, res) => {
  try {
    const { district } = req.params;
    const allDistricts = computeAllDistrictStatus();
    const dLower = district.toLowerCase().trim();
    const matched = allDistricts.find(d => 
      d.district.toLowerCase() === dLower || 
      (d.district_id && d.district_id.toLowerCase() === dLower)
    );

    if (!matched) {
      return res.status(404).json({ error: `District '${district}' not found among the 33 Telangana districts.` });
    }

    const trendSummary = generate24HourRainfallTrend(
      matched.rainfall_mm_24h,
      matched.rainfall_mm_3h,
      matched.district
    );

    res.json({
      district_id: matched.district_id,
      district_name: matched.district,
      river_basin: matched.river_basin,
      data_mode: matched.data_source_mode,
      monitoring_category: matched.monitoring_category,
      risk_category: matched.risk_category,
      flood_risk_score: matched.flood_risk_score,
      summary: trendSummary,
    });
  } catch (error: any) {
    console.error('Error in /api/districts/:district/rainfall-history:', error);
    res.status(500).json({ error: error?.message || 'Failed to generate rainfall history' });
  }
});

// 3. Update Simulation Scenario
app.post('/api/simulation/set-scenario', (req, res) => {
  try {
    const { scenario, custom_rainfall } = req.body;

    if (!scenario || typeof scenario !== 'string') {
      return res.status(400).json({
        error: 'Invalid request: "scenario" field is required and must be a string.',
        allowed_scenarios: Object.keys(SCENARIO_BASE_CONFIG),
      });
    }

    const validScenarios = Object.keys(SCENARIO_BASE_CONFIG);
    if (!validScenarios.includes(scenario)) {
      return res.status(400).json({
        error: `Invalid scenario '${scenario}'. Allowed values: ${validScenarios.join(', ')}.`,
        allowed_scenarios: validScenarios,
      });
    }

    currentScenario = scenario;
    if (custom_rainfall && typeof custom_rainfall === 'object') {
      customRainfall = { ...custom_rainfall };
    } else {
      customRainfall = {};
    }

    // Sync virtual IoT device mesh with the selected scenario
    iotDeviceRegistry.syncWithScenario(currentScenario);

    const districts = computeAllDistrictStatus();
    const scenarioConfig = SCENARIO_BASE_CONFIG[currentScenario];

    res.json({
      success: true,
      scenario: currentScenario,
      is_simulation: true,
      data_source_mode: 'Simulated Data',
      simulation_summary: `Scaled regional simulation across all 33 Telangana districts for '${currentScenario}': ${scenarioConfig.description}`,
      timestamp: new Date().toISOString(),
      districts,
    });
  } catch (error: any) {
    console.error('Error in /api/simulation/set-scenario:', error);
    res.status(500).json({
      error: error?.message || 'Failed to update simulation scenario',
      scenario: currentScenario,
    });
  }
});

// 3b. Real-Time Rainfall Signal Query & Telemetry Ingestion (Phase D1)
app.get('/api/signals/rainfall', (req, res) => {
  try {
    const { district } = req.query;
    const allDistricts = loadDistrictMetadata();

    if (district && typeof district === 'string') {
      const norm = normalizeDistrict(district);
      if (!norm.resolved || !norm.districtId) {
        return res.status(404).json({
          error: `District '${district}' not found. Please provide one of the 33 canonical Telangana districts.`,
        });
      }
      const meta = allDistricts.find(d => d.district_id.toLowerCase() === norm.districtId.toLowerCase());
      if (!meta) {
        return res.status(404).json({ error: `Metadata missing for district '${district}'` });
      }
      const status = computeDistrictStatus(meta);
      return res.json({
        district_id: status.district_id,
        district_name: status.district,
        rainfall_mm_24h: status.rainfall_mm_24h,
        rainfall_mm_3h: status.rainfall_mm_3h,
        unit: 'mm',
        source: status.rainfall_source || DATA_SOURCES.NEERDRISHTI_SIMULATION_ENGINE.sourceName,
        data_mode: status.rainfall_data_mode || 'SIMULATED',
        freshness: status.rainfall_freshness || 'FRESH',
        confidence: status.rainfall_confidence ?? 0.60,
        recorded_at: status.rainfall_recorded_at || status.last_updated,
        selection_reason: status.rainfall_selection_reason,
        is_simulated: status.is_simulated,
        rainfall_score: status.rainfall_score,
        rainfall_contribution_pts: status.contributions.rainfall,
      });
    }

    // Return all 33 districts' rainfall telemetry overview
    const signals = allDistricts.map(meta => {
      const status = computeDistrictStatus(meta);
      return {
        district_id: status.district_id,
        district_name: status.district,
        rainfall_mm_24h: status.rainfall_mm_24h,
        rainfall_mm_3h: status.rainfall_mm_3h,
        unit: 'mm',
        source: status.rainfall_source || DATA_SOURCES.NEERDRISHTI_SIMULATION_ENGINE.sourceName,
        data_mode: status.rainfall_data_mode || 'SIMULATED',
        freshness: status.rainfall_freshness || 'FRESH',
        confidence: status.rainfall_confidence ?? 0.60,
        recorded_at: status.rainfall_recorded_at || status.last_updated,
        is_simulated: status.is_simulated,
        rainfall_score: status.rainfall_score,
        rainfall_contribution_pts: status.contributions.rainfall,
      };
    });

    res.json({
      total_count: signals.length,
      signals,
    });
  } catch (error: any) {
    console.error('Error in /api/signals/rainfall:', error);
    res.status(500).json({ error: error?.message || 'Failed to fetch rainfall signals' });
  }
});

// 3c. Ingest Live External Observation
app.post('/api/signals/ingest', (req, res) => {
  try {
    const { district, rainfall_mm, burst_3h_mm, source_name, source_type, data_mode, recorded_at } = req.body;
    if (!district || rainfall_mm === undefined) {
      return res.status(400).json({
        error: 'Invalid payload: "district" and "rainfall_mm" fields are required.',
      });
    }

    const result = rainfallService.ingestObservation({
      rawDistrict: district,
      rainfall_mm: Number(rainfall_mm),
      burst_3h_mm: burst_3h_mm !== undefined ? Number(burst_3h_mm) : undefined,
      sourceName: source_name,
      sourceType: source_type,
      dataMode: data_mode || 'LIVE',
      timestamp: recorded_at || new Date().toISOString(),
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.status(201).json({
      success: true,
      message: 'External rainfall signal successfully ingested and ledgered.',
      signal: result.signal,
    });
  } catch (error: any) {
    console.error('Error in /api/signals/ingest:', error);
    res.status(500).json({ error: error?.message || 'Failed to ingest external signal' });
  }
});

// 3c-1. Open-Meteo Live Rainfall Refresh & Status (Item 1)
app.post('/api/rainfall/refresh-live', async (req, res) => {
  try {
    const { district_id } = req.body || {};
    const allDistricts = loadDistrictMetadata();

    if (district_id && typeof district_id === 'string') {
      const target = allDistricts.find(
        d => d.district_id.toLowerCase() === district_id.toLowerCase() || d.district_name.toLowerCase() === district_id.toLowerCase()
      );
      if (!target) {
        return res.status(404).json({ error: `District '${district_id}' not found among canonical districts.` });
      }

      const result = await openMeteoService.fetchLiveRainfallForDistrict(target);
      return res.json({
        success: result.success,
        district: target.district_name,
        result,
        timestamp: new Date().toISOString(),
      });
    }

    // Refresh all 33 districts
    const refreshResult = await openMeteoService.refreshAllDistricts(allDistricts);
    res.json({
      success: true,
      message: `Open-Meteo live refresh completed for ${refreshResult.success_count}/${refreshResult.total} districts.`,
      refresh_summary: refreshResult,
      data_mode: 'LIVE',
      source_name: DATA_SOURCES.OPEN_METEO_TELEMETRY.sourceName,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error in /api/rainfall/refresh-live:', error);
    res.status(500).json({ error: error?.message || 'Failed to refresh live rainfall from Open-Meteo' });
  }
});

app.get('/api/rainfall/live-status', (req, res) => {
  try {
    const status = openMeteoService.getStatus();
    res.json({
      ...status,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to get Open-Meteo status' });
  }
});

// 3d. Central Data Sources Registry
app.get('/api/sources', (req, res) => {
  try {
    const sourcesList = Object.entries(DATA_SOURCES).map(([key, source]) => ({
      registry_key: key,
      provider_name: source.sourceName,
      provider_type: source.sourceType,
      supported_signals: source.supportedSignals,
      enabled: source.enabled,
      priority: source.priority,
      refresh_interval_minutes: source.refreshIntervalMinutes,
      base_confidence: source.baseConfidence,
      current_mode: source.currentMode,
      health_status: source.health,
      last_successful_update: source.lastSuccessfulUpdate,
      description: source.description,
    }));

    res.json({
      total_sources: sourcesList.length,
      sources: sourcesList,
    });
  } catch (error: any) {
    console.error('Error in /api/sources:', error);
    res.status(500).json({ error: error?.message || 'Failed to fetch data source registry' });
  }
});

// ==========================================
// HYDROLOGICAL SIGNAL INTELLIGENCE (PHASE D2)
// ==========================================

// 3e. GET /api/hydrology/stations - Station Registry
app.get('/api/hydrology/stations', (req, res) => {
  try {
    const { district_id, basin, active } = req.query;
    let stations = getHydrologicalStations(typeof district_id === 'string' ? district_id : undefined);

    if (basin && typeof basin === 'string') {
      stations = stations.filter(s => (s.basin || '').toLowerCase().includes(basin.toLowerCase()));
    }
    if (active !== undefined) {
      const activeBool = active === 'true' || active === '1';
      stations = stations.filter(s => s.active === activeBool);
    }

    res.json({
      total_count: stations.length,
      stations,
    });
  } catch (error: any) {
    console.error('Error in /api/hydrology/stations:', error);
    res.status(500).json({ error: error?.message || 'Failed to fetch hydrological stations' });
  }
});

// 3f. GET /api/hydrology/district/:districtId - District Hydrological Summary
app.get('/api/hydrology/district/:districtId', (req, res) => {
  try {
    const { districtId } = req.params;
    const summary = getDistrictHydrologicalSummary(districtId, currentScenario);
    res.json(summary);
  } catch (error: any) {
    console.error('Error in /api/hydrology/district/:districtId:', error);
    res.status(500).json({ error: error?.message || 'Failed to fetch district hydrological summary' });
  }
});

// 3g. GET /api/signals/hydrology - Hydrological Observations & Ledger
app.get('/api/signals/hydrology', (req, res) => {
  try {
    const { district_id, signal_type, status } = req.query;

    if (district_id && typeof district_id === 'string') {
      const summary = getDistrictHydrologicalSummary(district_id, currentScenario);
      let observations = summary.latest_observations;
      if (signal_type && typeof signal_type === 'string') {
        observations = observations.filter(o => o.signal_type === signal_type);
      }
      if (status && typeof status === 'string') {
        observations = observations.filter(o => o.status.toLowerCase() === status.toLowerCase());
      }
      return res.json({
        district_id: summary.district_id,
        district_name: summary.district_name,
        dominant_status: summary.dominant_status,
        dominant_trend: summary.dominant_trend,
        data_mode: summary.data_mode,
        freshness: summary.freshness,
        overall_confidence: summary.overall_confidence,
        source_attribution: summary.source_attribution,
        total_observations: observations.length,
        observations,
        anomalies: summary.anomalies,
      });
    }

    // Return summaries across all districts
    const summaries = getAllDistrictsHydrologicalSummaries(currentScenario);
    const summaryList = Object.values(summaries);

    res.json({
      total_districts: summaryList.length,
      active_warnings_count: summaryList.filter(s => s.has_active_warning).length,
      active_dangers_count: summaryList.filter(s => s.has_active_danger).length,
      summaries: summaryList,
    });
  } catch (error: any) {
    console.error('Error in /api/signals/hydrology:', error);
    res.status(500).json({ error: error?.message || 'Failed to fetch hydrological signals' });
  }
});

// 3h. POST /api/signals/hydrology/ingest - Ingest Gauge / Water Telemetry
app.post('/api/signals/hydrology/ingest', (req, res) => {
  try {
    const {
      station_id,
      district,
      signal_type,
      value,
      unit,
      source_name,
      source_type,
      data_mode,
      recorded_at,
      metadata,
    } = req.body;

    if (!station_id || value === undefined || !signal_type) {
      return res.status(400).json({
        error: 'Invalid payload: "station_id", "signal_type", and numeric "value" are required.',
      });
    }

    const result = ingestHydrologicalObservation({
      stationId: String(station_id),
      rawDistrict: district,
      signalType: signal_type,
      value: Number(value),
      unit,
      sourceName: source_name,
      sourceType: source_type,
      dataMode: data_mode || 'LIVE',
      timestamp: recorded_at || new Date().toISOString(),
      metadata,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.status(201).json({
      success: true,
      message: 'Hydrological observation successfully ingested and ledgered.',
      observation: result.observation,
    });
  } catch (error: any) {
    console.error('Error in /api/signals/hydrology/ingest:', error);
    res.status(500).json({ error: error?.message || 'Failed to ingest hydrological observation' });
  }
});

// ==========================================
// MULTI-SIGNAL SITUATION FUSION API (PHASE D3)
// ==========================================

// 3i. GET /api/situation/districts - Multi-Signal Situation Overview for all 33 Districts
app.get('/api/situation/districts', (req, res) => {
  try {
    const allDistricts = computeAllDistrictStatus();
    const situations = allDistricts.map(d => d.situation_summary || situationFusionService.synthesizeDistrictSituation(d));

    const operationalCounts = {
      CRITICAL_INFORMATIONAL: situations.filter(s => s.operationalSituation === 'CRITICAL_INFORMATIONAL').length,
      HIGH_CONCERN: situations.filter(s => s.operationalSituation === 'HIGH_CONCERN').length,
      ELEVATED_ATTENTION: situations.filter(s => s.operationalSituation === 'ELEVATED_ATTENTION').length,
      MONITORING: situations.filter(s => s.operationalSituation === 'MONITORING').length,
      NORMAL: situations.filter(s => s.operationalSituation === 'NORMAL').length,
    };

    res.json({
      total_districts: situations.length,
      scenario: currentScenario,
      operational_counts: operationalCounts,
      situations,
    });
  } catch (error: any) {
    console.error('Error in /api/situation/districts:', error);
    res.status(500).json({ error: error?.message || 'Failed to fetch district situations' });
  }
});

// 3j. GET /api/situation/district/:districtId - Detailed Situation for One District
app.get('/api/situation/district/:districtId', (req, res) => {
  try {
    const { districtId } = req.params;
    const allDistricts = computeAllDistrictStatus();
    const norm = normalizeDistrict(districtId);
    const targetId = norm.resolved ? norm.districtId : districtId.toLowerCase().trim();

    const matched = allDistricts.find(
      d => (d.district_id && d.district_id.toLowerCase() === targetId) ||
           d.district.toLowerCase() === districtId.toLowerCase()
    );

    if (!matched) {
      return res.status(404).json({
        error: `District '${districtId}' not found. Please provide a valid 33-district identifier.`,
      });
    }

    const situation = matched.situation_summary || situationFusionService.synthesizeDistrictSituation(matched);
    res.json(situation);
  } catch (error: any) {
    console.error(`Error in /api/situation/district/${req.params.districtId}:`, error);
    res.status(500).json({ error: error?.message || 'Failed to fetch district situation' });
  }
});

// 3k. GET /api/situation/district/:districtId/explain - Explainable Multi-Signal Breakdown
app.get('/api/situation/district/:districtId/explain', (req, res) => {
  try {
    const { districtId } = req.params;
    const allDistricts = computeAllDistrictStatus();
    const norm = normalizeDistrict(districtId);
    const targetId = norm.resolved ? norm.districtId : districtId.toLowerCase().trim();

    const matched = allDistricts.find(
      d => (d.district_id && d.district_id.toLowerCase() === targetId) ||
           d.district.toLowerCase() === districtId.toLowerCase()
    );

    if (!matched) {
      return res.status(404).json({
        error: `District '${districtId}' not found. Please provide a valid 33-district identifier.`,
      });
    }

    const situation = matched.situation_summary || situationFusionService.synthesizeDistrictSituation(matched);
    const primaryDriverText = situation.primaryDrivers.length > 0
      ? situation.primaryDrivers.map(d => d.evidence).join('; ')
      : 'Baseline environmental conditions within normal tolerance thresholds.';

    const explanation = `District ${situation.districtName} is categorized under ${situation.operationalSituation.replace(/_/g, ' ')} with an authoritative 5-factor composite flood risk score of ${situation.compositeRiskScore}/100 (${situation.compositeRiskLevel}). Data confidence is ${situation.dataConfidence} (${Math.round(situation.dataConfidenceScore * 100)}%) with ${situation.signalCoverage.available}/${situation.signalCoverage.total} signal domains active. Primary drivers: ${primaryDriverText}`;

    res.json({
      districtId: situation.districtId,
      districtName: situation.districtName,
      compositeRiskScore: situation.compositeRiskScore,
      compositeRiskLevel: situation.compositeRiskLevel,
      operationalSituation: situation.operationalSituation,
      dataConfidence: situation.dataConfidence,
      dataConfidenceScore: situation.dataConfidenceScore,
      signalCoverage: situation.signalCoverage,
      freshnessSummary: situation.freshnessSummary,
      primaryDrivers: situation.primaryDrivers,
      supportingSignals: situation.supportingSignals,
      dataLimitations: situation.dataLimitations,
      recentAnomalies: situation.recentAnomalies,
      recommendedActions: situation.recommendedActions,
      explanation,
      generatedAt: situation.generatedAt,
    });
  } catch (error: any) {
    console.error(`Error in /api/situation/district/${req.params.districtId}/explain:`, error);
    res.status(500).json({ error: error?.message || 'Failed to explain district situation' });
  }
});

// ==========================================
// PHASE E: PREDICTIVE FLOOD RISK & FORECAST INTELLIGENCE API
// ==========================================

// 1. GET /api/forecast/districts - Forecast projections for all 33 districts
app.get('/api/forecast/districts', (req, res) => {
  try {
    const { horizon, outlook } = req.query;
    const allDistricts = computeAllDistrictStatus();
    const forecastMap = projectAllDistricts(allDistricts);

    let list = Object.values(forecastMap);

    if (outlook && typeof outlook === 'string' && outlook.toUpperCase() !== 'ALL') {
      list = list.filter(f => f.overallForecastOutlook === outlook.toUpperCase());
    }

    const criticalCount = list.filter(f => f.overallForecastOutlook === 'CRITICAL_PROJECTION').length;
    const highCount = list.filter(f => f.overallForecastOutlook === 'HIGH_PROJECTION').length;
    const elevatingCount = list.filter(f => f.overallForecastOutlook === 'ELEVATING_RISK').length;
    const risingTrendCount = list.filter(f => f.dominantTrend === 'RISING').length;

    res.json({
      total_districts: list.length,
      overview: {
        critical_projections: criticalCount,
        high_projections: highCount,
        elevating_risk: elevatingCount,
        rising_trend_districts: risingTrendCount,
      },
      forecasts: list,
      disclaimer: 'Informational model projections for decision support. Not an official government flood forecast.',
      generated_at: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error in /api/forecast/districts:', error);
    res.status(500).json({ error: error?.message || 'Failed to fetch forecasts' });
  }
});

// 2. GET /api/forecast/district/:districtId - Specific district forecast timeline
app.get('/api/forecast/district/:districtId', (req, res) => {
  try {
    const { districtId } = req.params;
    const allDistricts = computeAllDistrictStatus();
    const norm = normalizeDistrict(districtId);
    const targetId = norm.resolved ? norm.districtId : districtId.toLowerCase().trim();

    const matched = allDistricts.find(
      d => (d.district_id && d.district_id.toLowerCase() === targetId) ||
           d.district.toLowerCase() === districtId.toLowerCase()
    );

    if (!matched) {
      return res.status(404).json({
        error: `District '${districtId}' not found. Please provide a valid 33-district identifier.`,
      });
    }

    const statusMap: Record<string, any> = {};
    for (const d of allDistricts) {
      if (d.district_id) statusMap[d.district_id] = d;
    }

    const timeline = projectDistrictTimeline(matched, statusMap);
    res.json(timeline);
  } catch (error: any) {
    console.error(`Error in /api/forecast/district/${req.params.districtId}:`, error);
    res.status(500).json({ error: error?.message || 'Failed to fetch district forecast' });
  }
});

// 3. GET /api/forecast/district/:districtId/timeline - Dedicated timeline payload
app.get('/api/forecast/district/:districtId/timeline', (req, res) => {
  try {
    const { districtId } = req.params;
    const allDistricts = computeAllDistrictStatus();
    const norm = normalizeDistrict(districtId);
    const targetId = norm.resolved ? norm.districtId : districtId.toLowerCase().trim();

    const matched = allDistricts.find(
      d => (d.district_id && d.district_id.toLowerCase() === targetId) ||
           d.district.toLowerCase() === districtId.toLowerCase()
    );

    if (!matched) {
      return res.status(404).json({ error: `District '${districtId}' not found.` });
    }

    const statusMap: Record<string, any> = {};
    for (const d of allDistricts) {
      if (d.district_id) statusMap[d.district_id] = d;
    }

    const forecast = projectDistrictTimeline(matched, statusMap);
    res.json({
      districtId: forecast.districtId,
      districtName: forecast.districtName,
      dominantTrend: forecast.dominantTrend,
      overallForecastOutlook: forecast.overallForecastOutlook,
      maxProjectedRisk: forecast.maxProjectedRisk,
      maxRiskHorizonHours: forecast.maxRiskHorizonHours,
      timeline: forecast.timeline,
      basinInfluence: forecast.basinInfluence,
      dataConfidence: forecast.dataConfidence,
      confidenceReason: forecast.confidenceReason,
      generatedAt: forecast.generatedAt,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to fetch forecast timeline' });
  }
});

// 4. GET /api/forecast/district/:districtId/explain - Textual explanation of projection drivers
app.get('/api/forecast/district/:districtId/explain', (req, res) => {
  try {
    const { districtId } = req.params;
    const allDistricts = computeAllDistrictStatus();
    const norm = normalizeDistrict(districtId);
    const targetId = norm.resolved ? norm.districtId : districtId.toLowerCase().trim();

    const matched = allDistricts.find(
      d => (d.district_id && d.district_id.toLowerCase() === targetId) ||
           d.district.toLowerCase() === districtId.toLowerCase()
    );

    if (!matched) {
      return res.status(404).json({ error: `District '${districtId}' not found.` });
    }

    const statusMap: Record<string, any> = {};
    for (const d of allDistricts) {
      if (d.district_id) statusMap[d.district_id] = d;
    }

    const forecast = projectDistrictTimeline(matched, statusMap);
    const h6 = forecast.timeline.h6;

    const primaryDriverText = h6.primaryProjectedDrivers.length > 0
      ? h6.primaryProjectedDrivers.map(d => `${d.driverName} (${d.evidence})`).join('; ')
      : 'Baseline multi-factor environmental risk persistence.';

    const upstreamText = forecast.basinInfluence.has_upstream_influence
      ? `Upstream hydrological propagation contributes +${forecast.basinInfluence.total_projected_basin_surge.toFixed(1)} points from upstream river channels.`
      : 'No significant upstream river surges projected to propagate downstream within this window.';

    const explanation = `District ${forecast.districtName} is projected to experience a ${h6.riskTrend} risk trend over the next 6-12 hours, with projected composite risk reaching ${h6.projectedRiskScore}/100 (${h6.outlookCategory.replace(/_/g, ' ')}). Forecast confidence is ${h6.confidence} (${Math.round(h6.confidenceScore * 100)}%). ${upstreamText} Primary drivers: ${primaryDriverText}`;

    res.json({
      districtId: forecast.districtId,
      districtName: forecast.districtName,
      currentRiskScore: forecast.currentRiskScore,
      projectedRiskScore_6h: h6.projectedRiskScore,
      projectedRiskChange_6h: h6.projectedRiskChange,
      riskTrend: h6.riskTrend,
      outlookCategory: h6.outlookCategory,
      confidence: h6.confidence,
      confidenceScore: h6.confidenceScore,
      confidenceReason: h6.confidenceReason,
      primaryDrivers: h6.primaryProjectedDrivers,
      supportingSignals: h6.supportingSignals,
      basinInfluence: forecast.basinInfluence,
      explanation,
      limitations: h6.limitations,
      sourcesAttribution: h6.forecastSources,
      generatedAt: forecast.generatedAt,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to explain forecast' });
  }
});

// 5. GET /api/forecast/sources - Metadata for NWP, AWS, CWC, and Basin propagation sources
app.get('/api/forecast/sources', (req, res) => {
  res.json({
    forecast_sources: [
      {
        id: 'imd-nwp-ensemble',
        name: 'India Meteorological Department (IMD) NWP Grid',
        organization: 'Ministry of Earth Sciences (MoES)',
        model: 'WRF / GFS High-Resolution Multi-Model Ensemble',
        horizons_supported: ['+3H', '+6H', '+12H', '+24H'],
        data_mode: 'SIMULATED_FORECAST',
        update_frequency: 'Every 3 Hours',
      },
      {
        id: 'tsdps-telemetry-aws',
        name: 'Telangana State Development Planning Society (TSDPS)',
        organization: 'Planning Dept, Government of Telangana',
        telemetry: 'Real-time Automatic Weather Station (AWS) Network',
        data_mode: 'LIVE / SIMULATED',
        update_frequency: 'Every 15-60 Minutes',
      },
      {
        id: 'cwc-basin-telemetry',
        name: 'Central Water Commission (CWC)',
        organization: 'Ministry of Jal Shakti',
        telemetry: 'Godavari & Krishna Basin River Gauging & Dam Outflow Records',
        data_mode: 'LIVE / CURATED',
        update_frequency: 'Hourly / Synoptic',
      },
      {
        id: 'neerdrishti-basin-routing',
        name: 'NeerDrishti Upstream-Downstream Basin Propagation Model',
        organization: 'Telangana Flood Decision Support Engine',
        description: 'Deterministic river travel window and upstream surge attenuation matrix across 5 major river basins',
        data_mode: 'HISTORICAL_BASELINE',
        update_frequency: 'Continuous Reactive',
      },
    ],
    governance_disclaimer: 'NeerDrishti forecast intelligence is synthesized strictly for decision support and scenario evaluation. Follow official SDMA announcements for public safety instructions.',
  });
});

// 6. GET /api/basin/connections - All hydrological basin connections
app.get('/api/basin/connections', (req, res) => {
  try {
    const connections = loadBasinConnections();
    res.json({ total: connections.length, connections });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to load basin connections' });
  }
});

// 7. GET /api/basin/district/:districtId - Upstream and downstream connections for a district
app.get('/api/basin/district/:districtId', (req, res) => {
  try {
    const { districtId } = req.params;
    const norm = normalizeDistrict(districtId);
    const upstream = getUpstreamConnections(norm.canonical_id);
    const downstream = getDownstreamConnections(norm.canonical_id);
    const allDistricts = computeAllDistrictStatus();
    const statusMap: Record<string, any> = {};
    for (const d of allDistricts) {
      if (d.district_id) statusMap[d.district_id] = d;
    }
    const influence = calculateBasinInfluence(norm.canonical_id, statusMap, 6);

    res.json({
      districtId: norm.canonical_id,
      districtName: norm.district_name,
      upstream_connections: upstream,
      downstream_connections: downstream,
      basin_influence: influence,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to fetch basin connections' });
  }
});

// ==========================================
// ALERT INTELLIGENCE API (PHASE F)
// ==========================================

// 1. GET /api/alerts - All alerts for 33 districts with composable filtering
app.get('/api/alerts', (req, res) => {
  try {
    const { level, type, zone, data_mode, search } = req.query;
    const allDistricts = computeAllDistrictStatus();
    const { alerts, summary } = AlertEngine.evaluateAllDistrictsAlerts(allDistricts);

    let filtered = alerts;

    if (level && typeof level === 'string' && level.toLowerCase() !== 'all') {
      const targetLevel = level.toUpperCase();
      filtered = filtered.filter(a => a.alert_level === targetLevel);
    }

    if (type && typeof type === 'string' && type.toLowerCase() !== 'all') {
      const typeLower = type.toLowerCase();
      filtered = filtered.filter(a => a.primary_alert_type.toLowerCase().includes(typeLower));
    }

    if (zone && typeof zone === 'string' && zone.toLowerCase() !== 'all') {
      const zoneLower = zone.toLowerCase();
      filtered = filtered.filter(a => a.region_zone.toLowerCase().includes(zoneLower));
    }

    if (data_mode && typeof data_mode === 'string' && data_mode.toLowerCase() !== 'all') {
      const modeLower = data_mode.toLowerCase();
      filtered = filtered.filter(a => a.data_mode.toLowerCase().includes(modeLower));
    }

    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(a => 
        a.district_name.toLowerCase().includes(q) ||
        a.district_id.toLowerCase().includes(q) ||
        a.headline.toLowerCase().includes(q) ||
        a.region_zone.toLowerCase().includes(q)
      );
    }

    res.json({
      total: filtered.length,
      summary,
      alerts: filtered,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to generate alert intelligence' });
  }
});

// 2. GET /api/alerts/active - Active non-normal alerts
app.get('/api/alerts/active', (req, res) => {
  try {
    const allDistricts = computeAllDistrictStatus();
    const { alerts, summary } = AlertEngine.evaluateAllDistrictsAlerts(allDistricts);
    const activeAlerts = alerts.filter(a => a.alert_level !== 'NORMAL');

    res.json({
      total: activeAlerts.length,
      summary,
      alerts: activeAlerts,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to fetch active alerts' });
  }
});

// 3. GET /api/alerts/summary - Statewide summary metrics
app.get('/api/alerts/summary', (req, res) => {
  try {
    const allDistricts = computeAllDistrictStatus();
    const { summary } = AlertEngine.evaluateAllDistrictsAlerts(allDistricts);
    res.json({ summary });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to fetch alert summary' });
  }
});

// 4. GET /api/alerts/district/:districtId - Specific district alert payload
app.get('/api/alerts/district/:districtId', (req, res) => {
  try {
    const { districtId } = req.params;
    const norm = normalizeDistrict(districtId);
    const allDistricts = computeAllDistrictStatus();
    const matched = allDistricts.find(
      d => (d.district_id && d.district_id.toLowerCase() === norm.canonical_id) ||
           d.district.toLowerCase() === norm.district_name.toLowerCase() ||
           d.district.toLowerCase() === districtId.toLowerCase()
    );

    if (!matched) {
      return res.status(404).json({ error: `District '${districtId}' not found.` });
    }

    const alert = matched.alert_intelligence || AlertEngine.evaluateDistrictAlert(matched);
    res.json({ alert });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to evaluate district alert' });
  }
});

// 5. GET /api/alerts/district/:districtId/history - Historic alert records
app.get('/api/alerts/district/:districtId/history', (req, res) => {
  try {
    const { districtId } = req.params;
    const norm = normalizeDistrict(districtId);
    const history = getAlertsHistoryForDistrict(norm.canonical_id, 20);
    res.json({
      districtId: norm.canonical_id,
      districtName: norm.district_name,
      total: history.length,
      history,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to fetch alert history' });
  }
});

// 6. POST /api/alerts/recalculate - Force recalculation and snapshot archiving
app.post('/api/alerts/recalculate', (req, res) => {
  try {
    const allDistricts = computeAllDistrictStatus();
    const { alerts, summary } = AlertEngine.evaluateAllDistrictsAlerts(allDistricts);

    // Save active non-normal alerts to SQLite for audit history
    for (const a of alerts) {
      if (a.alert_level !== 'NORMAL') {
        try {
          insertAlertRecord(a);
        } catch (e) {
          // Ignore duplicate alert_id logs
        }
      }
    }

    res.json({
      message: 'Successfully recalculated alert intelligence across 33 Telangana districts.',
      summary,
      total_alerts: alerts.length,
      active_alerts_count: summary.total_active_alerts,
      alerts,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to recalculate alerts' });
  }
});

// 7. POST /api/alerts/:alertId/status - Update alert status
app.post('/api/alerts/:alertId/status', (req, res) => {
  try {
    const { alertId } = req.params;
    const { status } = req.body;
    if (!status || !['Active', 'Acknowledged', 'Resolved', 'Expired'].includes(status)) {
      return res.status(400).json({ error: 'Valid status required: Active | Acknowledged | Resolved | Expired' });
    }
    const updated = updateDbAlertStatus(alertId, status);
    res.json({ success: updated, alert_id: alertId, status });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to update alert status' });
  }
});

// 8. POST /api/alerts/district/:districtId/ai-explain - Meta Llama LLM Bilingual Advisory Expansion
app.post('/api/alerts/district/:districtId/ai-explain', async (req, res) => {
  try {
    const { districtId } = req.params;
    const norm = normalizeDistrict(districtId);
    const allDistricts = computeAllDistrictStatus();
    const matched = allDistricts.find(
      d => (d.district_id && d.district_id.toLowerCase() === norm.canonical_id) ||
           d.district.toLowerCase() === norm.district_name.toLowerCase()
    );

    if (!matched) {
      return res.status(404).json({ error: `District '${districtId}' not found.` });
    }

    const alert = matched.alert_intelligence || AlertEngine.evaluateDistrictAlert(matched);
    const kbContext = getKnowledgeDoc(matched.district);

    const fallbackResponse = {
      district: matched.district,
      alert_level: alert.alert_level,
      primary_alert_type: alert.primary_alert_type,
      current_risk: alert.current_risk,
      projected_risk: alert.projected_risk,
      peak_horizon: alert.peak_horizon,
      english_advisory: alert.advisories.english,
      telugu_advisory: alert.advisories.telugu,
      trigger_reasons: alert.trigger_reasons,
      basin_propagation_notes: alert.basin_signal.summary,
      citizen_reports_notes: alert.citizen_signal.summary,
      data_mode: alert.data_mode,
      confidence: alert.confidence,
    };

    const config = getLlamaConfig();
    const systemPrompt = `You are the NeerDrishti AI Flood Advisory Specialist for Telangana powered by Meta Llama.
Provide a clear, bilingual (English & Telugu) explanation for the active alert in ${matched.district}.

INSTRUCTIONS:
1. Explain WHY this alert level was determined based on the multi-horizon data and deterministic thresholds.
2. Provide practical, non-alarmist public safety guidance.
3. DO NOT order evacuations or claim government emergency decrees. Frame as prototype decision support.
4. Output JSON strictly with structure:
{
  "situation_analysis": "...",
  "primary_driver_breakdown": ["...", "..."],
  "english_title": "...",
  "english_summary": "...",
  "english_precautions": ["...", "..."],
  "telugu_title": "...",
  "telugu_summary": "...",
  "telugu_precautions": ["...", "..."],
  "disclaimer": "..."
}`;

    const userPrompt = `DETERMINISTIC ALERT DATA:
- District: ${matched.district}
- Alert Level: ${alert.alert_level}
- Primary Alert Type: ${alert.primary_alert_type}
- Headline: ${alert.headline}
- Current Risk Score: ${alert.current_risk}/100
- Projected Peak Risk Score: ${alert.projected_risk}/100 at horizon ${alert.peak_horizon}
- Trend: ${alert.trend} (${alert.rate_of_change})
- Triggers: ${alert.trigger_reasons.join('; ')}
- Citizen Signal: ${alert.citizen_signal.summary}
- Basin Signal: ${alert.basin_signal.summary}
- Data Mode: ${alert.data_mode}
- Data Confidence: ${alert.confidence} (${Math.round(alert.confidence_score * 100)}%)

KNOWLEDGE BASE:
${kbContext}`;

    try {
      const chatResult = await callLlamaChat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        {
          temperature: 0.2,
          jsonMode: true,
          timeoutMs: 12000,
        }
      );

      if (chatResult && chatResult.text) {
        const parsed = extractJsonFromText(chatResult.text);
        return res.json({
          district: matched.district,
          alert_level: alert.alert_level,
          primary_alert_type: alert.primary_alert_type,
          current_risk: alert.current_risk,
          projected_risk: alert.projected_risk,
          peak_horizon: alert.peak_horizon,
          llm_explanation: parsed,
          fallback_advisories: alert.advisories,
          model_provider: 'Meta Llama',
          model_name: config.model,
          reasoning_source: 'Meta Llama',
          fallback_used: false,
        });
      }
    } catch (llamaErr) {
      console.warn('Meta Llama AI advisory generation failed, serving deterministic fallback:', llamaErr);
    }

    res.json({
      ...fallbackResponse,
      model_provider: 'Rule Engine',
      model_name: 'Deterministic Fallback Engine',
      reasoning_source: 'Deterministic Fallback',
      fallback_used: true,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to explain alert' });
  }
});


// ==========================================
// CITIZEN REPORTS API (PHASE C)
// ==========================================

// 4. GET /api/reports - Paginated & Filtered
app.get('/api/reports', (req, res) => {
  try {
    const { district, severity, status, page, limit } = req.query;
    const result = getReports({
      district: typeof district === 'string' ? district : undefined,
      severity: typeof severity === 'string' ? severity : undefined,
      status: typeof status === 'string' ? status : undefined,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    res.json(result);
  } catch (error) {
    console.error('Error fetching reports from SQLite:', error);
    res.status(500).json({ error: 'Internal database error while fetching reports.' });
  }
});

// 5. GET /api/reports/:id - Single Report with Classification
app.get('/api/reports/:id', (req, res) => {
  try {
    const reportId = Number(req.params.id);
    if (isNaN(reportId)) {
      return res.status(400).json({ error: 'Invalid report ID.' });
    }

    const report = getReportById(reportId);
    if (!report) {
      return res.status(404).json({ error: `Report #${reportId} not found.` });
    }

    res.json({ report });
  } catch (error) {
    console.error(`Error fetching report #${req.params.id}:`, error);
    res.status(500).json({ error: 'Internal database error.' });
  }
});

// 6. POST /api/reports - Submit Citizen Report + Meta Llama AI Classification + Transactional SQLite Persistence
app.post('/api/reports', async (req, res) => {
  try {
    const {
      district,
      location_description,
      location,
      incident_type,
      severity,
      description,
      image_reference,
      image_url,
    } = req.body;

    // Strict Input Validations
    if (!district || typeof district !== 'string' || !district.trim()) {
      return res.status(400).json({ error: 'District is required.' });
    }

    const matchedMeta = getDistrictByName(district);
    if (!matchedMeta) {
      return res.status(400).json({ error: `District '${district}' is not a recognized Telangana district.` });
    }

    if (!description || typeof description !== 'string') {
      return res.status(400).json({ error: 'Description is required.' });
    }

    const trimmedDesc = description.trim();
    if (trimmedDesc.length < 10) {
      return res.status(400).json({
        error: 'Description is too short. Minimum length is 10 characters to ensure actionable hazard context.',
      });
    }

    if (trimmedDesc.length > 1000) {
      return res.status(400).json({
        error: 'Description exceeds maximum allowed length of 1000 characters.',
      });
    }

    const locDesc = (location_description || location || '').trim().slice(0, 200);

    let incType = incident_type || 'Other';
    if (!ALLOWED_INCIDENT_TYPES.includes(incType as any)) {
      incType = 'Urban Flooding';
    }

    let sev = severity || 'Moderate';
    if (!ALLOWED_SEVERITIES.includes(sev as any)) {
      sev = 'Moderate';
    }

    const imageRef = image_reference || image_url || null;

    // AI Classification (with automatic Rule-Based Fallback powered by Meta Llama)
    const aiResult = await classifyCitizenReport({
      district: matchedMeta.district_name,
      location_description: locDesc,
      user_incident_type: incType,
      user_severity: sev,
      description: trimmedDesc,
      image_data: imageRef,
    });

    // Transactional Save into SQLite
    const inserted = insertReportWithClassification({
      district_id: matchedMeta.district_name,
      location_description: locDesc,
      incident_type: incType,
      severity: sev as any,
      description: trimmedDesc,
      image_reference: imageRef,
      classification_source: aiResult.source,
      classification_confidence: aiResult.confidence,
      status: 'New',
      classification: aiResult.classification,
    });

    // Compute updated district state
    const updatedDistrict = computeDistrictStatus(matchedMeta);

    res.status(201).json({
      success: true,
      report: inserted,
      classification: aiResult.classification,
      classification_source: aiResult.source,
      updated_district: updatedDistrict,
      message: `Report #${inserted.id} successfully recorded and classified via ${aiResult.source}. District risk score updated.`,
    });
  } catch (error: any) {
    console.error('Error submitting citizen report:', error);
    res.status(500).json({
      error: 'Failed to process citizen report.',
      details: error.message || String(error),
    });
  }
});

// 7. PATCH /api/reports/:id/status - Status update (Demo Review Panel)
app.patch('/api/reports/:id/status', (req, res) => {
  try {
    const reportId = Number(req.params.id);
    const { status } = req.body;

    if (isNaN(reportId)) {
      return res.status(400).json({ error: 'Invalid report ID.' });
    }

    if (!status || typeof status !== 'string') {
      return res.status(400).json({ error: 'Status is required.' });
    }

    const updated = updateReportStatus(reportId, status.trim());
    if (!updated) {
      return res.status(404).json({ error: `Report #${reportId} not found.` });
    }

    // Return updated report + refreshed district metrics
    const meta = getDistrictByName(updated.district_id);
    const updatedDistrict = meta ? computeDistrictStatus(meta) : null;

    res.json({
      success: true,
      report: updated,
      updated_district: updatedDistrict,
      message: `Report #${reportId} status updated to '${status}'.`,
    });
  } catch (error: any) {
    console.error(`Error updating report status:`, error);
    res.status(400).json({ error: error.message || 'Failed to update report status.' });
  }
});

// 8. GET /api/reports/district/:district - District Reports List
app.get('/api/reports/district/:district', (req, res) => {
  try {
    const { district } = req.params;
    const result = getReports({ district, limit: 100 });
    res.json({ district, total: result.total, reports: result.reports });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch district reports.' });
  }
});

// 9. GET /api/reports/district/:district/summary - Reusable District Report Aggregation
app.get('/api/reports/district/:district/summary', (req, res) => {
  try {
    const { district } = req.params;
    const meta = getDistrictByName(district);
    if (!meta) {
      return res.status(404).json({ error: `District '${district}' not found.` });
    }

    const summary = getDistrictAggregation(meta.district_name);
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch district aggregation.' });
  }
});

// ============================================================================
// PHASE G: GROUNDED AI ASSISTANT & RAG INTELLIGENCE API ENDPOINTS
// ============================================================================

// 1. Unified Grounded AI Chat Assistant
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { message, language, districtContext } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Field "message" is required.' });
    }

    const allDistricts = computeAllDistrictStatus();
    const aiResponse = await aiIntelligenceService.answer_question(
      message,
      language,
      districtContext,
      allDistricts
    );

    // Keep backwards compatibility fields (reply, district, risk_score, risk_category) alongside full GroundedAIResponse
    const primaryDistrictName = aiResponse.districtsInvolved[0];
    const targetDistrict = allDistricts.find(d => d.district === primaryDistrictName) || allDistricts[0];

    res.json({
      reply: aiResponse.answer,
      district: targetDistrict?.district || 'Telangana',
      risk_score: targetDistrict?.flood_risk_score ?? 50,
      risk_category: targetDistrict?.risk_category ?? 'MODERATE',
      ...aiResponse,
    });
  } catch (error: any) {
    console.error('Error in /api/ai/chat:', error);
    res.status(500).json({ error: error.message || 'Failed to generate AI response.' });
  }
});

// 2. Explain Specific District Risk
app.post('/api/ai/district/:districtId/explain', async (req, res) => {
  try {
    const { districtId } = req.params;
    const { language } = req.body || {};
    const allDistricts = computeAllDistrictStatus();
    const aiResponse = await aiIntelligenceService.explain_district_risk(districtId, language, allDistricts);
    res.json(aiResponse);
  } catch (error: any) {
    console.error(`Error explaining risk for district ${req.params.districtId}:`, error);
    res.status(500).json({ error: error.message || 'Failed to explain district risk.' });
  }
});

// 3. Compare Two Districts
app.post('/api/ai/district/compare', async (req, res) => {
  try {
    const { district1, district2, language } = req.body;
    if (!district1 || !district2) {
      return res.status(400).json({ error: 'Both "district1" and "district2" are required for comparison.' });
    }

    const allDistricts = computeAllDistrictStatus();
    const aiResponse = await aiIntelligenceService.compare_districts(district1, district2, language, allDistricts);
    res.json(aiResponse);
  } catch (error: any) {
    console.error('Error in /api/ai/district/compare:', error);
    res.status(500).json({ error: error.message || 'Failed to compare districts.' });
  }
});

// 4. Explain Forecast Projections & Matrix
app.post('/api/ai/forecast/explain', async (req, res) => {
  try {
    const { districtOrHorizon, language } = req.body || {};
    const allDistricts = computeAllDistrictStatus();
    const aiResponse = await aiIntelligenceService.explain_forecast(districtOrHorizon || '', language, allDistricts);
    res.json(aiResponse);
  } catch (error: any) {
    console.error('Error in /api/ai/forecast/explain:', error);
    res.status(500).json({ error: error.message || 'Failed to explain forecast.' });
  }
});

// 5. Explain Alert Intelligence & Trigger Signals
app.post('/api/ai/alert/:districtId/explain', async (req, res) => {
  try {
    const { districtId } = req.params;
    const { language } = req.body || {};
    const allDistricts = computeAllDistrictStatus();
    const aiResponse = await aiIntelligenceService.explain_alert(districtId, language, allDistricts);
    res.json(aiResponse);
  } catch (error: any) {
    console.error(`Error explaining alert for district ${req.params.districtId}:`, error);
    res.status(500).json({ error: error.message || 'Failed to explain alert.' });
  }
});

// 6. Generate Public Safety Advisory
app.post('/api/ai/advisory/:districtId', async (req, res) => {
  try {
    const { districtId } = req.params;
    const { language } = req.body || {};
    const allDistricts = computeAllDistrictStatus();
    const aiResponse = await aiIntelligenceService.generate_public_advisory(districtId, language, allDistricts);
    res.json(aiResponse);
  } catch (error: any) {
    console.error(`Error generating advisory for district ${req.params.districtId}:`, error);
    res.status(500).json({ error: error.message || 'Failed to generate advisory.' });
  }
});

// 7. Search Knowledge Base (RAG Endpoint)
app.get('/api/knowledge/search', (req, res) => {
  try {
    const query = String(req.query.q || '');
    const district = req.query.district ? String(req.query.district) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 3;

    const results = knowledgeService.searchKnowledge(query, district, limit);
    res.json({
      query,
      district,
      count: results.length,
      results,
    });
  } catch (error: any) {
    console.error('Error searching knowledge base:', error);
    res.status(500).json({ error: 'Failed to search knowledge base.' });
  }
});

// 8. List Knowledge Base Documents
app.get('/api/knowledge/docs', (req, res) => {
  try {
    const docs = knowledgeService.getAllKnowledgeDocsSummary();
    res.json({ count: docs.length, documents: docs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list knowledge docs.' });
  }
});

// 9. Structured Reasoning Layer (Backwards-compatible)
app.post('/api/ai/reasoning', async (req, res) => {
  try {
    const { district, language } = req.body;
    const allDistricts = computeAllDistrictStatus();
    const targetDistrict = allDistricts.find(d => d.district.toLowerCase() === String(district).toLowerCase()) || allDistricts[0];
    const aiResponse = await aiIntelligenceService.explain_district_risk(targetDistrict.district, language, allDistricts);

    res.json({
      situation_summary: aiResponse.currentSituation || aiResponse.directAnswer,
      main_risk_factors: aiResponse.mainFactors,
      explanation_of_risk: aiResponse.directAnswer,
      recommended_actions: aiResponse.recommendedPrecautions,
      english_advisory: `Official NeerDrishti Advisory for ${targetDistrict.district}: ${targetDistrict.risk_category} flood risk level (${targetDistrict.flood_risk_score}/100). Follow safety protocols.`,
      telugu_advisory: aiResponse.teluguSummary || `${targetDistrict.district} జిల్లాలో వరద ముప్పు ${targetDistrict.risk_category} స్థాయిలో ఉంది. ప్రజలు అప్రమత్తంగా ఉండాలి.`,
      evidence_used: aiResponse.evidenceUsed,
      data_limitation_statement: aiResponse.limitations,
      transparency_badges: aiResponse.transparencyBadges,
      source: aiResponse.source,
    });
  } catch (error) {
    console.error('Error in /api/ai/reasoning:', error);
    res.status(500).json({ error: 'Failed to execute reasoning engine.' });
  }
});

// ==========================================
// PHASE H: DATA CONNECTOR & IOT ENDPOINTS
// ==========================================

// 1. Get All Registered Data Sources
app.get('/api/data/sources', (req, res) => {
  try {
    const sources = centralDataCoordinator.getAllSources();
    res.json({
      count: sources.length,
      active_mode: centralDataCoordinator.getActiveMode(),
      sources,
    });
  } catch (error: any) {
    console.error('Error in /api/data/sources:', error);
    res.status(500).json({ error: 'Failed to fetch data sources' });
  }
});

// 2. Get Central System & Source Health Assessment
app.get('/api/data/health', (req, res) => {
  try {
    const health = centralDataCoordinator.getSystemHealth();
    res.json(health);
  } catch (error: any) {
    console.error('Error in /api/data/health:', error);
    res.status(500).json({ error: 'Failed to evaluate data health' });
  }
});

// 3. Get / Set System Active Operational Data Mode
app.get('/api/data/mode', (req, res) => {
  res.json({
    active_mode: centralDataCoordinator.getActiveMode(),
    available_modes: ['SIMULATION', 'PROTOTYPE', 'LIVE', 'IOT', 'HISTORICAL', 'OFFLINE'],
    description: 'System-wide operational data ingestion mode.',
  });
});

app.post('/api/data/mode', (req, res) => {
  try {
    const { mode } = req.body;
    const allowed = ['SIMULATION', 'PROTOTYPE', 'LIVE', 'IOT', 'HISTORICAL', 'OFFLINE'];
    if (!mode || !allowed.includes(mode)) {
      return res.status(400).json({
        error: `Invalid mode '${mode}'. Allowed: ${allowed.join(', ')}.`,
      });
    }

    centralDataCoordinator.setActiveMode(mode);
    const updatedDistricts = computeAllDistrictStatus();

    res.json({
      success: true,
      active_mode: centralDataCoordinator.getActiveMode(),
      message: `System operational data mode switched to ${mode}.`,
      updated_districts_count: updatedDistricts.length,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to set data mode' });
  }
});

// 4. Ingest IoT Telemetry Reading (Compatible with REST & ESP32 HTTP POST)
app.post('/api/iot/reading', (req, res) => {
  try {
    const result = centralDataCoordinator.ingestReading(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        status: result.status,
      });
    }

    res.status(201).json({
      success: true,
      status: result.status,
      reading: result.reading,
      message: 'Telemetry successfully validated, normalized, and ingested.',
    });
  } catch (error: any) {
    console.error('Error in /api/iot/reading:', error);
    res.status(500).json({ error: 'Failed to ingest telemetry reading.' });
  }
});

// 5. Batch Ingest Generic Sensor Telemetry
app.post('/api/data/ingest', (req, res) => {
  try {
    const { readings } = req.body;
    if (!Array.isArray(readings)) {
      // Handle single payload
      const singleRes = centralDataCoordinator.ingestReading(req.body);
      if (!singleRes.success) {
        return res.status(400).json({ success: false, error: singleRes.error });
      }
      return res.status(201).json({ success: true, count: 1, readings: [singleRes.reading] });
    }

    const accepted: any[] = [];
    const rejected: any[] = [];

    for (const r of readings) {
      const itemRes = centralDataCoordinator.ingestReading(r);
      if (itemRes.success && itemRes.reading) {
        accepted.push(itemRes.reading);
      } else {
        rejected.push({ payload: r, error: itemRes.error, status: itemRes.status });
      }
    }

    res.status(accepted.length > 0 ? 201 : 400).json({
      success: accepted.length > 0,
      total_received: readings.length,
      accepted_count: accepted.length,
      rejected_count: rejected.length,
      accepted,
      rejected,
    });
  } catch (error: any) {
    console.error('Error in /api/data/ingest:', error);
    res.status(500).json({ error: 'Failed to process batch ingestion.' });
  }
});

// 6. Get All IoT Devices (with optional filtering)
app.get('/api/iot/devices', (req, res) => {
  try {
    let devices = iotDeviceRegistry.getAllDevices();
    const { district, type, status, mode } = req.query;

    if (district) {
      const dStr = String(district).toLowerCase();
      devices = devices.filter(
        d => d.district_id.toLowerCase() === dStr || d.district_name.toLowerCase() === dStr
      );
    }
    if (type) {
      devices = devices.filter(d => d.sensor_type === String(type).toLowerCase());
    }
    if (status) {
      devices = devices.filter(d => d.status.toUpperCase() === String(status).toUpperCase());
    }
    if (mode) {
      devices = devices.filter(d => d.mode.toUpperCase() === String(mode).toUpperCase());
    }

    res.json({
      count: devices.length,
      active_mode: centralDataCoordinator.getActiveMode(),
      devices,
    });
  } catch (error: any) {
    console.error('Error in /api/iot/devices:', error);
    res.status(500).json({ error: 'Failed to retrieve IoT devices.' });
  }
});

// 7. Get Device Detail & History by ID
app.get('/api/iot/devices/:deviceId', (req, res) => {
  try {
    const { deviceId } = req.params;
    const device = iotDeviceRegistry.getDeviceById(deviceId);
    if (!device) {
      return res.status(404).json({ error: `IoT device with ID '${deviceId}' not found.` });
    }

    const readings = iotDeviceRegistry.getDeviceReadings(deviceId);
    res.json({
      device,
      history_count: readings.length,
      readings,
    });
  } catch (error: any) {
    console.error(`Error in /api/iot/devices/${req.params.deviceId}:`, error);
    res.status(500).json({ error: 'Failed to retrieve device details.' });
  }
});

// 8. Get IoT Monitoring Breakdown for District Detail Inspector
app.get('/api/iot/district/:districtId', (req, res) => {
  try {
    const { districtId } = req.params;
    const breakdown = centralDataCoordinator.getDistrictMonitoringSources(districtId);
    res.json(breakdown);
  } catch (error: any) {
    console.error(`Error in /api/iot/district/${req.params.districtId}:`, error);
    res.status(500).json({ error: 'Failed to retrieve district monitoring sources.' });
  }
});

// 9. Overall IoT Telemetry Statistics
app.get('/api/iot/stats', (req, res) => {
  try {
    const devices = iotDeviceRegistry.getAllDevices();
    const online = devices.filter(d => d.status === 'ONLINE').length;
    const priorityDistrictDevices = devices.filter(d =>
      ['hyderabad', 'warangal', 'nirmal', 'mancherial', 'bhadradri_kothagudem'].includes(d.district_id)
    );

    res.json({
      total_devices: devices.length,
      online_devices: online,
      active_mode: centralDataCoordinator.getActiveMode(),
      priority_district_coverage: {
        devices_count: priorityDistrictDevices.length,
        districts_covered: 5,
      },
      standard_district_coverage: {
        devices_count: devices.length - priorityDistrictDevices.length,
        districts_covered: 5,
      },
      sensors_by_type: {
        rainfall: devices.filter(d => d.sensor_type === 'rainfall').length,
        water_level: devices.filter(d => d.sensor_type === 'water_level').length,
        drainage_status: devices.filter(d => d.sensor_type === 'drainage_status').length,
      },
      system_confidence: 'Prototype',
      transparency_notice: 'Zero-cost Virtual IoT Demonstration Layer emulating ESP32 sensor hardware.',
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to compute IoT stats.' });
  }
});

// 10. Phase H Transition & Demonstration Sequence
app.get('/api/iot/demonstration-sequence', (req, res) => {
  res.json({
    title: 'NeerDrishti Phase H: Simulation to Prototype IoT Transition Sequence',
    steps: [
      {
        step_number: 1,
        title: 'Step 1: Regional Simulation Baseline',
        description: 'Observe 33-district hydrodynamic simulation generating baseline precipitation and flood risk scores across Telangana.',
        active_mode: 'SIMULATION',
        recommended_action: 'Select Heavy Rainfall scenario and inspect Hyderabad or Bhadradri Kothagudem.',
      },
      {
        step_number: 2,
        title: 'Step 2: Virtual IoT Mesh Activation',
        description: 'Switch data mode to IOT to activate real-time telemetry from virtual ESP32 rainfall gauges, river ultrasonic sensors, and stormwater sumps.',
        active_mode: 'IOT',
        recommended_action: 'Observe telemetry live values on the Data Sources & IoT view and map overlay.',
      },
      {
        step_number: 3,
        title: 'Step 3: Interactive Telemetry Injection',
        description: 'Inject live telemetry payload for HYD_VIRTUAL_RAIN_01 or BDK_VIRTUAL_WATER_01 to demonstrate real-time validation and risk recalculation.',
        active_mode: 'IOT',
        recommended_action: 'Use the Telemetry Injector to test out-of-bounds rejection and valid updates.',
      },
      {
        step_number: 4,
        title: 'Step 4: AI Assistant Transparency Inspection',
        description: 'Ask the AI Assistant about Hyderabad or Warangal risk to see live IoT telemetry badges and grounded evidence citations.',
        active_mode: 'IOT',
        recommended_action: 'Query AI: "What is the live sensor status in Hyderabad?"',
      },
    ],
  });
});

// 11. AI Provider Status & Health Check Endpoint
app.get('/api/ai/status', async (req, res) => {
  const config = getLlamaConfig();
  const pingResult = await pingLlama(2500);

  res.json({
    ai_configured: Boolean(config.baseUrl && config.model),
    provider: 'Meta Llama',
    provider_format: 'OpenAI-Compatible',
    model: config.model,
    endpoint: config.baseUrl,
    status: pingResult.isHealthy ? 'operational' : 'fallback',
    active_provider: pingResult.isHealthy ? 'Meta Llama' : 'Deterministic Engine',
    active_model: pingResult.isHealthy ? config.model : 'Deterministic Fallback Engine',
    latency_ms: pingResult.latencyMs > 0 ? pingResult.latencyMs : null,
    fallback_available: true,
    deterministic_engine: 'operational',
    offline_safe: true,
    live_refresh_minutes: config.refreshMinutes,
    error: pingResult.error || null,
  });
});

// 12. Manual Refresh Live Rainfall Telemetry (Open-Meteo)
app.post('/api/rainfall/refresh', async (req, res) => {
  try {
    const districts = loadDistrictMetadata();
    const result = await openMeteoService.refreshAllDistricts(districts);
    const updatedDistricts = computeAllDistrictStatus();

    res.json({
      success: true,
      refreshed_count: result.total,
      success_count: result.success_count,
      failed_count: result.fail_count,
      errors: result.errors,
      timestamp: new Date().toISOString(),
      updated_districts_count: updatedDistricts.length,
    });
  } catch (error: any) {
    console.error('Error refreshing live rainfall:', error);
    res.status(500).json({ error: error.message || 'Failed to refresh live rainfall.' });
  }
});

// 13. Notifications Dispatch & History Ledger Endpoints
app.get('/api/notifications', (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const districtId = req.query.district ? String(req.query.district) : undefined;
    const history = notificationService.getHistory(limit, districtId);
    res.json({ count: history.length, notifications: history });
  } catch (error: any) {
    console.error('Error retrieving notifications:', error);
    res.status(500).json({ error: 'Failed to retrieve notifications.' });
  }
});

app.post('/api/notifications/dispatch', (req, res) => {
  try {
    const { districtId, districtName, alertLevel, channel, title, message, recommendedAction, signalsTriggered, recipientGroup } = req.body;
    if (!districtId || !districtName || !alertLevel || !title || !message) {
      return res.status(400).json({ error: 'Missing required notification fields: districtId, districtName, alertLevel, title, message.' });
    }

    const notif = notificationService.dispatchNotification({
      districtId,
      districtName,
      alertLevel,
      channel,
      title,
      message,
      recommendedAction,
      signalsTriggered,
      recipientGroup,
    });

    res.status(201).json({ success: true, notification: notif });
  } catch (error: any) {
    console.error('Error dispatching notification:', error);
    res.status(500).json({ error: 'Failed to dispatch notification.' });
  }
});

app.get('/api/notifications/stats', (req, res) => {
  try {
    const stats = notificationService.getStats();
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to retrieve notification statistics.' });
  }
});

// Process safety handlers for production resilience
process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process] Unhandled Rejection:', reason);
});

// ==========================================
// VITE SPA MIDDLEWARE / PRODUCTION STATIC SERVE
// ==========================================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const candidatePaths = [
      path.join(process.cwd(), 'dist'),
      path.join(process.cwd(), '..', 'dist'),
    ];
    const distPath = candidatePaths.find(p => fs.existsSync(path.join(p, 'index.html'))) || candidatePaths[0];
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      const indexPath = path.join(distPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(200).send('<!DOCTYPE html><html><head><title>NeerDrishti</title></head><body><div id="root"></div></body></html>');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NeerDrishti Phase C Server listening on port ${PORT}`);
    // Start lightweight Open-Meteo live rainfall telemetry scheduled refresh
    try {
      const districts = loadDistrictMetadata();
      if (districts && districts.length > 0) {
        openMeteoService.startScheduledRefresh(districts);
      }
    } catch (err) {
      console.error('Failed to initialize Open-Meteo live refresh on server start:', err);
    }
  });
}

startServer();
