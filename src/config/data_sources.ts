import { DataSourceRegistryEntry } from '../types/signals';

/**
 * Central Data Source Registry for NeerDrishti Flood Intelligence
 * Tracks provider priority, base confidence, refresh intervals, health, and fallback modes.
 */
export const DATA_SOURCES: Record<string, DataSourceRegistryEntry> = {
  IMD_AWS_TELANGANA: {
    sourceName: 'IMD Automatic Weather Stations (Telangana)',
    sourceType: 'official_api',
    supportedSignals: ['rainfall', 'weather'],
    enabled: true,
    priority: 1,
    refreshIntervalMinutes: 60,
    baseConfidence: 0.95,
    currentMode: 'LIVE',
    health: 'HEALTHY',
    lastSuccessfulUpdate: null,
    description: 'India Meteorological Department real-time station telemetry across Telangana district centers.',
  },
  OPEN_METEO_TELEMETRY: {
    sourceName: 'Open-Meteo High-Resolution Telangana Ingestion',
    sourceType: 'weather_service',
    supportedSignals: ['rainfall', 'weather'],
    enabled: true,
    priority: 2,
    refreshIntervalMinutes: 30,
    baseConfidence: 0.90,
    currentMode: 'LIVE',
    health: 'HEALTHY',
    lastSuccessfulUpdate: null,
    description: 'High-resolution global NWP meteorological data calibrated for Telangana coordinates.',
  },
  TELANGANA_HISTORICAL_BASELINE: {
    sourceName: 'Telangana State Development Planning Society (TSDPS) Baseline Archive',
    sourceType: 'historical_archive',
    supportedSignals: ['rainfall'],
    enabled: true,
    priority: 3,
    refreshIntervalMinutes: 1440,
    baseConfidence: 0.75,
    currentMode: 'HISTORICAL',
    health: 'HEALTHY',
    lastSuccessfulUpdate: '2026-08-25T00:00:00.000Z',
    description: 'Verified historical monsoon baselines and multi-year precipitation normals.',
  },
  CWC_TELANGANA_HYDROMET: {
    sourceName: 'Central Water Commission (CWC) Godavari & Krishna River Gauges',
    sourceType: 'official_api',
    supportedSignals: ['river_level', 'river_flow', 'dam_discharge', 'hydrological_alert'],
    enabled: true,
    priority: 1,
    refreshIntervalMinutes: 60,
    baseConfidence: 0.95,
    currentMode: 'LIVE',
    health: 'HEALTHY',
    lastSuccessfulUpdate: null,
    description: 'Real-time telemetry and gauge observations across Godavari and Krishna key river stations.',
  },
  TELANGANA_ICAD_RESERVOIRS: {
    sourceName: 'Telangana Irrigation & CAD Department Reservoir Operations',
    sourceType: 'official_api',
    supportedSignals: ['reservoir_level', 'reservoir_storage', 'reservoir_release', 'dam_discharge'],
    enabled: true,
    priority: 1,
    refreshIntervalMinutes: 180,
    baseConfidence: 0.95,
    currentMode: 'LIVE',
    health: 'HEALTHY',
    lastSuccessfulUpdate: null,
    description: 'Official reservoir telemetry including full reservoir levels, gross storage, inflow and outflow releases.',
  },
  TELANGANA_HISTORICAL_HYDROLOGY: {
    sourceName: 'Telangana State Hydrological Historical Archive',
    sourceType: 'historical_archive',
    supportedSignals: ['river_level', 'reservoir_level', 'reservoir_storage', 'reservoir_release'],
    enabled: true,
    priority: 3,
    refreshIntervalMinutes: 1440,
    baseConfidence: 0.80,
    currentMode: 'HISTORICAL',
    health: 'HEALTHY',
    lastSuccessfulUpdate: '2026-08-25T00:00:00.000Z',
    description: 'Verified historical monsoon peak flood levels, reservoir fill curves, and past flood discharges.',
  },
  NEERDRISHTI_SIMULATION_ENGINE: {
    sourceName: 'NeerDrishti Hydrological Simulation Engine',
    sourceType: 'simulation_engine',
    supportedSignals: ['rainfall', 'river_level', 'river_flow', 'reservoir_level', 'reservoir_storage', 'reservoir_release', 'dam_discharge'],
    enabled: true,
    priority: 4,
    refreshIntervalMinutes: 0,
    baseConfidence: 0.60,
    currentMode: 'SIMULATED',
    health: 'HEALTHY',
    lastSuccessfulUpdate: new Date().toISOString(),
    description: 'Deterministic scenario-based regional hydrodynamic flood propagation simulation.',
  },
};

export const FRESHNESS_THRESHOLDS = {
  FRESH_MAX_HOURS: 3,     // 0 to 3 hours -> FRESH (1.0 factor)
  AGING_MAX_HOURS: 12,    // 3 to 12 hours -> AGING (0.8 factor)
  STALE_MAX_HOURS: 24,    // 12 to 24 hours -> STALE (0.5 factor)
  EXPIRED_MIN_HOURS: 24,  // > 24 hours -> EXPIRED (0.0 factor)
};

export const HYDROLOGY_FRESHNESS_THRESHOLDS = {
  RIVER_FRESH_MAX_HOURS: 3,
  RIVER_AGING_MAX_HOURS: 12,
  RIVER_STALE_MAX_HOURS: 24,
  RESERVOIR_FRESH_MAX_HOURS: 6,
  RESERVOIR_AGING_MAX_HOURS: 24,
  RESERVOIR_STALE_MAX_HOURS: 48,
};

export const RAINFALL_PLAUSIBLE_BOUNDS = {
  MIN_MM: 0.0,
  MAX_MM_24H: 500.0, // Plausible upper bound for 24h extreme tropical cloudburst in Telangana
  MAX_MM_BURST_3H: 250.0,
};

export const HYDROLOGICAL_PLAUSIBLE_BOUNDS = {
  RIVER_LEVEL_METERS: { MIN: 0.0, MAX: 1000.0 }, // Covers river gauge heights across Godavari/Krishna & MSL datum
  RIVER_LEVEL_FEET: { MIN: 0.0, MAX: 3500.0 },  // Covers gauge heights in feet (e.g. Osman Sagar ~1790 ft)
  RESERVOIR_STORAGE_TMC: { MIN: 0.0, MAX: 1000.0 }, // Nagarjuna Sagar, Srisailam, Kaleshwaram complex
  RESERVOIR_STORAGE_PERCENT: { MIN: 0.0, MAX: 100.0 },
  DISCHARGE_CUSECS: { MIN: 0.0, MAX: 3000000.0 }, // Max Godavari historical flood discharge ~2.5 million cusecs
  DISCHARGE_CUMECS: { MIN: 0.0, MAX: 85000.0 },
};
