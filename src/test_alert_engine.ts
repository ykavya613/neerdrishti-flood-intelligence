import { AlertEngine } from './services/alert_engine';
import { ALERT_CONFIG } from './config/alert_thresholds';
import { DistrictStatus } from './types';

function runAlertEngineTests() {
  console.log('====================================================');
  console.log('NeerDrishti Phase F: Alert Intelligence Engine Tests');
  console.log('====================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`❌ [FAIL] ${testName} - ${detail || ''}`);
    }
  }

  // Helper mock district generator
  const createMockDistrict = (overrides: Partial<DistrictStatus>): DistrictStatus => {
    return {
      district: 'Bhadradri Kothagudem',
      lat: 17.55,
      lng: 80.61,
      flood_risk_score: 35,
      risk_category: 'MODERATE',
      rainfall_mm_24h: 40,
      rainfall_mm_3h: 10,
      risk_data_completeness: 95,
      risk_confidence: 'High',
      data_confidence: 'High',
      data_provenance: 'Simulated Hydrological Pipeline',
      rainfall_score: 40,
      flood_history_score: 60,
      location_risk_score: 50,
      citizen_report_score: 20,
      drainage_vulnerability_score: 30,
      terrain_type: 'River Basin / Lowland',
      river_basin: 'Godavari Basin',
      monitoring_category: 'Priority Flood Monitoring',
      data_source_mode: 'Simulated Data',
      citizen_reports_count: 2,
      citizen_reports_high_severity: 0,
      contributions: {
        rainfall: 14,
        flood_history: 15,
        location_risk: 7.5,
        citizen_reports: 3,
        drainage_vulnerability: 3,
      },
      components: {
        rainfall_score: 40,
        flood_history_score: 60,
        location_risk_score: 50,
        citizen_report_score: 20,
        drainage_vulnerability_score: 30,
      },
      ...overrides,
    };
  };

  const createMockForecastPoint = (overrides: Partial<any>): any => ({
    districtId: 'bhadradri_kothagudem',
    districtName: 'Bhadradri Kothagudem',
    forecastHorizonHours: 6,
    label: '+6H',
    projectedRiskScore: 40,
    currentRiskScore: 35,
    projectedRiskChange: 5,
    riskTrend: 'RISING',
    outlookCategory: 'WATCH_FOR_ESCALATION',
    confidence: 'HIGH',
    confidenceScore: 0.9,
    confidenceReason: 'Simulated multi-source telemetry',
    forecastDataMode: 'SIMULATED_FORECAST',
    projectedRainfall_mm: 50,
    projectedRainfallIntensity: 'MODERATE',
    basinInfluenceContribution: 5,
    primaryProjectedDrivers: [],
    ...overrides,
  });

  // Test 1: Low Risk, Calm Forecast -> NORMAL Alert Level
  {
    const district = createMockDistrict({
      flood_risk_score: 18,
      risk_category: 'LOW',
      rainfall_mm_24h: 15,
      citizen_reports_count: 0,
      forecast_summary: createMockForecastPoint({
        riskTrend: 'STABLE',
        projectedRiskScore: 20,
        projectedRiskChange: 2,
        confidence: 'HIGH',
      }),
    });

    const alert = AlertEngine.evaluateDistrictAlert(district);
    assert(alert.alert_level === 'NORMAL', 'Calm conditions produce NORMAL alert level');
    assert(alert.alert_level_code === 0, 'Normal alert level code is 0');
    assert(alert.status === 'Active', 'Alert status is initialized Active');
  }

  // Test 2: Moderate Risk with Rising Forecast -> ELEVATED / HIGH Alert Level
  {
    const district = createMockDistrict({
      flood_risk_score: 38,
      risk_category: 'MODERATE',
      rainfall_mm_24h: 45,
      forecast_summary: createMockForecastPoint({
        riskTrend: 'RISING',
        projectedRiskScore: 48,
        projectedRiskChange: 10,
        confidence: 'HIGH',
      }),
    });

    const alert = AlertEngine.evaluateDistrictAlert(district);
    assert(alert.alert_level === 'ELEVATED' || alert.alert_level === 'WATCH', 'Rising moderate risk triggers WATCH/ELEVATED alert');
    assert(alert.trend === 'RISING', 'Trend correctly captured as RISING');
    assert(alert.trigger_reasons.length > 0, 'Trigger reasons are populated');
  }

  // Test 3: High Risk Score (65) -> HIGH Alert Level
  {
    const district = createMockDistrict({
      flood_risk_score: 65,
      risk_category: 'HIGH',
      rainfall_mm_24h: 95,
      forecast_summary: createMockForecastPoint({
        riskTrend: 'RISING',
        projectedRiskScore: 72,
        projectedRiskChange: 7,
        confidence: 'HIGH',
      }),
    });

    const alert = AlertEngine.evaluateDistrictAlert(district);
    assert(alert.alert_level === 'HIGH', 'Risk score 65 triggers HIGH alert level');
    assert(alert.advisories.english.title.includes('HIGH') || alert.advisories.english.title.includes('ALERT'), 'English advisory title reflects HIGH status');
    assert(alert.advisories.telugu.title.length > 0, 'Telugu advisory generated');
  }

  // Test 4: Critical Risk Score (82) -> CRITICAL Alert Level
  {
    const district = createMockDistrict({
      district: 'Hyderabad',
      flood_risk_score: 82,
      risk_category: 'CRITICAL',
      rainfall_mm_24h: 140,
      forecast_summary: createMockForecastPoint({
        riskTrend: 'RISING',
        projectedRiskScore: 90,
        projectedRiskChange: 8,
        confidence: 'HIGH',
      }),
    });

    const alert = AlertEngine.evaluateDistrictAlert(district);
    assert(alert.alert_level === 'CRITICAL', 'Score 82 triggers CRITICAL alert level');
    assert(alert.status === 'Active', 'Alert status is Active');
    assert(alert.advisories.english.recommended_precautions.length >= 3, 'Comprehensive precautions provided');
  }

  // Test 5: Upstream Basin Surge Threat Escalation
  {
    const district = createMockDistrict({
      district: 'Mulugu',
      flood_risk_score: 45,
      risk_category: 'MODERATE',
      forecast_timeline: {
        districtId: 'mulugu',
        districtName: 'Mulugu',
        currentRiskScore: 45,
        currentRiskLevel: 'MODERATE',
        currentOperationalCategory: 'ELEVATED_ATTENTION',
        overallForecastOutlook: 'WATCH_FOR_ESCALATION',
        dominantTrend: 'RISING',
        maxProjectedRisk: 68,
        maxRiskHorizonHours: 12,
        timeline: {
          now: { riskScore: 45, riskLevel: 'MODERATE', operationalCategory: 'ELEVATED_ATTENTION', timestamp: new Date().toISOString() },
          h3: createMockForecastPoint({ projectedRiskScore: 48, projectedRainfall_mm: 55, riskTrend: 'RISING', projectedRiskChange: 3 }),
          h6: createMockForecastPoint({ projectedRiskScore: 52, projectedRainfall_mm: 65, riskTrend: 'RISING', projectedRiskChange: 7 }),
          h12: createMockForecastPoint({ projectedRiskScore: 68, projectedRainfall_mm: 85, riskTrend: 'RISING', projectedRiskChange: 23 }),
          h24: createMockForecastPoint({ projectedRiskScore: 60, projectedRainfall_mm: 40, riskTrend: 'IMPROVING', projectedRiskChange: 15 }),
        },
        basinInfluence: {
          has_upstream_influence: true,
          upstream_connections_count: 1,
          total_projected_basin_surge: 16.5,
          active_upstream_threats: [
            {
              upstream_district_id: 'bhadradri_kothagudem',
              upstream_district_name: 'Bhadradri Kothagudem',
              water_body_name: 'Godavari River Reach',
              travel_window_hours: 6,
              estimated_arrival: '+6h',
              upstream_risk_score: 75,
              projected_downstream_impact_score: 16.5,
              evidence: 'Heavy discharge from upstream barrages',
            },
          ],
          basin_summary_text: 'Active upstream discharge reaching Mulugu within 6-12 hours.',
        },
        dataConfidence: 'HIGH',
        confidenceReason: 'Verified basin hydrological monitoring',
        dataMode: 'SIMULATED_FORECAST',
        sourcesAttribution: ['CWC Hydrology', 'IMD Grid', 'Citizen Reports'],
        disclaimer: 'Prototype simulation',
        generatedAt: new Date().toISOString(),
      },
    });

    const alert = AlertEngine.evaluateDistrictAlert(district);
    assert(alert.basin_signal.has_upstream_threat === true, 'Basin threat is flagged active');
    assert(alert.basin_signal.projected_surge_score > 10, 'Basin surge magnitude correctly extracted');
    assert(alert.trigger_reasons.some(r => r.toLowerCase().includes('basin') || r.toLowerCase().includes('upstream')), 'Trigger reasons include basin propagation evidence');
  }

  // Test 6: Citizen Ground Report Surge Escalation
  {
    const district = createMockDistrict({
      district: 'Warangal',
      flood_risk_score: 48,
      risk_category: 'MODERATE',
      citizen_reports_count: 8,
      citizen_reports_high_severity: 4,
      citizen_report_score: 85,
    });

    const alert = AlertEngine.evaluateDistrictAlert(district);
    assert(alert.citizen_signal.is_surging === true, 'Citizen ground surge signal flagged surging');
    assert(alert.citizen_signal.high_severity_count >= 3, 'High severity reports detected');
  }

  // Test 7: Rapid Escalation Trigger (Delta >= 15 pts)
  {
    const district = createMockDistrict({
      district: 'Khammam',
      flood_risk_score: 40,
      risk_category: 'MODERATE',
      forecast_summary: createMockForecastPoint({
        riskTrend: 'RISING',
        projectedRiskScore: 62,
        projectedRiskChange: 22,
        confidence: 'HIGH',
      }),
    });

    const alert = AlertEngine.evaluateDistrictAlert(district);
    assert(alert.risk_delta === 22, 'Risk delta accurately computed');
    assert(alert.alert_level === 'HIGH' || alert.alert_level === 'ELEVATED', 'Rapid spike escalates alert status');
  }

  // Test 8: Bilingual Telugu and English Advisories
  {
    const district = createMockDistrict({
      district: 'Hyderabad',
      flood_risk_score: 78,
      risk_category: 'CRITICAL',
      rainfall_mm_24h: 120,
    });

    const alert = AlertEngine.evaluateDistrictAlert(district);
    assert(alert.advisories.english.title.length > 5, 'English title is robust');
    assert(alert.advisories.telugu.title.length > 5, 'Telugu title is robust');
    assert(alert.advisories.telugu.situation_summary.length > 10, 'Telugu summary is rendered');
    assert(alert.advisories.telugu.recommended_precautions.length >= 3, 'Telugu precautions are rendered');
    assert(alert.advisories.english.authority_disclaimer.includes('Disaster Management') || alert.advisories.english.authority_disclaimer.includes('TGSDMA'), 'Authority disclaimer is present');
  }

  console.log(`\n====================================================`);
  console.log(`Test Summary: ${passedTests} / ${totalTests} Passed (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log(`====================================================\n`);

  if (passedTests === totalTests) {
    console.log('🎉 ALL ALERT ENGINE DECISION SUPPORT TESTS PASSED PERFECTLY!');
  } else {
    process.exit(1);
  }
}

runAlertEngineTests();
