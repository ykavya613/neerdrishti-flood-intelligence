import { DistrictStatus } from '../types';
import { 
  UserQuestionIntent, 
  IntentDetectionResult, 
  EvidencePackage, 
  GroundedAIResponse,
  DistrictComparisonSummary,
  ForecastMatrixSummary,
  AlertSummaryEvidence,
  BasinEvidence,
  CitizenSummaryEvidence,
  IoTEvidence,
  DataProvenanceSummary
} from '../types/ai';
import { intentService } from './intent_service';
import { knowledgeService } from './knowledge_service';
import { normalizeDistrict } from './district_normalizer';
import { getUpstreamConnections, getDownstreamConnections } from './basin_routing_service';
import { centralDataCoordinator } from './data/data_connector';
import { iotDeviceRegistry } from './data/iot_device_registry';
import { callLlamaChat, getLlamaConfig, extractJsonFromText } from './llama_client';

export class AIIntelligenceService {
  constructor() {}

  /**
   * Builds compact, relevant evidence package for the detected intent and entity.
   */
  public buildEvidencePackage(
    query: string,
    allDistricts: DistrictStatus[],
    intentResult?: IntentDetectionResult
  ): EvidencePackage {
    const detectedIntent = intentResult || intentService.detectIntent(query);
    const lang = detectedIntent.language;
    const badges: string[] = [];

    let primaryDistrict: DistrictStatus | undefined;
    let secondaryDistrict: DistrictStatus | undefined;

    if (detectedIntent.detectedDistricts.length > 0) {
      primaryDistrict = allDistricts.find(
        d => d.district_id === detectedIntent.detectedDistricts[0] ||
             d.district.toLowerCase() === detectedIntent.detectedDistricts[0].toLowerCase()
      );
    }

    if (detectedIntent.detectedDistricts.length > 1) {
      secondaryDistrict = allDistricts.find(
        d => d.district_id === detectedIntent.detectedDistricts[1] ||
             d.district.toLowerCase() === detectedIntent.detectedDistricts[1].toLowerCase()
      );
    }

    // Default primary district if none found but needed
    if (!primaryDistrict && allDistricts.length > 0) {
      // Pick highest risk district as default subject
      primaryDistrict = allDistricts.reduce((max, d) => (d.flood_risk_score > max.flood_risk_score ? d : max), allDistricts[0]);
    }

    // 1. Comparison Summary
    let comparisonSummary: DistrictComparisonSummary | undefined;
    if (primaryDistrict && secondaryDistrict) {
      const scoreDiff = Math.round((primaryDistrict.flood_risk_score - secondaryDistrict.flood_risk_score) * 10) / 10;
      const higherRisk = scoreDiff >= 0 ? primaryDistrict.district : secondaryDistrict.district;
      const rainDiff = Math.round((primaryDistrict.rainfall_mm_24h - secondaryDistrict.rainfall_mm_24h) * 10) / 10;
      const higherRain = rainDiff >= 0 ? primaryDistrict.district : secondaryDistrict.district;

      comparisonSummary = {
        districtA: primaryDistrict.district,
        districtIdA: primaryDistrict.district_id || '',
        scoreA: primaryDistrict.flood_risk_score,
        categoryA: primaryDistrict.risk_category,
        rainfall24hA: primaryDistrict.rainfall_mm_24h,
        alertLevelA: primaryDistrict.alert_intelligence?.alert_level || 'NORMAL',
        forecastTrendA: primaryDistrict.forecast_summary?.riskTrend || 'STABLE',
        projectedPeakA: primaryDistrict.forecast_summary?.projectedRiskScore ?? primaryDistrict.flood_risk_score,
        citizenReportsA: primaryDistrict.citizen_reports_count,
        dataConfidenceA: primaryDistrict.data_confidence,
        dataModeA: primaryDistrict.data_source_mode,
        basinA: primaryDistrict.river_basin,

        districtB: secondaryDistrict.district,
        districtIdB: secondaryDistrict.district_id || '',
        scoreB: secondaryDistrict.flood_risk_score,
        categoryB: secondaryDistrict.risk_category,
        rainfall24hB: secondaryDistrict.rainfall_mm_24h,
        alertLevelB: secondaryDistrict.alert_intelligence?.alert_level || 'NORMAL',
        forecastTrendB: secondaryDistrict.forecast_summary?.riskTrend || 'STABLE',
        projectedPeakB: secondaryDistrict.forecast_summary?.projectedRiskScore ?? secondaryDistrict.flood_risk_score,
        citizenReportsB: secondaryDistrict.citizen_reports_count,
        dataConfidenceB: secondaryDistrict.data_confidence,
        dataModeB: secondaryDistrict.data_source_mode,
        basinB: secondaryDistrict.river_basin,

        scoreDifference: scoreDiff,
        higherRiskDistrict: higherRisk,
        rainfallDifference: rainDiff,
        higherRainfallDistrict: higherRain,
        alertComparison: `${primaryDistrict.district} is at ${primaryDistrict.alert_intelligence?.alert_level || 'NORMAL'} while ${secondaryDistrict.district} is at ${secondaryDistrict.alert_intelligence?.alert_level || 'NORMAL'}`,
        comparisonTakeaway: `${higherRisk} exhibits higher composite risk (+${Math.abs(scoreDiff)} pts) driven primarily by ${Math.abs(scoreDiff) > 10 ? 'elevated rainfall and drainage vulnerability' : 'close hydrological parameters'}.`,
      };
      badges.push('District Comparison Matrix');
    }

    // 2. Forecast Matrix Summary across 33 districts
    const risingDistricts = allDistricts.filter(d => d.forecast_summary?.riskTrend === 'RISING').map(d => d.district);
    const criticalProjections = allDistricts.filter(d => d.forecast_summary?.outlookCategory === 'CRITICAL_PROJECTION').map(d => d.district);
    const highProjections = allDistricts.filter(d => d.forecast_summary?.outlookCategory === 'HIGH_PROJECTION').map(d => d.district);
    
    let maxProjectedDistrict = allDistricts[0];
    for (const d of allDistricts) {
      const proj = d.forecast_summary?.projectedRiskScore ?? d.flood_risk_score;
      const curMax = maxProjectedDistrict.forecast_summary?.projectedRiskScore ?? maxProjectedDistrict.flood_risk_score;
      if (proj > curMax) {
        maxProjectedDistrict = d;
      }
    }

    const forecastMatrixSummary: ForecastMatrixSummary = {
      highestProjectedDistrict: maxProjectedDistrict.district,
      highestProjectedScore: maxProjectedDistrict.forecast_summary?.projectedRiskScore ?? maxProjectedDistrict.flood_risk_score,
      highestProjectedHorizon: `+${maxProjectedDistrict.forecast_summary?.forecastHorizonHours || 6}H`,
      risingTrendDistricts: risingDistricts,
      criticalProjectionDistricts: criticalProjections,
      highProjectionDistricts: highProjections,
      totalRisingCount: risingDistricts.length,
      horizonSummary: `Forecast modeling across 33 districts projects peak risks between +6H and +12H, with ${risingDistricts.length} districts in rising trend.`,
    };

    if (detectedIntent.intent === 'FORECAST') {
      badges.push('Multi-Horizon Forecast Engine');
    }

    // 3. Alert Summary Evidence
    const activeCritical = allDistricts.filter(d => d.alert_intelligence?.alert_level === 'CRITICAL').map(d => d.district);
    const activeHigh = allDistricts.filter(d => d.alert_intelligence?.alert_level === 'HIGH').map(d => d.district);
    const activeWatch = allDistricts.filter(d => d.alert_intelligence?.alert_level === 'WATCH' || d.alert_intelligence?.alert_level === 'ELEVATED').map(d => d.district);

    let targetAlertInfo = undefined;
    if (primaryDistrict?.alert_intelligence) {
      const ai = primaryDistrict.alert_intelligence;
      targetAlertInfo = {
        districtName: primaryDistrict.district,
        alertLevel: ai.alert_level,
        alertType: ai.primary_alert_type,
        triggerReasons: ai.trigger_reasons,
        confidence: primaryDistrict.data_confidence || 'HIGH',
        isBasinThreat: ai.basin_signal?.has_upstream_threat || false,
        isCitizenSurge: ai.citizen_signal?.is_surging || false,
        isRapidEscalation: ai.rate_of_change === 'RAPID_ESCALATION',
      };
    }

    const alertSummary: AlertSummaryEvidence = {
      activeCriticalDistricts: activeCritical,
      activeHighDistricts: activeHigh,
      activeWatchDistricts: activeWatch,
      totalActiveAlerts: activeCritical.length + activeHigh.length + activeWatch.length,
      targetDistrictAlert: targetAlertInfo,
    };

    if (detectedIntent.intent === 'ALERT_EXPLANATION') {
      badges.push('Multi-Signal Alert Engine');
    }

    // 4. Basin Hydrological Evidence
    let basinEvidence: BasinEvidence | undefined;
    if (primaryDistrict) {
      const pId = primaryDistrict.district_id || '';
      const upstream = getUpstreamConnections(pId).map(c => c.upstream_district_id);
      const downstream = getDownstreamConnections(pId).map(c => c.downstream_district_id);
      basinEvidence = {
        districtName: primaryDistrict.district,
        riverBasin: primaryDistrict.river_basin,
        upstreamDistricts: upstream,
        downstreamDistricts: downstream,
        propagationSurgePoints: primaryDistrict.forecast_timeline?.basinInfluence?.total_projected_basin_surge || 0,
        travelTimeHours: '3-6 Hours',
        basinSummary: primaryDistrict.forecast_timeline?.basinInfluence?.basin_summary_text || `Basin connections for ${primaryDistrict.river_basin}`,
      };
      badges.push('Basin Hydrological Routing');
    }

    // 5. Citizen Summary Evidence
    let citizenSummary: CitizenSummaryEvidence | undefined;
    if (primaryDistrict) {
      citizenSummary = {
        districtName: primaryDistrict.district,
        totalReports: primaryDistrict.citizen_reports_count,
        reports24h: primaryDistrict.citizen_reports_24h || 0,
        highSeverityReports: primaryDistrict.citizen_reports_high_severity,
        criticalReports: primaryDistrict.citizen_reports_critical || 0,
        citizenReportScore: primaryDistrict.citizen_report_score,
        contributionPoints: primaryDistrict.contributions.citizen_reports,
        recentTrend: primaryDistrict.citizen_reports_trend || 'Stable',
        explainability: primaryDistrict.citizen_explainability,
      };
      badges.push('Crowdsourced Citizen Signals');
    }

    // 6. Knowledge Base Snippets via RAG
    const knowledgeSnippets = knowledgeService.searchKnowledge(
      query,
      primaryDistrict?.district_id || primaryDistrict?.district,
      3
    );
    if (knowledgeSnippets.length > 0) {
      badges.push('Verified Knowledge Base');
    }

    // 7. IoT Telemetry Evidence
    let iotEvidence: IoTEvidence | undefined;
    const activeDataMode = centralDataCoordinator.getActiveMode();
    const allIotDevices = iotDeviceRegistry.getAllDevices();

    if (primaryDistrict) {
      const dDevices = iotDeviceRegistry.getDevicesByDistrict(primaryDistrict.district_id || primaryDistrict.district);
      if (dDevices.length > 0) {
        badges.push('⚡ VIRTUAL IOT DEMONSTRATION');
        iotEvidence = {
          activeMode: activeDataMode,
          totalDevices: allIotDevices.length,
          districtDevicesCount: dDevices.length,
          devices: dDevices.map(d => ({
            deviceId: d.device_id,
            sensorType: d.sensor_type,
            value: d.current_value,
            unit: d.unit,
            status: d.status,
            isVirtual: d.is_virtual,
          })),
        };
      }
    }

    // 8. Data Provenance Summary & Transparency Badges
    const isSim = primaryDistrict ? Boolean(primaryDistrict.is_simulated || primaryDistrict.rainfall_data_mode === 'SIMULATED') : false;
    const isProto = primaryDistrict ? primaryDistrict.monitoring_category === 'Limited Data' : false;

    if (isSim) {
      badges.push('⚡ SIMULATION DATA USED');
    }
    if (isProto) {
      badges.push('⚡ PROTOTYPE BASELINE');
    }

    const priorityDistrictIds = ['hyderabad', 'warangal', 'nirmal', 'mancherial', 'bhadradri_kothagudem'];
    const isLimitedKnowledge = primaryDistrict && !priorityDistrictIds.includes(primaryDistrict.district_id || primaryDistrict.district.toLowerCase().replace(/\s+/g, '_'));

    const limitationsList: string[] = [
      'Advisory decision-support prototype; not a replacement for statutory emergency directives.',
    ];
    if (isLimitedKnowledge) {
      limitationsList.push('District-specific knowledge is currently limited. This response is based on the current NeerDrishti operational data and available monitoring information.');
    } else if (primaryDistrict?.data_limitation_notes) {
      limitationsList.push(primaryDistrict.data_limitation_notes);
    } else {
      limitationsList.push('Continuous telemetry calibration active.');
    }

    const dataProvenance: DataProvenanceSummary = {
      dataMode: primaryDistrict?.data_source_mode || 'Prototype Baseline',
      dataConfidence: primaryDistrict?.data_confidence || 'Medium',
      riskCompletenessPercentage: primaryDistrict?.risk_data_completeness || 80,
      sourcesAttribution: [
        primaryDistrict?.rainfall_source || 'Rainfall Telemetry Matrix',
        'State Hydrology Gauging Mesh',
        'Verified Citizen Hazard Submissions',
      ],
      limitations: limitationsList,
      isSimulated: isSim,
      isPrototype: isProto,
    };

    badges.push('Deterministic 5-Factor Risk Model');

    return {
      query,
      intent: detectedIntent.intent,
      language: lang,
      primaryDistrict,
      secondaryDistrict,
      comparisonSummary,
      forecastMatrixSummary,
      alertSummary,
      basinEvidence,
      citizenSummary,
      iotEvidence,
      knowledgeSnippets,
      dataProvenance,
      transparencyBadges: Array.from(new Set(badges)),
    };
  }

  /**
   * Main unified entry point: Answers questions with structured evidence grounding.
   */
  public async answer_question(
    query: string,
    language?: 'en' | 'te' | 'hi',
    districtContext?: string,
    allDistricts: DistrictStatus[] = []
  ): Promise<GroundedAIResponse> {
    const detectedIntent = intentService.detectIntent(query, districtContext);
    const targetLang = language || detectedIntent.language;
    detectedIntent.language = targetLang;

    const evidence = this.buildEvidencePackage(query, allDistricts, detectedIntent);

    // Try Meta Llama API first
    try {
      const llamaResponse = await this.callLlama(evidence);
      if (llamaResponse) {
        return llamaResponse;
      }
    } catch (err) {
      console.warn('[AIIntelligenceService] Meta Llama API call failed, falling back to deterministic synthesis:', err);
    }

    // High quality deterministic grounded fallback
    return this.generateDeterministicResponse(evidence);
  }

  /**
   * Explains single district risk in depth.
   */
  public async explain_district_risk(
    districtId: string,
    language?: 'en' | 'te' | 'hi',
    allDistricts: DistrictStatus[] = []
  ): Promise<GroundedAIResponse> {
    const norm = normalizeDistrict(districtId);
    const dName = norm.resolved ? norm.canonicalName : districtId;
    const query = language === 'te' 
      ? `${dName} జిల్లా వరద ముప్పు వివరాలు మరియు కారణాలు ఏమిటి?`
      : language === 'hi'
      ? `${dName} जिले के बाढ़ जोखिम कारक और वर्तमान स्थिति क्या है?`
      : `Explain the current flood risk, mathematical factors, and situation for ${dName}`;
    
    return this.answer_question(query, language, norm.districtId, allDistricts);
  }

  /**
   * Compares two districts.
   */
  public async compare_districts(
    districtId1: string,
    districtId2: string,
    language?: 'en' | 'te' | 'hi',
    allDistricts: DistrictStatus[] = []
  ): Promise<GroundedAIResponse> {
    const norm1 = normalizeDistrict(districtId1);
    const norm2 = normalizeDistrict(districtId2);
    const name1 = norm1.resolved ? norm1.canonicalName : districtId1;
    const name2 = norm2.resolved ? norm2.canonicalName : districtId2;

    const query = language === 'te'
      ? `${name1} మరియు ${name2} జిల్లాల వరద ముప్పును పోల్చండి`
      : language === 'hi'
      ? `${name1} और ${name2} जिलों के बाढ़ जोखिम की तुलना करें`
      : `Compare flood risk situation between ${name1} and ${name2}`;

    return this.answer_question(query, language, undefined, allDistricts);
  }

  /**
   * Explains forecast projections across horizons.
   */
  public async explain_forecast(
    districtIdOrHorizon: string,
    language?: 'en' | 'te' | 'hi',
    allDistricts: DistrictStatus[] = []
  ): Promise<GroundedAIResponse> {
    const norm = normalizeDistrict(districtIdOrHorizon);
    const query = norm.resolved
      ? (language === 'te' ? `${norm.canonicalName} భవిష్యత్ వరద అంచనాలు ఎలా ఉన్నాయి?` : language === 'hi' ? `${norm.canonicalName} का पूर्वानुमान और उच्चतम जोखिम क्या है?` : `What is the forecast trajectory and peak risk for ${norm.canonicalName}?`)
      : (language === 'te' ? `తెలంగాణలో పెరుగుతున్న వరద ముప్పు ఉన్న జిల్లాలు ఏవి?` : language === 'hi' ? `तेलंगाना में बढ़ते बाढ़ जोखिम वाले जिले कौन से हैं?` : `Which districts have rising forecast risk and peak horizons?`);

    return this.answer_question(query, language, norm.resolved ? norm.districtId : undefined, allDistricts);
  }

  /**
   * Explains alert triggers and public safety rationale.
   */
  public async explain_alert(
    districtId: string,
    language?: 'en' | 'te' | 'hi',
    allDistricts: DistrictStatus[] = []
  ): Promise<GroundedAIResponse> {
    const norm = normalizeDistrict(districtId);
    const dName = norm.resolved ? norm.canonicalName : districtId;
    const query = language === 'te'
      ? `${dName} జిల్లాకు అలర్ట్ ఎందుకు జారీ చేయబడింది?`
      : language === 'hi'
      ? `${dName} जिले के लिए अलर्ट क्यों जारी किया गया है?`
      : `Why is an alert active for ${dName} and what triggered it?`;

    return this.answer_question(query, language, norm.resolved ? norm.districtId : undefined, allDistricts);
  }

  /**
   * Generates authoritative public safety advisory.
   */
  public async generate_public_advisory(
    districtId: string,
    language?: 'en' | 'te' | 'hi',
    allDistricts: DistrictStatus[] = []
  ): Promise<GroundedAIResponse> {
    const norm = normalizeDistrict(districtId);
    const dName = norm.resolved ? norm.canonicalName : districtId;
    const query = language === 'te'
      ? `${dName} జిల్లా ప్రజలకు రక్షణ సలహాలు మరియు మార్గదర్శకాలు`
      : language === 'hi'
      ? `${dName} जिले के लिए सार्वजनिक सुरक्षा सलाह और निर्देश`
      : `Generate public safety advisory and guidance for ${dName}`;

    return this.answer_question(query, language, norm.resolved ? norm.districtId : undefined, allDistricts);
  }

  /**
   * Invokes Meta Llama using OpenAI-compatible protocol with strictly grounded prompt & schema.
   */
  private async callLlama(evidence: EvidencePackage): Promise<GroundedAIResponse | null> {
    const config = getLlamaConfig();
    const primary = evidence.primaryDistrict;
    const secondary = evidence.secondaryDistrict;
    const comparison = evidence.comparisonSummary;
    const kbText = evidence.knowledgeSnippets.map(s => `[DOC: ${s.title} (${s.category})]\n${s.content}`).join('\n\n') || 'No additional specialized documents.';

    const systemPrompt = `You are the NeerDrishti Grounded AI Flood Intelligence Engine for the State of Telangana, India powered by Meta Llama.
You provide authoritative, factual, and strictly grounded flood risk intelligence and public safety advisories across 33 Telangana districts.

CRITICAL GROUNDING RULES:
1. Use ONLY the provided evidence. DO NOT invent rainfall amounts, water gauge levels, casualties, official evacuation orders, or government statements.
2. If evidence indicates simulation or prototype, explicitly identify this data provenance.
3. If data or knowledge is unavailable or limited, explicitly state: "Data is currently unavailable in the NeerDrishti system" or "Verified information is currently limited for this district."
4. If the user asks in Telugu or requests Telugu, ensure accurate, respectful, and natural Telugu translation (తెలుగు సలహా). If the user asks in Hindi or requests Hindi, ensure accurate, authoritative Hindi translation (हिन्दी सलाह). Always provide both teluguSummary and hindiSummary in the output JSON.
5. Output clean, valid JSON matching the exact JSON schema provided below.`;

    const promptBody = `USER QUERY: "${evidence.query}"
INTENT: ${evidence.intent}
LANGUAGE: ${evidence.language}

STRUCTURED EVIDENCE:
${primary ? `
PRIMARY DISTRICT: ${primary.district} (ID: ${primary.district_id})
- Current Risk Score: ${primary.flood_risk_score} / 100 (${primary.risk_category})
- 5-Factor Contributions:
  * Rainfall: ${primary.contributions.rainfall} pts (Score: ${primary.rainfall_score}/100, 24h: ${primary.rainfall_mm_24h} mm, 3h: ${primary.rainfall_mm_3h} mm, Mode: ${primary.rainfall_data_mode || 'SIMULATED'})
  * Flood History: ${primary.contributions.flood_history} pts (Score: ${primary.flood_history_score}/100)
  * Terrain / Location: ${primary.contributions.location_risk} pts (Score: ${primary.location_risk_score}/100, ${primary.terrain_type})
  * Citizen Reports: ${primary.contributions.citizen_reports} pts (Score: ${primary.citizen_report_score}/100, Total: ${primary.citizen_reports_count}, High Severity: ${primary.citizen_reports_high_severity})
  * Drainage Vulnerability: ${primary.contributions.drainage_vulnerability} pts (Score: ${primary.drainage_vulnerability_score}/100, Hotspots: ${primary.vulnerable_hotspots || 'None'})
- Operational Situation: ${primary.situation_summary?.operationalSituation || 'MONITORING'}
- Forecast Outlook: ${primary.forecast_summary?.outlookCategory || 'NORMAL_OUTLOOK'} (Trend: ${primary.forecast_summary?.riskTrend || 'STABLE'}, Projected Peak: ${primary.forecast_summary?.projectedRiskScore ?? primary.flood_risk_score}/100 at +${primary.forecast_summary?.forecastHorizonHours || 6}H)
- Alert Level: ${primary.alert_intelligence?.alert_level || 'NORMAL'} (Triggers: ${primary.alert_intelligence?.trigger_reasons?.join('; ') || 'None'})
- River Basin: ${primary.river_basin}
- Data Provenance: ${primary.data_source_mode} (Confidence: ${primary.data_confidence})
` : 'No single primary district targeted.'}

${secondary ? `
SECONDARY DISTRICT FOR COMPARISON: ${secondary.district} (ID: ${secondary.district_id})
- Current Risk Score: ${secondary.flood_risk_score} / 100 (${secondary.risk_category})
- 24h Rainfall: ${secondary.rainfall_mm_24h} mm
- Forecast Trend: ${secondary.forecast_summary?.riskTrend || 'STABLE'}
- Alert Level: ${secondary.alert_intelligence?.alert_level || 'NORMAL'}
- River Basin: ${secondary.river_basin}
` : ''}

${comparison ? `
NUMERIC COMPARISON SUMMARY:
- Score Difference: ${comparison.scoreDifference} pts (${comparison.higherRiskDistrict} higher)
- Rainfall Difference: ${comparison.rainfallDifference} mm (${comparison.higherRainfallDistrict} higher)
- Alert Comparison: ${comparison.alertComparison}
- Takeaway: ${comparison.comparisonTakeaway}
` : ''}

${evidence.forecastMatrixSummary ? `
33-DISTRICT FORECAST MATRIX:
- Highest Projected District: ${evidence.forecastMatrixSummary.highestProjectedDistrict} (${evidence.forecastMatrixSummary.highestProjectedScore}/100 at ${evidence.forecastMatrixSummary.highestProjectedHorizon})
- Rising Trend Districts: ${evidence.forecastMatrixSummary.risingTrendDistricts.join(', ') || 'None'}
- Critical/High Projections: ${[...evidence.forecastMatrixSummary.criticalProjectionDistricts, ...evidence.forecastMatrixSummary.highProjectionDistricts].join(', ') || 'None'}
` : ''}

${evidence.alertSummary ? `
ALERT MATRIX SUMMARY:
- Active Critical Districts: ${evidence.alertSummary.activeCriticalDistricts.join(', ') || 'None'}
- Active High Districts: ${evidence.alertSummary.activeHighDistricts.join(', ') || 'None'}
- Active Watch Districts: ${evidence.alertSummary.activeWatchDistricts.join(', ') || 'None'}
` : ''}

RETRIEVED KNOWLEDGE BASE:
${kbText}

DATA PROVENANCE:
- Mode: ${evidence.dataProvenance.dataMode}
- Confidence: ${evidence.dataProvenance.dataConfidence}
- Is Simulated: ${evidence.dataProvenance.isSimulated}
- Is Prototype: ${evidence.dataProvenance.isPrototype}

REQUIRED JSON STRUCTURE:
{
  "directAnswer": "Concise, direct 1-2 sentence response to the user query.",
  "currentSituation": "Detailed summary of the current situation and telemetry.",
  "forecastSection": "Forecast trajectory and peak horizon breakdown (or null if not applicable).",
  "mainFactors": ["Factor 1 with exact numbers", "Factor 2", "Factor 3"],
  "alertSection": "Alert status and triggering signals (or null if normal).",
  "recommendedPrecautions": ["Precaution 1", "Precaution 2", "Precaution 3"],
  "dataMode": "${evidence.dataProvenance.dataMode}",
  "confidence": "${evidence.dataProvenance.dataConfidence}",
  "limitations": "Transparency note regarding prototype and data provenance.",
  "teluguSummary": "స్పష్టమైన తెలుగు సారాంశం మరియు రక్షణ సలహాలు (Accurate Telugu summary).",
  "hindiSummary": "स्पष्ट हिन्दी सारांश और सार्वजनिक सुरक्षा सावधानियां (Accurate Hindi summary).",
  "evidenceUsed": ["Point 1", "Point 2", "Point 3"]
}`;

    const chatResponse = await callLlamaChat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: promptBody }
      ],
      {
        temperature: 0.2,
        jsonMode: true,
        timeoutMs: 15000,
      }
    );

    if (chatResponse && chatResponse.text) {
      try {
        const json = extractJsonFromText(chatResponse.text);
        const compositeAnswer = this.formatCompositeAnswer(json, evidence);

        return {
          answer: compositeAnswer,
          directAnswer: json.directAnswer || '',
          currentSituation: json.currentSituation,
          forecastSection: json.forecastSection,
          mainFactors: json.mainFactors || [],
          alertSection: json.alertSection,
          recommendedPrecautions: json.recommendedPrecautions || [],
          dataMode: json.dataMode || evidence.dataProvenance.dataMode,
          confidence: json.confidence || evidence.dataProvenance.dataConfidence,
          limitations: json.limitations || 'Prototype simulation advisory.',
          teluguSummary: json.teluguSummary,
          hindiSummary: json.hindiSummary,
          evidenceUsed: json.evidenceUsed || [],
          transparencyBadges: [
            ...(evidence.transparencyBadges || []),
            `🤖 Meta Llama (${chatResponse.model})`,
          ],
          intent: evidence.intent,
          districtsInvolved: [
            ...(evidence.primaryDistrict ? [evidence.primaryDistrict.district] : []),
            ...(evidence.secondaryDistrict ? [evidence.secondaryDistrict.district] : []),
          ],
          isSimulated: evidence.dataProvenance.isSimulated,
          isPrototype: evidence.dataProvenance.isPrototype,
          source: 'Meta Llama',
          timestamp: new Date().toISOString(),
        };
      } catch (e) {
        console.warn('[AIIntelligenceService] Failed to parse Meta Llama response JSON:', e);
      }
    }

    return null;
  }

  /**
   * Deterministic grounded response generator used as high-reliability fallback and baseline.
   */
  public generateDeterministicResponse(evidence: EvidencePackage): GroundedAIResponse {
    const primary = evidence.primaryDistrict;
    const secondary = evidence.secondaryDistrict;
    const comp = evidence.comparisonSummary;
    const isTe = evidence.language === 'te';
    const isHi = evidence.language === 'hi';

    let directAnswer = '';
    let currentSituation = '';
    let forecastSection: string | undefined = undefined;
    let mainFactors: string[] = [];
    let alertSection: string | undefined = undefined;
    let recommendedPrecautions: string[] = isHi
      ? [
          'जलमग्न सड़कों, निचले रास्तों और भरे हुए अंडरपास से यात्रा करने से बचें।',
          'खुले नालों, नदी के किनारों और बिजली के ट्रांसफार्मरों से सुरक्षित दूरी बनाए रखें।',
          'तेलंगाना राज्य आपदा प्रबंधन प्राधिकरण (TGSDMA) के आधिकारिक निर्देशों पर नज़र रखें।',
        ]
      : [
          'Avoid navigating through flooded roads, low-lying causeways, and inundated underpasses.',
          'Stay clear of open stormwater drains (nalas), riverbanks, and electrical transformers.',
          'Monitor official advisories from the Telangana State Disaster Management Authority (TGSDMA).',
        ];
    let teluguSummary = '';
    let hindiSummary = '';
    let evidenceUsed: string[] = [];

    // 1. Comparison Intent
    if (evidence.intent === 'DISTRICT_COMPARISON' && comp) {
      directAnswer = isTe
        ? `${comp.higherRiskDistrict} జిల్లాలో (${comp.scoreDifference >= 0 ? comp.scoreA : comp.scoreB}/100) ${comp.higherRiskDistrict === comp.districtA ? comp.districtB : comp.districtA} కంటే ఎక్కువ వరద ముప్పు (+${Math.abs(comp.scoreDifference)} పాయింట్లు) ఉంది.`
        : isHi
        ? `${comp.higherRiskDistrict} जिले में (${comp.scoreDifference >= 0 ? comp.scoreA : comp.scoreB}/100) ${comp.higherRiskDistrict === comp.districtA ? comp.districtB : comp.districtA} की तुलना में अधिक बाढ़ जोखिम (+${Math.abs(comp.scoreDifference)} अंक) है।`
        : `${comp.higherRiskDistrict} has a higher flood risk (${comp.higherRiskDistrict === comp.districtA ? comp.scoreA : comp.scoreB}/100) compared to ${comp.higherRiskDistrict === comp.districtA ? comp.districtB : comp.districtA} (${comp.higherRiskDistrict === comp.districtA ? comp.scoreB : comp.scoreA}/100), with a difference of +${Math.abs(comp.scoreDifference)} points.`;

      currentSituation = isHi
        ? `तुलनात्मक टेलीमेट्री विश्लेषण: ${comp.districtA} (${comp.categoryA} जोखिम, ${comp.rainfall24hA} मिमी 24h वर्षा, ${comp.citizenReportsA} नागरिक रिपोर्ट) बनाम ${comp.districtB} (${comp.categoryB} जोखिम, ${comp.rainfall24hB} मिमी 24h वर्षा, ${comp.citizenReportsB} नागरिक रिपोर्ट)।`
        : `Comparative telemetry highlights ${comp.districtA} (${comp.categoryA} Risk, ${comp.rainfall24hA} mm 24h rain, ${comp.citizenReportsA} citizen reports) vs ${comp.districtB} (${comp.categoryB} Risk, ${comp.rainfall24hB} mm 24h rain, ${comp.citizenReportsB} citizen reports).`;

      mainFactors = [
        `Risk Index Comparison: ${comp.districtA} (${comp.scoreA}/100) vs ${comp.districtB} (${comp.scoreB}/100) [Delta: ${comp.scoreDifference > 0 ? '+' : ''}${comp.scoreDifference} pts]`,
        `Precipitation Telemetry: ${comp.districtA} (${comp.rainfall24hA} mm) vs ${comp.districtB} (${comp.rainfall24hB} mm) [Delta: ${comp.rainfallDifference > 0 ? '+' : ''}${comp.rainfallDifference} mm]`,
        `Forecast Trends: ${comp.districtA} is ${comp.forecastTrendA} (Peak: ${comp.projectedPeakA}/100) vs ${comp.districtB} is ${comp.forecastTrendB} (Peak: ${comp.projectedPeakB}/100)`,
        `Alert Status: ${comp.alertComparison}`,
      ];

      teluguSummary = `${comp.higherRiskDistrict} జిల్లాలో వరద ముప్పు అధికంగా ఉంది. ${comp.districtA} స్కోరు ${comp.scoreA}/100 మరియు ${comp.districtB} స్కోరు ${comp.scoreB}/100. రెండు జిల్లాల ప్రజలు స్థానిక విపత్తు నిర్వహణ బృందాల సూచనలను పాటించాలి.`;
      hindiSummary = `${comp.higherRiskDistrict} जिले में बाढ़ जोखिम अधिक है। ${comp.districtA} का स्कोर ${comp.scoreA}/100 और ${comp.districtB} का स्कोर ${comp.scoreB}/100 है। दोनों जिलों के नागरिक स्थानीय आपदा प्रबंधन दल के निर्देशों का पालन करें।`;

      evidenceUsed = [
        `${comp.districtA}: ${comp.scoreA}/100 score, ${comp.rainfall24hA} mm rain, ${comp.alertLevelA} alert`,
        `${comp.districtB}: ${comp.scoreB}/100 score, ${comp.rainfall24hB} mm rain, ${comp.alertLevelB} alert`,
      ];
    }
    // 2. Forecast Intent
    else if (evidence.intent === 'FORECAST') {
      const fMat = evidence.forecastMatrixSummary;
      if (primary) {
        const peak = primary.forecast_summary?.projectedRiskScore ?? primary.flood_risk_score;
        const horizon = `+${primary.forecast_summary?.forecastHorizonHours || 6}H`;
        const trend = primary.forecast_summary?.riskTrend || 'STABLE';
        const outlook = primary.forecast_summary?.outlookCategory || 'NORMAL_OUTLOOK';

        directAnswer = isTe
          ? `${primary.district} జిల్లాలో భవిష్యత్ వరద ముప్పు ${trend === 'RISING' ? 'పెరుగుతోంది' : 'స్థిరంగా ఉంది'}, ${horizon} వద్ద అంచనా స్కోరు ${peak}/100 (${outlook}).`
          : isHi
          ? `${primary.district} जिले में बाढ़ जोखिम प्रक्षेपवक्र ${trend === 'RISING' ? 'बढ़ रहा है' : 'स्थिर है'}, ${horizon} पर अनुमानित शिखर स्कोर ${peak}/100 (${outlook}) है।`
          : `${primary.district} shows a ${trend} risk trajectory with projected score peaking at ${peak}/100 (${outlook}) at the ${horizon} horizon.`;

        forecastSection = isHi
          ? `पूर्वानुमान प्रक्षेपवक्र: वर्तमान: ${primary.flood_risk_score}/100, +3H: ${primary.forecast_timeline?.timeline?.h3?.projectedRiskScore ?? primary.flood_risk_score}/100, +6H: ${primary.forecast_timeline?.timeline?.h6?.projectedRiskScore ?? primary.flood_risk_score}/100, +12H: ${primary.forecast_timeline?.timeline?.h12?.projectedRiskScore ?? primary.flood_risk_score}/100, +24H: ${primary.forecast_timeline?.timeline?.h24?.projectedRiskScore ?? primary.flood_risk_score}/100।`
          : `Predictive trajectory curves project risk scores: NOW: ${primary.flood_risk_score}/100, +3H: ${primary.forecast_timeline?.timeline?.h3?.projectedRiskScore ?? primary.flood_risk_score}/100, +6H: ${primary.forecast_timeline?.timeline?.h6?.projectedRiskScore ?? primary.flood_risk_score}/100, +12H: ${primary.forecast_timeline?.timeline?.h12?.projectedRiskScore ?? primary.flood_risk_score}/100, +24H: ${primary.forecast_timeline?.timeline?.h24?.projectedRiskScore ?? primary.flood_risk_score}/100.`;

        mainFactors = [
          `Projected peak risk: ${peak}/100 at ${horizon}`,
          `Forecast trend: ${trend} (${outlook})`,
          `Primary drivers: ${primary.forecast_summary?.primaryProjectedDrivers?.map(d => d.evidence).join('; ') || 'Antecedent rainfall accumulation'}`,
          `Basin propagation: ${primary.forecast_timeline?.basinInfluence?.basin_summary_text || 'No upstream surge'}`,
        ];

        teluguSummary = `${primary.district} జిల్లాలో రాబోయే ${horizon} గంటల్లో వరద ముప్పు ${peak}/100 కి చేరుకోవచ్చని అంచనా. నాలాలు మరియు వాగుల పరీవాహక ప్రాంతాల ప్రజలు అప్రమత్తంగా ఉండాలి.`;
        hindiSummary = `${primary.district} जिले में अगले ${horizon} में बाढ़ जोखिम ${peak}/100 तक पहुंचने का अनुमान है। नदी किनारे और निचले जलभराव वाले क्षेत्रों के निवासी सतर्क रहें।`;
      } else if (fMat) {
        directAnswer = isTe
          ? `తెలంగాణలో అత్యధిక అంచనా ముప్పు ${fMat.highestProjectedDistrict} జిల్లాలో ఉంది (${fMat.highestProjectedScore}/100 వద్ద ${fMat.highestProjectedHorizon}). ప్రస్తుతం ${fMat.totalRisingCount} జిల్లాల్లో ముప్పు పెరుగుతోంది.`
          : isHi
          ? `तेलंगाना में उच्चतम अनुमानित जोखिम ${fMat.highestProjectedDistrict} जिले में है (${fMat.highestProjectedScore}/100 पर ${fMat.highestProjectedHorizon})। वर्तमान में ${fMat.totalRisingCount} जिलों में जोखिम बढ़ रहा है।`
          : `Statewide, ${fMat.highestProjectedDistrict} has the highest projected risk (${fMat.highestProjectedScore}/100 at ${fMat.highestProjectedHorizon}). There are currently ${fMat.totalRisingCount} districts showing rising forecast trends.`;

        forecastSection = fMat.horizonSummary;
        mainFactors = [
          `Highest Projected Risk: ${fMat.highestProjectedDistrict} (${fMat.highestProjectedScore}/100)`,
          `Districts with rising trajectory: ${fMat.risingTrendDistricts.join(', ') || 'None'}`,
          `Critical projection districts: ${fMat.criticalProjectionDistricts.join(', ') || 'None'}`,
        ];
        teluguSummary = `తెలంగాణ వ్యాప్తంగా ${fMat.totalRisingCount} జిల్లాల్లో వరద ముప్పు పెరుగుతున్న ధోరణిలో ఉంది. ${fMat.highestProjectedDistrict} అత్యధిక ముప్పును నమోదు చేస్తోంది.`;
        hindiSummary = `तेलंगाना भर में ${fMat.totalRisingCount} जिलों में बाढ़ का रुझान बढ़ रहा है। ${fMat.highestProjectedDistrict} में उच्चतम अनुमानित जोखिम दर्ज किया गया है।`;
      }
    }
    // 3. Alert Explanation Intent
    else if (evidence.intent === 'ALERT_EXPLANATION' && primary) {
      const alert = primary.alert_intelligence;
      const level = alert?.alert_level || 'NORMAL';
      const triggers = alert?.trigger_reasons || ['Baseline telemetry within normal limits'];

      directAnswer = isTe
        ? `${primary.district} జిల్లాలో ప్రస్తుతం ${level === 'CRITICAL' ? 'తీవ్ర అత్యవసర (CRITICAL)' : level === 'HIGH' ? 'అధిక (HIGH)' : level === 'WATCH' ? 'హెచ్చరిక (WATCH)' : 'సాధారణ (NORMAL)'} అలర్ట్ అమలులో ఉంది.`
        : isHi
        ? `${primary.district} जिले में वर्तमान में ${level === 'CRITICAL' ? 'गंभीर (CRITICAL)' : level === 'HIGH' ? 'उच्च (HIGH)' : level === 'WATCH' ? 'निगरानी (WATCH)' : 'सामान्य (NORMAL)'} अलर्ट लागू है।`
        : `${primary.district} is currently under ${level} alert status triggered by multi-signal convergence.`;

      alertSection = isHi
        ? `अलर्ट स्तर: ${level} (विश्वसनीयता: ${alert?.confidence || 'HIGH'})। ट्रिगर्स: ${triggers.join('; ')}।`
        : `Alert Level: ${level} (Confidence: ${alert?.confidence || 'HIGH'}). Triggers: ${triggers.join('; ')}.`;
      mainFactors = triggers.map(t => `Trigger Signal: ${t}`);

      teluguSummary = `${primary.district} జిల్లాకు ${level} అలర్ట్ జారీ చేయబడింది. కారణాలు: ${triggers.slice(0, 2).join(', ')}. లోతట్టు ప్రాంత వాసులు అప్రమత్తంగా ఉండాలి.`;
      hindiSummary = `${primary.district} जिले के लिए ${level} अलर्ट सक्रिय है। मुख्य ट्रिगर: ${triggers.slice(0, 2).join(', ')}। निचले इलाकों के निवासी सतर्क रहें और आधिकारिक निर्देशों का पालन करें।`;
      evidenceUsed = triggers;
    }
    // 4. Safety Guidance Intent
    else if (evidence.intent === 'SAFETY_GUIDANCE') {
      directAnswer = isTe
        ? `వరద సమయంలో రక్షణ కొరకు: లోతట్టు ప్రాంతాలు మరియు నీటితో నిండిన అండర్‌పాస్‌లను దాటవద్దు, విద్యుత్ స్తంభాలను తాకవద్దు, అత్యవసర కిట్ సిద్ధంగా ఉంచుకోండి.`
        : isHi
        ? `बाढ़ सुरक्षा के मुख्य नियम: बहते बाढ़ के पानी में कभी न चलें या गाड़ी न चलाएं, जलमग्न अंडरपास और खुले नालों से दूर रहें, और आपातकालीन हेल्पलाइन 1070 को याद रखें।`
        : `Key flood safety rules: Never walk or drive through floodwaters ('Turn Around, Don't Drown'), avoid low underpasses, stay away from open nalas and electrical infrastructure, and heed TGSDMA alerts.`;

      currentSituation = isHi
        ? `आपदा प्रबंधन मानकों पर आधारित शहरी एवं नदी बाढ़ सुरक्षा प्रोटोकॉल।`
        : `Safety protocols for urban and riverine flood events based on disaster management standards.`;
      mainFactors = [
        'Life Safety: 15 cm of moving water can sweep an adult; 30 cm can float light vehicles.',
        'Electrical Hazard: Avoid contact with submerged power lines, junction boxes, or transformers.',
        'Drainage Hazard: Extreme suction near open drains (nalas) and lake surplus gates.',
        'Emergency Supplies: Potable water, dry rations, torch, power bank, and waterproof doc pouch. Helpline: 1070 / 112.',
      ];

      teluguSummary = `వరద రక్షణ ముఖ్య సూచనలు: ప్రవహించే వరద నీటిలో నడవద్దు లేదా వాహనాలు నడపవద్దు. నాలాలు, వాగుల వద్దకు వెళ్లవద్దు. విద్యుత్ తీగలు మరియు స్తంభాలకు దూరంగా ఉండండి. జిల్లా యంత్రాంగం ఇచ్చే ఆదేశాలను పాటించండి.`;
      hindiSummary = `बाढ़ सुरक्षा निर्देश: बहते बाढ़ के पानी और जलमग्न सड़कों पर न जाएं। खुले नालों, बिजली के खंभों और ट्रांसफार्मरों से दूरी बनाए रखें। आपातकालीन किट (पेयजल, टॉर्च, पावर बैंक) तैयार रखें और जिला प्रशासन के निर्देशों का पालन करें।`;
      evidenceUsed = ['NeerDrishti Flood Safety Knowledge Base (knowledge_base/flood_safety/flood_safety.md)'];
    }
    // 5. Default District Risk Assessment
    else if (primary) {
      directAnswer = isTe
        ? `${primary.district} జిల్లాలో ప్రస్తుత వరద ముప్పు స్కోరు ${primary.flood_risk_score}/100 (${primary.risk_category} స్థాయి) గా లెక్కించబడింది.`
        : isHi
        ? `${primary.district} जिले में वर्तमान बाढ़ जोखिम स्कोर ${primary.flood_risk_score}/100 (${primary.risk_category} श्रेणी) निर्धारित किया गया है।`
        : `${primary.district} is currently categorized at ${primary.risk_category} flood risk with a calculated composite score of ${primary.flood_risk_score}/100.`;

      currentSituation = isHi
        ? `${primary.district} में पिछले 24 घंटों में ${primary.rainfall_mm_24h} मिमी वर्षा (3 घंटे में तीव्र वर्षा: ${primary.rainfall_mm_3h} मिमी) और ${primary.citizen_reports_count} नागरिक संकट रिपोर्ट दर्ज की गई हैं। यह क्षेत्र ${primary.river_basin} बेसिन के अंतर्गत आता है।`
        : `${primary.district} has recorded 24h rainfall of ${primary.rainfall_mm_24h} mm (3h burst: ${primary.rainfall_mm_3h} mm) with ${primary.citizen_reports_count} verified citizen hazard alerts (${primary.citizen_reports_high_severity} high/critical). Terrain is ${primary.terrain_type} within the ${primary.river_basin}.`;

      mainFactors = [
        `24h Precipitation: ${primary.rainfall_mm_24h} mm (Rainfall Score: ${primary.rainfall_score}/100, Contribution: ${primary.contributions.rainfall} pts)`,
        `Historical Flood Susceptibility: ${primary.flood_history_score}/100 (Contribution: ${primary.contributions.flood_history} pts)`,
        `Location / Terrain Vulnerability: ${primary.location_risk_score}/100 (${primary.terrain_type}, Contribution: ${primary.contributions.location_risk} pts)`,
        `Crowdsourced Citizen Ground Reports: ${primary.citizen_reports_count} reports (Score: ${primary.citizen_report_score}/100, Contribution: ${primary.contributions.citizen_reports} pts)`,
        `Drainage & Nala Constraints: ${primary.drainage_vulnerability_score}/100 (Contribution: ${primary.contributions.drainage_vulnerability} pts, Hotspots: ${primary.vulnerable_hotspots || 'Standard drain network'})`,
      ];

      if (primary.alert_intelligence?.alert_level && primary.alert_intelligence.alert_level !== 'NORMAL') {
        alertSection = `Active Alert: ${primary.alert_intelligence.alert_level} (${primary.alert_intelligence.trigger_reasons?.join('; ') || 'Threshold exceeded'})`;
      }

      teluguSummary = `${primary.district} జిల్లాలో వరద ముప్పు ${primary.risk_category} స్థాయిలో (${primary.flood_risk_score}/100) ఉంది. గత 24 గంటల్లో ${primary.rainfall_mm_24h} మి.మీ వర్షపాతం నమోదైంది. లోతట్టు మరియు నాలాల సమీప ప్రజలు జాగ్రత్తగా ఉండాలి.`;
      hindiSummary = `${primary.district} जिले में वर्तमान बाढ़ जोखिम ${primary.risk_category} श्रेणी (${primary.flood_risk_score}/100) में है। पिछले 24 घंटों में ${primary.rainfall_mm_24h} मिमी वर्षा दर्ज की गई है। निचले इलाकों और नालों के पास रहने वाले लोग सतर्क रहें।`;

      evidenceUsed = [
        `Rainfall: ${primary.rainfall_mm_24h} mm (${primary.rainfall_data_mode || 'SIMULATED'})`,
        `Citizen Reports: ${primary.citizen_reports_count} verified (${primary.citizen_reports_high_severity} high/critical)`,
        `Terrain & Basin: ${primary.terrain_type} / ${primary.river_basin}`,
        `Mathematical Weights: Rainfall 35%, History 25%, Terrain 15%, Citizen 15%, Drainage 10%`,
      ];
    } else {
      directAnswer = isTe
        ? `నమస్కారం! నీర్‌దృష్టి (NeerDrishti) తెలంగాణలోని 33 జిల్లాల వరద ముప్పు, సూచనలు మరియు రక్షణ సలహాలను అందిస్తుంది.`
        : isHi
        ? `नमस्ते! नीरदृष्टि (NeerDrishti) 5-कारक गणितीय जोखिम मॉडल, पूर्वानुमान और नागरिक रिपोर्टों के माध्यम से तेलंगाना के 33 जिलों में वास्तविक बाढ़ जोखिम विश्लेषण प्रदान करता है।`
        : `NeerDrishti provides grounded flood intelligence across all 33 Telangana districts using a 5-factor mathematical risk model, predictive forecasts, and crowdsourced citizen alerts.`;
      currentSituation = `Statewide monitoring active across 5 Priority Flood Monitoring, 15 Standard Monitoring, and 13 Limited Data districts.`;
      mainFactors = [
        'Deterministic 5-Factor Risk Formula: Rainfall (35%), Flood History (25%), Terrain (15%), Citizen Reports (15%), Drainage (10%)',
        'Predictive Forecast Horizons: NOW, +3H, +6H, +12H, +24H',
        'Multi-Signal Alert Engine: Combines risk scores, forecast deltas, basin propagation, and citizen surges',
      ];
      teluguSummary = `తెలంగాణలోని 33 జిల్లాల వరద వివరాలు, వర్షపాతం మరియు రక్షణ సూచనల కొరకు జిల్లా పేరును అడగండి.`;
      hindiSummary = `तेलंगाना के सभी 33 जिलों के बाढ़ जोखिम स्कोर, पूर्वानुमान और सुरक्षा सलाह के लिए किसी भी जिले का नाम पूछें।`;
      evidenceUsed = ['NeerDrishti System Specification'];
    }

    const limitationText = evidence.dataProvenance.isSimulated
      ? (isHi ? 'सिमुलेशन डेटा प्रयुक्त: नीरदृष्टि गणितीय मॉडल पर आधारित प्रोटोटाइप परामर्श। आपातकालीन संचालन के लिए TGSDMA और GHMC के आधिकारिक निर्देशों का पालन करें।' : isTe ? 'సిమ్యులేషన్ డేటా ఆధారితం: నీర్‌దృష్టి నమూనా ఆధారంగా తయారు చేయబడింది. అత్యవసర సహాయం కొరకు TGSDMA సూచనలను పాటించండి.' : 'SIMULATION DATA USED: Prototype advisory based on NeerDrishti deterministic risk engine and sample telemetry. For emergency operations, follow official orders issued by TGSDMA & GHMC.')
      : (isHi ? 'यह एक अकादमिक निर्णय-सहायता प्रोटोटाइप है। आपातकालीन स्थिति में राज्य आपदा प्रबंधन प्राधिकरण के आधिकारिक दिशानिर्देशों का पालन करें।' : 'Prototype decision-support intelligence. Follow official State Disaster Management Authority guidelines.');

    const json = {
      directAnswer,
      currentSituation,
      forecastSection,
      mainFactors,
      alertSection,
      recommendedPrecautions,
      dataMode: evidence.dataProvenance.dataMode,
      confidence: evidence.dataProvenance.dataConfidence,
      limitations: limitationText,
      teluguSummary,
      hindiSummary,
      evidenceUsed,
    };

    const composite = this.formatCompositeAnswer(json, evidence);

    return {
      answer: composite,
      directAnswer,
      currentSituation,
      forecastSection,
      mainFactors,
      alertSection,
      recommendedPrecautions,
      dataMode: evidence.dataProvenance.dataMode,
      confidence: evidence.dataProvenance.dataConfidence,
      limitations: limitationText,
      teluguSummary,
      hindiSummary,
      evidenceUsed,
      transparencyBadges: [
        ...(evidence.transparencyBadges || []),
        '⚡ Deterministic Fallback Engine (Llama Standby)',
      ],
      intent: evidence.intent,
      districtsInvolved: [
        ...(primary ? [primary.district] : []),
        ...(secondary ? [secondary.district] : []),
      ],
      isSimulated: evidence.dataProvenance.isSimulated,
      isPrototype: evidence.dataProvenance.isPrototype,
      source: 'Deterministic Fallback',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Formats structured sections into a clean, markdown-rendered response.
   */
  private formatCompositeAnswer(json: any, evidence: EvidencePackage): string {
    const isTe = evidence.language === 'te';
    const isHi = evidence.language === 'hi';
    const lines: string[] = [];

    // 1. Direct Answer
    if (json.directAnswer) {
      lines.push(`### 🌊 ${json.directAnswer}`);
      lines.push('');
    }

    // 2. Current Situation
    if (json.currentSituation) {
      lines.push(`#### 📊 ${isHi ? 'वर्तमान स्थिति (Current Situation)' : isTe ? 'ప్రస్తుత పరిస్థితి (Current Situation)' : 'Current Situation'}`);
      lines.push(json.currentSituation);
      lines.push('');
    }

    // 3. Forecast Section (if available)
    if (json.forecastSection) {
      lines.push(`#### ⏱️ ${isHi ? 'पूर्वानुमान दृष्टिकोण (Forecast Outlook)' : isTe ? 'భవిష్యత్ అంచనాలు (Forecast Outlook)' : 'Forecast Outlook'}`);
      lines.push(json.forecastSection);
      lines.push('');
    }

    // 4. Contributing Factors
    if (json.mainFactors && json.mainFactors.length > 0) {
      lines.push(`#### 🔍 ${isHi ? 'प्रमुख कारक एवं आंकड़े (Key Contributing Factors)' : isTe ? 'ముఖ్య కారణాలు & గణాంకాలు (Key Contributing Factors)' : 'Key Contributing Factors'}`);
      for (const factor of json.mainFactors) {
        lines.push(`* ${factor}`);
      }
      lines.push('');
    }

    // 5. Alert Status (if available)
    if (json.alertSection) {
      lines.push(`#### 🚨 ${isHi ? 'चेतावनी विवरण (Alert Intelligence)' : isTe ? 'అలర్ట్ వివరాలు (Alert Intelligence)' : 'Alert Intelligence'}`);
      lines.push(json.alertSection);
      lines.push('');
    }

    // 6. Recommended Precautions
    if (json.recommendedPrecautions && json.recommendedPrecautions.length > 0) {
      lines.push(`#### 🛡️ ${isHi ? 'सार्वजनिक सुरक्षा सावधानियां (Public Safety Precautions)' : isTe ? 'ప్రజా రక్షణ సూచనలు (Public Safety Precautions)' : 'Public Safety Precautions'}`);
      for (const p of json.recommendedPrecautions) {
        lines.push(`* ${p}`);
      }
      lines.push('');
    }

    // 7. Telugu Summary
    if (json.teluguSummary && isTe) {
      lines.push(`#### 🇮🇳 తెలుగు సమాచారం (Telugu Safety Summary)`);
      lines.push(`> **${json.teluguSummary}**`);
      lines.push('');
    }

    // 8. Hindi Summary
    if (json.hindiSummary && isHi) {
      lines.push(`#### 🇮🇳 हिन्दी सारांश (Hindi Safety Summary)`);
      lines.push(`> **${json.hindiSummary}**`);
      lines.push('');
    }

    // If English or neither specifically requested, display regional summary if provided
    if (!isTe && !isHi) {
      if (json.hindiSummary) {
        lines.push(`#### 🇮🇳 हिन्दी सारांश (Hindi Safety Summary)`);
        lines.push(`> **${json.hindiSummary}**`);
        lines.push('');
      }
      if (json.teluguSummary) {
        lines.push(`#### 🇮🇳 తెలుగు సమాచారం (Telugu Safety Summary)`);
        lines.push(`> **${json.teluguSummary}**`);
        lines.push('');
      }
    }

    // 9. Data Provenance & Limitations (Based On)
    lines.push(`---`);
    lines.push(`##### 📋 Based On & Data Provenance:`);
    lines.push(`* **Data Mode:** \`${json.dataMode || evidence.dataProvenance.dataMode}\` | **Confidence:** \`${json.confidence || evidence.dataProvenance.dataConfidence}\``);
    if (evidence.dataProvenance.isSimulated) {
      lines.push(`* **Notice:** ⚡ \`SIMULATION DATA USED\` — Prototype advisory based on NeerDrishti mathematical risk model.`);
    }
    if (evidence.dataProvenance.isPrototype) {
      lines.push(`* **Notice:** ⚡ \`PROTOTYPE BASELINE\` — Baseline estimation for limited data district.`);
    }
    if (json.limitations) {
      lines.push(`* *${json.limitations}*`);
    }

    return lines.join('\n');
  }
}

export const aiIntelligenceService = new AIIntelligenceService();
