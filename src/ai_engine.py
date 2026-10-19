"""
NeerDrishti Modular AI Reasoning Engine
Provides LLM-driven cross-source synthesis, RAG retrieval from district knowledge files,
and bilingual (English & Telugu) public advisory generation.
Supports Meta Llama via OpenAI-compatible endpoints (e.g. Ollama, vLLM, Groq), and deterministic heuristic fallbacks.
"""

import os
import json
import urllib.request
import urllib.error
from pathlib import Path
from typing import Dict, Any, Optional

from src.config import (
    KB_DIR,
    LLM_PROVIDER,
    OPENAI_COMPATIBLE_BASE_URL,
    OPENAI_COMPATIBLE_API_KEY,
    OPENAI_COMPATIBLE_MODEL,
)


def load_knowledge_base_doc(district_name: str) -> str:
    """Retrieves curated district hydrological context from markdown knowledge base."""
    filename = f"{district_name.lower().replace(' ', '_')}.md"
    file_path = KB_DIR / filename
    if file_path.exists():
        try:
            return file_path.read_text(encoding="utf-8")
        except Exception:
            return f"Context file for {district_name} exists but could not be read."
    return f"No specialized knowledge document found for {district_name}."


class AIEngine:
    """Unified LLM Reasoning & Advisory Generator."""

    def __init__(self):
        self.provider = os.getenv("LLM_PROVIDER", LLM_PROVIDER).lower()
        self.openai_base = os.getenv("OPENAI_COMPATIBLE_BASE_URL", OPENAI_COMPATIBLE_BASE_URL)
        self.openai_key = os.getenv("OPENAI_COMPATIBLE_API_KEY", OPENAI_COMPATIBLE_API_KEY)
        self.openai_model = os.getenv("OPENAI_COMPATIBLE_MODEL", OPENAI_COMPATIBLE_MODEL)

    def generate_district_reasoning(self, district_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Executes structured reasoning over normalized signals, citizen reports, and KB context.
        """
        district_name = district_data.get("district", "Unknown")
        kb_context = load_knowledge_base_doc(district_name)

        prompt = f"""
You are the NeerDrishti AI Flood Intelligence Engine for Telangana powered by Meta Llama.
You must synthesize the provided structured telemetry, rule-based mathematical score, citizen reports, and district hydrological context to generate an explainable, authoritative flood intelligence advisory.

CRITICAL INSTRUCTIONS:
1. Use ONLY the supplied data and retrieved knowledge base context.
2. If data is missing or marked unknown, state that it is unavailable.
3. This is an academic research & prototype intelligence system; clearly state the assessment is advisory and not a substitute for official IMD / GHMC / SDMA emergency orders.
4. Provide the public advisory in both ENGLISH and TELUGU (తెలుగు).
5. Output ONLY valid JSON adhering strictly to the JSON schema below.

INPUT STRUCTURED TELEMETRY:
- District: {district_name}
- Calculated Flood Risk Score: {district_data.get('flood_risk_score')} / 100 ({district_data.get('risk_category')})
- 24h Rainfall: {district_data.get('rainfall_mm_24h')} mm (Score: {district_data.get('rainfall_score')}/100)
- 3h Short-Burst Rainfall: {district_data.get('rainfall_mm_3h')} mm
- Flood History Inundation Score: {district_data.get('flood_history_score')}/100
- Location / Topography Risk Score: {district_data.get('location_risk_score')}/100 ({district_data.get('terrain_type')})
- Drainage Vulnerability Score: {district_data.get('drainage_vulnerability_score')}/100
- Verified Citizen Reports Count: {district_data.get('citizen_reports_count')} ({district_data.get('citizen_reports_high_severity')} severe)
- River Basin / Waterbody Context: {district_data.get('river_basin')}
- Drainage Hotspots: {district_data.get('vulnerable_hotspots')}

RETRIEVED HYDROLOGICAL KNOWLEDGE BASE:
{kb_context}

REQUIRED JSON OUTPUT FORMAT:
{{
  "situation_summary": "2-3 concise sentences summarizing current flood risk status.",
  "main_risk_factors": ["Factor 1", "Factor 2", "Factor 3"],
  "explanation_of_risk": "Detailed explanation of why the calculated score is at this level based on mathematical weights and topography.",
  "recommended_actions": ["Action 1 for public", "Action 2 for municipal teams", "Action 3 for commuters"],
  "english_advisory": "Clean, clear public safety advisory text in English.",
  "telugu_advisory": "తెలుగులో ప్రజా రక్షణ మరియు హెచ్చరిక సమాచారం (Clear Telugu advisory).",
  "evidence_used": ["Evidence point 1", "Evidence point 2", "Evidence point 3"],
  "data_limitation_statement": "Prototype simulation advisory based on NeerDrishti risk engine weights and sample sensor telemetry. Follow State Disaster Management Authority guidelines."
}}
"""

        # Try API inference based on configured OpenAI-compatible provider (Meta Llama)
        if self.openai_key and self.openai_base:
            response = self._call_openai_compatible(prompt)
            if response and isinstance(response, dict):
                response["reasoning_source"] = "Meta Llama"
                response["model_provider"] = "Meta Llama"
                response["model_name"] = self.openai_model
                response["fallback_used"] = False
                return response

        # Graceful fallback: Deterministic rule-based template
        return self._generate_fallback_reasoning(district_data, kb_context)

    def _call_openai_compatible(self, prompt: str) -> Optional[Dict[str, Any]]:
        """Invokes open-weight Meta Llama API (e.g. Ollama, vLLM, Groq)."""
        try:
            endpoint = f"{self.openai_base.rstrip('/')}/chat/completions"
            payload = {
                "model": self.openai_model,
                "messages": [
                    {"role": "system", "content": "You are a flood risk reasoning AI. Respond in valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.2,
                "response_format": {"type": "json_object"}
            }
            req = urllib.request.Request(
                endpoint,
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {self.openai_key}",
                    "Content-Type": "application/json",
                    "User-Agent": "NeerDrishti-Llama-Python/1.0"
                },
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=15) as res:
                if res.status == 200:
                    raw_data = json.loads(res.read().decode("utf-8"))
                    raw_json = raw_data["choices"][0]["message"]["content"]
                    cleaned = raw_json.strip()
                    if cleaned.startswith("```json"):
                        cleaned = cleaned[7:]
                    if cleaned.startswith("```"):
                        cleaned = cleaned[3:]
                    if cleaned.endswith("```"):
                        cleaned = cleaned[:-3]
                    return json.loads(cleaned.strip())
        except Exception:
            pass
        return None

    def _generate_fallback_reasoning(self, data: Dict[str, Any], kb: str) -> Dict[str, Any]:
        """Provides rich deterministic fallback reasoning when remote LLM APIs are unreachable."""
        district = data.get("district", "Telangana District")
        score = data.get("flood_risk_score", 45)
        category = data.get("risk_category", "MODERATE")
        rainfall = data.get("rainfall_mm_24h", 40.0)
        reports = data.get("citizen_reports_count", 0)

        # Pre-calculated multilingual messages
        telugu_advisories = {
            "LOW": f"{district} జిల్లాలో వరద ముప్పు సాధారణ స్థాయిలో ఉంది. ప్రజలు నిర్భయంగా ఉండవచ్చు. వర్షపాతంపై అప్రమత్తంగా ఉండండి.",
            "MODERATE": f"{district} ప్రాంతంలో మోస్తరు వర్షపాతం మరియు మురుగునీటి నిల్వ గుర్తించబడింది. లోతట్టు ప్రాంతాల ప్రజలు అప్రమత్తంగా ఉండాలి.",
            "HIGH": f"{district} జిల్లాకు తీవ్ర వరద హెచ్చరిక. నాలాలు మరియు వాగుల సమీపంలో ప్రయాణాలు మానుకోండి. అత్యవసర హెల్ప్‌లైన్ నంబర్లను అందుబాటులో ఉంచుకోండి.",
            "CRITICAL": f"{district} లో అత్యవసర వరద పరిస్థితి! వెంటనే సురక్షిత ప్రాంతాలకు తరలివెళ్లండి. డిజాస్టర్ రెస్పాన్స్ ఫోర్స్ ఆదేశాలను పాటించండి.",
        }

        return {
            "situation_summary": f"{district} is presently categorized at {category} risk with a composite score of {score}/100. Recorded 24-hour precipitation stands at {rainfall} mm with {reports} active citizen reports.",
            "main_risk_factors": [
                f"24h Precipitation telemetry: {rainfall} mm (Normalized score: {data.get('rainfall_score')})",
                f"Topographical and drainage vulnerability: {data.get('drainage_vulnerability_score')}/100 in {data.get('terrain_type')}",
                f"Historical inundation susceptibility: {data.get('flood_history_score')}/100",
                f"Field citizen crowd-sourced signals: {reports} local reports",
            ],
            "explanation_of_risk": f"The calculated score of {score}/100 reflects heavy weightings on recent rainfall (35%) and historical flood patterns (25%). Combined with localized drainage bottlenecks in {data.get('vulnerable_hotspots', 'key zones')}, runoff accumulation is elevated.",
            "recommended_actions": [
                "Avoid crossing submerged low-lying causeways and underpasses.",
                "Ensure household emergency provisions and charge communication devices.",
                "Municipal drainage clearing teams dispatched to priority chokepoints.",
            ],
            "english_advisory": f"Advisory for {district}: {category} flood risk level active ({score}/100). Exercise caution near open drains and local river basins ({data.get('river_basin')}).",
            "telugu_advisory": telugu_advisories.get(category, f"{district} వరద ముప్పు సమాచారం."),
            "evidence_used": [
                f"Telemetry: {rainfall} mm rainfall recorded",
                f"Basin context: {data.get('river_basin')}",
                f"Citizen reports: {reports} verified field submissions",
            ],
            "reasoning_source": "Deterministic Fallback",
            "model_provider": "Deterministic Risk Engine",
            "model_name": "Rule-Based Fallback",
            "fallback_used": True,
            "data_limitation_statement": "Deterministic flood risk engine fallback (Meta Llama offline/standby). Advisory based on NeerDrishti mathematical risk engine weights and sensor telemetry. Follow State Disaster Management Authority guidelines."
        }
