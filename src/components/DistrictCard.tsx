import React from 'react';
import { ChevronRight, ShieldAlert, Database, Info, Users, Waves, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { DistrictStatus } from '../types';

interface DistrictCardProps {
  district: DistrictStatus;
  isSelected?: boolean;
  onSelect: (district: DistrictStatus) => void;
}

export const DistrictCard: React.FC<DistrictCardProps> = ({
  district,
  isSelected = false,
  onSelect,
}) => {
  const getRiskColor = (category: string) => {
    switch (category) {
      case 'CRITICAL': return '#ef4444';
      case 'HIGH': return '#f97316';
      case 'MODERATE': return '#f59e0b';
      default: return '#10b981';
    }
  };

  const getRiskBadge = (category: string) => {
    switch (category) {
      case 'CRITICAL':
        return <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 font-bold text-[10px] sm:text-xs border border-red-200">🔴 CRITICAL</span>;
      case 'HIGH':
        return <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-700 font-bold text-[10px] sm:text-xs border border-orange-200">🟠 HIGH</span>;
      case 'MODERATE':
        return <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-bold text-[10px] sm:text-xs border border-amber-200">🟡 MODERATE</span>;
      default:
        return <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold text-[10px] sm:text-xs border border-emerald-200">🟢 LOW</span>;
    }
  };

  const getCategoryBadge = (cat?: string) => {
    if (cat === 'Priority Flood Monitoring') {
      return <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold border border-blue-200">Priority Flood Monitoring</span>;
    }
    if (cat === 'Standard Monitoring') {
      return <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold border border-slate-300">Standard Monitoring</span>;
    }
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 font-medium border border-amber-200">Limited Data</span>;
  };

  const getDataModeBadge = (mode?: string) => {
    if (mode === 'Simulated Data') {
      return <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-bold border border-indigo-200">SIMULATED DATA</span>;
    }
    if (mode === 'Live Data') {
      return <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">LIVE DATA</span>;
    }
    if (mode === 'Historical Data') {
      return <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-bold border border-purple-200">HISTORICAL DATA</span>;
    }
    if (mode === 'Limited Data') {
      return <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-bold border border-amber-200">LIMITED DATA</span>;
    }
    return <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-bold border border-slate-200">PROTOTYPE BASELINE</span>;
  };

  return (
    <div
      id={`district-card-${district.district.toLowerCase().replace(/\s+/g, '-')}`}
      onClick={() => onSelect(district)}
      className={`cursor-pointer rounded-xl border p-4 transition-all duration-150 flex flex-col justify-between ${
        isSelected
          ? 'border-blue-600 ring-2 ring-blue-500/20 bg-blue-50/20 shadow-md'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
      }`}
    >
      <div>
        {/* Card Header */}
        <div className="flex items-start justify-between gap-1 mb-1.5">
          <h3 className="font-bold text-slate-900 text-sm truncate">{district.district}</h3>
          {getRiskBadge(district.risk_category)}
        </div>

        {/* Monitoring Category & Mode Badges */}
        <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
          {getCategoryBadge(district.monitoring_category)}
          {getDataModeBadge(district.data_source_mode)}
          {district.alert_intelligence && district.alert_intelligence.alert_level !== 'NORMAL' && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider ${
              district.alert_intelligence.alert_level === 'CRITICAL' ? 'bg-rose-600 text-white' :
              district.alert_intelligence.alert_level === 'HIGH' ? 'bg-orange-600 text-white' :
              district.alert_intelligence.alert_level === 'ELEVATED' ? 'bg-amber-500 text-slate-900' :
              'bg-blue-600 text-white'
            }`}>
              ⚡ {district.alert_intelligence.alert_level} ALERT
            </span>
          )}
          {district.situation_summary && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
              district.situation_summary.operationalSituation === 'CRITICAL_INFORMATIONAL' ? 'bg-red-600 text-white' :
              district.situation_summary.operationalSituation === 'HIGH_CONCERN' ? 'bg-rose-100 text-rose-800 border border-rose-200' :
              district.situation_summary.operationalSituation === 'ELEVATED_ATTENTION' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
              district.situation_summary.operationalSituation === 'MONITORING' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
              'bg-slate-100 text-slate-700 border border-slate-200'
            }`}>
              {district.situation_summary.operationalSituation.replace(/_/g, ' ')}
            </span>
          )}
        </div>

        {/* Risk Score Progress Bar */}
        <div className="space-y-1 mt-1">
          <div className="flex justify-between text-xs text-slate-600">
            <span className="font-medium">Flood Risk Score:</span>
            <span className="font-extrabold text-slate-900">{district.flood_risk_score} / 100</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-1.5 rounded-full transition-all duration-300"
              style={{
                width: `${district.flood_risk_score}%`,
                backgroundColor: getRiskColor(district.risk_category),
              }}
            />
          </div>
        </div>

        {/* Telemetry Metrics */}
        <div className="text-xs space-y-1 text-slate-600 pt-2.5">
          <div className="flex justify-between items-center">
            <span className="text-slate-500">
              {district.is_simulated ? 'Simulated Rain:' : 'Rainfall (Live):'}
            </span>
            <span className="font-semibold text-blue-600">
              {district.rainfall_mm_24h} mm
              {district.rainfall_freshness && !district.is_simulated && (
                <span className={`ml-1 text-[9px] px-1 py-0.2 rounded font-bold ${
                  district.rainfall_freshness === 'FRESH' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  {district.rainfall_freshness}
                </span>
              )}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500 flex items-center gap-1">
              <Users className="w-3 h-3 text-amber-600" />
              <span>Citizen Reports:</span>
            </span>
            <span className="font-bold text-slate-800">
              {district.citizen_reports_count} {district.citizen_reports_high_severity > 0 && `(${district.citizen_reports_high_severity} High)`}
            </span>
          </div>
          {district.hydrological_summary && (
            <div className="flex justify-between items-center">
              <span className="text-slate-500 flex items-center gap-1">
                <Waves className="w-3 h-3 text-cyan-600" />
                <span>Hydrology:</span>
              </span>
              <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                district.hydrological_summary.dominant_status === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                district.hydrological_summary.dominant_status === 'WARNING' ? 'bg-orange-100 text-orange-700' :
                district.hydrological_summary.dominant_status === 'WATCH' ? 'bg-amber-100 text-amber-800' :
                'bg-emerald-100 text-emerald-800'
              }`}>
                {district.hydrological_summary.dominant_status} ({district.hydrological_summary.dominant_trend})
              </span>
            </div>
          )}
          {district.alert_intelligence && district.alert_intelligence.alert_level !== 'NORMAL' && (
            <div className="flex justify-between items-center bg-rose-50/50 p-1.5 rounded border border-rose-100">
              <span className="text-slate-600 flex items-center gap-1 text-[11px] font-medium truncate max-w-[140px]">
                <ShieldAlert className="w-3 h-3 text-rose-600 shrink-0" />
                <span className="truncate">{district.alert_intelligence.primary_alert_type}</span>
              </span>
              <span className="text-[10px] font-bold text-rose-800 shrink-0">
                Peak: {district.alert_intelligence.projected_risk} ({district.alert_intelligence.peak_horizon})
              </span>
            </div>
          )}
          {district.forecast_summary && (
            <div className="flex justify-between items-center">
              <span className="text-slate-500 flex items-center gap-1">
                {district.forecast_summary.riskTrend === 'RISING' ? (
                  <TrendingUp className="w-3 h-3 text-rose-600" />
                ) : district.forecast_summary.riskTrend === 'IMPROVING' ? (
                  <TrendingDown className="w-3 h-3 text-emerald-600" />
                ) : (
                  <Minus className="w-3 h-3 text-slate-400" />
                )}
                <span>+6H Outlook:</span>
              </span>
              <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                district.forecast_summary.riskTrend === 'RISING'
                  ? 'bg-rose-100 text-rose-700 border border-rose-200'
                  : district.forecast_summary.riskTrend === 'IMPROVING'
                  ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                  : 'bg-slate-100 text-slate-700 border border-slate-200'
              }`}>
                {district.forecast_summary.riskTrend} ({district.forecast_summary.projectedRiskScore})
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-slate-500">Data Completeness:</span>
            <span className="font-semibold text-slate-800">{district.risk_data_completeness ?? 80}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Region Zone:</span>
            <span className="font-medium text-slate-700 truncate max-w-[110px]">{district.region_zone || 'Central'}</span>
          </div>
        </div>
      </div>

      {/* Card Footer */}
      <div className="pt-2.5 mt-3 border-t border-slate-100 flex items-center justify-between text-xs text-blue-600 font-semibold">
        <span className="text-[10px] text-slate-400 font-normal">
          {district.last_updated || '2026-08-27'}
        </span>
        <div className="flex items-center gap-0.5">
          <span>{isSelected ? 'Viewing' : 'Details'}</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </div>
      </div>
    </div>
  );
};
