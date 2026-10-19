import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { HomeView } from './components/HomeView';
import { LiveDashboardView } from './components/LiveDashboardView';
import { RiskMapView } from './components/RiskMapView';
import { CitizenReportView } from './components/CitizenReportView';
import { AIAssistantView } from './components/AIAssistantView';
import { SituationFusionView } from './components/SituationFusionView';
import { AlertCenterView } from './components/AlertCenterView';
import { DataSourcesIoTView } from './components/DataSourcesIoTView';
import { DistrictStatus, SimulationScenarioName } from './types';

export default function App() {
  const [currentTab, setCurrentTab] = useState<string>('home');
  const [scenario, setScenario] = useState<SimulationScenarioName>('Heavy Rainfall');
  const [districts, setDistricts] = useState<DistrictStatus[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Resilient Fetch with automatic retry
  const fetchDistricts = async (retryCount = 3, delayMs = 600): Promise<void> => {
    setIsLoading(true);
    setFetchError(null);

    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        const res = await fetch('/api/districts');
        if (!res.ok) {
          throw new Error(`Server responded with status ${res.status}`);
        }
        const data = await res.json();
        if (data && Array.isArray(data.districts)) {
          setDistricts(data.districts);
          setFetchError(null);
          setIsLoading(false);
          return;
        } else {
          throw new Error('Invalid district payload structure received');
        }
      } catch (err: any) {
        console.warn(`Attempt ${attempt}/${retryCount} - Failed to fetch districts:`, err?.message || err);
        if (attempt < retryCount) {
          await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
        } else {
          setFetchError(err?.message || 'Unable to connect to NeerDrishti backend service.');
          setIsLoading(false);
        }
      }
    }
  };

  useEffect(() => {
    fetchDistricts();
  }, []);

  // Update Scenario
  const handleScenarioChange = async (newScenario: SimulationScenarioName) => {
    setScenario(newScenario);
    try {
      const res = await fetch('/api/simulation/set-scenario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: newScenario }),
      });
      const data = await res.json();
      if (data.districts) {
        setDistricts(data.districts);
      }
    } catch (err) {
      console.error('Error changing scenario:', err);
    }
  };

  // Custom rainfall adjustment
  const handleCustomRainfall = async (districtName: string, val: number) => {
    try {
      const res = await fetch('/api/simulation/set-scenario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          custom_rainfall: { [districtName]: val },
        }),
      });
      const data = await res.json();
      if (data.districts) {
        setDistricts(data.districts);
      }
    } catch (err) {
      console.error('Error updating rainfall:', err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans">
      {/* Navigation */}
      <Navbar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        scenario={scenario}
        onScenarioChange={handleScenarioChange}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {isLoading ? (
          <div className="py-24 flex flex-col items-center justify-center space-y-4">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-semibold text-slate-600">Initializing NeerDrishti Flood Intelligence Engine...</p>
          </div>
        ) : fetchError && districts.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center max-w-lg mx-auto text-center bg-white border border-rose-200 rounded-2xl p-8 shadow-sm">
            <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center mb-4 text-rose-600 font-bold text-xl">
              !
            </div>
            <h2 className="text-lg font-bold text-slate-800 mb-2">Telemetry Service Connection Error</h2>
            <p className="text-sm text-slate-600 mb-6">{fetchError}</p>
            <button
              id="retry-connection-btn"
              onClick={() => fetchDistricts(3, 500)}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-semibold rounded-lg shadow transition-colors"
            >
              Retry Connection
            </button>
          </div>
        ) : (
          <>
            {currentTab === 'home' && (
              <HomeView
                districts={districts}
                onNavigate={(tab) => setCurrentTab(tab)}
              />
            )}

            {currentTab === 'dashboard' && (
              <LiveDashboardView
                districts={districts}
                scenario={scenario}
                onScenarioChange={handleScenarioChange}
                onCustomRainfallChange={handleCustomRainfall}
                onRefresh={fetchDistricts}
              />
            )}

            {currentTab === 'situation' && (
              <SituationFusionView
                districts={districts}
                scenario={scenario}
                onScenarioChange={handleScenarioChange}
                onRefresh={fetchDistricts}
              />
            )}

            {currentTab === 'alerts' && (
              <AlertCenterView
                districts={districts}
                scenario={scenario}
                onScenarioChange={handleScenarioChange}
                onRefresh={fetchDistricts}
              />
            )}

            {currentTab === 'map' && (
              <RiskMapView
                districts={districts}
                scenario={scenario}
                onScenarioChange={handleScenarioChange}
              />
            )}

            {currentTab === 'iot' && (
              <DataSourcesIoTView
                districts={districts}
                onRefreshDistricts={fetchDistricts}
              />
            )}

            {currentTab === 'reports' && (
              <CitizenReportView
                districts={districts.map((d) => d.district)}
                onReportSubmitted={fetchDistricts}
              />
            )}

            {currentTab === 'assistant' && (
              <AIAssistantView
                districts={districts}
              />
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500 mt-auto">
        <div className="max-w-7xl mx-auto px-4 space-y-1">
          <p className="font-semibold text-slate-700">
            NeerDrishti (నీర్ దృష్టి) — AI Urban Flood Intelligence & Advisory System for Telangana
          </p>
          <p>
            Statewide Coverage: All 33 Districts (5 Priority Flood Monitoring, 15 Standard Monitoring, 13 Limited Data).
          </p>
          <p className="text-slate-400">
            Deterministic Weighted Risk Engine (0–100) • LLM Reasoning Layer • Simulation Mode Prototype
          </p>
        </div>
      </footer>
    </div>
  );
}
