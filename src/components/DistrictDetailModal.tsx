import React, { useState, useEffect } from 'react';
import { 
  X, 
  Sparkles, 
  ShieldCheck, 
  Languages, 
  CheckCircle2, 
  AlertTriangle, 
  CloudRain, 
  Activity, 
  Users, 
  Info, 
  Layers,
  Database,
  Compass,
  Clock,
  Droplets,
  Building,
  Car,
  Waves,
  Radio,
  Target,
  Gauge,
  ArrowUpRight,
  TrendingUp,
  TrendingDown,
  Minus,
  GitMerge,
  ShieldAlert
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Cell 
} from 'recharts';
import { DistrictStatus, AIReasoningResponse, CitizenReport } from '../types';
import { IoTDevice } from '../types/iot';

interface DistrictDetailModalProps {
  district: DistrictStatus | null;
  onClose: () => void;
}

export const DistrictDetailModal: React.FC<DistrictDetailModalProps> = ({
  district,
  onClose,
}) => {
  const [aiAdvisory, setAiAdvisory] = useState<AIReasoningResponse | null>(null);
  const [isLoadingAI, setIsLoadingAI] = useState<boolean>(false);
  const [districtReports, setDistrictReports] = useState<CitizenReport[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState<boolean>(false);
  const [districtIotDevices, setDistrictIotDevices] = useState<IoTDevice[]>([]);
  const [alertLang, setAlertLang] = useState<'en' | 'te' | 'hi'>('en');

  useEffect(() => {
    if (district) {
      setAiAdvisory(null);
      fetchAIAdvisory(district.district);
      fetchDistrictReports(district.district);
      fetchDistrictIoT(district.district_id || district.district);
    }
  }, [district?.district]);

  if (!district) return null;

  const fetchDistrictIoT = async (districtId: string) => {
    try {
      const res = await fetch(`/api/iot/devices?district_id=${encodeURIComponent(districtId)}`);
      const data = await res.json();
      if (data && data.devices) {
        setDistrictIotDevices(data.devices);
      }
    } catch (err) {
      console.error('Failed to fetch district IoT devices:', err);
    }
  };

  const fetchAIAdvisory = async (districtName: string) => {
    setIsLoadingAI(true);
    try {
      const response = await fetch('/api/ai/reasoning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ district: districtName }),
      });
      const data = await response.json();
      setAiAdvisory(data);
    } catch (err) {
      console.error('Failed to fetch AI reasoning:', err);
    } finally {
      setIsLoadingAI(false);
    }
  };

  const fetchDistrictReports = async (districtName: string) => {
    setIsLoadingReports(true);
    try {
      const res = await fetch(`/api/reports/district/${encodeURIComponent(districtName)}`);
      const data = await res.json();
      setDistrictReports(data.reports || []);
    } catch (err) {
      console.error('Failed to fetch district reports:', err);
    } finally {
      setIsLoadingReports(false);
    }
  };

  const getRiskBadge = (category: string) => {
    switch (category) {
      case 'CRITICAL':
        return <span className="px-3 py-1 rounded-full bg-red-100 text-red-700 font-bold text-xs border border-red-200">🔴 CRITICAL RISK</span>;
      case 'HIGH':
        return <span className="px-3 py-1 rounded-full bg-orange-100 text-orange-700 font-bold text-xs border border-orange-200">🟠 HIGH RISK</span>;
      case 'MODERATE':
        return <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-700 font-bold text-xs border border-amber-200">🟡 MODERATE RISK</span>;
      default:
        return <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs border border-emerald-200">🟢 LOW RISK</span>;
    }
  };

  const getCategoryBadge = (cat?: string) => {
    if (cat === 'Priority Flood Monitoring') {
      return <span className="text-xs px-2.5 py-1 rounded-lg bg-blue-100 text-blue-800 font-semibold border border-blue-200">Priority Flood Monitoring</span>;
    }
    if (cat === 'Standard Monitoring') {
      return <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-semibold border border-slate-300">Standard Monitoring</span>;
    }
    return <span className="text-xs px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 font-medium border border-amber-200">Limited Data</span>;
  };

  // Contribution chart data (Rainfall 35%, History 25%, Location 15%, Reports 15%, Drainage 10%)
  const contributionData = [
    { name: 'Rainfall (35%)', value: district.contributions?.rainfall ?? 0, fill: '#3b82f6' },
    { name: 'History (25%)', value: district.contributions?.flood_history ?? 0, fill: '#8b5cf6' },
    { name: 'Location (15%)', value: district.contributions?.location_risk ?? 0, fill: '#06b6d4' },
    { name: 'Reports (15%)', value: district.contributions?.citizen_reports ?? 0, fill: '#f59e0b' },
    { name: 'Drainage (10%)', value: district.contributions?.drainage_vulnerability ?? 0, fill: '#ec4899' },
  ];

  const isPrototype = district.data_source_mode !== 'Live Data';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6">
      <div 
        id="district-detail-modal-container"
        className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200"
      >
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 sm:p-6 flex items-start justify-between border-b border-slate-800">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <h2 className="text-2xl font-black tracking-tight">{district.district}</h2>
              {getRiskBadge(district.risk_category)}
              {getCategoryBadge(district.monitoring_category)}
              <span className="text-xs px-2 py-0.5 rounded bg-indigo-900/80 text-indigo-300 border border-indigo-700 font-semibold">
                {district.data_source_mode}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Zone: <span className="text-slate-200 font-semibold">{district.region_zone}</span> • Basin: <span className="text-slate-200 font-semibold">{district.river_basin}</span> • Last Updated: <span className="text-slate-200">{district.last_updated || '2026-08-27'}</span>
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6">
          {/* Transparent Prototype & Data Limitations Notice */}
          {isPrototype && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-3">
              <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold block">Scientific Provenance & Simulation Notice:</span>
                <p>
                  Telemetry for {district.district} is evaluated under <b>{district.data_source_mode}</b> with <b>{district.risk_data_completeness ?? 80}% data completeness</b> and <b>{district.risk_confidence || 'Prototype'} confidence</b>.
                  {district.data_limitation_notes ? ` Limitation Note: ${district.data_limitation_notes}` : ' Hydro-meteorological risk is computed deterministically using standard IMD classification curves and regional basin geography.'}
                </p>
                <div className="text-[11px] text-amber-800 font-mono mt-1">
                  Provenance Source: {district.data_provenance}
                </div>
              </div>
            </div>
          )}

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-500 font-medium block">Flood Risk Score</span>
              <span className="text-2xl font-black text-slate-900">{district.flood_risk_score} <span className="text-xs text-slate-500 font-normal">/ 100</span></span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Category: {district.risk_category}</span>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium block">
                  {district.is_simulated ? 'Rainfall (Simulated)' : 'Rainfall (Live Telemetry)'}
                </span>
                {district.rainfall_freshness && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                    district.rainfall_freshness === 'FRESH'
                      ? 'bg-emerald-100 text-emerald-800'
                      : district.rainfall_freshness === 'AGING'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-slate-200 text-slate-700'
                  }`}>
                    {district.rainfall_freshness}
                  </span>
                )}
              </div>
              <span className="text-2xl font-black text-blue-600">{district.rainfall_mm_24h} <span className="text-xs text-slate-500 font-normal">mm (24h)</span></span>
              <span className="text-[10px] text-slate-500 block mt-0.5 truncate" title={district.rainfall_source}>
                Source: {district.rainfall_source ? district.rainfall_source.slice(0, 24) + '...' : 'Simulation'}
              </span>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-500 font-medium block">Data Completeness</span>
              <span className="text-2xl font-black text-slate-800">{district.risk_data_completeness ?? 80}%</span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Confidence: {district.risk_confidence || 'Medium'}</span>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-500 font-medium block">Citizen Ground Reports</span>
              <span className="text-2xl font-black text-slate-800">{district.citizen_reports_count}</span>
              <span className="text-[10px] text-amber-600 block mt-0.5">{district.citizen_reports_high_severity} High/Critical ({district.citizen_reports_24h ?? district.citizen_reports_count} in 24h)</span>
            </div>
          </div>

          {/* Risk Factor Contribution Chart & Breakdown */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
            <div>
              <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                ⚖️ Mathematical Risk Factor Contributions (Sum = {district.flood_risk_score}/100)
              </h3>
              <p className="text-xs text-slate-500">
                Exact breakdown calculated by the deterministic formula without discrepancy
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={contributionData} layout="vertical" margin={{ top: 5, right: 20, left: 30, bottom: 5 }}>
                    <XAxis type="number" domain={[0, 40]} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(val: number) => [`${val} points`, 'Score Contribution']} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {contributionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-2 text-xs text-slate-700 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div className="flex justify-between items-center pb-1.5 border-b border-slate-200">
                  <span className="font-medium text-blue-700">🌧️ Rainfall Intensity (35%):</span>
                  <span className="font-bold text-slate-900">{district.contributions?.rainfall} pts (Raw Score: {district.rainfall_score}/100)</span>
                </div>
                <div className="flex justify-between items-center pb-1.5 border-b border-slate-200">
                  <span className="font-medium text-purple-700">📜 Flood History (25%):</span>
                  <span className="font-bold text-slate-900">{district.contributions?.flood_history} pts (Raw Score: {district.flood_history_score}/100)</span>
                </div>
                <div className="flex justify-between items-center pb-1.5 border-b border-slate-200">
                  <span className="font-medium text-cyan-700">📍 Topography / Location (15%):</span>
                  <span className="font-bold text-slate-900">{district.contributions?.location_risk} pts (Raw Score: {district.location_risk_score}/100)</span>
                </div>
                <div className="flex justify-between items-center pb-1.5 border-b border-slate-200">
                  <span className="font-medium text-amber-700">👥 Citizen Reports (15%):</span>
                  <span className="font-bold text-slate-900">{district.contributions?.citizen_reports} pts (Raw Score: {district.citizen_report_score}/100)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-medium text-pink-700">🚧 Drainage Vulnerability (10%):</span>
                  <span className="font-bold text-slate-900">{district.contributions?.drainage_vulnerability} pts (Raw Score: {district.drainage_vulnerability_score}/100)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Alert Intelligence & Decision Support Section (Phase F) */}
          {district.alert_intelligence && (
            <div className={`rounded-xl p-5 space-y-4 border shadow-sm ${
              district.alert_intelligence.alert_level === 'CRITICAL' ? 'bg-rose-50/80 border-rose-300' :
              district.alert_intelligence.alert_level === 'HIGH' ? 'bg-orange-50/80 border-orange-300' :
              district.alert_intelligence.alert_level === 'ELEVATED' ? 'bg-amber-50/80 border-amber-300' :
              district.alert_intelligence.alert_level === 'WATCH' ? 'bg-blue-50/80 border-blue-300' :
              'bg-emerald-50/80 border-emerald-300'
            }`}>
              {/* Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <ShieldAlert className={`w-5 h-5 ${
                    district.alert_intelligence.alert_level === 'CRITICAL' ? 'text-rose-600' :
                    district.alert_intelligence.alert_level === 'HIGH' ? 'text-orange-600' :
                    district.alert_intelligence.alert_level === 'ELEVATED' ? 'text-amber-600' :
                    district.alert_intelligence.alert_level === 'WATCH' ? 'text-blue-600' : 'text-emerald-600'
                  }`} />
                  <div>
                    <span className="font-bold text-slate-900 text-sm block">
                      Alert Intelligence & Decision Support ({district.district})
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium">
                      Primary Type: {district.alert_intelligence.primary_alert_type}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-md text-xs font-black uppercase tracking-wide text-white shadow-sm ${
                    district.alert_intelligence.alert_level === 'CRITICAL' ? 'bg-rose-600' :
                    district.alert_intelligence.alert_level === 'HIGH' ? 'bg-orange-600' :
                    district.alert_intelligence.alert_level === 'ELEVATED' ? 'bg-amber-500 text-slate-950' :
                    district.alert_intelligence.alert_level === 'WATCH' ? 'bg-blue-600' : 'bg-emerald-600'
                  }`}>
                    {district.alert_intelligence.alert_level}
                  </span>

                  {/* Language Toggle */}
                  <div className="flex items-center bg-white border border-slate-300 rounded-lg p-0.5 shadow-2xs">
                    <button
                      onClick={() => setAlertLang('en')}
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${
                        alertLang === 'en' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      English
                    </button>
                    <button
                      onClick={() => setAlertLang('te')}
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${
                        alertLang === 'te' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      తెలుగు
                    </button>
                    <button
                      onClick={() => setAlertLang('hi')}
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${
                        alertLang === 'hi' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      हिन्दी
                    </button>
                  </div>
                </div>
              </div>

              {/* Headline Banner */}
              <div className="bg-white/90 p-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-900 shadow-2xs">
                {district.alert_intelligence.headline}
              </div>

              {/* Telemetry Metrics Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-white/70 p-3 rounded-lg border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px]">CURRENT RISK</span>
                  <span className="font-bold text-slate-900 text-sm">{district.alert_intelligence.current_risk}/100</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">PROJECTED PEAK</span>
                  <span className="font-bold text-slate-900 text-sm">
                    {district.alert_intelligence.projected_risk}/100 <span className="text-[10px] text-blue-600 font-normal">({district.alert_intelligence.peak_horizon})</span>
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">RISK TRAJECTORY</span>
                  <div className="flex items-center gap-1 mt-0.5">
                    {district.alert_intelligence.trend === 'RISING' ? (
                      <TrendingUp className="w-3.5 h-3.5 text-rose-600" />
                    ) : district.alert_intelligence.trend === 'IMPROVING' ? (
                      <TrendingDown className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Minus className="w-3.5 h-3.5 text-slate-500" />
                    )}
                    <span className="font-bold text-slate-900 text-xs">
                      {district.alert_intelligence.risk_delta > 0 ? `+${district.alert_intelligence.risk_delta} pts` : `${district.alert_intelligence.risk_delta} pts`}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">CONFIDENCE</span>
                  <span className="font-bold text-slate-900 text-sm">
                    {district.alert_intelligence.confidence} ({Math.round(district.alert_intelligence.confidence_score * 100)}%)
                  </span>
                </div>
              </div>

              {/* Multilingual Advisory Card */}
              {alertLang === 'en' ? (
                <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">{district.alert_intelligence.advisories.english.title}</h4>
                    <p className="text-xs text-slate-700 leading-relaxed mt-1">
                      {district.alert_intelligence.advisories.english.situation_summary}
                    </p>
                  </div>

                  <div>
                    <h5 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Target className="w-3.5 h-3.5 text-blue-600" />
                      Trigger Rationale:
                    </h5>
                    <ul className="space-y-1 text-xs text-slate-600 list-disc list-inside bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                      {district.alert_intelligence.trigger_reasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h5 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      Recommended Public Safety Precautions:
                    </h5>
                    <div className="space-y-1.5">
                      {district.alert_intelligence.advisories.english.recommended_precautions.map((p, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs bg-slate-50 p-2 rounded-lg border border-slate-100 text-slate-800">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          <span>{p}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : alertLang === 'te' ? (
                <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3 font-sans">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">{district.alert_intelligence.advisories.telugu.title}</h4>
                    <p className="text-xs text-slate-700 leading-relaxed mt-1">
                      {district.alert_intelligence.advisories.telugu.situation_summary}
                    </p>
                  </div>

                  <div>
                    <h5 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Target className="w-3.5 h-3.5 text-blue-600" />
                      హెచ్చరిక ప్రేరేపించిన అంశాలు:
                    </h5>
                    <div className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                      {district.alert_intelligence.advisories.telugu.why_triggered}
                    </div>
                  </div>

                  <div>
                    <h5 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      ప్రజా భద్రతా సూచనలు:
                    </h5>
                    <div className="space-y-1.5">
                      {district.alert_intelligence.advisories.telugu.recommended_precautions.map((p, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs bg-slate-50 p-2 rounded-lg border border-slate-100 text-slate-800">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          <span>{p}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3 font-sans">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">
                      {district.alert_intelligence.advisories.hindi?.title || district.alert_intelligence.advisories.english.title}
                    </h4>
                    <p className="text-xs text-slate-700 leading-relaxed mt-1">
                      {district.alert_intelligence.advisories.hindi?.situation_summary || district.alert_intelligence.advisories.english.situation_summary}
                    </p>
                  </div>

                  <div>
                    <h5 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Target className="w-3.5 h-3.5 text-blue-600" />
                      चेतावनी का मुख्य कारण (Trigger Rationale):
                    </h5>
                    <div className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                      {district.alert_intelligence.advisories.hindi?.why_triggered || district.alert_intelligence.trigger_reasons.join('. ')}
                    </div>
                  </div>

                  <div>
                    <h5 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      सार्वजनिक सुरक्षा एवं बचाव निर्देश:
                    </h5>
                    <div className="space-y-1.5">
                      {(district.alert_intelligence.advisories.hindi?.recommended_precautions || district.alert_intelligence.advisories.english.recommended_precautions).map((p, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs bg-slate-50 p-2 rounded-lg border border-slate-100 text-slate-800">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          <span>{p}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Signals Row (Basin Surge + Citizen Surge) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="bg-white/80 p-2.5 rounded-lg border border-slate-200 flex items-start gap-2">
                  <Droplets className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-800 block text-[11px]">Basin Propagation Signal</span>
                    <span className="text-slate-600 text-[11px]">{district.alert_intelligence.basin_signal.summary}</span>
                  </div>
                </div>

                <div className="bg-white/80 p-2.5 rounded-lg border border-slate-200 flex items-start gap-2">
                  <Users className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-800 block text-[11px]">Citizen Ground Surge Signal</span>
                    <span className="text-slate-600 text-[11px]">{district.alert_intelligence.citizen_signal.summary}</span>
                  </div>
                </div>
              </div>

              {/* Governance & Disclaimer */}
              <div className="text-[11px] text-slate-500 bg-white/50 p-2.5 rounded-lg border border-slate-200">
                <span className="font-semibold text-slate-700">Governance Notice: </span>
                <span>{district.alert_intelligence.advisories.english.authority_disclaimer}</span>
              </div>
            </div>
          )}

          {/* Multi-Signal Situation Intelligence & Decision Support (Phase D3) */}
          {district.situation_summary && (
            <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-5 space-y-4 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-200 pb-2.5">
                <div className="flex items-center gap-2 text-indigo-950 font-bold text-sm">
                  <Radio className="w-4 h-4 text-indigo-600 animate-pulse" />
                  <span>Multi-Signal Situation Intelligence ({district.district})</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-black ${
                    district.situation_summary.operationalSituation === 'CRITICAL_INFORMATIONAL' ? 'bg-red-600 text-white' :
                    district.situation_summary.operationalSituation === 'HIGH_CONCERN' ? 'bg-rose-100 text-rose-800 border border-rose-300' :
                    district.situation_summary.operationalSituation === 'ELEVATED_ATTENTION' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                    district.situation_summary.operationalSituation === 'MONITORING' ? 'bg-blue-100 text-blue-800 border border-blue-300' :
                    'bg-slate-100 text-slate-700 border border-slate-300'
                  }`}>
                    {district.situation_summary.operationalSituation.replace(/_/g, ' ')}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold text-[10px]">
                    CONFIDENCE: {district.situation_summary.dataConfidence} ({Math.round(district.situation_summary.dataConfidenceScore * 100)}%)
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[10px]">
                    COVERAGE: {district.situation_summary.signalCoverage.available}/{district.situation_summary.signalCoverage.total} Domains
                  </span>
                </div>
              </div>

              {/* Signal Coverage Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]">
                <div className={`p-2 rounded-lg border flex items-center justify-between ${
                  district.situation_summary.signalCoverage.signals.rainfall ? 'bg-white border-blue-200 text-blue-900' : 'bg-slate-50 border-slate-200 text-slate-400'
                }`}>
                  <span className="font-semibold">🌧️ Rainfall</span>
                  <span className="font-mono text-[10px] font-bold">{district.situation_summary.freshnessSummary.rainfall}</span>
                </div>
                <div className={`p-2 rounded-lg border flex items-center justify-between ${
                  district.situation_summary.signalCoverage.signals.hydrology ? 'bg-white border-cyan-200 text-cyan-900' : 'bg-slate-50 border-slate-200 text-slate-400'
                }`}>
                  <span className="font-semibold">🌊 Hydrology</span>
                  <span className="font-mono text-[10px] font-bold">{district.situation_summary.freshnessSummary.hydrology}</span>
                </div>
                <div className={`p-2 rounded-lg border flex items-center justify-between ${
                  district.situation_summary.signalCoverage.signals.citizen ? 'bg-white border-amber-200 text-amber-900' : 'bg-slate-50 border-slate-200 text-slate-400'
                }`}>
                  <span className="font-semibold">👥 Citizen</span>
                  <span className="font-mono text-[10px] font-bold">{district.situation_summary.freshnessSummary.citizen}</span>
                </div>
                <div className="p-2 rounded-lg border bg-white border-purple-200 text-purple-900 flex items-center justify-between">
                  <span className="font-semibold">📜 History</span>
                  <span className="font-mono text-[10px] font-bold">VERIFIED</span>
                </div>
                <div className="p-2 rounded-lg border bg-white border-pink-200 text-pink-900 flex items-center justify-between">
                  <span className="font-semibold">🚧 Drainage</span>
                  <span className="font-mono text-[10px] font-bold">VERIFIED</span>
                </div>
              </div>

              {/* Primary Risk Drivers & Supporting Signals */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-white p-3 rounded-lg border border-indigo-100 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900">
                    <Target className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Primary Risk Drivers ({district.situation_summary.primaryDrivers.length})</span>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    {district.situation_summary.primaryDrivers.map((driver, i) => (
                      <div key={i} className="p-2 rounded bg-indigo-50/50 border border-indigo-100/70">
                        <div className="flex justify-between items-center text-[11px] font-bold text-slate-800">
                          <span>{driver.signal}</span>
                          <span className="text-[9px] px-1 py-0.2 rounded bg-indigo-200 text-indigo-900">{driver.source}</span>
                        </div>
                        <p className="text-slate-600 text-[11px] mt-0.5">{driver.evidence}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <ArrowUpRight className="w-3.5 h-3.5 text-slate-600" />
                    <span>Supporting Signals ({district.situation_summary.supportingSignals.length})</span>
                  </div>
                  <div className="space-y-1.5 text-xs max-h-36 overflow-y-auto pr-1">
                    {district.situation_summary.supportingSignals.length > 0 ? (
                      district.situation_summary.supportingSignals.map((sig, i) => (
                        <div key={i} className="p-1.5 rounded bg-slate-50 border border-slate-200">
                          <div className="flex justify-between items-center text-[10px] font-semibold text-slate-700">
                            <span>{sig.signal}</span>
                            <span className="text-[9px] text-slate-500">{sig.source}</span>
                          </div>
                          <p className="text-slate-500 text-[10px]">{sig.evidence}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-slate-400 text-xs italic">No additional supporting signals flagged.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Recommended Operational Actions */}
              {district.situation_summary.recommendedActions.length > 0 && (
                <div className="bg-white p-3 rounded-lg border border-indigo-100 space-y-1.5">
                  <div className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Recommended Decision-Support Monitoring Actions</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-xs text-slate-700">
                    {district.situation_summary.recommendedActions.map((act, i) => (
                      <li key={i} className="leading-snug">{act}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Data Limitations Disclaimer */}
              {district.situation_summary.dataLimitations.length > 0 && (
                <div className="flex items-start gap-2 bg-amber-50/70 border border-amber-200 text-amber-900 rounded-lg p-2.5 text-[11px]">
                  <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Operational Context & Prototype Limitations: </span>
                    <span>{district.situation_summary.dataLimitations.join(' • ')}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Virtual IoT Sensor Mesh Section (Phase H) */}
          {districtIotDevices.length > 0 && (
            <div className="bg-indigo-50/60 border border-indigo-200 rounded-xl p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-200 pb-2.5">
                <div className="flex items-center gap-2 text-indigo-950 font-bold text-sm">
                  <Radio className="w-4 h-4 text-indigo-600 animate-pulse" />
                  <span>Virtual IoT Sensor Telemetry Nodes ({district.district})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold text-[10px] border border-indigo-200">
                    ⚡ VIRTUAL IOT DEMONSTRATION
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                    {districtIotDevices.length} Connected Nodes
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {districtIotDevices.map(dev => (
                  <div key={dev.device_id} className="bg-white p-3 rounded-lg border border-indigo-100 shadow-2xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold font-mono text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                        {dev.device_id}
                      </span>
                      <span className="text-[9px] font-bold text-emerald-600 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        {dev.status}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-slate-800 truncate">{dev.device_name}</div>
                    <div className="flex items-baseline gap-1.5 py-1">
                      <span className="text-xl font-black text-indigo-900">{dev.current_value}</span>
                      <span className="text-xs font-bold text-slate-600">{dev.unit}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 flex justify-between border-t border-slate-100 pt-1">
                      <span>🔋 {dev.battery_level}%</span>
                      <span>📶 {dev.signal_strength}%</span>
                      <span>{dev.sensor_type}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hydrological Telemetry & River Gauge Section (Phase D2) */}
          <div className="bg-cyan-50/60 border border-cyan-200 rounded-xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cyan-200 pb-2.5">
              <div className="flex items-center gap-2 text-cyan-950 font-bold text-sm">
                <Waves className="w-4 h-4 text-cyan-700" />
                <span>Hydrological & River Gauge Telemetry ({district.district})</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {district.hydrological_summary ? (
                  <>
                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                      district.hydrological_summary.dominant_status === 'CRITICAL' ? 'bg-red-100 text-red-700 border border-red-200' :
                      district.hydrological_summary.dominant_status === 'WARNING' ? 'bg-orange-100 text-orange-700 border border-orange-200' :
                      district.hydrological_summary.dominant_status === 'WATCH' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                      'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    }`}>
                      {district.hydrological_summary.dominant_status} STATUS
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                      district.hydrological_summary.dominant_trend === 'RISING' ? 'bg-rose-100 text-rose-800' :
                      district.hydrological_summary.dominant_trend === 'FALLING' ? 'bg-blue-100 text-blue-800' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      Trend: {district.hydrological_summary.dominant_trend}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-cyan-100 text-cyan-800 font-bold text-[10px]">
                      {district.hydrological_summary.data_mode} MODE
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-slate-500">Telemetry Synchronizing</span>
                )}
              </div>
            </div>

            <p className="text-xs text-slate-700 leading-relaxed">
              {district.hydrological_summary?.hydrological_context_summary ||
                `Hydrological surveillance across ${district.river_basin} catchments.`}
            </p>

            {/* Anomaly Alerts if any */}
            {district.hydrological_summary?.anomalies && district.hydrological_summary.anomalies.length > 0 && (
              <div className="space-y-1.5 pt-1">
                {district.hydrological_summary.anomalies.map((anom, idx) => (
                  <div key={idx} className="flex items-start gap-2 bg-amber-100/80 border border-amber-300 text-amber-900 rounded-lg p-2 text-xs">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">{anom.type.replace(/_/g, ' ')}: </span>
                      <span>{anom.description}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Active Gauging Stations List */}
            {district.hydrological_summary?.latest_observations && district.hydrological_summary.latest_observations.length > 0 ? (
              <div className="space-y-2 pt-1">
                <div className="text-[11px] font-semibold text-cyan-900 uppercase tracking-wide">
                  Active Monitoring Stations ({district.hydrological_summary.latest_observations.length})
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {district.hydrological_summary.latest_observations.map((obs) => (
                    <div key={obs.station_id} className="bg-white p-3 rounded-lg border border-cyan-100 shadow-2xs space-y-1 text-xs">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-bold text-slate-900 truncate">{obs.station_name}</div>
                          <div className="text-[10px] text-slate-500">{obs.water_body_name} ({obs.water_body_type})</div>
                        </div>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          obs.status === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                          obs.status === 'WARNING' ? 'bg-orange-100 text-orange-700' :
                          obs.status === 'WATCH' ? 'bg-amber-100 text-amber-800' :
                          'bg-emerald-100 text-emerald-800'
                        }`}>
                          {obs.status}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between pt-1 border-t border-slate-100">
                        <span className="text-[11px] text-slate-500">Measured Value:</span>
                        <span className="font-mono font-bold text-cyan-900 text-sm">
                          {obs.value} {obs.unit}
                        </span>
                      </div>
                      {(obs.warning_threshold !== undefined || obs.danger_threshold !== undefined) && (
                        <div className="flex justify-between text-[10px] text-slate-500 pt-0.5">
                          <span>Warn: {obs.warning_threshold ?? 'N/A'} {obs.unit}</span>
                          <span>Danger: {obs.danger_threshold ?? 'N/A'} {obs.unit}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center text-[9px] text-slate-400 pt-1">
                        <span>Mode: {obs.data_mode}</span>
                        <span>{obs.freshness}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500 italic bg-white/70 p-3 rounded-lg border border-cyan-100">
                No dedicated river gauge or reservoir stations currently mapped in this district boundary. General catchment run-off model active.
              </div>
            )}
          </div>

          {/* Predictive Flood Risk Projections & Forecast Intelligence (Phase E) */}
          {district.forecast_timeline && (
            <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-slate-100 rounded-xl p-5 space-y-4 shadow-lg border border-indigo-800/60">
              {/* Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-cyan-400 animate-pulse" />
                  <span className="font-bold text-white text-sm">
                    Predictive Flood Risk Outlook & Timeline ({district.district})
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-black ${
                    district.forecast_timeline.overallForecastOutlook === 'CRITICAL_PROJECTION' ? 'bg-red-600 text-white' :
                    district.forecast_timeline.overallForecastOutlook === 'HIGH_PROJECTION' ? 'bg-orange-500 text-white' :
                    district.forecast_timeline.overallForecastOutlook === 'ELEVATING_RISK' ? 'bg-amber-500 text-slate-950' :
                    district.forecast_timeline.overallForecastOutlook === 'WATCH_FOR_ESCALATION' ? 'bg-yellow-400 text-slate-950' :
                    district.forecast_timeline.overallForecastOutlook === 'UNCERTAIN' ? 'bg-slate-700 text-slate-200' :
                    'bg-emerald-600 text-white'
                  }`}>
                    {district.forecast_timeline.overallForecastOutlook.replace(/_/g, ' ')}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-1 ${
                    district.forecast_timeline.dominantTrend === 'RISING' ? 'bg-rose-500/30 text-rose-300 border border-rose-500/40' :
                    district.forecast_timeline.dominantTrend === 'IMPROVING' ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/40' :
                    'bg-slate-700 text-slate-300'
                  }`}>
                    {district.forecast_timeline.dominantTrend === 'RISING' ? <TrendingUp className="w-3 h-3" /> :
                     district.forecast_timeline.dominantTrend === 'IMPROVING' ? <TrendingDown className="w-3 h-3" /> :
                     <Minus className="w-3 h-3" />}
                    {district.forecast_timeline.dominantTrend} TREND
                  </span>
                  <span className="px-2 py-0.5 rounded bg-indigo-900/80 text-cyan-300 font-bold text-[10px] border border-cyan-500/30">
                    CONFIDENCE: {district.forecast_timeline.dataConfidence}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-medium text-[10px]">
                    {district.forecast_timeline.dataMode.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>

              {/* Multi-Horizon Stepper Cards (NOW -> +3H -> +6H -> +12H -> +24H) */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                {/* NOW */}
                <div className="bg-slate-800/80 border border-slate-700/80 rounded-lg p-2.5 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center text-[11px] font-semibold text-slate-300">
                      <span>NOW</span>
                      <span className="text-[9px] px-1 rounded bg-slate-700 text-slate-300">Live</span>
                    </div>
                    <div className="mt-1 text-xl font-black text-white font-mono">
                      {district.flood_risk_score}
                      <span className="text-xs text-slate-400 font-normal">/100</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5 font-medium">
                      {district.risk_category} Risk
                    </div>
                  </div>
                  <div className="mt-2 text-[10px] text-slate-400 border-t border-slate-700/50 pt-1">
                    Rain: {district.rainfall_mm_24h} mm
                  </div>
                </div>

                {/* +3H */}
                {district.forecast_timeline.timeline.h3 && (
                  <div className={`border rounded-lg p-2.5 flex flex-col justify-between ${
                    district.forecast_timeline.timeline.h3.projectedRiskScore >= 70 ? 'bg-red-950/40 border-red-700/50' :
                    district.forecast_timeline.timeline.h3.projectedRiskScore >= 50 ? 'bg-orange-950/40 border-orange-700/50' :
                    'bg-slate-800/80 border-slate-700/80'
                  }`}>
                    <div>
                      <div className="flex justify-between items-center text-[11px] font-semibold text-cyan-300">
                        <span>+3 HOURS</span>
                        <span className={`text-[9px] font-bold ${
                          district.forecast_timeline.timeline.h3.projectedRiskChange > 0 ? 'text-rose-400' :
                          district.forecast_timeline.timeline.h3.projectedRiskChange < 0 ? 'text-emerald-400' : 'text-slate-400'
                        }`}>
                          {district.forecast_timeline.timeline.h3.projectedRiskChange > 0 ? `+${district.forecast_timeline.timeline.h3.projectedRiskChange}` :
                           `${district.forecast_timeline.timeline.h3.projectedRiskChange}`}
                        </span>
                      </div>
                      <div className="mt-1 text-xl font-black text-white font-mono">
                        {district.forecast_timeline.timeline.h3.projectedRiskScore}
                        <span className="text-xs text-slate-400 font-normal">/100</span>
                      </div>
                      <div className="text-[10px] text-slate-300 mt-0.5">
                        {district.forecast_timeline.timeline.h3.riskTrend}
                      </div>
                    </div>
                    <div className="mt-2 text-[10px] text-slate-400 border-t border-slate-700/50 pt-1">
                      Rain: {district.forecast_timeline.timeline.h3.projectedRainfall_mm} mm
                    </div>
                  </div>
                )}

                {/* +6H */}
                {district.forecast_timeline.timeline.h6 && (
                  <div className={`border rounded-lg p-2.5 flex flex-col justify-between ring-1 ring-cyan-400/30 ${
                    district.forecast_timeline.timeline.h6.projectedRiskScore >= 70 ? 'bg-red-950/50 border-red-600/70' :
                    district.forecast_timeline.timeline.h6.projectedRiskScore >= 50 ? 'bg-orange-950/50 border-orange-600/70' :
                    'bg-slate-800/90 border-slate-600'
                  }`}>
                    <div>
                      <div className="flex justify-between items-center text-[11px] font-bold text-cyan-300">
                        <span>+6 HOURS</span>
                        <span className={`text-[9px] font-bold ${
                          district.forecast_timeline.timeline.h6.projectedRiskChange > 0 ? 'text-rose-400' :
                          district.forecast_timeline.timeline.h6.projectedRiskChange < 0 ? 'text-emerald-400' : 'text-slate-400'
                        }`}>
                          {district.forecast_timeline.timeline.h6.projectedRiskChange > 0 ? `+${district.forecast_timeline.timeline.h6.projectedRiskChange}` :
                           `${district.forecast_timeline.timeline.h6.projectedRiskChange}`}
                        </span>
                      </div>
                      <div className="mt-1 text-xl font-black text-cyan-300 font-mono">
                        {district.forecast_timeline.timeline.h6.projectedRiskScore}
                        <span className="text-xs text-slate-400 font-normal">/100</span>
                      </div>
                      <div className="text-[10px] text-slate-200 mt-0.5 font-medium">
                        {district.forecast_timeline.timeline.h6.riskTrend}
                      </div>
                    </div>
                    <div className="mt-2 text-[10px] text-slate-300 border-t border-slate-700/50 pt-1">
                      Rain: {district.forecast_timeline.timeline.h6.projectedRainfall_mm} mm
                    </div>
                  </div>
                )}

                {/* +12H */}
                {district.forecast_timeline.timeline.h12 && (
                  <div className={`border rounded-lg p-2.5 flex flex-col justify-between ${
                    district.forecast_timeline.timeline.h12.projectedRiskScore >= 70 ? 'bg-red-950/40 border-red-700/50' :
                    district.forecast_timeline.timeline.h12.projectedRiskScore >= 50 ? 'bg-orange-950/40 border-orange-700/50' :
                    'bg-slate-800/80 border-slate-700/80'
                  }`}>
                    <div>
                      <div className="flex justify-between items-center text-[11px] font-semibold text-cyan-300">
                        <span>+12 HOURS</span>
                        <span className={`text-[9px] font-bold ${
                          district.forecast_timeline.timeline.h12.projectedRiskChange > 0 ? 'text-rose-400' :
                          district.forecast_timeline.timeline.h12.projectedRiskChange < 0 ? 'text-emerald-400' : 'text-slate-400'
                        }`}>
                          {district.forecast_timeline.timeline.h12.projectedRiskChange > 0 ? `+${district.forecast_timeline.timeline.h12.projectedRiskChange}` :
                           `${district.forecast_timeline.timeline.h12.projectedRiskChange}`}
                        </span>
                      </div>
                      <div className="mt-1 text-xl font-black text-white font-mono">
                        {district.forecast_timeline.timeline.h12.projectedRiskScore}
                        <span className="text-xs text-slate-400 font-normal">/100</span>
                      </div>
                      <div className="text-[10px] text-slate-300 mt-0.5">
                        {district.forecast_timeline.timeline.h12.riskTrend}
                      </div>
                    </div>
                    <div className="mt-2 text-[10px] text-slate-400 border-t border-slate-700/50 pt-1">
                      Rain: {district.forecast_timeline.timeline.h12.projectedRainfall_mm} mm
                    </div>
                  </div>
                )}

                {/* +24H */}
                {district.forecast_timeline.timeline.h24 && (
                  <div className={`border rounded-lg p-2.5 flex flex-col justify-between ${
                    district.forecast_timeline.timeline.h24.projectedRiskScore >= 70 ? 'bg-red-950/40 border-red-700/50' :
                    district.forecast_timeline.timeline.h24.projectedRiskScore >= 50 ? 'bg-orange-950/40 border-orange-700/50' :
                    'bg-slate-800/80 border-slate-700/80'
                  }`}>
                    <div>
                      <div className="flex justify-between items-center text-[11px] font-semibold text-cyan-300">
                        <span>+24 HOURS</span>
                        <span className={`text-[9px] font-bold ${
                          district.forecast_timeline.timeline.h24.projectedRiskChange > 0 ? 'text-rose-400' :
                          district.forecast_timeline.timeline.h24.projectedRiskChange < 0 ? 'text-emerald-400' : 'text-slate-400'
                        }`}>
                          {district.forecast_timeline.timeline.h24.projectedRiskChange > 0 ? `+${district.forecast_timeline.timeline.h24.projectedRiskChange}` :
                           `${district.forecast_timeline.timeline.h24.projectedRiskChange}`}
                        </span>
                      </div>
                      <div className="mt-1 text-xl font-black text-white font-mono">
                        {district.forecast_timeline.timeline.h24.projectedRiskScore}
                        <span className="text-xs text-slate-400 font-normal">/100</span>
                      </div>
                      <div className="text-[10px] text-slate-300 mt-0.5">
                        {district.forecast_timeline.timeline.h24.riskTrend}
                      </div>
                    </div>
                    <div className="mt-2 text-[10px] text-slate-400 border-t border-slate-700/50 pt-1">
                      Rain: {district.forecast_timeline.timeline.h24.projectedRainfall_mm} mm
                    </div>
                  </div>
                )}
              </div>

              {/* Upstream Hydrological Basin Propagation Card */}
              {district.forecast_timeline.basinInfluence && (
                <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-cyan-300">
                    <div className="flex items-center gap-1.5">
                      <GitMerge className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Upstream Basin Cascading & Inflow Tracking</span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-700 text-slate-300 font-mono">
                      Surge Impact: +{district.forecast_timeline.basinInfluence.total_projected_basin_surge.toFixed(1)} pts
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    {district.forecast_timeline.basinInfluence.basin_summary_text}
                  </p>

                  {district.forecast_timeline.basinInfluence.active_upstream_threats && district.forecast_timeline.basinInfluence.active_upstream_threats.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      {district.forecast_timeline.basinInfluence.active_upstream_threats.map((threat, idx) => (
                        <div key={idx} className="p-2 rounded bg-indigo-950/60 border border-indigo-700/60 text-xs flex items-start justify-between gap-2">
                          <div>
                            <div className="font-bold text-cyan-200 text-[11px]">
                              {threat.upstream_district_name} → {threat.water_body_name} (ETA ~{threat.travel_window_hours}h)
                            </div>
                            <p className="text-slate-300 text-[10px] mt-0.5">{threat.evidence}</p>
                          </div>
                          <span className="shrink-0 px-1.5 py-0.5 rounded bg-rose-900/60 text-rose-300 font-mono text-[10px] font-bold border border-rose-700/50">
                            +{threat.projected_downstream_impact_score.toFixed(1)} pts
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Primary Projected Risk Drivers */}
              {district.forecast_timeline.timeline.h6?.primaryProjectedDrivers && district.forecast_timeline.timeline.h6.primaryProjectedDrivers.length > 0 && (
                <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3 space-y-2">
                  <div className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Primary Forecast Drivers (+6H Horizon)</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                    {district.forecast_timeline.timeline.h6.primaryProjectedDrivers.map((driver, idx) => (
                      <div key={idx} className="p-2 rounded bg-slate-900/80 border border-slate-700/80">
                        <div className="flex justify-between items-center text-[11px] font-bold text-cyan-200">
                          <span>{driver.driverName}</span>
                          <span className="text-[9px] px-1 py-0.2 rounded bg-slate-700 text-slate-300 font-mono">{driver.scoreOrSeverity}</span>
                        </div>
                        <p className="text-slate-300 text-[10px] mt-1">{driver.evidence}</p>
                        <div className="flex justify-between items-center text-[9px] text-slate-400 mt-1 pt-1 border-t border-slate-800">
                          <span>Source: {driver.source}</span>
                          <span>Mode: {driver.dataMode}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Informational Disclaimer Banner */}
              <div className="flex items-start gap-2 bg-slate-800/40 border border-slate-700/60 rounded-lg p-2.5 text-[11px] text-slate-400">
                <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-300">Decision Support Model Notice: </span>
                  <span>{district.forecast_timeline.disclaimer} Confidence explanation: {district.forecast_timeline.confidenceReason}</span>
                </div>
              </div>
            </div>
          )}

          {/* Citizen Ground Telemetry & Reports Section */}
          <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-amber-200 pb-2">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                <Users className="w-4 h-4 text-amber-700" />
                <span>Crowdsourced Citizen Telemetry ({district.district})</span>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-amber-200 text-amber-900 text-xs font-bold font-mono">
                {district.contributions?.citizen_reports} / 15.0 max pts
              </span>
            </div>

            <p className="text-xs text-slate-700 leading-relaxed">
              {district.citizen_explainability || `${district.citizen_reports_count} verified citizen reports recorded with recency and severity weighting.`}
            </p>

            {isLoadingReports ? (
              <div className="py-4 text-center text-xs text-slate-400">Loading ground reports...</div>
            ) : districtReports.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {districtReports.map((r) => (
                  <div key={r.id} className="bg-white p-3 rounded-lg border border-amber-100 text-xs space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-slate-900">{r.incident_type} {r.location_description ? `• ${r.location_description}` : ''}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        r.severity === 'Critical' ? 'bg-red-100 text-red-700' :
                        r.severity === 'High' ? 'bg-orange-100 text-orange-700' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {r.severity}
                      </span>
                    </div>
                    <p className="text-slate-600 text-[11px] italic">"{r.description}"</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-500 italic">No specific ground reports registered yet for this district.</div>
            )}
          </div>

          {/* AI Intelligence & Multilingual Advisory Section */}
          <div className="bg-slate-900 text-white rounded-xl p-5 sm:p-6 space-y-4 shadow-lg border border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-blue-400 font-bold text-sm">
                <Sparkles className="w-4 h-4" />
                <span>LLM Situation Intelligence & Bilingual Advisory</span>
              </div>
              <button
                onClick={() => fetchAIAdvisory(district.district)}
                disabled={isLoadingAI}
                className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all disabled:opacity-50"
              >
                {isLoadingAI ? 'Regenerating...' : 'Regenerate'}
              </button>
            </div>

            {isLoadingAI ? (
              <div className="py-8 flex flex-col items-center justify-center space-y-2 text-slate-400">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs">Synthesizing telemetry and generating bilingual advisory...</p>
              </div>
            ) : aiAdvisory ? (
              <div className="space-y-4 text-xs">
                {/* Bilingual Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-slate-800 p-3.5 rounded-lg border border-slate-700 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-blue-300 font-bold uppercase tracking-wider text-[11px]">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>English Public Advisory</span>
                    </div>
                    <p className="text-slate-200 leading-relaxed font-medium">{aiAdvisory.english_advisory}</p>
                  </div>

                  <div className="bg-slate-800 p-3.5 rounded-lg border border-amber-900/40 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-amber-300 font-bold uppercase tracking-wider text-[11px]">
                      <Languages className="w-3.5 h-3.5" />
                      <span>తెలుగు ప్రజా సలహా (Telugu Advisory)</span>
                    </div>
                    <p className="text-amber-100 leading-relaxed font-medium">{aiAdvisory.telugu_advisory}</p>
                  </div>
                </div>

                {/* Situation Summary & Why Risk is Computed */}
                <div className="bg-slate-800/60 p-3.5 rounded-lg border border-slate-700 space-y-2">
                  <h4 className="font-bold text-slate-300 text-xs">Situation Assessment:</h4>
                  <p className="text-slate-300 leading-relaxed">{aiAdvisory.situation_summary}</p>
                  <p className="text-slate-400 text-[11px] leading-relaxed pt-1 border-t border-slate-700/60">
                    <span className="font-semibold text-slate-300">Risk Explanation:</span> {aiAdvisory.explanation_of_risk}
                  </p>
                </div>

                {/* Recommended Actions */}
                <div className="bg-slate-800/60 p-3.5 rounded-lg border border-slate-700 space-y-2">
                  <h4 className="font-bold text-emerald-400 text-xs">Recommended Actions:</h4>
                  <ul className="space-y-1">
                    {aiAdvisory.recommended_actions?.map((act, i) => (
                      <li key={i} className="flex items-start gap-2 text-slate-300">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{act}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-200 p-4 flex items-center justify-between text-xs text-slate-500">
          <span>NeerDrishti Flood Intelligence Engine • Telangana 33 Districts</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-lg transition-colors"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
