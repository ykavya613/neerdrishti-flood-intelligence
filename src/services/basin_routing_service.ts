import fs from 'fs';
import path from 'path';
import { BasinConnection, BasinInfluenceSummary, SignalDataMode } from '../types/signals';
import { normalizeDistrict } from './district_normalizer';

let cachedBasinConnections: BasinConnection[] | null = null;

export function loadBasinConnections(): BasinConnection[] {
  if (cachedBasinConnections) {
    return cachedBasinConnections;
  }
  const candidatePaths = [
    path.join(process.cwd(), 'data', 'basin_connections.json'),
    path.join(process.cwd(), '..', 'data', 'basin_connections.json'),
  ];
  for (const filePath of candidatePaths) {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        cachedBasinConnections = JSON.parse(raw);
        return cachedBasinConnections!;
      }
    } catch (err) {
      console.warn(`Failed reading basin connections from ${filePath}:`, err);
    }
  }
  return [];
}

export function getUpstreamConnections(downstreamDistrictId: string): BasinConnection[] {
  const targetNorm = normalizeDistrict(downstreamDistrictId);
  const targetId = targetNorm.districtId || targetNorm.canonical_id || downstreamDistrictId.toLowerCase();
  const connections = loadBasinConnections();
  return connections.filter((c) => {
    const cNorm = normalizeDistrict(c.downstream_district_id);
    const cId = cNorm.districtId || cNorm.canonical_id || c.downstream_district_id.toLowerCase();
    return cId === targetId;
  });
}

export function getDownstreamConnections(upstreamDistrictId: string): BasinConnection[] {
  const targetNorm = normalizeDistrict(upstreamDistrictId);
  const targetId = targetNorm.districtId || targetNorm.canonical_id || upstreamDistrictId.toLowerCase();
  const connections = loadBasinConnections();
  return connections.filter((c) => {
    const cNorm = normalizeDistrict(c.upstream_district_id);
    const cId = cNorm.districtId || cNorm.canonical_id || c.upstream_district_id.toLowerCase();
    return cId === targetId;
  });
}

export function calculateBasinInfluence(
  districtId: string,
  allDistrictStatuses?: Record<string, any>,
  horizonHours: number = 6
): BasinInfluenceSummary {
  const norm = normalizeDistrict(districtId);
  const connections = getUpstreamConnections(norm.canonical_id);

  if (connections.length === 0) {
    return {
      has_upstream_influence: false,
      upstream_connections_count: 0,
      active_upstream_threats: [],
      total_projected_basin_surge: 0.0,
      basin_summary_text: 'District is in headwater catchment or standalone drainage system with no direct upstream river cascade.',
    };
  }

  const threats: BasinInfluenceSummary['active_upstream_threats'] = [];
  let totalSurge = 0.0;

  for (const conn of connections) {
    const upId = conn.upstream_district_id;
    const upName = conn.water_body_name || 'Upstream Channel';
    const travelHours = conn.estimated_travel_window_hours || 6;
    const strength = conn.influence_strength || 0.4;
    const conf = conn.relationship_confidence || 0.8;

    const upStatus = allDistrictStatuses?.[upId] || {};
    const upRisk = Number(upStatus.composite_risk_score ?? upStatus.current_risk_score ?? 20.0);
    const upRain = Number(upStatus.rainfall_mm_24h ?? 0.0);
    const hydroSummary = upStatus.hydrological_summary || {};
    const dominantStatus = hydroSummary.dominant_status || 'NORMAL';
    const dominantTrend = hydroSummary.dominant_trend || 'STABLE';

    // Arrival weight
    const timeDiff = Math.abs(horizonHours - travelHours);
    let timeFactor = 0.15;
    if (timeDiff === 0) timeFactor = 1.0;
    else if (timeDiff <= 3) timeFactor = 0.80;
    else if (timeDiff <= 6) timeFactor = 0.55;
    else if (timeDiff <= 12) timeFactor = 0.30;

    // Upstream severity multiplier
    let severityFactor = 0.0;
    if (dominantStatus === 'CRITICAL' || dominantStatus === 'WARNING' || upRisk >= 60) {
      severityFactor = 1.0;
    } else if (dominantStatus === 'WATCH' || upRisk >= 40 || upRain >= 50) {
      severityFactor = 0.65;
    } else if (dominantTrend === 'RISING' || upRisk >= 25 || upRain >= 25) {
      severityFactor = 0.35;
    }

    const rawImpact = upRisk * strength * conf * timeFactor * (0.5 + 0.5 * severityFactor) * 0.25;
    const impactScore = Math.round(rawImpact * 10) / 10;

    if (severityFactor > 0 && impactScore > 1.5) {
      const now = new Date();
      now.setHours(now.getHours() + travelHours);
      const arrivalTime = `${now.toISOString().substring(11, 16)} UTC`;
      const upNorm = normalizeDistrict(upId);

      const evidence = `Upstream ${conn.basin_name} inflow via ${upName} (travel time ~${travelHours}h, arrival approx ${arrivalTime}). Upstream risk index: ${Math.round(upRisk)}/100 with ${dominantStatus} gauge condition.`;

      threats.push({
        upstream_district_id: upId,
        upstream_district_name: upNorm.district_name,
        water_body_name: upName,
        travel_window_hours: travelHours,
        estimated_arrival: arrivalTime,
        upstream_risk_score: upRisk,
        upstream_rainfall_24h: upRain,
        upstream_river_status: dominantStatus,
        projected_downstream_impact_score: impactScore,
        evidence,
      });

      totalSurge += impactScore;
    }
  }

  totalSurge = Math.min(Math.round(totalSurge * 10) / 10, 25.0);

  const basinSummaryText = threats.length > 0
    ? `Active upstream hydrological propagation detected across ${threats.length} channel(s). Potential downstream surge contribution: +${totalSurge.toFixed(1)} risk points.`
    : 'Upstream river gauges currently stable; no severe upstream flood propagation expected within this window.';

  return {
    has_upstream_influence: threats.length > 0,
    upstream_connections_count: connections.length,
    active_upstream_threats: threats,
    total_projected_basin_surge: totalSurge,
    basin_summary_text: basinSummaryText,
  };
}
