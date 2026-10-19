/**
 * NeerDrishti Centralized Alert Intelligence Configuration & Thresholds
 * Part 3: Standardized Risk, Forecast, Basin, and Citizen Thresholds
 */

export const ALERT_CONFIG = {
  // Current Deterministic Flood Risk Thresholds (0-100)
  CURRENT_RISK: {
    CRITICAL: 75.0,
    HIGH: 50.0,
    ELEVATED: 35.0,
    WATCH: 25.0,
  },

  // Forecast Peak Risk Thresholds (0-100)
  PROJECTED_PEAK_RISK: {
    CRITICAL: 75.0,
    HIGH: 55.0,
    ELEVATED: 40.0,
    WATCH: 28.0,
  },

  // Forecast Rate of Increase / Deltas
  RATE_OF_INCREASE: {
    RAPID_DELTA_THRESHOLD: 16.0,    // Projected Peak - Current >= 16 pts
    MODERATE_DELTA_THRESHOLD: 8.0,  // Projected Peak - Current >= 8 pts
    RAPID_6H_THRESHOLD: 12.0,       // +6H - Current >= 12 pts with Rising Trend
  },

  // Citizen Report Escalation Signals
  CITIZEN_ESCALATION: {
    CRITICAL_REPORT_MIN: 1,         // Any verified critical report triggers high priority review
    HIGH_SEVERITY_MIN: 2,           // 2 or more high-severity reports triggers alert escalation
    RAPID_SURGE_HOURLY_RATE: 3,     // Rapid increase in reports per window
    SCORE_IMPACT_HIGH: 10.0,        // Citizen score >= 10 pts
  },

  // Basin River Surge Propagation Signals
  BASIN_PROPAGATION: {
    SIGNIFICANT_SURGE_PTS: 5.0,     // Basin propagation surge score >= 5.0 pts
    STRONG_SURGE_PTS: 9.0,          // Basin propagation surge score >= 9.0 pts
    UPSTREAM_HIGH_RISK_PTS: 65.0,   // Upstream district risk score >= 65.0 pts
  },

  // Data Uncertainty & Quality Thresholds
  DATA_QUALITY: {
    LOW_CONFIDENCE_THRESHOLD: 0.55,
    LIMITED_DATA_SCORE_THRESHOLD: 40.0,
  },

  // Default Standard Disclaimers
  DISCLAIMERS: {
    AUTHORITY_NOTICE_EN: 'Follow instructions and evacuation directives from official Telangana State Disaster Management Authority (TGSDMA) and District Collectorates during emergencies.',
    AUTHORITY_NOTICE_TE: 'అత్యవసర సమయాల్లో తెలంగాణ రాష్ట్ర విపత్తు నిర్వహణ సంస్థ (TGSDMA) మరియు స్థానిక జిల్లా కలెక్టరేట్ అధికారిక సూచనలను పాటించండి.',
    AUTHORITY_NOTICE_HI: 'आपात स्थिति के दौरान आधिकारिक तेलंगाना राज्य आपदा प्रबंधन प्राधिकरण (TGSDMA) और जिला कलेक्ट्रेट के निर्देशों का पालन करें।',
    PROTOTYPE_SIMULATION_NOTICE_EN: 'NeerDrishti alert intelligence is synthesized from deterministic hydro-meteorological models, citizen hazard reports, and forecast algorithms for prototype scenario testing.',
    PROTOTYPE_SIMULATION_NOTICE_TE: 'ఈ హెచ్చరిక సమాచారం నీర్ దృష్టి హైడ్రో-వాతావరణ నమూనాలు మరియు పౌరుల నివేదికల ఆధారంగా రూపొందించబడిన ప్రోటోటైప్ సిమ్యులేషన్ అంచనా.',
    PROTOTYPE_SIMULATION_NOTICE_HI: 'नीर्दृष्टि चेतावनी बुद्धिमत्ता प्रोटोटाइप परिदृश्य परीक्षण के लिए हाइड्रो-मौसम विज्ञान मॉडल, नागरिक रिपोर्ट और पूर्वानुमान एल्गोरिदम से संश्लेषित है।',
  }
};
