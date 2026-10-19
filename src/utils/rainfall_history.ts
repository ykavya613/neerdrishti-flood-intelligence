/**
 * 24-Hour Historical Rainfall Trend Utility
 * Calibrated for Telangana hydro-meteorological monitoring and IMD classifications.
 */

export interface HourlyRainfallPoint {
  hour: string; // e.g. "14:00"
  relative_hour: string; // e.g. "-23h", "-22h", ..., "Now"
  timestamp: string;
  rainfall_mm: number; // hourly precipitation intensity in mm/hr
  cumulative_mm: number; // cumulative precipitation accumulated over 24h
  intensity: 'None' | 'Light' | 'Moderate' | 'Heavy' | 'Very Heavy';
  is_burst?: boolean;
}

export interface DistrictRainfallHistorySummary {
  district_name: string;
  total_rainfall_24h: number;
  burst_rainfall_3h: number;
  peak_hourly_rainfall: number;
  peak_hour: string;
  wet_hours_count: number;
  monsoon_intensity_category: 'Dry / Trace' | 'Light Intermittent' | 'Moderate Convective' | 'Heavy Downpour' | 'Very Heavy / Cloudburst Risk';
  points: HourlyRainfallPoint[];
}

/**
 * Deterministically generates a realistic calibrated 24-hour hourly rainfall distribution
 * anchored to the district's deterministic 24-hour total and 3-hour burst.
 */
export function generate24HourRainfallTrend(
  total24h: number,
  burst3h: number = 0,
  districtName: string = 'District'
): DistrictRainfallHistorySummary {
  const r24 = Math.max(0, Math.round(total24h * 10) / 10);
  const r3 = Math.max(0, Math.min(r24, Math.round((burst3h || (r24 * 0.35)) * 10) / 10));
  const rPrior = Math.max(0, Math.round((r24 - r3) * 10) / 10);

  // Seed for deterministic repeatable pattern per district
  let seed = 0;
  for (let c = 0; c < districtName.length; c++) {
    seed = (seed * 31 + districtName.charCodeAt(c)) % 10000;
  }

  // Base IST hour reference (12:00 PM if no time provided)
  const now = new Date();
  const baseHour = now.getHours();

  const rawHourly: number[] = new Array(24).fill(0);

  if (r24 > 0) {
    // 1. Distribute prior 21 hours (hours 0 to 20) with realistic diurnal variation
    if (rPrior > 0) {
      const priorWeights: number[] = [];
      let weightSum = 0;
      for (let i = 0; i < 21; i++) {
        // Convective peak modulated by seed and sine waves
        const phase = (i + (seed % 7)) / 3.2;
        const wave1 = Math.max(0, Math.sin(phase) + 0.4);
        const wave2 = Math.max(0, Math.cos(phase * 1.5) * 0.6);
        const jitter = ((seed * (i + 1)) % 10) / 25; // 0 to 0.4 jitter
        const weight = Math.max(0.02, wave1 + wave2 + jitter);
        priorWeights.push(weight);
        weightSum += weight;
      }

      for (let i = 0; i < 21; i++) {
        rawHourly[i] = Math.round(((priorWeights[i] / weightSum) * rPrior) * 10) / 10;
      }
    }

    // 2. Distribute recent 3-hour burst (hours 21, 22, 23)
    if (r3 > 0) {
      // Typically peak burst happens 1-2 hours before current time
      const burstWeights = [0.28, 0.44, 0.28];
      rawHourly[21] = Math.round((r3 * burstWeights[0]) * 10) / 10;
      rawHourly[22] = Math.round((r3 * burstWeights[1]) * 10) / 10;
      rawHourly[23] = Math.round((r3 * burstWeights[2]) * 10) / 10;
    }

    // Adjust slight rounding mismatch on the highest hour so total matches r24 exactly
    const currentSum = Math.round(rawHourly.reduce((acc, v) => acc + v, 0) * 10) / 10;
    const diff = Math.round((r24 - currentSum) * 10) / 10;
    if (Math.abs(diff) > 0) {
      // Find peak hour and apply diff
      let maxIdx = 22;
      let maxVal = -1;
      for (let i = 0; i < 24; i++) {
        if (rawHourly[i] > maxVal) {
          maxVal = rawHourly[i];
          maxIdx = i;
        }
      }
      rawHourly[maxIdx] = Math.max(0, Math.round((rawHourly[maxIdx] + diff) * 10) / 10);
    }
  }

  // Construct points array with timestamps and cumulative accumulation
  let cumulative = 0;
  let peakHourly = 0;
  let peakHourStr = '12:00';
  let wetHours = 0;

  const points: HourlyRainfallPoint[] = [];

  for (let i = 0; i < 24; i++) {
    const val = rawHourly[i];
    cumulative = Math.round((cumulative + val) * 10) / 10;

    if (val > 0.1) wetHours++;
    if (val > peakHourly) {
      peakHourly = val;
    }

    // Calculate time labels
    const hoursAgo = 23 - i;
    const pointDate = new Date(now.getTime() - hoursAgo * 3600000);
    const hourNum = pointDate.getHours();
    const hourStr = `${hourNum.toString().padStart(2, '0')}:00`;
    const relativeHourStr = hoursAgo === 0 ? 'Now' : `-${hoursAgo}h`;

    if (val === peakHourly && peakHourly > 0) {
      peakHourStr = hourStr;
    }

    // IMD Hourly Rainfall Intensity Classification
    let intensity: HourlyRainfallPoint['intensity'] = 'None';
    if (val > 0 && val < 2.5) intensity = 'Light';
    else if (val >= 2.5 && val < 7.5) intensity = 'Moderate';
    else if (val >= 7.5 && val < 15.0) intensity = 'Heavy';
    else if (val >= 15.0) intensity = 'Very Heavy';

    points.push({
      hour: hourStr,
      relative_hour: relativeHourStr,
      timestamp: pointDate.toISOString(),
      rainfall_mm: val,
      cumulative_mm: cumulative,
      intensity,
      is_burst: i >= 21 && val >= 5.0,
    });
  }

  let monsoonCategory: DistrictRainfallHistorySummary['monsoon_intensity_category'] = 'Dry / Trace';
  if (r24 >= 115.5) monsoonCategory = 'Very Heavy / Cloudburst Risk';
  else if (r24 >= 64.5) monsoonCategory = 'Heavy Downpour';
  else if (r24 >= 15.5) monsoonCategory = 'Moderate Convective';
  else if (r24 > 0) monsoonCategory = 'Light Intermittent';

  return {
    district_name: districtName,
    total_rainfall_24h: r24,
    burst_rainfall_3h: r3,
    peak_hourly_rainfall: peakHourly,
    peak_hour: peakHourStr,
    wet_hours_count: wetHours,
    monsoon_intensity_category: monsoonCategory,
    points,
  };
}
