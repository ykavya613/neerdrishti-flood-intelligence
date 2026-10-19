import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  Activity, 
  CloudRain, 
  Waves, 
  Users, 
  Layers, 
  CheckCircle2, 
  AlertTriangle, 
  Info, 
  Search, 
  Filter, 
  Sparkles, 
  Compass, 
  Clock, 
  ArrowUpRight,
  TrendingUp,
  RotateCcw,
  FileText,
  ShieldCheck,
  ChevronRight,
  Eye,
  Sliders
} from 'lucide-react';
import { DistrictStatus, DistrictSituation, OperationalSituationCategory, SimulationScenarioName } from '../types';
import { DistrictDetailModal } from './DistrictDetailModal';

interface SituationFusionViewProps {
  districts: DistrictStatus[];
  scenario: SimulationScenarioName;
  onScenarioChange: (scenario: SimulationScenarioName) => void;
  onRefresh?: () => void;
}

export const SituationFusionView: React.FC<SituationFusionViewProps> = ({
  districts,
  scenario,
  onScenarioChange,
  onRefresh,
}) => {
  const [situations, setSituations] = useState<DistrictSituation[]>([]);
  const [selectedDistrictId, setSelectedDistrictId] = useState<string>('hyderabad');
  const [selectedSituation, setSelectedSituation] = useState<DistrictSituation | null>(null);
  const [selectedStatusForModal, setSelectedStatusForModal] = useState<DistrictStatus | null>(null);
  const [situationFilter, setSituationFilter] = useState<string>('All');
  const [confidenceFilter, setConfidenceFilter] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Fetch situations from backend
  const fetchSituations = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/situation/districts');
      if (res.ok) {
        const data = await res.json();
        if (data.situations && Array.isArray(data.situations)) {
          setSituations(data.situations);
          // Set initial selected situation
          const initial = data.situations.find((s: DistrictSituation) => s.districtId === selectedDistrictId) || data.situations[0];
          if (initial) {
            setSelectedSituation(initial);
            setSelectedDistrictId(initial.districtId);
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch situations:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSituations();
  }, [scenario]);

  const handleSelectDistrict = (sit: DistrictSituation) => {
    setSelectedDistrictId(sit.districtId);
    setSelectedSituation(sit);
  };

  const getSituationBadge = (category?: OperationalSituationCategory | string) => {
    switch (category) {
      case 'CRITICAL_INFORMATIONAL':
        return (
          <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-bold text-xs border border-red-300 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
            CRITICAL INFORMATIONAL
          </span>
        );
      case 'HIGH_CONCERN':
        return (
          <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 font-bold text-xs border border-orange-300 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-orange-500" />
            HIGH CONCERN
          </span>
        );
      case 'ELEVATED_ATTENTION':
        return (
          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold text-xs border border-amber-300 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            ELEVATED ATTENTION
          </span>
        );
      case 'MONITORING':
        return (
          <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-medium text-xs border border-blue-200 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            MONITORING
          </span>
        );
      case 'NORMAL':
      default:
        return (
          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium text-xs border border-emerald-200 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            NORMAL
          </span>
        );
    }
  };

  const getConfidenceBadge = (level: string) => {
    switch (level) {
      case 'HIGH':
        return <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px] border border-emerald-200">HIGH CONFIDENCE</span>;
      case 'MEDIUM':
        return <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-bold text-[10px] border border-blue-200">MEDIUM CONFIDENCE</span>;
      case 'LOW':
        return <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[10px] border border-amber-200">LOW CONFIDENCE</span>;
      default:
        return <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-medium text-[10px] border border-slate-300">LIMITED DATA</span>;
    }
  };

  // Filtered situations
  const filteredSituations = situations.filter(s => {
    if (situationFilter !== 'All' && s.operationalSituation !== situationFilter) return false;
    if (confidenceFilter !== 'All' && s.dataConfidence !== confidenceFilter) return false;
    if (searchTerm && !s.districtName.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  // Operational Counts
  const criticalCount = situations.filter(s => s.operationalSituation === 'CRITICAL_INFORMATIONAL').length;
  const highConcernCount = situations.filter(s => s.operationalSituation === 'HIGH_CONCERN').length;
  const elevatedCount = situations.filter(s => s.operationalSituation === 'ELEVATED_ATTENTION').length;
  const monitoringCount = situations.filter(s => s.operationalSituation === 'MONITORING').length;
  const normalCount = situations.filter(s => s.operationalSituation === 'NORMAL').length;

  return (
    <div className="space-y-6">
      {/* Top Banner with Prototype Notice & Safety Rules */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-white shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-blue-600/30 border border-blue-500/40 text-blue-400">
                <Activity className="w-5 h-5" />
              </span>
              <h2 className="text-lg font-bold">Multi-Signal Situation Intelligence & Fusion Engine</h2>
              <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-xs font-semibold border border-indigo-500/40">
                Phase D3
              </span>
            </div>
            <p className="text-xs text-slate-300">
              Deterministic fusion of 5-factor composite risk, rainfall telemetry, hydrological stage, citizen ground alerts, and signal freshness across 33 Telangana districts.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Decision Support Only (Non-Warning System)</span>
            </div>
            <button
              onClick={() => { fetchSituations(); if (onRefresh) onRefresh(); }}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Refresh Signals
            </button>
          </div>
        </div>
      </div>

      {/* Operational Situation Summary Counter Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div 
          onClick={() => setSituationFilter(situationFilter === 'CRITICAL_INFORMATIONAL' ? 'All' : 'CRITICAL_INFORMATIONAL')}
          className={`cursor-pointer rounded-xl border p-3 transition-all ${
            situationFilter === 'CRITICAL_INFORMATIONAL'
              ? 'bg-red-50 border-red-400 ring-2 ring-red-400/20 shadow-sm'
              : 'bg-white border-slate-200 hover:border-red-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-red-700">
            <span>Critical Info</span>
            <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
          </div>
          <p className="text-2xl font-extrabold text-red-900 mt-1">{criticalCount}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">High multi-signal convergence</p>
        </div>

        <div 
          onClick={() => setSituationFilter(situationFilter === 'HIGH_CONCERN' ? 'All' : 'HIGH_CONCERN')}
          className={`cursor-pointer rounded-xl border p-3 transition-all ${
            situationFilter === 'HIGH_CONCERN'
              ? 'bg-orange-50 border-orange-400 ring-2 ring-orange-400/20 shadow-sm'
              : 'bg-white border-slate-200 hover:border-orange-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-orange-700">
            <span>High Concern</span>
            <span className="w-2 h-2 rounded-full bg-orange-500" />
          </div>
          <p className="text-2xl font-extrabold text-orange-900 mt-1">{highConcernCount}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">Warning river / intense rain</p>
        </div>

        <div 
          onClick={() => setSituationFilter(situationFilter === 'ELEVATED_ATTENTION' ? 'All' : 'ELEVATED_ATTENTION')}
          className={`cursor-pointer rounded-xl border p-3 transition-all ${
            situationFilter === 'ELEVATED_ATTENTION'
              ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-400/20 shadow-sm'
              : 'bg-white border-slate-200 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-amber-700">
            <span>Elevated Attention</span>
            <span className="w-2 h-2 rounded-full bg-amber-500" />
          </div>
          <p className="text-2xl font-extrabold text-amber-900 mt-1">{elevatedCount}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">Rising gauge / active reports</p>
        </div>

        <div 
          onClick={() => setSituationFilter(situationFilter === 'MONITORING' ? 'All' : 'MONITORING')}
          className={`cursor-pointer rounded-xl border p-3 transition-all ${
            situationFilter === 'MONITORING'
              ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-400/20 shadow-sm'
              : 'bg-white border-slate-200 hover:border-blue-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-blue-700">
            <span>Monitoring</span>
            <span className="w-2 h-2 rounded-full bg-blue-500" />
          </div>
          <p className="text-2xl font-extrabold text-blue-900 mt-1">{monitoringCount}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">Standard telemetry watch</p>
        </div>

        <div 
          onClick={() => setSituationFilter(situationFilter === 'NORMAL' ? 'All' : 'NORMAL')}
          className={`cursor-pointer rounded-xl border p-3 transition-all ${
            situationFilter === 'NORMAL'
              ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-400/20 shadow-sm'
              : 'bg-white border-slate-200 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-emerald-700">
            <span>Normal</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>
          <p className="text-2xl font-extrabold text-emerald-900 mt-1">{normalCount}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">Baseline conditions</p>
        </div>
      </div>

      {/* Main Content Layout: 33 District Selector List on Left, Deep Situation Dossier on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: District List (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm space-y-3">
            {/* Search & Filters */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search 33 districts..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={situationFilter}
                  onChange={(e) => setSituationFilter(e.target.value)}
                  className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 flex-1 text-slate-700 focus:outline-none"
                >
                  <option value="All">All Operational Situations</option>
                  <option value="CRITICAL_INFORMATIONAL">Critical Informational</option>
                  <option value="HIGH_CONCERN">High Concern</option>
                  <option value="ELEVATED_ATTENTION">Elevated Attention</option>
                  <option value="MONITORING">Monitoring</option>
                  <option value="NORMAL">Normal</option>
                </select>

                <select
                  value={confidenceFilter}
                  onChange={(e) => setConfidenceFilter(e.target.value)}
                  className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-700 focus:outline-none"
                >
                  <option value="All">All Confidence</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </div>
            </div>

            {/* District Situation Rows */}
            <div className="divide-y divide-slate-100 max-h-[640px] overflow-y-auto pr-1">
              {filteredSituations.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  No districts match the selected filters.
                </div>
              ) : (
                filteredSituations.map((sit) => {
                  const isSelected = sit.districtId === selectedDistrictId;
                  return (
                    <div
                      key={sit.districtId}
                      onClick={() => handleSelectDistrict(sit)}
                      className={`p-2.5 cursor-pointer rounded-lg transition-colors flex items-center justify-between gap-2 ${
                        isSelected
                          ? 'bg-blue-50/80 border border-blue-300/80 shadow-sm'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900 truncate">
                            {sit.districtName}
                          </span>
                          <span className="text-[10px] font-semibold text-slate-500">
                            {sit.compositeRiskScore}/100
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {getSituationBadge(sit.operationalSituation)}
                          <span className="text-[9px] text-slate-400 font-medium">
                            {sit.signalCoverage.available}/5 signals
                          </span>
                        </div>
                      </div>

                      <div className="text-right flex flex-col items-end gap-1">
                        {getConfidenceBadge(sit.dataConfidence)}
                        <ChevronRight className={`w-3.5 h-3.5 ${isSelected ? 'text-blue-600' : 'text-slate-400'}`} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Detailed District Situation Intelligence Dossier (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {selectedSituation ? (
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-5">
              {/* Header: District Name, Risk Score, Operational Category */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between pb-4 border-b border-slate-100 gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-extrabold text-slate-900">
                      {selectedSituation.districtName}
                    </h3>
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold border border-slate-200">
                      5-Factor Score: {selectedSituation.compositeRiskScore} / 100 ({selectedSituation.compositeRiskLevel})
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Multi-Signal Intelligence Assessment & Situation Synthesis
                  </p>
                </div>

                <div className="flex flex-col sm:items-end gap-1.5">
                  {getSituationBadge(selectedSituation.operationalSituation)}
                  <div className="flex items-center gap-1.5">
                    {getConfidenceBadge(selectedSituation.dataConfidence)}
                    <span className="text-[10px] text-slate-500 font-medium">
                      Confidence Score: {Math.round(selectedSituation.dataConfidenceScore * 100)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* 1. Primary Risk Drivers Section */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <ShieldAlert className="w-4 h-4 text-red-600" />
                  <span>Primary Risk Drivers (Traceable Evidence)</span>
                </div>

                {selectedSituation.primaryDrivers.length === 0 ? (
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
                    No severe primary risk drivers active. District parameters are within baseline operational tolerances.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedSituation.primaryDrivers.map((driver, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-lg bg-red-50/60 border border-red-200 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-red-900 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
                            {driver.signal} ({driver.source})
                          </span>
                          {driver.freshness && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-white text-red-800 font-semibold border border-red-200">
                              {driver.freshness}
                            </span>
                          )}
                        </div>
                        <p className="text-slate-700">{driver.evidence}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 2. Supporting Signals Section */}
              {selectedSituation.supportingSignals.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                    <Activity className="w-4 h-4 text-blue-600" />
                    <span>Supporting Signals & Secondary Context</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {selectedSituation.supportingSignals.map((driver, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1"
                      >
                        <div className="font-semibold text-slate-800 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                          {driver.signal}
                        </div>
                        <p className="text-[11px] text-slate-600">{driver.evidence}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 3. Multi-Signal Coverage & Freshness Matrix */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                  <div className="flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-indigo-600" />
                    <span>Signal Coverage & Telemetry Freshness ({selectedSituation.signalCoverage.available}/5)</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                  <div className="p-2 rounded-lg border bg-slate-50 border-slate-200 space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <CloudRain className="w-3 h-3 text-blue-600" /> Rain
                      </span>
                      {selectedSituation.signalCoverage.signals.rainfall ? '✅' : '❌'}
                    </div>
                    <p className="font-bold text-slate-800 text-[11px]">
                      {selectedSituation.rainfallSummary.value_24h} mm
                    </p>
                    <span className="text-[9px] px-1 rounded bg-blue-100 text-blue-800 font-semibold block truncate">
                      {selectedSituation.rainfallSummary.freshness}
                    </span>
                  </div>

                  <div className="p-2 rounded-lg border bg-slate-50 border-slate-200 space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <Waves className="w-3 h-3 text-cyan-600" /> Hydro
                      </span>
                      {selectedSituation.signalCoverage.signals.hydrology ? '✅' : '❌'}
                    </div>
                    <p className="font-bold text-slate-800 text-[11px] truncate">
                      {selectedSituation.hydrologySummary ? selectedSituation.hydrologySummary.dominantStatus : 'No Gauge'}
                    </p>
                    <span className="text-[9px] px-1 rounded bg-cyan-100 text-cyan-800 font-semibold block truncate">
                      {selectedSituation.hydrologySummary?.freshness || 'N/A'}
                    </span>
                  </div>

                  <div className="p-2 rounded-lg border bg-slate-50 border-slate-200 space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3 text-amber-600" /> Citizen
                      </span>
                      {selectedSituation.signalCoverage.signals.citizen ? '✅' : '❌'}
                    </div>
                    <p className="font-bold text-slate-800 text-[11px]">
                      {selectedSituation.citizenSummary.totalReports} reports
                    </p>
                    <span className="text-[9px] px-1 rounded bg-amber-100 text-amber-800 font-semibold block truncate">
                      {selectedSituation.citizenSummary.totalReports > 0 ? 'ACTIVE' : 'BASELINE'}
                    </span>
                  </div>

                  <div className="p-2 rounded-lg border bg-slate-50 border-slate-200 space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>History</span>
                      ✅
                    </div>
                    <p className="font-bold text-slate-800 text-[11px]">Static Index</p>
                    <span className="text-[9px] px-1 rounded bg-slate-200 text-slate-700 font-semibold block truncate">
                      HISTORICAL
                    </span>
                  </div>

                  <div className="p-2 rounded-lg border bg-slate-50 border-slate-200 space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>Drainage</span>
                      ✅
                    </div>
                    <p className="font-bold text-slate-800 text-[11px]">GIS Model</p>
                    <span className="text-[9px] px-1 rounded bg-slate-200 text-slate-700 font-semibold block truncate">
                      SPATIAL
                    </span>
                  </div>
                </div>
              </div>

              {/* 4. Operational Recommendations */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Deterministic Decision-Support Guidance (Informational Only)</span>
                </div>
                <ul className="space-y-1.5">
                  {selectedSituation.recommendedActions.map((action, idx) => (
                    <li
                      key={idx}
                      className="p-2.5 rounded-lg bg-emerald-50/50 border border-emerald-200 text-xs text-slate-700 flex items-start gap-2"
                    >
                      <span className="font-bold text-emerald-700 mt-0.5">•</span>
                      <span>{action}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* 5. Data Limitations Notice */}
              {selectedSituation.dataLimitations.length > 0 && (
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5 text-xs text-slate-600">
                  <div className="flex items-center gap-1 font-bold text-slate-700">
                    <Info className="w-3.5 h-3.5 text-slate-500" />
                    <span>Transparent Data Limitations & Provenance</span>
                  </div>
                  <ul className="space-y-1 list-disc list-inside text-[11px]">
                    {selectedSituation.dataLimitations.map((lim, idx) => (
                      <li key={idx}>{lim}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Modal trigger button for complete district dossier */}
              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => {
                    const match = districts.find(d => (d.district_id && d.district_id.toLowerCase() === selectedSituation.districtId.toLowerCase()) || d.district.toLowerCase() === selectedSituation.districtName.toLowerCase());
                    if (match) setSelectedStatusForModal(match);
                  }}
                  className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs flex items-center gap-1.5 shadow-sm transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" />
                  View Full 5-Factor Score & AI Reasoning Modal
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
              Select a district to view situation fusion intelligence.
            </div>
          )}
        </div>
      </div>

      {/* District Detail Modal */}
      {selectedStatusForModal && (
        <DistrictDetailModal
          district={selectedStatusForModal}
          onClose={() => setSelectedStatusForModal(null)}
        />
      )}
    </div>
  );
};
