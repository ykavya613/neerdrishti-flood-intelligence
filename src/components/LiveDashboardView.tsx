import React, { useState, useMemo, useEffect } from 'react';
import { 
  BarChart, 
  Bar, 
  LineChart,
  Line,
  ReferenceLine,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { 
  AlertTriangle, 
  CloudRain, 
  Activity, 
  Users, 
  Sparkles, 
  ShieldCheck, 
  CheckCircle2, 
  Sliders, 
  ChevronRight,
  Info,
  Languages,
  RotateCcw,
  Search,
  Filter,
  ShieldAlert,
  Layers,
  TrendingUp,
  RefreshCw,
  Clock,
  Droplets,
  ExternalLink
} from 'lucide-react';
import { 
  DistrictStatus, 
  SimulationScenarioName, 
  AIReasoningResponse,
  RegionZoneOption 
} from '../types';
import { DistrictCard } from './DistrictCard';
import { DistrictDetailModal } from './DistrictDetailModal';
import { 
  generate24HourRainfallTrend, 
  DistrictRainfallHistorySummary, 
  HourlyRainfallPoint 
} from '../utils/rainfall_history';

interface LiveDashboardViewProps {
  districts: DistrictStatus[];
  scenario: SimulationScenarioName;
  onScenarioChange: (scenario: SimulationScenarioName) => void;
  onCustomRainfallChange: (district: string, val: number) => void;
  onRefresh?: () => void;
}

export const LiveDashboardView: React.FC<LiveDashboardViewProps> = ({
  districts,
  scenario,
  onScenarioChange,
  onCustomRainfallChange,
  onRefresh,
}) => {
  const [selectedDistrict, setSelectedDistrict] = useState<DistrictStatus | null>(null);
  const [selectedTrendDistrictName, setSelectedTrendDistrictName] = useState<string>('');
  const [trendViewMode, setTrendViewMode] = useState<'dual' | 'hourly' | 'cumulative'>('dual');
  const [trendData, setTrendData] = useState<DistrictRainfallHistorySummary | null>(null);
  const [isLoadingTrend, setIsLoadingTrend] = useState<boolean>(false);
  const [categoryFilter, setCategoryFilter] = useState<'All' | 'Priority' | 'Standard' | 'Limited'>('All');
  const [riskFilter, setRiskFilter] = useState<'All' | 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL'>('All');
  const [alertFilter, setAlertFilter] = useState<'All' | 'ACTIVE' | 'CRITICAL' | 'HIGH' | 'ELEVATED' | 'WATCH'>('All');
  const [dataModeFilter, setDataModeFilter] = useState<'All' | 'Simulated' | 'Prototype' | 'Historical' | 'Live' | 'Limited'>('All');
  const [zoneFilter, setZoneFilter] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activeChartTab, setActiveChartTab] = useState<'ranking' | 'distribution' | 'coverage' | 'rainfall' | 'completeness' | 'trend'>('ranking');
  const [showFormulaModal, setShowFormulaModal] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Summary Metrics calculations
  const totalDistricts = districts.length || 33;
  const priorityCount = districts.filter(d => d.monitoring_category === 'Priority Flood Monitoring').length;
  const standardCount = districts.filter(d => d.monitoring_category === 'Standard Monitoring').length;
  const limitedCount = districts.filter(d => d.monitoring_category === 'Limited Data').length;
  
  const highRiskCount = districts.filter(d => d.risk_category === 'HIGH').length;
  const criticalRiskCount = districts.filter(d => d.risk_category === 'CRITICAL').length;

  const activeAlerts = districts.filter(d => d.alert_intelligence && d.alert_intelligence.alert_level !== 'NORMAL');
  const criticalAlertsCount = districts.filter(d => d.alert_intelligence?.alert_level === 'CRITICAL').length;
  const highAlertsCount = districts.filter(d => d.alert_intelligence?.alert_level === 'HIGH').length;
  const elevatedAlertsCount = districts.filter(d => d.alert_intelligence?.alert_level === 'ELEVATED').length;
  const watchAlertsCount = districts.filter(d => d.alert_intelligence?.alert_level === 'WATCH').length;
  
  const highestRiskDistrict = districts.reduce(
    (max, d) => (d.flood_risk_score > (max?.flood_risk_score ?? -1) ? d : max),
    districts[0] || null
  );

  const activeTrendDistrict = useMemo(() => {
    if (selectedTrendDistrictName) {
      const found = districts.find(d => d.district.toLowerCase() === selectedTrendDistrictName.toLowerCase());
      if (found) return found;
    }
    return highestRiskDistrict || districts[0] || null;
  }, [districts, selectedTrendDistrictName, highestRiskDistrict]);

  // Synchronize 24-hour rainfall trend data for activeTrendDistrict
  useEffect(() => {
    if (!activeTrendDistrict) return;

    // Immediately calculate deterministic baseline to prevent flash of empty state
    const localTrend = generate24HourRainfallTrend(
      activeTrendDistrict.rainfall_mm_24h,
      activeTrendDistrict.rainfall_mm_3h,
      activeTrendDistrict.district
    );
    setTrendData(localTrend);

    // Try fetching from backend API if available
    const districtKey = activeTrendDistrict.district_id || activeTrendDistrict.district;
    setIsLoadingTrend(true);
    fetch(`/api/districts/${encodeURIComponent(districtKey)}/rainfall-history`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.summary && Array.isArray(data.summary.points)) {
          setTrendData(data.summary);
        }
      })
      .catch(() => {
        // Fallback remains active
      })
      .finally(() => {
        setIsLoadingTrend(false);
      });
  }, [activeTrendDistrict?.district, activeTrendDistrict?.rainfall_mm_24h, activeTrendDistrict?.rainfall_mm_3h, scenario]);

  const RainfallTrendTooltip: React.FC<any> = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data: HourlyRainfallPoint = payload[0].payload;
      return (
        <div className="bg-slate-900/95 text-white p-3 rounded-xl shadow-xl border border-slate-700 text-xs backdrop-blur-md min-w-[210px] space-y-2 pointer-events-none">
          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
            <div className="font-bold text-slate-100 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              <span>{data.hour}</span>
              <span className="text-[10px] font-normal text-slate-400">({data.relative_hour})</span>
            </div>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
              data.intensity === 'Very Heavy' ? 'bg-rose-950 text-rose-300 border border-rose-800' :
              data.intensity === 'Heavy' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
              data.intensity === 'Moderate' ? 'bg-blue-950 text-blue-300 border border-blue-800' :
              'bg-slate-800 text-slate-300'
            }`}>
              {data.intensity} Rain
            </span>
          </div>

          <div className="space-y-1.5 text-slate-300">
            <div className="flex justify-between items-center">
              <span className="text-slate-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                Hourly Intensity:
              </span>
              <span className="font-bold text-blue-300 font-mono text-[13px]">{data.rainfall_mm} mm/hr</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />
                24h Accumulation:
              </span>
              <span className="font-bold text-purple-300 font-mono text-[13px]">{data.cumulative_mm} mm</span>
            </div>
          </div>

          {data.is_burst && (
            <div className="pt-1.5 border-t border-slate-800 text-[10px] font-bold text-amber-300 flex items-center gap-1">
              ⚡ Recent 3h Burst Window
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  const avgStateScore = districts.length
    ? Math.round((districts.reduce((sum, d) => sum + d.flood_risk_score, 0) / districts.length) * 10) / 10
    : 0;

  const totalReports = districts.reduce((sum, d) => sum + (d.citizen_reports_count || 0), 0);

  const getRiskColor = (category: string) => {
    switch (category) {
      case 'CRITICAL': return '#ef4444';
      case 'HIGH': return '#f97316';
      case 'MODERATE': return '#f59e0b';
      default: return '#10b981';
    }
  };

  // Unified Composable Filtering pipeline
  const filteredDistricts = districts.filter(d => {
    // 1. Monitoring Category filter
    const matchesCategory = 
      categoryFilter === 'All' ? true :
      categoryFilter === 'Priority' ? d.monitoring_category === 'Priority Flood Monitoring' :
      categoryFilter === 'Standard' ? d.monitoring_category === 'Standard Monitoring' :
      d.monitoring_category === 'Limited Data';

    // 2. Risk Level filter
    const matchesRisk = 
      riskFilter === 'All' ? true :
      d.risk_category === riskFilter;

    // 3. Data Mode filter
    const matchesDataMode = 
      dataModeFilter === 'All' ? true :
      dataModeFilter === 'Simulated' ? d.data_source_mode === 'Simulated Data' :
      dataModeFilter === 'Prototype' ? d.data_source_mode === 'Prototype Baseline' :
      dataModeFilter === 'Historical' ? d.data_source_mode === 'Historical Data' :
      dataModeFilter === 'Live' ? d.data_source_mode === 'Live Data' :
      d.data_source_mode === 'Limited Data';

    // 4. Region Zone filter
    const matchesZone = 
      zoneFilter === 'All' ? true :
      (d.region_zone && d.region_zone.toLowerCase().includes(zoneFilter.toLowerCase())) ||
      (d.simulation_zone && d.simulation_zone.toLowerCase().includes(zoneFilter.toLowerCase()));

    // 5. Alert Level filter
    const matchesAlert = 
      alertFilter === 'All' ? true :
      alertFilter === 'ACTIVE' ? (d.alert_intelligence && d.alert_intelligence.alert_level !== 'NORMAL') :
      d.alert_intelligence?.alert_level === alertFilter;

    // 6. Search query
    const matchesSearch = 
      !searchTerm ? true :
      d.district.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (d.river_basin && d.river_basin.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (d.region_zone && d.region_zone.toLowerCase().includes(searchTerm.toLowerCase()));

    return matchesCategory && matchesRisk && matchesDataMode && matchesZone && matchesAlert && matchesSearch;
  });

  // Chart Data: 1. Risk Ranking (Sorted highest first)
  const sortedByRisk = [...filteredDistricts].sort((a, b) => b.flood_risk_score - a.flood_risk_score);
  const rankingChartData = sortedByRisk.slice(0, 15).map(d => ({
    district: d.district,
    score: d.flood_risk_score,
    category: d.risk_category,
    rainfall: d.rainfall_mm_24h,
    mode: d.data_source_mode,
  }));

  // Chart Data: 2. Risk Distribution
  const riskDistributionData = [
    { name: 'Low Risk (0-25)', count: districts.filter(d => d.risk_category === 'LOW').length, fill: '#10b981' },
    { name: 'Moderate (26-50)', count: districts.filter(d => d.risk_category === 'MODERATE').length, fill: '#f59e0b' },
    { name: 'High Risk (51-75)', count: districts.filter(d => d.risk_category === 'HIGH').length, fill: '#f97316' },
    { name: 'Critical (76-100)', count: districts.filter(d => d.risk_category === 'CRITICAL').length, fill: '#ef4444' },
  ];

  // Chart Data: 3. Monitoring Coverage
  const monitoringCoverageData = [
    { name: 'Priority Flood Monitoring (5)', value: priorityCount, fill: '#2563eb' },
    { name: 'Standard Monitoring (15)', value: standardCount, fill: '#64748b' },
    { name: 'Limited Data (13)', value: limitedCount, fill: '#d97706' },
  ];

  // Chart Data: 4. Simulation Rainfall Comparison
  const rainfallChartData = [...filteredDistricts]
    .sort((a, b) => b.rainfall_mm_24h - a.rainfall_mm_24h)
    .slice(0, 15)
    .map(d => ({
      district: d.district,
      rainfall: d.rainfall_mm_24h,
      category: d.risk_category,
    }));

  // Chart Data: 5. Data Completeness Ranking
  const completenessChartData = [...filteredDistricts]
    .sort((a, b) => (b.risk_data_completeness ?? 80) - (a.risk_data_completeness ?? 80))
    .map(d => ({
      district: d.district,
      completeness: d.risk_data_completeness ?? 80,
      category: d.monitoring_category,
    }));

  const handleRefreshClick = () => {
    setIsRefreshing(true);
    if (onRefresh) onRefresh();
    setTimeout(() => setIsRefreshing(false), 600);
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Simulation Disclaimer Banner */}
      <div className="bg-gradient-to-r from-amber-500/15 via-blue-500/10 to-amber-500/15 border border-amber-300/40 rounded-xl p-3 text-xs text-amber-950 flex items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="font-semibold tracking-wide">
            PROTOTYPE SIMULATION MODE: These values are generated for demonstration and are not official forecasts or emergency warnings.
          </span>
        </div>
        <button
          onClick={handleRefreshClick}
          className="flex items-center gap-1 px-2.5 py-1 rounded bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 font-medium text-xs shadow-xs transition-colors shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Top Header & Scenario Selection */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
              <Activity className="w-6 h-6 text-blue-600" />
              <span>Telangana State Flood Intelligence Dashboard</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500">
              Deterministic hydro-meteorological scoring across all 33 Telangana districts
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFormulaModal(!showFormulaModal)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Info className="w-3.5 h-3.5 text-blue-600" />
              <span>Scoring Formula</span>
            </button>
          </div>
        </div>

        {/* Scenario Switcher Tabs */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
            <Sliders className="w-3.5 h-3.5 text-blue-600" />
            <span>Simulation Scenario:</span>
          </span>
          {(['Normal Conditions', 'Heavy Rainfall', 'Flood Warning', 'Critical Flood Event'] as SimulationScenarioName[]).map((sc) => {
            const isSelected = scenario === sc;
            return (
              <button
                key={sc}
                id={`btn-scenario-${sc.toLowerCase().replace(/\s+/g, '-')}`}
                onClick={() => onScenarioChange(sc)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-sm font-semibold'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {sc}
              </button>
            );
          })}
        </div>

        {/* Formula Drawer */}
        {showFormulaModal && (
          <div className="bg-blue-50/80 border border-blue-200 rounded-lg p-4 text-xs space-y-2 text-slate-700">
            <div className="font-bold text-blue-900 flex items-center justify-between">
              <span>📐 Deterministic Flood-Risk Scoring Weights (0–100 Normalized)</span>
              <button onClick={() => setShowFormulaModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>
            <div className="font-mono bg-white p-2.5 rounded border border-blue-100 text-blue-950 font-semibold overflow-x-auto">
              Flood Risk Score = (Rainfall × 0.35) + (Flood History × 0.25) + (Location Risk × 0.15) + (Citizen Reports × 0.15) + (Drainage Vulnerability × 0.10)
            </div>
            <p className="text-slate-600">
              Categories: <b>0–25 LOW</b> (Green) | <b>26–50 MODERATE</b> (Yellow) | <b>51–75 HIGH</b> (Orange) | <b>76–100 CRITICAL</b> (Red).
            </p>
          </div>
        )}
      </div>

      {/* Part 2: Top Overview Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Districts */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Total Districts</span>
          <span className="text-2xl font-black text-slate-900 mt-1 block">{totalDistricts}</span>
          <span className="text-[10px] text-slate-500">Telangana State</span>
        </div>

        {/* Monitoring Categories */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Monitoring Split</span>
          <div className="text-xs font-semibold text-slate-800 mt-1 space-y-0.5">
            <div className="flex justify-between text-blue-700"><span>Priority:</span> <span>{priorityCount}</span></div>
            <div className="flex justify-between text-slate-600"><span>Standard:</span> <span>{standardCount}</span></div>
            <div className="flex justify-between text-amber-700"><span>Limited:</span> <span>{limitedCount}</span></div>
          </div>
        </div>

        {/* Active Scenario */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Current Scenario</span>
          <span className="text-sm font-bold text-blue-700 mt-1 block truncate" title={scenario}>{scenario}</span>
          <span className="text-[10px] text-indigo-600 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200 inline-block mt-1">
            SIMULATED DATA
          </span>
        </div>

        {/* Highest Risk District */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Highest Risk</span>
          <span className="text-lg font-black text-red-600 mt-1 block truncate">{highestRiskDistrict?.district || 'N/A'}</span>
          <span className="text-[10px] font-bold text-slate-700">
            {highestRiskDistrict?.flood_risk_score} / 100 ({highestRiskDistrict?.risk_category})
          </span>
        </div>

        {/* High & Critical Counts */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Elevated Alerts</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-black text-orange-600">{highRiskCount}</span>
            <span className="text-xs text-slate-500">High</span>
            <span className="text-xl font-black text-red-600 ml-1">{criticalRiskCount}</span>
            <span className="text-xs text-slate-500">Crit</span>
          </div>
          <span className="text-[10px] text-slate-400 block mt-0.5">Need immediate triage</span>
        </div>

        {/* Last Updated Timestamp */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Last Updated</span>
          <span className="text-xs font-bold text-slate-800 mt-1 block">2026-08-27 12:00 IST</span>
          <span className="text-[10px] text-emerald-600 font-semibold block mt-1">● Synced</span>
        </div>
      </div>

      {/* Visual Analytics Hub (Part 5) */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              <span>Telangana Hydro-Spatial Visual Analytics</span>
            </h2>
            <p className="text-xs text-slate-500">
              Interactive charts sorting risk, category distribution, monitoring coverage, and data completeness
            </p>
          </div>

          {/* Chart View Switcher */}
          <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveChartTab('ranking')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                activeChartTab === 'ranking' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Risk Ranking
            </button>
            <button
              onClick={() => setActiveChartTab('distribution')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                activeChartTab === 'distribution' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Category Distribution
            </button>
            <button
              onClick={() => setActiveChartTab('coverage')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                activeChartTab === 'coverage' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Monitoring Coverage
            </button>
            <button
              onClick={() => setActiveChartTab('rainfall')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                activeChartTab === 'rainfall' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Simulation Rainfall
            </button>
            <button
              onClick={() => setActiveChartTab('completeness')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                activeChartTab === 'completeness' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Data Completeness
            </button>
            <button
              id="chart-tab-trend"
              onClick={() => setActiveChartTab('trend')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                activeChartTab === 'trend' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              24h Rainfall Trend
            </button>
          </div>
        </div>

        {/* Chart Viewport */}
        <div className="h-72 w-full pt-2">
          {activeChartTab === 'ranking' && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rankingChartData} layout="vertical" margin={{ top: 5, right: 30, left: 60, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="district" tick={{ fontSize: 11 }} />
                <Tooltip formatter={(val: number) => [`${val} / 100`, 'Flood Risk Score']} />
                <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                  {rankingChartData.map((entry, index) => (
                    <Cell key={`rank-cell-${index}`} fill={getRiskColor(entry.category)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}

          {activeChartTab === 'distribution' && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={riskDistributionData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(val: number) => [`${val} Districts`, 'Count']} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {riskDistributionData.map((entry, index) => (
                    <Cell key={`dist-cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}

          {activeChartTab === 'coverage' && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monitoringCoverageData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(val: number) => [`${val} Districts`, 'Count']} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {monitoringCoverageData.map((entry, index) => (
                    <Cell key={`cov-cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}

          {activeChartTab === 'rainfall' && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rainfallChartData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="district" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit="mm" />
                <Tooltip formatter={(val: number) => [`${val} mm`, 'Simulation Rainfall (24h)']} />
                <Bar dataKey="rainfall" name="Simulation Rainfall (mm)" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                  {rainfallChartData.map((entry, index) => (
                    <Cell key={`rf-cell-${index}`} fill={getRiskColor(entry.category)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}

          {activeChartTab === 'completeness' && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={completenessChartData.slice(0, 15)} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="district" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                <Tooltip formatter={(val: number) => [`${val}%`, 'Data Completeness']} />
                <Bar dataKey="completeness" name="Data Completeness (%)" fill="#64748b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}

          {activeChartTab === 'trend' && trendData && (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData.points} margin={{ top: 15, right: 30, left: 10, bottom: 15 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="hour" tick={{ fontSize: 11 }} interval={2} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#2563eb' }} unit=" mm" />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#7c3aed' }} unit=" mm" />
                <Tooltip content={<RainfallTrendTooltip />} />
                <Legend />
                <ReferenceLine yAxisId="left" y={7.5} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: 'Heavy Rain (7.5 mm/h)', fill: '#d97706', fontSize: 10 }} />
                <Line yAxisId="left" type="monotone" dataKey="rainfall_mm" name={`${activeTrendDistrict?.district || 'District'} Hourly (mm/h)`} stroke="#2563eb" strokeWidth={2.5} />
                <Line yAxisId="right" type="monotone" dataKey="cumulative_mm" name="Cumulative (mm)" stroke="#7c3aed" strokeWidth={2} strokeDasharray="4 4" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Dedicated 24-Hour Historical Rainfall Trend Analyzer Section */}
      {activeTrendDistrict && trendData && (
        <div id="district-24h-trend-section" className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-5">
          {/* Section Header with District Selector & View Mode Switcher */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                  <CloudRain className="w-5 h-5" />
                </span>
                <h3 className="text-lg font-bold text-slate-900">
                  24-Hour Historical Rainfall Trend — <span className="text-blue-700">{activeTrendDistrict.district}</span>
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1">
                <span>{activeTrendDistrict.river_basin || 'River Basin'}</span>
                <span aria-hidden="true">·</span>
                <span>{activeTrendDistrict.monitoring_category}</span>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-slate-700">{activeTrendDistrict.data_source_mode}</span>
                {isLoadingTrend && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-blue-600 flex items-center gap-1 font-medium">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      Syncing telemetry...
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* District Selector & Mode Controls */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* District Dropdown Selector */}
              <div className="relative">
                <select
                  id="trend-district-select"
                  value={activeTrendDistrict.district}
                  onChange={(e) => setSelectedTrendDistrictName(e.target.value)}
                  className="pl-3 pr-8 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-slate-50 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <optgroup label="Priority Flood Monitoring">
                    {districts.filter(d => d.monitoring_category === 'Priority Flood Monitoring').map(d => (
                      <option key={d.district} value={d.district}>{d.district} ({d.rainfall_mm_24h} mm)</option>
                    ))}
                  </optgroup>
                  <optgroup label="Standard Monitoring">
                    {districts.filter(d => d.monitoring_category === 'Standard Monitoring').map(d => (
                      <option key={d.district} value={d.district}>{d.district} ({d.rainfall_mm_24h} mm)</option>
                    ))}
                  </optgroup>
                  <optgroup label="Limited Data">
                    {districts.filter(d => d.monitoring_category === 'Limited Data').map(d => (
                      <option key={d.district} value={d.district}>{d.district} ({d.rainfall_mm_24h} mm)</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* View Mode Segmented Switcher */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                <button
                  id="btn-mode-dual"
                  onClick={() => setTrendViewMode('dual')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                    trendViewMode === 'dual' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Dual View
                </button>
                <button
                  id="btn-mode-hourly"
                  onClick={() => setTrendViewMode('hourly')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                    trendViewMode === 'hourly' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Hourly Rate
                </button>
                <button
                  id="btn-mode-cumulative"
                  onClick={() => setTrendViewMode('cumulative')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                    trendViewMode === 'cumulative' ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Cumulative
                </button>
              </div>

              {/* Full Inspector Button */}
              <button
                id="btn-open-district-modal"
                onClick={() => setSelectedDistrict(activeTrendDistrict)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-xs"
              >
                <span>Inspect District</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Quick District Shortcut Chips (Top Risk Districts) */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-slate-500 font-medium mr-1">Quick Select:</span>
            {districts
              .slice()
              .sort((a, b) => b.rainfall_mm_24h - a.rainfall_mm_24h)
              .slice(0, 6)
              .map((d) => (
                <button
                  key={d.district}
                  onClick={() => setSelectedTrendDistrictName(d.district)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    activeTrendDistrict.district === d.district
                      ? 'bg-blue-600 text-white shadow-xs font-semibold'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {d.district} ({d.rainfall_mm_24h} mm)
                </button>
              ))}
          </div>

          {/* 4 Executive KPI Cards for the Selected District */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-3.5">
              <span className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider block">24h Total Precipitation</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-black text-blue-900">{trendData.total_rainfall_24h}</span>
                <span className="text-xs font-bold text-blue-700">mm</span>
              </div>
              <span className="text-[10px] text-blue-600 font-medium block mt-0.5">
                {trendData.monsoon_intensity_category}
              </span>
            </div>

            <div className="bg-amber-50/70 border border-amber-100 rounded-xl p-3.5">
              <span className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider block">Recent 3h Surge Burst</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-black text-amber-900">{trendData.burst_rainfall_3h}</span>
                <span className="text-xs font-bold text-amber-700">mm</span>
              </div>
              <span className="text-[10px] text-amber-700 font-medium block mt-0.5">
                {trendData.total_rainfall_24h > 0 ? `${Math.round((trendData.burst_rainfall_3h / trendData.total_rainfall_24h) * 100)}% of 24h volume` : 'No precipitation'}
              </span>
            </div>

            <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-3.5">
              <span className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wider block">Peak 1-Hour Intensity</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-black text-indigo-900">{trendData.peak_hourly_rainfall}</span>
                <span className="text-xs font-bold text-indigo-700">mm/hr</span>
              </div>
              <span className="text-[10px] text-indigo-600 font-medium block mt-0.5">
                Recorded at {trendData.peak_hour} IST
              </span>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Precipitation Duration</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-black text-slate-800">{trendData.wet_hours_count}</span>
                <span className="text-xs font-bold text-slate-500">/ 24 hrs</span>
              </div>
              <span className="text-[10px] text-slate-500 font-medium block mt-0.5">
                Risk Score Contribution: +{activeTrendDistrict.contributions?.rainfall || Math.round(activeTrendDistrict.rainfall_score * 0.35 * 10) / 10} pts
              </span>
            </div>
          </div>

          {/* The Recharts Line Graph Viewport */}
          <div className="pt-2">
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData.points} margin={{ top: 15, right: 35, left: 5, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="hour" 
                    tick={{ fontSize: 11, fill: '#64748b' }} 
                    interval={2}
                    tickLine={false}
                    axisLine={{ stroke: '#cbd5e1' }}
                  />
                  <YAxis 
                    yAxisId="left" 
                    tick={{ fontSize: 11, fill: '#2563eb' }} 
                    unit=" mm"
                    domain={[0, (dataMax: number) => Math.max(16, Math.ceil(dataMax * 1.25))]}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  {(trendViewMode === 'dual' || trendViewMode === 'cumulative') && (
                    <YAxis 
                      yAxisId="right" 
                      orientation="right" 
                      tick={{ fontSize: 11, fill: '#7c3aed' }} 
                      unit=" mm" 
                      domain={[0, (dataMax: number) => Math.max(20, Math.ceil(dataMax * 1.15))]}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tickLine={false}
                    />
                  )}
                  <Tooltip content={<RainfallTrendTooltip />} />
                  <Legend 
                    verticalAlign="top" 
                    height={32} 
                    iconType="circle"
                    formatter={(val) => <span className="text-xs font-semibold text-slate-700">{val}</span>} 
                  />
                  {/* IMD Heavy Rain Threshold (7.5 mm/hr) */}
                  <ReferenceLine 
                    yAxisId="left"
                    y={7.5} 
                    stroke="#f59e0b" 
                    strokeDasharray="4 4" 
                    strokeWidth={1.5}
                    label={{ 
                      value: 'IMD Heavy Rain (7.5 mm/hr)', 
                      position: 'top', 
                      fill: '#d97706', 
                      fontSize: 10,
                      fontWeight: 600
                    }} 
                  />
                  {/* IMD Very Heavy Rain Threshold (15 mm/hr) */}
                  <ReferenceLine 
                    yAxisId="left"
                    y={15.0} 
                    stroke="#ef4444" 
                    strokeDasharray="3 3" 
                    strokeWidth={1.5}
                    label={{ 
                      value: 'Very Heavy (15 mm/hr)', 
                      position: 'top', 
                      fill: '#dc2626', 
                      fontSize: 10,
                      fontWeight: 600
                    }} 
                  />
                  {(trendViewMode === 'dual' || trendViewMode === 'hourly') && (
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="rainfall_mm"
                      name="Hourly Rainfall (mm/hr)"
                      stroke="#2563eb"
                      strokeWidth={2.75}
                      dot={(props: any) => {
                        const { cx, cy, payload } = props;
                        if (payload.is_burst || payload.rainfall_mm >= 7.5) {
                          return (
                            <circle 
                              key={`dot-${payload.hour}`} 
                              cx={cx} 
                              cy={cy} 
                              r={4} 
                              fill="#ef4444" 
                              stroke="#ffffff" 
                              strokeWidth={2} 
                            />
                          );
                        }
                        return (
                          <circle 
                            key={`dot-${payload.hour}`} 
                            cx={cx} 
                            cy={cy} 
                            r={2.5} 
                            fill="#2563eb" 
                          />
                        );
                      }}
                      activeDot={{ r: 6, fill: '#1d4ed8', stroke: '#ffffff', strokeWidth: 2 }}
                    />
                  )}
                  {(trendViewMode === 'dual' || trendViewMode === 'cumulative') && (
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="cumulative_mm"
                      name="Cumulative Accumulation (mm)"
                      stroke="#7c3aed"
                      strokeWidth={2.2}
                      strokeDasharray="4 4"
                      dot={false}
                      activeDot={{ r: 5, fill: '#6d28d9', stroke: '#ffffff', strokeWidth: 2 }}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Meteorological Legend & IMD Explanatory Footer */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t border-slate-100 text-[11px] text-slate-500">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 font-medium text-slate-700">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
                  Hourly Intensity (mm/hr)
                </span>
                <span className="flex items-center gap-1.5 font-medium text-purple-700">
                  <span className="w-2.5 h-0.5 bg-purple-600 inline-block" />
                  Cumulative 24h Sum (mm)
                </span>
                <span className="flex items-center gap-1.5 text-rose-600 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
                  Burst Point
                </span>
              </div>
              <div className="text-slate-400">
                IMD Standard: &lt;2.5 mm Light · 2.5–7.5 mm Mod · 7.5–15 mm Heavy · &gt;15 mm Very Heavy
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Part 3: Unified District Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <Filter className="w-4 h-4 text-blue-600" />
              <span>Multi-Factor District Filtering</span>
            </h3>
            <p className="text-xs text-slate-500">
              Showing {filteredDistricts.length} of {districts.length || 33} districts matching active criteria
            </p>
          </div>

          {/* Search Box */}
          <div className="relative min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search district, basin, or zone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2">
          {/* 1. Monitoring Category */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600">Monitoring Category:</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as any)}
              className="w-full p-2 text-xs rounded-lg border border-slate-300 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="All">All Categories ({districts.length})</option>
              <option value="Priority">Priority Flood Monitoring ({priorityCount})</option>
              <option value="Standard">Standard Monitoring ({standardCount})</option>
              <option value="Limited">Limited Data ({limitedCount})</option>
            </select>
          </div>

          {/* 2. Risk Level */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600">Risk Level:</label>
            <select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value as any)}
              className="w-full p-2 text-xs rounded-lg border border-slate-300 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="All">All Risk Levels</option>
              <option value="LOW">Low (0-25)</option>
              <option value="MODERATE">Moderate (26-50)</option>
              <option value="HIGH">High (51-75)</option>
              <option value="CRITICAL">Critical (76-100)</option>
            </select>
          </div>

          {/* 3. Alert Intelligence Filter */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600">Alert Intelligence:</label>
            <select
              value={alertFilter}
              onChange={(e) => setAlertFilter(e.target.value as any)}
              className="w-full p-2 text-xs rounded-lg border border-slate-300 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="All">All Alert States ({districts.length})</option>
              <option value="ACTIVE">⚡ Active Alerts ({activeAlerts.length})</option>
              <option value="CRITICAL">🔴 Critical Alert ({criticalAlertsCount})</option>
              <option value="HIGH">🟠 High Alert ({highAlertsCount})</option>
              <option value="ELEVATED">🟡 Elevated Alert ({elevatedAlertsCount})</option>
              <option value="WATCH">🔵 Watch Alert ({watchAlertsCount})</option>
            </select>
          </div>

          {/* 4. Data Mode */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600">Data Source Mode:</label>
            <select
              value={dataModeFilter}
              onChange={(e) => setDataModeFilter(e.target.value as any)}
              className="w-full p-2 text-xs rounded-lg border border-slate-300 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="All">All Data Modes</option>
              <option value="Simulated">Simulated Data</option>
              <option value="Prototype">Prototype Baseline</option>
              <option value="Historical">Historical Data</option>
              <option value="Live">Live Data</option>
              <option value="Limited">Limited Data</option>
            </select>
          </div>

          {/* 5. Region Zone */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600">Region Zone:</label>
            <select
              value={zoneFilter}
              onChange={(e) => setZoneFilter(e.target.value)}
              className="w-full p-2 text-xs rounded-lg border border-slate-300 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="All">All Region Zones</option>
              <option value="North Telangana">North Telangana</option>
              <option value="Central Telangana">Central Telangana</option>
              <option value="Hyderabad Urban Region">Hyderabad Urban Region</option>
              <option value="Godavari Influence Region">Godavari Influence Region</option>
              <option value="South Telangana">South Telangana</option>
              <option value="Krishna Influence Region">Krishna Influence Region</option>
            </select>
          </div>
        </div>
      </div>

      {/* Active Alert Intelligence Banner */}
      {activeAlerts.length > 0 && (
        <div className="bg-rose-50/90 border border-rose-200 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-rose-100 text-rose-700 mt-0.5">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-bold text-rose-950">
                  {activeAlerts.length} Districts Under Active Alert Intelligence
                </h4>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-200 text-rose-800 font-bold">
                  {criticalAlertsCount} Critical • {highAlertsCount} High • {elevatedAlertsCount} Elevated
                </span>
              </div>
              <p className="text-xs text-rose-800 mt-0.5">
                Deterministic decision support triggers computed from precipitation trends, forecast surge (+6h to +24h), upstream basin propagation, and ground citizen telemetry.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setAlertFilter(alertFilter === 'ACTIVE' ? 'All' : 'ACTIVE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs ${
                alertFilter === 'ACTIVE'
                  ? 'bg-rose-700 text-white ring-2 ring-rose-300'
                  : 'bg-white text-rose-700 border border-rose-300 hover:bg-rose-100'
              }`}
            >
              {alertFilter === 'ACTIVE' ? 'Showing Active Alerts' : 'Filter Active Alerts'}
            </button>
          </div>
        </div>
      )}

      {/* Part 4: Dynamic Reusable District Cards (33 Districts) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-lg">
            📍 Telangana District Flood Intel Cards ({filteredDistricts.length})
          </h3>
          <span className="text-xs text-slate-400">Click any card to open full Inspector</span>
        </div>

        {filteredDistricts.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
            <p className="font-semibold text-sm">No districts found matching your current filter combination.</p>
            <button
              onClick={() => {
                setCategoryFilter('All');
                setRiskFilter('All');
                setDataModeFilter('All');
                setZoneFilter('All');
                setSearchTerm('');
              }}
              className="mt-3 text-xs text-blue-600 font-semibold hover:underline"
            >
              Reset All Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
            {filteredDistricts.map((d) => (
              <DistrictCard
                key={d.district}
                district={d}
                isSelected={activeTrendDistrict?.district === d.district || selectedDistrict?.district === d.district}
                onSelect={(dist) => {
                  setSelectedTrendDistrictName(dist.district);
                  setSelectedDistrict(dist);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Part 6: Comprehensive District Detail Modal */}
      {selectedDistrict && (
        <DistrictDetailModal
          district={selectedDistrict}
          onClose={() => setSelectedDistrict(null)}
        />
      )}
    </div>
  );
};
