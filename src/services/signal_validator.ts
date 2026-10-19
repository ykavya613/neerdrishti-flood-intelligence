import { UniversalSignal, SignalValidationResult, SignalFreshnessResult, SignalType } from '../types/signals';
import {
  FRESHNESS_THRESHOLDS,
  HYDROLOGY_FRESHNESS_THRESHOLDS,
  RAINFALL_PLAUSIBLE_BOUNDS,
  HYDROLOGICAL_PLAUSIBLE_BOUNDS
} from '../config/data_sources';

/**
 * Validates external signal parameters before storage or risk calculations.
 * Supports signal-type-specific physical bounds and unit rules.
 */
export function validateSignal(signal: Partial<UniversalSignal>): SignalValidationResult {
  const errors: string[] = [];

  if (!signal.districtId || typeof signal.districtId !== 'string' || !signal.districtId.trim()) {
    errors.push('Missing or invalid district identifier');
  }

  const signalType = (signal.signalType || 'rainfall') as SignalType;
  const rawUnit = (signal.unit || '').trim().toLowerCase();

  if (signal.value === undefined || signal.value === null || typeof signal.value !== 'number' || isNaN(signal.value)) {
    errors.push('Signal value must be a valid numeric value');
  } else {
    // Physical bounds checking per signal type
    if (signalType === 'rainfall') {
      if (signal.value < RAINFALL_PLAUSIBLE_BOUNDS.MIN_MM) {
        errors.push(`Signal value cannot be negative (got ${signal.value})`);
      }
      if (signal.value > RAINFALL_PLAUSIBLE_BOUNDS.MAX_MM_24H) {
        errors.push(`Signal value exceeds plausible upper meteorological threshold of ${RAINFALL_PLAUSIBLE_BOUNDS.MAX_MM_24H} mm (got ${signal.value})`);
      }
    } else if (signalType === 'river_level' || signalType === 'reservoir_level') {
      if (signal.value < 0) {
        errors.push(`Water level cannot be negative (got ${signal.value})`);
      }
      if (['ft', 'feet'].includes(rawUnit)) {
        if (signal.value > HYDROLOGICAL_PLAUSIBLE_BOUNDS.RIVER_LEVEL_FEET.MAX) {
          errors.push(`Water level in feet exceeds plausible limit of ${HYDROLOGICAL_PLAUSIBLE_BOUNDS.RIVER_LEVEL_FEET.MAX} ft (got ${signal.value})`);
        }
      } else {
        if (signal.value > HYDROLOGICAL_PLAUSIBLE_BOUNDS.RIVER_LEVEL_METERS.MAX) {
          errors.push(`Water level in meters exceeds plausible limit of ${HYDROLOGICAL_PLAUSIBLE_BOUNDS.RIVER_LEVEL_METERS.MAX} m (got ${signal.value})`);
        }
      }
    } else if (signalType === 'reservoir_storage') {
      if (signal.value < 0) {
        errors.push(`Storage value cannot be negative (got ${signal.value})`);
      }
      if (['%', 'percent'].includes(rawUnit)) {
        if (signal.value > 100.0) {
          errors.push(`Storage percentage exceeds 100% (got ${signal.value}%)`);
        }
      } else if (['tmc'].includes(rawUnit)) {
        if (signal.value > HYDROLOGICAL_PLAUSIBLE_BOUNDS.RESERVOIR_STORAGE_TMC.MAX) {
          errors.push(`Storage in TMC exceeds plausible limit of ${HYDROLOGICAL_PLAUSIBLE_BOUNDS.RESERVOIR_STORAGE_TMC.MAX} TMC (got ${signal.value})`);
        }
      }
    } else if (signalType === 'dam_discharge' || signalType === 'reservoir_release' || signalType === 'river_flow') {
      if (signal.value < 0) {
        errors.push(`Discharge flow cannot be negative (got ${signal.value})`);
      }
      if (['cusecs', 'cfs'].includes(rawUnit)) {
        if (signal.value > HYDROLOGICAL_PLAUSIBLE_BOUNDS.DISCHARGE_CUSECS.MAX) {
          errors.push(`Discharge flow exceeds plausible maximum of ${HYDROLOGICAL_PLAUSIBLE_BOUNDS.DISCHARGE_CUSECS.MAX} cusecs (got ${signal.value})`);
        }
      } else if (['cumecs', 'm3/s'].includes(rawUnit)) {
        if (signal.value > HYDROLOGICAL_PLAUSIBLE_BOUNDS.DISCHARGE_CUMECS.MAX) {
          errors.push(`Discharge flow exceeds plausible maximum of ${HYDROLOGICAL_PLAUSIBLE_BOUNDS.DISCHARGE_CUMECS.MAX} cumecs (got ${signal.value})`);
        }
      }
    } else if (signalType === 'hydrological_alert') {
      if (signal.value < 0 || signal.value > 5) {
        errors.push(`Hydrological alert severity code must be between 0 and 5 (got ${signal.value})`);
      }
    }
  }

  if (!signal.recordedAt || typeof signal.recordedAt !== 'string') {
    errors.push('Missing or invalid observation timestamp');
  } else {
    const recDate = new Date(signal.recordedAt);
    if (isNaN(recDate.getTime())) {
      errors.push('Unparseable ISO observation timestamp');
    } else {
      const now = new Date();
      // Allow max 10 minutes clock drift for future timestamp
      if (recDate.getTime() > now.getTime() + 10 * 60 * 1000) {
        errors.push('Recorded timestamp is unreasonably in the future');
      }
    }
  }

  const validUnits = [
    'mm', 'mm/h', 'cm',
    'm', 'meters', 'ft', 'feet',
    'cusecs', 'cfs', 'cumecs', 'm3/s',
    'tmc', 'mcft', '%', 'percent',
    'level', 'alert_code'
  ];

  if (!signal.unit || typeof signal.unit !== 'string' || !validUnits.includes(rawUnit)) {
    errors.push(`Unsupported or missing unit (got '${signal.unit}')`);
  }

  if (!signal.sourceName || typeof signal.sourceName !== 'string') {
    errors.push('Missing data source name');
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitizedValue: errors.length === 0 ? signal.value : undefined,
  };
}

/**
 * Computes freshness status and confidence attenuation factor based on observation age.
 * Supports signal-type-specific freshness thresholds.
 */
export function evaluateFreshness(
  recordedAt: string | Date,
  now: Date = new Date(),
  signalType: SignalType = 'rainfall'
): SignalFreshnessResult {
  try {
    const recDate = typeof recordedAt === 'string' ? new Date(recordedAt) : recordedAt;
    if (isNaN(recDate.getTime())) {
      return { status: 'EXPIRED', factor: 0.0, ageHours: 999 };
    }

    const diffMs = Math.max(0, now.getTime() - recDate.getTime());
    const ageHours = diffMs / (1000 * 60 * 60);

    let freshMax = FRESHNESS_THRESHOLDS.FRESH_MAX_HOURS;
    let agingMax = FRESHNESS_THRESHOLDS.AGING_MAX_HOURS;
    let staleMax = FRESHNESS_THRESHOLDS.STALE_MAX_HOURS;

    if (signalType === 'reservoir_level' || signalType === 'reservoir_storage' || signalType === 'reservoir_release') {
      freshMax = HYDROLOGY_FRESHNESS_THRESHOLDS.RESERVOIR_FRESH_MAX_HOURS;
      agingMax = HYDROLOGY_FRESHNESS_THRESHOLDS.RESERVOIR_AGING_MAX_HOURS;
      staleMax = HYDROLOGY_FRESHNESS_THRESHOLDS.RESERVOIR_STALE_MAX_HOURS;
    } else if (signalType === 'river_level' || signalType === 'river_flow' || signalType === 'dam_discharge') {
      freshMax = HYDROLOGY_FRESHNESS_THRESHOLDS.RIVER_FRESH_MAX_HOURS;
      agingMax = HYDROLOGY_FRESHNESS_THRESHOLDS.RIVER_AGING_MAX_HOURS;
      staleMax = HYDROLOGY_FRESHNESS_THRESHOLDS.RIVER_STALE_MAX_HOURS;
    }

    if (ageHours <= freshMax) {
      return { status: 'FRESH', factor: 1.0, ageHours: Math.round(ageHours * 100) / 100 };
    }
    if (ageHours <= agingMax) {
      return { status: 'AGING', factor: 0.8, ageHours: Math.round(ageHours * 100) / 100 };
    }
    if (ageHours <= staleMax) {
      return { status: 'STALE', factor: 0.5, ageHours: Math.round(ageHours * 100) / 100 };
    }
    return { status: 'EXPIRED', factor: 0.0, ageHours: Math.round(ageHours * 100) / 100 };
  } catch (err) {
    return { status: 'EXPIRED', factor: 0.0, ageHours: 999 };
  }
}
